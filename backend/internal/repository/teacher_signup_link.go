// Package repository — implémentation TeacherSignupLinkRepository
// (SECT-TEACHER-REG-LINK-1). Clone adapté de student_signup_link.go :
// pas de filiereId/niveau/requireMatricule (les enseignants n'ont ni filière
// pré-assignée ni matricule à l'inscription).
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// TeacherSignupLinkRepository implémente domain.TeacherSignupLinkRepository.
type TeacherSignupLinkRepository struct {
	pool *pgxpool.Pool
}

// NewTeacherSignupLinkRepository crée un nouveau TeacherSignupLinkRepository.
func NewTeacherSignupLinkRepository(pool *pgxpool.Pool) *TeacherSignupLinkRepository {
	return &TeacherSignupLinkRepository{pool: pool}
}

// Create insère un nouveau lien d'inscription enseignant (RLS via claims —
// TeacherSignupLink_insert). Le token + expiresAt sont fournis par le usecase
// (crypto/rand + now+TTL). L'ID est généré côté DB via gen_random_uuid()::text.
// expiryReminderSent a un DEFAULT false côté DB — non inséré ici.
func (r *TeacherSignupLinkRepository) Create(ctx context.Context, input domain.CreateTeacherSignupLinkInput, token string) (*domain.TeacherSignupLink, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var link *domain.TeacherSignupLink
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		query := `
			INSERT INTO "TeacherSignupLink" (
				"id", "token", "etablissementId",
				"createdById", "expiresAt", "maxUses", "useCount", "actif",
				"label", "emailDomainRestriction", "customWelcomeMessage",
				"createdAt", "updatedAt"
			)
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 0, true, $6, $7, $8,
				CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			RETURNING "id", "token", "etablissementId",
				"createdById", "expiresAt", "maxUses", "useCount", "actif",
				"label", "emailDomainRestriction", "customWelcomeMessage",
				"createdAt", "updatedAt"`
		row := tx.QueryRow(ctx, query,
			token,
			input.EtablissementID,
			input.CreatedByID,
			input.ExpiresAt,
			nullableIntPtr(input.MaxUses),
			nullableStrPtr(input.Label),
			nullableStrPtr(input.EmailDomainRestriction),
			nullableStrPtr(input.CustomWelcomeMessage),
		)
		l := &domain.TeacherSignupLink{}
		if err := row.Scan(
			&l.ID, &l.Token, &l.EtablissementID,
			&l.CreatedByID, &l.ExpiresAt, &l.MaxUses, &l.UseCount, &l.Actif,
			&l.Label, &l.EmailDomainRestriction, &l.CustomWelcomeMessage,
			&l.CreatedAt, &l.UpdatedAt,
		); err != nil {
			if isUniqueViolation(err) {
				return &domain.ConflictError{Message: "token déjà utilisé"}
			}
			return fmt.Errorf("create teacher signup link: %w", err)
		}
		link = l
		return nil
	})
	if err != nil {
		return nil, err
	}
	return link, nil
}

// FindByToken récupère un lien par token (endpoint public — bypass RLS).
// Peuple les relations Etablissement + Creator.
//
// Utilise la fonction SECURITY DEFINER find_teacher_signup_link_by_token()
// (migration 000107) pour rester compatible avec le rôle prod sect_app
// (NOBYPASSRLS). Le token EST l'authentification — pas de claims JWT requises.
//
// 17 colonnes retournées par la fonction SQL (ordre figé — scan positionnel) :
//  1. link_id, 2. link_token, 3. link_etablissement_id, 4. link_created_by_id,
//  5. link_expires_at, 6. link_max_uses, 7. link_use_count, 8. link_actif,
//  9. link_label, 10. link_created_at, 11. link_email_domain_restriction,
//
// 12. link_custom_welcome_message, 13. link_expiry_reminder_sent,
// 14. etab_nom, 15. etab_type, 16. etab_ville, 17. creator_name
func (r *TeacherSignupLinkRepository) FindByToken(ctx context.Context, token string) (*domain.TeacherSignupLink, error) {
	row := r.pool.QueryRow(ctx, `SELECT * FROM find_teacher_signup_link_by_token($1)`, token)
	l := &domain.TeacherSignupLink{}
	var (
		etabNom, etabType, etabVille *string
		creatorName                  *string
	)
	if err := row.Scan(
		&l.ID, &l.Token, &l.EtablissementID, &l.CreatedByID,
		&l.ExpiresAt, &l.MaxUses, &l.UseCount, &l.Actif,
		&l.Label, &l.CreatedAt, &l.EmailDomainRestriction,
		&l.CustomWelcomeMessage, &l.ExpiryReminderSent,
		&etabNom, &etabType, &etabVille,
		&creatorName,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "TeacherSignupLink", ID: token}
		}
		return nil, fmt.Errorf("query teacher signup link by token: %w", err)
	}
	// Peupler les relations (uniquement si les jointures ont matché).
	if etabNom != nil {
		etab := &domain.EtablissementRef{
			ID:  l.EtablissementID,
			Nom: *etabNom,
		}
		if etabType != nil {
			etab.Type = *etabType
		}
		l.Etablissement = etab
	}
	if creatorName != nil {
		l.Creator = &domain.UserRef{
			ID:   l.CreatedByID,
			Name: *creatorName,
		}
	}
	return l, nil
}

// ListByCreator liste les liens non supprimés d'un créateur (RLS via claims).
// Tri : createdAt DESC (plus récents en premier).
func (r *TeacherSignupLinkRepository) ListByCreator(ctx context.Context, creatorID string) ([]domain.TeacherSignupLink, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []domain.TeacherSignupLink
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		query := `
			SELECT "id", "token", "etablissementId",
			       "createdById", "expiresAt", "maxUses", "useCount", "actif",
			       "label", "emailDomainRestriction", "customWelcomeMessage",
			       "expiryReminderSent", "createdAt", "updatedAt"
			FROM "TeacherSignupLink"
			WHERE "createdById" = $1 AND "deletedAt" IS NULL
			ORDER BY "createdAt" DESC`
		rows, err := tx.Query(ctx, query, creatorID)
		if err != nil {
			return fmt.Errorf("query teacher signup links: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var l domain.TeacherSignupLink
			if err := rows.Scan(
				&l.ID, &l.Token, &l.EtablissementID,
				&l.CreatedByID, &l.ExpiresAt, &l.MaxUses, &l.UseCount, &l.Actif,
				&l.Label, &l.EmailDomainRestriction, &l.CustomWelcomeMessage,
				&l.ExpiryReminderSent, &l.CreatedAt, &l.UpdatedAt,
			); err != nil {
				return fmt.Errorf("scan teacher signup link: %w", err)
			}
			result = append(result, l)
		}
		if result == nil {
			result = []domain.TeacherSignupLink{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// Revoke effectue un soft-delete : actif=false + deletedAt=now + updatedAt=now.
// RLS via claims (TeacherSignupLink_update). Idempotent : ne retourne pas
// NotFoundError si déjà supprimé (cas d'un double-clic utilisateur — on veut 200).
func (r *TeacherSignupLinkRepository) Revoke(ctx context.Context, id string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return fmt.Errorf("no RLS claims in context")
	}

	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE "TeacherSignupLink"
			SET "actif" = false,
			    "deletedAt" = CURRENT_TIMESTAMP,
			    "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = $1 AND "deletedAt" IS NULL`,
			id)
		if err != nil {
			return fmt.Errorf("revoke teacher signup link: %w", err)
		}
		// Pas de check sur RowsAffected : idempotent. Si déjà supprimé ou
		// introuvable, on retourne nil (le résultat côté utilisateur est
		// identique — le lien n'est plus actif).
		return nil
	})
}

// AcceptSignup appelle la fonction SQL accept_teacher_signup (endpoint public —
// bypass RLS car le token EST l'authentification). Crée le User ENSEIGNANT +
// incrémente useCount atomiquement.
//
// Codes de retour (o_code) :
//   - "OK"                 — inscription réussie (les autres champs sont peuplés)
//   - "NOT_FOUND"          — token inconnu ou supprimé
//   - "INACTIVE"           — lien révoqué (actif=false)
//   - "EXPIRED"            — lien expiré (expiresAt < now)
//   - "QUOTA_EXCEEDED"     — maxUses atteint
//   - "DOMAIN_NOT_ALLOWED" — email ne match pas emailDomainRestriction
//   - "USER_EXISTS"        — email déjà utilisé (unique_violation catchée côté SQL)
//
// La fonction retourne 6 colonnes : o_code, o_user_id, o_user_email, o_user_name,
// o_etablissement_nom, o_message.
func (r *TeacherSignupLinkRepository) AcceptSignup(ctx context.Context, token, email, hashedPassword, name string) (*domain.AcceptTeacherSignupResult, error) {
	row := r.pool.QueryRow(ctx, `SELECT * FROM accept_teacher_signup($1, $2, $3, $4)`,
		token, email, hashedPassword, name)
	res := &domain.AcceptTeacherSignupResult{}
	if err := row.Scan(
		&res.Code,
		&res.UserID,
		&res.UserEmail,
		&res.UserName,
		&res.EtablissementNom,
		&res.Message,
	); err != nil {
		// Cas théorique : la fonction SQL a retourné 0 ligne (ne devrait pas arriver).
		if err == pgx.ErrNoRows {
			return &domain.AcceptTeacherSignupResult{
				Code:    "NOT_FOUND",
				Message: "Lien introuvable",
			}, nil
		}
		return nil, fmt.Errorf("accept teacher signup: %w", err)
	}
	return res, nil
}

// LogRegistrationEvent — SECT-TEACHER-REG-LINK-1
//
// Appelle la fonction SECURITY DEFINER log_teacher_registration_event pour
// insérer une ligne d'audit dans "TeacherRegistrationEvent". Bypass RLS car
// la table est INSERT-locked (seule la fonction peut écrire).
//
// Non bloquant côté usecase : si l'appel échoue (DB indisponible, etc.), l'erreur
// est retournée mais le usecase la logge sans échec de l'inscription.
func (r *TeacherSignupLinkRepository) LogRegistrationEvent(
	ctx context.Context,
	linkID, userID, email, ip, userAgent string,
	success bool,
	code string,
) error {
	_, err := r.pool.Exec(ctx, `SELECT log_teacher_registration_event($1, $2, $3, $4, $5, $6, $7)`,
		linkID, nullableStrPtr(strPtrOrNil(userID)), email, ip, userAgent, success, code,
	)
	if err != nil {
		return fmt.Errorf("log_teacher_registration_event: %w", err)
	}
	return nil
}

// MarkReminderSent — SECT-TEACHER-REG-LINK-1
//
// Marque le flag "expiryReminderSent"=true sur un TeacherSignupLink après envoi
// de l'email de reminder 24h par le worker. Idempotent : si appelé plusieurs
// fois (ex: retry worker), l'UPDATE est juste un no-op (valeur déjà true).
//
// Bypass RLS via pool.Exec direct (le worker tourne en system-worker — pas de
// claims utilisateur). La colonne expiryReminderSent n'est pas sensible (un flag
// booléen de dédoublonnage — pas une donnée métier).
func (r *TeacherSignupLinkRepository) MarkReminderSent(ctx context.Context, linkID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE "TeacherSignupLink" SET "expiryReminderSent" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
		linkID)
	if err != nil {
		return fmt.Errorf("mark teacher reminder sent: %w", err)
	}
	return nil
}
