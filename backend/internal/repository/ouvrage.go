// Package repository — implémentation OuvrageRepository (ADR-0007 P1,
// 000137 : visibilité 3 niveaux + ciblage classes).
//
// RLS : toutes les méthodes passent par db.WithTx avec les claims du
// context (pattern document.go). La fonction ouvrage_visible (000137,
// SECURITY DEFINER) fait le scope via les policies Ouvrage_* :
// lecteurs = plateforme/établissement/classes + non-supprimés +
// droits non expirés ; ADMIN/is_system voient tout (corbeille incluse).
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
        o."typeMime", o."telechargementAutorise", o."visibility", o."statut", o."createdById",
        o."createdAt", o."updatedAt", o."deletedAt"`

// columnsOuvrageBare — les mêmes colonnes SANS préfixe d'alias, pour les
// RETURNING des INSERT/UPDATE sans alias (le préfixe o. y serait une erreur
// « missing FROM-clause entry » — 42601).
var columnsOuvrageBare = strings.ReplaceAll(columnsOuvrage, `o.`, ``)

// scanOuvrage scanne une ligne Ouvrage (sans le LEFT JOIN Filiere).
// etablissementId est NULL pour les ouvrages PLATEFORME de l'ADMIN
// global (000137) → scan en *string, "" côté Go.
func scanOuvrage(s scanner) (*domain.Ouvrage, error) {
	o := &domain.Ouvrage{}
	var etabID *string
	err := s.Scan(
		&o.ID, &etabID, &o.Titre, &o.Auteurs, &o.Categorie,
		&o.Editeur, &o.Edition, &o.AnneePublication, &o.ISBN, &o.Langue,
		&o.FiliereID, &o.Niveau, &o.Themes, &o.Description, &o.LicenceOrigine,
		&o.DateExpirationDroits, &o.NomFichier, &o.CheminStockage, &o.TailleFichier,
		&o.TypeMime, &o.TelechargementAutorise, &o.Visibility, &o.Statut, &o.CreatedByID,
		&o.CreatedAt, &o.UpdatedAt, &o.DeletedAt,
	)
	if err != nil {
		return nil, err
	}
	if etabID != nil {
		o.EtablissementID = *etabID
	}
	finalizeOuvrage(o)
	return o, nil
}

// scanOuvrageRow scanne columnsOuvrage + ouvrageFiliereCols.
func scanOuvrageRow(s scanner) (*domain.Ouvrage, error) {
	o := &domain.Ouvrage{}
	var etabID *string
	var filID, filCode, filNom *string
	err := s.Scan(
		&o.ID, &etabID, &o.Titre, &o.Auteurs, &o.Categorie,
		&o.Editeur, &o.Edition, &o.AnneePublication, &o.ISBN, &o.Langue,
		&o.FiliereID, &o.Niveau, &o.Themes, &o.Description, &o.LicenceOrigine,
		&o.DateExpirationDroits, &o.NomFichier, &o.CheminStockage, &o.TailleFichier,
		&o.TypeMime, &o.TelechargementAutorise, &o.Visibility, &o.Statut, &o.CreatedByID,
		&o.CreatedAt, &o.UpdatedAt, &o.DeletedAt,
		&filID, &filCode, &filNom,
	)
	if err != nil {
		return nil, err
	}
	if etabID != nil {
		o.EtablissementID = *etabID
	}
	if filID != nil && filCode != nil {
		o.Filiere = &domain.OuvrageFiliereRef{
			ID:   *filID,
			Code: derefStr(filCode),
			Nom:  derefStr(filNom),
		}
	}
	finalizeOuvrage(o)
	return o, nil
}

// finalizeOuvrage — champs dérivés communs (badge droits expirés).
func finalizeOuvrage(o *domain.Ouvrage) {
	if o.DateExpirationDroits != nil && o.DateExpirationDroits.Before(time.Now()) {
		o.DroitsExpires = true
	}
	if o.Classes == nil {
		o.Classes = []domain.OuvrageClasseRef{}
	}
}

// ouvrageFiliereCols — colonnes du LEFT JOIN Filiere (à scanner APRÈS
// columnsOuvrage ; le scan se fait en une passe — cf. scanOuvrageRow).
const ouvrageFiliereCols = `f."id", f."code", f."nom"`

// loadOuvrageClasses — charge le ciblage CLASSE des ouvrages donnés
// (2e requête groupée dans la même tx ; la policy OuvrageClasse_select
// 000137 laisse passer les classes des ouvrages visibles/gérables par
// l'utilisateur courant).
func loadOuvrageClasses(ctx context.Context, tx pgx.Tx, ouvrages []*domain.Ouvrage) error {
	if len(ouvrages) == 0 {
		return nil
	}
	ids := make([]string, len(ouvrages))
	for i, o := range ouvrages {
		ids[i] = o.ID
	}
	rows, err := tx.Query(ctx, `
                SELECT oc."ouvrageId", oc."filiereId", oc."niveau", f."id", f."code", f."nom"
                FROM "OuvrageClasse" oc
                LEFT JOIN "Filiere" f ON f."id" = oc."filiereId"
                WHERE oc."ouvrageId" = ANY($1)
                ORDER BY f."nom" ASC NULLS LAST, oc."niveau" ASC`, ids)
	if err != nil {
		return fmt.Errorf("query ouvrage classes: %w", err)
	}
	defer rows.Close()

	byOuvrage := make(map[string][]domain.OuvrageClasseRef, len(ouvrages))
	for rows.Next() {
		var oid, filiereID, niveau string
		var filID, filCode, filNom *string
		if err := rows.Scan(&oid, &filiereID, &niveau, &filID, &filCode, &filNom); err != nil {
			return fmt.Errorf("scan ouvrage classe: %w", err)
		}
		ref := domain.OuvrageClasseRef{FiliereID: filiereID, Niveau: niveau}
		if filID != nil && filCode != nil {
			ref.Filiere = &domain.OuvrageFiliereRef{
				ID:   *filID,
				Code: derefStr(filCode),
				Nom:  derefStr(filNom),
			}
		}
		byOuvrage[oid] = append(byOuvrage[oid], ref)
	}
	for _, o := range ouvrages {
		if classes, ok := byOuvrage[o.ID]; ok {
			o.Classes = classes
		}
	}
	return nil
}

// List — catalogue paginé + filtré (ADR-0007 §API ; 000137 : filtres
// provenance/Statut).
//
// SÉMANTIQUE DES FILTRES filiere/niveau (recommandation, ADR-0007) :
// NULL = « pertinent pour tous » → le filtre matche les ouvrages de la
// valeur demandée OU sans restriction (filiereId IS NULL / niveau IS NULL).
//
// NB niveau : Ouvrage.niveau est TYPÉ enum NiveauEtude en DB (000123). La
// comparaison `o."niveau" = $n` laisse PG inférer $n du type de la colonne
// (exact-match) — JAMAIS de cast ::text ici (leçon ENUM-SWEEP-1 : comparer
// un enum à du text = 42883). Idem visibility (VisibiliteOuvrage, 000137).
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
		if params.Visibilite != "" {
			where = append(where, fmt.Sprintf(`o."visibility" = %s`, addArg(string(params.Visibilite))))
		}
		if params.Statut != "" {
			where = append(where, fmt.Sprintf(`o."statut" = %s`, addArg(string(params.Statut))))
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
		// Ciblage CLASSE (2e passe groupée, même tx).
		return loadOuvrageClasses(ctx, tx, result.Ouvrages)
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
		return loadOuvrageClasses(ctx, tx, []*domain.Ouvrage{o})
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// insertOuvrageClasses — insère le ciblage CLASSE d'un ouvrage (même tx
// que l'INSERT/UPDATE de l'ouvrage : RANSAC impossible — la policy
// OuvrageClasse_insert 000137 exige la classe ∈ classes de l'enseignant).
func insertOuvrageClasses(ctx context.Context, tx pgx.Tx, ouvrageID string, classes []domain.OuvrageClasseInput) ([]domain.OuvrageClasseRef, error) {
	refs := make([]domain.OuvrageClasseRef, 0, len(classes))
	for _, c := range classes {
		var filID, filCode, filNom *string
		row := tx.QueryRow(ctx, `
                        INSERT INTO "OuvrageClasse" ("id", "ouvrageId", "filiereId", "niveau")
                        VALUES ($1, $2, $3, $4)
                        RETURNING "filiereId", "niveau",
                                (SELECT f."id" FROM "Filiere" f WHERE f."id" = $3),
                                (SELECT f."code" FROM "Filiere" f WHERE f."id" = $3),
                                (SELECT f."nom" FROM "Filiere" f WHERE f."id" = $3)`,
			uuid.NewString(), ouvrageID, c.FiliereID, c.Niveau)
		var filiereID, niveau string
		if err := row.Scan(&filiereID, &niveau, &filID, &filCode, &filNom); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) {
				if pgErr.Code == "23503" {
					return nil, &domain.ValidationError{Field: "classes", Message: "classe inexistante (filière introuvable)"}
				}
				if pgErr.Code == "23505" {
					continue // doublon (ouvrageId, filiereId, niveau) : idempotent
				}
				if pgErr.Code == "42501" {
					return nil, &domain.UnauthorizedError{Message: "ciblage refusé : la classe doit être une de vos classes (usurpation impossible)"}
				}
			}
			return nil, fmt.Errorf("insert ouvrage classe: %w", err)
		}
		ref := domain.OuvrageClasseRef{FiliereID: filiereID, Niveau: niveau}
		if filID != nil && filCode != nil {
			ref.Filiere = &domain.OuvrageFiliereRef{
				ID:   *filID,
				Code: derefStr(filCode),
				Nom:  derefStr(filNom),
			}
		}
		refs = append(refs, ref)
	}
	return refs, nil
}

// Create — INSERT + ciblage classes + relecture (000137 : dépôt
// ADMIN/RESPONSABLE/ENSEIGNANT, périmètre dérivé du rôle par le usecase).
// SECT-BIBLIO-10 : l'INSERT est émis SANS RETURNING, puis la ligne est
// relue dans la MÊME transaction APRÈS le ciblage classes. Pourquoi :
// Ouvrage_select délègue à ouvrage_visible(), qui RE-SCANNÉ la table
// « Ouvrage » — or l'évaluation de la policy SELECT imposée par un
// RETURNING s'exécute avec le snapshot pris au DÉBUT de la commande,
// qui ne contient PAS la ligne en cours d'insertion → 42501 « new row
// violates row-level security policy » pour TOUS les rôles (premier
// dépôt réel de l'exploitant, reproduction minimale en worklog : une
// policy SELECT à re-scan de la MÊME table via une fonction casse le
// RETURNING ; une policy inline le laisse passer). INSERT seul
// n'évalue que la policy INSERT (WITH CHECK inline par rôle) → passe ;
// le statement suivant (relecture) prend un snapshot neuf qui CONTIENT
// la ligne (READ COMMITTED). L'ordre classes-avant-relecture couvre
// l'ENSEIGNANT : son brouillon n'est visible via la branche CLASSE∩classes
// qu'une fois le ciblage posé (et 000139 ajoute la branche déposant).
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
		// etablissementId NULL pour un dépôt PLATEFORME de l'ADMIN
		// global (000137) ; sinon l'établissement dérivé du rôle.
		var etabID any
		if input.EtablissementID != "" {
			etabID = input.EtablissementID
		}
		// SECT-BIBLIO-10 : PAS de RETURNING (piège snapshot × policy SELECT
		// à re-scan — cf. doc-comment de la fonction). Erreurs honnêtes :
		// FK invalide → 400 ; 42501 = WITH CHECK par rôle (périmètre).
		_, err := tx.Exec(ctx, `
                        INSERT INTO "Ouvrage" ("id", "etablissementId", "titre", "auteurs", "categorie",
                                "editeur", "edition", "anneePublication", "isbn", "langue",
                                "filiereId", "niveau", "themes", "description", "licenceOrigine",
                                "dateExpirationDroits", "nomFichier", "cheminStockage", "tailleFichier",
                                "typeMime", "telechargementAutorise", "visibility", "statut", "createdById",
                                "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5,
                                $6, $7, $8, $9, $10,
                                $11, $12, $13, $14, $15,
                                $16, $17, $18, $19,
                                $20, $21, $22, $23, $24,
                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			id, etabID, input.Titre, nullableStrPtr(input.Auteurs), string(input.Categorie),
			nullableStrPtr(input.Editeur), nullableStrPtr(input.Edition), nullableIntPtr(input.AnneePublication),
			nullableStrPtr(input.ISBN), nullableStrPtr(input.Langue),
			nullableStrPtr(input.FiliereID), nullableStrPtr(input.Niveau), nullableStrPtr(input.Themes),
			nullableStrPtr(input.Description), input.LicenceOrigine,
			nullableTimePtr(input.DateExpirationDroits), input.NomFichier, nullableStrPtr(input.CheminStockage),
			input.TailleFichier, input.TypeMime, input.TelechargementAutorise,
			string(input.Visibility), string(input.Statut), input.CreatedByID)
		if err != nil {
			// FK invalide (filière/établissement inexistant) → 400 pour le
			// client, pas de 500 (leçon SECT-PRODUIT-1 : erreurs honnêtes).
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23503" {
				return &domain.ValidationError{Field: "filiereId|etablissementId", Message: "référence inexistante (filière ou établissement)"}
			}
			if errors.As(err, &pgErr) && pgErr.Code == "42501" {
				return &domain.UnauthorizedError{Message: "dépôt refusé : le périmètre est dérivé de votre rôle (RLS 000137)"}
			}
			return fmt.Errorf("create ouvrage: %w", err)
		}

		// Ciblage CLASSE (même tx : RLS évaluée avant contraintes —
		// une classe usurpée produit 42501, pas de ligne zombie). Le
		// RETURNING de OuvrageClasse est SÛR ici : sa policy délègue à
		// ouvrage_parent_gestionnable, qui re-scanne « Ouvrage » — le
		// parent vient du statement PRÉCÉDENT, donc présent dans le
		// snapshot de CE statement (READ COMMITTED, par-statement).
		var classeRefs []domain.OuvrageClasseRef
		if len(input.Classes) > 0 {
			refs, err := insertOuvrageClasses(ctx, tx, id, input.Classes)
			if err != nil {
				return err
			}
			classeRefs = refs
		}

		// Relecture (statement suivant = snapshot neuf → la ligne y
		// figure ; les classes aussi pour l'intersection CLASSE).
		row := tx.QueryRow(ctx, fmt.Sprintf(`
                        SELECT %s
                        FROM "Ouvrage" o
                        WHERE o."id" = $1`, columnsOuvrage), id)
		o, err := scanOuvrage(row)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// Ne devrait jamais se produire (ligne insérée invisible =
				// policy SELECT incohérente) — erreur honnête plutôt que 404.
				return fmt.Errorf("create ouvrage: ligne insérée invisible en relecture (policy SELECT) — id %s", id)
			}
			return fmt.Errorf("create ouvrage (relecture): %w", err)
		}
		if classeRefs != nil {
			o.Classes = classeRefs
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
		// 000137 : promotion/démotion de périmètre (le usecase a déjà
		// vérifié ADMIN seul) et modération de statut.
		if input.Visibility != nil {
			addSet(`"visibility"`, string(*input.Visibility))
		}
		if input.Statut != nil {
			addSet(`"statut"`, string(*input.Statut))
		}

		if len(sets) == 0 && input.Classes == nil && !input.UnsetClasses {
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
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "42501" {
				return &domain.UnauthorizedError{Message: "modification refusée : hors de votre périmètre (RLS 000137)"}
			}
			return fmt.Errorf("update ouvrage: %w", err)
		}
		out = o

		// Remplacement du ciblage CLASSE (même tx ; la policy
		// OuvrageClasse_insert scelle l'intersection serveur).
		if input.Classes != nil || input.UnsetClasses {
			if _, err := tx.Exec(ctx, `DELETE FROM "OuvrageClasse" WHERE "ouvrageId" = $1`, id); err != nil {
				return fmt.Errorf("replace ouvrage classes (delete): %w", err)
			}
			refs, err := insertOuvrageClasses(ctx, tx, id, input.Classes)
			if err != nil {
				return err
			}
			out.Classes = refs
		}
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

// SumTaillesPlateforme — quota du catalogue commun (ouvrages
// PLATEFORME, 000137) ; soft-deleted inclus. Comparaison enum contre
// un LITTÉRAL (jamais un paramètre text — leçon ENUM-SWEEP-1).
func (r *OuvrageRepository) SumTaillesPlateforme(ctx context.Context) (int64, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return 0, fmt.Errorf("no RLS claims in context")
	}

	var total int64
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
                        SELECT COALESCE(SUM("tailleFichier"), 0)
                        FROM "Ouvrage"
                        WHERE "visibility" = 'PLATEFORME'`,
		).Scan(&total); err != nil {
			return fmt.Errorf("sum tailles ouvrages plateforme: %w", err)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return total, nil
}

// MesClassesEnseignant — les classes (filière, niveau) de l'enseignant
// courant : EnseignantFiliere scannée sous RLS (policy 000024 :
// l'enseignant voit SES lignes uniquement).
func (r *OuvrageRepository) MesClassesEnseignant(ctx context.Context) ([]domain.OuvrageClasseRef, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var out []domain.OuvrageClasseRef
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT ef."filiereId", ef."niveau", f."id", f."code", f."nom"
                        FROM "EnseignantFiliere" ef
                        LEFT JOIN "Filiere" f ON f."id" = ef."filiereId"
                        WHERE ef."enseignantId" = $1
                        ORDER BY f."nom" ASC NULLS LAST, ef."niveau" ASC`, claims.UserID)
		if err != nil {
			return fmt.Errorf("query mes classes: %w", err)
		}
		defer rows.Close()

		out = []domain.OuvrageClasseRef{}
		for rows.Next() {
			var filiereID, niveau string
			var filID, filCode, filNom *string
			if err := rows.Scan(&filiereID, &niveau, &filID, &filCode, &filNom); err != nil {
				return fmt.Errorf("scan mes classes: %w", err)
			}
			ref := domain.OuvrageClasseRef{FiliereID: filiereID, Niveau: niveau}
			if filID != nil && filCode != nil {
				ref.Filiere = &domain.OuvrageFiliereRef{
					ID:   *filID,
					Code: derefStr(filCode),
					Nom:  derefStr(filNom),
				}
			}
			out = append(out, ref)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
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
