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

// notifAdminScanner est satisfait par pgx.Row ET pgx.Rows (même méthode
// Scan) — permet de scanner indifféremment QueryRow et itérations de
// listes (SECT-NOTIF-DIFFUSION-1 : réutilisé par la liste des diffusions
// de l'établissement).
type notifAdminScanner interface{ Scan(dest ...any) error }

func scanNotifAdmin(row notifAdminScanner) (*notifAdminResponse, error) {
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
	// SECT-NOTIF-DIFFUSION-1 : catégories CANONIQUES en minuscules (alignées
	// sur le dispatcher + les préférences NotificationPreference — avant :
	// "SYSTEME" UPPERCASE ne matchait JAMAIS une catégorie de préférence, les
	// utilisateurs ne pouvaient pas filtrer les diffusions).
	if input.Categorie == "" {
		input.Categorie = "systeme"
	}
	input.Categorie = strings.ToLower(input.Categorie)

	// SECT-NOTIF-DIFFUSION-1 : validation de destinataireRole contre l'enum
	// Role. Avant : le frontend envoyait "all" (« Tous les rôles ») → ligne
	// stockée mais invisible pour tout rôle (aucun match) → diffusion fantôme.
	validRoles := map[string]bool{
		"ADMIN": true, "RESPONSABLE": true, "ENSEIGNANT": true, "ETUDIANT": true,
	}
	if input.DestinataireRole != nil && *input.DestinataireRole != "" {
		if !validRoles[*input.DestinataireRole] {
			writeJSONError(w, http.StatusBadRequest, "destinataireRole invalide (ADMIN, RESPONSABLE, ENSEIGNANT, ETUDIANT) — omettez le champ pour diffuser à tous les rôles")
			return
		}
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

	// SECT-NOTIF-SEGMENT-1 + SECT-NOTIF-DIFFUSION-1 : fanout des CANAUX
	// (SSE + push + email + FCM) vers les destinataires de la diffusion.
	// Non-bloquant : si le fanout échoue, la notif reste persistée et visible
	// dans la cloche au prochain polling. Déclenché pour TOUTE diffusion
	// (destinataireId NULL) : segment, rôle (global ou scopé établissement)
	// et broadcast global — avant, seul un segment ≠ ALL déclenchait le
	// fanout : une diffusion par rôle n'avait ni push ni temps réel.
	if s.notifDispatcher != nil && (input.DestinataireID == nil || *input.DestinataireID == "") {
		go s.fanoutSegmentNotification(created)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"notification": created})
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
	role := ""
	if n.DestinataireRole != nil {
		role = *n.DestinataireRole
	}

	// SECT-NOTIF-DIFFUSION-1 : la diffusion RESPONSABLE stocke
	// destinataireRole + destinataireEtablissementId (audience
	// ENSEIGNANTS/ETUDIANTS de SON établissement). Un rôle sans établissement
	// reste une diffusion globale SaaS (admin). Les deux doivent être fanoutés
	// vers les destinataires — avant, seul un segment déclenchait le fanout.
	if role != "" && n.DestinataireEtablissementID != nil && *n.DestinataireEtablissementID != "" {
		query = `SELECT u."id", u."email", u."name"
		         FROM "User" u
		         WHERE u."etablissementId" = $1 AND u."actif" = true AND u."role" = $2`
		args = append(args, *n.DestinataireEtablissementID, role)
	} else if role != "" {
		query = `SELECT u."id", u."email", u."name"
		         FROM "User" u
		         WHERE u."role" = $1 AND u."actif" = true`
		args = append(args, role)
	} else {
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
		case "ALL", "":
			// SECT-NOTIF-DIFFUSION-1 : diffusion globale (aucun segment, aucun rôle)
			// → tous les utilisateurs actifs reçoivent les canaux temps réel/push.
			query = `SELECT u."id", u."email", u."name"
		         FROM "User" u
		         WHERE u."actif" = true`
		default:
			return
		}
	}

	// RLS-ACTUAL-SWITCH-1 : lecture via claims système (User_select is_system,
	// Etablissement_select is_system, Abonnement_select is_admin, Plan_all_admin)
	// — collecte en tx courte puis dispatch hors transaction.
	type segmentRecipient struct{ userID, email, name string }
	var recipients []segmentRecipient
	err := appdb.WithSystemTx(ctx, s.dbPool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var rcpt segmentRecipient
			if err := rows.Scan(&rcpt.userID, &rcpt.email, &rcpt.name); err != nil {
				continue
			}
			recipients = append(recipients, rcpt)
		}
		return rows.Err()
	})
	if err != nil {
		return
	}

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
	for _, rcpt := range recipients {
		userID, name := rcpt.userID, rcpt.name // email non utilisé par le fanout (déduit côté mailer)
		count++

		event := notification.Event{
			UserID:    userID,
			Type:      n.Type,
			Titre:     n.Titre,
			Message:   n.Message,
			Categorie: n.Categorie,
			// SECT-NOTIF-DIFFUSION-1 : casse canonique UPPERCASE conservée —
			// le mapping severity URGENTE→CRITICAL / HAUTE→WARNING de la VIEW
			// unifiée exige "URGENTE"/"HAUTE" (pas "urgente"/"haute").
			Priorite:    n.Priorite,
			ActionURL:   actionURL,
			ActionLabel: actionLabel,
			Icone:       icone,
			ExpiresAt:   expireAt,
			// SECT-NOTIF-DIFFUSION-1 : la ligne de diffusion existe déjà en DB
			// (partagée, visible via la VIEW) — ne PAS re-INSÉRER une copie
			// personnelle par destinataire (doublons dans la cloche).
			SkipInApp: true,
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
		// SECT-NOTIF-DIFFUSION-1 : l'ADMIN ne gère que les DIFFUSIONS
		// (destinataireId NULL) — jamais les notifications personnelles.
		row := tx.QueryRow(r.Context(), fmt.Sprintf(`
                        UPDATE "NotificationAdmin" SET "lu" = $2
                        WHERE "id" = $1 AND "destinataireId" IS NULL
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
	_ = json.NewEncoder(w).Encode(map[string]any{"notification": updated})
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
		// SECT-NOTIF-DIFFUSION-1 : suppression limitée aux diffusions —
		// jamais les notifications personnelles des utilisateurs.
		tag, err := tx.Exec(r.Context(), `DELETE FROM "NotificationAdmin" WHERE "id" = $1 AND "destinataireId" IS NULL`, id)
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
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "notification supprimée"})
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

	// SECT-NOTIF-DIFFUSION-1 (CRITIQUE) : scope aux DIFFUSIONS uniquement
	// (destinataireId IS NULL). Avant : UPDATE sans scope destinataire — le
	// « Tout lire » ADMIN marquait TOUTES les notifications non lues de TOUS
	// les utilisateurs de la plateforme (corruption globale).
	whereClauses = append(whereClauses, fmt.Sprintf(`"lu" = $%d AND "destinataireId" IS NULL`, argIdx))
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
	}

	whereClause := "WHERE " + joinStrings(whereClauses, " AND ")

	updatedCount := 0
	// NOTIF-MARKALL-FIX-1 : le template contenait deja `WHERE` alors que
	// whereClause commence aussi par "WHERE " -> `UPDATE ... WHERE WHERE ...`
	// -> erreur de syntaxe SQL. L'erreur etait avalee (`if err == nil` +
	// `return nil`) -> HTTP 200 avec updatedCount=0 : le bouton « Tout
	// marquer comme lu » ne faisait RIEN silencieusement.
	if err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		tag, err := tx.Exec(r.Context(), fmt.Sprintf(`
                        UPDATE "NotificationAdmin" SET "lu" = true %s
                `, whereClause), args...)
		if err != nil {
			return fmt.Errorf("mark all read admin: %w", err)
		}
		updatedCount = int(tag.RowsAffected())
		return nil
	}); err != nil {
		slog.Error("markAllReadAdmin failed", "error", err, "userId", claims.UserID)
		writeJSONError(w, http.StatusInternalServerError, "erreur base de données")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":      "notifications marquées comme lues",
		"updatedCount": updatedCount,
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
		// SECT-NOTIF-DIFFUSION-1 (CRITIQUE) : suppression limitée aux
		// DIFFUSIONS lues. Avant : DELETE WHERE lu=true sans scope — la corbeille
		// SaaS détruisait l'historique personnel lu de TOUS les utilisateurs
		// (perte de données massive).
		tag, err := tx.Exec(r.Context(), `DELETE FROM "NotificationAdmin" WHERE "lu" = true AND "destinataireId" IS NULL`)
		if err == nil {
			deletedCount = int(tag.RowsAffected())
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
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
