// Package repository — implémentation AlignementRepository (ADR-0007 §P3,
// migration 000126). La déclaration support ↔ ouvrage : INSERT owner ENS
// (policy insert : document ownerId = current_user_id() OU admin/system,
// ET ouvrage visible) ; lecture etab-scopée (EXISTS sur les DEUX parents).
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

// AlignementRepository implémente domain.AlignementRepository.
type AlignementRepository struct {
	pool *pgxpool.Pool
}

// NewAlignementRepository crée un nouveau AlignementRepository.
func NewAlignementRepository(pool *pgxpool.Pool) *AlignementRepository {
	return &AlignementRepository{pool: pool}
}

// parseJSONArrayText — parse un TEXT-JSON ("[\"a\",\"b\"]") en []string.
// Tolérant : NULL/vide/JSON invalide → nil (pattern télémétrie tolérante P2
// — une métadonnée d'ouvrage sale ne doit jamais casser la bibliographie).
func parseJSONArrayText(raw *string) []string {
	if raw == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(trimmed), &out); err != nil {
		return nil
	}
	return out
}

// scanAlignementRow — scan UNE PASSE (pattern scanOuvrageRow) :
// colonnes AlignementOuvrage + columnsOuvrage + columnsOuvrageSection.
// Les LEFT JOIN rendent ouvrage/section nil-ables.
func scanAlignementRow(s scanner) (*domain.AlignementOuvrage, error) {
	a := &domain.AlignementOuvrage{}
	o := &domain.Ouvrage{}
	// LEFT JOIN → pointeurs pour détecter l'absence de ligne jointe
	// (section NULL = déclaration « ouvrage entier » ; ouvrage toujours
	// présent par FK CASCADE + policy select, mais défensif).
	var oID *string
	var secID, secOuvrageID, secTitre *string
	var secPageDebut, secPageFin, secOrdre *int
	var secCreatedAt *time.Time
	err := s.Scan(
		&a.ID, &a.DocumentID, &a.OuvrageID, &a.OuvrageSectionID, &a.DeclareParID,
		&a.Note, &a.CreatedAt, &a.UpdatedAt,
		&oID, &o.EtablissementID, &o.Titre, &o.Auteurs, &o.Categorie,
		&o.Editeur, &o.Edition, &o.AnneePublication, &o.ISBN, &o.Langue,
		&o.FiliereID, &o.Niveau, &o.Themes, &o.Description, &o.LicenceOrigine,
		&o.DateExpirationDroits, &o.NomFichier, &o.CheminStockage, &o.TailleFichier,
		&o.TypeMime, &o.TelechargementAutorise, &o.CreatedByID,
		&o.CreatedAt, &o.UpdatedAt, &o.DeletedAt,
		&secID, &secOuvrageID, &secTitre, &secPageDebut, &secPageFin, &secOrdre, &secCreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if oID != nil {
		o.ID = *oID
		a.Ouvrage = o
		// DroitsExpires — dérivé (badge UI, pattern scanOuvrage).
		if o.DateExpirationDroits != nil && o.DateExpirationDroits.Before(time.Now()) {
			o.DroitsExpires = true
		}
	}
	if secID != nil {
		a.Section = &domain.OuvrageSection{
			ID:        *secID,
			OuvrageID: derefStr(secOuvrageID),
			Titre:     derefStr(secTitre),
			PageDebut: secPageDebut,
			PageFin:   secPageFin,
			Ordre:     derefIntLocal(secOrdre),
			CreatedAt: derefTimeLocal(secCreatedAt),
		}
	}
	return a, nil
}

// ListByDocument — déclarations d'un support + ouvrage + section (RLS :
// EXISTS sur les DEUX parents — un ouvrage masqué rend la déclaration
// invisible, cohérent P1/P2). Ordonnée par date de déclaration.
func (r *AlignementRepository) ListByDocument(ctx context.Context, documentID string) ([]*domain.AlignementOuvrage, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("ListByDocument: claims manquants dans le context")
	}

	var result []*domain.AlignementOuvrage
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT a."id", a."documentId", a."ouvrageId", a."ouvrageSectionId", a."declareParId",
			       a."note", a."createdAt", a."updatedAt",
			       %s,
			       %s
			FROM "AlignementOuvrage" a
			LEFT JOIN "Ouvrage" o ON o."id" = a."ouvrageId"
			LEFT JOIN "OuvrageSection" s ON s."id" = a."ouvrageSectionId"
			WHERE a."documentId" = $1
			ORDER BY a."createdAt" ASC
		`, columnsOuvrage, columnsOuvrageSection), documentID)
		if err != nil {
			return fmt.Errorf("query alignements: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			a, err := scanAlignementRow(rows)
			if err != nil {
				return fmt.Errorf("scan alignement: %w", err)
			}
			result = append(result, a)
		}
		if result == nil {
			result = []*domain.AlignementOuvrage{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// mapAlignementWriteError — leçons 000124 : RLS AVANT contraintes sur
// INSERT (document non possédé → 42501) ; 23505 = doublon NULLS NOT
// DISTINCT ; 23503 = ouvrage/section réellement inexistants (pour un
// owner légitime qui voit l'ouvrage).
func mapAlignementWriteError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			return &domain.ConflictError{Message: "cet alignement est déjà déclaré pour ce support (ouvrage + section identiques)"}
		case "23503":
			return &domain.ValidationError{Field: "ouvrageId|ouvrageSectionId", Message: "ouvrage ou section introuvable"}
		case "42501":
			return &domain.NotFoundError{Entity: "Document", ID: "alignement"}
		}
	}
	return err
}

// Create — déclaration (owner ENS validé côté usecase via Document
// FindByID ; la policy insert re-vérifie ownerId = current_user_id()).
func (r *AlignementRepository) Create(ctx context.Context, documentID string, input domain.CreateAlignementInput, declareParID string) (*domain.AlignementOuvrage, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("Create: claims manquants dans le context")
	}

	var created *domain.AlignementOuvrage
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		id := uuid.NewString()
		_, err := tx.Exec(ctx, `
			INSERT INTO "AlignementOuvrage" ("id", "documentId", "ouvrageId", "ouvrageSectionId", "declareParId", "note", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		`, id, documentID, input.OuvrageID, nullableStrPtr(input.OuvrageSectionID), declareParID, nullableStrPtr(input.Note))
		if err != nil {
			return mapAlignementWriteError(fmt.Errorf("create alignement: %w", err))
		}
		row := tx.QueryRow(ctx, `
			SELECT a."id", a."documentId", a."ouvrageId", a."ouvrageSectionId", a."declareParId",
			       a."note", a."createdAt", a."updatedAt"
			FROM "AlignementOuvrage" a WHERE a."id" = $1
		`, id)
		a := &domain.AlignementOuvrage{}
		if err := row.Scan(&a.ID, &a.DocumentID, &a.OuvrageID, &a.OuvrageSectionID, &a.DeclareParID, &a.Note, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return fmt.Errorf("re-read alignement: %w", err)
		}
		created = a
		return nil
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}

// Delete — owner/admin (policy delete). 0 ligne = NotFound (RLS silencieuse
// OU id inexistant — indiscernable, anti-énumération cohérent P1).
func (r *AlignementRepository) Delete(ctx context.Context, documentID, alignementID string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return fmt.Errorf("Delete: claims manquants dans le context")
	}

	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `DELETE FROM "AlignementOuvrage" WHERE "id" = $1 AND "documentId" = $2`, alignementID, documentID)
		if err != nil {
			return fmt.Errorf("delete alignement: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return &domain.NotFoundError{Entity: "Alignement", ID: alignementID}
		}
		return nil
	})
}

// MateriauPourSuggestions — collecte des matières premières du retrieval :
// thèmes du support (Document.themesDetectes), sujets de ses chapitres
// (Chapter.sujets), ouvrages visibles de l'étab du propriétaire, et les
// ouvrageId déjà déclarés pour ce support. Le scoring est côté usecase.
//
// RLS : sous claims de l'appelant — l'owner ENS voit SES chapitres et les
// ouvrages de SON etab. Pour un ADMIN sur le support d'autrui, les
// chapitres peuvent être filtrés (Chapter_select sans branche admin) —
// le retrieval dégrade sur les seuls thèmes, acceptable et documenté.
func (r *AlignementRepository) MateriauPourSuggestions(ctx context.Context, documentID string) (*domain.AlignementMateriau, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("MateriauPourSuggestions: claims manquants dans le context")
	}

	mat := &domain.AlignementMateriau{ThemesSupport: []string{}, SujetsSupport: []string{}, Ouvrages: []*domain.Ouvrage{}, DejaAligneIDs: []string{}}
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		// 1. Le document + son propriétaire + son établissement (RLS
		// Document_select = contrôle de visibilité honnête pour tout rôle).
		// NB : user_etab_id (SECURITY DEFINER) plutôt qu'un JOIN "User" — le
		// JOIN hériterait de la RLS User (un étudiant ne voit pas la ligne
		// User de l'enseignant) et casserait la bibliographie étudiante.
		var themesJSON, etabID *string
		var nomFichier, ownerID string
		err := tx.QueryRow(ctx, `
			SELECT d."themesDetectes", user_etab_id(d."ownerId"), d."nomFichier", d."ownerId"
			FROM "Document" d
			WHERE d."id" = $1 AND d."deletedAt" IS NULL
		`, documentID).Scan(&themesJSON, &etabID, &nomFichier, &ownerID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Document", ID: documentID}
			}
			return fmt.Errorf("query document materiau: %w", err)
		}
		mat.NomFichier = nomFichier
		mat.OwnerID = ownerID
		if etabID != nil {
			mat.EtablissementID = *etabID
		}
		mat.ThemesSupport = parseJSONArrayText(themesJSON)

		// 2. Sujets des chapitres (mots-clés plus fins que les titres).
		rows, err := tx.Query(ctx, `
			SELECT c."sujets" FROM "Chapter" c WHERE c."documentId" = $1
		`, documentID)
		if err != nil {
			return fmt.Errorf("query chapters sujets: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var sujets *string
			if err := rows.Scan(&sujets); err != nil {
				return fmt.Errorf("scan chapter sujets: %w", err)
			}
			mat.SujetsSupport = append(mat.SujetsSupport, parseJSONArrayText(sujets)...)
		}

		// 3. Ouvrages visibles de l'étab (les MÊMES conditions que
		// Ouvrage_select — le retrieval ne propose que du visible).
		rows2, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT %s
			FROM "Ouvrage" o
			WHERE o."etablissementId" = $1
			  AND o."deletedAt" IS NULL
			  AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now())
			ORDER BY o."titre" ASC
		`, columnsOuvrage), etabID)
		if err != nil {
			return fmt.Errorf("query ouvrages materiau: %w", err)
		}
		defer rows2.Close()
		for rows2.Next() {
			o, err := scanOuvrage(rows2)
			if err != nil {
				return fmt.Errorf("scan ouvrage materiau: %w", err)
			}
			mat.Ouvrages = append(mat.Ouvrages, o)
		}

		// 4. Déjà déclarés (pour marquer DejaAligne côté UI).
		rows3, err := tx.Query(ctx, `
			SELECT a."ouvrageId" FROM "AlignementOuvrage" a WHERE a."documentId" = $1
		`, documentID)
		if err != nil {
			return fmt.Errorf("query deja aligne: %w", err)
		}
		defer rows3.Close()
		for rows3.Next() {
			var oid string
			if err := rows3.Scan(&oid); err != nil {
				return fmt.Errorf("scan deja aligne: %w", err)
			}
			mat.DejaAligneIDs = append(mat.DejaAligneIDs, oid)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return mat, nil
}

// ConformiteEtablissement — appel de la fonction SECURITY DEFINER
// conformite_referentiels_etablissement (000126). La fonction cloisonne
// rôle+etab SUR les claims de la transaction (pattern 000124) — le usecase
// double-vérifie (defense in depth).
func (r *AlignementRepository) ConformiteEtablissement(ctx context.Context, etablissementID string) ([]*domain.ConformiteSupport, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("ConformiteEtablissement: claims manquants dans le context")
	}

	var result []*domain.ConformiteSupport
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT document_id, nom_fichier, enseignant, ue_code,
			       nb_chapitres, nb_questions, nb_questions_alignees,
			       nb_alignements, nb_alignements_referentiel,
			       taux_couverture, dernier_alignement, epreuves
			FROM conformite_referentiels_etablissement($1)
			ORDER BY enseignant ASC, nom_fichier ASC
		`, etablissementID)
		if err != nil {
			return fmt.Errorf("query conformite: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			cs := &domain.ConformiteSupport{Epreuves: []domain.ConformiteEpreuve{}}
			var epreuvesJSON []byte
			if err := rows.Scan(&cs.DocumentID, &cs.NomFichier, &cs.Enseignant, &cs.UECode,
				&cs.NbChapitres, &cs.NbQuestions, &cs.NbQuestionsAlignees,
				&cs.NbAlignements, &cs.NbAlignementsReferentiel,
				&cs.TauxCouverture, &cs.DernierAlignementAt, &epreuvesJSON); err != nil {
				return fmt.Errorf("scan conformite: %w", err)
			}
			if len(epreuvesJSON) > 0 && string(epreuvesJSON) != "null" {
				var eps []domain.ConformiteEpreuve
				if err := json.Unmarshal(epreuvesJSON, &eps); err == nil && len(eps) > 0 {
					cs.Epreuves = eps
				}
			}
			result = append(result, cs)
		}
		if result == nil {
			result = []*domain.ConformiteSupport{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// derefIntLocal — deref défensif (LEFT JOIN section NULL-able).
func derefIntLocal(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

// derefTimeLocal — deref défensif (LEFT JOIN section NULL-able).
func derefTimeLocal(p *time.Time) time.Time {
	if p == nil {
		return time.Time{}
	}
	return *p
}
