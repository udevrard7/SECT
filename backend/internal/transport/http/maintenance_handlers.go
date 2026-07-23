package http

// maintenance_handlers.go — SECT-RESILIENCE-1
//
// Endpoint public GET /api/maintenance-status — retourne l'état de maintenance
// de la plateforme (lu depuis PlatformSettings).
//
// Permet au frontend (hook use-backend-health) de détecter :
//   1. Le mode maintenance planifié (admin a activé maintenanceMode=true)
//   2. La disponibilité du backend (si cet endpoint répond, le backend est up)
//
// Endpoint PUBLIC (pas de RequireAuth) car le frontend doit pouvoir le requêter
// avant même que l'utilisateur soit authentifié (page /login, /maintenance).
//
// Retourne :
//   200 OK  {"status":"ok","maintenanceMode":false,"message":""}
//   200 OK  {"status":"ok","maintenanceMode":true,"message":"Maintenance planifiée..."}
//
// En cas d'erreur de lecture PlatformSettings (table vide ou DB down), on
// retourne maintenanceMode=false (fail-open) — le frontend gérera le down
// backend via le hook health (5 échecs /api/health → redirect /maintenance).

import (
        "encoding/json"
        "net/http"

        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
)

// maintenanceStatus — GET /api/maintenance-status (public)
func (s *Server) maintenanceStatus(w http.ResponseWriter, r *http.Request) {
        maintenanceMode := false
        message := ""

        // Lire PlatformSettings (table singleton, id='default').
        // settings est un JSON TEXT. On extrait juste maintenanceMode + message.
        //
        // SECT-RESILIENCE-1 fix : utiliser db.WithTx avec SystemClaims (bypass RLS)
        // car PlatformSettings a RLS activé MAIS aucune policy → un user non-superuser
        // (sect_app sur Render) ne peut rien lire. SystemClaims pose SET LOCAL
        // app.claims.role='SYSTEM' qui est accepté par le bypass du pooler Neon.
        if s.dbPool != nil {
                var settingsJSON string
                _ = appdb.WithTx(r.Context(), s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                        err := tx.QueryRow(r.Context(),
                                `SELECT "settings"::text FROM "PlatformSettings" WHERE "id" = 'default'`).Scan(&settingsJSON)
                        return err
                })
                if settingsJSON != "" {
                        // Parser le JSON pour extraire maintenanceMode + message (best-effort).
                        var settings map[string]any
                        if json.Unmarshal([]byte(settingsJSON), &settings) == nil {
                                // maintenanceMode peut être dans general.maintenanceMode ou au root.
                                if general, ok := settings["general"].(map[string]any); ok {
                                        if mm, ok := general["maintenanceMode"].(bool); ok {
                                                maintenanceMode = mm
                                        }
                                        if msg, ok := general["maintenanceMessage"].(string); ok {
                                                message = msg
                                        }
                                }
                                // Fallback : maintenanceMode au root (au cas où la structure changerait)
                                if mm, ok := settings["maintenanceMode"].(bool); ok {
                                        maintenanceMode = mm
                                }
                                if msg, ok := settings["maintenanceMessage"].(string); ok {
                                        message = msg
                                }
                        }
                }
                // Si err != nil (table vide ou DB down), on garde maintenanceMode=false (fail-open)
        }

        w.Header().Set("Content-Type", "application/json")
        w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
        json.NewEncoder(w).Encode(map[string]any{
                "status":          "ok",
                "maintenanceMode": maintenanceMode,
                "message":         message,
        })
}
