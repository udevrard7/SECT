package http

// notification_diffusion_handlers.go — SECT-NOTIF-DIFFUSION-1.
//
// SYSTÈME DE DIFFUSION DU RESPONSABLE — volontairement SÉPARÉ du centre de
// diffusion SaaS de l'ADMIN (/api/notifications/admin) :
//
//   - ADMIN SaaS (POST /admin)          : diffusions de la PLATEFORME
//     (globales, par rôle global, par segment d'abonnement B2B/B2C, ou
//     vers un établissement précis). Portée : toute la plateforme.
//   - RESPONSABLE (POST /diffusion)     : diffusions de SON ÉTABLISSEMENT
//     uniquement — l'établissement est TOUJOURS tiré des claims JWT,
//     JAMAIS du body (un responsable ne peut pas cibler un autre étab).
//     Audiences : TOUS / ENSEIGNANTS / ETUDIANTS de son établissement.
//     ADMIN en mode assistance (claims établissement) agit comme le
//     responsable de l'étab visité.
//
// Représentation en base (NotificationAdmin) :
//   - audience TOUS        → destinataireSegment='ETABLISSEMENT' + etab ;
//   - audience ENSEIGNANTS → destinataireRole='ENSEIGNANT' + etab ;
//   - audience ETUDIANTS   → destinataireRole='ETUDIANT' + etab.
//
// La lecture (cloche / liste unifiée) applique la garde établissement sur
// les diffusions par rôle (notifAdminVisibleConds) — isolation multi-tenant.
//
// Contient aussi alerteCreate (POST /api/alertes) : le bouton « Nouvelle
// alerte » de la page /alertes POSTait sur une route INEXISTANTE (405
// systématique → fallback local fugace) — bug #6.

import (
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
)

// diffusionAudiences — audiences autorisées pour la diffusion responsable.
var diffusionAudiences = map[string]bool{
	"TOUS": true, "ENSEIGNANTS": true, "ETUDIANTS": true,
}

// diffusionEtablissementFromClaims résout l'établissement de diffusion :
// claims.EtablissementID (RESPONSABLE rattaché, ou ADMIN en assistance).
// Un ADMIN SaaS sans établissement n'a rien à faire ici → 400 avec message
// orientant vers le centre de diffusion plateforme.
func diffusionEtablissementFromClaims(w http.ResponseWriter, claims appdb.SessionClaims) (string, bool) {
	if claims.EtablissementID == "" {
		writeJSONError(w, http.StatusBadRequest, "aucun établissement rattaché à votre session — les diffusions d'établissement nécessitent un responsable d'établissement (le centre de diffusion plateforme est réservé à l'ADMIN SaaS)")
		return "", false
	}
	return claims.EtablissementID, true
}

// createDiffusionEtablissement — POST /api/notifications/diffusion
// (RESPONSABLE, ADMIN).
func (s *Server) createDiffusionEtablissement(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	etabID, ok := diffusionEtablissementFromClaims(w, claims)
	if !ok {
		return
	}

	var input struct {
		Titre       string `json:"titre"`
		Message     string `json:"message"`
		Audience    string `json:"audience"`
		Priorite    string `json:"priorite"`
		Categorie   string `json:"categorie"`
		ExpireLe    string `json:"expireLe"`
		ActionURL   string `json:"actionUrl"`
		ActionLabel string `json:"actionLabel"`
		Icone       string `json:"icone"`
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

	// Audience (défaut TOUS).
	if input.Audience == "" {
		input.Audience = "TOUS"
	}
	if !diffusionAudiences[input.Audience] {
		writeJSONError(w, http.StatusBadRequest, "audience invalide (TOUS, ENSEIGNANTS, ETUDIANTS)")
		return
	}

	if input.Priorite == "" {
		input.Priorite = "NORMALE"
	}
	switch input.Priorite {
	case "BASSE", "NORMALE", "HAUTE", "URGENTE":
	default:
		writeJSONError(w, http.StatusBadRequest, "priorité invalide (BASSE, NORMALE, HAUTE, URGENTE)")
		return
	}

	// Catégorie canonique minuscule (alignée dispatcher + préférences).
	if input.Categorie == "" {
		input.Categorie = "general"
	}
	input.Categorie = strings.ToLower(input.Categorie)

	// expireLe (YYYY-MM-DD ou RFC3339) — optionnel.
	var expireLeArg any
	if input.ExpireLe != "" {
		t, err := time.Parse("2006-01-02", input.ExpireLe)
		if err != nil {
			t, err = time.Parse(time.RFC3339, input.ExpireLe)
			if err != nil {
				writeJSONError(w, http.StatusBadRequest, "expireLe invalide (format YYYY-MM-DD ou RFC3339)")
				return
			}
		}
		expireLeArg = t
	}

	// Mapping audience → ciblage en base.
	var destinataireRole, destinataireSegment *string
	switch input.Audience {
	case "ENSEIGNANTS":
		role := "ENSEIGNANT"
		destinataireRole = &role
	case "ETUDIANTS":
		role := "ETUDIANT"
		destinataireRole = &role
	default: // TOUS
		segment := "ETABLISSEMENT"
		destinataireSegment = &segment
	}
	etabPtr := &etabID

	created := &notifAdminResponse{}
	success := false
	var createErr error
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		newID := "notif_" + uuid.NewString()
		row := tx.QueryRow(r.Context(), fmt.Sprintf(`
			INSERT INTO "NotificationAdmin" ("id", "type", "titre", "message",
				"destinataireId", "destinataireRole",
				"destinataireSegment", "destinataireEtablissementId",
				"lu", "actionUrl", "actionLabel",
				"priorite", "categorie", "icone", "expireLe", "createdAt")
			VALUES ($1, 'BROADCAST', $2, $3, NULL, $4, $5, $6, false, $7, $8, $9, $10, $11, $12, now())
			RETURNING %s
		`, notifAdminColumns),
			newID, input.Titre, input.Message,
			destinataireRole, destinataireSegment, etabPtr,
			nilIfEmpty(input.ActionURL), nilIfEmpty(input.ActionLabel),
			input.Priorite, input.Categorie, nilIfEmpty(input.Icone), expireLeArg,
		)
		n, err := scanNotifAdmin(row)
		if err == nil {
			created = n
			success = true
		} else {
			createErr = err
		}
		return nil
	})

	if !success {
		// SECT-NOTIF-DIFFUSION-1 : l'erreur est loggée (avant : avalée → 500
		// opaque impossible à diagnostiquer — c'est comme ça que la violation
		// RLS sur INSERT…RETURNING est restée invisible plusieurs semaines).
		slog.Error("createDiffusionEtablissement: INSERT/RETURNING failed",
			"userId", claims.UserID, "audience", input.Audience, "error", createErr)
		writeJSONError(w, http.StatusInternalServerError, "erreur lors de la création de la diffusion")
		return
	}

	// Fanout des CANAUX (SSE + push + email URGENTE/HAUTE + FCM) vers les
	// destinataires de l'établissement — SANS re-INSERT (SkipInApp dans le
	// fanout : la ligne partagée ci-dessus EST la notification in-app).
	if s.notifDispatcher != nil {
		go s.fanoutSegmentNotification(created)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"notification": created,
		"audience":     input.Audience,
	})
}

// listDiffusionsEtablissement — GET /api/notifications/diffusion
// (RESPONSABLE, ADMIN) : l'historique des diffusions de SON établissement.
func (s *Server) listDiffusionsEtablissement(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	etabID, ok := diffusionEtablissementFromClaims(w, claims)
	if !ok {
		return
	}

	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	result := []*notifAdminResponse{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT %s
			FROM "NotificationAdmin"
			WHERE "destinataireEtablissementId" = $1 AND "destinataireId" IS NULL
			ORDER BY "createdAt" DESC
			LIMIT $2
		`, notifAdminColumns), etabID, limit)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			n, err := scanNotifAdmin(rows)
			if err != nil {
				continue
			}
			result = append(result, n)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"diffusions": result,
		"total":      len(result),
	})
}

// deleteDiffusionEtablissement — DELETE /api/notifications/diffusion/{id}
// (RESPONSABLE, ADMIN) : supprimer UNE diffusion de SON établissement.
func (s *Server) deleteDiffusionEtablissement(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	etabID, ok := diffusionEtablissementFromClaims(w, claims)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	deleted := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// Scope : diffusion de SON établissement uniquement (jamais une
		// notification personnelle, jamais la diffusion d'un autre étab).
		tag, err := tx.Exec(r.Context(), `
			DELETE FROM "NotificationAdmin"
			WHERE "id" = $1 AND "destinataireId" IS NULL AND "destinataireEtablissementId" = $2
		`, id, etabID)
		if err == nil && tag.RowsAffected() > 0 {
			deleted = true
		}
		return nil
	})

	if !deleted {
		writeJSONError(w, http.StatusNotFound, "diffusion non trouvée ou non autorisée")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "diffusion supprimée"})
}

// alerteCreate — POST /api/alertes (RESPONSABLE, ADMIN).
//
// SECT-NOTIF-DIFFUSION-1 (bug #6) : la page /alertes POSTait sur
// /api/alertes alors que la route n'existait pas (405 systématique, toast
// « Impossible de créer l'alerte », fallback stats local fugace).
// RBAC : la filière éventuelle doit appartenir à l'établissement des claims.
func (s *Server) alerteCreate(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input struct {
		Titre       string  `json:"titre"`
		Description string  `json:"description"`
		Severity    string  `json:"severity"`
		Type        string  `json:"type"`
		FiliereID   *string `json:"filiereId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if input.Titre == "" {
		writeJSONError(w, http.StatusBadRequest, "titre requis")
		return
	}
	if input.Description == "" {
		writeJSONError(w, http.StatusBadRequest, "description requise")
		return
	}
	if input.Severity == "" {
		input.Severity = "INFO"
	}
	switch input.Severity {
	case "CRITICAL", "WARNING", "INFO":
	default:
		writeJSONError(w, http.StatusBadRequest, "severity invalide (CRITICAL, WARNING, INFO)")
		return
	}
	if input.Type == "" {
		input.Type = "CUSTOM"
	}
	switch input.Type {
	case "PERFORMANCE", "FRAUDE", "SYSTEME", "RAPPEL", "CUSTOM":
	default:
		writeJSONError(w, http.StatusBadRequest, "type invalide (PERFORMANCE, FRAUDE, SYSTEME, RAPPEL, CUSTOM)")
		return
	}

	// SECT-NOTIF-DIFFUSION-1 : une alerte créée par un RESPONSABLE (ou ADMIN
	// assistance) DOIT cibler une filière de SON établissement — le scope de
	// lecture (alertesListReal) est personnel / filière / épreuve : une alerte
	// sans filière serait créée mais INVISIBLE pour son créateur.
	if claims.EtablissementID != "" && (input.FiliereID == nil || *input.FiliereID == "") {
		writeJSONError(w, http.StatusBadRequest, "filiereId requis : sélectionnez la filière concernée — c'est ce qui rend l'alerte visible dans votre liste")
		return
	}

	// Scope filière : doit appartenir à l'établissement des claims (quand un
	// établissement est rattaché à la session).
	if input.FiliereID != nil && *input.FiliereID != "" && claims.EtablissementID != "" {
		var filiereEtab string
		err := appdb.WithSystemTx(r.Context(), s.dbPool, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(),
				`SELECT "etablissementId" FROM "Filiere" WHERE "id" = $1`, *input.FiliereID).
				Scan(&filiereEtab)
		})
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "filiereId inconnu")
			return
		}
		if filiereEtab != claims.EtablissementID {
			writeJSONError(w, http.StatusForbidden, "filière hors de votre établissement")
			return
		}
	}

	created := map[string]any{}
	success := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		newID := "alert_" + uuid.NewString()
		var filiereArg any
		if input.FiliereID != nil && *input.FiliereID != "" {
			filiereArg = *input.FiliereID
		}
		tag, err := tx.Exec(r.Context(), `
			INSERT INTO "Alerte" ("id", "titre", "description", "severity", "type",
				"lue", "resolu", "filiereId", "epreuveId", "userId", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4::"SeverityAlerte", $5::"TypeAlerte",
				false, false, $6, NULL, NULL, now(), now())
		`, newID, input.Titre, input.Description, input.Severity, input.Type, filiereArg)
		if err == nil && tag.RowsAffected() > 0 {
			success = true
			created = map[string]any{
				"id":          newID,
				"titre":       input.Titre,
				"description": input.Description,
				"severity":    input.Severity,
				"type":        input.Type,
				"filiereId":   input.FiliereID,
				"lue":         false,
				"resolu":      false,
			}
		}
		return nil
	})

	if !success {
		writeJSONError(w, http.StatusInternalServerError, "erreur lors de la création de l'alerte")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"alerte": created})
}

// nilIfEmpty retourne nil pour la chaîne vide (arguments SQL NULLables).
func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
