// Package repository — implémentation AIProviderRepository avec pgx + RLS.
//
// Extrait toutes les requêtes SQL des handlers HTTP pour la gestion des
// AI providers (AI-PROVIDERS-1). Chaque méthode accepte ctx + claims pour
// passer par appdb.WithTx (RLS-aware transactions).
package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
)

// ──────────────────────────────────────────────────────────────────────────
// Domain types
// ──────────────────────────────────────────────────────────────────────────

// AIProvider represents a full AIProviderConfig row from the database.
type AIProvider struct {
	ID          string
	Name        string
	Provider    string
	BaseURL     *string
	APIKey      *string
	Model       *string
	Temperature float64
	MaxTokens   int
	IsActive    bool
	Priority    int
	ExtraConfig *string
	Capability  *string
	LastTestAt  *time.Time
	LastTestOk  *bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// AIProviderCredentials holds the data needed for connection testing.
type AIProviderCredentials struct {
	ID          string
	Name        string
	Provider    string
	BaseURL     string
	APIKey      string
	Model       string
	ExtraConfig string
}

// FailoverEvent represents an AIFailoverEvent row.
type FailoverEvent struct {
	ID           string
	EventType    string
	FromProvider *string
	ToProvider   *string
	Reason       string
	ErrorDetails *string
	Resolved     bool
	CreatedAt    time.Time
}

// ProviderHealth represents a provider's health status.
type ProviderHealth struct {
	ID      string
	Name    string
	Healthy bool // derived: lastTestOk != nil && *lastTestOk
}

// FailoverStatusData holds all data for the failover status endpoint.
type FailoverStatusData struct {
	Providers      []ProviderWithHealth
	RecentEvents   []FailoverEvent
	TotalFailovers int
	Last24hEvents  int
}

// ProviderWithHealth is a provider row with computed health info.
type ProviderWithHealth struct {
	ID         string
	Name       string
	Provider   string
	Model      *string
	IsActive   bool
	Priority   int
	LastTestAt *time.Time
	LastTestOk *bool
	Status     string // HEALTHY, DEGRADED, UNKNOWN, COOLING_DOWN
}

// AIProviderUpdateFields holds optional fields for a partial UPDATE (PATCH semantics).
// Only non-nil fields will be included in the SET clause.
type AIProviderUpdateFields struct {
	Name        *string
	Provider    *string
	BaseURL     *string
	APIKey      *string // only updated if non-nil AND non-empty
	Model       *string
	Temperature *float64
	MaxTokens   *int
	ExtraConfig *string // already normalized (nil = no change, empty ptr = set NULL)
	Capability  *string
}

// PriorityItem is a single {id, priority} pair for batch priority updates.
type PriorityItem struct {
	ID       string
	Priority int
}

// ──────────────────────────────────────────────────────────────────────────
// Column helpers
// ──────────────────────────────────────────────────────────────────────────

// providerColumnsWithKey is the list of columns returned when reading a full
// AIProviderConfig row (including apiKey). Must match the scanProvider order.
// COALESCE("capability", 'chat') ensures non-NULL for DASHSCOPE-AUDIO-1 retro-compat.
const providerColumnsWithKey = `"id", "name", "provider", "baseUrl", "apiKey", "model",
	"temperature", "maxTokens", "isActive", "priority",
	"extraConfig", COALESCE("capability", 'chat') AS "capability",
	"lastTestAt", "lastTestOk", "createdAt", "updatedAt"`

// scanAIProvider scans a full AIProviderConfig row into an AIProvider struct.
func scanAIProvider(row pgx.Row) (AIProvider, error) {
	var p AIProvider
	if err := row.Scan(
		&p.ID, &p.Name, &p.Provider, &p.BaseURL, &p.APIKey, &p.Model,
		&p.Temperature, &p.MaxTokens, &p.IsActive, &p.Priority,
		&p.ExtraConfig, &p.Capability, &p.LastTestAt, &p.LastTestOk,
		&p.CreatedAt, &p.UpdatedAt,
	); err != nil {
		return p, err
	}
	return p, nil
}

// ──────────────────────────────────────────────────────────────────────────
// Repository
// ──────────────────────────────────────────────────────────────────────────

// AIProviderRepository implements data access for AIProviderConfig and related
// tables using pgx with RLS-aware transactions.
type AIProviderRepository struct {
	pool *pgxpool.Pool
}

// NewAIProviderRepository creates a new AIProviderRepository.
func NewAIProviderRepository(pool *pgxpool.Pool) *AIProviderRepository {
	return &AIProviderRepository{pool: pool}
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Create — INSERT a new AIProviderConfig, return the created row.
// ──────────────────────────────────────────────────────────────────────────

// Create inserts a new AI provider and returns the full row.
// Priority is set to MAX(priority)+1 so the new provider comes last.
// isActive is always set to false on creation.
func (r *AIProviderRepository) Create(
	ctx context.Context,
	claims db.SessionClaims,
	id string,
	name string,
	provider string,
	baseURL *string,
	apiKey *string,
	model *string,
	temperature float64,
	maxTokens int,
	extraConfig *string,
	capability *string,
) (AIProvider, error) {
	var result AIProvider
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		// Compute priority = max+1 so new provider is last.
		var maxPriority int
		_ = tx.QueryRow(ctx,
			`SELECT COALESCE(MAX("priority"), 0) FROM "AIProviderConfig"`,
		).Scan(&maxPriority)
		priority := maxPriority + 1

		row := tx.QueryRow(ctx, `
			INSERT INTO "AIProviderConfig"
				("id", "name", "provider", "baseUrl", "apiKey", "model",
				 "temperature", "maxTokens", "isActive", "priority",
				 "extraConfig", "capability", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, NOW(), NOW())
			RETURNING `+providerColumnsWithKey,
			id, name, provider,
			baseURL, apiKey, model,
			temperature, maxTokens, priority, extraConfig, capability,
		)
		p, err := scanAIProvider(row)
		if err != nil {
			return err
		}
		result = p
		return nil
	})
	if err != nil {
		return AIProvider{}, fmt.Errorf("create AI provider: %w", err)
	}
	return result, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GetByID — SELECT a provider by ID (with apiKey).
// ──────────────────────────────────────────────────────────────────────────

// GetByID returns a single AI provider by ID, including the apiKey field.
func (r *AIProviderRepository) GetByID(
	ctx context.Context,
	claims db.SessionClaims,
	id string,
) (AIProvider, error) {
	var result AIProvider
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			SELECT `+providerColumnsWithKey+`
			FROM "AIProviderConfig" WHERE "id" = $1`, id)
		p, err := scanAIProvider(row)
		if err != nil {
			return err
		}
		result = p
		return nil
	})
	if err != nil {
		return AIProvider{}, fmt.Errorf("get AI provider by ID: %w", err)
	}
	return result, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 3. List — SELECT all providers ordered by priority.
// ──────────────────────────────────────────────────────────────────────────

// List returns all AI providers ordered by priority ascending.
// Includes apiKey; the handler should strip it if needed.
func (r *AIProviderRepository) List(
	ctx context.Context,
	claims db.SessionClaims,
) ([]AIProvider, error) {
	var providers []AIProvider
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT `+providerColumnsWithKey+`
			FROM "AIProviderConfig" ORDER BY "priority" ASC`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			p, err := scanAIProviderRow(rows)
			if err != nil {
				return err
			}
			providers = append(providers, p)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("list AI providers: %w", err)
	}
	return providers, nil
}

// scanAIProviderRow scans a full AIProviderConfig row from pgx.Rows.
func scanAIProviderRow(rows pgx.Rows) (AIProvider, error) {
	var p AIProvider
	if err := rows.Scan(
		&p.ID, &p.Name, &p.Provider, &p.BaseURL, &p.APIKey, &p.Model,
		&p.Temperature, &p.MaxTokens, &p.IsActive, &p.Priority,
		&p.ExtraConfig, &p.Capability, &p.LastTestAt, &p.LastTestOk,
		&p.CreatedAt, &p.UpdatedAt,
	); err != nil {
		return p, err
	}
	return p, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Update — Dynamic UPDATE based on provided fields (PATCH semantics).
// ──────────────────────────────────────────────────────────────────────────

// Update performs a partial update of an AI provider. Only non-nil fields in
// the update struct are included in the SET clause. apiKey is only updated if
// non-nil AND non-empty (to avoid accidentally clearing it).
// Returns the updated row.
func (r *AIProviderRepository) Update(
	ctx context.Context,
	claims db.SessionClaims,
	id string,
	fields AIProviderUpdateFields,
) (AIProvider, error) {
	// Build dynamic SET clause.
	setParts := []string{`"updatedAt" = NOW()`}
	args := []any{}
	argIdx := 1

	addStr := func(col string, v *string) {
		if v != nil {
			setParts = append(setParts, fmt.Sprintf(`%s = $%d`, col, argIdx))
			args = append(args, *v)
			argIdx++
		}
	}

	addStr(`"name"`, fields.Name)
	addStr(`"provider"`, fields.Provider)
	addStr(`"baseUrl"`, fields.BaseURL)
	// apiKey: only update if provided AND non-empty.
	if fields.APIKey != nil && strings.TrimSpace(*fields.APIKey) != "" {
		setParts = append(setParts, fmt.Sprintf(`"apiKey" = $%d`, argIdx))
		args = append(args, *fields.APIKey)
		argIdx++
	}
	addStr(`"model"`, fields.Model)
	addStr(`"capability"`, fields.Capability)
	if fields.Temperature != nil {
		setParts = append(setParts, fmt.Sprintf(`"temperature" = $%d`, argIdx))
		args = append(args, *fields.Temperature)
		argIdx++
	}
	if fields.MaxTokens != nil {
		setParts = append(setParts, fmt.Sprintf(`"maxTokens" = $%d`, argIdx))
		args = append(args, *fields.MaxTokens)
		argIdx++
	}
	if fields.ExtraConfig != nil {
		setParts = append(setParts, fmt.Sprintf(`"extraConfig" = $%d`, argIdx))
		args = append(args, *fields.ExtraConfig)
		argIdx++
	}

	args = append(args, id)
	query := fmt.Sprintf(
		`UPDATE "AIProviderConfig" SET %s WHERE "id" = $%d RETURNING `+providerColumnsWithKey,
		strings.Join(setParts, ", "), argIdx,
	)

	var result AIProvider
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, query, args...)
		p, err := scanAIProvider(row)
		if err != nil {
			return err
		}
		result = p
		return nil
	})
	if err != nil {
		return AIProvider{}, fmt.Errorf("update AI provider: %w", err)
	}
	return result, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Delete — DELETE by ID.
// ──────────────────────────────────────────────────────────────────────────

// Delete removes an AI provider by ID. Returns pgx.ErrNoRows if not found.
func (r *AIProviderRepository) Delete(
	ctx context.Context,
	claims db.SessionClaims,
	id string,
) error {
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx,
			`DELETE FROM "AIProviderConfig" WHERE "id" = $1`, id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("delete AI provider: %w", err)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────
// 6. GetIsActive — Check if a provider is active (for delete guard).
// ──────────────────────────────────────────────────────────────────────────

// GetIsActive returns the isActive flag for the given provider ID.
// Returns pgx.ErrNoRows if the provider is not found.
func (r *AIProviderRepository) GetIsActive(
	ctx context.Context,
	claims db.SessionClaims,
	id string,
) (bool, error) {
	var isActive bool
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT "isActive" FROM "AIProviderConfig" WHERE "id" = $1`, id,
		).Scan(&isActive)
	})
	if err != nil {
		return false, fmt.Errorf("get AI provider isActive: %w", err)
	}
	return isActive, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Activate — Toggle/set isActive for a provider.
// ──────────────────────────────────────────────────────────────────────────

// ActivateResult holds the result of an activate operation.
type ActivateResult struct {
	Name     string
	NewState bool
}

// Activate sets or toggles the isActive flag for a provider.
// If active is nil, it toggles the current state; otherwise it forces the
// given state. Returns the provider name and new state.
func (r *AIProviderRepository) Activate(
	ctx context.Context,
	claims db.SessionClaims,
	providerID string,
	active *bool,
) (ActivateResult, error) {
	var result ActivateResult
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		// 1. Read current state.
		var currentActive bool
		if err := tx.QueryRow(ctx,
			`SELECT "isActive" FROM "AIProviderConfig" WHERE "id" = $1`,
			providerID,
		).Scan(&currentActive); err != nil {
			return err
		}

		// 2. Determine new state.
		newState := !currentActive // toggle by default
		if active != nil {
			newState = *active
		}

		// 3. Apply the change.
		var name string
		err := tx.QueryRow(ctx,
			`UPDATE "AIProviderConfig" SET "isActive" = $1, "updatedAt" = NOW()
			 WHERE "id" = $2 RETURNING "name"`, newState, providerID,
		).Scan(&name)
		if err != nil {
			return err
		}

		result = ActivateResult{Name: name, NewState: newState}
		return nil
	})
	if err != nil {
		return ActivateResult{}, fmt.Errorf("activate AI provider: %w", err)
	}
	return result, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 8. UpdateTestResult — UPDATE lastTestAt, lastTestOk.
// ──────────────────────────────────────────────────────────────────────────

// UpdateTestResult records the result of a connection test for a provider.
func (r *AIProviderRepository) UpdateTestResult(
	ctx context.Context,
	claims db.SessionClaims,
	id string,
	ok bool,
) error {
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`UPDATE "AIProviderConfig" SET "lastTestAt" = NOW(), "lastTestOk" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
			id, ok)
		return err
	})
	if err != nil {
		return fmt.Errorf("update AI provider test result: %w", err)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────
// 9. GetProviderCredentials — SELECT id, name, provider, baseUrl, apiKey,
//    model, extraConfig for test endpoint.
// ──────────────────────────────────────────────────────────────────────────

// GetProviderCredentials returns the credentials needed to test a provider's
// connection. NULL columns are COALESCE'd to empty strings.
func (r *AIProviderRepository) GetProviderCredentials(
	ctx context.Context,
	claims db.SessionClaims,
	id string,
) (AIProviderCredentials, error) {
	var creds AIProviderCredentials
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			SELECT "id", "name", "provider", COALESCE("baseUrl", ''), COALESCE("apiKey", ''), COALESCE("model", ''), COALESCE("extraConfig", '')
			FROM "AIProviderConfig" WHERE "id" = $1`, id)
		return row.Scan(&creds.ID, &creds.Name, &creds.Provider,
			&creds.BaseURL, &creds.APIKey, &creds.Model, &creds.ExtraConfig)
	})
	if err != nil {
		return AIProviderCredentials{}, fmt.Errorf("get AI provider credentials: %w", err)
	}
	return creds, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 10. GetProviderModelsCreds — SELECT provider, baseUrl, apiKey for models endpoint.
// ──────────────────────────────────────────────────────────────────────────

// ProviderModelsCreds holds the minimal data needed to fetch a provider's
// model list from its remote API.
type ProviderModelsCreds struct {
	Provider string
	BaseURL  string
	APIKey   string
}

// GetProviderModelsCreds returns the provider type, baseUrl and apiKey needed
// to call the remote /models endpoint. NULL columns are COALESCE'd to empty
// strings.
func (r *AIProviderRepository) GetProviderModelsCreds(
	ctx context.Context,
	claims db.SessionClaims,
	providerID string,
) (ProviderModelsCreds, error) {
	var creds ProviderModelsCreds
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			SELECT "provider", COALESCE("baseUrl", ''), COALESCE("apiKey", '')
			FROM "AIProviderConfig" WHERE "id" = $1`, providerID)
		return row.Scan(&creds.Provider, &creds.BaseURL, &creds.APIKey)
	})
	if err != nil {
		return ProviderModelsCreds{}, fmt.Errorf("get AI provider models creds: %w", err)
	}
	return creds, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 11. UpdatePriorities — Batch UPDATE priority for multiple providers.
// ──────────────────────────────────────────────────────────────────────────

// UpdatePriorities updates the priority of each provider in the given list
// within a single transaction.
func (r *AIProviderRepository) UpdatePriorities(
	ctx context.Context,
	claims db.SessionClaims,
	items []PriorityItem,
) error {
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		for _, p := range items {
			if p.ID == "" {
				continue
			}
			if _, err := tx.Exec(ctx,
				`UPDATE "AIProviderConfig" SET "priority" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
				p.ID, p.Priority); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("update AI provider priorities: %w", err)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────
// 12. ResetAllHealth — UPDATE lastTestAt=NULL, lastTestOk=NULL for all.
// ──────────────────────────────────────────────────────────────────────────

// ResetAllHealth clears lastTestAt and lastTestOk for all providers.
func (r *AIProviderRepository) ResetAllHealth(
	ctx context.Context,
	claims db.SessionClaims,
) error {
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`UPDATE "AIProviderConfig" SET "lastTestAt" = NULL, "lastTestOk" = NULL, "updatedAt" = NOW()`)
		return err
	})
	if err != nil {
		return fmt.Errorf("reset all AI provider health: %w", err)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────
// 13. GetHealthStatus — SELECT id, name, lastTestOk for all providers
//     ordered by priority.
// ──────────────────────────────────────────────────────────────────────────

// GetHealthStatus returns a simplified health check for all providers.
// Healthy is derived: lastTestOk != nil && *lastTestOk.
func (r *AIProviderRepository) GetHealthStatus(
	ctx context.Context,
	claims db.SessionClaims,
) ([]ProviderHealth, error) {
	var providers []ProviderHealth
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT "id", "name", "lastTestOk" FROM "AIProviderConfig" ORDER BY "priority" ASC`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id, name string
			var lastTestOk *bool
			if err := rows.Scan(&id, &name, &lastTestOk); err != nil {
				return err
			}
			providers = append(providers, ProviderHealth{
				ID:      id,
				Name:    name,
				Healthy: lastTestOk != nil && *lastTestOk,
			})
		}
		return rows.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("get AI provider health status: %w", err)
	}
	return providers, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 14. GetFailoverConfig — SELECT settings from PlatformSettings.
// ──────────────────────────────────────────────────────────────────────────

// GetFailoverConfig returns the raw JSON settings string from
// PlatformSettings WHERE id='ai_failover_config'. Returns nil if not found.
func (r *AIProviderRepository) GetFailoverConfig(
	ctx context.Context,
	claims db.SessionClaims,
) (*string, error) {
	var cfgJSON *string
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		_ = tx.QueryRow(ctx,
			`SELECT "settings" FROM "PlatformSettings" WHERE "id" = 'ai_failover_config'`,
		).Scan(&cfgJSON)
		return nil // tolerant: missing row is not an error
	})
	if err != nil {
		return nil, fmt.Errorf("get failover config: %w", err)
	}
	return cfgJSON, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 15. SaveFailoverConfig — INSERT/UPSERT settings into PlatformSettings.
// ──────────────────────────────────────────────────────────────────────────

// SaveFailoverConfig upserts the failover config JSON string into
// PlatformSettings with id='ai_failover_config'.
func (r *AIProviderRepository) SaveFailoverConfig(
	ctx context.Context,
	claims db.SessionClaims,
	settingsJSON string,
) error {
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO "PlatformSettings" ("id", "settings", "updatedAt")
			VALUES ('ai_failover_config', $1, NOW())
			ON CONFLICT ("id") DO UPDATE SET "settings" = EXCLUDED."settings", "updatedAt" = NOW()`,
			settingsJSON)
		return err
	})
	if err != nil {
		return fmt.Errorf("save failover config: %w", err)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────
// 16. GetFailoverStatus — Complex query: all providers with health +
//     recent failover events + counts.
// ──────────────────────────────────────────────────────────────────────────

// GetFailoverStatus returns the complete failover status: all providers with
// their health info, recent failover events, and total/24h event counts.
func (r *AIProviderRepository) GetFailoverStatus(
	ctx context.Context,
	claims db.SessionClaims,
) (FailoverStatusData, error) {
	data := FailoverStatusData{}

	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		// 1. List all providers with health info.
		rows, err := tx.Query(ctx, `
			SELECT "id", "name", "provider", "model", "isActive", "priority",
			       "lastTestAt", "lastTestOk"
			FROM "AIProviderConfig" ORDER BY "priority" ASC`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			p := ProviderWithHealth{}
			if err := rows.Scan(&p.ID, &p.Name, &p.Provider, &p.Model,
				&p.IsActive, &p.Priority, &p.LastTestAt, &p.LastTestOk); err != nil {
				return err
			}

			// Determine status.
			healthy := p.LastTestOk != nil && *p.LastTestOk
			coolingDown := false // not implemented yet
			switch {
			case p.LastTestOk == nil:
				p.Status = "UNKNOWN"
			case coolingDown:
				p.Status = "COOLING_DOWN"
			case healthy:
				p.Status = "HEALTHY"
			default:
				p.Status = "DEGRADED"
			}

			data.Providers = append(data.Providers, p)
		}
		if err := rows.Err(); err != nil {
			return err
		}

		// 2. Count total failover events.
		_ = tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM "AIFailoverEvent"`).Scan(&data.TotalFailovers)

		// 3. Count last 24h events.
		_ = tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM "AIFailoverEvent" WHERE "createdAt" >= NOW() - INTERVAL '24 hours'`,
		).Scan(&data.Last24hEvents)

		// 4. Fetch the 20 most recent events.
		evRows, err := tx.Query(ctx, `
			SELECT "id", "eventType", "fromProvider", "toProvider",
			       "reason", "errorDetails", "resolved", "createdAt"
			FROM "AIFailoverEvent"
			ORDER BY "createdAt" DESC
			LIMIT 20`)
		if err != nil {
			return err
		}
		defer evRows.Close()
		for evRows.Next() {
			e := FailoverEvent{}
			if err := evRows.Scan(&e.ID, &e.EventType, &e.FromProvider, &e.ToProvider,
				&e.Reason, &e.ErrorDetails, &e.Resolved, &e.CreatedAt); err != nil {
				return err
			}
			data.RecentEvents = append(data.RecentEvents, e)
		}
		return evRows.Err()
	})
	if err != nil {
		return FailoverStatusData{}, fmt.Errorf("get failover status: %w", err)
	}
	return data, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 17. ListFailoverEvents — SELECT recent AIFailoverEvent rows.
// ──────────────────────────────────────────────────────────────────────────

// ListFailoverEvents returns the most recent AIFailoverEvent rows (up to 20).
func (r *AIProviderRepository) ListFailoverEvents(
	ctx context.Context,
	claims db.SessionClaims,
) ([]FailoverEvent, error) {
	var events []FailoverEvent
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT "id", "eventType", "fromProvider", "toProvider",
			       "reason", "errorDetails", "resolved", "createdAt"
			FROM "AIFailoverEvent"
			ORDER BY "createdAt" DESC
			LIMIT 20`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			e := FailoverEvent{}
			if err := rows.Scan(&e.ID, &e.EventType, &e.FromProvider, &e.ToProvider,
				&e.Reason, &e.ErrorDetails, &e.Resolved, &e.CreatedAt); err != nil {
				return err
			}
			events = append(events, e)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("list failover events: %w", err)
	}
	return events, nil
}
