// Package repository — implémentation UERepository, EnseignantFiliereRepository, AnneeAcademiqueRepository.
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

// ============================================================
// UNITE ENSEIGNEMENT
// ============================================================

// UERepository implémente domain.UERepository.
type UERepository struct {
        pool *pgxpool.Pool
}

// NewUERepository crée un nouveau UERepository.
func NewUERepository(pool *pgxpool.Pool) *UERepository {
        return &UERepository{pool: pool}
}

const columnsUE = `"id", "code", "nom", "description", "filiereId", "niveau", "niveaux",
        "semestre", "creditsECTS", "volumeHeuresCM", "volumeHeuresTD", "volumeHeuresTP",
        "obligatoire", "actif", "createdAt", "updatedAt"`

// columnsUEQualified : mêmes colonnes que columnsUE mais qualifiées avec le
// nom de table, pour éviter l'ambiguïté lors d'un JOIN (ex. avec "Filiere"
// qui possède aussi "id", "nom", "code"). Utilisé par List (ENS-AUDIT-2).
const columnsUEQualified = `"UniteEnseignement"."id", "UniteEnseignement"."code", "UniteEnseignement"."nom", "UniteEnseignement"."description", "UniteEnseignement"."filiereId", "UniteEnseignement"."niveau", "UniteEnseignement"."niveaux",
        "UniteEnseignement"."semestre", "UniteEnseignement"."creditsECTS", "UniteEnseignement"."volumeHeuresCM", "UniteEnseignement"."volumeHeuresTD", "UniteEnseignement"."volumeHeuresTP",
        "UniteEnseignement"."obligatoire", "UniteEnseignement"."actif", "UniteEnseignement"."createdAt", "UniteEnseignement"."updatedAt"`

// derefStr retourne la valeur pointée ou "" si nil (helper local au package).
func derefStr(p *string) string {
        if p == nil {
                return ""
        }
        return *p
}

// derefFloat retourne la valeur pointée ou 0 si nil (helper local au package).
func derefFloat(f *float64) float64 {
        if f == nil {
                return 0
        }
        return *f
}

func scanUE(s scanner) (*domain.UniteEnseignement, error) {
        u := &domain.UniteEnseignement{}
        err := s.Scan(
                &u.ID, &u.Code, &u.Nom, &u.Description, &u.FiliereID, &u.Niveau, &u.Niveaux,
                &u.Semestre, &u.CreditsECTS, &u.VolumeHeuresCM, &u.VolumeHeuresTD, &u.VolumeHeuresTP,
                &u.Obligatoire, &u.Actif, &u.CreatedAt, &u.UpdatedAt,
        )
        if err != nil {
                return nil, err
        }
        return u, nil
}

// FindByID récupère une UE par ID (RLS actif).
func (r *UERepository) FindByID(ctx context.Context, id string) (*domain.UniteEnseignement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var ue *domain.UniteEnseignement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // BUGFIX (PROG-ACAD-1) : LEFT JOIN Filiere + subquery _count +
                // affectations pour la page /programme-academique (gestion des UEs).
                // Avant, FindByID retournait un UE bare (Filiere=nil, pas de _count,
                // pas d'affectations) → crash frontend sur ue.filiere.nom,
                // ue._count.affectations, ue.affectations.
                row := tx.QueryRow(ctx, fmt.Sprintf(`
                        SELECT %s, f."id", f."nom", f."code",
                               (SELECT count(*) FROM "Affectation" a WHERE a."uniteEnseignementId" = "UniteEnseignement"."id")
                        FROM "UniteEnseignement"
                        LEFT JOIN "Filiere" f ON f."id" = "UniteEnseignement"."filiereId"
                        WHERE "UniteEnseignement"."id" = $1
                `, columnsUEQualified), id)
                u := &domain.UniteEnseignement{}
                var filID, filNom *string
                var filCode *string
                var affCount int
                err := row.Scan(
                        &u.ID, &u.Code, &u.Nom, &u.Description, &u.FiliereID, &u.Niveau, &u.Niveaux,
                        &u.Semestre, &u.CreditsECTS, &u.VolumeHeuresCM, &u.VolumeHeuresTD, &u.VolumeHeuresTP,
                        &u.Obligatoire, &u.Actif, &u.CreatedAt, &u.UpdatedAt,
                        &filID, &filNom, &filCode, &affCount,
                )
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "UniteEnseignement", ID: id}
                        }
                        return fmt.Errorf("query ue: %w", err)
                }
                if filID != nil && filNom != nil {
                        u.Filiere = &domain.FiliereRef{
                                ID:   *filID,
                                Nom:  *filNom,
                                Code: derefStr(filCode),
                        }
                }
                u.Count = &domain.UECount{Affectations: affCount}
                u.Affectations = []domain.AffectationRef{}

                // Charger les affectations de cette UE (enseignant↔UE)
                affRows, err := tx.Query(ctx, `
                        SELECT a."id", a."enseignantId", a."typeSeance", a."groupe",
                               a."volumeHeures", a."anneeUniversitaire", a."statut", a."commentaire",
                               u."id", u."name", u."email"
                        FROM "Affectation" a
                        LEFT JOIN "User" u ON u."id" = a."enseignantId"
                        WHERE a."uniteEnseignementId" = $1
                        ORDER BY a."createdAt" DESC
                `, id)
                if err == nil {
                        defer affRows.Close()
                        for affRows.Next() {
                                aff := domain.AffectationRef{}
                                var ensID, ensName, ensEmail *string
                                if err := affRows.Scan(&aff.ID, &aff.EnseignantID, &aff.TypeSeance, &aff.Groupe,
                                        &aff.VolumeHeures, &aff.AnneeUniversitaire, &aff.Statut, &aff.Commentaire,
                                        &ensID, &ensName, &ensEmail); err == nil {
                                        if ensID != nil && ensName != nil {
                                                aff.Enseignant = &domain.UserRef{
                                                        ID:    *ensID,
                                                        Name:  *ensName,
                                                        Email: derefStr(ensEmail),
                                                }
                                        }
                                        u.Affectations = append(u.Affectations, aff)
                                }
                        }
                }
                ue = u
                return nil
        })
        if err != nil {
                return nil, err
        }
        return ue, nil
}

// List liste les UEs (RLS actif).
//
// BUGFIX (ENS-AUDIT-2) : deux correctifs apportés ici :
//  1. Inclusion de la relation `filiere` (LEFT JOIN Filiere) pour que le
//     frontend puisse afficher le nom de la filière sans crash (le frontend
//     accédait à `ue.filiere.nom` sur un objet toujours nil avant ce fix).
//  2. Application effective du filtre `enseignantId` (jusqu'ici ignoré) : on
//     ne renvoie que les UEs des filières assignées à l'enseignant (table
//     EnseignantFiliere), en couvrant aussi les UEs partagées via
//     UniteEnseignementFiliere. Sans ce filtre, /api/unites-enseignement
//     ?enseignantId=X renvoyait TOUTES les UEs visibles sous RLS.
func (r *UERepository) List(ctx context.Context, params domain.UEListParams) ([]*domain.UniteEnseignement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.UniteEnseignement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                // filiereId : UE owned by this filière OR shared with it
                if params.FiliereID != "" {
                        where = append(where, fmt.Sprintf(`("UniteEnseignement"."filiereId" = $%d OR EXISTS (
                                SELECT 1 FROM "UniteEnseignementFiliere" uef WHERE uef."uniteEnseignementId" = "UniteEnseignement"."id" AND uef."filiereId" = $%d))`, argIdx, argIdx))
                        args = append(args, params.FiliereID)
                        argIdx++
                }
                // enseignantId : UEs des filières assignées à l'enseignant
                // (couvre l'UE propriétaire + les UEs partagées via UniteEnseignementFiliere).
                if params.EnseignantID != "" {
                        where = append(where, fmt.Sprintf(`EXISTS (
                                SELECT 1 FROM "EnseignantFiliere" ef
                                WHERE ef."enseignantId" = $%d
                                  AND (ef."filiereId" = "UniteEnseignement"."filiereId"
                                       OR EXISTS (SELECT 1 FROM "UniteEnseignementFiliere" uef
                                                  WHERE uef."uniteEnseignementId" = "UniteEnseignement"."id"
                                                    AND uef."filiereId" = ef."filiereId")))`, argIdx))
                        args = append(args, params.EnseignantID)
                        argIdx++
                }
                if params.Niveau != "" {
                        where = append(where, fmt.Sprintf(`("UniteEnseignement"."niveau" = $%d OR "UniteEnseignement"."niveaux" LIKE $%d)`, argIdx, argIdx+1))
                        args = append(args, params.Niveau, "%\""+params.Niveau+"\"%")
                        argIdx += 2
                }

                // PROG-ACAD-CRITICAL-FIX-1 (BUG #13) : filtre etablissementId
                if params.EtablissementID != "" {
                    where = append(where, fmt.Sprintf(`EXISTS (
                    SELECT 1 FROM "Filiere" f3
                    WHERE f3."id" = "UniteEnseignement"."filiereId" AND f3."etablissementId" = $%d)`, argIdx))
                    args = append(args, params.EtablissementID)
                    argIdx++
                }
                if params.Semestre != nil {
                        where = append(where, fmt.Sprintf(`"UniteEnseignement"."semestre" = $%d`, argIdx))
                        args = append(args, *params.Semestre)
                        argIdx++
                }
                if params.Actif != nil {
                        where = append(where, fmt.Sprintf(`"UniteEnseignement"."actif" = $%d`, argIdx))
                        args = append(args, *params.Actif)
                        argIdx++
                }
                if params.Search != "" {
                        // BUGFIX (SESSIONS-SEARCH-1) : Simple Protocol ne supporte pas
                        // les placeholders réutilisés. 2 placeholders distincts + 2 args.
                        where = append(where, fmt.Sprintf(`("UniteEnseignement"."nom" ILIKE $%d OR "UniteEnseignement"."code" ILIKE $%d)`, argIdx, argIdx+1))
                        args = append(args, "%"+params.Search+"%")
                        args = append(args, "%"+params.Search+"%")
                        argIdx += 2
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                // LEFT JOIN Filiere pour peupler la relation (nil si filiereId est NULL
                // ou si la filière a été supprimée — ne casse pas le listage).
                // On utilise columnsUEQualified pour éviter l'ambiguïté des colonnes
                // "id"/"nom"/"code" partagées entre "UniteEnseignement" et "Filiere".
                query := fmt.Sprintf(`
                        SELECT %s, f."id", f."nom", f."code"
                        FROM "UniteEnseignement"
                        LEFT JOIN "Filiere" f ON f."id" = "UniteEnseignement"."filiereId"
                        %s
                        ORDER BY "UniteEnseignement"."createdAt" DESC`, columnsUEQualified, whereClause)
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query ues: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        u := &domain.UniteEnseignement{}
                        var filiereID, filiereNom, filiereCode *string
                        err := rows.Scan(
                                &u.ID, &u.Code, &u.Nom, &u.Description, &u.FiliereID, &u.Niveau, &u.Niveaux,
                                &u.Semestre, &u.CreditsECTS, &u.VolumeHeuresCM, &u.VolumeHeuresTD, &u.VolumeHeuresTP,
                                &u.Obligatoire, &u.Actif, &u.CreatedAt, &u.UpdatedAt,
                                &filiereID, &filiereNom, &filiereCode,
                        )
                        if err != nil {
                                return fmt.Errorf("scan ue: %w", err)
                        }
                        if filiereID != nil && filiereNom != nil {
                                u.Filiere = &domain.FiliereRef{
                                        ID:   *filiereID,
                                        Nom:  *filiereNom,
                                        Code: derefStr(filiereCode),
                                }
                        }
                        result = append(result, u)
                }
                if result == nil {
                        result = []*domain.UniteEnseignement{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// Create crée une UE.
//
// BUGFIX (AUDIT-RLS-VAGUE-4) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy UniteEnseignement_modify_responsable
// (is_responsable() AND filiere_in_my_etab(filiereId)) voyait NULL → INSERT bloqué.
// Alignement sur db.WithTx avec claims user depuis le context.
func (r *UERepository) Create(ctx context.Context, input domain.CreateUEInput) (*domain.UniteEnseignement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("UERepository.Create: claims manquants dans le context")
        }

        var ue *domain.UniteEnseignement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                id := uuid.NewString()
                cm, td, tp := 0, 0, 0
                if input.VolumeHeuresCM != nil {
                        cm = *input.VolumeHeuresCM
                }
                if input.VolumeHeuresTD != nil {
                        td = *input.VolumeHeuresTD
                }
                if input.VolumeHeuresTP != nil {
                        tp = *input.VolumeHeuresTP
                }
                obligatoire := true
                if input.Obligatoire != nil {
                        obligatoire = *input.Obligatoire
                }
                actif := true
                if input.Actif != nil {
                        actif = *input.Actif
                }

                row := tx.QueryRow(ctx, `
                        INSERT INTO "UniteEnseignement" ("id", "code", "nom", "description", "filiereId", "niveau", "niveaux",
                                "semestre", "creditsECTS", "volumeHeuresCM", "volumeHeuresTD", "volumeHeuresTP",
                                "obligatoire", "actif", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING `+columnsUE,
                        id, input.Code, input.Nom, nullableStrPtr(input.Description), input.FiliereID, input.Niveau,
                        nullableStrPtr(input.Niveaux), nullableIntPtr(input.Semestre), nullableIntPtr(input.CreditsECTS),
                        cm, td, tp, obligatoire, actif)

                u, err := scanUE(row)
                if err != nil {
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "une UE avec ce code existe déjà dans cette filière"}
                        }
                        return fmt.Errorf("create ue: %w", err)
                }
                ue = u

                // Créer les liaisons supplémentaires (UniteEnseignementFiliere)
                if len(input.FiliereIDsSuppl) > 0 {
                        for _, filiereID := range input.FiliereIDsSuppl {
                                if filiereID == input.FiliereID {
                                        continue // exclure la filière owner
                                }
                                _, err := tx.Exec(ctx, `
                                        INSERT INTO "UniteEnseignementFiliere" ("id", "uniteEnseignementId", "filiereId", "createdAt")
                                        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                                        ON CONFLICT DO NOTHING
                                `, uuid.NewString(), id, filiereID)
                                if err != nil {
                                        return fmt.Errorf("create ue filiere suppl: %w", err)
                                }
                        }
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return ue, nil
}

// Update met à jour une UE (partial update).
//
// BUGFIX (AUDIT-RLS-VAGUE-4) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy UniteEnseignement_modify_responsable
// bloquait l'UPDATE → NotFoundError. Alignement sur db.WithTx avec claims user.
func (r *UERepository) Update(ctx context.Context, id string, input domain.UpdateUEInput) (*domain.UniteEnseignement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("UERepository.Update: claims manquants dans le context")
        }

        var ue *domain.UniteEnseignement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var setClauses []string
                var args []any
                argIdx := 1

                addSet := func(col string, val any) {
                        setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
                        args = append(args, val)
                        argIdx++
                }

                if input.Code != nil {
                        addSet("code", *input.Code)
                }
                if input.Nom != nil {
                        addSet("nom", *input.Nom)
                }
                if input.Description != nil {
                        addSet("description", nullableStrPtr(input.Description))
                }
                if input.FiliereID != nil {
                        addSet("filiereId", *input.FiliereID)
                }
                if input.Niveau != nil {
                        addSet("niveau", *input.Niveau)
                }
                if input.Niveaux != nil {
                        addSet("niveaux", nullableStrPtr(input.Niveaux))
                }
                if input.Semestre != nil {
                        addSet("semestre", nullableIntPtr(input.Semestre))
                }
                if input.CreditsECTS != nil {
                        addSet("creditsECTS", nullableIntPtr(input.CreditsECTS))
                }
                if input.VolumeHeuresCM != nil {
                        addSet("volumeHeuresCM", *input.VolumeHeuresCM)
                }
                if input.VolumeHeuresTD != nil {
                        addSet("volumeHeuresTD", *input.VolumeHeuresTD)
                }
                if input.VolumeHeuresTP != nil {
                        addSet("volumeHeuresTP", *input.VolumeHeuresTP)
                }
                if input.Obligatoire != nil {
                        addSet("obligatoire", *input.Obligatoire)
                }
                if input.Actif != nil {
                        addSet("actif", *input.Actif)
                }

                if len(setClauses) > 0 {
                        setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
                        args = append(args, id)
                        updateSQL := fmt.Sprintf(`UPDATE "UniteEnseignement" SET %s WHERE "id" = $%d RETURNING %s`,
                                strings.Join(setClauses, ", "), argIdx, columnsUE)
                        row := tx.QueryRow(ctx, updateSQL, args...)
                        u, err := scanUE(row)
                        if err != nil {
                                if err == pgx.ErrNoRows {
                                        return &domain.NotFoundError{Entity: "UniteEnseignement", ID: id}
                                }
                                if isUniqueViolation(err) {
                                        return &domain.ConflictError{Message: "une UE avec ce code existe déjà dans cette filière"}
                                }
                                return fmt.Errorf("update ue: %w", err)
                        }
                        // Gérer filiereIdsSuppl (full replace)
                        if input.FiliereIDsSuppl != nil {
                                // Delete all existing
                                if _, err := tx.Exec(ctx, `DELETE FROM "UniteEnseignementFiliere" WHERE "uniteEnseignementId" = $1`, id); err != nil {
                                        return fmt.Errorf("delete ue filieres suppl: %w", err)
                                }
                                // Insert new
                                ownerFiliereID := u.FiliereID
                                for _, fid := range input.FiliereIDsSuppl {
                                        if fid == ownerFiliereID {
                                                continue
                                        }
                                        _, err := tx.Exec(ctx, `INSERT INTO "UniteEnseignementFiliere" ("id", "uniteEnseignementId", "filiereId", "createdAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING`, uuid.NewString(), id, fid)
                                        if err != nil {
                                                return fmt.Errorf("insert ue filiere suppl: %w", err)
                                        }
                                }
                        }
                        ue = u
                        return nil
                }

                // No fields to update — return existing
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "UniteEnseignement" WHERE "id" = $1`, columnsUE), id)
                u, err := scanUE(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "UniteEnseignement", ID: id}
                        }
                        return err
                }
                ue = u
                return nil
        })
        if err != nil {
                return nil, err
        }
        return ue, nil
}

// SoftDelete désactive une UE (actif=false).
func (r *UERepository) SoftDelete(ctx context.Context, id string) (*domain.UniteEnseignement, error) {
        return r.Update(ctx, id, domain.UpdateUEInput{Actif: boolPtr(false)})
}

// HardDelete supprime définitivement une UE de la DB (DELETE réel).
// Les contraintes FK feront :
//   - CASCADE : Affectation, Devoir, ValidationUE, UniteEnseignementFiliere
//     (ces entités liées seront supprimées automatiquement)
//   - SET NULL : Document.uniteEnseignementId, Epreuve.uniteEnseignementId
//     (l'entité conserve une référence NULL)
// RLS actif — filtrage par claims JWT posés via db.WithTx (rôle sect_app NOBYPASSRLS).
// Retourne NotFoundError si l'UE n'existe pas.
//
// BUGFIX (AUDIT-RLS-REPOS-001) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy UniteEnseignement_modify_responsable
// (is_responsable() AND filiere_in_my_etab(filiereId)) voyait NULL →
// 0 rows → NotFoundError. Alignement du code sur le commentaire (db.WithTx).
func (r *UERepository) HardDelete(ctx context.Context, id string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("HardDelete UE: claims manquants dans le context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(ctx, `DELETE FROM "UniteEnseignement" WHERE "id" = $1`, id)
                if err != nil {
                        return fmt.Errorf("hard delete ue: %w", err)
                }
                if tag.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "UniteEnseignement", ID: id}
                }
                return nil
        })
}

// GetUEDependencies retourne les comptes d'entités liées à une UE.
// PROG-ACAD-CRITICAL-FIX-1 (BUG #1) : permet d'avertir l'utilisateur
// avant de désactiver une UE qui a des épreuves/affectations/documents.
// RLS actif (db.WithTx) — lecture sécurisée.
func (r *UERepository) GetUEDependencies(ctx context.Context, id string) (*domain.UEDependencies, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var deps domain.UEDependencies
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // Compter les épreuves non supprimées liées à cette UE
                if err := tx.QueryRow(ctx, `
                        SELECT count(*) FROM "Epreuve" WHERE "uniteEnseignementId" = $1 AND "deletedAt" IS NULL
                `, id).Scan(&deps.EpreuvesCount); err != nil {
                        return fmt.Errorf("count epreuves: %w", err)
                }

                // Compter les affectations actives
                if err := tx.QueryRow(ctx, `
                        SELECT count(*) FROM "Affectation" WHERE "uniteEnseignementId" = $1
                `, id).Scan(&deps.AffectationsCount); err != nil {
                        return fmt.Errorf("count affectations: %w", err)
                }

                // Compter les documents liés
                if err := tx.QueryRow(ctx, `
                        SELECT count(*) FROM "Document" WHERE "uniteEnseignementId" = $1 AND "deletedAt" IS NULL
                `, id).Scan(&deps.DocumentsCount); err != nil {
                        return fmt.Errorf("count documents: %w", err)
                }

                return nil
        })
        if err != nil {
                return nil, err
        }

        deps.CanDelete = deps.EpreuvesCount == 0 && deps.AffectationsCount == 0 && deps.DocumentsCount == 0
        return &deps, nil
}

// ============================================================
// ENSEIGNANT FILIERE
// ============================================================

// EnseignantFiliereRepository implémente domain.EnseignantFiliereRepository.
type EnseignantFiliereRepository struct {
        pool *pgxpool.Pool
}

// NewEnseignantFiliereRepository crée un nouveau repository.
func NewEnseignantFiliereRepository(pool *pgxpool.Pool) *EnseignantFiliereRepository {
        return &EnseignantFiliereRepository{pool: pool}
}

const columnsEF = `"id", "enseignantId", "filiereId", "niveau", "createdAt", "updatedAt"`

func scanEnseignantFiliere(s scanner) (*domain.EnseignantFiliere, error) {
        e := &domain.EnseignantFiliere{}
        err := s.Scan(&e.ID, &e.EnseignantID, &e.FiliereID, &e.Niveau, &e.CreatedAt, &e.UpdatedAt)
        if err != nil {
                return nil, err
        }
        return e, nil
}

// List liste les assignations (RLS actif).
func (r *EnseignantFiliereRepository) List(ctx context.Context, params domain.EnseignantFiliereListParams) ([]*domain.EnseignantFiliere, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.EnseignantFiliere
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if params.EnseignantID != "" {
                        where = append(where, fmt.Sprintf(`ef."enseignantId" = $%d`, argIdx))
                        args = append(args, params.EnseignantID)
                        argIdx++
                }
                if params.FiliereID != "" {
                        where = append(where, fmt.Sprintf(`ef."filiereId" = $%d`, argIdx))
                        args = append(args, params.FiliereID)
                        argIdx++
                }
                // BUGFIX (PROG-ACAD-3) : filtre etablissementId ignoré jusqu'ici.
                // Le handler le parse et le usecase le transmet, mais le repo le
                // silencait → RLS était le seul filtre → 0 rows si claim mismatch.
                if params.EtablissementID != "" {
                        where = append(where, fmt.Sprintf(`EXISTS (
                                SELECT 1 FROM "Filiere" f2
                                WHERE f2."id" = ef."filiereId" AND f2."etablissementId" = $%d)`, argIdx))
                        args = append(args, params.EtablissementID)
                        argIdx++
                }

                // PROG-ACAD-CRITICAL-FIX-1 (BUG #7) : filtre niveau
                if params.Niveau != "" {
                    where = append(where, fmt.Sprintf(`ef."niveau" = $%d`, argIdx))
                    args = append(args, params.Niveau)
                    argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                // BUGFIX (RESP-AUDIT-3) : LEFT JOIN Filiere pour peupler la relation
                // filiere (FiliereRef{ID, Nom, Code}) attendue par le frontend
                // (enseignants-page.tsx : assignment.filiere.nom).
                // ENSEIGNANTS-FIX-EN1 (CRITICAL) : le SELECT ne contenait pas les colonnes
                // de "User" (u.id, u.name, u.email) bien que le LEFT JOIN "User" u soit
                // présent, et le Scan attendait 12 destinations → mismatch 9 vs 12 →
                // erreur "scan ef" systématique → tout GET /api/enseignant-filieres
                // retournait 500 "erreur interne" → page /enseignants sans affectations.
                query := fmt.Sprintf(`
                        SELECT ef."id", ef."enseignantId", ef."filiereId", ef."niveau", ef."createdAt", ef."updatedAt",
                               f."id", f."nom", f."code",
                               u."id", u."name", u."email"
                        FROM "EnseignantFiliere" ef
                        LEFT JOIN "Filiere" f ON f."id" = ef."filiereId"
                        LEFT JOIN "User" u ON u."id" = ef."enseignantId"
                        %s
                        ORDER BY ef."createdAt" DESC`, whereClause)
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query enseignant-filieres: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        ef := &domain.EnseignantFiliere{}
                        var filID, filNom *string
                        var filCode *string
                        var ensID, ensName, ensEmail *string
                        err := rows.Scan(&ef.ID, &ef.EnseignantID, &ef.FiliereID, &ef.Niveau, &ef.CreatedAt, &ef.UpdatedAt,
                                &filID, &filNom, &filCode,
                        &ensID, &ensName, &ensEmail)
                        if err != nil {
                                return fmt.Errorf("scan ef: %w", err)
                        }
                        if filID != nil && filNom != nil {
                                ef.Filiere = &domain.FiliereRef{
                                        ID:   *filID,
                                        Nom:  *filNom,
                                        Code: derefStr(filCode),
                                }
                        }
                        // PROG-ACAD-CRITICAL-FIX-1 (BUG #6) : populate enseignant
                        if ensID != nil && ensName != nil {
                        ef.Enseignant = &domain.UserRef{
                                ID:    *ensID,
                                Name:  *ensName,
                                Email: derefStr(ensEmail),
                                }
                        }
                        result = append(result, ef)
                }
                if result == nil {
                        result = []*domain.EnseignantFiliere{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// Create crée une assignation (RLS actif — claims posés via db.WithTx).
// FIX AFFECTATION-RLS : avant, cette méthode faisait un BeginTx brut sans poser
// les claims RLS (app.claims.etablissement_id) → la policy
// EnseignantFiliere_modify_responsable rejetait l'INSERT (SQLSTATE 42501) quand
// un RESPONSABLE créait un enseignant + affectation via le formulaire "Création
// directe". Désormais db.WithTx pose les claims comme List/Create des autres
// repositories.
func (r *EnseignantFiliereRepository) Create(ctx context.Context, input domain.CreateAssignmentInput) (*domain.EnseignantFiliere, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var ef *domain.EnseignantFiliere
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                id := uuid.NewString()
                row := tx.QueryRow(ctx, `
                        INSERT INTO "EnseignantFiliere" ("id", "enseignantId", "filiereId", "niveau", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING `+columnsEF,
                        id, input.EnseignantID, input.FiliereID, input.Niveau)

                result, err := scanEnseignantFiliere(row)
                if err != nil {
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "cette assignation existe déjà"}
                        }
                        return fmt.Errorf("create ef: %w", err)
                }
                ef = result
                return nil
        })
        if err != nil {
                return nil, err
        }
        return ef, nil
}

// DeleteByID supprime une assignation par ID.
func (r *EnseignantFiliereRepository) DeleteByID(ctx context.Context, id string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(ctx, `DELETE FROM "EnseignantFiliere" WHERE "id" = $1`, id)
                if err != nil {
                        return fmt.Errorf("delete ef: %w", err)
                }
                if tag.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "EnseignantFiliere", ID: id}
                }
                return nil
        })
}

// DeleteByComposite supprime par (enseignantId, filiereId, niveau).
func (r *EnseignantFiliereRepository) DeleteByComposite(ctx context.Context, enseignantID, filiereID, niveau string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(ctx, `DELETE FROM "EnseignantFiliere" WHERE "enseignantId" = $1 AND "filiereId" = $2 AND "niveau" = $3`,
                        enseignantID, filiereID, niveau)
                if err != nil {
                        return fmt.Errorf("delete ef composite: %w", err)
                }
                if tag.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "EnseignantFiliere", ID: enseignantID + "/" + filiereID + "/" + niveau}
                }
                return nil
        })
}

// ============================================================
// ANNEE ACADEMIQUE
// ============================================================

// AnneeAcademiqueRepository implémente domain.AnneeAcademiqueRepository.
type AnneeAcademiqueRepository struct {
        pool *pgxpool.Pool
}

// NewAnneeAcademiqueRepository crée un nouveau repository.
func NewAnneeAcademiqueRepository(pool *pgxpool.Pool) *AnneeAcademiqueRepository {
        return &AnneeAcademiqueRepository{pool: pool}
}

const columnsAnnee = `"id", "libelle", "dateDebut", "dateFin", "etablissementId", "actif", "createdAt", "updatedAt"`

func scanAnnee(s scanner) (*domain.AnneeAcademique, error) {
        a := &domain.AnneeAcademique{}
        err := s.Scan(&a.ID, &a.Libelle, &a.DateDebut, &a.DateFin, &a.EtablissementID, &a.Actif, &a.CreatedAt, &a.UpdatedAt)
        if err != nil {
                return nil, err
        }
        return a, nil
}

// List liste les années académiques d'un établissement (RLS actif).
func (r *AnneeAcademiqueRepository) List(ctx context.Context, etablissementID string, actif *bool) ([]*domain.AnneeAcademique, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.AnneeAcademique
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                where = append(where, fmt.Sprintf(`"etablissementId" = $%d`, argIdx))
                args = append(args, etablissementID)
                argIdx++

                if actif != nil && *actif {
                        where = append(where, fmt.Sprintf(`"actif" = $%d`, argIdx))
                        args = append(args, true)
                        argIdx++
                }

                query := fmt.Sprintf(`SELECT %s FROM "AnneeAcademique" WHERE %s ORDER BY "dateDebut" DESC`,
                        columnsAnnee, strings.Join(where, " AND "))
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query annees: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        a, err := scanAnnee(rows)
                        if err != nil {
                                return fmt.Errorf("scan annee: %w", err)
                        }
                        result = append(result, a)
                }
                if result == nil {
                        result = []*domain.AnneeAcademique{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// Create crée une année académique.
//
// BUGFIX (AUDIT-RLS-VAGUE-4) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy AnneeAcademique_modify_responsable
// (is_responsable() AND etablissementId = current_etablissement_id()) voyait NULL
// → INSERT bloqué. Alignement sur db.WithTx avec claims user depuis le context.
func (r *AnneeAcademiqueRepository) Create(ctx context.Context, input domain.CreateAnneeInput) (*domain.AnneeAcademique, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("AnneeAcademiqueRepository.Create: claims manquants dans le context")
        }

        var a *domain.AnneeAcademique
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // Parser les dates ISO
                dateDebut, err := time.Parse(time.RFC3339, input.DateDebut)
                if err != nil {
                        return &domain.ValidationError{Field: "dateDebut", Message: "format ISO invalide"}
                }
                dateFin, err := time.Parse(time.RFC3339, input.DateFin)
                if err != nil {
                        return &domain.ValidationError{Field: "dateFin", Message: "format ISO invalide"}
                }

                id := uuid.NewString()
                row := tx.QueryRow(ctx, `
                        INSERT INTO "AnneeAcademique" ("id", "libelle", "dateDebut", "dateFin", "etablissementId", "actif", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING `+columnsAnnee,
                        id, input.Libelle, dateDebut, dateFin, input.EtablissementID)

                u, err := scanAnnee(row)
                if err != nil {
                        if isUniqueViolation(err) {
                                return &domain.ConflictError{Message: "cette année académique existe déjà pour cet établissement"}
                        }
                        return fmt.Errorf("create annee: %w", err)
                }
                a = u
                return nil
        })
        if err != nil {
                return nil, err
        }
        return a, nil
}

// FindByID récupère une année académique par ID (RLS actif).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (r *AnneeAcademiqueRepository) FindByID(ctx context.Context, id string) (*domain.AnneeAcademique, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }
        var a *domain.AnneeAcademique
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "AnneeAcademique" WHERE "id" = $1`, columnsAnnee), id)
                var err2 error
                a, err2 = scanAnnee(row)
                return err2
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "AnneeAcademique", ID: id}
                }
                return nil, err
        }
        return a, nil
}

// Update modifie une année académique (RLS actif).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (r *AnneeAcademiqueRepository) Update(ctx context.Context, id string, input domain.UpdateAnneeInput) (*domain.AnneeAcademique, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }
        var a *domain.AnneeAcademique
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var sets []string
                var args []any
                argIdx := 1
                if input.Libelle != nil {
                        sets = append(sets, fmt.Sprintf(`"libelle" = $%d`, argIdx))
                        args = append(args, *input.Libelle)
                        argIdx++
                }
                if input.DateDebut != nil {
                        sets = append(sets, fmt.Sprintf(`"dateDebut" = $%d`, argIdx))
                        args = append(args, *input.DateDebut)
                        argIdx++
                }
                if input.DateFin != nil {
                        sets = append(sets, fmt.Sprintf(`"dateFin" = $%d`, argIdx))
                        args = append(args, *input.DateFin)
                        argIdx++
                }
                if input.Actif != nil {
                        sets = append(sets, fmt.Sprintf(`"actif" = $%d`, argIdx))
                        args = append(args, *input.Actif)
                        argIdx++
                }
                if len(sets) == 0 {
                        return fmt.Errorf("aucun champ à modifier")
                }
                sets = append(sets, `"updatedAt" = CURRENT_TIMESTAMP`)
                args = append(args, id)
                query := fmt.Sprintf(`UPDATE "AnneeAcademique" SET %s WHERE "id" = $%d RETURNING %s`,
                        strings.Join(sets, ", "), argIdx, columnsAnnee)
                row := tx.QueryRow(ctx, query, args...)
                var err2 error
                a, err2 = scanAnnee(row)
                return err2
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "AnneeAcademique", ID: id}
                }
                return nil, err
        }
        return a, nil
}

// SoftDelete désactive une année académique (actif=false, pas de hard delete).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (r *AnneeAcademiqueRepository) SoftDelete(ctx context.Context, id string) (*domain.AnneeAcademique, error) {
        return r.Update(ctx, id, domain.UpdateAnneeInput{Actif: boolPtr(false)})
}

// HardDelete supprime définitivement une année académique de la DB (DELETE réel).
// Les FKs SET NULL sur Epreuve/ValidationUE/Etablissement.anneeAcademiqueCouranteId
// perdront leur référence — pas de cascade bloquante.
// RLS actif — filtrage par claims JWT posés via db.WithTx (rôle sect_app NOBYPASSRLS).
// Retourne NotFoundError si l'année n'existe pas.
//
// BUGFIX (AUDIT-RLS-REPOS-001) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy AnneeAcademique_modify_responsable
// (is_responsable() AND etablissementId = current_etablissement_id()) voyait NULL
// → 0 rows → NotFoundError. Alignement du code sur le commentaire (db.WithTx).
func (r *AnneeAcademiqueRepository) HardDelete(ctx context.Context, id string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("HardDelete Annee: claims manquants dans le context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(ctx, `DELETE FROM "AnneeAcademique" WHERE "id" = $1`, id)
                if err != nil {
                        return fmt.Errorf("hard delete annee: %w", err)
                }
                if tag.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "AnneeAcademique", ID: id}
                }
                return nil
        })
}
