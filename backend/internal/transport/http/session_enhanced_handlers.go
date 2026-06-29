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
        "github.com/google/uuid"
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

// ──────────────────────────────────────────────────────────────────────────
// PARAMETRES-FIX-P1+P4+P5 : updateSecuritySettingsByEtablissement
// PATCH /api/security-settings/etablissement/{id}
//
// P1 (CRITICAL) : avant, le frontend appelait PATCH /api/security-settings/{configId}
// mais cette route n'existait pas → 404 → sauvegarde impossible.
// P5 (HIGH) : avant, si pas de config en DB, le GET retournait id="" → le PATCH
// allait sur /api/security-settings/ (URL vide) → 404. Maintenant : upsert
// (UPDATE si existe, INSERT sinon) → gère nativement le cas "première config".
// P4 (HIGH) : check applicatif d'appartenance (RESPONSABLE doit posséder l'étab,
// ADMIN doit avoir un EtablissementAccess valide). Cohérent avec le module
// /etablissements (fix E1/E6).
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) updateSecuritySettingsByEtablissement(w http.ResponseWriter, r *http.Request) {
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

        // P4 : check applicatif d'appartenance (au-delà de la RLS).
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
                return
        }
        if role == domain.RoleResponsable && claims.EtablissementID != etabID {
                writeJSONError(w, http.StatusForbidden, "vous ne pouvez modifier que les paramètres de votre établissement")
                return
        }
        // ADMIN : vérifier admin_has_etablissement_access (via requête DB dans la tx ci-dessous).

        var input struct {
                ProctoringActif      *bool    `json:"proctoringActif"`
                DetectionCopie       *bool    `json:"detectionCopie"`
                DetectionOnglet      *bool    `json:"detectionOnglet"`
                DetectionFullscreen  *bool    `json:"detectionFullscreen"`
                CaptureEcran         *bool    `json:"captureEcran"`
                BlocageCopie         *bool    `json:"blocageCopie"`
                BlocageClicDroit     *bool    `json:"blocageClicDroit"`
                BlocageImpression    *bool    `json:"blocageImpression"`
                VerificationIdentite *bool    `json:"verificationIdentite"`
                TempsInactiviteMax   *int     `json:"tempsInactiviteMax"`
                NbOngletsMax         *int     `json:"nbOngletsMax"`
                NbAlertesMax         *int     `json:"nbAlertesMax"`
                AutoSubmitOnViolation *bool   `json:"autoSubmitOnViolation"`
                RapportFraude        *bool    `json:"rapportFraude"`
                SeuilSimilarite      *float64 `json:"seuilSimilarite"`
                PenaliteFullscreenExit *int   `json:"penaliteFullscreenExit"`
                FullscreenObligatoire *bool  `json:"fullscreenObligatoire"`
                IntervalleCaptureEcran *int  `json:"intervalleCaptureEcran"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        // Validations (cohérentes avec les bornes des sliders frontend).
        if input.TempsInactiviteMax != nil && (*input.TempsInactiviteMax < 30 || *input.TempsInactiviteMax > 300) {
                writeJSONError(w, http.StatusBadRequest, "tempsInactiviteMax doit être entre 30 et 300")
                return
        }
        if input.NbOngletsMax != nil && (*input.NbOngletsMax < 1 || *input.NbOngletsMax > 10) {
                writeJSONError(w, http.StatusBadRequest, "nbOngletsMax doit être entre 1 et 10")
                return
        }
        if input.NbAlertesMax != nil && (*input.NbAlertesMax < 1 || *input.NbAlertesMax > 15) {
                writeJSONError(w, http.StatusBadRequest, "nbAlertesMax doit être entre 1 et 15")
                return
        }
        if input.SeuilSimilarite != nil && (*input.SeuilSimilarite < 0.5 || *input.SeuilSimilarite > 1.0) {
                writeJSONError(w, http.StatusBadRequest, "seuilSimilarite doit être entre 0.5 et 1.0")
                return
        }
        if input.PenaliteFullscreenExit != nil && (*input.PenaliteFullscreenExit < 0 || *input.PenaliteFullscreenExit > 10) {
                writeJSONError(w, http.StatusBadRequest, "penaliteFullscreenExit doit être entre 0 et 10")
                return
        }
        if input.IntervalleCaptureEcran != nil && (*input.IntervalleCaptureEcran < 30 || *input.IntervalleCaptureEcran > 300) {
                writeJSONError(w, http.StatusBadRequest, "intervalleCaptureEcran doit être entre 30 et 300")
                return
        }

        type secSettings struct {
                ID                    string  `json:"id"`
                EtablissementID       string  `json:"etablissementId"`
                ProctoringActif       bool    `json:"proctoringActif"`
                DetectionCopie        bool    `json:"detectionCopie"`
                DetectionOnglet       bool    `json:"detectionOnglet"`
                DetectionFullscreen   bool    `json:"detectionFullscreen"`
                BlocageCopie          bool    `json:"blocageCopie"`
                BlocageClicDroit      bool    `json:"blocageClicDroit"`
                BlocageImpression     bool    `json:"blocageImpression"`
                VerificationIdentite  bool    `json:"verificationIdentite"`
                TempsInactiviteMax    int     `json:"tempsInactiviteMax"`
                NbOngletsMax          int     `json:"nbOngletsMax"`
                NbAlertesMax          int     `json:"nbAlertesMax"`
                AutoSubmitOnViolation bool    `json:"autoSubmitOnViolation"`
                CaptureEcran          bool    `json:"captureEcran"`
                RapportFraude         bool    `json:"rapportFraude"`
                SeuilSimilarite       float64 `json:"seuilSimilarite"`
                PenaliteFullscreenExit int    `json:"penaliteFullscreenExit"`
                FullscreenObligatoire bool    `json:"fullscreenObligatoire"`
                IntervalleCaptureEcran int    `json:"intervalleCaptureEcran"`
        }

        result := secSettings{EtablissementID: etabID}
        errTx := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // P4 : check admin_has_etablissement_access pour ADMIN.
                if role == domain.RoleAdmin {
                        var hasAccess bool
                        if err := tx.QueryRow(r.Context(), `SELECT admin_has_etablissement_access($1)`, etabID).Scan(&hasAccess); err != nil {
                                return fmt.Errorf("check admin access: %w", err)
                        }
                        if !hasAccess {
                                return &domain.UnauthorizedError{Message: "accès non autorisé à cet établissement"}
                        }
                }

                // P5 : upsert — vérifier si une config existe déjà pour cet établissement.
                var existingID string
                err := tx.QueryRow(r.Context(), `SELECT "id" FROM "SecuritySettings" WHERE "etablissementId" = $1`, etabID).Scan(&existingID)

                if err == nil {
                        // UPDATE la config existante.
                        return tx.QueryRow(r.Context(), `
                                UPDATE "SecuritySettings" SET
                                        "proctoringActif" = COALESCE($2, "proctoringActif"),
                                        "detectionCopie" = COALESCE($3, "detectionCopie"),
                                        "detectionOnglet" = COALESCE($4, "detectionOnglet"),
                                        "detectionFullscreen" = COALESCE($5, "detectionFullscreen"),
                                        "captureEcran" = COALESCE($6, "captureEcran"),
                                        "blocageCopie" = COALESCE($7, "blocageCopie"),
                                        "blocageClicDroit" = COALESCE($8, "blocageClicDroit"),
                                        "blocageImpression" = COALESCE($9, "blocageImpression"),
                                        "verificationIdentite" = COALESCE($10, "verificationIdentite"),
                                        "tempsInactiviteMax" = COALESCE($11, "tempsInactiviteMax"),
                                        "nbOngletsMax" = COALESCE($12, "nbOngletsMax"),
                                        "nbAlertesMax" = COALESCE($13, "nbAlertesMax"),
                                        "autoSubmitOnViolation" = COALESCE($14, "autoSubmitOnViolation"),
                                        "rapportFraude" = COALESCE($15, "rapportFraude"),
                                        "seuilSimilarite" = COALESCE($16, "seuilSimilarite"),
                                        "penaliteFullscreenExit" = COALESCE($17, "penaliteFullscreenExit"),
                                        "fullscreenObligatoire" = COALESCE($18, "fullscreenObligatoire"),
                                        "intervalleCaptureEcran" = COALESCE($19, "intervalleCaptureEcran"),
                                        "updatedAt" = now()
                                WHERE "etablissementId" = $1
                                RETURNING "id", "etablissementId", "proctoringActif", "detectionCopie", "detectionOnglet",
                                        "detectionFullscreen", "blocageCopie", "blocageClicDroit", "blocageImpression",
                                        "verificationIdentite", "tempsInactiviteMax", "nbOngletsMax", "nbAlertesMax",
                                        "autoSubmitOnViolation", "captureEcran", "rapportFraude", "seuilSimilarite",
                                        "penaliteFullscreenExit", "fullscreenObligatoire", "intervalleCaptureEcran"
                        `, etabID,
                                input.ProctoringActif, input.DetectionCopie, input.DetectionOnglet, input.DetectionFullscreen,
                                input.CaptureEcran, input.BlocageCopie, input.BlocageClicDroit, input.BlocageImpression,
                                input.VerificationIdentite, input.TempsInactiviteMax, input.NbOngletsMax, input.NbAlertesMax,
                                input.AutoSubmitOnViolation, input.RapportFraude, input.SeuilSimilarite,
                                input.PenaliteFullscreenExit, input.FullscreenObligatoire, input.IntervalleCaptureEcran,
                        ).Scan(
                                &result.ID, &result.EtablissementID, &result.ProctoringActif, &result.DetectionCopie, &result.DetectionOnglet,
                                &result.DetectionFullscreen, &result.BlocageCopie, &result.BlocageClicDroit, &result.BlocageImpression,
                                &result.VerificationIdentite, &result.TempsInactiviteMax, &result.NbOngletsMax, &result.NbAlertesMax,
                                &result.AutoSubmitOnViolation, &result.CaptureEcran, &result.RapportFraude, &result.SeuilSimilarite,
                                &result.PenaliteFullscreenExit, &result.FullscreenObligatoire, &result.IntervalleCaptureEcran,
                        )
                }

                // Pas de config existante (pgx.ErrNoRows) → INSERT (P5 : gère id vide).
                newID := "secset_" + uuid.NewString()
                return tx.QueryRow(r.Context(), `
                        INSERT INTO "SecuritySettings" (
                                "id", "etablissementId", "proctoringActif", "detectionCopie", "detectionOnglet",
                                "detectionFullscreen", "captureEcran", "blocageCopie", "blocageClicDroit", "blocageImpression",
                                "verificationIdentite", "tempsInactiviteMax", "nbOngletsMax", "nbAlertesMax",
                                "autoSubmitOnViolation", "rapportFraude", "seuilSimilarite",
                                "penaliteFullscreenExit", "fullscreenObligatoire", "intervalleCaptureEcran",
                                "createdAt", "updatedAt"
                        ) VALUES (
                                $1, $2, COALESCE($3, false), COALESCE($4, true), COALESCE($5, true),
                                COALESCE($6, true), COALESCE($7, false), COALESCE($8, true), COALESCE($9, true), COALESCE($10, true),
                                COALESCE($11, false), COALESCE($12, 120), COALESCE($13, 3), COALESCE($14, 5),
                                COALESCE($15, false), COALESCE($16, true), COALESCE($17, 0.85),
                                COALESCE($18, 5), COALESCE($19, true), COALESCE($20, 60),
                                now(), now()
                        )
                        RETURNING "id", "etablissementId", "proctoringActif", "detectionCopie", "detectionOnglet",
                                "detectionFullscreen", "blocageCopie", "blocageClicDroit", "blocageImpression",
                                "verificationIdentite", "tempsInactiviteMax", "nbOngletsMax", "nbAlertesMax",
                                "autoSubmitOnViolation", "captureEcran", "rapportFraude", "seuilSimilarite",
                                "penaliteFullscreenExit", "fullscreenObligatoire", "intervalleCaptureEcran"
                `, newID, etabID,
                        input.ProctoringActif, input.DetectionCopie, input.DetectionOnglet, input.DetectionFullscreen,
                        input.CaptureEcran, input.BlocageCopie, input.BlocageClicDroit, input.BlocageImpression,
                        input.VerificationIdentite, input.TempsInactiviteMax, input.NbOngletsMax, input.NbAlertesMax,
                        input.AutoSubmitOnViolation, input.RapportFraude, input.SeuilSimilarite,
                        input.PenaliteFullscreenExit, input.FullscreenObligatoire, input.IntervalleCaptureEcran,
                ).Scan(
                        &result.ID, &result.EtablissementID, &result.ProctoringActif, &result.DetectionCopie, &result.DetectionOnglet,
                        &result.DetectionFullscreen, &result.BlocageCopie, &result.BlocageClicDroit, &result.BlocageImpression,
                        &result.VerificationIdentite, &result.TempsInactiviteMax, &result.NbOngletsMax, &result.NbAlertesMax,
                        &result.AutoSubmitOnViolation, &result.CaptureEcran, &result.RapportFraude, &result.SeuilSimilarite,
                        &result.PenaliteFullscreenExit, &result.FullscreenObligatoire, &result.IntervalleCaptureEcran,
                )
        })

        if errTx != nil {
                if domainErr, ok := errTx.(*domain.UnauthorizedError); ok {
                        writeJSONError(w, http.StatusForbidden, domainErr.Error())
                        return
                }
                // RLS a bloqué ou autre erreur SQL.
                writeJSONError(w, http.StatusForbidden, "mise à jour non autorisée pour cet établissement")
                return
        }

        // Vérifier qu'on a bien un ID (sinon l'upsert a échoué silencieusement).
        if result.ID == "" {
                writeJSONError(w, http.StatusInternalServerError, "échec de la mise à jour")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "securitySettings": result,
                "message":          "Paramètres de sécurité mis à jour",
        })
}
