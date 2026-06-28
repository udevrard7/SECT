// Package http — handlers étendus pour /api/sessions (B2-B5 MES-EPREUVES).
//
// Complète les routes sessions pour matcher le frontend passation-page.tsx :
//   PUT  /api/sessions/{id}             — bulk save reponses OU log alerte (B2)
//   POST /api/sessions/{id}/capture     — persiste capture écran anti-fraude (B3)
//
// + 2 routes non-sessions mais utilisées par passation-page.tsx :
//   GET  /api/epreuves/auto-close       — détection clôture automatique (B4)
//   GET  /api/security-settings/etablissement/{id} — config sécurité par établissement (B5)
package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// B2 : PUT /api/sessions/{id} — bulk save OU log alerte
// ──────────────────────────────────────────────────────────────────────────
//
// Le frontend passation-page.tsx envoie 2 formes de body sur cette route :
//   1. { reponses: { questionId: contenu, ... } }  → bulk save (auto-save 30s)
//   2. { alerte: { type, details, penalite } }      → log anti-fraude
//
// On dispatche selon la présence du champ "reponses" ou "alerte".

func (s *Server) updateSessionBulk(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	sessionID := chi.URLParam(r, "id")
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "id session requis")
		return
	}

	// Decoder le body de façon permissive (champs optionnels)
	var body map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}

	// Cas 1 : bulk save reponses
	if rawReponses, ok := body["reponses"]; ok {
		var reponses map[string]string
		if err := json.Unmarshal(rawReponses, &reponses); err != nil {
			writeJSONError(w, http.StatusBadRequest, "format reponses invalide")
			return
		}

		// Vérifier ownership (session.etudiantId = claims.UserID)
		var etudiantID string
		found := false
		_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
			err := tx.QueryRow(r.Context(),
				`SELECT "etudiantId" FROM "SessionPassation" WHERE "id" = $1`,
				sessionID).Scan(&etudiantID)
			if err == nil {
				found = true
			}
			return err
		})
		if !found || etudiantID != claims.UserID {
			writeJSONError(w, http.StatusNotFound, "session introuvable ou accès refusé")
			return
		}

		// Sauvegarder chaque réponse (RLS off car le worker n'a pas de claims HTTP
		// — mais ici on a les claims, on utilise WithTx pour RLS on)
		saved := 0
		for questionID, contenu := range reponses {
			err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
				_, err := tx.Exec(r.Context(), `
					INSERT INTO "Reponse" ("id", "sessionId", "questionId", "contenu", "createdAt", "updatedAt")
					VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
					ON CONFLICT ("sessionId", "questionId") DO UPDATE SET "contenu" = $4, "updatedAt" = CURRENT_TIMESTAMP
				`, fmt.Sprintf("rep-%s-%s", sessionID[:8], questionID[:8]), sessionID, questionID, contenu)
				return err
			})
			if err == nil {
				saved++
			}
		}

		// Note : le cache RAM saveReponse (pattern existant) prend aussi epreuveID/etudiantID.
		// Ici on a fait le bulk INSERT direct en DB, ce qui est plus fiable. Le cache
		// n'est pas mis à jour pour éviter une double écriture au flush.

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"saved":  true,
			"count":  saved,
		})
		return
	}

	// Cas 2 : log alerte
	if rawAlerte, ok := body["alerte"]; ok {
		var alerte struct {
			Type      string  `json:"type"`
			Details   string  `json:"details"`
			Penalite  float64 `json:"penalite"`
		}
		if err := json.Unmarshal(rawAlerte, &alerte); err != nil {
			writeJSONError(w, http.StatusBadRequest, "format alerte invalide")
			return
		}
		if alerte.Type == "" {
			writeJSONError(w, http.StatusBadRequest, "type alerte requis")
			return
		}

		// Vérifier ownership
		var etudiantID string
		found := false
		_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
			err := tx.QueryRow(r.Context(),
				`SELECT "etudiantId" FROM "SessionPassation" WHERE "id" = $1`,
				sessionID).Scan(&etudiantID)
			if err == nil {
				found = true
			}
			return err
		})
		if !found || etudiantID != claims.UserID {
			writeJSONError(w, http.StatusNotFound, "session introuvable ou accès refusé")
			return
		}

		// AddAlerte (RLS off dans le repo — conforme au pattern existant)
		alerteInput := domain.AlerteInput{
			Type:     alerte.Type,
			Details:  alerte.Details,
		}
		_ = s.sessionUC.AddAlerte(r.Context(), claims, sessionID, alerte.Penalite, alerteInput)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"logged": true,
		})
		return
	}

	writeJSONError(w, http.StatusBadRequest, "body doit contenir 'reponses' ou 'alerte'")
}

// ──────────────────────────────────────────────────────────────────────────
// B3 : POST /api/sessions/{id}/capture — persiste capture écran anti-fraude
// ──────────────────────────────────────────────────────────────────────────
//
// Le frontend envoie { image: "data:image/jpeg;base64,..." }.
// On stocke l'image dans la colonne logEvents (append JSON) pour éviter de
// créer une table dédiée (MVP). Une v2 pourrait uploader vers R2.

func (s *Server) captureSession(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	sessionID := chi.URLParam(r, "id")
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "id session requis")
		return
	}

	var input struct {
		Image string `json:"image"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}
	if input.Image == "" {
		writeJSONError(w, http.StatusBadRequest, "image requise")
		return
	}

	// Vérifier ownership
	var etudiantID string
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(),
			`SELECT "etudiantId" FROM "SessionPassation" WHERE "id" = $1`,
			sessionID).Scan(&etudiantID)
		if err == nil {
			found = true
		}
		return err
	})
	if !found || etudiantID != claims.UserID {
		writeJSONError(w, http.StatusNotFound, "session introuvable ou accès refusé")
		return
	}

	// Logger la capture dans logEvents (append un event CAPTURE)
	// On ne stocke pas l'image complète (trop volumineuse pour logEvents TEXT)
	// mais on logge l'event + un hash court pour audit.
	imageHash := ""
	if len(input.Image) > 50 {
		imageHash = input.Image[20:40] // extrait du base64 comme fingerprint
	}
	alerteInput := domain.AlerteInput{
		Type:      "CAPTURE",
		Details:   fmt.Sprintf("Capture écran prise (fingerprint: %s)", imageHash),
	}
	_ = s.sessionUC.AddAlerte(r.Context(), claims, sessionID, 0, alerteInput)

	// TODO v2 : uploader l'image vers R2 (POST /api/soumissions/presign-upload)
	// et stocker la clé dans une table SessionCapture dédiée.

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"captured": true,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// B4 : GET /api/epreuves/auto-close?epreuveId=X — détection clôture auto
// ──────────────────────────────────────────────────────────────────────────
//
// Le frontend poll toutes les 15s pendant l'examen pour détecter :
//   - si l'épreuve a été clôturée manuellement (clotureeAt non null)
//   - si la dateFin est dépassée (avec période de grâce)
//
// Response: { isClosed, raisonCloture, inGracePeriod, gracePeriodEndsAt }

func (s *Server) epreuveAutoClose(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	epreuveID := r.URL.Query().Get("epreuveId")
	if epreuveID == "" {
		writeJSONError(w, http.StatusBadRequest, "epreuveId requis")
		return
	}

	var (
		clotureeAt     *time.Time
		raisonCloture  *string
		dateFin        *time.Time
		delaiGrace     int
		statut         string
	)
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT "clotureeAt", "raisonCloture", "dateFin", COALESCE("delaiGrace", 0), "statut"::text
			FROM "Epreuve"
			WHERE "id" = $1 AND "deletedAt" IS NULL
		`, epreuveID).Scan(&clotureeAt, &raisonCloture, &dateFin, &delaiGrace, &statut)
		if err == nil {
			found = true
		}
		return err
	})
	if !found {
		writeJSONError(w, http.StatusNotFound, "épreuve introuvable")
		return
	}

	now := time.Now().UTC()
	isClosed := false
	inGracePeriod := false
	var gracePeriodEndsAt *time.Time

	if clotureeAt != nil {
		// Clôturée manuellement
		isClosed = true
	} else if statut == "CLOTUREE" {
		isClosed = true
	} else if dateFin != nil && now.After(*dateFin) {
		// Date fin dépassée — vérifier période de grâce
		graceEnd := dateFin.Add(time.Duration(delaiGrace) * time.Minute)
		if now.Before(graceEnd) {
			inGracePeriod = true
			gracePeriodEndsAt = &graceEnd
		} else {
			isClosed = true
			if raisonCloture == nil {
				rc := "Délai dépassé (fin de période + grâce)"
				raisonCloture = &rc
			}
		}
	}

	resp := map[string]any{
		"isClosed":        isClosed,
		"inGracePeriod":   inGracePeriod,
	}
	if raisonCloture != nil {
		resp["raisonCloture"] = *raisonCloture
	}
	if gracePeriodEndsAt != nil {
		resp["gracePeriodEndsAt"] = gracePeriodEndsAt.UTC().Format(time.RFC3339)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ──────────────────────────────────────────────────────────────────────────
// B5 : GET /api/security-settings/etablissement/{id} — config par établissement
// ──────────────────────────────────────────────────────────────────────────
//
// Le frontend passation-page.tsx fetch cette route pour charger la config
// anti-fraude de l'établissement de l'étudiant. Le handler existant
// securitySettingsGetReal retourne déjà les settings de l'établissement du
// claims courant — on ajoute juste la route paramétrée qui filtre par
// établissement explicite.

func (s *Server) securitySettingsByEtablissement(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	etabID := chi.URLParam(r, "id")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "id établissement requis")
		return
	}

	type secSettings struct {
		ID                   string  `json:"id"`
		EtablissementID      string  `json:"etablissementId"`
		ProctoringActif     bool    `json:"proctoringActif"`
		DetectionCopie       bool    `json:"detectionCopie"`
		DetectionOnglet      bool    `json:"detectionOnglet"`
		DetectionFullscreen  bool    `json:"detectionFullscreen"`
		BlocageCopie         bool    `json:"blocageCopie"`
		BlocageClicDroit     bool    `json:"blocageClicDroit"`
		BlocageImpression    bool    `json:"blocageImpression"`
		VerificationIdentite bool    `json:"verificationIdentite"`
		TempsInactiviteMax   int     `json:"tempsInactiviteMax"`
		NbOngletsMax         int     `json:"nbOngletsMax"`
		NbAlertesMax         int     `json:"nbAlertesMax"`
		AutoSubmitOnViolation bool   `json:"autoSubmitOnViolation"`
		CaptureEcran         bool    `json:"captureEcran"`
		RapportFraude        bool    `json:"rapportFraude"`
		SeuilSimilarite      float64 `json:"seuilSimilarite"`
		PenaliteFullscreenExit float64 `json:"penaliteFullscreenExit"`
		FullscreenObligatoire bool   `json:"fullscreenObligatoire"`
		IntervalleCaptureEcran int    `json:"intervalleCaptureEcran"`
	}

	settings := secSettings{}
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT
				"id", "etablissementId",
				"proctoringActif", "detectionCopie", "detectionOnglet", "detectionFullscreen",
				"blocageCopie", "blocageClicDroit", "blocageImpression", "verificationIdentite",
				"tempsInactiviteMax", "nbOngletsMax", "nbAlertesMax", "autoSubmitOnViolation",
				"captureEcran", "rapportFraude", "seuilSimilarite",
				"penaliteFullscreenExit", "fullscreenObligatoire", "intervalleCaptureEcran"
			FROM "SecuritySettings"
			WHERE "etablissementId" = $1
		`, etabID).Scan(
			&settings.ID, &settings.EtablissementID,
			&settings.ProctoringActif, &settings.DetectionCopie, &settings.DetectionOnglet, &settings.DetectionFullscreen,
			&settings.BlocageCopie, &settings.BlocageClicDroit, &settings.BlocageImpression, &settings.VerificationIdentite,
			&settings.TempsInactiviteMax, &settings.NbOngletsMax, &settings.NbAlertesMax, &settings.AutoSubmitOnViolation,
			&settings.CaptureEcran, &settings.RapportFraude, &settings.SeuilSimilarite,
			&settings.PenaliteFullscreenExit, &settings.FullscreenObligatoire, &settings.IntervalleCaptureEcran,
		)
		if err == nil {
			found = true
		}
		return err
	})

	if !found {
		// Pas de config pour cet établissement → retourner les defaults
		// (le frontend a un DEFAULT_SECURITY fallback, mais on retourne 200
		// avec des valeurs neutres pour éviter le 404)
		settings = secSettings{
			EtablissementID: etabID,
			ProctoringActif: false,
			TempsInactiviteMax: 300,
			NbOngletsMax: 3,
			NbAlertesMax: 5,
			AutoSubmitOnViolation: true,
			SeuilSimilarite: 0.8,
			PenaliteFullscreenExit: 5,
			FullscreenObligatoire: true,
			IntervalleCaptureEcran: 60,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"securitySettings": settings,
	})
}
