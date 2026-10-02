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

	// SECT-NOTIF-DIFFUSION-1 : brancher le hub temps réel. Avant, le hub
	// global n'était JAMAIS branché — Register/Unregister n'avaient aucun
	// appelant et le dispatcher broadcastait dans le vide (canal « temps
	// réel » entièrement mort). Le client SSE reçoit désormais les
	// événements du dispatcher instantanément ; le polling 15s ci-dessous
	// reste en filet de sécurité (proxies, reconnexions).
	userCh := globalNotificationHub.Register(claims.UserID)
	defer globalNotificationHub.Unregister(claims.UserID, userCh)

	// Compteur initial
	count := s.fetchUnreadCountSSE(r, claims)
	initialData, _ := json.Marshal(map[string]any{"unreadCount": count})
	initialEvent, _ := json.Marshal(NotificationEvent{
		Type:      "notification",
		Data:      initialData,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
	_, _ = fmt.Fprintf(w, "data: %s\n\n", initialEvent)
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
		case ev := <-userCh:
			// Événement du dispatcher (notification temps réel) : pousser
			// immédiatement au client, puis resynchroniser le compteur.
			data, _ := json.Marshal(ev)
			_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
			flushIfNeeded()
			newCount := s.fetchUnreadCountSSE(r, claims)
			if newCount != count {
				count = newCount
				cd, _ := json.Marshal(map[string]any{"unreadCount": newCount})
				ce, _ := json.Marshal(NotificationEvent{
					Type:      "notification",
					Data:      cd,
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
				_, _ = fmt.Fprintf(w, "data: %s\n\n", ce)
				flushIfNeeded()
			}
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
				_, _ = fmt.Fprintf(w, "data: %s\n\n", event)
				flushIfNeeded()
			}
		case <-heartbeat.C:
			_, _ = fmt.Fprintf(w, ": heartbeat\n\n")
			flushIfNeeded()
		}
	}
}

// fetchUnreadCountSSE compte les notifications non lues via la VIEW unifiée.
// DEFENSE-IN-DEPTH RBAC : neondb_owner a BYPASSRLS=true, donc on filtre
// explicitement par destinataireId/destinataireRole + scope filière/épreuve.
//
// SECT-NOTIF-DIFFUSION-1 : réutilise notifAdminVisibleConds — avant, le
// compteur n'avait PAS les conditions de segment (une diffusion segmentée
// gonflait la liste unifiée mais jamais le compteur SSE : désynchronisation
// badge/liste). L'expiration (expireLe) est désormais filtrée aussi.
func (s *Server) fetchUnreadCountSSE(r *http.Request, claims appdb.SessionClaims) int {
	count := 0
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		role := claims.Role
		rbacConds, args := notifAdminVisibleConds(claims)

		if role == "RESPONSABLE" && claims.EtablissementID != "" {
			rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Filiere" f WHERE f.id = "NotificationUnified"."filiereId" AND f."etablissementId" = $%d))`, len(args)+1))
			args = append(args, claims.EtablissementID)
			rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f.id = e."filiereId" WHERE e.id = "NotificationUnified"."epreuveId" AND f."etablissementId" = $%d))`, len(args)+1))
			args = append(args, claims.EtablissementID)
		}

		if role == "ENSEIGNANT" {
			rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Epreuve" e WHERE e.id = "NotificationUnified"."epreuveId" AND e."enseignantId" = $%d))`, len(args)+1))
			args = append(args, claims.UserID)
		}

		// ADMIN PaaS : uniquement les alertes système (multi-tenant).
		if role == "ADMIN" {
			rbacConds = append(rbacConds, `("source" = 'alerte' AND "destinataireId" IS NULL AND "filiereId" IS NULL AND "epreuveId" IS NULL)`)
		}

		query := fmt.Sprintf(`
			SELECT count(*) FROM "NotificationUnified"
			WHERE ("lue" = false) AND (%s) AND %s
		`, strings.Join(rbacConds, " OR "), notifNotExpiredCond)

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
		ID                          string  `json:"id"`
		Source                      string  `json:"source"`
		Titre                       string  `json:"titre"`
		Description                 string  `json:"description"`
		Severity                    string  `json:"severity"`
		Type                        string  `json:"type"`
		Lue                         bool    `json:"lue"`
		DestinataireID              *string `json:"destinataireId,omitempty"`
		DestinataireRole            *string `json:"destinataireRole,omitempty"`
		DestinataireSegment         *string `json:"destinataireSegment,omitempty"`
		DestinataireEtablissementID *string `json:"destinataireEtablissementId,omitempty"`
		ActionURL                   *string `json:"actionUrl,omitempty"`
		ActionLabel                 *string `json:"actionLabel,omitempty"`
		Categorie                   *string `json:"categorie,omitempty"`
		FiliereID                   *string `json:"filiereId,omitempty"`
		EpreuveID                   *string `json:"epreuveId,omitempty"`
		ExpireLe                    *string `json:"expireLe,omitempty"`
		CreatedAt                   string  `json:"createdAt"`
	}

	result := []UnifiedNotif{}
	unreadTotal := 0
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
		//
		// SECT-NOTIF-DIFFUSION-1 : conditions NotificationAdmin factorisées dans
		// notifAdminVisibleConds (partagées avec le compteur SSE, GET /me et le
		// mark-all-read personnel). Notamment la garde établissement sur les
		// diffusions par rôle (isolation multi-tenant — avant, une diffusion
		// RESPONSABLE destinataireRole+etab fuyait vers les mêmes rôles des
		// AUTRES établissements).
		role := claims.Role
		rbacConds, args := notifAdminVisibleConds(claims)

		// RESPONSABLE : alertes des filières/épreuves de son établissement
		// (source='alerte' avec filiereId/epreuveId liés à son étab)
		if role == "RESPONSABLE" && claims.EtablissementID != "" {
			rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Filiere" f WHERE f.id = "NotificationUnified"."filiereId" AND f."etablissementId" = $%d))`, len(args)+1))
			args = append(args, claims.EtablissementID)
			rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f.id = e."filiereId" WHERE e.id = "NotificationUnified"."epreuveId" AND f."etablissementId" = $%d))`, len(args)+1))
			args = append(args, claims.EtablissementID)
		}

		// ENSEIGNANT : alertes des épreuves qu'il enseigne
		if role == "ENSEIGNANT" {
			rbacConds = append(rbacConds, fmt.Sprintf(`(EXISTS (SELECT 1 FROM "Epreuve" e WHERE e.id = "NotificationUnified"."epreuveId" AND e."enseignantId" = $%d))`, len(args)+1))
			args = append(args, claims.UserID)
		}

		// ADMIN PaaS : ne voit QUE les alertes système (multi-tenant). Les
		// notifications/diffusions sont déjà couvertes par notifAdminVisibleConds.
		if role == "ADMIN" {
			rbacConds = append(rbacConds, `("source" = 'alerte' AND "destinataireId" IS NULL AND "filiereId" IS NULL AND "epreuveId" IS NULL)`)
		}

		// Clause WHERE : (RBAC) AND (non expirée) AND (filtre lue optionnel).
		// SECT-NOTIF-DIFFUSION-1 (bug #9) : expireLe désormais filtré — une
		// diffusion expirée disparaît de la cloche (avant : jamais purgée).
		whereParts := []string{
			"(" + strings.Join(rbacConds, " OR ") + ")",
			notifNotExpiredCond,
		}
		switch luParam {
		case "false":
			whereParts = append(whereParts, `"lue" = false`)
		case "true":
			whereParts = append(whereParts, `"lue" = true`)
		}
		whereClause := "WHERE " + strings.Join(whereParts, " AND ")

		// SECT-NOTIF-SEGMENT-1 + SECT-NOTIF-DIFFUSION-1 : SELECT inclut
		// destinataireSegment + destinataireEtablissementId + expireLe, et
		// count(*) OVER() expose le total NON LIMITÉ correspondant aux filtres
		// (le badge de la cloche était plafonné à la fenêtre de 20 fetchée —
		// sous-comptage au-delà).
		query := fmt.Sprintf(`
			SELECT "id", "source", "titre", "description", "severity", "type", "lue",
			       "destinataireId", "destinataireRole",
			       "destinataireSegment", "destinataireEtablissementId",
			       "actionUrl", "actionLabel",
			       "categorie", "filiereId", "epreuveId", "expireLe", "createdAt",
			       count(*) OVER() AS "total_count"
			FROM "NotificationUnified"
			%s
			ORDER BY "createdAt" DESC
			LIMIT $%d
		`, whereClause, len(args)+1)
		args = append(args, limit)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			n := UnifiedNotif{}
			var createdAt time.Time
			var expireLe *time.Time
			var totalCount int
			if err := rows.Scan(&n.ID, &n.Source, &n.Titre, &n.Description, &n.Severity, &n.Type, &n.Lue,
				&n.DestinataireID, &n.DestinataireRole,
				&n.DestinataireSegment, &n.DestinataireEtablissementID,
				&n.ActionURL, &n.ActionLabel,
				&n.Categorie, &n.FiliereID, &n.EpreuveID, &expireLe, &createdAt, &totalCount); err != nil {
				return err
			}
			n.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			if expireLe != nil {
				ts := expireLe.UTC().Format(time.RFC3339)
				n.ExpireLe = &ts
			}
			result = append(result, n)
			unreadTotal = totalCount
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"notifications": result,
		"total":         len(result),
		// SECT-NOTIF-DIFFUSION-1 : total réel (hors LIMIT) correspondant aux
		// filtres — badge de cloche exact au-delà de la fenêtre fetchée.
		"totalUnread": unreadTotal,
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
	_ = json.NewEncoder(w).Encode(map[string]any{
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

	// SECT-NOTIF-DIFFUSION-1 : PATCH PARTIEL. Le frontend envoie UN champ à
	// la fois ({categorie, pushEnabled} OU {categorie, emailEnabled}). Avant :
	// le champ absent était écrasé à true → toggler push réactivait email
	// (et réciproquement — le « fix » UI-1 avait remplacé un écrasement à
	// false par un écrasement à true, même bug symétrique). COALESCE préserve
	// la valeur existante ; défauts d'insertion true/true = cohérents avec le
	// dispatcher (fetchPreferences) et l'UI.
	var pushArg, emailArg any
	if body.PushEnabled != nil {
		pushArg = *body.PushEnabled
	}
	if body.EmailEnabled != nil {
		emailArg = *body.EmailEnabled
	}

	prefID := uuid.NewString()
	finalPush, finalEmail := true, true
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
                        INSERT INTO "NotificationPreference" ("id", "userId", "categorie", "pushEnabled", "emailEnabled")
                        VALUES ($1, $2, $3, COALESCE($4, true), COALESCE($5, true))
                        ON CONFLICT ("userId", "categorie")
                        DO UPDATE SET
                            "pushEnabled"  = COALESCE($4, "NotificationPreference"."pushEnabled"),
                            "emailEnabled" = COALESCE($5, "NotificationPreference"."emailEnabled"),
                            "updatedAt"    = CURRENT_TIMESTAMP
                        RETURNING "id", "pushEnabled", "emailEnabled"
                `, prefID, claims.UserID, body.Categorie, pushArg, emailArg).Scan(&prefID, &finalPush, &finalEmail)
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "préférence mise à jour",
		"preference": map[string]any{
			"id":           prefID,
			"categorie":    body.Categorie,
			"pushEnabled":  finalPush,
			"emailEnabled": finalEmail,
		},
	})
}

// chi import pour éviter l'erreur "imported and not used" si chi.URLParam
// n'est pas utilisé directement dans ce fichier (les routes sont dans router.go).
var _ = chi.URLParam
