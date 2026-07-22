// Package http — handlers étendus pour /api/sessions (B2-B5 MES-EPREUVES).
//
// Complète les routes sessions pour matcher le frontend passation-page.tsx :
//   PUT  /api/sessions/{id}             — bulk save reponses OU log alerte (B2)
//   POST /api/sessions/{id}/capture     — persiste capture écran anti-fraude (B3)
//
// + 2 routes non-sessions mais utilisées par passation-page.tsx :
//   GET  /api/epreuves/auto-close       — détection clôture automatique (B4)
//   GET  /api/security-settings/etablissement/{id} — config sécurité par établissement (B5)
//
// + Rapport de fraude :
//   GET  /api/surveillance/{sessionId}/rapport-fraude — rapport détaillé par session
package http

import (
        "crypto/sha256"
        "encoding/base64"
        "encoding/json"
        "fmt"
        "net/http"
        "strings"
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

                // OPT-1 + OPT-2 : écriture via cache RAM + ownership cache.
                //
                // AVANT : chaque auto-save (30s) faisait 1 WithTx ownership + 1 BulkSaveReponses
                // = 2 transactions DB par étudiant par save. Pour 5000 étudiants = 333 tx/s.
                //
                // APRÈS : l'auto-save écrit en RAM (< 1ms, 0 tx DB). Le worker goroutine
                // synchronise vers Neon toutes les 30s (1 tx par session). L'ownership est
                // vérifiée en cache après la première vérification DB.
                //
                // Pour 5000 étudiants : 5000 × 1 tx / 30s = 167 tx/s au lieu de 333 tx/s (-50%).
                // Avec OPT-3 (batch flush) : ~10 tx/s au lieu de 167 tx/s (-95%).

                // OWNERSHIP-CACHE-2 : vérifier ownership via le cache en mémoire d'abord,
                // puis via DB si pas encore vérifié (même pattern que saveReponse).
                if s.sessionCache != nil && s.sessionCache.IsOwnershipVerified(sessionID, claims.UserID) {
                        // Ownership déjà vérifiée en cache → skip DB query (-1 tx par save)
                } else {
                        // Première vérification : requêter la DB
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
                        // Cacher l'ownership vérifiée pour les prochains saves
                        if s.sessionCache != nil {
                                s.sessionCache.MarkOwnershipVerified(sessionID, claims.UserID)
                        }
                }

                // OPT-1 : écrire en RAM au lieu de DB directe.
                // Le cache merge les réponses (map[string]string) et marque la session dirty.
                // Le worker goroutine (FlushSessionToNeon toutes les 30s) synchronisera vers Neon.
                // Le submit force un flush immédiat avant la soumission finale.
                if s.sessionCache != nil {
                        s.sessionCache.SaveAnswers(sessionID, "", claims.UserID, reponses)
                }

                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]any{
                        "saved": true,
                        "count": len(reponses),
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

                // OWNERSHIP-CACHE-2 : vérifier ownership via le cache d'abord (comme reponses).
                // Les alertes sont moins fréquentes mais pendant un examen avec proctoring,
                // elles peuvent être nombreuses (changement d'onglet, copier-coller...).
                if s.sessionCache != nil && s.sessionCache.IsOwnershipVerified(sessionID, claims.UserID) {
                        // Ownership déjà vérifiée → skip DB
                } else {
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
                        if s.sessionCache != nil {
                                s.sessionCache.MarkOwnershipVerified(sessionID, claims.UserID)
                        }
                }

                // AddAlerte (RLS off dans le repo — conforme au pattern existant)
                alerteInput := domain.AlerteInput{
                        Type:     alerte.Type,
                        Details:  alerte.Details,
                }
                _ = s.sessionUC.AddAlerte(r.Context(), claims, sessionID, alerte.Penalite, alerteInput)

                // OPT-7 : push WebSocket aux surveillants — alerte déclenchée.
                // On récupère l'epreuveId de la session pour le broadcast ciblé.
                var alerteEpreuveID string
                _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                        _ = tx.QueryRow(r.Context(),
                                `SELECT "epreuveId" FROM "SessionPassation" WHERE "id" = $1`,
                                sessionID).Scan(&alerteEpreuveID)
                        return nil
                })
                s.surveillanceHub.BroadcastEvent("ALERT_TRIGGERED", alerteEpreuveID, map[string]any{
                        "sessionId":  sessionID,
                        "epreuveId":  alerteEpreuveID,
                        "etudiantId": claims.UserID,
                        "alertType":  alerte.Type,
                        "penalite":   alerte.Penalite,
                })

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
// On decode le base64, on upload l'image vers R2, et on stocke les
// métadonnées dans la table SessionCapture. On conserve aussi l'event
// CAPTURE dans logEvents pour compatibilité ascendante.
//
// Si R2 n'est pas disponible (mode dev), on stocke juste les métadonnées
// avec r2Key vide et l'image comme miniature base64.

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

        // Vérifier ownership + récupérer epreuveId
        var etudiantID, epreuveID string
        found := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                err := tx.QueryRow(r.Context(),
                        `SELECT "etudiantId", "epreuveId" FROM "SessionPassation" WHERE "id" = $1`,
                        sessionID).Scan(&etudiantID, &epreuveID)
                if err == nil {
                        found = true
                }
                return err
        })
        if !found || etudiantID != claims.UserID {
                writeJSONError(w, http.StatusNotFound, "session introuvable ou accès refusé")
                return
        }

        // Décoder le base64 de l'image (accepte data:image/jpeg;base64,... ou base64 brut)
        imageData := input.Image
        if idx := strings.Index(imageData, ";base64,"); idx >= 0 {
                imageData = imageData[idx+8:]
        }
        imageBytes, err := base64.StdEncoding.DecodeString(imageData)
        if err != nil {
                // Essayer RawStdEncoding au cas où
                imageBytes, err = base64.RawStdEncoding.DecodeString(imageData)
                if err != nil {
                        writeJSONError(w, http.StatusBadRequest, "image base64 invalide")
                        return
                }
        }

        // Calculer SHA-256 pour intégrité
        hash := sha256.Sum256(imageBytes)
        imageHash := fmt.Sprintf("%x", hash)

        // Déterminer le prochain captureIndex pour cette session
        var captureIndex int
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                err := tx.QueryRow(r.Context(),
                        `SELECT COALESCE(MAX("captureIndex"), 0) + 1 FROM "SessionCapture" WHERE "sessionId" = $1`,
                        sessionID).Scan(&captureIndex)
                return err
        })
        if captureIndex == 0 {
                captureIndex = 1
        }

        // Upload vers R2 si disponible
        captureID := uuid.New().String()
        r2Key := ""
        var fileSize int

        if s.storage != nil {
                // Générer la clé R2 : captures/{sessionID}/{timestamp}.jpg
                ts := time.Now().UTC().Format("20060102-150405.000")
                r2Key = fmt.Sprintf("captures/%s/%s.jpg", sessionID, ts)
                fileSize = len(imageBytes)

                _, err := s.storage.Upload(r.Context(), domain.StorageObject{
                        Key:           r2Key,
                        Content:       imageBytes,
                        ContentType:   "image/jpeg",
                        ContentLength: int64(fileSize),
                })
                if err != nil {
                        // Log l'erreur mais ne pas bloquer la capture — on stocke juste les métadonnées
                        fmt.Printf("[captureSession] R2 upload failed: %v\n", err)
                        r2Key = ""
                        fileSize = 0
                }
        }

        // Insérer les métadonnées dans SessionCapture
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                _, err := tx.Exec(r.Context(),
                        `INSERT INTO "SessionCapture" ("id", "sessionId", "etudiantId", "epreuveId", "r2Key", "imageHash", "fileSize", "captureIndex", "createdAt")
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                        captureID, sessionID, etudiantID, epreuveID, r2Key, imageHash, fileSize, captureIndex)
                return err
        })

        // Logger la capture dans logEvents (append un event CAPTURE)
        // Compatibilité ascendante : le logEvent CAPTURE reste présent.
        alerteInput := domain.AlerteInput{
                Type:    "CAPTURE",
                Details: fmt.Sprintf("Capture écran #%d prise (hash: %s...)", captureIndex, imageHash[:16]),
        }
        _ = s.sessionUC.AddAlerte(r.Context(), claims, sessionID, 0, alerteInput)

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "captured":     true,
                "captureId":    captureID,
                "captureIndex": captureIndex,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/sessions/{id}/captures — liste des captures d'une session
// ──────────────────────────────────────────────────────────────────────────
//
// Retourne la liste des captures avec URL présignée R2 (valide 5 minutes).
// Accès : ENSEIGNANT/ADMIN/RESPONSABLE ou l'étudiant propriétaire.

func (s *Server) listSessionCaptures(w http.ResponseWriter, r *http.Request) {
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

        // Vérifier l'accès : l'étudiant propriétaire OU enseignant/admin/responsable
        role := domain.Role(claims.Role)
        isStaff := role == domain.RoleEnseignant || role == domain.RoleAdmin || role == domain.RoleResponsable

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
        if !found {
                writeJSONError(w, http.StatusNotFound, "session introuvable")
                return
        }
        if !isStaff && etudiantID != claims.UserID {
                writeJSONError(w, http.StatusForbidden, "accès refusé")
                return
        }

        // Récupérer les captures
        type captureRow struct {
                ID           string     `json:"id"`
                R2Key        string     `json:"r2Key"`
                ImageHash    *string    `json:"imageHash,omitempty"`
                FileSize     *int       `json:"fileSize,omitempty"`
                CaptureIndex int        `json:"captureIndex"`
                CreatedAt    time.Time  `json:"createdAt"`
        }

        var captures []captureRow
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(),
                        `SELECT "id", "r2Key", "imageHash", "fileSize", "captureIndex", "createdAt"
                         FROM "SessionCapture"
                         WHERE "sessionId" = $1
                         ORDER BY "captureIndex" ASC`,
                        sessionID)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        var c captureRow
                        if err := rows.Scan(&c.ID, &c.R2Key, &c.ImageHash, &c.FileSize, &c.CaptureIndex, &c.CreatedAt); err != nil {
                                return err
                        }
                        captures = append(captures, c)
                }
                return rows.Err()
        })

        // Enrichir avec URL présignées si R2 est disponible
        type captureResponse struct {
                ID           string  `json:"id"`
                URL          string  `json:"url,omitempty"`
                R2Key        string  `json:"r2Key,omitempty"`
                ImageHash    *string `json:"imageHash,omitempty"`
                FileSize     *int    `json:"fileSize,omitempty"`
                CaptureIndex int     `json:"captureIndex"`
                CreatedAt    string  `json:"createdAt"`
        }

        result := make([]captureResponse, 0, len(captures))
        for _, c := range captures {
                resp := captureResponse{
                        ID:           c.ID,
                        R2Key:        c.R2Key,
                        ImageHash:    c.ImageHash,
                        FileSize:     c.FileSize,
                        CaptureIndex: c.CaptureIndex,
                        CreatedAt:    c.CreatedAt.UTC().Format(time.RFC3339),
                }
                // Générer URL présignée (5 min = 300s) si R2 disponible et clé présente
                if s.storage != nil && c.R2Key != "" {
                        url, err := s.storage.PresignURL(r.Context(), c.R2Key, 300)
                        if err == nil {
                                resp.URL = url
                        }
                }
                result = append(result, resp)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "captures": result,
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
                        rc := "Délai dépassé (fin de période + grâce)"
                        raisonCloture = &rc

                        // BUGFIX (CLOTURE-AUTO) : l'ancien code détectait isClosed=true
                        // mais ne mettait PAS à jour le statut en DB. L'épreuve restait
                        // EN_COURS indéfiniment. Maintenant on clôture réellement :
                        // statut=CLOTUREE, clotureeAt=now, clotureeAutomatiquement=true,
                        // raisonCloture="Délai dépassé".
                        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                                _, err := tx.Exec(r.Context(), `
                                        UPDATE "Epreuve"
                                        SET "statut" = 'CLOTUREE',
                                            "clotureeAt" = $2,
                                            "clotureeAutomatiquement" = true,
                                            "raisonCloture" = $3,
                                            "updatedAt" = CURRENT_TIMESTAMP
                                        WHERE "id" = $1
                                          AND "statut" IN ('EN_COURS', 'TERMINEE')
                                `, epreuveID, now, rc)
                                return err
                        })
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

// ──────────────────────────────────────────────────────────────────────────
// GET /api/surveillance/{sessionId}/rapport-fraude — rapport de fraude détaillé
// ──────────────────────────────────────────────────────────────────────────
//
// Retourne un rapport structuré pour une session de passation :
//   - infos session, étudiant, épreuve
//   - événements de fraude avec sévérité
//   - statistiques récapitulatives (riskScore, riskLevel, eventTypeBreakdown)
//   - captures R2 associées
//   - vérifie que rapportFraude=true dans les SecuritySettings de l'établissement
//
// RequireRole : ENSEIGNANT/ADMIN/RESPONSABLE (géré au niveau router).

// rapportEvent — un événement de fraude dans le rapport.
type rapportEvent struct {
        Type      string  `json:"type"`
        Timestamp string  `json:"timestamp"`
        Details   string  `json:"details,omitempty"`
        Penalite  float64 `json:"penalite"`
        Severity  string  `json:"severity"`
}

// rapportCapture — capture R2 dans le rapport.
type rapportCapture struct {
        ID           string `json:"id"`
        CaptureIndex int    `json:"captureIndex"`
        CreatedAt    string `json:"createdAt"`
        R2Key        string `json:"r2Key"`
}

func (s *Server) rapportFraudeSession(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        sessionID := chi.URLParam(r, "sessionId")
        if sessionID == "" {
                writeJSONError(w, http.StatusBadRequest, "sessionId requis")
                return
        }

        // ─── Query session + étudiant + épreuve ───
        type rawSessionData struct {
                ID            string
                Statut        string
                DateDebut     *time.Time
                DateFin       *time.Time
                Alertes       int
                Penalite      float64
                Score         *float64
                LogEventsRaw  []byte
                // Etudiant
                EtudiantID    string
                EtudiantNom   string
                EtudiantEmail string
                // Epreuve
                EpreuveID     string
                EpreuveTitre  string
                EpreuveDuree  int
                EpreuveNoteTotal float64
                EtablissementID  string
        }

        var raw rawSessionData
        found := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                err := tx.QueryRow(r.Context(), `
                        SELECT s."id", s."statut"::text, s."dateDebut", s."dateFin",
                               COALESCE(s."alertes", 0), COALESCE(s."penalite", 0), s."score",
                               COALESCE(s."logEvents"::text, '[]')::bytea,
                               s."etudiantId",
                               COALESCE(u."name", ''),
                               COALESCE(u."email", ''),
                               s."epreuveId",
                               COALESCE(e."titre", ''),
                               COALESCE(e."duree", 0),
                               COALESCE(e."noteTotal", 20),
                               e."etablissementId"
                        FROM "SessionPassation" s
                        LEFT JOIN "User" u ON u."id" = s."etudiantId"
                        LEFT JOIN "Epreuve" e ON e."id" = s."epreuveId"
                        WHERE s."id" = $1
                `, sessionID).Scan(
                        &raw.ID, &raw.Statut, &raw.DateDebut, &raw.DateFin,
                        &raw.Alertes, &raw.Penalite, &raw.Score,
                        &raw.LogEventsRaw,
                        &raw.EtudiantID, &raw.EtudiantNom, &raw.EtudiantEmail,
                        &raw.EpreuveID, &raw.EpreuveTitre, &raw.EpreuveDuree,
                        &raw.EpreuveNoteTotal, &raw.EtablissementID,
                )
                if err == nil {
                        found = true
                }
                return err
        })
        if !found {
                writeJSONError(w, http.StatusNotFound, "session introuvable")
                return
        }

        // ─── Check rapportFraude dans SecuritySettings ───
        rapportFraudeEnabled := false
        if raw.EtablissementID != "" {
                _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                        err := tx.QueryRow(r.Context(),
                                `SELECT COALESCE("rapportFraude", false) FROM "SecuritySettings" WHERE "etablissementId" = $1`,
                                raw.EtablissementID,
                        ).Scan(&rapportFraudeEnabled)
                        // Pas de config → rapportFraude reste false
                        if err != nil {
                                rapportFraudeEnabled = false
                                return nil
                        }
                        return nil
                })
        }

        // ─── Parse logEvents → structured events ───
        var logEvents []survLogEvent
        if len(raw.LogEventsRaw) > 0 && string(raw.LogEventsRaw) != "[]" {
                if err := json.Unmarshal(raw.LogEventsRaw, &logEvents); err != nil {
                        logEvents = []survLogEvent{}
                }
        } else {
                logEvents = []survLogEvent{}
        }

        // ─── Classify events with severity ───
        fraudEvents := make([]rapportEvent, 0)
        for _, evt := range logEvents {
                // Skip benign/submission/screenshot events — only fraud events
                if benignEventTypes[evt.Type] || submissionEventTypes[evt.Type] || screenshotEventTypes[evt.Type] {
                        continue
                }
                sev := severityOfEvent(evt.Type)
                re := rapportEvent{
                        Type:     evt.Type,
                        Details:  evt.Details,
                        Penalite: evt.Penalite,
                        Severity: sev,
                }
                if evt.Timestamp != "" {
                        re.Timestamp = evt.Timestamp
                }
                fraudEvents = append(fraudEvents, re)
        }

        // ─── Compute summary statistics ───
        totalAlertes := raw.Alertes
        totalPenalite := raw.Penalite
        for _, evt := range logEvents {
                totalPenalite += evt.Penalite
        }

        highSeverity := 0
        mediumSeverity := 0
        lowSeverity := 0
        eventTypeBreakdown := make(map[string]int)
        for _, evt := range fraudEvents {
                eventTypeBreakdown[evt.Type]++
                switch evt.Severity {
                case "high":
                        highSeverity++
                case "medium":
                        mediumSeverity++
                case "low":
                        lowSeverity++
                }
        }

        // Risk score formula: min(100, alertes*8 + penalite*2 + highSeverityCount*5)
        riskScore := totalAlertes*8 + int(totalPenalite)*2 + highSeverity*5
        if riskScore > 100 {
                riskScore = 100
        }
        if riskScore < 0 {
                riskScore = 0
        }

        riskLevel := "safe"
        switch {
        case riskScore >= 76:
                riskLevel = "critical"
        case riskScore >= 51:
                riskLevel = "high"
        case riskScore >= 26:
                riskLevel = "moderate"
        }

        // ─── Query captures R2 ───
        var captures []rapportCapture
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(),
                        `SELECT "id", "captureIndex", "createdAt", "r2Key"
                         FROM "SessionCapture"
                         WHERE "sessionId" = $1
                         ORDER BY "captureIndex" ASC`,
                        sessionID)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        var c rapportCapture
                        var createdAt time.Time
                        if err := rows.Scan(&c.ID, &c.CaptureIndex, &createdAt, &c.R2Key); err != nil {
                                return err
                        }
                        c.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        captures = append(captures, c)
                }
                return rows.Err()
        })

        // ─── Query similarity reports for this student ───
        // FIX-5 : ajoute les rapports de similarité au rapport de fraude.
        type similarityEntry struct {
                ID                string  `json:"id"`
                SessionA          string  `json:"sessionA"`
                SessionB          string  `json:"sessionB"`
                EtudiantAID       string  `json:"etudiantAId"`
                EtudiantBID       string  `json:"etudiantBId"`
                EtudiantANom      string  `json:"etudiantANom"`
                EtudiantBNom      string  `json:"etudiantBNom"`
                GlobalSimilarity  float64 `json:"globalSimilarity"`
                QuestionSimRaw    string  `json:"-"`
                Flagged           bool    `json:"flagged"`
                CreatedAt         string  `json:"createdAt"`
        }
        var similarities []similarityEntry
        if rapportFraudeEnabled {
                _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                        rows, err := tx.Query(r.Context(), `
                                SELECT sr."id", sr."sessionA", sr."sessionB",
                                       sr."etudiantAId", sr."etudiantBId",
                                       COALESCE(ua."name", ''), COALESCE(ub."name", ''),
                                       sr."globalSimilarity", sr."questionSimilarities",
                                       sr."flagged", sr."createdAt"
                                FROM "SimilarityReport" sr
                                LEFT JOIN "User" ua ON ua."id" = sr."etudiantAId"
                                LEFT JOIN "User" ub ON ub."id" = sr."etudiantBId"
                                WHERE sr."epreuveId" = $1
                                  AND (sr."etudiantAId" = $2 OR sr."etudiantBId" = $2)
                                ORDER BY sr."globalSimilarity" DESC
                        `, raw.EpreuveID, raw.EtudiantID)
                        if err != nil {
                                return err
                        }
                        defer rows.Close()
                        for rows.Next() {
                                var se similarityEntry
                                var createdAt time.Time
                                if err := rows.Scan(&se.ID, &se.SessionA, &se.SessionB,
                                        &se.EtudiantAID, &se.EtudiantBID,
                                        &se.EtudiantANom, &se.EtudiantBNom,
                                        &se.GlobalSimilarity, &se.QuestionSimRaw,
                                        &se.Flagged, &createdAt); err != nil {
                                        return err
                                }
                                se.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                                similarities = append(similarities, se)
                        }
                        return rows.Err()
                })
        }

        // ─── Build response ───
        sessionInfo := map[string]any{
                "id":       raw.ID,
                "statut":   raw.Statut,
                "alertes":  totalAlertes,
                "penalite": totalPenalite,
        }
        if raw.DateDebut != nil {
                sessionInfo["dateDebut"] = raw.DateDebut.UTC().Format(time.RFC3339)
        }
        if raw.DateFin != nil {
                sessionInfo["dateFin"] = raw.DateFin.UTC().Format(time.RFC3339)
        }
        if raw.Score != nil {
                sessionInfo["noteTotal"] = *raw.Score
        }
        sessionInfo["noteMax"] = raw.EpreuveNoteTotal

        // FIX-5 : formater les similarités pour la réponse JSON
        similaritiesFormatted := make([]map[string]any, 0, len(similarities))
        for _, se := range similarities {
                var qs []map[string]any
                if se.QuestionSimRaw != "" {
                        json.Unmarshal([]byte(se.QuestionSimRaw), &qs)
                }
                similaritiesFormatted = append(similaritiesFormatted, map[string]any{
                        "id":                se.ID,
                        "sessionA":          se.SessionA,
                        "sessionB":          se.SessionB,
                        "etudiantAId":       se.EtudiantAID,
                        "etudiantBId":       se.EtudiantBID,
                        "etudiantANom":      se.EtudiantANom,
                        "etudiantBNom":      se.EtudiantBNom,
                        "globalSimilarity":  se.GlobalSimilarity,
                        "questionSimilarities": qs,
                        "flagged":           se.Flagged,
                        "createdAt":         se.CreatedAt,
                })
        }

        response := map[string]any{
                "session": sessionInfo,
                "etudiant": map[string]any{
                        "id":    raw.EtudiantID,
                        "name":  raw.EtudiantNom,
                        "email": raw.EtudiantEmail,
                },
                "epreuve": map[string]any{
                        "id":     raw.EpreuveID,
                        "titre":  raw.EpreuveTitre,
                        "duree":  raw.EpreuveDuree,
                },
                "events":  fraudEvents,
                "summary": map[string]any{
                        "totalAlertes":      totalAlertes,
                        "totalPenalite":     totalPenalite,
                        "highSeverity":      highSeverity,
                        "mediumSeverity":    mediumSeverity,
                        "lowSeverity":       lowSeverity,
                        "eventTypeBreakdown": eventTypeBreakdown,
                        "riskLevel":         riskLevel,
                        "riskScore":         riskScore,
                },
                "captures":             captures,
                "rapportFraudeEnabled": rapportFraudeEnabled,
                "similarities":         similaritiesFormatted,
                "generatedAt":          time.Now().UTC().Format(time.RFC3339),
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(response)
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/surveillance/{epreuveId}/similarities — liste des rapports de similarité
// ──────────────────────────────────────────────────────────────────────────
//
// FIX-5 : retourne tous les SimilarityReport pour une épreuve, triés par
// globalSimilarity DESC, avec les noms des étudiants (JOIN User).
// RequireRole : ENSEIGNANT/ADMIN/RESPONSABLE.

func (s *Server) listSimilarityReports(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        epreuveID := chi.URLParam(r, "epreuveId")
        if epreuveID == "" {
                writeJSONError(w, http.StatusBadRequest, "epreuveId requis")
                return
        }

        type simReportRow struct {
                ID               string  `json:"id"`
                SessionA         string  `json:"sessionA"`
                SessionB         string  `json:"sessionB"`
                EtudiantAID      string  `json:"etudiantAId"`
                EtudiantBID      string  `json:"etudiantBId"`
                EtudiantANom     string  `json:"etudiantANom"`
                EtudiantBNom     string  `json:"etudiantBNom"`
                EtudiantAEmail   string  `json:"etudiantAEmail"`
                EtudiantBEmail   string  `json:"etudiantBEmail"`
                GlobalSimilarity float64 `json:"globalSimilarity"`
                QuestionSimRaw   string  `json:"-"`
                Flagged          bool    `json:"flagged"`
                CreatedAt        string  `json:"createdAt"`
        }

        var reports []simReportRow
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT sr."id", sr."sessionA", sr."sessionB",
                               sr."etudiantAId", sr."etudiantBId",
                               COALESCE(ua."name", ''), COALESCE(ub."name", ''),
                               COALESCE(ua."email", ''), COALESCE(ub."email", ''),
                               sr."globalSimilarity", sr."questionSimilarities",
                               sr."flagged", sr."createdAt"
                        FROM "SimilarityReport" sr
                        LEFT JOIN "User" ua ON ua."id" = sr."etudiantAId"
                        LEFT JOIN "User" ub ON ub."id" = sr."etudiantBId"
                        WHERE sr."epreuveId" = $1
                        ORDER BY sr."globalSimilarity" DESC
                `, epreuveID)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        var r2 simReportRow
                        var createdAt time.Time
                        if err := rows.Scan(&r2.ID, &r2.SessionA, &r2.SessionB,
                                &r2.EtudiantAID, &r2.EtudiantBID,
                                &r2.EtudiantANom, &r2.EtudiantBNom,
                                &r2.EtudiantAEmail, &r2.EtudiantBEmail,
                                &r2.GlobalSimilarity, &r2.QuestionSimRaw,
                                &r2.Flagged, &createdAt); err != nil {
                                return err
                        }
                        r2.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        reports = append(reports, r2)
                }
                return rows.Err()
        })

        // Récupérer le seuilSimilarite depuis SecuritySettings
        seuilSimilarite := 0.85
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                var etabID string
                err := tx.QueryRow(r.Context(), `
                        SELECT COALESCE(f."etablissementId", e."etablissementId")
                        FROM "Epreuve" e
                        LEFT JOIN "Filiere" f ON f."id" = e."filiereId"
                        WHERE e."id" = $1
                `, epreuveID).Scan(&etabID)
                if err != nil {
                        return err
                }
                if etabID != "" {
                        _ = tx.QueryRow(r.Context(), `
                                SELECT COALESCE("seuilSimilarite", 0.85)
                                FROM "SecuritySettings"
                                WHERE "etablissementId" = $1
                        `, etabID).Scan(&seuilSimilarite)
                }
                return nil
        })

        // Formater les rapports avec questionSimilarities parsé
        type formattedReport struct {
                ID                  string         `json:"id"`
                SessionA            string         `json:"sessionA"`
                SessionB            string         `json:"sessionB"`
                EtudiantAId         string         `json:"etudiantAId"`
                EtudiantBId         string         `json:"etudiantBId"`
                EtudiantANom        string         `json:"etudiantANom"`
                EtudiantBNom        string         `json:"etudiantBNom"`
                EtudiantAEmail      string         `json:"etudiantAEmail"`
                EtudiantBEmail      string         `json:"etudiantBEmail"`
                GlobalSimilarity    float64        `json:"globalSimilarity"`
                QuestionSimilarities []map[string]any `json:"questionSimilarities"`
                Flagged             bool           `json:"flagged"`
                CreatedAt           string         `json:"createdAt"`
        }

        formatted := make([]formattedReport, 0, len(reports))
        for _, r2 := range reports {
                var qs []map[string]any
                if r2.QuestionSimRaw != "" {
                        json.Unmarshal([]byte(r2.QuestionSimRaw), &qs)
                }
                formatted = append(formatted, formattedReport{
                        ID:                  r2.ID,
                        SessionA:            r2.SessionA,
                        SessionB:            r2.SessionB,
                        EtudiantAId:         r2.EtudiantAID,
                        EtudiantBId:         r2.EtudiantBID,
                        EtudiantANom:        r2.EtudiantANom,
                        EtudiantBNom:        r2.EtudiantBNom,
                        EtudiantAEmail:      r2.EtudiantAEmail,
                        EtudiantBEmail:      r2.EtudiantBEmail,
                        GlobalSimilarity:    r2.GlobalSimilarity,
                        QuestionSimilarities: qs,
                        Flagged:             r2.Flagged,
                        CreatedAt:           r2.CreatedAt,
                })
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "reports":          formatted,
                "seuilSimilarite":  seuilSimilarite,
                "epreuveId":        epreuveID,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/sessions/identity-photo — upload d'une photo d'identité
// ──────────────────────────────────────────────────────────────────────────
//
// Le frontend (passation-page.tsx webcam-capture) envoie une photo JPEG
// encodée en base64 avec l'epreuveId et optionnellement le sessionId.
// On decode, on upload vers R2, on insère dans IdentityPhoto.
//
// Accès : ETUDIANT uniquement.

func (s *Server) uploadIdentityPhoto(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // Vérifier que l'utilisateur est un étudiant
        if claims.Role != string(domain.RoleEtudiant) {
                writeJSONError(w, http.StatusForbidden, "réservé aux étudiants")
                return
        }

        var input struct {
                EpreuveID string `json:"epreuveId"`
                SessionID string `json:"sessionId,omitempty"`
                PhotoType string `json:"photoType"` // "pre-exam" | "mid-exam"
                Image     string `json:"image"`     // "data:image/jpeg;base64,..."
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
                return
        }
        if input.EpreuveID == "" {
                writeJSONError(w, http.StatusBadRequest, "epreuveId requis")
                return
        }
        if input.Image == "" {
                writeJSONError(w, http.StatusBadRequest, "image requise")
                return
        }
        // Valider photoType
        validTypes := map[string]bool{"pre-exam": true, "mid-exam": true, "post-exam": true}
        if !validTypes[input.PhotoType] {
                input.PhotoType = "pre-exam"
        }

        // Décoder le base64 de l'image (accepte data:image/jpeg;base64,... ou base64 brut)
        imageData := input.Image
        if idx := strings.Index(imageData, ";base64,"); idx >= 0 {
                imageData = imageData[idx+8:]
        }
        imageBytes, err := base64.StdEncoding.DecodeString(imageData)
        if err != nil {
                imageBytes, err = base64.RawStdEncoding.DecodeString(imageData)
                if err != nil {
                        writeJSONError(w, http.StatusBadRequest, "image base64 invalide")
                        return
                }
        }

        // Calculer SHA-256 pour intégrité
        hash := sha256.Sum256(imageBytes)
        imageHash := fmt.Sprintf("%x", hash)

        // Upload vers R2 si disponible
        photoID := uuid.New().String()
        r2Key := ""

        if s.storage != nil {
                ts := time.Now().UTC().Format("20060102-150405.000")
                r2Key = fmt.Sprintf("identity-photos/%s/%s.jpg", claims.UserID, ts)

                _, err := s.storage.Upload(r.Context(), domain.StorageObject{
                        Key:           r2Key,
                        Content:       imageBytes,
                        ContentType:   "image/jpeg",
                        ContentLength: int64(len(imageBytes)),
                })
                if err != nil {
                        fmt.Printf("[uploadIdentityPhoto] R2 upload failed: %v\n", err)
                        r2Key = ""
                }
        }

        // Insérer dans IdentityPhoto (via system claims pour bypass RLS INSERT)
        systemClaims := appdb.SystemClaims()
        var createdAt time.Time
        _ = appdb.WithTx(r.Context(), s.dbPool, systemClaims, func(tx pgx.Tx) error {
                return tx.QueryRow(r.Context(),
                        `INSERT INTO "IdentityPhoto" ("id", "etudiantId", "epreuveId", "sessionId", "r2Key", "photoType", "imageHash", "createdAt")
                         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                         RETURNING "createdAt"`,
                        photoID, claims.UserID, input.EpreuveID, input.SessionID, r2Key, input.PhotoType, imageHash,
                ).Scan(&createdAt)
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "id":        photoID,
                "r2Key":     r2Key,
                "photoType": input.PhotoType,
                "createdAt": createdAt.UTC().Format(time.RFC3339),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/sessions/{id}/identity-photos — liste des photos d'identité
// ──────────────────────────────────────────────────────────────────────────
//
// Retourne les photos d'identité pour la session d'un étudiant avec URL
// présignée R2 (valide 5 minutes).
// Accès : ENSEIGNANT/ADMIN/RESPONSABLE ou l'étudiant propriétaire.

func (s *Server) listIdentityPhotos(w http.ResponseWriter, r *http.Request) {
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

        // Vérifier l'accès : l'étudiant propriétaire OU enseignant/admin/responsable
        role := domain.Role(claims.Role)
        isStaff := role == domain.RoleEnseignant || role == domain.RoleAdmin || role == domain.RoleResponsable

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
        if !found {
                writeJSONError(w, http.StatusNotFound, "session introuvable")
                return
        }
        if !isStaff && etudiantID != claims.UserID {
                writeJSONError(w, http.StatusForbidden, "accès refusé")
                return
        }

        // Récupérer les photos d'identité pour cette session
        type identityPhotoRow struct {
                ID         string     `json:"id"`
                EtudiantID string    `json:"etudiantId"`
                EpreuveID  string    `json:"epreuveId"`
                SessionID  *string   `json:"sessionId,omitempty"`
                R2Key      string    `json:"r2Key,omitempty"`
                PhotoType  string    `json:"photoType"`
                ImageHash  *string   `json:"imageHash,omitempty"`
                VerifiedAt *time.Time `json:"verifiedAt,omitempty"`
                VerifiedBy *string   `json:"verifiedBy,omitempty"`
                CreatedAt  time.Time `json:"createdAt"`
        }

        var photos []identityPhotoRow
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(),
                        `SELECT "id", "etudiantId", "epreuveId", "sessionId", "r2Key", "photoType", "imageHash", "verifiedAt", "verifiedBy", "createdAt"
                         FROM "IdentityPhoto"
                         WHERE "sessionId" = $1
                         ORDER BY "createdAt" ASC`,
                        sessionID)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        var p identityPhotoRow
                        if err := rows.Scan(&p.ID, &p.EtudiantID, &p.EpreuveID, &p.SessionID, &p.R2Key, &p.PhotoType, &p.ImageHash, &p.VerifiedAt, &p.VerifiedBy, &p.CreatedAt); err != nil {
                                return err
                        }
                        photos = append(photos, p)
                }
                return rows.Err()
        })

        // Enrichir avec URL présignées si R2 est disponible
        type identityPhotoResponse struct {
                ID         string  `json:"id"`
                EtudiantID string  `json:"etudiantId"`
                EpreuveID  string  `json:"epreuveId"`
                SessionID  *string `json:"sessionId,omitempty"`
                URL        string  `json:"url,omitempty"`
                R2Key      string  `json:"r2Key,omitempty"`
                PhotoType  string  `json:"photoType"`
                ImageHash  *string `json:"imageHash,omitempty"`
                VerifiedAt *string `json:"verifiedAt,omitempty"`
                VerifiedBy *string `json:"verifiedBy,omitempty"`
                CreatedAt  string  `json:"createdAt"`
        }

        result := make([]identityPhotoResponse, 0, len(photos))
        for _, p := range photos {
                resp := identityPhotoResponse{
                        ID:         p.ID,
                        EtudiantID: p.EtudiantID,
                        EpreuveID:  p.EpreuveID,
                        SessionID:  p.SessionID,
                        R2Key:      p.R2Key,
                        PhotoType:  p.PhotoType,
                        ImageHash:  p.ImageHash,
                        VerifiedBy: p.VerifiedBy,
                        CreatedAt:  p.CreatedAt.UTC().Format(time.RFC3339),
                }
                if p.VerifiedAt != nil {
                        va := p.VerifiedAt.UTC().Format(time.RFC3339)
                        resp.VerifiedAt = &va
                }
                // Générer URL présignée (5 min = 300s) si R2 disponible et clé présente
                if s.storage != nil && p.R2Key != "" {
                        url, err := s.storage.PresignURL(r.Context(), p.R2Key, 300)
                        if err == nil {
                                resp.URL = url
                        }
                }
                result = append(result, resp)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "photos": result,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/identity-photos/{id}/verify — vérifier une photo d'identité
// ──────────────────────────────────────────────────────────────────────────
//
// Marque une photo d'identité comme vérifiée par un enseignant/admin/responsable.
// Accès : ENSEIGNANT, ADMIN, RESPONSABLE uniquement.

func (s *Server) verifyIdentityPhoto(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // Vérifier le rôle
        role := domain.Role(claims.Role)
        if role != domain.RoleEnseignant && role != domain.RoleAdmin && role != domain.RoleResponsable {
                writeJSONError(w, http.StatusForbidden, "réservé aux enseignants, administrateurs et responsables")
                return
        }

        photoID := chi.URLParam(r, "id")
        if photoID == "" {
                writeJSONError(w, http.StatusBadRequest, "id photo requis")
                return
        }

        // Vérifier la photo (via system claims pour bypass RLS)
        systemClaims := appdb.SystemClaims()
        var verifiedAt time.Time
        err := appdb.WithTx(r.Context(), s.dbPool, systemClaims, func(tx pgx.Tx) error {
                result, err := tx.Exec(r.Context(),
                        `UPDATE "IdentityPhoto"
                         SET "verifiedAt" = NOW(), "verifiedBy" = $1
                         WHERE "id" = $2 AND "verifiedAt" IS NULL`,
                        claims.UserID, photoID)
                if err != nil {
                        return err
                }
                if result.RowsAffected() == 0 {
                        return fmt.Errorf("photo introuvable ou déjà vérifiée")
                }
                // Récupérer le verifiedAt
                return tx.QueryRow(r.Context(),
                        `SELECT "verifiedAt" FROM "IdentityPhoto" WHERE "id" = $1`,
                        photoID).Scan(&verifiedAt)
        })
        if err != nil {
                if err.Error() == "photo introuvable ou déjà vérifiée" {
                        writeJSONError(w, http.StatusNotFound, "photo introuvable ou déjà vérifiée")
                } else {
                        writeJSONError(w, http.StatusInternalServerError, "erreur lors de la vérification")
                }
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "verified":   true,
                "verifiedAt": verifiedAt.UTC().Format(time.RFC3339),
                "verifiedBy": claims.UserID,
        })
}
