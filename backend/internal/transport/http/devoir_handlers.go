// Package http — handlers pour /api/devoirs (mutations + détail).
//
// P2-DEVOIRS-1 : complète les 2 routes lecture-seule existantes
// (devoirsListReal, devoirsStatsReal dans stub_handlers_real2.go) avec les
// mutations attendues par le frontend (devoirs-page.tsx).
//
// Routes ajoutées (router.go) :
//   POST   /api/devoirs            — création (ENSEIGNANT)
//   GET    /api/devoirs/{id}       — détail avec Soumission[] (ENSEIGNANT)
//   PATCH  /api/devoirs/{id}       — update champs OU action (publish/close/archive/reopen)
//   DELETE /api/devoirs/{id}       — soft delete (deletedAt = now)
//
// Pattern : handlers directs sur s.dbPool (conforme à devoirsListReal +
// aiGradeSession), pas de nouveau usecase. RLS on via WithTx (claims posés).
// IDs via uuid.NewString() (github.com/google/uuid, conforme au codebase).
// pgx Simple Protocol : placeholders $1, $2, … distincts, pas de LATERAL.
package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// DTOs partagés (identiques à ceux de devoirsListReal pour cohérence)
// ──────────────────────────────────────────────────────────────────────────

type devoirUserDTO struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type devoirUEDTO struct {
	ID     string `json:"id"`
	Code   string `json:"code"`
	Nom    string `json:"nom"`
	Niveau string `json:"niveau,omitempty"`
}

type devoirGrilleDTO struct {
	ID       string `json:"id"`
	Criteres string `json:"criteres"`
}

// devoirSoumissionListDTO — soumission complète côté enseignant (avec User étudiant)
type devoirSoumissionListDTO struct {
	ID                    string   `json:"id"`
	DevoirID              string   `json:"devoirId"`
	EtudiantID            string   `json:"etudiantId"`
	ContenuTexte          *string  `json:"contenuTexte"`
	FichiersSoumis        *string  `json:"fichiersSoumis"`
	CommentaireEtudiant   *string  `json:"commentaireEtudiant"`
	Statut                string   `json:"statut"`
	RenduAt               *string  `json:"renduAt"`
	Note                  *float64 `json:"note"`
	CommentaireEnseignant *string  `json:"commentaireEnseignant"`
	NoteIA                *float64 `json:"noteIA"`
	JustificationIA       *string  `json:"justificationIA"`
	CreatedAt             string   `json:"createdAt"`
	UpdatedAt             string   `json:"updatedAt"`
	User                  struct {
		ID        string  `json:"id"`
		Name      string  `json:"name"`
		Email     string  `json:"email"`
		Matricule *string `json:"matricule"`
	} `json:"User"`
}

// devoirDetailDTO — matche le type TS Devoir (devoirs-types.ts) côté enseignant
type devoirDetailDTO struct {
	ID                  string                  `json:"id"`
	Titre               string                  `json:"titre"`
	Description         *string                 `json:"description"`
	Consignes           *string                 `json:"consignes"`
	UniteEnseignementID string                  `json:"uniteEnseignementId"`
	EnseignantID        string                  `json:"enseignantId"`
	TypeSeance          string                  `json:"typeSeance"`
	DatePublication     *string                 `json:"datePublication"`
	DateLimite          string                  `json:"dateLimite"`
	NoteMax             float64                 `json:"noteMax"`
	RenduFichiers       *string                 `json:"renduFichiers"`
	SoumissionGroupe    bool                    `json:"soumissionGroupe"`
	NbMaxFichiers       int                     `json:"nbMaxFichiers"`
	TailleMaxFichier    int                     `json:"tailleMaxFichier"`
	Statut              string                  `json:"statut"`
	AnneeUniversitaire  string                  `json:"anneeUniversitaire"`
	CreatedAt           string                  `json:"createdAt"`
	UpdatedAt           string                  `json:"updatedAt"`
	User                devoirUserDTO           `json:"User"`
	UniteEnseignement   devoirUEDTO             `json:"UniteEnseignement"`
	GrilleEvaluation    *devoirGrilleDTO        `json:"GrilleEvaluation"`
	SoumissionCount     int                     `json:"soumissionCount"`
	Soumission          []devoirSoumissionListDTO `json:"Soumission"`
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/devoirs — création (ENSEIGNANT)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) createDevoir(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ENSEIGNANT" {
		writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
		return
	}

	var input struct {
		Titre               string  `json:"titre"`
		Description         *string `json:"description"`
		Consignes           *string `json:"consignes"`
		UniteEnseignementID string  `json:"uniteEnseignementId"`
		EnseignantID        string  `json:"enseignantId"`
		TypeSeance          string  `json:"typeSeance"`
		DatePublication     *string `json:"datePublication"`
		DateLimite          string  `json:"dateLimite"`
		NoteMax             float64 `json:"noteMax"`
		RenduFichiers       *string `json:"renduFichiers"`
		SoumissionGroupe    bool    `json:"soumissionGroupe"`
		NbMaxFichiers       int     `json:"nbMaxFichiers"`
		TailleMaxFichier    int     `json:"tailleMaxFichier"`
		AnneeUniversitaire  string  `json:"anneeUniversitaire"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, " corps de requête invalide")
		return
	}

	// Validations (concordent avec le frontend devoirs-page.tsx handleSubmit)
	if input.Titre == "" || input.UniteEnseignementID == "" || input.DateLimite == "" {
		writeJSONError(w, http.StatusBadRequest, "titre, uniteEnseignementId et dateLimite sont requis")
		return
	}
	if input.EnseignantID == "" {
		input.EnseignantID = claims.UserID
	}
	if input.EnseignantID != claims.UserID {
		writeJSONError(w, http.StatusForbidden, "un enseignant ne peut créer un devoir que pour lui-même")
		return
	}
	if input.TypeSeance == "" {
		input.TypeSeance = "TD"
	}
	if input.NoteMax == 0 {
		input.NoteMax = 20
	}
	if input.NbMaxFichiers == 0 {
		input.NbMaxFichiers = 5
	}
	if input.TailleMaxFichier == 0 {
		input.TailleMaxFichier = 10485760 // 10 Mo
	}
	if input.AnneeUniversitaire == "" {
		input.AnneeUniversitaire = "2024-2025"
	}

	// Parse dateLimite (frontend envoie datetime-local ISO)
	dateLimite, err := time.Parse(time.RFC3339, input.DateLimite)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "dateLimite invalide (format RFC3339 attendu)")
		return
	}
	var datePub *time.Time
	if input.DatePublication != nil && *input.DatePublication != "" {
		t, err := time.Parse(time.RFC3339, *input.DatePublication)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "datePublication invalide")
			return
		}
		datePub = &t
	}

	id := uuid.NewString()
	var created devoirDetailDTO
	var (
		createdAt, updatedAt         time.Time
		ueNiveau                     string
		grilleID, grilleCriteres     *string
		descr, consignes, renduFich  *string
		datePubDB                    *time.Time
	)

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			INSERT INTO "Devoir" (
				"id", "titre", "description", "consignes",
				"uniteEnseignementId", "enseignantId", "typeSeance",
				"datePublication", "dateLimite", "noteMax",
				"renduFichiers", "soumissionGroupe", "nbMaxFichiers",
				"tailleMaxFichier", "statut", "anneeUniversitaire",
				"createdAt", "updatedAt"
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'BROUILLON', $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			RETURNING
				"id", "titre", "description", "consignes",
				"uniteEnseignementId", "enseignantId", "typeSeance"::text,
				"datePublication", "dateLimite", "noteMax",
				"renduFichiers", "soumissionGroupe", "nbMaxFichiers",
				"tailleMaxFichier", "statut"::text, "anneeUniversitaire",
				"createdAt", "updatedAt"
		`,
			id, input.Titre, input.Description, input.Consignes,
			input.UniteEnseignementID, input.EnseignantID, input.TypeSeance,
			datePub, dateLimite, input.NoteMax,
			input.RenduFichiers, input.SoumissionGroupe, input.NbMaxFichiers,
			input.TailleMaxFichier, input.AnneeUniversitaire,
		).Scan(
			&created.ID, &created.Titre, &descr, &consignes,
			&created.UniteEnseignementID, &created.EnseignantID, &created.TypeSeance,
			&datePubDB, &dateLimite, &created.NoteMax,
			&renduFich, &created.SoumissionGroupe, &created.NbMaxFichiers,
			&created.TailleMaxFichier, &created.Statut, &created.AnneeUniversitaire,
			&createdAt, &updatedAt,
		)
	})

	// Joins UE + User (via une 2e tx — léger surcoût mais isole les erreurs)
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			SELECT ue."id", ue."code", ue."nom", COALESCE(ue."niveau"::text, ''),
			       u."id", u."name", u."email"
			FROM "Devoir" d
			JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
			JOIN "User" u ON u."id" = d."enseignantId"
			WHERE d."id" = $1
		`, id).Scan(
			&created.UniteEnseignement.ID, &created.UniteEnseignement.Code,
			&created.UniteEnseignement.Nom, &ueNiveau,
			&created.User.ID, &created.User.Name, &created.User.Email,
		)
	})

	created.Description = descr
	created.Consignes = consignes
	created.RenduFichiers = renduFich
	created.DateLimite = dateLimite.UTC().Format(time.RFC3339)
	if datePubDB != nil {
		ts := datePubDB.UTC().Format(time.RFC3339)
		created.DatePublication = &ts
	}
	created.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	created.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	if ueNiveau != "" {
		created.UniteEnseignement.Niveau = ueNiveau
	}
	// À la création, aucune grille n'existe encore (créée séparément via
	// /api/grilles-evaluation). On l'initialise à nil et Soumission à [].
	created.GrilleEvaluation = devoirGrilleDTOPtr(grilleID, grilleCriteres)
	created.Soumission = []devoirSoumissionListDTO{}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"devoir": created,
	})
}

// devoirGrilleDTOPtr helper (évite l'expression booléenne complexe ci-dessus)
func devoirGrilleDTOPtr(id, criteres *string) *devoirGrilleDTO {
	if id == nil || criteres == nil {
		return nil
	}
	return &devoirGrilleDTO{ID: *id, Criteres: *criteres}
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/devoirs/{id} — détail avec Soumission[] (ENSEIGNANT)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) getDevoir(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	devoirID := chi.URLParam(r, "id")
	if devoirID == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var (
		d        devoirDetailDTO
		createdAt, updatedAt time.Time
		dateLimite *time.Time
		datePubDB  *time.Time
		ueNiveau   string
		descr, consignes, renduFich *string
		grilleID, grilleCriteres *string
	)

	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT
				d."id", d."titre", d."description", d."consignes",
				d."uniteEnseignementId", d."enseignantId", d."typeSeance"::text,
				d."datePublication", d."dateLimite", d."noteMax",
				d."renduFichiers", d."soumissionGroupe", d."nbMaxFichiers",
				d."tailleMaxFichier", d."statut"::text, d."anneeUniversitaire",
				d."createdAt", d."updatedAt",
				u."id", u."name", u."email",
				ue."id", ue."code", ue."nom", COALESCE(ue."niveau"::text, ''),
				g."id", g."criteres",
				COALESCE((SELECT count(*) FROM "Soumission" sub WHERE sub."devoirId" = d."id" AND sub."deletedAt" IS NULL AND sub."statut"::text = 'SOUMIS'), 0)
			FROM "Devoir" d
			LEFT JOIN "User" u ON u."id" = d."enseignantId"
			LEFT JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
			LEFT JOIN "GrilleEvaluation" g ON g."devoirId" = d."id"
			WHERE d."id" = $1 AND d."deletedAt" IS NULL
		`, devoirID).Scan(
			&d.ID, &d.Titre, &descr, &consignes,
			&d.UniteEnseignementID, &d.EnseignantID, &d.TypeSeance,
			&datePubDB, &dateLimite, &d.NoteMax,
			&renduFich, &d.SoumissionGroupe, &d.NbMaxFichiers,
			&d.TailleMaxFichier, &d.Statut, &d.AnneeUniversitaire,
			&createdAt, &updatedAt,
			&d.User.ID, &d.User.Name, &d.User.Email,
			&d.UniteEnseignement.ID, &d.UniteEnseignement.Code, &d.UniteEnseignement.Nom, &ueNiveau,
			&grilleID, &grilleCriteres,
			&d.SoumissionCount,
		)
		if err != nil {
			return err
		}
		found = true
		return nil
	})

	if !found {
		writeJSONError(w, http.StatusNotFound, "devoir introuvable ou accès refusé")
		return
	}

	d.Description = descr
	d.Consignes = consignes
	d.RenduFichiers = renduFich
	if datePubDB != nil {
		ts := datePubDB.UTC().Format(time.RFC3339)
		d.DatePublication = &ts
	}
	if dateLimite != nil {
		d.DateLimite = dateLimite.UTC().Format(time.RFC3339)
	}
	d.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	d.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	if ueNiveau != "" {
		d.UniteEnseignement.Niveau = ueNiveau
	}
	d.GrilleEvaluation = devoirGrilleDTOPtr(grilleID, grilleCriteres)

	// Charger les Soumission[] (avec User étudiant)
	soumissions := []devoirSoumissionListDTO{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `
			SELECT
				s."id", s."devoirId", s."etudiantId",
				s."contenuTexte", s."fichiersSoumis", s."commentaireEtudiant",
				s."statut"::text, s."renduAt", s."note", s."commentaireEnseignant",
				s."noteIA", s."justificationIA",
				s."createdAt", s."updatedAt",
				u."id", u."name", u."email", u."matricule"
			FROM "Soumission" s
			LEFT JOIN "User" u ON u."id" = s."etudiantId"
			WHERE s."devoirId" = $1 AND s."deletedAt" IS NULL
			ORDER BY s."renduAt" DESC, s."createdAt" DESC
		`, devoirID)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			var sDTO devoirSoumissionListDTO
			var sRenduAt, sCreated, sUpdated time.Time
			if err := rows.Scan(
				&sDTO.ID, &sDTO.DevoirID, &sDTO.EtudiantID,
				&sDTO.ContenuTexte, &sDTO.FichiersSoumis, &sDTO.CommentaireEtudiant,
				&sDTO.Statut, &sRenduAt, &sDTO.Note, &sDTO.CommentaireEnseignant,
				&sDTO.NoteIA, &sDTO.JustificationIA,
				&sCreated, &sUpdated,
				&sDTO.User.ID, &sDTO.User.Name, &sDTO.User.Email, &sDTO.User.Matricule,
			); err == nil {
				// renduAt peut être NULL
				if !sRenduAt.IsZero() {
					ts := sRenduAt.UTC().Format(time.RFC3339)
					sDTO.RenduAt = &ts
				}
				sDTO.CreatedAt = sCreated.UTC().Format(time.RFC3339)
				sDTO.UpdatedAt = sUpdated.UTC().Format(time.RFC3339)
				soumissions = append(soumissions, sDTO)
			}
		}
		return nil
	})
	d.Soumission = soumissions

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"devoir": d,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/devoirs/{id} — update champs OU action (publish/close/archive/reopen)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) updateDevoir(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ENSEIGNANT" {
		writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
		return
	}
	devoirID := chi.URLParam(r, "id")
	if devoirID == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var input struct {
		// Soit une action (publish/close/archive/reopen)
		Action string `json:"action,omitempty"`
		// Soit des champs à updater
		Titre               *string  `json:"titre,omitempty"`
		Description         *string  `json:"description,omitempty"`
		Consignes           *string  `json:"consignes,omitempty"`
		UniteEnseignementID *string  `json:"uniteEnseignementId,omitempty"`
		TypeSeance          *string  `json:"typeSeance,omitempty"`
		DatePublication     *string  `json:"datePublication,omitempty"`
		DateLimite          *string  `json:"dateLimite,omitempty"`
		NoteMax             *float64 `json:"noteMax,omitempty"`
		RenduFichiers       *string  `json:"renduFichiers,omitempty"`
		SoumissionGroupe    *bool    `json:"soumissionGroupe,omitempty"`
		NbMaxFichiers       *int     `json:"nbMaxFichiers,omitempty"`
		TailleMaxFichier    *int     `json:"tailleMaxFichier,omitempty"`
		AnneeUniversitaire  *string  `json:"anneeUniversitaire,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}

	// Cas 1 : action (transition de statut)
	if input.Action != "" {
		var newStatut string
		switch input.Action {
		case "publish":
			newStatut = "PUBLIE"
		case "close":
			newStatut = "FERME"
		case "archive":
			newStatut = "ARCHIVE"
		case "reopen":
			newStatut = "BROUILLON"
		default:
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("action inconnue: %s (attendu: publish|close|archive|reopen)", input.Action))
			return
		}

		var updatedStatut string
		_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
			err := tx.QueryRow(r.Context(), `
				UPDATE "Devoir"
				SET "statut" = $2::"StatutDevoir", "updatedAt" = CURRENT_TIMESTAMP
				WHERE "id" = $1 AND "deletedAt" IS NULL AND "enseignantId" = $3
				RETURNING "statut"::text
			`, devoirID, newStatut, claims.UserID).Scan(&updatedStatut)
			return err
		})

		if updatedStatut == "" {
			writeJSONError(w, http.StatusNotFound, "devoir introuvable ou accès refusé")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"devoir": map[string]any{
				"id":     devoirID,
				"statut": updatedStatut,
			},
			"message": fmt.Sprintf("devoir %s", input.Action),
		})
		return
	}

	// Cas 2 : update de champs (construction dynamique SET)
	setClauses := []string{`"updatedAt" = CURRENT_TIMESTAMP`}
	var args []any
	argIdx := 1

	addSet := func(col string, val any) {
		setClauses = append(setClauses, fmt.Sprintf(`%s = $%d`, col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if input.Titre != nil {
		addSet(`"titre"`, *input.Titre)
	}
	if input.Description != nil {
		addSet(`"description"`, *input.Description)
	}
	if input.Consignes != nil {
		addSet(`"consignes"`, *input.Consignes)
	}
	if input.UniteEnseignementID != nil {
		addSet(`"uniteEnseignementId"`, *input.UniteEnseignementID)
	}
	if input.TypeSeance != nil {
		addSet(`"typeSeance"`, *input.TypeSeance)
	}
	if input.DatePublication != nil {
		if *input.DatePublication == "" {
			addSet(`"datePublication"`, nil)
		} else {
			t, err := time.Parse(time.RFC3339, *input.DatePublication)
			if err != nil {
				writeJSONError(w, http.StatusBadRequest, "datePublication invalide")
				return
			}
			addSet(`"datePublication"`, t)
		}
	}
	if input.DateLimite != nil {
		t, err := time.Parse(time.RFC3339, *input.DateLimite)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "dateLimite invalide")
			return
		}
		addSet(`"dateLimite"`, t)
	}
	if input.NoteMax != nil {
		addSet(`"noteMax"`, *input.NoteMax)
	}
	if input.RenduFichiers != nil {
		addSet(`"renduFichiers"`, *input.RenduFichiers)
	}
	if input.SoumissionGroupe != nil {
		addSet(`"soumissionGroupe"`, *input.SoumissionGroupe)
	}
	if input.NbMaxFichiers != nil {
		addSet(`"nbMaxFichiers"`, *input.NbMaxFichiers)
	}
	if input.TailleMaxFichier != nil {
		addSet(`"tailleMaxFichier"`, *input.TailleMaxFichier)
	}
	if input.AnneeUniversitaire != nil {
		addSet(`"anneeUniversitaire"`, *input.AnneeUniversitaire)
	}

	if len(setClauses) <= 1 {
		writeJSONError(w, http.StatusBadRequest, "aucun champ à mettre à jour")
		return
	}

	// WHERE clause (id + enseignant ownership via RLS)
	args = append(args, devoirID, claims.UserID)
	whereClause := fmt.Sprintf(`"id" = $%d AND "deletedAt" IS NULL AND "enseignantId" = $%d`, argIdx, argIdx+1)

	query := fmt.Sprintf(`
		UPDATE "Devoir"
		SET %s
		WHERE %s
		RETURNING "id", "titre", "statut"::text, "updatedAt"
	`, joinStringsArr(setClauses, ", "), whereClause)

	var respID, respTitre, respStatut string
	var respUpdatedAt time.Time
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), query, args...).Scan(&respID, &respTitre, &respStatut, &respUpdatedAt)
	})
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "devoir introuvable ou accès refusé")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"devoir": map[string]any{
			"id":        respID,
			"titre":     respTitre,
			"statut":    respStatut,
			"updatedAt": respUpdatedAt.UTC().Format(time.RFC3339),
		},
		"message": "devoir mis à jour",
	})
}

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/devoirs/{id} — soft delete (deletedAt = now)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) deleteDevoir(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ENSEIGNANT" {
		writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
		return
	}
	devoirID := chi.URLParam(r, "id")
	if devoirID == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var deletedID string
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			UPDATE "Devoir"
			SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = $1 AND "deletedAt" IS NULL AND "enseignantId" = $2
			RETURNING "id"
		`, devoirID, claims.UserID).Scan(&deletedID)
		if err == nil {
			found = true
		}
		return err
	})

	if !found {
		writeJSONError(w, http.StatusNotFound, "devoir introuvable ou accès refusé")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message": "devoir déplacé vers la corbeille",
		"id":      devoirID,
	})
}
