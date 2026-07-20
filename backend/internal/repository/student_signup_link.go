// Package repository — implémentation StudentSignupLinkRepository (SECT-REG-LINK-B2C-MVP-1).
package repository

import (
        "context"
        "fmt"

        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// StudentSignupLinkRepository implémente domain.StudentSignupLinkRepository.
type StudentSignupLinkRepository struct {
        pool *pgxpool.Pool
}

// NewStudentSignupLinkRepository crée un nouveau StudentSignupLinkRepository.
func NewStudentSignupLinkRepository(pool *pgxpool.Pool) *StudentSignupLinkRepository {
        return &StudentSignupLinkRepository{pool: pool}
}

// Pool expose le pool sous-jacent pour permettre au usecase d'exécuter des
// queries RLS-aware (ex: is_enseignant_in_personal_etab) sans réinventer WithTx.
func (r *StudentSignupLinkRepository) Pool() *pgxpool.Pool {
        return r.pool
}

// Create insère un nouveau lien d'inscription (RLS via claims — StudentSignupLink_insert).
// Le token + expiresAt sont fournis par le usecase (crypto/rand + now+30j).
// L'ID est généré côté DB via gen_random_uuid()::text.
//
// SECT-REG-LINK-PHASE3-BACKEND-1 : ajout colonne "customWelcomeMessage" (text,
// nullable). expiryReminderSent a un DEFAULT false côté DB — non inséré ici.
//
// SECT-STUDENT-SIGNUP-MATRICULE-1 : ajout colonne "requireMatricule" (boolean,
// DEFAULT false). Si nil côté input, on insère false (comportement inchangé).
func (r *StudentSignupLinkRepository) Create(ctx context.Context, input domain.CreateStudentSignupLinkInput, token string) (*domain.StudentSignupLink, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var link *domain.StudentSignupLink
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                query := `
                        INSERT INTO "StudentSignupLink" (
                                "id", "token", "etablissementId", "filiereId", "niveau",
                                "createdById", "expiresAt", "maxUses", "useCount", "actif",
                                "label", "emailDomainRestriction", "customWelcomeMessage",
                                "requireMatricule",
                                "createdAt", "updatedAt"
                        )
                        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, 0, true, $8, $9, $10, $11,
                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING "id", "token", "etablissementId", "filiereId", "niveau",
                                  "createdById", "expiresAt", "maxUses", "useCount", "actif",
                                  "label", "emailDomainRestriction", "customWelcomeMessage",
                                  "requireMatricule",
                                  "createdAt", "updatedAt"`
                row := tx.QueryRow(ctx, query,
                        token,
                        input.EtablissementID,
                        nullableStrPtr(input.FiliereID),
                        nullableStrPtr(input.Niveau),
                        input.CreatedByID,
                        input.ExpiresAt,
                        nullableIntPtr(input.MaxUses),
                        nullableStrPtr(input.Label),
                        nullableStrPtr(input.EmailDomainRestriction),
                        nullableStrPtr(input.CustomWelcomeMessage),
                        input.RequireMatricule != nil && *input.RequireMatricule,
                )
                l := &domain.StudentSignupLink{}
                if err := row.Scan(
                        &l.ID, &l.Token, &l.EtablissementID, &l.FiliereID, &l.Niveau,
                        &l.CreatedByID, &l.ExpiresAt, &l.MaxUses, &l.UseCount, &l.Actif,
                        &l.Label, &l.EmailDomainRestriction, &l.CustomWelcomeMessage,
                        &l.RequireMatricule,
                        &l.CreatedAt, &l.UpdatedAt,
                ); err != nil {
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "token déjà utilisé"}
                        }
                        return fmt.Errorf("create student signup link: %w", err)
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
// Peuple les relations Etablissement + Filiere + Creator (clés lowercase pour
// le frontend, conformément au contrat verify de StudentSignupLink).
//
// Utilise la fonction SECURITY DEFINER find_student_signup_link_by_token() (migration 000079)
// pour rester compatible avec le rôle prod sect_app (NOBYPASSRLS). Le token EST
// l'authentification — pas de claims JWT requises.
//
// 25 colonnes retournées par la fonction SQL (migration 000082 étendue — 4 colonnes
// ajoutées : link_require_matricule + etab_matricule_regex + etab_matricule_format
// + etab_matricule_example, en 16e à 19e position, avant les colonnes de jointure) :
//  1. link_id, 2. link_token, 3. link_etablissement_id, 4. link_filiere_id,
//  5. link_niveau, 6. link_created_by_id, 7. link_expires_at, 8. link_max_uses,
//  9. link_use_count, 10. link_actif, 11. link_label, 12. link_created_at,
//  13. link_email_domain_restriction (PHASE 2),
//  14. link_custom_welcome_message (PHASE 3),
//  15. link_expiry_reminder_sent (PHASE 3),
//  16. link_require_matricule (MATRICULE-1),
//  17. etab_matricule_regex (MATRICULE-1),
//  18. etab_matricule_format (MATRICULE-1),
//  19. etab_matricule_example (MATRICULE-1),
//  20. etab_nom, 21. etab_type, 22. etab_ville, 23. fil_nom, 24. fil_code,
//  25. creator_name
func (r *StudentSignupLinkRepository) FindByToken(ctx context.Context, token string) (*domain.StudentSignupLink, error) {
        row := r.pool.QueryRow(ctx, `SELECT * FROM find_student_signup_link_by_token($1)`, token)
        l := &domain.StudentSignupLink{}
        var (
                etabNom, etabType, etabVille            *string
                matriculeRegex, matriculeFormat, matriculeExample *string
                filNom, filCode                          *string
                creatorName                              *string
        )
        if err := row.Scan(
                &l.ID, &l.Token, &l.EtablissementID, &l.FiliereID, &l.Niveau,
                &l.CreatedByID, &l.ExpiresAt, &l.MaxUses, &l.UseCount, &l.Actif,
                &l.Label, &l.CreatedAt, &l.EmailDomainRestriction,
                &l.CustomWelcomeMessage, &l.ExpiryReminderSent,
                &l.RequireMatricule,
                &matriculeRegex, &matriculeFormat, &matriculeExample,
                &etabNom, &etabType, &etabVille,
                &filNom, &filCode,
                &creatorName,
        ); err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "StudentSignupLink", ID: token}
                }
                return nil, fmt.Errorf("query student signup link by token: %w", err)
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
                // SECT-STUDENT-SIGNUP-MATRICULE-1 : propager la config matricule de
                // l'étab (regex/format/example) pour que le frontend puisse valider
                // l'input étudiant + afficher un placeholder + helper.
                etab.MatriculeRegex = matriculeRegex
                etab.MatriculeFormat = matriculeFormat
                etab.MatriculeExample = matriculeExample
                l.Etablissement = etab
        }
        if l.FiliereID != nil && filNom != nil {
                fil := &domain.FiliereRef{
                        ID:  *l.FiliereID,
                        Nom: *filNom,
                }
                if filCode != nil {
                        fil.Code = *filCode
                }
                l.Filiere = fil
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
// Tri : createdAt DESC (plus récents en premier). Utile pour le dashboard
// "mes liens d'inscription" côté frontend.
func (r *StudentSignupLinkRepository) ListByCreator(ctx context.Context, creatorID string) ([]domain.StudentSignupLink, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []domain.StudentSignupLink
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // SECURITY : on ne retourne pas le token dans List (le token est un secret
                // d'authentification — cf. repository/invitation.go List qui a retiré le
                // token pour la même raison). Le handler list devra propager url construite
                // par le usecase Create ; pour les liens existants, le frontend dispose déjà
                // de l'URL (stockée côté client à la création) ou peut la régénérer via
                // un endpoint dédié si nécessaire.
                //
                // SECT-REG-LINK-PHASE3-BACKEND-1 : ajout colonnes expiryReminderSent +
                // customWelcomeMessage (utiles pour l'affichage du message perso côté
                // frontend + suivi du flag reminder).
                //
                // SECT-STUDENT-SIGNUP-MATRICULE-1 : ajout colonne requireMatricule
                // (utile pour afficher le toggle côté frontend list de liens).
                query := `
                        SELECT "id", "token", "etablissementId", "filiereId", "niveau",
                               "createdById", "expiresAt", "maxUses", "useCount", "actif",
                               "label", "emailDomainRestriction", "customWelcomeMessage",
                               "expiryReminderSent", "requireMatricule", "createdAt", "updatedAt"
                        FROM "StudentSignupLink"
                        WHERE "createdById" = $1 AND "deletedAt" IS NULL
                        ORDER BY "createdAt" DESC`
                rows, err := tx.Query(ctx, query, creatorID)
                if err != nil {
                        return fmt.Errorf("query student signup links: %w", err)
                }
                defer rows.Close()
                for rows.Next() {
                        var l domain.StudentSignupLink
                        if err := rows.Scan(
                                &l.ID, &l.Token, &l.EtablissementID, &l.FiliereID, &l.Niveau,
                                &l.CreatedByID, &l.ExpiresAt, &l.MaxUses, &l.UseCount, &l.Actif,
                                &l.Label, &l.EmailDomainRestriction, &l.CustomWelcomeMessage,
                                &l.ExpiryReminderSent, &l.RequireMatricule, &l.CreatedAt, &l.UpdatedAt,
                        ); err != nil {
                                return fmt.Errorf("scan student signup link: %w", err)
                        }
                        result = append(result, l)
                }
                if result == nil {
                        result = []domain.StudentSignupLink{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// Revoke effectue un soft-delete : actif=false + deletedAt=now + updatedAt=now.
// RLS via claims (StudentSignupLink_update). Idempotent : ne retourne pas
// NotFoundError si déjà supprimé (cas d'un double-clic utilisateur — on veut 200).
func (r *StudentSignupLinkRepository) Revoke(ctx context.Context, id string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                _, err := tx.Exec(ctx, `
                        UPDATE "StudentSignupLink"
                        SET "actif" = false,
                            "deletedAt" = CURRENT_TIMESTAMP,
                            "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1 AND "deletedAt" IS NULL`,
                        id)
                if err != nil {
                        return fmt.Errorf("revoke student signup link: %w", err)
                }
                // Pas de check sur RowsAffected : idempotent. Si déjà supprimé ou introuvable,
                // on retourne nil (le résultat côté utilisateur est identique — le lien
                // n'est plus actif).
                return nil
        })
}

// AcceptSignup appelle la fonction SQL accept_student_signup (endpoint public —
// bypass RLS car le token EST l'authentification). Crée le User ETUDIANT +
// incrémente useCount atomiquement.
//
// Codes de retour (o_code) :
//   - "OK"                — inscription réussie (les autres champs sont peuplés)
//   - "NOT_FOUND"         — token inconnu ou supprimé
//   - "INACTIVE"          — lien révoqué (actif=false)
//   - "EXPIRED"           — lien expiré (expiresAt < now)
//   - "QUOTA_EXCEEDED"    — maxUses atteint
//   - "DOMAIN_NOT_ALLOWED" — (PHASE 2) email ne match pas emailDomainRestriction
//   - "USER_EXISTS"       — email déjà utilisé (unique_violation catchée côté SQL)
//   - "MATRICULE_REQUIRED" — (MATRICULE-1) requireMatricule=true mais p_matricule vide
//   - "MATRICULE_INVALID"  — (MATRICULE-1) p_matricule ne match pas etab.regexMatricule
//
// La fonction retourne 8 colonnes : o_code, o_user_id, o_user_email, o_user_name,
// o_user_matricule, o_etablissement_nom, o_filiere_nom, o_message.
//
// SECT-STUDENT-SIGNUP-MATRICULE-1 : ajout 5e paramètre `matricule`. Si le
// link.requireMatricule = true, la fonction SQL valide + stocke le matricule saisi.
// Si false, le matricule est ignoré (auto-génération FIL/LJ/YY/NNN côté SQL).
func (r *StudentSignupLinkRepository) AcceptSignup(ctx context.Context, token, email, hashedPassword, name, matricule string) (*domain.AcceptSignupResult, error) {
        row := r.pool.QueryRow(ctx, `SELECT * FROM accept_student_signup($1, $2, $3, $4, $5)`,
                token, email, hashedPassword, name, matricule)
        res := &domain.AcceptSignupResult{}
        if err := row.Scan(
                &res.Code,
                &res.UserID,
                &res.UserEmail,
                &res.UserName,
                &res.UserMatricule,
                &res.EtablissementNom,
                &res.FiliereNom,
                &res.Message,
        ); err != nil {
                // Cas théorique : la fonction SQL a retourné 0 ligne (ne devrait pas arriver).
                if err == pgx.ErrNoRows {
                        return &domain.AcceptSignupResult{
                                Code:    "NOT_FOUND",
                                Message: "Lien introuvable",
                        }, nil
                }
                return nil, fmt.Errorf("accept student signup: %w", err)
        }
        return res, nil
}

// LogRegistrationEvent — SECT-REG-LINK-PHASE2-BACKEND-1
//
// Appelle la fonction SECURITY DEFINER log_registration_event pour insérer une
// ligne d'audit dans "RegistrationEvent". Bypass RLS car la table est INSERT-locked
// (seule la fonction peut écrire, les clients ne le peuvent pas directement).
//
// Non bloquant côté usecase : si l'appel échoue (DB indisponible, etc.), l'erreur
// est retournée mais le usecase la logge sans échec de l'inscription.
//
// Arguments :
//   - linkID    : ID du StudentSignupLink concerné (toujours non vide si on a pu
//                 charger le link via FindByToken)
//   - userID    : ID du User créé si succès, sinon "" (vide)
//   - email     : email saisi par l'étudiant (lower-casé côté SQL)
//   - ip        : IP client (middleware.GetClientIP)
//   - userAgent : User-Agent HTTP
//   - success   : true si inscription OK, false sinon
//   - code      : code métier (OK, NOT_FOUND, INACTIVE, EXPIRED, QUOTA_EXCEEDED,
//                 DOMAIN_NOT_ALLOWED, USER_EXISTS, TURNSTILE_FAILED)
func (r *StudentSignupLinkRepository) LogRegistrationEvent(
        ctx context.Context,
        linkID, userID, email, ip, userAgent string,
        success bool,
        code string,
) error {
        _, err := r.pool.Exec(ctx, `SELECT log_registration_event($1, $2, $3, $4, $5, $6, $7)`,
                linkID, nullableStrPtr(strPtrOrNil(userID)), email, ip, userAgent, success, code,
        )
        if err != nil {
                return fmt.Errorf("log_registration_event: %w", err)
        }
        return nil
}

// MarkReminderSent — SECT-REG-LINK-PHASE3-BACKEND-1
//
// Marque le flag "expiryReminderSent"=true sur un StudentSignupLink après envoi
// de l'email de reminder 24h par le worker. Idempotent : si appelé plusieurs fois
// (ex: retry worker), l'UPDATE est juste un no-op (valeur déjà true).
//
// Bypass RLS via pool.Exec direct (le worker tourne en system-worker — pas de
// claims utilisateur). La colonne expiryReminderSent n'est pas sensible (un flag
// booléen de dédoublonnage — pas une donnée métier). L'UPDATE ne peut pas être
// utilisé pour élever des privilèges.
func (r *StudentSignupLinkRepository) MarkReminderSent(ctx context.Context, linkID string) error {
        _, err := r.pool.Exec(ctx,
                `UPDATE "StudentSignupLink" SET "expiryReminderSent" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
                linkID)
        if err != nil {
                return fmt.Errorf("mark reminder sent: %w", err)
        }
        return nil
}

// strPtrOrNil retourne un *string nil si s est vide, sinon &s.
// Utilisé pour passer userID optionnel (vide si échec inscription) à la fonction SQL.
func strPtrOrNil(s string) *string {
        if s == "" {
                return nil
        }
        return &s
}
