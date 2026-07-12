package http

// b2c_subscription_handlers.go — Souscription B2C auto (enseignant freelance)
//
// Endpoint PUBLIC (pas d'auth) : POST /api/subscriptions/b2c
// Permet à un enseignant de s'inscrire seul à un plan B2C (Prof Solo /
// Prof Premium) sans passer par un admin.
//
// Transaction atomique (SECURITY DEFINER create_b2c_subscription) :
//   1. Crée un Etablissement "personnel" (type PERSONNEL)
//   2. Crée un User ENSEIGNANT rattaché à l'étab
//   3. Crée un Abonnement ACTIF liant l'étab au plan B2C
//
// Sécurité :
//   - Anti-doublon : si l'email existe déjà → 409 ConflictError.
//   - Plan doit être actif ET branche='B2C' (sinon → 400).
//   - Mot de passe hashé bcrypt côté backend avant l'appel SQL.
//   - Aucun secret en clair dans la réponse.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"golang.org/x/crypto/bcrypt"
)

// b2cSubscriptionRequest — body du POST /api/subscriptions/b2c (PUBLIC).
type b2cSubscriptionRequest struct {
	PlanID   string `json:"planId"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Ville    string `json:"ville,omitempty"`
}

// b2cSubscriptionResponse — réponse de succès (201).
type b2cSubscriptionResponse struct {
	User struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
		Role  string `json:"role"`
	} `json:"user"`
	EtablissementID   string  `json:"etablissementId"`
	EtablissementNom  string  `json:"etablissementNom"`
	AbonnementID      string  `json:"abonnementId"`
	AbonnementStatut  string  `json:"abonnementStatut"`
	AbonnementDateFin *string `json:"abonnementDateFin,omitempty"`
	Message           string  `json:"message"`
}

// createB2CSubscription — POST /api/subscriptions/b2c (PUBLIC)
//
// Body : { planId, name, email, password, ville? }
// Réponse : 201 { user, etablissementId, abonnementId, message } ou
// 400 (validation) / 409 (email existe déjà) / 500 (erreur interne).
func (s *Server) createB2CSubscription(w http.ResponseWriter, r *http.Request) {
	var req b2cSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Validation
	req.PlanID = strings.TrimSpace(req.PlanID)
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Password = strings.TrimSpace(req.Password)
	req.Ville = strings.TrimSpace(req.Ville)

	if req.PlanID == "" {
		writeJSONError(w, http.StatusBadRequest, "planId requis")
		return
	}
	if req.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "name requis")
		return
	}
	if !strings.Contains(req.Email, "@") || !strings.Contains(req.Email, ".") {
		writeJSONError(w, http.StatusBadRequest, "email invalide")
		return
	}
	if len(req.Password) < 8 {
		writeJSONError(w, http.StatusBadRequest, "password : minimum 8 caractères")
		return
	}

	// Hasher le mot de passe (bcrypt cost 10, cohérent avec auth.go).
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "hash password failed")
		return
	}

	// Appeler la fonction SECURITY DEFINER create_b2c_subscription.
	// Pas de claims (endpoint public) — on utilise le pool directement
	// (la fonction SECURITY DEFINER bypass la RLS).
	var resp b2cSubscriptionResponse
	var dateFin *string
	err = appdb.WithTx(r.Context(), s.dbPool, appdb.SessionClaims{Role: "ADMIN"}, func(tx pgx.Tx) error {
		row := tx.QueryRow(r.Context(), `
			SELECT o_user_id, o_user_email, o_user_name, o_user_role,
			       o_etablissement_id, o_etablissement_nom,
			       o_abonnement_id, o_abonnement_statut, o_abonnement_date_fin
			FROM create_b2c_subscription($1, $2, $3, $4, $5)
		`, req.PlanID, req.Name, req.Email, string(hash), req.Ville)

		if err := row.Scan(
			&resp.User.ID, &resp.User.Email, &resp.User.Name, &resp.User.Role,
			&resp.EtablissementID, &resp.EtablissementNom,
			&resp.AbonnementID, &resp.AbonnementStatut, &dateFin,
		); err != nil {
			// Détecter les erreurs métier levées par RAISE EXCEPTION
			errMsg := err.Error()
			if strings.Contains(errMsg, "PLAN_NOT_FOUND") {
				return fmt.Errorf("PLAN_NOT_FOUND")
			}
			if strings.Contains(errMsg, "PLAN_NOT_B2C") {
				return fmt.Errorf("PLAN_NOT_B2C")
			}
			if strings.Contains(errMsg, "EMAIL_EXISTS") {
				return fmt.Errorf("EMAIL_EXISTS")
			}
			return fmt.Errorf("create_b2c_subscription: %w", err)
		}
		return nil
	})

	if err != nil {
		errMsg := err.Error()
		switch {
		case errMsg == "PLAN_NOT_FOUND":
			writeJSONError(w, http.StatusBadRequest, "plan introuvable")
		case errMsg == "PLAN_NOT_B2C":
			writeJSONError(w, http.StatusBadRequest, "ce plan n'est pas un plan B2C")
		case errMsg == "EMAIL_EXISTS":
			writeJSONError(w, http.StatusConflict, "un compte existe déjà avec cet email. Connectez-vous ou utilisez 'mot de passe oublié'.")
		default:
			middleware.MapDomainError(w, err)
		}
		return
	}

	if dateFin != nil {
		resp.AbonnementDateFin = dateFin
	}
	resp.Message = "Compte enseignant créé avec succès. Vous pouvez vous connecter."

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}
