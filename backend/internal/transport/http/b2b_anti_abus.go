package http

// b2b_anti_abus.go — Endpoints pour l'anti-abus B2B
//
// SECT-B2B-ANTI-ABUS : 3 nouveaux endpoints :
//   GET  /api/b2b/verify-email?token=xxx  — vérification email (clic lien)
//   POST /api/b2b/{id}/validate           — validation admin (ESSAI démarre)
//   GET  /api/b2b/pending                 — liste des établissements en attente

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/mailer"
	"github.com/jackc/pgx/v5"
)

// verifyB2BEmail — GET /api/b2b/verify-email?token=xxx (PUBLIC)
// Solution 1 : vérification email obligatoire. Le responsable clique sur le lien
// dans l'email pour confirmer son adresse.
func (s *Server) verifyB2BEmail(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		writeJSONError(w, http.StatusBadRequest, "token requis")
		return
	}

	var success bool
	var etabID, etabNom, message string
	err := appdb.WithTx(r.Context(), s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			SELECT o_success, o_etablissement_id, o_etablissement_nom, o_message
			FROM verify_b2b_email($1)
		`, token).Scan(&success, &etabID, &etabNom, &message)
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur: "+err.Error())
		return
	}

	if !success {
		writeJSONError(w, http.StatusBadRequest, message)
		return
	}

	slog.Info("B2B email verified", "etabId", etabID, "etabNom", etabNom)

	// TODO : notifier l'admin qu'un nouvel établissement est à valider
	if s.mailer != nil {
		// Email au RESPONSABLE : confirmation
		var respEmail, respName string
		_ = s.dbPool.QueryRow(r.Context(), `
			SELECT "email", "name" FROM "User"
			WHERE "etablissementId" = $1 AND "role" = 'RESPONSABLE' LIMIT 1
		`, etabID).Scan(&respEmail, &respName)

		if respEmail != "" {
			_ = s.mailer.Send(mailer.Email{
				To:      respEmail,
				Subject: "SECT — Email vérifié pour " + etabNom,
				Body:    "Bonjour " + respName + ",\n\nVotre email a été vérifié. Notre équipe va valider votre établissement sous 24h. Vous recevrez un email de confirmation.\n\nL'équipe SECT",
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":         true,
		"etablissementId": etabID,
		"etablissementNom": etabNom,
		"message":         message,
	})
}

// validateB2BEstablishment — POST /api/b2b/{id}/validate (ADMIN only)
// Solution 4 : validation admin avant ESSAI. L'admin approuve l'établissement,
// l'ESSAI de 14 jours démarre.
func (s *Server) validateB2BEstablishment(w http.ResponseWriter, r *http.Request) {
	etabID := chi.URLParam(r, "id")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "id établissement requis")
		return
	}

	var success bool
	var aboID, statut, message string
	var dateFin *string
	err := s.dbPool.QueryRow(r.Context(), `
		SELECT o_success, o_abonnement_id, o_statut, o_date_fin::text, o_message
		FROM validate_b2b_establishment($1)
	`, etabID).Scan(&success, &aboID, &statut, &dateFin, &message)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur: "+err.Error())
		return
	}

	if !success {
		writeJSONError(w, http.StatusConflict, message)
		return
	}

	slog.Info("B2B establishment validated", "etabId", etabID, "aboId", aboID, "statut", statut)

	// Envoyer un email au RESPONSABLE : "Votre établissement est validé, essai démarré"
	if s.mailer != nil {
		var respEmail, respName string
		_ = s.dbPool.QueryRow(r.Context(), `
			SELECT "email", "name" FROM "User"
			WHERE "etablissementId" = $1 AND "role" = 'RESPONSABLE' LIMIT 1
		`, etabID).Scan(&respEmail, &respName)

		if respEmail != "" {
			dfStr := ""
			if dateFin != nil { dfStr = *dateFin }
			_ = s.mailer.Send(mailer.Email{
				To:      respEmail,
				Subject: "SECT — Votre établissement est validé ! Essai de 14 jours démarré",
				Body:    "Bonjour " + respName + ",\n\nVotre établissement a été validé par notre équipe.\nVotre période d'essai de 14 jours a démarré" + strings.TrimSpace(dfStr) + ".\n\nVous pouvez maintenant vous connecter et configurer votre établissement.\n\n" + s.appBaseURL + "/login\n\nL'équipe SECT",
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":      success,
		"abonnementId": aboID,
		"statut":       statut,
		"message":      message,
	})
}

// listPendingB2B — GET /api/b2b/pending (ADMIN only)
// Liste les établissements EN_ATTENTE_VALIDATION (pour le dashboard admin).
func (s *Server) listPendingB2B(w http.ResponseWriter, r *http.Request) {
	rows, err := s.dbPool.Query(r.Context(), `
		SELECT e."id", e."nom", e."type", e."ville", e."pays", e."telephone",
		       e."emailVerified", e."adminValidated", e."createdAt"::text,
		       u."email", u."name",
		       a."id", a."nbrEtudiantsPayes"
		FROM "Etablissement" e
		JOIN "User" u ON u."etablissementId" = e."id" AND u."role" = 'RESPONSABLE'
		JOIN "Abonnement" a ON a."etablissementId" = e."id"
		WHERE a."statut" = 'EN_ATTENTE_VALIDATION'
		  AND a."deletedAt" IS NULL
		ORDER BY e."createdAt" DESC
	`)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur: "+err.Error())
		return
	}
	defer rows.Close()

	type pendingItem struct {
		EtabID          string `json:"etablissementId"`
		EtabNom         string `json:"etablissementNom"`
		EtabType        string `json:"etablissementType"`
		EtabVille       string `json:"ville"`
		EtabPays        string `json:"pays"`
		EtabTel         string `json:"telephone"`
		EmailVerified   bool   `json:"emailVerified"`
		AdminValidated  bool   `json:"adminValidated"`
		CreatedAt       string `json:"createdAt"`
		RespEmail       string `json:"respEmail"`
		RespName        string `json:"respName"`
		AbonnementID    string `json:"abonnementId"`
		NbEtudiants     *int   `json:"nbEtudiants,omitempty"`
	}

	var items []pendingItem
	for rows.Next() {
		var item pendingItem
		if err := rows.Scan(
			&item.EtabID, &item.EtabNom, &item.EtabType, &item.EtabVille, &item.EtabPays, &item.EtabTel,
			&item.EmailVerified, &item.AdminValidated, &item.CreatedAt,
			&item.RespEmail, &item.RespName,
			&item.AbonnementID, &item.NbEtudiants,
		); err != nil {
			continue
		}
		items = append(items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"pending": items,
		"count":   len(items),
	})
}
