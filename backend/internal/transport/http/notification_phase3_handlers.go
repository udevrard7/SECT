// Package http — handlers Phase 3 notifications : SSE, unified, preferences.
package http

import (
        "encoding/json"
        "fmt"
        "net/http"
        "strings"
        "time"

        "github.com/go-chi/chi/v5"
        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// N9 FIX : GET /api/notifications/stream — SSE temps réel
// ──────────────────────────────────────────────────────────────────────────
// Push le compteur de notifications non lues toutes les 15s + heartbeat 45s.
// Le frontend utilise EventSource pour écouter et mettre à jour le badge
// instantanément sans polling manuel.

func (s *Server) notificationsStream(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        w.Header().Set("Content-Type", "text/event-stream")
        w.Header().Set("Cache-Control", "no-cache")
        w.Header().Set("Connection", "keep-alive")
        w.Header().Set("X-Accel-Buffering", "no")

        flusher, _ := w.(http.Flusher)
        flushIfNeeded := func() {
                if flusher != nil {
                        flusher.Flush()
                }
        }

        // Compteur initial
        count := s.fetchUnreadCountSSE(r, claims)
        initialData, _ := json.Marshal(map[string]any{"unreadCount": count})
        initialEvent, _ := json.Marshal(NotificationEvent{
                Type:      "notification",
                Data:      initialData,
                Timestamp: time.Now().UTC().Format(time.RFC3339),
        })
        fmt.Fprintf(w, "data: %s\n\n", initialEvent)
        flushIfNeeded()

        // Polling 15s pour le compteur (near-real-time sans modifier les handlers de création)
        ticker := time.NewTicker(15 * time.Second)
        heartbeat := time.NewTicker(45 * time.Second)
        defer ticker.Stop()
        defer heartbeat.Stop()

        for {
                select {
                case <-r.Context().Done():
                        return
                case <-ticker.C:
                        newCount := s.fetchUnreadCountSSE(r, claims)
                        if newCount != count {
                                count = newCount
                                data, _ := json.Marshal(map[string]any{"unreadCount": newCount})
                                event, _ := json.Marshal(NotificationEvent{
                                        Type:      "notification",
                                        Data:      data,
                                        Timestamp: time.Now().UTC().Format(time.RFC3339),
                                })
                                fmt.Fprintf(w, "data: %s\n\n", event)
                                flushIfNeeded()
                        }
                case <-heartbeat.C:
                        fmt.Fprintf(w, ": heartbeat\n\n")
                        flushIfNeeded()
                }
        }
}

// fetchUnreadCountSSE compte les notifications non lues via la VIEW unifiée.
// DEFENSE-IN-DEPTH RBAC : neondb_owner a BYPASSRLS=true, donc on filtre
// explicitement par destinataireId/destinataireRole + scope filière/épreuve.
func (s *Server) fetchUnreadCountSSE(r *http.Request, claims appdb.SessionClaims) int {
        count := 0
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                role := claims.Role
                var rbacConds []string
                var args []any
                argIdx := 1

                rbacConds = append(rbacConds, fmt.Sprintf(`"destinataireId" = $%d`, argIdx))
                args = append(args, claims.UserID)
                argIdx++

                rbacConds = append(rbacConds, `("destinataireId" IS NULL AND "destinataireRole" IS NULL)`)

                rbacConds = append(rbacConds, fmt.Sprintf(`"destinataireRole" = $%d`, argIdx))
                args = append(args, role)
                argIdx++

                if role == "RESPONSABLE" && claims.EtablissementID != "" {
                        rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Filiere" f WHERE f.id = "NotificationUnified"."filiereId" AND f."etablissementId" = $%d))`, argIdx))
                        args = append(args, claims.EtablissementID)
                        argIdx++
                        rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f.id = e."filiereId" WHERE e.id = "NotificationUnified"."epreuveId" AND f."etablissementId" = $%d))`, argIdx))
                        args = append(args, claims.EtablissementID)
                        argIdx++
                }

                if role == "ENSEIGNANT" {
                        rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Epreuve" e WHERE e.id = "NotificationUnified"."epreuveId" AND e."enseignantId" = $%d))`, argIdx))
                        args = append(args, claims.UserID)
                        argIdx++
                }

                query := fmt.Sprintf(`
                        SELECT count(*) FROM "NotificationUnified"
                        WHERE ("lue" = false) AND (%s)
                `, strings.Join(rbacConds, " OR "))

                return tx.QueryRow(r.Context(), query, args...).Scan(&count)
        })
        return count
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/notifications/unified — notifications unifiées (VIEW)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) notificationsUnifiedList(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type UnifiedNotif struct {
                ID               string  `json:"id"`
                Source           string  `json:"source"`
                Titre            string  `json:"titre"`
                Description      string  `json:"description"`
                Severity         string  `json:"severity"`
                Type             string  `json:"type"`
                Lue              bool    `json:"lue"`
                DestinataireID   *string `json:"destinataireId,omitempty"`
                DestinataireRole *string `json:"destinataireRole,omitempty"`
                ActionURL        *string `json:"actionUrl,omitempty"`
                ActionLabel      *string `json:"actionLabel,omitempty"`
                Categorie        *string `json:"categorie,omitempty"`
                FiliereID        *string `json:"filiereId,omitempty"`
                EpreuveID        *string `json:"epreuveId,omitempty"`
                CreatedAt        string  `json:"createdAt"`
        }

        result := []UnifiedNotif{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                luParam := r.URL.Query().Get("lu")
                limit := 50
                if l := r.URL.Query().Get("limit"); l != "" {
                        if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 200 {
                                limit = n
                        }
                }

                // DEFENSE-IN-DEPTH RBAC : neondb_owner a BYPASSRLS=true (défaut Neon),
                // donc les policies RLS ne filtrent rien pour le backend. On ajoute un
                // WHERE explicite par rôle, identique à alertesListReal (N1 fix).
                role := claims.Role
                var rbacConds []string
                var args []any
                argIdx := 1

                // Notifications personnelles (destinataireId = user courant)
                rbacConds = append(rbacConds, fmt.Sprintf(`"destinataireId" = $%d`, argIdx))
                args = append(args, claims.UserID)
                argIdx++

                // Broadcast global (destinataireId IS NULL AND destinataireRole IS NULL)
                rbacConds = append(rbacConds, `("destinataireId" IS NULL AND "destinataireRole" IS NULL)`)

                // Broadcast par rôle (destinataireRole = rôle du user)
                rbacConds = append(rbacConds, fmt.Sprintf(`"destinataireRole" = $%d`, argIdx))
                args = append(args, role)
                argIdx++

                // RESPONSABLE : alertes des filières/épreuves de son établissement
                // (source='alerte' avec filiereId/epreuveId liés à son étab)
                if role == "RESPONSABLE" && claims.EtablissementID != "" {
                        rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Filiere" f WHERE f.id = "NotificationUnified"."filiereId" AND f."etablissementId" = $%d))`, argIdx))
                        args = append(args, claims.EtablissementID)
                        argIdx++
                        rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f.id = e."filiereId" WHERE e.id = "NotificationUnified"."epreuveId" AND f."etablissementId" = $%d))`, argIdx))
                        args = append(args, claims.EtablissementID)
                        argIdx++
                }

                // ENSEIGNANT : alertes des épreuves qu'il enseigne
                if role == "ENSEIGNANT" {
                        rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Epreuve" e WHERE e.id = "NotificationUnified"."epreuveId" AND e."enseignantId" = $%d))`, argIdx))
                        args = append(args, claims.UserID)
                        argIdx++
                }

                // Clause WHERE : (RBAC) AND (filtre lue optionnel)
                whereParts := []string{"(" + strings.Join(rbacConds, " OR ") + ")"}
                if luParam == "false" {
                        whereParts = append(whereParts, `"lue" = false`)
                } else if luParam == "true" {
                        whereParts = append(whereParts, `"lue" = true`)
                }
                whereClause := "WHERE " + strings.Join(whereParts, " AND ")

                query := fmt.Sprintf(`
                        SELECT "id", "source", "titre", "description", "severity", "type", "lue",
                               "destinataireId", "destinataireRole", "actionUrl", "actionLabel",
                               "categorie", "filiereId", "epreuveId", "createdAt"
                        FROM "NotificationUnified"
                        %s
                        ORDER BY "createdAt" DESC
                        LIMIT $%d
                `, whereClause, argIdx)
                args = append(args, limit)

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return nil
                }
                defer rows.Close()
                for rows.Next() {
                        n := UnifiedNotif{}
                        var createdAt time.Time
                        if err := rows.Scan(&n.ID, &n.Source, &n.Titre, &n.Description, &n.Severity, &n.Type, &n.Lue,
                                &n.DestinataireID, &n.DestinataireRole, &n.ActionURL, &n.ActionLabel,
                                &n.Categorie, &n.FiliereID, &n.EpreuveID, &createdAt); err != nil {
                                return err
                        }
                        n.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        result = append(result, n)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "notifications": result,
                "total":         len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/notifications/preferences — préférences du user courant
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) notificationsPreferencesGet(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type Pref struct {
                ID           string `json:"id"`
                Categorie    string `json:"categorie"`
                PushEnabled  bool   `json:"pushEnabled"`
                EmailEnabled bool   `json:"emailEnabled"`
        }

        result := []Pref{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "categorie", "pushEnabled", "emailEnabled"
                        FROM "NotificationPreference"
                        WHERE "userId" = $1
                        ORDER BY "categorie"
                `, claims.UserID)
                if err != nil {
                        return nil
                }
                defer rows.Close()
                for rows.Next() {
                        p := Pref{}
                        if err := rows.Scan(&p.ID, &p.Categorie, &p.PushEnabled, &p.EmailEnabled); err != nil {
                                return err
                        }
                        result = append(result, p)
                }
                return rows.Err()
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "preferences": result,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/notifications/preferences — upsert préférence
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) notificationsPreferencesUpdate(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var body struct {
                Categorie    string `json:"categorie"`
                PushEnabled  *bool  `json:"pushEnabled,omitempty"`
                EmailEnabled *bool  `json:"emailEnabled,omitempty"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if body.Categorie == "" {
                writeJSONError(w, http.StatusBadRequest, "categorie requis")
                return
        }

        pushEnabled := true
        if body.PushEnabled != nil {
                pushEnabled = *body.PushEnabled
        }
        emailEnabled := false
        if body.EmailEnabled != nil {
                emailEnabled = *body.EmailEnabled
        }

        prefID := uuid.NewString()
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(r.Context(), `
                        INSERT INTO "NotificationPreference" ("id", "userId", "categorie", "pushEnabled", "emailEnabled")
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT ("userId", "categorie")
                        DO UPDATE SET "pushEnabled" = $4, "emailEnabled" = $5, "updatedAt" = CURRENT_TIMESTAMP
                        RETURNING "id"
                `, prefID, claims.UserID, body.Categorie, pushEnabled, emailEnabled).Scan(&prefID)
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "message": "préférence mise à jour",
                "preference": map[string]any{
                        "id":           prefID,
                        "categorie":    body.Categorie,
                        "pushEnabled":  pushEnabled,
                        "emailEnabled": emailEnabled,
                },
        })
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

func mustJSON(v any) json.RawMessage {
        b, _ := json.Marshal(v)
        return b
}

// chi import pour éviter l'erreur "imported and not used" si chi.URLParam
// n'est pas utilisé directement dans ce fichier (les routes sont dans router.go).
var _ = chi.URLParam
