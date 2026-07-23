package http

// notification_mutation_handlers.go — Mutations pour /api/notifications/admin.
//
// NOTIFICATIONS-FIX-N1+N2+N3+N6+N8 : avant, seules les GET étaient déclarées →
// broadcast, marquer lu, supprimer, markAllRead et suppression en masse
// retournaient 404/405. Le module /notifications était entièrement en lecture
// seule (et la lecture elle-même avait des filtres partiels — corrigé dans
// stub_handlers_real.go).
//
// 5 handlers :
// - createNotificationAdmin (POST /admin) : broadcast
// - updateNotificationAdmin (PATCH /admin/{id}) : marquer lu/non lu
// - deleteNotificationAdmin (DELETE /admin/{id}) : supprimer une notif
// - markAllReadAdmin (POST /admin/mark-all-read) : tout marquer lu
// - deleteAllReadAdmin (DELETE /admin?filter=read) : supprimer toutes les lues

import (
        "context"
        "encoding/json"
        "fmt"
        "log/slog"
        "net/http"
        "strings"
        "time"

        "github.com/go-chi/chi/v5"
        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/middleware"
        "github.com/udevrard7/sect/backend/internal/notification"
)

// notifAdminColumns — colonnes pour SELECT/RETURNING.
// SECT-NOTIF-SEGMENT-1 : ajout destinataireSegment + destinataireEtablissementId.
const notifAdminColumns = `"id", "type", "titre", "message", "destinataireId", "destinataireRole",
        "destinataireSegment", "destinataireEtablissementId",
        "lu", "actionUrl", "actionLabel", "priorite", "categorie", "icone",
        "expireLe", "createdAt"`

// notifAdminResponse — structure de réponse commune.
// SECT-NOTIF-SEGMENT-1 : ajout Segment + EtablissementID pour ciblage B2B/B2C.
type notifAdminResponse struct {
        ID                          string  `json:"id"`
        Type                        string  `json:"type"`
        Titre                       string  `json:"titre"`
        Message                     string  `json:"message"`
        DestinataireID              *string `json:"destinataireId,omitempty"`
        DestinataireRole            *string `json:"destinataireRole,omitempty"`
        DestinataireSegment         *string `json:"destinataireSegment,omitempty"`
        DestinataireEtablissementID *string `json:"destinataireEtablissementId,omitempty"`
        Lu                          bool    `json:"lu"`
        ActionURL                   *string `json:"actionUrl,omitempty"`
        ActionLabel                 *string `json:"actionLabel,omitempty"`
        Priorite                    string  `json:"priorite"`
        Categorie                   string  `json:"categorie"`
        Icone                       *string `json:"icone,omitempty"`
        ExpireLe                    *string `json:"expireLe,omitempty"`
        CreatedAt                   string  `json:"createdAt"`
}

func scanNotifAdmin(row pgx.Row) (*notifAdminResponse, error) {
        n := &notifAdminResponse{}
        var createdAt time.Time
        var expireLe *time.Time
        if err := row.Scan(&n.ID, &n.Type, &n.Titre, &n.Message, &n.DestinataireID,
                &n.DestinataireRole, &n.DestinataireSegment, &n.DestinataireEtablissementID,
                &n.Lu, &n.ActionURL, &n.ActionLabel,
                &n.Priorite, &n.Categorie, &n.Icone, &expireLe, &createdAt); err != nil {
                return nil, err
        }
        n.CreatedAt = createdAt.UTC().Format(time.RFC3339)
        if expireLe != nil {
                ts := expireLe.UTC().Format(time.RFC3339)
                n.ExpireLe = &ts
        }
        return n, nil
}

// createNotificationAdmin — POST /api/notifications/admin (broadcast)
// NOTIFICATIONS-FIX-N1 : avant, route POST inexistante → broadcast impossible.
//
// SECT-NOTIF-SEGMENT-1 : ajout du ciblage par segment d'abonnement.
//   - destinataireSegment : 'ALL' | 'B2B_RESPONSABLES' | 'B2C_SOLO' | 'B2C_PREMIUM' | 'B2C_ALL' | 'ETABLISSEMENT'
//   - destinataireEtablissementId : utilisé quand segment = 'ETABLISSEMENT'
//
// Quand un segment est fourni (autre que ALL), on insère la notif avec le segment
// puis on déclenche un fanout dispatcher (push + SSE + email) vers tous les users
// du segment. La notif reste unique en DB (1 ligne) ; le filtrage côté lecture
// (GET /unified) se base sur le segment + sous-requête SQL.
func (s *Server) createNotificationAdmin(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                Titre                       string  `json:"titre"`
                Message                     string  `json:"message"`
                Type                        string  `json:"type"`
                Priorite                    string  `json:"priorite"`
                Categorie                   string  `json:"categorie"`
                DestinataireID              *string `json:"destinataireId"`
                DestinataireRole            *string `json:"destinataireRole"`
                DestinataireSegment         *string `json:"destinataireSegment"`
                DestinataireEtablissementID *string `json:"destinataireEtablissementId"`
                ActionURL                   *string `json:"actionUrl"`
                ActionLabel                 *string `json:"actionLabel"`
                Icone                       *string `json:"icone"`
                ExpireLe                    *string `json:"expireLe"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.Titre == "" {
                writeJSONError(w, http.StatusBadRequest, "titre requis")
                return
        }
        if input.Message == "" {
                writeJSONError(w, http.StatusBadRequest, "message requis")
                return
        }
        if input.Type == "" {
                input.Type = "BROADCAST"
        }
        if input.Priorite == "" {
                input.Priorite = "NORMALE"
        }
        if input.Categorie == "" {
                input.Categorie = "SYSTEME"
        }

        // SECT-NOTIF-SEGMENT-1 : valider le segment si fourni.
        validSegments := map[string]bool{
                "ALL": true, "B2B_RESPONSABLES": true, "B2C_SOLO": true,
                "B2C_PREMIUM": true, "B2C_ALL": true, "ETABLISSEMENT": true,
        }
        if input.DestinataireSegment != nil && *input.DestinataireSegment != "" {
                if !validSegments[*input.DestinataireSegment] {
                        writeJSONError(w, http.StatusBadRequest, "destinataireSegment invalide (ALL, B2B_RESPONSABLES, B2C_SOLO, B2C_PREMIUM, B2C_ALL, ETABLISSEMENT)")
                        return
                }
                // ETABLISSEMENT nécessite destinataireEtablissementId.
                if *input.DestinataireSegment == "ETABLISSEMENT" && (input.DestinataireEtablissementID == nil || *input.DestinataireEtablissementID == "") {
                        writeJSONError(w, http.StatusBadRequest, "destinataireEtablissementId requis quand destinataireSegment = ETABLISSEMENT")
                        return
                }
                // Mutual exclusivity : un segment B2B/B2C ne peut pas cohabiter avec destinataireId/Role.
                if *input.DestinataireSegment != "ALL" {
                        if input.DestinataireID != nil || input.DestinataireRole != nil {
                                writeJSONError(w, http.StatusBadRequest, "destinataireSegment est mutuellement exclusif avec destinataireId/destinataireRole")
                                return
                        }
                }
        }

        // Parser expireLe si fourni (format YYYY-MM-DD ou RFC3339).
        var expireLeArg any
        if input.ExpireLe != nil && *input.ExpireLe != "" {
                t, err := time.Parse("2006-01-02", *input.ExpireLe)
                if err != nil {
                        t, err = time.Parse(time.RFC3339, *input.ExpireLe)
                        if err != nil {
                                writeJSONError(w, http.StatusBadRequest, "expireLe invalide (format YYYY-MM-DD ou RFC3339)")
                                return
                        }
                }
                expireLeArg = t
        }

        created := &notifAdminResponse{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                newID := "notif_" + uuid.NewString()
                row := tx.QueryRow(r.Context(), fmt.Sprintf(`
                        INSERT INTO "NotificationAdmin" ("id", "type", "titre", "message",
                                "destinataireId", "destinataireRole",
                                "destinataireSegment", "destinataireEtablissementId",
                                "lu", "actionUrl", "actionLabel",
                                "priorite", "categorie", "icone", "expireLe", "createdAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, $12, $13, $14, now())
                        RETURNING %s
                `, notifAdminColumns),
                        newID, input.Type, input.Titre, input.Message,
                        input.DestinataireID, input.DestinataireRole,
                        input.DestinataireSegment, input.DestinataireEtablissementID,
                        input.ActionURL, input.ActionLabel,
                        input.Priorite, input.Categorie, input.Icone, expireLeArg,
                )
                n, err := scanNotifAdmin(row)
                if err == nil {
                        created = n
                        success = true
                }
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusInternalServerError, "erreur lors de la création")
                return
        }

        // SECT-NOTIF-SEGMENT-1 : fanout dispatcher vers les destinataires du segment.
        // Non-bloquant : si le dispatcher échoue, la notif est quand même persistée
        // et visible dans la cloche au prochain polling.
        if s.notifDispatcher != nil && input.DestinataireSegment != nil && *input.DestinataireSegment != "" && *input.DestinataireSegment != "ALL" {
                go s.fanoutSegmentNotification(created)
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{"notification": created})
}

// fanoutSegmentNotification récupère les userIDs du segment et déclenche le
// dispatcher (push + SSE + email optionnel) pour chacun. Lancé en goroutine
// pour ne pas bloquer la réponse HTTP.
//
// SECT-NOTIF-SEGMENT-1 : la notif est déjà en DB (1 ligne avec destinataireSegment).
// Ici on ne fait QUE le push temps réel + email — pas de re-INSERT.
func (s *Server) fanoutSegmentNotification(n *notifAdminResponse) {
        if s.notifDispatcher == nil {
                return
        }
        ctx := context.Background()

        // Construire la requête de sélection des userIDs selon le segment.
        // On utilise SystemClaims (bypass RLS) car c'est un service système.
        var query string
        var args []any

        segment := ""
        if n.DestinataireSegment != nil {
                segment = *n.DestinataireSegment
        }

        switch segment {
        case "B2B_RESPONSABLES":
                // Tous les RESPONSABLE rattachés à un établissement B2B (type ≠ PERSONNEL).
                query = `SELECT u."id", u."email", u."name"
                         FROM "User" u
                         JOIN "Etablissement" e ON u."etablissementId" = e."id"
                         WHERE u."role" = 'RESPONSABLE' AND u."actif" = true
                           AND e."type" IS DISTINCT FROM 'PERSONNEL'`
        case "B2C_SOLO":
                // Enseignants B2C (étab PERSONNEL) avec plan GRATUIT.
                query = `SELECT u."id", u."email", u."name"
                         FROM "User" u
                         JOIN "Etablissement" e ON u."etablissementId" = e."id"
                         JOIN "Abonnement" a ON a."etablissementId" = e."id"
                         JOIN "Plan" p ON a."planId" = p."id"
                         WHERE u."role" = 'ENSEIGNANT' AND u."actif" = true
                           AND e."type" = 'PERSONNEL'
                           AND p."type" = 'GRATUIT'
                           AND a."statut" IN ('ACTIF', 'ESSAI')`
        case "B2C_PREMIUM":
                // Enseignants B2C (étab PERSONNEL) avec plan PROFESSIONNEL.
                query = `SELECT u."id", u."email", u."name"
                         FROM "User" u
                         JOIN "Etablissement" e ON u."etablissementId" = e."id"
                         JOIN "Abonnement" a ON a."etablissementId" = e."id"
                         JOIN "Plan" p ON a."planId" = p."id"
                         WHERE u."role" = 'ENSEIGNANT' AND u."actif" = true
                           AND e."type" = 'PERSONNEL'
                           AND p."type" = 'PROFESSIONNEL'
                           AND a."statut" IN ('ACTIF', 'ESSAI')`
        case "B2C_ALL":
                // Tous les enseignants B2C (étab PERSONNEL), tous plans confondus.
                query = `SELECT u."id", u."email", u."name"
                         FROM "User" u
                         JOIN "Etablissement" e ON u."etablissementId" = e."id"
                         WHERE u."role" = 'ENSEIGNANT' AND u."actif" = true
                           AND e."type" = 'PERSONNEL'`
        case "ETABLISSEMENT":
                // Tous les users actifs d'un établissement précis.
                if n.DestinataireEtablissementID == nil || *n.DestinataireEtablissementID == "" {
                        return
                }
                query = `SELECT u."id", u."email", u."name"
                         FROM "User" u
                         WHERE u."etablissementId" = $1 AND u."actif" = true`
                args = append(args, *n.DestinataireEtablissementID)
        default:
                return
        }

        rows, err := s.dbPool.Query(ctx, query, args...)
        if err != nil {
                return
        }
        defer rows.Close()

        var actionURL, actionLabel, icone string
        if n.ActionURL != nil {
                actionURL = *n.ActionURL
        }
        if n.ActionLabel != nil {
                actionLabel = *n.ActionLabel
        }
        if n.Icone != nil {
                icone = *n.Icone
        }

        var expireAt *time.Time
        // On ne rejoue pas l'expiration ici (déjà stockée en DB).

        count := 0
        for rows.Next() {
                var userID, email, name string
                if err := rows.Scan(&userID, &email, &name); err != nil {
                        continue
                }
                count++

                event := notification.Event{
                        UserID:      userID,
                        Type:        n.Type,
                        Titre:       n.Titre,
                        Message:     n.Message,
                        Categorie:   n.Categorie,
                        Priorite:    strings.ToLower(n.Priorite),
                        ActionURL:   actionURL,
                        ActionLabel: actionLabel,
                        Icone:       icone,
                        ExpiresAt:   expireAt,
                }

                // Email optionnel pour les annonces URGENTES/HAUTES.
                if n.Priorite == "URGENTE" || n.Priorite == "HAUTE" {
                        event.Email = &notification.EmailContent{
                                Subject: "SECT — " + n.Titre,
                                Body:    "Bonjour " + name + ",\n\n" + n.Message + "\n\n— L'équipe SECT",
                        }
                }

                // Dispatch non-bloquant (la méthode Dispatch est déjà fire-and-forget).
                s.notifDispatcher.Dispatch(ctx, event)
        }

        // Log pour l'admin (observabilité). Le dispatcher log déjà les erreurs par canal.
        slog.Info("notification segment fanout completed",
                "notificationId", n.ID, "segment", segment, "recipients", count)
}

// updateNotificationAdmin — PATCH /api/notifications/admin/{id}
// NOTIFICATIONS-FIX-N2 : avant, route PATCH inexistante → marquer lu impossible.
func (s *Server) updateNotificationAdmin(w http.ResponseWriter, r *http.Request) {
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
                Action string `json:"action"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        newLuValue := false
        switch input.Action {
        case "marquer_lu":
                newLuValue = true
        case "marquer_non_lu":
                newLuValue = false
        default:
                writeJSONError(w, http.StatusBadRequest, "action doit être 'marquer_lu' ou 'marquer_non_lu'")
                return
        }

        updated := &notifAdminResponse{}
        success := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(r.Context(), fmt.Sprintf(`
                        UPDATE "NotificationAdmin" SET "lu" = $2 WHERE "id" = $1
                        RETURNING %s
                `, notifAdminColumns), id, newLuValue)
                n, err := scanNotifAdmin(row)
                if err == nil {
                        updated = n
                        success = true
                }
                return nil
        })

        if !success {
                writeJSONError(w, http.StatusNotFound, "notification non trouvée ou non autorisée")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"notification": updated})
}

// deleteNotificationAdmin — DELETE /api/notifications/admin/{id}
// NOTIFICATIONS-FIX-N3 : avant, route DELETE inexistante → suppression impossible.
func (s *Server) deleteNotificationAdmin(w http.ResponseWriter, r *http.Request) {
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

        deleted := false
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(r.Context(), `DELETE FROM "NotificationAdmin" WHERE "id" = $1`, id)
                if err == nil && tag.RowsAffected() > 0 {
                        deleted = true
                }
                return nil
        })

        if !deleted {
                writeJSONError(w, http.StatusNotFound, "notification non trouvée ou non autorisée")
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "notification supprimée"})
}

// markAllReadAdmin — POST /api/notifications/admin/mark-all-read
// NOTIFICATIONS-FIX-N6 : avant, markAllRead=true était envoyé au GET qui l'ignorait.
// Nouvel endpoint dédié qui fait un UPDATE en masse.
func (s *Server) markAllReadAdmin(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // Filtres optionnels pour le mark-all-read (type, role, categorie).
        typeF := r.URL.Query().Get("type")
        roleF := r.URL.Query().Get("destinataireRole")
        categorieF := r.URL.Query().Get("categorie")

        var whereClauses []string
        var args []any
        argIdx := 1

        whereClauses = append(whereClauses, fmt.Sprintf(`"lu" = $%d`, argIdx))
        args = append(args, false)
        argIdx++

        if typeF != "" {
                whereClauses = append(whereClauses, fmt.Sprintf(`"type" = $%d`, argIdx))
                args = append(args, typeF)
                argIdx++
        }
        if roleF != "" {
                whereClauses = append(whereClauses, fmt.Sprintf(`"destinataireRole" = $%d`, argIdx))
                args = append(args, roleF)
                argIdx++
        }
        if categorieF != "" {
                whereClauses = append(whereClauses, fmt.Sprintf(`"categorie" = $%d`, argIdx))
                args = append(args, categorieF)
                argIdx++
        }

        whereClause := "WHERE " + joinStrings(whereClauses, " AND ")

        updatedCount := 0
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(r.Context(), fmt.Sprintf(`
                        UPDATE "NotificationAdmin" SET "lu" = true WHERE %s
                `, whereClause), args...)
                if err == nil {
                        updatedCount = int(tag.RowsAffected())
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "message":       "notifications marquées comme lues",
                "updatedCount":  updatedCount,
        })
}

// deleteAllReadAdmin — DELETE /api/notifications/admin?filter=read
// NOTIFICATIONS-FIX-N8 : avant, handleDeleteAllRead faisait N requêtes DELETE
// individuelles. Nouvel endpoint qui supprime en masse en une seule requête.
func (s *Server) deleteAllReadAdmin(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        deletedCount := 0
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(r.Context(), `DELETE FROM "NotificationAdmin" WHERE "lu" = true`)
                if err == nil {
                        deletedCount = int(tag.RowsAffected())
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "message":      "notifications lues supprimées",
                "deletedCount": deletedCount,
        })
}

// joinStrings helper (évite d'importer strings si pas déjà fait dans ce fichier).
func joinStrings(ss []string, sep string) string {
        if len(ss) == 0 {
                return ""
        }
        result := ss[0]
        for _, s := range ss[1:] {
                result += sep + s
        }
        return result
}
