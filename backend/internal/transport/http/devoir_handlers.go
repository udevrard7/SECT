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
	"github.com/udevrard7/sect/backend/internal/worker"
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
				COALESCE(s."statutIA"::text, 'EN_ATTENTE'), s."erreurIA",
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
				&sDTO.StatutIA, &sDTO.ErreurIA,
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


// ══════════════════════════════════════════════════════════════════════════
// SOUMISSIONS — POST /api/soumissions, PATCH /api/soumissions/{id}
// ══════════════════════════════════════════════════════════════════════════
//
// P2-DEVOIRS-2 : soumissions étudiant + notation enseignant.
// Le endpoint POST /api/soumissions/{id}/ai-grade (évaluation IA) est
// implémenté en P4 (HomeworkCorrectionWorker asynchrone).
//
// Contrats frontend (mes-devoirs-page.tsx + devoirs-page.tsx) :
//   POST /api/soumissions { devoirId, etudiantId, contenuTexte,
//        commentaireEtudiant, statut } → 201 { soumission }
//   PATCH /api/soumissions/{id} { note?, commentaireEnseignant?,
//        contenuTexte?, commentaireEtudiant?, statut? }
//     → étudiant : update brouillon (statut BROUILLON/SOUMIS)
//     → enseignant : notation (note + commentaire)

// ──────────────────────────────────────────────────────────────────────────
// POST /api/soumissions — création (ETUDIANT)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) createSoumission(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ETUDIANT" {
		writeJSONError(w, http.StatusForbidden, "rôle étudiant requis pour soumettre")
		return
	}

	var input struct {
		DevoirID           string  `json:"devoirId"`
		EtudiantID         string  `json:"etudiantId"`
		ContenuTexte       *string `json:"contenuTexte"`
		FichiersSoumis     *string `json:"fichiersSoumis"`
		CommentaireEtudiant *string `json:"commentaireEtudiant"`
		Statut             string  `json:"statut"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}
	if input.DevoirID == "" {
		writeJSONError(w, http.StatusBadRequest, "devoirId requis")
		return
	}
	if input.EtudiantID == "" {
		input.EtudiantID = claims.UserID
	}
	if input.EtudiantID != claims.UserID {
		writeJSONError(w, http.StatusForbidden, "un étudiant ne peut soumettre que pour lui-même")
		return
	}
	if input.Statut != "BROUILLON" && input.Statut != "SOUMIS" {
		writeJSONError(w, http.StatusBadRequest, "statut invalide (BROUILLON ou SOUMIS attendu)")
		return
	}
	if input.Statut == "SOUMIS" && (input.ContenuTexte == nil || *input.ContenuTexte == "") {
		writeJSONError(w, http.StatusBadRequest, "contenuTexte requis pour soumettre")
		return
	}

	id := uuid.NewString()
	var (
		createdID, createdDevoirID, createdEtudiantID, createdStatut string
		createdAt, updatedAt                                         time.Time
		createdRenduAt                                               *time.Time
	)

	// Vérifier qu'aucune soumission SOUMIS/CORRIGE/RETOURNE n'existe déjà
	// (contrainte d'unicité métier : 1 soumission finale par étudiant/devoir)
	conflict := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT 1 FROM "Soumission"
			WHERE "devoirId" = $1 AND "etudiantId" = $2
			  AND "deletedAt" IS NULL
			  AND "statut"::text IN ('SOUMIS', 'CORRIGE', 'RETOURNE')
			LIMIT 1
		`, input.DevoirID, input.EtudiantID).Scan(&conflict)
		if err != nil && err.Error() != "no rows in result set" {
			return err
		}
		return nil
	})
	if conflict && input.Statut == "SOUMIS" {
		writeJSONError(w, http.StatusConflict, "une soumission finale existe déjà pour ce devoir")
		return
	}

	// Si SOUMIS, on pose renduAt = now
	var renduAt *time.Time
	if input.Statut == "SOUMIS" {
		now := time.Now().UTC()
		renduAt = &now
	}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			INSERT INTO "Soumission" (
				"id", "devoirId", "etudiantId",
				"contenuTexte", "fichiersSoumis", "commentaireEtudiant",
				"statut", "renduAt",
				"createdAt", "updatedAt"
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7::"StatutSoumission", $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			RETURNING "id", "devoirId", "etudiantId", "statut"::text, "renduAt", "createdAt", "updatedAt"
		`, id, input.DevoirID, input.EtudiantID,
			input.ContenuTexte, input.FichiersSoumis, input.CommentaireEtudiant,
			input.Statut, renduAt,
		).Scan(&createdID, &createdDevoirID, &createdEtudiantID, &createdStatut, &createdRenduAt, &createdAt, &updatedAt)
	})

	resp := map[string]any{
		"id":          createdID,
		"devoirId":    createdDevoirID,
		"etudiantId":  createdEtudiantID,
		"statut":      createdStatut,
		"createdAt":   createdAt.UTC().Format(time.RFC3339),
		"updatedAt":   updatedAt.UTC().Format(time.RFC3339),
	}
	if createdRenduAt != nil {
		resp["renduAt"] = createdRenduAt.UTC().Format(time.RFC3339)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"soumission": resp,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/soumissions/{id} — update (ETUDIANT brouillon) OU notation (ENSEIGNANT)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) updateSoumission(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	soumissionID := chi.URLParam(r, "id")
	if soumissionID == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var input struct {
		Note                 *float64 `json:"note,omitempty"`
		CommentaireEnseignant *string  `json:"commentaireEnseignant,omitempty"`
		ContenuTexte         *string  `json:"contenuTexte,omitempty"`
		CommentaireEtudiant  *string  `json:"commentaireEtudiant,omitempty"`
		Statut               *string  `json:"statut,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}

	// Récupérer la soumission existante pour valider l'accès et le statut courant
	var (
		existingDevoirID, existingEtudiantID, existingStatut string
		devoirEnseignantID                                  string
	)
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT s."devoirId", s."etudiantId", s."statut"::text,
			       d."enseignantId"
			FROM "Soumission" s
			JOIN "Devoir" d ON d."id" = s."devoirId"
			WHERE s."id" = $1 AND s."deletedAt" IS NULL
		`, soumissionID).Scan(&existingDevoirID, &existingEtudiantID, &existingStatut, &devoirEnseignantID)
		if err == nil {
			found = true
		}
		return err
	})
	if !found {
		writeJSONError(w, http.StatusNotFound, "soumission introuvable")
		return
	}

	// Déterminer le mode selon le rôle
	isEnseignant := claims.Role == "ENSEIGNANT" && devoirEnseignantID == claims.UserID
	isEtudiant := claims.Role == "ETUDIANT" && existingEtudiantID == claims.UserID
	if !isEnseignant && !isEtudiant {
		writeJSONError(w, http.StatusForbidden, "accès refusé à cette soumission")
		return
	}

	setClauses := []string{`"updatedAt" = CURRENT_TIMESTAMP`}
	var args []any
	argIdx := 1

	addSet := func(col string, val any) {
		setClauses = append(setClauses, fmt.Sprintf(`%s = $%d`, col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if isEtudiant {
		// Étudiant : peut modifier contenuTexte, commentaireEtudiant, statut
		// uniquement si la soumission est encore BROUILLON
		if existingStatut != "BROUILLON" {
			writeJSONError(w, http.StatusConflict, "soumission déjà soumise, modification impossible")
			return
		}
		if input.ContenuTexte != nil {
			addSet(`"contenuTexte"`, *input.ContenuTexte)
		}
		if input.CommentaireEtudiant != nil {
			addSet(`"commentaireEtudiant"`, *input.CommentaireEtudiant)
		}
		if input.Statut != nil {
			newStatut := *input.Statut
			if newStatut != "BROUILLON" && newStatut != "SOUMIS" {
				writeJSONError(w, http.StatusBadRequest, "statut invalide (BROUILLON ou SOUMIS)")
				return
			}
			addSet(`"statut"`, newStatut)
			if newStatut == "SOUMIS" {
				now := time.Now().UTC()
				addSet(`"renduAt"`, now)
			}
		}
	} else {
		// Enseignant : peut noter (note, commentaireEnseignant) et changer statut
		if input.Note != nil {
			addSet(`"note"`, *input.Note)
		}
		if input.CommentaireEnseignant != nil {
			addSet(`"commentaireEnseignant"`, *input.CommentaireEnseignant)
		}
		if input.Statut != nil {
			newStatut := *input.Statut
			if newStatut != "CORRIGE" && newStatut != "RETOURNE" {
				writeJSONError(w, http.StatusBadRequest, "statut invalide (CORRIGE ou RETOURNE)")
				return
			}
			addSet(`"statut"`, newStatut)
		}
		// Si note est posée mais statut non spécifié, on passe à CORRIGE automatiquement
		if input.Note != nil && input.Statut == nil {
			addSet(`"statut"`, "CORRIGE")
		}
	}

	if len(setClauses) <= 1 {
		writeJSONError(w, http.StatusBadRequest, "aucun champ à mettre à jour")
		return
	}

	args = append(args, soumissionID)
	whereClause := fmt.Sprintf(`"id" = $%d AND "deletedAt" IS NULL`, argIdx)

	query := fmt.Sprintf(`
		UPDATE "Soumission"
		SET %s
		WHERE %s
		RETURNING "id", "statut"::text, "note", "updatedAt"
	`, joinStringsArr(setClauses, ", "), whereClause)

	var respID, respStatut string
	var respNote *float64
	var respUpdatedAt time.Time
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), query, args...).Scan(&respID, &respStatut, &respNote, &respUpdatedAt)
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "échec de la mise à jour")
		return
	}

	resp := map[string]any{
		"id":        respID,
		"statut":    respStatut,
		"updatedAt": respUpdatedAt.UTC().Format(time.RFC3339),
	}
	if respNote != nil {
		resp["note"] = *respNote
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"soumission": resp,
	})
}

// ══════════════════════════════════════════════════════════════════════════
// GRILLES D'ÉVALUATION — GET/POST /api/grilles-evaluation, PATCH /{id}
// ══════════════════════════════════════════════════════════════════════════
//
// Contrats frontend (devoirs-page.tsx) :
//   GET /api/grilles-evaluation?devoirId=X → { grilles: [...] }
//   POST /api/grilles-evaluation { devoirId, criteres } → 201 { grille }
//   PATCH /api/grilles-evaluation/{id} { criteres } → 200 { grille }
//
// criteres est un tableau d'objets { nom, description, poids } sérialisé en
// JSON string côté DB (colonne TEXT).

// ──────────────────────────────────────────────────────────────────────────
// GET /api/grilles-evaluation?devoirId=X
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) listGrillesEvaluation(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	devoirID := r.URL.Query().Get("devoirId")
	if devoirID == "" {
		writeJSONError(w, http.StatusBadRequest, "devoirId requis")
		return
	}

	type grille struct {
		ID        string `json:"id"`
		DevoirID  string `json:"devoirId"`
		Criteres  string `json:"criteres"`
		CreatedAt string `json:"createdAt"`
		UpdatedAt string `json:"updatedAt"`
	}

	result := []grille{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `
			SELECT "id", "devoirId", "criteres", "createdAt", "updatedAt"
			FROM "GrilleEvaluation"
			WHERE "devoirId" = $1
			ORDER BY "createdAt" ASC
		`, devoirID)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			var g grille
			var created, updated time.Time
			if err := rows.Scan(&g.ID, &g.DevoirID, &g.Criteres, &created, &updated); err == nil {
				g.CreatedAt = created.UTC().Format(time.RFC3339)
				g.UpdatedAt = updated.UTC().Format(time.RFC3339)
				result = append(result, g)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"grilles": result,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/grilles-evaluation — création (ENSEIGNANT)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) createGrilleEvaluation(w http.ResponseWriter, r *http.Request) {
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
		DevoirID  string `json:"devoirId"`
		Criteres  any    `json:"criteres"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}
	if input.DevoirID == "" {
		writeJSONError(w, http.StatusBadRequest, "devoirId requis")
		return
	}

	// Sérialiser criteres en JSON string (le frontend envoie un tableau d'objets)
	criteresJSON, err := json.Marshal(input.Criteres)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "criteres invalide (non sérialisable)")
		return
	}

	// Vérifier l'ownership du devoir + qu'aucune grille n'existe déjà (1:1)
	var existingGrilleID string
	hasGrille := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT g."id"
			FROM "GrilleEvaluation" g
			JOIN "Devoir" d ON d."id" = g."devoirId"
			WHERE g."devoirId" = $1 AND d."enseignantId" = $2
		`, input.DevoirID, claims.UserID).Scan(&existingGrilleID)
		if err == nil {
			hasGrille = true
		}
		return nil
	})
	if hasGrille {
		// Si une grille existe déjà, on la met à jour (upsert sémantique)
		_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
			_, err := tx.Exec(r.Context(), `
				UPDATE "GrilleEvaluation"
				SET "criteres" = $1, "updatedAt" = CURRENT_TIMESTAMP
				WHERE "id" = $2
			`, string(criteresJSON), existingGrilleID)
			return err
		})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"grille": map[string]any{
				"id":        existingGrilleID,
				"devoirId":  input.DevoirID,
				"criteres":  string(criteresJSON),
			},
			"message": "grille mise à jour",
		})
		return
	}

	id := uuid.NewString()
	var createdID string
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			INSERT INTO "GrilleEvaluation" ("id", "devoirId", "criteres", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			RETURNING "id"
		`, id, input.DevoirID, string(criteresJSON)).Scan(&createdID)
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"grille": map[string]any{
			"id":        createdID,
			"devoirId":  input.DevoirID,
			"criteres":  string(criteresJSON),
		},
	})
}

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/grilles-evaluation/{id} — update criteres (ENSEIGNANT)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) updateGrilleEvaluation(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ENSEIGNANT" {
		writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
		return
	}
	grilleID := chi.URLParam(r, "id")
	if grilleID == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var input struct {
		Criteres any `json:"criteres"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}
	criteresJSON, err := json.Marshal(input.Criteres)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "criteres invalide")
		return
	}

	var updatedID string
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			UPDATE "GrilleEvaluation" g
			SET "criteres" = $1, "updatedAt" = CURRENT_TIMESTAMP
			FROM "Devoir" d
			WHERE g."id" = $2 AND g."devoirId" = d."id" AND d."enseignantId" = $3
			RETURNING g."id"
		`, string(criteresJSON), grilleID, claims.UserID).Scan(&updatedID)
		if err == nil {
			found = true
		}
		return err
	})
	if !found {
		writeJSONError(w, http.StatusNotFound, "grille introuvable ou accès refusé")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"grille": map[string]any{
			"id":       updatedID,
			"criteres": string(criteresJSON),
		},
		"message": "grille mise à jour",
	})
}


// ══════════════════════════════════════════════════════════════════════════
// P3-DEVOIRS-3 : Upload présigné R2 pour soumissions de fichiers
// ══════════════════════════════════════════════════════════════════════════
//
// POST /api/soumissions/presign-upload
// Body: { devoirId, filename, contentType }
// Response: { uploadUrl, key, expiresIn }
//
// Le navigateur étudiant :
//   1. POST /api/soumissions/presign-upload → obtient une URL présignée
//   2. PUT direct vers R2 avec le fichier (0% charge Render)
//   3. POST /api/soumissions avec fichiersSoumis = JSON [{key, filename, contentType}]
//
// Durée de validité : 5 minutes (300s). Clé format : soumissions/{etudiantId}/{timestamp}_{filename}

func (s *Server) presignUploadSoumission(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" {
		writeJSONError(w, http.StatusForbidden, "rôle étudiant ou enseignant requis")
		return
	}
	if s.storage == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "stockage R2 non configuré")
		return
	}

	var input struct {
		DevoirID    string `json:"devoirId"`
		Filename    string `json:"filename"`
		ContentType string `json:"contentType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}
	if input.Filename == "" {
		writeJSONError(w, http.StatusBadRequest, "filename requis")
		return
	}

	// Générer une clé R2 unique
	key := fmt.Sprintf("soumissions/%s/%d_%s", claims.UserID, time.Now().UnixMilli(), input.Filename)

	// Préfixer le contentType si vide
	if input.ContentType == "" {
		input.ContentType = "application/octet-stream"
	}

	uploadURL, err := s.storage.PresignUpload(r.Context(), key, input.ContentType, 300)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "échec génération URL présignée")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"uploadUrl":   uploadURL,
		"key":         key,
		"expiresIn":   300,
		"method":      "PUT",
		"contentType": input.ContentType,
	})
}


// ══════════════════════════════════════════════════════════════════════════
// P4-DEVOIRS-4 : Évaluation IA asynchrone des soumissions
// ══════════════════════════════════════════════════════════════════════════
//
// POST /api/soumissions/{id}/ai-grade (ENSEIGNANT)
// Déclenche la correction IA asynchrone. Répond 202 Accepted immédiatement.
// Le worker (HomeworkCorrectionWorker) traite en tâche de fond :
//   1. Marque statutIA = EN_COURS
//   2. Récupère devoir (titre, consignes, noteMax) + grille + contenu étudiant
//   3. Appelle l'IA (provider actif) avec prompt incluant la grille
//   4. Parse la réponse JSON { noteIA, justificationIA }
//   5. Écrit noteIA + justificationIA + statutIA = TERMINE en DB
//
// Le frontend poll GET /api/devoirs/{id} toutes les 3s (TanStack Query
// refetchInterval) jusqu'à ce que soumission.statutIA === "TERMINE" ou "ERREUR".

func (s *Server) aiGradeSoumission(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ENSEIGNANT" {
		writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
		return
	}
	soumissionID := chi.URLParam(r, "id")
	if soumissionID == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	// Vérifier l'ownership (la soumission appartient à un devoir de l'enseignant)
	// + récupérer le devoirId pour le job
	var devoirID string
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT s."devoirId"
			FROM "Soumission" s
			JOIN "Devoir" d ON d."id" = s."devoirId"
			WHERE s."id" = $1 AND s."deletedAt" IS NULL AND d."enseignantId" = $2
		`, soumissionID, claims.UserID).Scan(&devoirID)
		if err == nil {
			found = true
		}
		return err
	})
	if !found {
		writeJSONError(w, http.StatusNotFound, "soumission introuvable ou accès refusé")
		return
	}

	// Marquer statutIA = EN_ATTENTE (en attendant que le worker le prenne)
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `
			UPDATE "Soumission"
			SET "statutIA" = 'EN_ATTENTE'::"StatutIASoumission",
			    "erreurIA" = NULL,
			    "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = $1
		`, soumissionID)
		return err
	})

	// Pousser le job dans la queue (non-blocking send)
	job := worker.HomeworkJob{
		SoumissionID: soumissionID,
		DevoirID:     devoirID,
		EnseignantID: claims.UserID,
	}
	select {
	case worker.HomeworkCorrectionQueue <- job:
		// OK
	default:
		writeJSONError(w, http.StatusServiceUnavailable, "file d'évaluation IA pleine, réessayez dans un instant")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]any{
		"status":       "EN_COURS",
		"soumissionId": soumissionID,
		"message":      "évaluation IA lancée",
	})
}
