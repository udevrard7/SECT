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

// notifAdminColumns — colonnes pour SELECT/RETURNING.
const notifAdminColumns = `"id", "type", "titre", "message", "destinataireId", "destinataireRole",
	"lu", "actionUrl", "actionLabel", "priorite", "categorie", "icone",
	"expireLe", "createdAt"`

// notifAdminResponse — structure de réponse commune.
type notifAdminResponse struct {
	ID               string  `json:"id"`
	Type             string  `json:"type"`
	Titre            string  `json:"titre"`
	Message          string  `json:"message"`
	DestinataireID   *string `json:"destinataireId,omitempty"`
	DestinataireRole *string `json:"destinataireRole,omitempty"`
	Lu               bool    `json:"lu"`
	ActionURL        *string `json:"actionUrl,omitempty"`
	ActionLabel      *string `json:"actionLabel,omitempty"`
	Priorite         string  `json:"priorite"`
	Categorie        string  `json:"categorie"`
	Icone            *string `json:"icone,omitempty"`
	ExpireLe         *string `json:"expireLe,omitempty"`
	CreatedAt        string  `json:"createdAt"`
}

func scanNotifAdmin(row pgx.Row) (*notifAdminResponse, error) {
	n := &notifAdminResponse{}
	var createdAt time.Time
	var expireLe *time.Time
	if err := row.Scan(&n.ID, &n.Type, &n.Titre, &n.Message, &n.DestinataireID,
		&n.DestinataireRole, &n.Lu, &n.ActionURL, &n.ActionLabel,
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
func (s *Server) createNotificationAdmin(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input struct {
		Titre            string  `json:"titre"`
		Message          string  `json:"message"`
		Type             string  `json:"type"`
		Priorite         string  `json:"priorite"`
		Categorie        string  `json:"categorie"`
		DestinataireID   *string `json:"destinataireId"`
		DestinataireRole *string `json:"destinataireRole"`
		ActionURL        *string `json:"actionUrl"`
		ActionLabel      *string `json:"actionLabel"`
		Icone            *string `json:"icone"`
		ExpireLe         *string `json:"expireLe"`
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
				"destinataireId", "destinataireRole", "lu", "actionUrl", "actionLabel",
				"priorite", "categorie", "icone", "expireLe", "createdAt")
			VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, $11, $12, now())
			RETURNING %s
		`, notifAdminColumns),
			newID, input.Type, input.Titre, input.Message,
			input.DestinataireID, input.DestinataireRole,
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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"notification": created})
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
