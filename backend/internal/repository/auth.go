// Package repository — implémentation AuthRepository avec pgx.
package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// AuthRepository implémente domain.AuthRepository avec pgx.
//
// Toutes les méthodes d'auth (login/refresh/logout/password) appellent des
// fonctions PostgreSQL SECURITY DEFINER (migration 000022). Ces fonctions
// s'exécutent en tant que neondb_owner (bypass RLS interne), ce qui est légitime
// car :
//   - login/refresh : l'utilisateur n'est pas encore authentifié (pas de claims
//     JWT à poser), ou le refresh token EST l'auth ;
//   - password/unlock : opérations admin post-authentification.
//
// Le rôle DB sect_app (NOBYPASSRLS) n'a plus besoin de désactiver RLS en
// cours de transaction — il appelle juste les fonctions SECURITY DEFINER.
type AuthRepository struct {
	pool *pgxpool.Pool
}

// NewAuthRepository crée un nouveau AuthRepository.
func NewAuthRepository(pool *pgxpool.Pool) *AuthRepository {
	return &AuthRepository{pool: pool}
}

// FindUserForAuth récupère un utilisateur par email OU matricule.
// La détection email/matricule est gérée côté SQL par find_user_for_auth
// (fonction SECURITY DEFINER — bypass RLS car l'utilisateur n'est pas encore
// authentifié).
func (r *AuthRepository) FindUserForAuth(ctx context.Context, identifier string) (*domain.AuthUser, error) {
	row := r.pool.QueryRow(ctx, `SELECT * FROM find_user_for_auth($1)`, identifier)
	u, err := scanAuthUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "User", ID: identifier}
		}
		return nil, fmt.Errorf("query user for auth: %w", err)
	}
	return u, nil
}

// MultiAccountInfo est dans domain (partagé avec le usecase).
// Voir domain.MultiAccountInfo.

// FindUsersForAuth (SECT-B2C-MULTI-ETAB) récupère TOUS les comptes correspondant
// à un email (multi-établissements B2C). Retourne une liste pour que le frontend
// puisse afficher une page de choix si l'utilisateur a des comptes dans plusieurs étab.
func (r *AuthRepository) FindUsersForAuth(ctx context.Context, identifier string) ([]domain.MultiAccountInfo, error) {
	rows, err := r.pool.Query(ctx, `SELECT * FROM find_users_for_auth($1)`, identifier)
	if err != nil {
		return nil, fmt.Errorf("query users for auth: %w", err)
	}
	defer rows.Close()

	var accounts []domain.MultiAccountInfo
	for rows.Next() {
		var a domain.MultiAccountInfo
		if err := rows.Scan(&a.UserID, &a.Email, &a.Name, &a.Role,
			&a.EtablissementID, &a.EtablissementNom); err != nil {
			continue
		}
		accounts = append(accounts, a)
	}
	return accounts, nil
}

// GetUserByID récupère un utilisateur par ID (avec champs auth).
// Fonction SECURITY DEFINER get_user_by_id_auth — bypass RLS (lookup post-login).
func (r *AuthRepository) GetUserByID(ctx context.Context, userID string) (*domain.AuthUser, error) {
	row := r.pool.QueryRow(ctx, `SELECT * FROM get_user_by_id_auth($1)`, userID)
	u, err := scanAuthUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "User", ID: userID}
		}
		return nil, fmt.Errorf("query user by id: %w", err)
	}
	return u, nil
}

// UpdateLoginSuccess reset loginAttempts, lockedUntil et pose derniereConnexion = now.
// Fonction SECURITY DEFINER update_login_success.
func (r *AuthRepository) UpdateLoginSuccess(ctx context.Context, userID string) error {
	if _, err := r.pool.Exec(ctx, `SELECT update_login_success($1)`, userID); err != nil {
		return fmt.Errorf("update login success: %w", err)
	}
	return nil
}

// IncrementLoginAttempts incrémente loginAttempts. Si >= maxAttempts, pose lockedUntil.
// Retourne le nouveau count. Fonction SECURITY DEFINER increment_login_attempts.
func (r *AuthRepository) IncrementLoginAttempts(ctx context.Context, userID string, maxAttempts int, lockDuration time.Duration) (int, error) {
	var attempts int
	err := r.pool.QueryRow(ctx,
		`SELECT increment_login_attempts($1, $2, $3)`,
		userID, maxAttempts, int(lockDuration.Seconds()),
	).Scan(&attempts)
	if err != nil {
		return 0, fmt.Errorf("increment login attempts: %w", err)
	}
	return attempts, nil
}

// CreateRefreshToken insère un nouveau refresh token en base.
// Fonction SECURITY DEFINER create_refresh_token.
func (r *AuthRepository) CreateRefreshToken(ctx context.Context, rt *domain.RefreshToken) error {
	if _, err := r.pool.Exec(ctx,
		`SELECT create_refresh_token($1, $2, $3, $4, $5, $6)`,
		rt.ID, rt.UserID, rt.TokenHash, rt.ExpiresAt, rt.UserAgent, rt.IP,
	); err != nil {
		return fmt.Errorf("insert refresh token: %w", err)
	}
	return nil
}

// FindRefreshTokenByHash récupère un refresh token par son hash.
// Fonction SECURITY DEFINER find_refresh_token_by_hash.
func (r *AuthRepository) FindRefreshTokenByHash(ctx context.Context, hash string) (*domain.RefreshToken, error) {
	row := r.pool.QueryRow(ctx, `SELECT * FROM find_refresh_token_by_hash($1)`, hash)
	rt := &domain.RefreshToken{}
	err := row.Scan(&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.RevokedAt, &rt.CreatedAt, &rt.UserAgent, &rt.IP)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "RefreshToken", ID: hash}
		}
		return nil, fmt.Errorf("query refresh token: %w", err)
	}
	return rt, nil
}

// RevokeRefreshToken marque un refresh token comme révoqué.
// Fonction SECURITY DEFINER revoke_refresh_token.
func (r *AuthRepository) RevokeRefreshToken(ctx context.Context, tokenID string) error {
	if _, err := r.pool.Exec(ctx, `SELECT revoke_refresh_token($1)`, tokenID); err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

// RevokeRefreshTokenByHashIfActive (U10) : UPDATE atomique qui révoque le token
// ET le retourne seulement s'il était encore actif (revokedAt IS NULL).
// Permet d'éviter la race condition : deux requêtes concurrentes avec le même
// refresh token → seule la première obtient le token (et le révoque), la deuxième
// obtient nil (le token est déjà révoqué entre-temps).
// Fonction SECURITY DEFINER revoke_refresh_token_by_hash_if_active.
func (r *AuthRepository) RevokeRefreshTokenByHashIfActive(ctx context.Context, hash string) (*domain.RefreshToken, error) {
	row := r.pool.QueryRow(ctx, `SELECT * FROM revoke_refresh_token_by_hash_if_active($1)`, hash)
	rt := &domain.RefreshToken{}
	err := row.Scan(&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.RevokedAt, &rt.CreatedAt, &rt.UserAgent, &rt.IP)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // token introuvable ou déjà révoqué
		}
		return nil, fmt.Errorf("query refresh token: %w", err)
	}
	return rt, nil
}

// RevokeAllUserRefreshTokens révoque tous les refresh tokens actifs d'un user.
// Fonction SECURITY DEFINER revoke_all_user_refresh_tokens.
func (r *AuthRepository) RevokeAllUserRefreshTokens(ctx context.Context, userID string) error {
	if _, err := r.pool.Exec(ctx, `SELECT revoke_all_user_refresh_tokens($1)`, userID); err != nil {
		return fmt.Errorf("revoke all user refresh tokens: %w", err)
	}
	return nil
}

// --- Password reset ("mot de passe oublié") ---

// CreatePasswordResetToken insère un nouveau token de reset en base.
// Fonction SECURITY DEFINER create_password_reset_token (migration 000054).
func (r *AuthRepository) CreatePasswordResetToken(ctx context.Context, t *domain.PasswordResetToken) error {
	if _, err := r.pool.Exec(ctx,
		`SELECT create_password_reset_token($1, $2, $3, $4, $5, $6)`,
		t.ID, t.UserID, t.TokenHash, t.ExpiresAt, t.IP, t.UserAgent,
	); err != nil {
		return fmt.Errorf("insert password reset token: %w", err)
	}
	return nil
}

// FindPasswordResetTokenByHash récupère un token de reset non utilisé par son hash.
// Fonction SECURITY DEFINER find_password_reset_token_by_hash (migration 000054).
// Retourne nil + NotFoundError si introuvable (ou déjà utilisé — la fonction
// SQL filtre usedAt IS NULL).
func (r *AuthRepository) FindPasswordResetTokenByHash(ctx context.Context, hash string) (*domain.PasswordResetToken, error) {
	row := r.pool.QueryRow(ctx, `SELECT * FROM find_password_reset_token_by_hash($1)`, hash)
	t := &domain.PasswordResetToken{}
	err := row.Scan(&t.ID, &t.UserID, &t.TokenHash, &t.ExpiresAt, &t.UsedAt, &t.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "PasswordResetToken", ID: hash}
		}
		return nil, fmt.Errorf("query password reset token: %w", err)
	}
	return t, nil
}

// MarkPasswordResetTokenUsed marque un token comme utilisé (usedAt = now).
// Fonction SECURITY DEFINER mark_password_reset_token_used (migration 000054).
func (r *AuthRepository) MarkPasswordResetTokenUsed(ctx context.Context, tokenID string) error {
	if _, err := r.pool.Exec(ctx, `SELECT mark_password_reset_token_used($1)`, tokenID); err != nil {
		return fmt.Errorf("mark password reset token used: %w", err)
	}
	return nil
}

// InvalidateUserPasswordResetTokens marque tous les tokens non utilisés d'un
// utilisateur comme utilisés (un token consommé invalide les autres).
// Fonction SECURITY DEFINER invalidate_user_password_reset_tokens (migration 000054).
func (r *AuthRepository) InvalidateUserPasswordResetTokens(ctx context.Context, userID string) error {
	if _, err := r.pool.Exec(ctx, `SELECT invalidate_user_password_reset_tokens($1)`, userID); err != nil {
		return fmt.Errorf("invalidate user password reset tokens: %w", err)
	}
	return nil
}

// CreateAuditLog insère une entrée d'audit. Le champ userId peut être NULL.
//
// NB : AuditLog a une policy INSERT WITH CHECK(true) → RLS autorise l'insertion
// sans bypass. Aucune fonction SECURITY DEFINER nécessaire ici.
//
// SECT-ETABLISSEMENT-AUDIT-1 (migration 000083) : on insère désormais
// "etablissementId" (nullable — pour scoping RLS par établissement) et "reason"
// (nullable — raison optionnelle saisie par l'acteur, ex: motif de révocation
// manuelle d'un lien d'inscription).
func (r *AuthRepository) CreateAuditLog(ctx context.Context, entry *domain.AuditLogEntry) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
                INSERT INTO "AuditLog" ("id", "userId", "userEmail", "action", "entite", "entiteId", "details", "adresseIp", "etablissementId", "reason", "createdAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        `,
		uuid.NewString(), nullableString(entry.UserID), nullableString(entry.UserEmail),
		entry.Action, entry.Entite, nullableString(entry.EntiteID),
		entry.Details, entry.AdresseIP,
		nullableString(entry.EtablissementID), nullableStringFromStr(entry.Reason),
	)
	if err != nil {
		return fmt.Errorf("insert audit log: %w", err)
	}

	return tx.Commit(ctx)
}

// AuditLogFilters — SECT-ETABLISSEMENT-AUDIT-1
// Filtres optionnels pour ListByEtablissement. La pagination se fait via
// Limit + Offset (le handler calcule Offset = (page-1) * limit avant l'appel).
//
// Conventions :
//   - Action/Entite vides → pas de filtre (toutes les valeurs)
//   - DateFrom/DateTo nil → pas de filtre date
//   - Search vide → pas de filtre ILIKE
//   - Limit ≤ 0 → valeur par défaut 20 ; > maxAuditLogLimit → clampé à 100
//   - Offset < 0 → traité comme 0
type AuditLogFilters struct {
	Action   string
	Entite   string
	DateFrom *time.Time
	DateTo   *time.Time
	Search   string // ILIKE sur action/entite/userEmail/adresseIp/details
	Limit    int
	Offset   int
}

// maxAuditLogLimit borne la pagination pour éviter les requêtes massives (DoS).
// 100 entrées par page est largement suffisant pour un journal d'audit UI.
const maxAuditLogLimit = 100

// defaultAuditLogLimit est appliqué quand filters.Limit ≤ 0.
const defaultAuditLogLimit = 20

// ListByEtablissement — SECT-ETABLISSEMENT-AUDIT-1
//
// Retourne les entrées d'audit d'un établissement, triées par createdAt DESC.
// Le scoping RLS est géré par la policy AuditLog_select (migration 000083) :
// un RESPONSABLE ne voit QUE les entries où (userId = current_user_id()) OU
// (userId IS NOT NULL AND user_in_my_etab(userId)) OU
// (userId IS NULL AND etablissementId = current_etablissement_id()).
// L'ADMIN bypass via is_admin().
//
// Le filtre SQL `"etablissementId" = $1` est defense-in-depth : même si la
// policy RLS était mal configurée, un RESPONSABLE ne verrait que SON étab.
//
// Filtres optionnels (AuditLogFilters) : action, entite, dateFrom, dateTo,
// search (ILIKE). La pagination via Limit/Offset.
//
// Retourne (entries, totalCount, error). totalCount est le count AVANT
// pagination (pour que le frontend puisse afficher "Page X sur Y").
//
// NB : utilise db.WithTx avec les claims du context (posés par middleware
// RequireAuth) pour activer RLS. Sans claims, sect_app ne voit aucune ligne
// (RLS deny by default).
func (r *AuthRepository) ListByEtablissement(ctx context.Context, etabID string, filters AuditLogFilters) ([]*domain.AuditLogEntry, int, error) {
	if etabID == "" {
		return nil, 0, fmt.Errorf("etablissement id requis")
	}

	// Clamp limit + sanitize offset.
	limit := filters.Limit
	if limit <= 0 {
		limit = defaultAuditLogLimit
	}
	if limit > maxAuditLogLimit {
		limit = maxAuditLogLimit
	}
	offset := filters.Offset
	if offset < 0 {
		offset = 0
	}

	// Construction dynamique de la clause WHERE (partagée par SELECT + COUNT).
	// On commence par le filtre etablissementId (defense-in-depth en plus
	// de RLS). Les filtres optionnels sont ajoutés ensuite avec des
	// placeholders $N incrémentés.
	var whereClauses []string
	var args []any
	argIdx := 1

	// Filtre principal : etablissementId = $1.
	whereClauses = append(whereClauses, fmt.Sprintf(`"etablissementId" = $%d`, argIdx))
	args = append(args, etabID)
	argIdx++

	// Filtre action (égalité exacte).
	if filters.Action != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"action" = $%d`, argIdx))
		args = append(args, filters.Action)
		argIdx++
	}
	// Filtre entite (égalité exacte).
	if filters.Entite != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"entite" = $%d`, argIdx))
		args = append(args, filters.Entite)
		argIdx++
	}
	// Filtre dateFrom (inclusif).
	if filters.DateFrom != nil {
		whereClauses = append(whereClauses, fmt.Sprintf(`"createdAt" >= $%d`, argIdx))
		args = append(args, *filters.DateFrom)
		argIdx++
	}
	// Filtre dateTo (inclusif — borne la fin de journée).
	if filters.DateTo != nil {
		whereClauses = append(whereClauses, fmt.Sprintf(`"createdAt" <= $%d`, argIdx))
		args = append(args, *filters.DateTo)
		argIdx++
	}
	// Search ILIKE sur 4 colonnes (action/entite/userEmail/adresseIp) + details.
	// pgx simple protocol ne supporte pas les placeholders réutilisés → 5
	// placeholders distincts (un par colonne ILIKE).
	if filters.Search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(
			`("action" ILIKE $%d OR "entite" ILIKE $%d OR "userEmail" ILIKE $%d OR "adresseIp" ILIKE $%d OR "details" ILIKE $%d)`,
			argIdx, argIdx+1, argIdx+2, argIdx+3, argIdx+4,
		))
		pattern := "%" + filters.Search + "%"
		args = append(args, pattern, pattern, pattern, pattern, pattern)
		argIdx += 5
	}

	whereClause := "WHERE " + strings.Join(whereClauses, " AND ")

	var totalCount int
	var entries []*domain.AuditLogEntry

	// Récupère les claims du context (posés par middleware.RequireAuth).
	// Sans claims, sect_app ne voit aucune ligne (RLS deny by default) —
	// on retourne une erreur explicite plutôt que (nil, 0, nil) trompeur.
	claims, ok := appdb.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, 0, fmt.Errorf("unauthenticated — claims requis pour ListByEtablissement (RLS)")
	}

	err := appdb.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		// 1. COUNT (avant pagination — pour le total "Page X sur Y").
		countQuery := fmt.Sprintf(`SELECT count(*) FROM "AuditLog" %s`, whereClause)
		if err := tx.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
			return fmt.Errorf("count audit logs: %w", err)
		}

		// 2. SELECT paginé (LIMIT + OFFSET). On append limit + offset aux
		// args partagées (placeholders $N+1 et $N+2).
		pagedArgs := append(append([]any{}, args...), limit, offset)
		selectQuery := fmt.Sprintf(`
                        SELECT "id", "userId", "userEmail", "action", "entite", "entiteId",
                               "details", "adresseIp", "etablissementId", "reason", "createdAt"
                        FROM "AuditLog"
                        %s
                        ORDER BY "createdAt" DESC
                        LIMIT $%d OFFSET $%d
                `, whereClause, argIdx, argIdx+1)

		rows, err := tx.Query(ctx, selectQuery, pagedArgs...)
		if err != nil {
			return fmt.Errorf("query audit logs: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var (
				id        string
				userID    *string
				userEmail *string
				action    string
				entite    string
				entiteID  *string
				details   *string
				adresseIP *string
				etabIDRow *string
				reasonRow *string
				createdAt time.Time
			)
			if err := rows.Scan(
				&id, &userID, &userEmail, &action, &entite,
				&entiteID, &details, &adresseIP,
				&etabIDRow, &reasonRow, &createdAt,
			); err != nil {
				return fmt.Errorf("scan audit log: %w", err)
			}
			e := &domain.AuditLogEntry{
				ID:              id,
				UserID:          userID,
				UserEmail:       userEmail,
				Action:          action,
				Entite:          entite,
				EntiteID:        entiteID,
				Details:         derefStr(details),
				AdresseIP:       derefStr(adresseIP),
				EtablissementID: etabIDRow,
				Reason:          derefStr(reasonRow),
				CreatedAt:       createdAt,
			}
			entries = append(entries, e)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, 0, err
	}
	return entries, totalCount, nil
}

// UpdatePassword met à jour le hash + reset mustChangePwd + reset attempts.
// Fonction SECURITY DEFINER update_password.
func (r *AuthRepository) UpdatePassword(ctx context.Context, userID string, passwordHash string) error {
	if _, err := r.pool.Exec(ctx, `SELECT update_password($1, $2)`, userID, passwordHash); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}

// ResetPassword (U5) : reset admin — hash + loginAttempts=0 + lockedUntil=NULL +
// mustChangePwd=true (force l'user à changer au prochain login). Pour le workflow
// "admin reset password" : l'admin set un mot de passe temporaire, l'user doit le changer.
// Fonction SECURITY DEFINER reset_password.
func (r *AuthRepository) ResetPassword(ctx context.Context, userID string, passwordHash string) error {
	if _, err := r.pool.Exec(ctx, `SELECT reset_password($1, $2)`, userID, passwordHash); err != nil {
		return fmt.Errorf("reset password: %w", err)
	}
	return nil
}

// UnlockAccount (U5) : déverrouille un compte sans changer le password.
// Reset loginAttempts=0 + lockedUntil=NULL. L'user garde son password actuel.
// Fonction SECURITY DEFINER unlock_account.
func (r *AuthRepository) UnlockAccount(ctx context.Context, userID string) error {
	if _, err := r.pool.Exec(ctx, `SELECT unlock_account($1)`, userID); err != nil {
		return fmt.Errorf("unlock account: %w", err)
	}
	return nil
}

// --- Helpers ---

func nullableString(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}

// nullableStringFromStr convertit une string Go en valeur pgx-compatible : si
// la string est vide, retourne nil (NULL en DB) ; sinon retourne la string.
// Utilisé pour les colonnes TEXT optionnelles comme AuditLog.reason (une
// string vide "" en Go = pas de raison = NULL en DB, plutôt que de stocker une
// chaîne vide qui pollue les SELECT WHERE "reason" IS NOT NULL).
func nullableStringFromStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// GetPendingAbonnementByEtablissementID (SECT-GENIUSPAY-WAVE-SECURITY +
// SECT-B2C-EXPIRE) : retourne l'ID + reason de l'abonnement qui bloque le login :
//   - EN_ATTENTE_PAIEMENT → reason="pending" (jamais payé)
//   - EXPIRE → reason="expired" (worker a passé le statut)
//   - ACTIF avec dateFin < NOW() → reason="expired" (worker pas encore passé)
//
// Retourne ("", "") si aucun abonnement bloquant → login OK.
// Contourne RLS (appelé avant pose des claims dans Login/Refresh).
func (r *AuthRepository) GetPendingAbonnementByEtablissementID(ctx context.Context, etablissementID string) (abonnementID string, reason string, err error) {
	if etablissementID == "" {
		return "", "", nil
	}
	// SECT-B2C-EXPIRE FIX : utiliser SystemClaims pour bypass RLS.
	// Sans claims, sect_app ne voit aucun abonnement (RLS bloque) → le check
	// passait toujours → login réussissait même pour Premium non payé.
	err = appdb.WithTx(ctx, r.pool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
                        SELECT "id",
                          CASE
                            WHEN "statut" = 'EN_ATTENTE_PAIEMENT' THEN 'pending'
                            ELSE 'expired'
                          END AS reason
                        FROM "Abonnement"
                        WHERE "etablissementId" = $1
                          AND "deletedAt" IS NULL
                          AND (
                            "statut" = 'EN_ATTENTE_PAIEMENT'
                            OR "statut" = 'EXPIRE'
                            OR ("statut" = 'ACTIF' AND "dateFin" IS NOT NULL AND "dateFin" < NOW())
                          )
                        ORDER BY "createdAt" DESC LIMIT 1
                `, etablissementID).Scan(&abonnementID, &reason)
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", "", nil // Pas d'abonnement bloquant → login OK
		}
		return "", "", fmt.Errorf("get pending abonnement: %w", err)
	}
	return abonnementID, reason, nil
}

// scanAuthUser scan une ligne User avec tous les champs auth.
// L'ordre des 14 champs correspond aux colonnes retournées par les fonctions
// SECURITY DEFINER find_user_for_auth et get_user_by_id_auth (migration 000022).
func scanAuthUser(s scanner) (*domain.AuthUser, error) {
	u := &domain.AuthUser{}
	err := s.Scan(
		&u.ID, &u.Email, &u.Name, &u.Password, &u.Role,
		&u.EtablissementID, &u.FiliereID, &u.Image, &u.Actif,
		&u.MustChangePwd, &u.Niveau, &u.LoginAttempts, &u.LockedUntil,
		&u.DerniereConnexion,
	)
	if err != nil {
		return nil, err
	}
	return u, nil
}
