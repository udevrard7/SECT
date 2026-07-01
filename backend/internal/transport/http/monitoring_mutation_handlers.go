package http

// monitoring_mutation_handlers.go — Mutations pour /api/monitoring.
//
// MONITORING-FIX-M2 : avant, seules les GET étaient déclarées → résoudre,
// ignorer et escalader un événement retournaient 404/405.
//
// 3 handlers :
// - createMonitoringEvent (POST /) : escalade (crée un event CRITICAL)
// - resolveMonitoringEvent (PATCH /{id}) : marque RESOLU + resoluLe + resoluPar
// - ignoreMonitoringEvent (DELETE /{id}) : marque IGNORE (soft-delete)

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

// validTypesMonitoring — types d'événement gérés par le frontend.
var validTypesMonitoring = map[string]bool{
        "API": true, "DATABASE": true, "AUTH": true,
        "EVALUATION": true, "PAYMENT": true, "SYSTEM": true,
}

// validSeveritesMonitoring — sévérités gérées par le frontend.
var validSeveritesMonitoring = map[string]bool{
        "INFO": true, "WARNING": true, "ERROR": true, "CRITICAL": true,
}

// monitoringEventColumns — colonnes pour SELECT/RETURNING.
const monitoringEventColumns = `"id", "type", "severite", "message", "details", "source", "duree",
        "statut", "resoluLe", "resoluPar", "createdAt", "updatedAt"`

// monitoringEventResponse — structure de réponse commune.
type monitoringEventResponse struct {
        ID        string  `json:"id"`
        Type      string  `json:"type"`
        Severite  string  `json:"severite"`
        Message   string  `json:"message"`
        Details   *string `json:"details,omitempty"`
        Source    *string `json:"source,omitempty"`
        Duree     *int    `json:"duree,omitempty"`
        Statut    string  `json:"statut"`
        ResoluLe  *string `json:"resoluLe,omitempty"`
        ResoluPar *string `json:"resoluPar,omitempty"`
        CreatedAt string  `json:"createdAt"`
        UpdatedAt string  `json:"updatedAt"`
}

func scanMonitoringEvent(row pgx.Row) (*monitoringEventResponse, error) {
        e := &monitoringEventResponse{}
        var createdAt, updatedAt time.Time
        var resoluLe *time.Time
        if err := row.Scan(&e.ID, &e.Type, &e.Severite, &e.Message, &e.Details,
                &e.Source, &e.Duree, &e.Statut, &resoluLe, &e.ResoluPar,
                &createdAt, &updatedAt); err != nil {
                return nil, err
        }
        e.CreatedAt = createdAt.UTC().Format(time.RFC3339)
        e.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
        if resoluLe != nil {
                ts := resoluLe.UTC().Format(time.RFC3339)
                e.ResoluLe = &ts
        }
        return e, nil
}

// createMonitoringEvent — POST /api/monitoring (escalade)
func (s *Server) createMonitoringEvent(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                Type     string  `json:"type"`
                Severite string  `json:"severite"`
                Message  string  `json:"message"`
                Details  *string `json:"details"`
                Source   *string `json:"source"`
                Duree    *int    `json:"duree"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if !validTypesMonitoring[input.Type] {
                writeJSONError(w, http.StatusBadRequest, "type invalide (API, DATABASE, AUTH, EVALUATION, PAYMENT, SYSTEM)")
                return
        }
        if !validSeveritesMonitoring[input.Severite] {
                writeJSONError(w, http.StatusBadRequest, "severite invalide (INFO, WARNING, ERROR, CRITICAL)")
                return
        }
        if input.Message == "" {
                writeJSONError(w, http.StatusBadRequest, "message requis")
                return
        }

        created := &monitoringEventResponse{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                newID := "monit_" + uuid.NewString()
                row := tx.QueryRow(r.Context(), fmt.Sprintf(`
                        INSERT INTO "MonitoringEvent" ("id", "type", "severite", "message", "details", "source", "duree",
                                "statut", "resoluLe", "resoluPar", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIF', NULL, NULL, now(), now())
                        RETURNING %s
                `, monitoringEventColumns),
                        newID, input.Type, input.Severite, input.Message, input.Details, input.Source, input.Duree,
                )
                e, err := scanMonitoringEvent(row)
                if err == nil {
                        created = e
                        success = true
                }
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusForbidden, "création non autorisée")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{"event": created})
}

// resolveMonitoringEvent — PATCH /api/monitoring/{id} (résoudre)
func (s *Server) resolveMonitoringEvent(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        var input struct {
                Action    string  `json:"action"`
                ResoluPar *string `json:"resoluPar"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.Action != "resoudre" {
                writeJSONError(w, http.StatusBadRequest, "action doit être 'resoudre'")
                return
        }

        // Bug B3 (HIGH, audit monitoring 2025) : resoluPar forcé à l'email de
        // l'admin courant (anti-forgery). La valeur envoyée par le client est
        // ignorée pour empêcher l'usurpation d'identité dans l'audit trail.
        _ = input.ResoluPar // explicitement ignoré
        resoluPar := claims.Email
        if resoluPar == "" {
                resoluPar = claims.UserID // fallback si Email vide
        }

        updated := &monitoringEventResponse{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(r.Context(), fmt.Sprintf(`
                        UPDATE "MonitoringEvent" SET "statut" = 'RESOLU', "resoluLe" = now(),
                                "resoluPar" = $2, "updatedAt" = now()
                        WHERE "id" = $1
                        RETURNING %s
                `, monitoringEventColumns), id, resoluPar)
                e, err := scanMonitoringEvent(row)
                if err == nil {
                        updated = e
                        success = true
                }
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusNotFound, "événement non trouvé ou non autorisé")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"event": updated})
}

// ignoreMonitoringEvent — DELETE /api/monitoring/{id} (ignorer, soft-delete)
func (s *Server) ignoreMonitoringEvent(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        ignored := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(r.Context(), `
                        UPDATE "MonitoringEvent" SET "statut" = 'IGNORE', "updatedAt" = now()
                        WHERE "id" = $1
                `, id)
                if err == nil && tag.RowsAffected() > 0 {
                        ignored = true
                }
                return nil
        })

        if !ignored {
                writeJSONError(w, http.StatusNotFound, "événement non trouvé ou non autorisé")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "événement ignoré"})
}

// monitoringHealthCheck — GET /api/monitoring/health
//
// Bug B2 (CRITICAL, audit monitoring 2025) : les 6 services (API/DB/Auth/etc.)
// étaient hardcodés à 99.9x% dans le frontend. Ce handler fait de vrais checks
// en temps réel et retourne l'état actuel de chaque service.
//
// Response: { services: [...], overall, healthyCount, totalCount, checkedAt }
func (s *Server) monitoringHealthCheck(w http.ResponseWriter, r *http.Request) {
        if s.monHealthChecker == nil {
                writeJSONError(w, http.StatusServiceUnavailable, "health checker non initialisé")
                return
        }

        report := s.monHealthChecker.CheckAll(r.Context())

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(report)
}

// bulkMonitoringEvents — POST /api/monitoring/bulk
//
// Action de masse sur plusieurs événements de monitoring. Permet à l'ADMIN de
// résoudre ou ignorer plusieurs événements en une seule requête (utile quand
// une vague d'alertes similaires arrive, ex: 50 erreurs DB consécutives).
//
// Body: { "ids": ["uuid1", "uuid2", ...], "action": "resoudre"|"ignorer" }
// Response: { "updated": N, "action": "...", "failed": [...] }
//
// Sécurité :
// - RequireAuth + RequireRole("ADMIN") (déclaré dans router.go).
// - resoluPar forcé à claims.Email (anti-forgery, comme resolveMonitoringEvent).
// - Limité à 100 IDs par requête (anti-abus).
// - Tout se fait dans UNE transaction (atomicité : tout réussit ou tout échoue).
// - Les IDs inexistants sont ignorés (pas d'erreur) — seul le count updated est retourné.
func (s *Server) bulkMonitoringEvents(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                IDs    []string `json:"ids"`
                Action string   `json:"action"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        if len(input.IDs) == 0 {
                writeJSONError(w, http.StatusBadRequest, "ids requis (au moins 1)")
                return
        }
        if len(input.IDs) > 100 {
                writeJSONError(w, http.StatusBadRequest, "trop d'IDs (max 100 par requête)")
                return
        }

        // Valider l'action
        switch input.Action {
        case "resoudre", "ignorer":
                // OK
        default:
                writeJSONError(w, http.StatusBadRequest, "action doit être 'resoudre' ou 'ignorer'")
                return
        }

        // resoluPar pour action "resoudre" (anti-forgery : forcé à l'admin courant).
        resoluPar := ""
        if input.Action == "resoudre" {
                resoluPar = claims.Email
                if resoluPar == "" {
                        resoluPar = claims.UserID
                }
        }

        // Construire la requête UPDATE avec IN (...) — on utilise ANY($1::text[]) pour
        // éviter la concaténation SQL (sécurité injection).
        updated := 0
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                if input.Action == "resoudre" {
                        tag, err := tx.Exec(r.Context(), `
                                UPDATE "MonitoringEvent"
                                SET "statut" = 'RESOLU', "resoluLe" = now(), "resoluPar" = $2, "updatedAt" = now()
                                WHERE "id" = ANY($1::text[]) AND "statut" = 'ACTIF'
                        `, input.IDs, resoluPar)
                        if err != nil {
                                return err
                        }
                        updated = int(tag.RowsAffected())
                } else { // ignorer
                        tag, err := tx.Exec(r.Context(), `
                                UPDATE "MonitoringEvent"
                                SET "statut" = 'IGNORE', "updatedAt" = now()
                                WHERE "id" = ANY($1::text[]) AND "statut" = 'ACTIF'
                        `, input.IDs)
                        if err != nil {
                                return err
                        }
                        updated = int(tag.RowsAffected())
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "updated": updated,
                "action":  input.Action,
                "total":   len(input.IDs),
        })
}
