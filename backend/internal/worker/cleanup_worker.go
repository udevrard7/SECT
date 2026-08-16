package worker

// cleanup_worker.go — Worker périodique de purge des users soft-deleted > 90 jours.
//
// SECT-USER-CLEANUP-INFRA-1 : vérifie toutes les 24h les users dont deletedAt
// est plus ancien que 90 jours, journalise chaque suppression dans AuditLog
// (action=USER_HARD_DELETED_AUTO) AVANT le DELETE (pour traçabilité même si le
// DELETE échoue), puis hard-delete via le repo HardDeleteOrphanUsers qui
// effectue le cascade manuel sur les tables enfants (FK RESTRICT).
//
// Le check est best-effort : si une étape de cascade échoue pour un user, on
// log l'erreur et on continue au user suivant. Les users restants seront
// réessayés au prochain tick (24h plus tard).
//
// Pattern identique à expire_worker.go (struct + NewXxxWorker + Start + ticker
// goroutine + checkAndXxx method + first run on startup).

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
)

// orphanUserThresholdDays : nombre de jours après lesquels un user soft-deleted
// est éligible au hard-delete par le worker. Aligné sur le requirement RGPD
// (rétention minimale 90 jours en corbeille avant purge définitive).
const orphanUserThresholdDays = 90

// CleanupWorker vérifie périodiquement les users soft-deleted à purger.
type CleanupWorker struct {
	dbPool *pgxpool.Pool
	logger *slog.Logger
}

// NewCleanupWorker crée un nouveau worker de cleanup.
func NewCleanupWorker(dbPool *pgxpool.Pool, logger *slog.Logger) *CleanupWorker {
	return &CleanupWorker{
		dbPool: dbPool,
		logger: logger,
	}
}

// Start lance le worker en goroutine (non-bloquant).
// Vérifie toutes les 24h les users soft-deleted > 90 jours et les purge.
// Premier check immédiat au démarrage (comme ExpireWorker).
func (w *CleanupWorker) Start(ctx context.Context) {
	w.logger.Info("Cleanup Worker started, checking every 24h...")

	go func() {
		// Premier check immédiat au démarrage.
		w.checkAndCleanup(ctx)

		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("Cleanup Worker stopping...")
				return
			case <-ticker.C:
				w.checkAndCleanup(ctx)
			}
		}
	}()
}

// orphanCandidate — un user soft-deleted éligible au hard-delete.
type orphanCandidate struct {
	ID    string
	Email string
	Name  string
	Role  string
}

// checkAndCleanup :
//  1. SELECT les users à purger (deletedAt < NOW() - 90 jours).
//  2. Pour chaque user, INSERT dans AuditLog (action=USER_HARD_DELETED_AUTO)
//     AVANT le DELETE — pour traçabilité même si le DELETE échoue.
//  3. Hard-delete via le repo HardDeleteOrphanUsers (cascade manuel + final
//     DELETE FROM "User" WHERE deletedAt IS NOT NULL AND ...).
//  4. Log summary (info level : "CleanupWorker: deleted N orphan users").
//
// Utilise SystemClaims (no RLS) — le worker tourne en tant que system. La
// policy User_select accepte is_system() pour voir les soft-deleted users
// (sinon le filtre `deletedAt IS NULL` les cacherait).
func (w *CleanupWorker) checkAndCleanup(ctx context.Context) {
	// 1. Fetch les users à purger.
	// Utilise SystemClaims pour bypass User_select (qui filtre deletedAt IS NULL).
	candidates, err := w.fetchOrphanCandidates(ctx)
	if err != nil {
		w.logger.Error("CleanupWorker: fetch orphan candidates failed", "error", err.Error())
		return
	}

	if len(candidates) == 0 {
		// Rien à purger — log debug seulement (évite le spam toutes les 24h).
		w.logger.Debug("CleanupWorker: no orphan users to cleanup")
		return
	}

	w.logger.Info("CleanupWorker: orphan users to cleanup",
		"count", len(candidates),
		"thresholdDays", orphanUserThresholdDays)

	// 2. Pour chaque user, INSERT dans AuditLog AVANT le DELETE.
	// Non-bloquant : si l'INSERT échoue pour un user, on log et on continue
	// (le DELETE sera quand même tenté — l'audit manquant est un moindre mal
	// par rapport à un user qui reste en DB au-delà du délai RGPD).
	audited := 0
	for _, c := range candidates {
		if err := w.insertAuditLog(ctx, c); err != nil {
			w.logger.Error("CleanupWorker: insert audit log failed (will still attempt DELETE)",
				"userId", c.ID, "email", c.Email, "error", err.Error())
			continue
		}
		audited++
	}

	// 3. Hard-delete via le repo HardDeleteOrphanUsers.
	// Le repo fait le cascade manuel sur les tables enfants + le final DELETE.
	// Utilise SystemClaims (is_system() dans User_delete autorise la suppression).
	deleted, err := w.hardDeleteOrphans(ctx)
	if err != nil {
		w.logger.Error("CleanupWorker: hard delete orphans failed",
			"error", err.Error(), "audited", audited)
		return
	}

	// 4. Log summary.
	w.logger.Info("CleanupWorker: deleted orphan users",
		"count", deleted,
		"audited", audited,
		"candidates", len(candidates),
		"thresholdDays", orphanUserThresholdDays)
}

// fetchOrphanCandidates récupère les users soft-deleted plus anciens que 90
// jours. Utilise SystemClaims pour bypass User_select (qui filtre
// deletedAt IS NULL — les soft-deleted sont invisibles sans is_system()).
func (w *CleanupWorker) fetchOrphanCandidates(ctx context.Context) ([]orphanCandidate, error) {
	var candidates []orphanCandidate

	err := db.WithTx(ctx, w.dbPool, db.SystemClaims(), func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT "id", "email", "name", "role"
                        FROM "User"
                        WHERE "deletedAt" IS NOT NULL
                          AND "deletedAt" < NOW() - make_interval(days => $1)
                `, orphanUserThresholdDays)
		if err != nil {
			return fmt.Errorf("query orphan candidates: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var c orphanCandidate
			if err := rows.Scan(&c.ID, &c.Email, &c.Name, &c.Role); err != nil {
				return fmt.Errorf("scan orphan candidate: %w", err)
			}
			candidates = append(candidates, c)
		}
		return rows.Err()
	})

	if err != nil {
		return nil, err
	}
	return candidates, nil
}

// insertAuditLog journalise la suppression d'un user AVANT le DELETE.
// Action=USER_HARD_DELETED_AUTO, entite=User, entiteID=userID, adresseIp='system-worker'.
//
// L'INSERT est fait directement via le pool (pas via SystemClaims) car la
// policy AuditLog_insert a WITH CHECK(true) → pas de RLS à bypass pour l'INSERT.
func (w *CleanupWorker) insertAuditLog(ctx context.Context, c orphanCandidate) error {
	details := map[string]any{
		"userId":        c.ID,
		"userEmail":     c.Email,
		"userName":      c.Name,
		"userRole":      c.Role,
		"thresholdDays": orphanUserThresholdDays,
		"method":        "auto_cleanup_worker",
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return fmt.Errorf("marshal audit details: %w", err)
	}

	auditID := uuid.NewString()
	userEmail := c.Email // non-null
	entiteID := c.ID     // non-null
	reason := fmt.Sprintf("Auto-cleanup by worker (deletedAt > %d days)", orphanUserThresholdDays)

	_, err = w.dbPool.Exec(ctx, `
                INSERT INTO "AuditLog" ("id", "userId", "userEmail", "action", "entite", "entiteId", "details", "adresseIp", "reason", "createdAt")
                VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        `,
		auditID,
		userEmail,
		"USER_HARD_DELETED_AUTO",
		"User",
		entiteID,
		string(detailsJSON),
		"system-worker",
		reason,
	)
	if err != nil {
		return fmt.Errorf("insert audit log: %w", err)
	}
	return nil
}

// hardDeleteOrphans appelle le repo HardDeleteOrphanUsers pour faire le
// cascade DELETE + final DELETE. Le repo gère la transaction + les claims
// system + le cascade manuel sur les tables enfants.
//
// NB : le worker ne passe PAS par le usecase (qui ferait un audit
// USER_HARD_DELETED_MANUAL) car le worker fait son propre audit per-user
// (USER_HARD_DELETED_AUTO) AVANT le DELETE. L'audit summary est fait via
// le log slog (info level).
func (w *CleanupWorker) hardDeleteOrphans(ctx context.Context) (int, error) {
	// On utilise le pool directement pour appeler une fonction SQL ou faire
	// le DELETE. Pour rester cohérent avec le pattern expire_worker (qui
	// appelle des fonctions SECURITY DEFINER), on fait le DELETE inline via
	// SystemClaims + cascade manuel (même logique que UserRepository.Delete).
	//
	// NB : on ne réutilise PAS UserRepository.HardDeleteOrphanUsers ici pour
	// éviter une dépendance circulaire (worker → repository). Le worker fait
	// donc le cascade inline. Les deux implémentations sont identiques en
	// logique (cf. repository/user.go HardDeleteOrphanUsers).

	// 1. Fetch les IDs (déjà faits par fetchOrphanCandidates, mais on refait
	// ici pour éviter de passer les IDs en paramètre — le worker est stateless
	// entre fetchOrphanCandidates et hardDeleteOrphans).
	var userIDs []string
	if err := db.WithTx(ctx, w.dbPool, db.SystemClaims(), func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT "id" FROM "User"
                        WHERE "deletedAt" IS NOT NULL
                          AND "deletedAt" < NOW() - make_interval(days => $1)
                `, orphanUserThresholdDays)
		if err != nil {
			return fmt.Errorf("query orphan ids: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return fmt.Errorf("scan orphan id: %w", err)
			}
			userIDs = append(userIDs, id)
		}
		return rows.Err()
	}); err != nil {
		return 0, err
	}

	if len(userIDs) == 0 {
		return 0, nil
	}

	// 2. Pour chaque user, cascade DELETE + final DELETE.
	// Best-effort : si un user échoue, on continue au suivant.
	deleted := 0
	for _, userID := range userIDs {
		if err := db.WithTx(ctx, w.dbPool, db.SystemClaims(), func(tx pgx.Tx) error {
			steps := []struct {
				desc string
				sql  string
			}{
				{"delete etudiant resultats", `DELETE FROM "Resultat" WHERE "sessionId" IN (SELECT "id" FROM "SessionPassation" WHERE "etudiantId" = $1)`},
				{"delete etudiant sessions", `DELETE FROM "SessionPassation" WHERE "etudiantId" = $1`},
				{"delete teacher resultats", `DELETE FROM "Resultat" WHERE "sessionId" IN (SELECT sp."id" FROM "SessionPassation" sp JOIN "Epreuve" e ON e."id" = sp."epreuveId" WHERE e."enseignantId" = $1)`},
				{"delete teacher sessions", `DELETE FROM "SessionPassation" WHERE "epreuveId" IN (SELECT "id" FROM "Epreuve" WHERE "enseignantId" = $1)`},
				{"delete epreuves", `DELETE FROM "Epreuve" WHERE "enseignantId" = $1`},
				{"delete soumissions", `DELETE FROM "Soumission" WHERE "etudiantId" = $1`},
				{"delete devoirs", `DELETE FROM "Devoir" WHERE "enseignantId" = $1`},
				{"delete invitations", `DELETE FROM "Invitation" WHERE "createdById" = $1`},
				{"null alertes", `UPDATE "Alerte" SET "userId" = NULL WHERE "userId" = $1`},
				{"null filiere responsable", `UPDATE "Filiere" SET "responsableId" = NULL WHERE "responsableId" = $1`},
				{"delete user", `DELETE FROM "User" WHERE "id" = $1`},
			}

			for _, step := range steps {
				ct, err := tx.Exec(ctx, step.sql, userID)
				if err != nil {
					return fmt.Errorf("%s: %w", step.desc, err)
				}
				if step.desc == "delete user" && ct.RowsAffected() == 0 {
					return fmt.Errorf("suppression refusée par RLS (0 ligne affectée) pour user %s", userID)
				}
			}
			return nil
		}); err != nil {
			// Best-effort : log et continue au user suivant.
			w.logger.Error("CleanupWorker: cascade delete failed for user",
				"userId", userID, "error", err.Error())
			continue
		}
		deleted++
	}

	return deleted, nil
}
