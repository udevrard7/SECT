package http

// b2c_subscription_handlers.go — Souscription B2C auto (enseignant freelance)
//
// Endpoint PUBLIC (pas d'auth) : POST /api/subscriptions/b2c
// Permet à un enseignant de s'inscrire seul à un plan B2C (Prof Solo /
// Prof Premium) sans passer par un admin.
//
// Transaction atomique (appdb.WithTx avec claims ADMIN factice pour bypass RLS) :
//   1. Vérifie le plan (actif + branche='B2C')
//   2. Anti-doublon email
//   3. Crée un Etablissement "personnel" (type PERSONNEL)
//   4. Crée un User ENSEIGNANT rattaché à l'étab
//   5. Crée un Abonnement ACTIF liant l'étab au plan B2C

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
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
	EtablissementID  string  `json:"etablissementId"`
	EtablissementNom string  `json:"etablissementNom"`
	AbonnementID     string  `json:"abonnementId"`
	Message          string  `json:"message"`
}

// createB2CSubscription — POST /api/subscriptions/b2c (PUBLIC)
func (s *Server) createB2CSubscription(w http.ResponseWriter, r *http.Request) {
	slog.Info("createB2CSubscription handler called")

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

	// Hasher le mot de passe (bcrypt cost 10).
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "hash password failed")
		return
	}

	// Transaction atomique avec claims ADMIN (bypass RLS).
	var resp b2cSubscriptionResponse
	err = appdb.WithTx(r.Context(), s.dbPool, appdb.SessionClaims{Role: "ADMIN", UserID: "b2c-system"}, func(tx pgx.Tx) error {
		return createB2CSubscriptionInTx(r.Context(), tx, req, string(hash), &resp)
	})

	if err != nil {
		slog.Error("createB2CSubscription failed", "error", err.Error(), "planId", req.PlanID, "email", req.Email)
		errMsg := err.Error()
		switch {
		case strings.Contains(errMsg, "PLAN_NOT_FOUND"):
			writeJSONError(w, http.StatusBadRequest, "plan introuvable")
		case strings.Contains(errMsg, "PLAN_NOT_B2C"):
			writeJSONError(w, http.StatusBadRequest, "ce plan n'est pas un plan B2C")
		case strings.Contains(errMsg, "EMAIL_EXISTS"):
			writeJSONError(w, http.StatusConflict, "un compte existe déjà avec cet email. Connectez-vous ou utilisez 'mot de passe oublié'.")
		default:
			writeJSONError(w, http.StatusInternalServerError, "erreur interne")
		}
		return
	}

	resp.Message = "Compte enseignant créé avec succès. Vous pouvez vous connecter."
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// createB2CSubscriptionInTx exécute la logique B2C dans une transaction.
// Séparé pour clarté et testabilité.
func createB2CSubscriptionInTx(ctx context.Context, tx pgx.Tx, req b2cSubscriptionRequest, passwordHash string, resp *b2cSubscriptionResponse) error {
	// 1. Vérifier le plan (actif + branche='B2C')
	var branche string
	var actif bool
	var prixMensuel float64
	err := tx.QueryRow(ctx, `
		SELECT "branche", "actif", "prixMensuel"
		FROM "Plan"
		WHERE "id" = $1
	`, req.PlanID).Scan(&branche, &actif, &prixMensuel)
	if err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("PLAN_NOT_FOUND")
		}
		return fmt.Errorf("check plan: %w", err)
	}
	if !actif || branche != "B2C" {
		return fmt.Errorf("PLAN_NOT_B2C")
	}

	// 2. Anti-doublon email
	var existingCount int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE "email" = $1`, req.Email).Scan(&existingCount); err != nil {
		return fmt.Errorf("check email exists: %w", err)
	}
	if existingCount > 0 {
		return fmt.Errorf("EMAIL_EXISTS")
	}

	// 3. Créer l'Etablissement personnel
	etabID := "etab_b2c_" + strings.ReplaceAll(uuid.New().String(), "-", "")
	etabNom := "Espace personnel — " + req.Name
	pays := "Côte d'Ivoire"
	var ville *string
	if req.Ville != "" {
		v := req.Ville
		ville = &v
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "Etablissement" ("id", "nom", "type", "ville", "pays", "actif",
			"certWatermarkEnabled", "certWatermarkOpacity", "createdAt", "updatedAt")
		VALUES ($1, $2, 'PERSONNEL', $3, $4, true, false, 0.1, NOW(), NOW())
	`, etabID, etabNom, ville, pays); err != nil {
		return fmt.Errorf("create etablissement: %w", err)
	}

	// 4. Créer le User ENSEIGNANT
	userID := "usr_b2c_" + strings.ReplaceAll(uuid.New().String(), "-", "")
	if _, err := tx.Exec(ctx, `
		INSERT INTO "User" ("id", "email", "name", "password", "role",
			"etablissementId", "actif", "mustChangePwd", "loginAttempts",
			"createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, 'ENSEIGNANT'::"Role", $5, true, false, 0, NOW(), NOW())
	`, userID, req.Email, req.Name, passwordHash, etabID); err != nil {
		return fmt.Errorf("create user: %w", err)
	}

	// 5. Créer l'Abonnement ACTIF
	aboID := "abo_b2c_" + strings.ReplaceAll(uuid.New().String(), "-", "")
	var dateFin *time.Time
	if prixMensuel > 0 {
		t := time.Now().Add(30 * 24 * time.Hour)
		dateFin = &t
	}
	renouvellement := prixMensuel > 0
	if _, err := tx.Exec(ctx, `
		INSERT INTO "Abonnement" ("id", "etablissementId", "planId", "statut",
			"dateDebut", "dateFin", "periodeEssaiJours", "montantPaye",
			"renouvellementAuto", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, 'ACTIF'::"StatutAbonnement", NOW(), $4, 0, $5, $6, NOW(), NOW())
	`, aboID, etabID, req.PlanID, dateFin, prixMensuel, renouvellement); err != nil {
		return fmt.Errorf("create abonnement: %w", err)
	}

	// 6. Peupler la réponse
	resp.User.ID = userID
	resp.User.Email = req.Email
	resp.User.Name = req.Name
	resp.User.Role = "ENSEIGNANT"
	resp.EtablissementID = etabID
	resp.EtablissementNom = etabNom
	resp.AbonnementID = aboID

	return nil
}
