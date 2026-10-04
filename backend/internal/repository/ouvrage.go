// Package repository — implémentation OuvrageRepository (ADR-0007 P1).
//
// RLS : toutes les méthodes passent par db.WithTx avec les claims du
// context (pattern document.go). Les policies Ouvrage_* (000123) font le
// scope : lecteurs = établissement + non-supprimés + droits non expirés ;
// ADMIN/is_system voient tout (corbeille incluse).
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// OuvrageRepository implémente domain.OuvrageRepository.
type OuvrageRepository struct {
	pool *pgxpool.Pool
}

// NewOuvrageRepository crée un nouveau OuvrageRepository.
func NewOuvrageRepository(pool *pgxpool.Pool) *OuvrageRepository {
	return &OuvrageRepository{pool: pool}
}

const columnsOuvrage = `o."id", o."etablissementId", o."titre", o."auteurs", o."categorie",
	o."editeur", o."edition", o."anneePublication", o."isbn", o."langue",
	o."filiereId", o."niveau", o."themes", o."description", o."licenceOrigine",
	o."dateExpirationDroits", o."nomFichier", o."cheminStockage", o."tailleFichier",
	o."typeMime", o."telechargementAutorise", o."createdById",
	o."createdAt", o."updatedAt", o."deletedAt"`

// columnsOuvrageBare — les mêmes colonnes SANS préfixe d'alias, pour les
// RETURNING des INSERT/UPDATE sans alias (le préfixe o. y serait une erreur
// « missing FROM-clause entry » — 42601).
var columnsOuvrageBare = strings.ReplaceAll(columnsOuvrage, `o.`, ``)

// scanOuvrage scanne une ligne Ouvrage.
func scanOuvrage(s scanner) (*domain.Ouvrage, error) {
	o := &domain.Ouvrage{}
	err := s.Scan(
		&o.ID, &o.EtablissementID, &o.Titre, &o.Auteurs, &o.Categorie,
		&o.Editeur, &o.Edition, &o.AnneePublication, &o.ISBN, &o.Langue,
		&o.FiliereID, &o.Niveau, &o.Themes, &o.Description, &o.LicenceOrigine,
		&o.DateExpirationDroits, &o.NomFichier, &o.CheminStockage, &o.TailleFichier,
		&o.TypeMime, &o.TelechargementAutorise, &o.CreatedByID,
		&o.CreatedAt, &o.UpdatedAt, &o.DeletedAt,
	)
	if err != nil {
		return nil, err
	}
	// DroitsExpires — dérivé, pour le badge UI ADMIN (les lecteurs ne
	// reçoivent jamais ces lignes : auto-masquage policy Ouvrage_select).
	if o.DateExpirationDroits != nil && o.DateExpirationDroits.Before(time.Now()) {
		o.DroitsExpires = true
	}
	return o, nil
}

// ouvrageFiliereCols — colonnes du LEFT JOIN Filiere (à scanner APRÈS
// columnsOuvrage ; le scan se fait en une passe — cf. scanOuvrageRow).
const ouvrageFiliereCols = `f."id", f."code", f."nom"`

// scanOuvrageRow scanne columnsOuvrage + ouvrageFiliereCols.
func scanOuvrageRow(s scanner) (*domain.Ouvrage, error) {
	o := &domain.Ouvrage{}
	var filID, filCode, filNom *string
	err := s.Scan(
		&o.ID, &o.EtablissementID, &o.Titre, &o.Auteurs, &o.Categorie,
		&o.Editeur, &o.Edition, &o.AnneePublication, &o.ISBN, &o.Langue,
		&o.FiliereID, &o.Niveau, &o.Themes, &o.Description, &o.LicenceOrigine,
		&o.DateExpirationDroits, &o.NomFichier, &o.CheminStockage, &o.TailleFichier,
		&o.TypeMime, &o.TelechargementAutorise, &o.CreatedByID,
		&o.CreatedAt, &o.UpdatedAt, &o.DeletedAt,
		&filID, &filCode, &filNom,
	)
	if err != nil {
		return nil, err
	}
	if filID != nil && filCode != nil {
		o.Filiere = &domain.OuvrageFiliereRef{
			ID:   *filID,
			Code: derefStr(filCode),
			Nom:  derefStr(filNom),
		}
	}
	if o.DateExpirationDroits != nil && o.DateExpirationDroits.Before(time.Now()) {
		o.DroitsExpires = true
	}
	return o, nil
}

// List — catalogue paginé + filtré (ADR-0007 §API).
//
// SÉMANTIQUE DES FILTRES filiere/niveau (recommandation, ADR-0007) :
// NULL = « pertinent pour tous » → le filtre matche les ouvrages de la
// valeur demandée OU sans restriction (filiereId IS NULL / niveau IS NULL).
//
// NB niveau : Ouvrage.niveau est TYPÉ enum NiveauEtude en DB (000123). La
// comparaison `o."niveau" = $n` laisse PG inférer $n du type de la colonne
// (exact-match) — JAMAIS de cast ::text ici (leçon ENUM-SWEEP-1 : comparer
// un enum à du text = 42883).
func (r *OuvrageRepository) List(ctx context.Context, params domain.OuvrageListParams) (*domain.OuvrageListResult, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	// Normalisation pagination.
	page := params.Page
	if page < 1 {
		page = 1
	}
	limit := params.Limit
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	result := &domain.OuvrageListResult{Page: page, Limit: limit}
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		where := []string{`TRUE`}
		args := []any{}
		addArg := func(v any) string {
			args = append(args, v)
			return fmt.Sprintf("$%d", len(args))
		}

		if !params.IncludeDeleted {
			where = append(where, `o."deletedAt" IS NULL`)
		}
		if params.Search != "" {
			p := addArg("%" + strings.ToLower(params.Search) + "%")
			// P4 (ADR-0008 §4) : q étendu à themes — la veille thématique et la
			// recherche catalogue partagent la même surface de matching.
			where = append(where, fmt.Sprintf(`(LOWER(o."titre") LIKE %s OR LOWER(COALESCE(o."auteurs", '')) LIKE %s OR LOWER(COALESCE(o."description", '')) LIKE %s OR LOWER(COALESCE(o."editeur", '')) LIKE %s OR LOWER(COALESCE(o."themes", '')) LIKE %s)`,
				p, p, p, p, p))
		}
		if params.Categorie != "" {
			where = append(where, fmt.Sprintf(`o."categorie" = %s`, addArg(string(params.Categorie))))
		}
		if params.FiliereID != "" {
			where = append(where, fmt.Sprintf(`(o."filiereId" = %s OR o."filiereId" IS NULL)`, addArg(params.FiliereID)))
		}
		if params.Niveau != "" {
			where = append(where, fmt.Sprintf(`(o."niveau" = %s OR o."niveau" IS NULL)`, addArg(params.Niveau)))
		}
		whereSQL := strings.Join(where, " AND ")

		// Total (même filtre).
		var total int
		if err := tx.QueryRow(ctx,
			fmt.Sprintf(`SELECT count(*) FROM "Ouvrage" o WHERE %s`, whereSQL),
			args...,
		).Scan(&total); err != nil {
			return fmt.Errorf("count ouvrages: %w", err)
		}
		result.Total = total

		offset := (page - 1) * limit
		rows, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT %s, %s
			FROM "Ouvrage" o
			LEFT JOIN "Filiere" f ON f."id" = o."filiereId"
			WHERE %s
			ORDER BY o."createdAt" DESC
			LIMIT %d OFFSET %d`,
			columnsOuvrage, ouvrageFiliereCols, whereSQL, limit, offset),
			args...)
		if err != nil {
			return fmt.Errorf("query ouvrages: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			o, err := scanOuvrageRow(rows)
			if err != nil {
				return fmt.Errorf("scan ouvrage: %w", err)
			}
			result.Ouvrages = append(result.Ouvrages, o)
		}
		if result.Ouvrages == nil {
			result.Ouvrages = []*domain.Ouvrage{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// FindByID — un ouvrage par ID (LEFT JOIN Filiere pour l'UI).
func (r *OuvrageRepository) FindByID(ctx context.Context, id string) (*domain.Ouvrage, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var out *domain.Ouvrage
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`
			SELECT %s, %s
			FROM "Ouvrage" o
			LEFT JOIN "Filiere" f ON f."id" = o."filiereId"
			WHERE o."id" = $1`,
			columnsOuvrage, ouvrageFiliereCols), id)
		o, err := scanOuvrageRow(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Ouvrage", ID: id}
			}
			return fmt.Errorf("query ouvrage: %w", err)
		}
		out = o
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Create — INSERT + RETURNING (upload ADMIN, G1).
func (r *OuvrageRepository) Create(ctx context.Context, input domain.CreateOuvrageInput) (*domain.Ouvrage, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Create: claims manquants dans le context")
	}

	var out *domain.Ouvrage
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		id := input.ID
		if id == "" {
			id = uuid.NewString()
		}
		row := tx.QueryRow(ctx, fmt.Sprintf(`
			INSERT INTO "Ouvrage" ("id", "etablissementId", "titre", "auteurs", "categorie",
				"editeur", "edition", "anneePublication", "isbn", "langue",
				"filiereId", "niveau", "themes", "description", "licenceOrigine",
				"dateExpirationDroits", "nomFichier", "cheminStockage", "tailleFichier",
				"typeMime", "telechargementAutorise", "createdById",
				"createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5,
				$6, $7, $8, $9, $10,
				$11, $12, $13, $14, $15,
				$16, $17, $18, $19,
				$20, $21, $22,
				CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			RETURNING %s`,
			columnsOuvrageBare),
			id, input.EtablissementID, input.Titre, nullableStrPtr(input.Auteurs), string(input.Categorie),
			nullableStrPtr(input.Editeur), nullableStrPtr(input.Edition), nullableIntPtr(input.AnneePublication),
			nullableStrPtr(input.ISBN), nullableStrPtr(input.Langue),
			nullableStrPtr(input.FiliereID), nullableStrPtr(input.Niveau), nullableStrPtr(input.Themes),
			nullableStrPtr(input.Description), input.LicenceOrigine,
			nullableTimePtr(input.DateExpirationDroits), input.NomFichier, nullableStrPtr(input.CheminStockage),
			input.TailleFichier, input.TypeMime, input.TelechargementAutorise, input.CreatedByID)

		o, err := scanOuvrage(row)
		if err != nil {
			// FK invalide (filière/établissement inexistant) → 400 pour le
			// client, pas de 500 (leçon SECT-PRODUIT-1 : erreurs honnêtes).
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23503" {
				return &domain.ValidationError{Field: "filiereId|etablissementId", Message: "référence inexistante (filière ou établissement)"}
			}
			return fmt.Errorf("create ouvrage: %w", err)
		}
		out = o
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Update — PATCH dynamique : pointeurs non-nil = nouvelle valeur,
// UnsetX = mettre NULL. Aucun champ → erreur (le handler valide avant).
func (r *OuvrageRepository) Update(ctx context.Context, id string, input domain.UpdateOuvrageInput) (*domain.Ouvrage, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Update: claims manquants dans le context")
	}

	var out *domain.Ouvrage
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		sets := []string{}
		args := []any{}
		addSet := func(col string, val any) {
			args = append(args, val)
			sets = append(sets, fmt.Sprintf(`%s = $%d`, col, len(args)))
		}

		if input.Titre != nil {
			addSet(`"titre"`, *input.Titre)
		}
		if input.Auteurs != nil {
			addSet(`"auteurs"`, *input.Auteurs)
		} else if input.UnsetAuteurs {
			sets = append(sets, `"auteurs" = NULL`)
		}
		if input.Categorie != nil {
			addSet(`"categorie"`, string(*input.Categorie))
		}
		if input.Editeur != nil {
			addSet(`"editeur"`, *input.Editeur)
		} else if input.UnsetEditeur {
			sets = append(sets, `"editeur" = NULL`)
		}
		if input.Edition != nil {
			addSet(`"edition"`, *input.Edition)
		} else if input.UnsetEdition {
			sets = append(sets, `"edition" = NULL`)
		}
		if input.AnneePublication != nil {
			addSet(`"anneePublication"`, *input.AnneePublication)
		} else if input.UnsetAnneePublication {
			sets = append(sets, `"anneePublication" = NULL`)
		}
		if input.ISBN != nil {
			addSet(`"isbn"`, *input.ISBN)
		} else if input.UnsetISBN {
			sets = append(sets, `"isbn" = NULL`)
		}
		if input.Langue != nil {
			addSet(`"langue"`, *input.Langue)
		} else if input.UnsetLangue {
			sets = append(sets, `"langue" = NULL`)
		}
		if input.FiliereID != nil {
			addSet(`"filiereId"`, *input.FiliereID)
		} else if input.UnsetFiliere {
			sets = append(sets, `"filiereId" = NULL`)
		}
		if input.Niveau != nil {
			addSet(`"niveau"`, *input.Niveau)
		} else if input.UnsetNiveau {
			sets = append(sets, `"niveau" = NULL`)
		}
		if input.Themes != nil {
			addSet(`"themes"`, *input.Themes)
		} else if input.UnsetThemes {
			sets = append(sets, `"themes" = NULL`)
		}
		if input.Description != nil {
			addSet(`"description"`, *input.Description)
		} else if input.UnsetDescription {
			sets = append(sets, `"description" = NULL`)
		}
		if input.LicenceOrigine != nil {
			addSet(`"licenceOrigine"`, *input.LicenceOrigine)
		}
		if input.DateExpirationDroits != nil {
			addSet(`"dateExpirationDroits"`, *input.DateExpirationDroits)
		} else if input.UnsetDateExpiration {
			sets = append(sets, `"dateExpirationDroits" = NULL`)
		}
		if input.TelechargementAutorise != nil {
			addSet(`"telechargementAutorise"`, *input.TelechargementAutorise)
		}

		if len(sets) == 0 {
			return &domain.ValidationError{Field: "body", Message: "aucun champ à mettre à jour"}
		}
		sets = append(sets, `"updatedAt" = CURRENT_TIMESTAMP`)

		args = append(args, id)
		row := tx.QueryRow(ctx, fmt.Sprintf(`
			UPDATE "Ouvrage" o
			SET %s
			WHERE o."id" = $%d
			RETURNING %s`,
			strings.Join(sets, ", "), len(args), columnsOuvrage),
			args...)

		o, err := scanOuvrage(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Ouvrage", ID: id}
			}
			return fmt.Errorf("update ouvrage: %w", err)
		}
		out = o
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// SoftDelete — corbeille (UPDATE deletedAt ; le fichier R2 reste — la
// purge des octets est un job séparé, cf. ADR-0007 §stockage).
func (r *OuvrageRepository) SoftDelete(ctx context.Context, id string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return fmt.Errorf("SoftDelete: claims manquants dans le context")
	}

	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE "Ouvrage" SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = $1 AND "deletedAt" IS NULL`, id)
		if err != nil {
			return fmt.Errorf("soft delete ouvrage: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return &domain.NotFoundError{Entity: "Ouvrage", ID: id}
		}
		return nil
	})
}

// Restore — sort un ouvrage de la corbeille.
func (r *OuvrageRepository) Restore(ctx context.Context, id string) (*domain.Ouvrage, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Restore: claims manquants dans le context")
	}

	var out *domain.Ouvrage
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`
			UPDATE "Ouvrage" SET "deletedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = $1 AND "deletedAt" IS NOT NULL
			RETURNING %s`,
			columnsOuvrageBare), id)
		o, err := scanOuvrage(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Ouvrage", ID: id}
			}
			return fmt.Errorf("restore ouvrage: %w", err)
		}
		out = o
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// SumTaillesByEtablissement — quota stockage bibliothèque : cumul
// tailleFichier de l'établissement, soft-deleted INCLUS (les octets
// restent en R2 jusqu'à la purge — cf. ADR-0007 §stockage).
func (r *OuvrageRepository) SumTaillesByEtablissement(ctx context.Context, etablissementID string) (int64, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return 0, fmt.Errorf("no RLS claims in context")
	}

	var total int64
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			SELECT COALESCE(SUM("tailleFichier"), 0)
			FROM "Ouvrage"
			WHERE "etablissementId" = $1`, etablissementID,
		).Scan(&total); err != nil {
			return fmt.Errorf("sum tailles ouvrages: %w", err)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return total, nil
}

// AuditLecture — journalise un accès fichier (garde-fou ADR-0007 : audit
// des accès). Policy AuditLog_insert_system : TO neondb_owner (rôle de
// l'app) → l'INSERT passe en contexte user comme en contexte system.
func (r *OuvrageRepository) AuditLecture(ctx context.Context, entry domain.OuvrageAuditEntry) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return fmt.Errorf("no RLS claims in context")
	}

	details, _ := json.Marshal(map[string]any{
		"titre":              entry.Titre,
		"categorie":          string(entry.Categorie),
		"expiresIn":          entry.ExpiresIn,
		"ouvrageId":          entry.OuvrageID,
		"action_metier":      "lecture",
		"garde_droits_adr_7": "audit des acces",
	})

	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO "AuditLog" ("id", "userId", "userEmail", "action", "entite", "entiteId",
				"details", "adresseIp", "etablissementId", "createdAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
			uuid.NewString(),
			nullableStrPtr(&entry.ActorUserID),
			nullableStrPtr(&entry.ActorEmail),
			"OUVRAGE_LECTURE",
			"Ouvrage",
			entry.OuvrageID,
			string(details),
			entry.ActorIP,
			nullableStrPtr(&entry.EtablissementID))
		if err != nil {
			return fmt.Errorf("insert audit ouvrage.lecture: %w", err)
		}
		return nil
	})
}
