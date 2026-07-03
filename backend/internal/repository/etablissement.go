// Package repository — implémentation EtablissementRepository.
package repository

import (
        "context"
        "fmt"
        "strings"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// EtablissementRepository implémente domain.EtablissementRepository.
type EtablissementRepository struct {
        pool *pgxpool.Pool
}

// NewEtablissementRepository crée un nouveau EtablissementRepository.
func NewEtablissementRepository(pool *pgxpool.Pool) *EtablissementRepository {
        return &EtablissementRepository{pool: pool}
}

// columnsEtab liste les colonnes de l'établissement dans l'ordre de scanEtablissement.
const columnsEtab = `"id", "nom", "type", "ville", "pays", "adresse", "telephone", "email",
        "siteWeb", "logo", "actif", "exempleMatricule", "formatMatricule", "regexMatricule",
        "certWatermarkText", "certWatermarkEnabled", "certWatermarkOpacity", "certWatermarkColor",
        "certWatermarkPattern", "anneeAcademiqueCouranteId", "createdAt", "updatedAt"`

// FindByID récupère un établissement par ID (RLS actif).
//
// BUGFIX (ADMIN-AUDIT-2) : inclut désormais la liste des filières (`filieres`)
// et l'objet `_count` pour permettre au frontend detail d'afficher
// `detailEtab.filieres.map(...)` sans crash. Avant, `filieres` était toujours
// absent → `detailEtab.filieres` undefined → crash si le frontend itère dessus.
func (r *EtablissementRepository) FindByID(ctx context.Context, id string) (*domain.Etablissement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var etab *domain.Etablissement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Etablissement" WHERE "id" = $1`, columnsEtab), id)
                e, err := scanEtablissement(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Etablissement", ID: id}
                        }
                        return fmt.Errorf("query etablissement: %w", err)
                }
                etab = e

                // 2e requête : filières de l'établissement (pour le détail).
                rows, err := tx.Query(ctx, `SELECT "id", "nom", "code" FROM "Filiere" WHERE "etablissementId" = $1 ORDER BY "nom"`, id)
                if err != nil {
                        return fmt.Errorf("query filieres: %w", err)
                }
                defer rows.Close()
                for rows.Next() {
                        f := &domain.FiliereRef{}
                        var code *string
                        if err := rows.Scan(&f.ID, &f.Nom, &code); err != nil {
                                return fmt.Errorf("scan filiere: %w", err)
                        }
                        if code != nil {
                                f.Code = *code
                        }
                        etab.Filieres = append(etab.Filieres, f)
                }
                // _count filieres/users pour cohérence avec List
                var cf, cu int
                _ = tx.QueryRow(ctx, `SELECT count(*) FROM "Filiere" WHERE "etablissementId" = $1`, id).Scan(&cf)
                _ = tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE "etablissementId" = $1`, id).Scan(&cu)
                etab.Count = &domain.EtablissementCount{Filieres: cf, Users: cu}
                return nil
        })
        if err != nil {
                return nil, err
        }
        return etab, nil
}

// List liste les établissements (RLS filtre — ADMIN voit ceux avec accès, RESPONSABLE voit le sien).
//
// BUGFIX (ADMIN-AUDIT-2) : ajoute 2 subqueries pour peupler `_count.filieres`
// et `_count.users` (style Prisma) attendus par le frontend. Avant ce fix, le
// frontend accédait à `etab._count.filieres` sur un nombre plat (ou undefined)
// → crash TypeError de la page /etablissements.
func (r *EtablissementRepository) List(ctx context.Context, params domain.EtablissementListParams) ([]*domain.Etablissement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.Etablissement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if params.Search != "" {
                        // BUGFIX (SESSIONS-SEARCH-1) : Simple Protocol ne supporte pas
                        // les placeholders réutilisés. 3 placeholders distincts + 3 args.
                        where = append(where, fmt.Sprintf(`("Etablissement"."nom" ILIKE $%d OR "Etablissement"."ville" ILIKE $%d OR "Etablissement"."email" ILIKE $%d)`, argIdx, argIdx+1, argIdx+2))
                        args = append(args, "%"+params.Search+"%")
                        args = append(args, "%"+params.Search+"%")
                        args = append(args, "%"+params.Search+"%")
                        argIdx += 3
                }
                if params.Type != "" {
                        where = append(where, fmt.Sprintf(`"Etablissement"."type" = $%d`, argIdx))
                        args = append(args, params.Type)
                        argIdx++
                }
                if params.Actif != nil {
                        where = append(where, fmt.Sprintf(`"Etablissement"."actif" = $%d`, argIdx))
                        args = append(args, *params.Actif)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                // Subqueries scalaires pour _count (évite N+1 ; une seule passe par ligne).
                query := fmt.Sprintf(`
                        SELECT %s,
                                (SELECT count(*) FROM "Filiere" f WHERE f."etablissementId" = "Etablissement"."id") AS count_filieres,
                                (SELECT count(*) FROM "User" u WHERE u."etablissementId" = "Etablissement"."id") AS count_users
                        FROM "Etablissement"
                        %s
                        ORDER BY "Etablissement"."nom"`, columnsEtab, whereClause)
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query etablissements: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        e := &domain.Etablissement{}
                        var countFilieres, countUsers int
                        err := rows.Scan(
                                &e.ID, &e.Nom, &e.Type, &e.Ville, &e.Pays, &e.Adresse, &e.Telephone,
                                &e.Email, &e.SiteWeb, &e.Logo, &e.Actif,
                                &e.ExempleMatricule, &e.FormatMatricule, &e.RegexMatricule,
                                &e.CertWatermarkText, &e.CertWatermarkEnabled, &e.CertWatermarkOpacity,
                                &e.CertWatermarkColor, &e.CertWatermarkPattern,
                                &e.AnneeAcademiqueCouranteID,
                                &e.CreatedAt, &e.UpdatedAt,
                                &countFilieres, &countUsers,
                        )
                        if err != nil {
                                return fmt.Errorf("scan etablissement: %w", err)
                        }
                        e.Count = &domain.EtablissementCount{
                                Filieres: countFilieres,
                                Users:    countUsers,
                        }
                        result = append(result, e)
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// Create crée un établissement (ADMIN only — bypass RLS).
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx via
// r.pool.BeginTx SANS SetClaimsTx → claims NULL → policy Etablissement_modify
// (is_admin() OU is_responsable()) voyait NULL → l'INSERT était rejeté. Or la
// signature Create est ADMIN-only, et is_admin() lit app.claims.role qui était
// NULL → échec silencieux. Fix : db.WithTx avec claims du context (pose les
// app.claims.* via SetClaimsTx avant d'appeler CreateInTx qui fait l'INSERT).
func (r *EtablissementRepository) Create(ctx context.Context, input domain.CreateEtablissementInput) (*domain.Etablissement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("Create: claims manquants dans le context")
        }

        var etab *domain.Etablissement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                e, err := r.CreateInTx(ctx, tx, input)
                if err != nil {
                        return err
                }
                etab = e
                return nil
        })
        if err != nil {
                return nil, err
        }
        return etab, nil
}

// CreateInTx insère un établissement dans une transaction existante.
// ABONNEMENTS-FIX-A3 : extrait de Create pour permettre au usecase de faire
// une transaction atomique (étab + responsable + abonnement). Le caller gère
// begin/commit/rollback et pose les claims JWT via db.WithTx (RLS actif).
func (r *EtablissementRepository) CreateInTx(ctx context.Context, tx pgx.Tx, input domain.CreateEtablissementInput) (*domain.Etablissement, error) {
        id := uuid.NewString()
        pays := "Côte d'Ivoire"
        if input.Pays != nil && *input.Pays != "" {
                pays = *input.Pays
        }
        actif := true
        if input.Actif != nil {
                actif = *input.Actif
        }

        row := tx.QueryRow(ctx, `
                INSERT INTO "Etablissement" ("id", "nom", "type", "ville", "pays", "adresse", "telephone",
                        "email", "siteWeb", "logo", "actif", "exempleMatricule", "formatMatricule", "regexMatricule",
                        "certWatermarkText", "certWatermarkEnabled", "certWatermarkOpacity", "certWatermarkColor",
                        "certWatermarkPattern", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12, $13,
                        'ORIGINAL', true, 0.04, '#1B3A5C', 'diamond', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING `+columnsEtab,
                id, input.Nom, nullableStrPtr(input.Type), nullableStrPtr(input.Ville), pays,
                nullableStrPtr(input.Adresse), nullableStrPtr(input.Telephone), nullableStrPtr(input.Email),
                nullableStrPtr(input.SiteWeb), actif,
                nullableStrPtr(input.ExempleMatricule), nullableStrPtr(input.FormatMatricule), nullableStrPtr(input.RegexMatricule))

        etab, err := scanEtablissement(row)
        if err != nil {
                if isUniqueViolation(err) {
                        return nil, &domain.ConflictError{Message: "nom d'établissement déjà utilisé"}
                }
                return nil, fmt.Errorf("create etablissement: %w", err)
        }
        return etab, nil
}

// Update met à jour un établissement (partial update). Bypass RLS (RESPONSABLE limité par usecase).
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx SANS
// SetClaimsTx → claims NULL → policy Etablissement_modify_responsable
// (is_responsable() AND id = current_etablissement_id()) voyait NULL →
// 0 rows → NotFoundError même pour un responsable légitime.
// Fix : db.WithTx avec claims du context.
func (r *EtablissementRepository) Update(ctx context.Context, id string, input domain.UpdateEtablissementInput) (*domain.Etablissement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("Update: claims manquants dans le context")
        }

        var etab *domain.Etablissement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var setClauses []string
                var args []any
                argIdx := 1

                addSet := func(col string, val any) {
                        setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
                        args = append(args, val)
                        argIdx++
                }

                if input.Nom != nil {
                        addSet("nom", *input.Nom)
                }
                if input.Type != nil {
                        addSet("type", nullableStrPtr(input.Type))
                }
                if input.Ville != nil {
                        addSet("ville", nullableStrPtr(input.Ville))
                }
                if input.Pays != nil {
                        addSet("pays", *input.Pays)
                }
                if input.Adresse != nil {
                        addSet("adresse", nullableStrPtr(input.Adresse))
                }
                if input.Telephone != nil {
                        addSet("telephone", nullableStrPtr(input.Telephone))
                }
                if input.Email != nil {
                        addSet("email", nullableStrPtr(input.Email))
                }
                if input.SiteWeb != nil {
                        addSet("siteWeb", nullableStrPtr(input.SiteWeb))
                }
                // E5 (HIGH) : le champ Logo n'est plus dans UpdateEtablissementInput.
                // Le logo doit passer par /upload-logo (MIME check + 2MB limit).
                if input.Actif != nil {
                        addSet("actif", *input.Actif)
                }
                if input.FormatMatricule != nil {
                        addSet("formatMatricule", nullableStrPtr(input.FormatMatricule))
                }
                if input.ExempleMatricule != nil {
                        addSet("exempleMatricule", nullableStrPtr(input.ExempleMatricule))
                }
                if input.RegexMatricule != nil {
                        addSet("regexMatricule", nullableStrPtr(input.RegexMatricule))
                }

                if len(setClauses) == 0 {
                        row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Etablissement" WHERE "id" = $1`, columnsEtab), id)
                        e, err := scanEtablissement(row)
                        if err != nil {
                                if err == pgx.ErrNoRows {
                                        return &domain.NotFoundError{Entity: "Etablissement", ID: id}
                                }
                                return err
                        }
                        etab = e
                        return nil
                }

                setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
                args = append(args, id)

                updateSQL := fmt.Sprintf(`UPDATE "Etablissement" SET %s WHERE "id" = $%d RETURNING %s`,
                        strings.Join(setClauses, ", "), argIdx, columnsEtab)

                row := tx.QueryRow(ctx, updateSQL, args...)
                e, err := scanEtablissement(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Etablissement", ID: id}
                        }
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "nom d'établissement déjà utilisé"}
                        }
                        return fmt.Errorf("update etablissement: %w", err)
                }
                etab = e
                return nil
        })
        if err != nil {
                return nil, err
        }
        return etab, nil
}

// UpdateLogo met à jour le logo (data URL base64).
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx SANS
// SetClaimsTx → claims NULL → policy Etablissement_modify_responsable voyait
// NULL → 0 rows → NotFoundError. Fix : db.WithTx avec claims du context.
func (r *EtablissementRepository) UpdateLogo(ctx context.Context, id string, logoData string) (*domain.Etablissement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("UpdateLogo: claims manquants dans le context")
        }

        var etab *domain.Etablissement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        UPDATE "Etablissement" SET "logo" = $2, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1 RETURNING `+columnsEtab, id, logoData)

                e, err := scanEtablissement(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Etablissement", ID: id}
                        }
                        return fmt.Errorf("update logo: %w", err)
                }
                etab = e
                return nil
        })
        if err != nil {
                return nil, err
        }
        return etab, nil
}

// ClearLogo supprime le logo (SET "logo" = NULL). Distinct d'UpdateLogo qui
// exige une data URL valide. Le champ Logo étant *string côté domaine, NULL
// en DB → nil côté Go → logo: null en JSON (le frontend affiche la zone
// d'upload au lieu de l'image).
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx SANS
// SetClaimsTx → claims NULL → policy Etablissement_modify_responsable voyait
// NULL → 0 rows → NotFoundError. Fix : db.WithTx avec claims du context.
func (r *EtablissementRepository) ClearLogo(ctx context.Context, id string) (*domain.Etablissement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ClearLogo: claims manquants dans le context")
        }

        var etab *domain.Etablissement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        UPDATE "Etablissement" SET "logo" = NULL, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1 RETURNING `+columnsEtab, id)

                e, err := scanEtablissement(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Etablissement", ID: id}
                        }
                        return fmt.Errorf("clear logo: %w", err)
                }
                etab = e
                return nil
        })
        if err != nil {
                return nil, err
        }
        return etab, nil
}

// SetCurrentAnnee définit l'année académique courante d'un établissement.
// Migration 000017 : anneeAcademiqueCouranteId FK nullable vers AnneeAcademique.
// Valide que l'année appartient bien à l'établissement (clause WHERE sur
// l'existence d'une ligne AnneeAcademique avec id=anneeID ET etablissementId).
// RLS actif — filtrage par claims JWT posés via db.WithTx (rôle sect_app NOBYPASSRLS).
//
// BUGFIX (AUDIT-RLS-REPOS-001) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy Etablissement_modify_responsable
// (is_responsable() AND id = current_etablissement_id()) voyait NULL →
// 0 rows → NotFoundError même pour un responsable légitime. Alignement du
// code sur le commentaire (db.WithTx avec claims).
func (r *EtablissementRepository) SetCurrentAnnee(ctx context.Context, etablissementID, anneeID string) (*domain.Etablissement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("SetCurrentAnnee: claims manquants dans le context")
        }

        var etab *domain.Etablissement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // UPDATE avec clause d'appartenance : 0 ligne affectée si l'année n'existe
                // pas ou n'appartient pas à l'établissement → NotFoundError ou Unauthorized.
                row := tx.QueryRow(ctx, `
                        UPDATE "Etablissement" SET "anneeAcademiqueCouranteId" = $2, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1
                          AND EXISTS (SELECT 1 FROM "AnneeAcademique" a WHERE a."id" = $2 AND a."etablissementId" = $1)
                        RETURNING `+columnsEtab, etablissementID, anneeID)

                e, err := scanEtablissement(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                // Soit l'établissement n'existe pas, soit l'année ne lui appartient pas.
                                // On distingue les deux cas pour un message d'erreur clair.
                                var exists int
                                _ = tx.QueryRow(ctx, `SELECT 1 FROM "Etablissement" WHERE "id" = $1`, etablissementID).Scan(&exists)
                                if exists == 0 {
                                        return &domain.NotFoundError{Entity: "Etablissement", ID: etablissementID}
                                }
                                return &domain.UnauthorizedError{Message: "l'année académique n'appartient pas à cet établissement"}
                        }
                        return fmt.Errorf("set current annee: %w", err)
                }
                etab = e
                return nil
        })
        if err != nil {
                return nil, err
        }
        return etab, nil
}

// GetCurrentAnnee récupère l'année académique courante d'un établissement
// (objet enrichi AnneeAcademiqueRef avec libelle + dates + actif).
// Retourne (nil, nil) si aucune année courante n'est définie.
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code utilisait r.pool.QueryRow
// directement (sans tx, sans claims) → claims NULL → policy Etablissement_select
// (is_admin() OR is_responsable() OR is_system()) voyait NULL → 0 row →
// retournait (nil, nil) même si une année courante était définie. Fix : db.WithTx
// avec claims du context.
func (r *EtablissementRepository) GetCurrentAnnee(ctx context.Context, etablissementID string) (*domain.AnneeAcademiqueRef, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("GetCurrentAnnee: claims manquants dans le context")
        }

        var refPtr *domain.AnneeAcademiqueRef
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var ref domain.AnneeAcademiqueRef
                err := tx.QueryRow(ctx, `
                        SELECT a."id", a."libelle", a."dateDebut", a."dateFin", a."actif"
                        FROM "Etablissement" e
                        JOIN "AnneeAcademique" a ON a."id" = e."anneeAcademiqueCouranteId"
                        WHERE e."id" = $1`, etablissementID).Scan(
                        &ref.ID, &ref.Libelle, &ref.DateDebut, &ref.DateFin, &ref.Actif,
                )
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return nil // pas d'année courante définie → (nil, nil)
                        }
                        return fmt.Errorf("get current annee: %w", err)
                }
                refPtr = &ref
                return nil
        })
        if err != nil {
                return nil, err
        }
        return refPtr, nil
}

// UpdateWatermark met à jour la config watermark.
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx SANS
// SetClaimsTx → claims NULL → policy Etablissement_modify_responsable voyait
// NULL → 0 rows → NotFoundError. Fix : db.WithTx avec claims du context.
func (r *EtablissementRepository) UpdateWatermark(ctx context.Context, id string, cfg domain.WatermarkConfig) (*domain.Etablissement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("UpdateWatermark: claims manquants dans le context")
        }

        var etab *domain.Etablissement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        UPDATE "Etablissement"
                        SET "certWatermarkText" = $2, "certWatermarkEnabled" = $3, "certWatermarkOpacity" = $4,
                            "certWatermarkColor" = $5, "certWatermarkPattern" = $6, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1 RETURNING `+columnsEtab,
                        id, cfg.CertWatermarkText, cfg.CertWatermarkEnabled, cfg.CertWatermarkOpacity,
                        cfg.CertWatermarkColor, cfg.CertWatermarkPattern)

                e, err := scanEtablissement(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Etablissement", ID: id}
                        }
                        return fmt.Errorf("update watermark: %w", err)
                }
                etab = e
                return nil
        })
        if err != nil {
                return nil, err
        }
        return etab, nil
}

// GetWatermark récupère uniquement la config watermark.
func (r *EtablissementRepository) GetWatermark(ctx context.Context, id string) (*domain.WatermarkConfig, error) {
        etab, err := r.FindByID(ctx, id)
        if err != nil {
                return nil, err
        }
        cfg := &domain.WatermarkConfig{
                CertWatermarkEnabled: etab.CertWatermarkEnabled,
                CertWatermarkOpacity: etab.CertWatermarkOpacity,
        }
        if etab.CertWatermarkText != nil {
                cfg.CertWatermarkText = *etab.CertWatermarkText
        }
        if etab.CertWatermarkColor != nil {
                cfg.CertWatermarkColor = *etab.CertWatermarkColor
        }
        if etab.CertWatermarkPattern != nil {
                cfg.CertWatermarkPattern = *etab.CertWatermarkPattern
        }
        return cfg, nil
}

// Delete supprime un établissement (ADMIN only).
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx SANS
// SetClaimsTx → claims NULL → policy Etablissement_modify (is_admin()) voyait
// NULL → 0 row → NotFoundError. Fix : db.WithTx avec claims du context.
func (r *EtablissementRepository) Delete(ctx context.Context, id string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return fmt.Errorf("Delete: claims manquants dans le context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // Vérifier existence
                var exists bool
                err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Etablissement" WHERE "id" = $1)`, id).Scan(&exists)
                if err != nil {
                        return fmt.Errorf("check exists: %w", err)
                }
                if !exists {
                        return &domain.NotFoundError{Entity: "Etablissement", ID: id}
                }

                // Delete (cascade selon schéma — EtablissementAccess, etc.)
                _, err = tx.Exec(ctx, `DELETE FROM "Etablissement" WHERE "id" = $1`, id)
                if err != nil {
                        return fmt.Errorf("delete etablissement: %w", err)
                }
                return nil
        })
}

// scanEtablissement scan une ligne Etablissement.
func scanEtablissement(s scanner) (*domain.Etablissement, error) {
        e := &domain.Etablissement{}
        err := s.Scan(
                &e.ID, &e.Nom, &e.Type, &e.Ville, &e.Pays, &e.Adresse, &e.Telephone,
                &e.Email, &e.SiteWeb, &e.Logo, &e.Actif,
                &e.ExempleMatricule, &e.FormatMatricule, &e.RegexMatricule,
                &e.CertWatermarkText, &e.CertWatermarkEnabled, &e.CertWatermarkOpacity,
                &e.CertWatermarkColor, &e.CertWatermarkPattern,
                &e.AnneeAcademiqueCouranteID,
                &e.CreatedAt, &e.UpdatedAt,
        )
        if err != nil {
                return nil, err
        }
        return e, nil
}
