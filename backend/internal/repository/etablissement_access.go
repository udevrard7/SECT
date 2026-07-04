// Package repository — implémentation EtablissementAccessRepository.
package repository

import (
        "context"
        "fmt"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// EtablissementAccessRepository implémente domain.EtablissementAccessRepository.
type EtablissementAccessRepository struct {
        pool *pgxpool.Pool
}

// NewEtablissementAccessRepository crée un nouveau repository.
func NewEtablissementAccessRepository(pool *pgxpool.Pool) *EtablissementAccessRepository {
        return &EtablissementAccessRepository{pool: pool}
}

const columnsAccess = `"id", "adminId", "etablissementId", "motif", "statut",
        "dateDebut", "dateFin", "approuvePar", "commentaire", "createdAt", "updatedAt"`

func scanAccess(s scanner) (*domain.EtablissementAccess, error) {
        a := &domain.EtablissementAccess{}
        err := s.Scan(
                &a.ID, &a.AdminID, &a.EtablissementID, &a.Motif, &a.Statut,
                &a.DateDebut, &a.DateFin, &a.ApprouvePar, &a.Commentaire,
                &a.CreatedAt, &a.UpdatedAt,
        )
        if err != nil {
                return nil, err
        }
        return a, nil
}

// FindByID récupère une demande d'accès par ID (RLS actif).
func (r *EtablissementAccessRepository) FindByID(ctx context.Context, id string) (*domain.EtablissementAccess, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var access *domain.EtablissementAccess
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "EtablissementAccess" WHERE "id" = $1`, columnsAccess), id)
                a, err := scanAccess(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "EtablissementAccess", ID: id}
                        }
                        return fmt.Errorf("query access: %w", err)
                }
                access = a
                return nil
        })
        if err != nil {
                return nil, err
        }
        return access, nil
}

// List liste les demandes d'accès (RLS natif).
//
// Après la migration 000040 (roles={public} sur les policies EtablissementAccess),
// RLS natif fonctionne correctement avec pgx + PgBouncer. Le repo utilise
// db.WithTx + claims user (comme avant le bypass system-worker).
//
// Le filtrage de sécurité est double :
//  1. RLS natif : la policy EtablissementAccess_select (roles=public) filtre
//     selon is_responsable() AND etablissementId = current_etablissement_id().
//  2. Clause WHERE manuelle : params.AdminID / params.EtablissementID (forcés
//     par le usecase) pour filtrer par admin ou établissement.
//
// ADMIN-INCONNU-FIX : la requête ne JOIN plus "User" directement. En production,
// le rôle de connexion Render n'a PAS BYPASSRLS (bonne pratique Neon) → RLS est
// actif sur "User" → la policy User_select filtre l'admin (etablissementId=NULL)
// quand c'est un RESPONSABLE qui interroge → LEFT JOIN renvoyait NULL →
// "Admin inconnu" côté frontend. Désormais, les données admin (name, email) sont
// récupérées séparément via fetchAdminRefs (bypass system-worker). La clause
// is_admin() AND "etablissementId" IS NULL AND role='ADMIN' de User_select
// autorise l'accès quand app.claims.role='ADMIN' (system-worker).
func (r *EtablissementAccessRepository) List(ctx context.Context, params domain.AccessListParams) ([]*domain.EtablissementAccess, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.EtablissementAccess
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if params.AdminID != "" {
                        where = append(where, fmt.Sprintf(`ea."adminId" = $%d`, argIdx))
                        args = append(args, params.AdminID)
                        argIdx++
                }
                if params.Statut != "" {
                        where = append(where, fmt.Sprintf(`ea."statut" = $%d`, argIdx))
                        args = append(args, params.Statut)
                        argIdx++
                }
                if params.EtablissementID != "" {
                        where = append(where, fmt.Sprintf(`ea."etablissementId" = $%d`, argIdx))
                        args = append(args, params.EtablissementID)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                // ADMIN-INCONNU-FIX : plus de LEFT JOIN "User" ici (RLS filtrait l'admin).
                // Les données admin sont récupérées via fetchAdminRefs ci-dessous.
                query := fmt.Sprintf(`
                        SELECT ea."id", ea."adminId", ea."etablissementId", ea."motif", ea."statut",
                               ea."dateDebut", ea."dateFin", ea."approuvePar", ea."commentaire",
                               ea."createdAt", ea."updatedAt",
                               e."id", e."nom"
                        FROM "EtablissementAccess" ea
                        LEFT JOIN "Etablissement" e ON e."id" = ea."etablissementId"
                        %s
                        ORDER BY ea."createdAt" DESC`, whereClause)
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query access list: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        a := &domain.EtablissementAccess{}
                        var etabID, etabNom *string
                        err := rows.Scan(
                                &a.ID, &a.AdminID, &a.EtablissementID, &a.Motif, &a.Statut,
                                &a.DateDebut, &a.DateFin, &a.ApprouvePar, &a.Commentaire,
                                &a.CreatedAt, &a.UpdatedAt,
                                &etabID, &etabNom,
                        )
                        if err != nil {
                                return fmt.Errorf("scan access: %w", err)
                        }
                        if etabID != nil && etabNom != nil {
                                a.Etablissement = &domain.EtablissementRef{
                                        ID:  *etabID,
                                        Nom: *etabNom,
                                }
                        }
                        result = append(result, a)
                }
                if err := rows.Err(); err != nil {
                        return fmt.Errorf("rows err: %w", err)
                }
                return nil
        })
        if err != nil {
                return nil, err
        }

        // ADMIN-INCONNU-FIX : récupérer les données admin (name, email) via une
        // transaction séparée avec claims system-worker. En production (Render),
        // le rôle de connexion n'a PAS BYPASSRLS → RLS actif sur "User" → la policy
        // User_select filtre l'admin (etablissementId=NULL) pour les RESPONSABLE.
        // Le bypass system-worker (app.claims.role='ADMIN') active la clause
        // is_admin() AND "etablissementId" IS NULL AND role='ADMIN' de User_select.
        // Sécurité : les données admin (name, email) ne sont pas sensibles — elles
        // servent uniquement à l'affichage. L'accès aux demandes lui-même reste
        // filtré par RLS natif (Query 1 ci-dessus).
        if len(result) > 0 {
                adminIDs := make(map[string]bool)
                for _, a := range result {
                        if a.AdminID != "" {
                                adminIDs[a.AdminID] = true
                        }
                }
                if len(adminIDs) > 0 {
                        adminRefs, err := r.fetchAdminRefs(ctx, adminIDs)
                        if err != nil {
                                return nil, fmt.Errorf("fetch admin refs: %w", err)
                        }
                        for _, a := range result {
                                if ref, ok := adminRefs[a.AdminID]; ok {
                                        a.Admin = ref
                                }
                        }
                }
        }

        return result, nil
}

// fetchAdminRefs récupère les références utilisateurs (id, name, email) pour
// un ensemble d'admin IDs, en contournant RLS via claims system-worker.
//
// ADMIN-INCONNU-FIX : utilisée par List pour résoudre le bug "Admin inconnu".
// La policy User_select filtre l'admin (etablissementId=NULL) quand c'est un
// RESPONSABLE qui interroge (RLS actif en production Render sans BYPASSRLS).
// Le bypass system-worker (app.claims.role='ADMIN') active la clause
// is_admin() AND "etablissementId" IS NULL AND role='ADMIN' → l'admin devient
// visible. Les données retournées (name, email) ne sont pas sensibles.
func (r *EtablissementAccessRepository) fetchAdminRefs(ctx context.Context, adminIDs map[string]bool) (map[string]*domain.UserRef, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // AUDIT-RLS-REPOS-001: standardized from raw set_config to db.SetClaimsTx
        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return nil, fmt.Errorf("set system claims: %w", err)
        }

        ids := make([]string, 0, len(adminIDs))
        for id := range adminIDs {
                ids = append(ids, id)
        }

        var placeholders []string
        var args []any
        for i, id := range ids {
                placeholders = append(placeholders, fmt.Sprintf("$%d", i+1))
                args = append(args, id)
        }

        query := fmt.Sprintf(`SELECT "id", "name", "email" FROM "User" WHERE "id" IN (%s)`, strings.Join(placeholders, ","))
        rows, err := tx.Query(ctx, query, args...)
        if err != nil {
                return nil, fmt.Errorf("query admin users: %w", err)
        }
        defer rows.Close()

        adminRefs := make(map[string]*domain.UserRef, len(ids))
        for rows.Next() {
                ref := &domain.UserRef{}
                if err := rows.Scan(&ref.ID, &ref.Name, &ref.Email); err != nil {
                        return nil, fmt.Errorf("scan admin user: %w", err)
                }
                adminRefs[ref.ID] = ref
        }
        if err := rows.Err(); err != nil {
                return nil, fmt.Errorf("rows err: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return adminRefs, nil
}

// Create crée une demande d'accès.
// ACCESS-RLS-FIX : pose les claims system-worker pour activer la policy modify_admin (is_system()).
func (r *EtablissementAccessRepository) Create(ctx context.Context, input domain.CreateAccessInput) (*domain.EtablissementAccess, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // AUDIT-RLS-REPOS-001: standardized from raw set_config to db.SetClaimsTx
        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return nil, fmt.Errorf("set system claims: %w", err)
        }

        id := uuid.NewString()
        row := tx.QueryRow(ctx, `
                INSERT INTO "EtablissementAccess" ("id", "adminId", "etablissementId", "motif", "statut",
                        "dateDebut", "dateFin", "approuvePar", "commentaire", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, 'EN_ATTENTE', $5, $6, NULL, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING `+columnsAccess,
                id, input.AdminID, input.EtablissementID, input.Motif,
                nullableTimePtr(input.DateDebut), nullableTimePtr(input.DateFin),
                nullableStrPtr(input.Commentaire))

        access, err := scanAccess(row)
        if err != nil {
                if isUniqueViolation(err) {
                        return nil, &domain.ConflictError{Message: "demande d'accès déjà existante pour cet admin et cet établissement"}
                }
                return nil, fmt.Errorf("create access: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return access, nil
}

// Update met à jour une demande d'accès (approuver/refuser/révoquer/annuler).
// B-8 (HIGH) : verrou optimiste — la clause WHERE inclut `statut = expectedStatut`.
// Si la ligne a changé de statut entre le FindByID (usecase) et l'Update
// (race condition : deux RESPONSABLEs approuvent simultanément), RowsAffected=0
// → ConflictError "concurrent modification".
// ACCESS-RLS-FIX : pose les claims system-worker pour activer la policy modify_admin (is_system()).
func (r *EtablissementAccessRepository) Update(ctx context.Context, id string, expectedStatut domain.AccessStatut, input domain.UpdateAccessInput) (*domain.EtablissementAccess, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // AUDIT-RLS-REPOS-001: standardized from raw set_config to db.SetClaimsTx
        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return nil, fmt.Errorf("set system claims: %w", err)
        }

        var setClauses []string
        var args []any
        argIdx := 1

        addSet := func(col string, val any) {
                setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
                args = append(args, val)
                argIdx++
        }

        addSet("statut", string(input.Statut))
        if input.ApprouvePar != nil {
                addSet("approuvePar", *input.ApprouvePar)
        }
        if input.Commentaire != nil {
                addSet("commentaire", *input.Commentaire)
        }
        if input.DateDebut != nil {
                addSet("dateDebut", nullableTimePtr(input.DateDebut))
        }
        if input.DateFin != nil {
                addSet("dateFin", nullableTimePtr(input.DateFin))
        }
        setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)

        // B-8 : verrou optimiste — WHERE id = $N AND statut = $N+1
        args = append(args, id, string(expectedStatut))
        updateSQL := fmt.Sprintf(`UPDATE "EtablissementAccess" SET %s WHERE "id" = $%d AND "statut" = $%d RETURNING %s`,
                strings.Join(setClauses, ", "), argIdx, argIdx+1, columnsAccess)

        row := tx.QueryRow(ctx, updateSQL, args...)
        access, err := scanAccess(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        // B-8 : la ligne n'existe pas OU son statut a changé entre le FindByID
                        // et l'Update (race condition). On retourne ConflictError pour que le
                        // frontend affiche un message actionnable plutôt qu'un 404 trompeur.
                        return nil, &domain.ConflictError{Message: "la demande a été modifiée par un autre utilisateur, rafraîchissez la page"}
                }
                return nil, fmt.Errorf("update access: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return access, nil
}

// CheckAccess vérifie si un admin a un accès APPROUVE valide.
// ACCESS-RLS-FIX : pose les claims system-worker au début de la transaction pour
// activer la policy EtablissementAccess_select (is_system()). Sans cela, avec le rôle
// sect_app (NOBYPASSRLS, RLS forced), is_admin() retourne NULL → aucune ligne visible.
func (r *EtablissementAccessRepository) CheckAccess(ctx context.Context, adminID, etablissementID string) (*domain.EtablissementAccess, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // Pose les claims system-worker pour activer la policy RLS is_system().
        // AUDIT-RLS-REPOS-001: standardized from raw set_config to db.SetClaimsTx
        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return nil, fmt.Errorf("set system claims: %w", err)
        }

        row := tx.QueryRow(ctx, `
                SELECT `+columnsAccess+` FROM "EtablissementAccess"
                WHERE "adminId" = $1 AND "etablissementId" = $2 AND "statut" = 'APPROUVE'
                  AND ("dateDebut" IS NULL OR "dateDebut" <= CURRENT_TIMESTAMP)
                  AND ("dateFin" IS NULL OR "dateFin" >= CURRENT_TIMESTAMP)
                ORDER BY "createdAt" DESC LIMIT 1
        `, adminID, etablissementID)

        access, err := scanAccess(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, nil // pas d'accès — retourne nil sans erreur
                }
                return nil, fmt.Errorf("check access: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return access, nil
}

// Delete supprime une demande d'accès par son ID (hard-delete).
//
// OPTION B (sécurité) : les demandes annulées (EN_ATTENTE) ou révoquées/refusées
// (REFUSE) sont HARD-DELETED de la table EtablissementAccess pour minimiser la
// surface d'attaque et respecter le principe de minimisation des données.
//
// AUDIT TRAIL : si auditEntry est non-nil, une entrée est insérée dans la table
// AuditLog DANS LA MÊME TRANSACTION que le DELETE (atomicité garantie). Utilisé
// pour les RÉVOCATIONS (APPROUVE → REFUSE) afin de conserver la trace
// "qui avait accès, quand, révoqué par qui, pour quelle raison". Les annulations
// (EN_ATTENTE → hard-delete) et refus (EN_ATTENTE → REFUSE → hard-delete) ne
// sont pas loggées car elles ne concernent que des demandes sans accès effectif.
//
// ACCESS-RLS-FIX : pose les claims system-worker pour activer la policy modify_admin (is_system()).
// La table AuditLog a une policy INSERT WITH CHECK(true) → l'insertion est autorisée
// sans bypass RLS supplémentaire.
func (r *EtablissementAccessRepository) Delete(ctx context.Context, id string, auditEntry *domain.AccessAuditEntry) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // AUDIT-RLS-REPOS-001: standardized from raw set_config to db.SetClaimsTx
        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return fmt.Errorf("set system claims: %w", err)
        }

        // Option B : insérer l'audit trail AVANT le hard-delete (même transaction).
        // Si l'INSERT échoue, le DELETE n'aura pas lieu → atomicité garantie.
        if auditEntry != nil {
                auditID := uuid.NewString()
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "AuditLog" ("id", "userId", "userEmail", "action", "entite", "entiteId", "details", "adresseIp", "createdAt")
                        VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                `,
                        auditID, nullableStrPtr(auditEntry.ActorUserID),
                        auditEntry.Action, "EtablissementAccess", nullableStrPtr(auditEntry.AccessID),
                        auditEntry.DetailsJSON, auditEntry.ActorIP,
                ); err != nil {
                        return fmt.Errorf("insert audit log: %w", err)
                }
        }

        tag, err := tx.Exec(ctx, `DELETE FROM "EtablissementAccess" WHERE "id" = $1`, id)
        if err != nil {
                return fmt.Errorf("delete access: %w", err)
        }
        if tag.RowsAffected() == 0 {
                return &domain.NotFoundError{Entity: "EtablissementAccess", ID: id}
        }

        if err := tx.Commit(ctx); err != nil {
                return fmt.Errorf("commit: %w", err)
        }
        return nil
}

// ListAuthorizedEtablissements retourne les établissements autorisés pour un admin.
//
// ACCESS-RLS-FIX : pose les claims system-worker au début de la transaction pour
// activer la policy EtablissementAccess_select (is_system()). Sans cela, avec le rôle
// sect_app (NOBYPASSRLS, RLS forced), is_admin() retourne NULL → aucune ligne visible.
//
// BUGFIX (ADMIN-AUDIT-4b) : sélectionne aussi les colonnes d'accès (a.id,
// a.motif, a.dateDebut, a.dateFin, a.commentaire, a.createdAt) et peupler
// `etab.Access` pour que le frontend puisse afficher `etab.access.dateFin`
// sans crash. Avant, l'API ne renvoyait que l'établissement → le frontend
// accédait à `etab.access.dateFin` sur undefined → TypeError.
func (r *EtablissementAccessRepository) ListAuthorizedEtablissements(ctx context.Context, adminID string) ([]*domain.Etablissement, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // Pose les claims system-worker pour activer la policy RLS is_system().
        // AUDIT-RLS-REPOS-001: standardized from raw set_config to db.SetClaimsTx
        if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
                return nil, fmt.Errorf("set system claims: %w", err)
        }

        // Join EtablissementAccess (APPROUVE, dates valides) + Etablissement
        // Colonnes préfixées avec e. pour éviter l'ambiguïté
        const colsE = `e."id", e."nom", e."type", e."ville", e."pays", e."adresse", e."telephone", e."email",
                e."siteWeb", e."logo", e."actif", e."exempleMatricule", e."formatMatricule", e."regexMatricule",
                e."certWatermarkText", e."certWatermarkEnabled", e."certWatermarkOpacity", e."certWatermarkColor",
                e."certWatermarkPattern", e."createdAt", e."updatedAt"`

        rows, err := tx.Query(ctx, fmt.Sprintf(`
                SELECT %s,
                       a."id", a."motif", a."dateDebut", a."dateFin", a."commentaire", a."createdAt"
                FROM "EtablissementAccess" a
                JOIN "Etablissement" e ON e."id" = a."etablissementId"
                WHERE a."adminId" = $1 AND a."statut" = 'APPROUVE'
                  AND (a."dateDebut" IS NULL OR a."dateDebut" <= CURRENT_TIMESTAMP)
                  AND (a."dateFin" IS NULL OR a."dateFin" >= CURRENT_TIMESTAMP)
                  AND e."actif" = true
                ORDER BY e."nom"
        `, colsE), adminID)
        if err != nil {
                return nil, fmt.Errorf("query authorized etablissements: %w", err)
        }
        defer rows.Close()

        var result []*domain.Etablissement
        for rows.Next() {
                // Scan inline (scanEtablissement ne permet pas d'ajouter des colonnes
                // supplémentaires — il consomme tout le row via son Scan interne).
                e := &domain.Etablissement{}
                acc := &domain.AccessSummary{}
                err := rows.Scan(
                        &e.ID, &e.Nom, &e.Type, &e.Ville, &e.Pays, &e.Adresse, &e.Telephone,
                        &e.Email, &e.SiteWeb, &e.Logo, &e.Actif,
                        &e.ExempleMatricule, &e.FormatMatricule, &e.RegexMatricule,
                        &e.CertWatermarkText, &e.CertWatermarkEnabled, &e.CertWatermarkOpacity,
                        &e.CertWatermarkColor, &e.CertWatermarkPattern,
                        &e.CreatedAt, &e.UpdatedAt,
                        &acc.ID, &acc.Motif, &acc.DateDebut, &acc.DateFin, &acc.Commentaire, &acc.CreatedAt,
                )
                if err != nil {
                        return nil, fmt.Errorf("scan etablissement+access: %w", err)
                }
                e.Access = acc
                result = append(result, e)
        }
        // Retourner un slice vide plutôt que nil pour la sérialisation JSON
        if result == nil {
                result = []*domain.Etablissement{}
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return result, nil
}

// nullableTimePtr convertit un *time.Time en any pour pgx.
func nullableTimePtr(t *time.Time) any {
        if t == nil {
                return nil
        }
        return *t
}
