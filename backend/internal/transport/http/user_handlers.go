package http

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/usecase"
)

// userHandlers.go — handlers HTTP pour le domaine Users.

// parseBoolQueryParam parse un paramètre booléen (true/false).
func parseBoolQueryParam(s string) *bool {
	if s == "" {
		return nil
	}
	b := s == "true" || s == "1"
	return &b
}

// parseIntQueryParam parse un paramètre entier avec valeur par défaut.
func parseIntQueryParam(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 1 {
		return defaultVal
	}
	return v
}

// listUsers — GET /api/users
// Auth : ADMIN, RESPONSABLE, ENSEIGNANT, ETUDIANT (avec filtres restrictifs)
//
// MESSAGERIE-DM-ETUDIANT : l'étudiant peut appeler cet endpoint pour rechercher
// d'autres étudiants de son établissement (pour les DM). La policy RLS
// User_select (migration 000041) filtre automatiquement : l'étudiant ne voit
// que les étudiants de son étab + ses enseignants. Le usecase List applique
// aussi des filtres selon le rôle (voir UserUseCase.List).
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Vérifier le rôle (tous sauf inconnu)
	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" && role != "ENSEIGNANT" && role != "ETUDIANT" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	params := usecase.ListParams{
		Search:          r.URL.Query().Get("search"),
		Role:            r.URL.Query().Get("role"),
		Actif:           parseBoolQueryParam(r.URL.Query().Get("actif")),
		EtablissementID: r.URL.Query().Get("etablissementId"),
		FiliereID:       r.URL.Query().Get("filiereId"),
		Niveau:          r.URL.Query().Get("niveau"), // ETUDIANTS-FIX-E5
		// SECT-USER-CLEANUP-INFRA-1 : filtre orphelins (users sans établissement).
		// Quand ?orphans=true, le repo filtre (etablissementId IS NULL OR
		// etablissementId=''). Auth ADMIN only (vérifié côté router via RequireRole).
		Orphans: r.URL.Query().Get("orphans") == "true" || r.URL.Query().Get("orphans") == "1",
		Page:    parseIntQueryParam(r.URL.Query().Get("page"), 1),
		Limit:   parseIntQueryParam(r.URL.Query().Get("limit"), 20),
	}

	result, err := s.userUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// getUser — GET /api/users/{id}
// Auth : ADMIN, RESPONSABLE
func (s *Server) getUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	user, err := s.userUC.GetByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"user": user})
}

// createUser — POST /api/users
// Auth : ADMIN (crée RESPONSABLE), RESPONSABLE (crée ENSEIGNANT/ETUDIANT)
// ETUDIANTS-FIX-E3 : si password manquant, génère un mot de passe temporaire
// et le retourne dans la response pour affichage frontend (dialog DirectResult).
func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input domain.CreateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	// Permission check : ADMIN/RESPONSABLE peuvent créer, ou ENSEIGNANT B2C
	// (étab PERSONNEL) qui ne peut créer que des ÉTUDIANTS.
	// SECT-B2C-SELF-SERVICE
	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		if role == "ENSEIGNANT" {
			isB2C, err := s.isB2CSelfService(r.Context(), claims)
			if err != nil || !isB2C || input.Role != "ETUDIANT" {
				writeJSONError(w, http.StatusForbidden, "rôle non autorisé à créer des utilisateurs")
				return
			}
		} else {
			writeJSONError(w, http.StatusForbidden, "rôle non autorisé à créer des utilisateurs")
			return
		}
	}

	user, temporaryPassword, err := s.userUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	resp := map[string]any{"user": user}
	// ETUDIANTS-FIX-E3 : inclure temporaryPassword si un mot de passe a été
	// généré automatiquement (mode "direct" sans password fourni).
	if temporaryPassword != "" {
		resp["temporaryPassword"] = temporaryPassword
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// updateUser — PATCH /api/users/{id}
// Auth : ADMIN, RESPONSABLE
func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		// SECT-B2C-SELF-SERVICE : ENSEIGNANT B2C peut modifier les ETUDIANTS de son étab
		if role == "ENSEIGNANT" {
			isB2C, err := s.isB2CSelfService(r.Context(), claims)
			if err != nil || !isB2C {
				writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
				return
			}
		} else {
			writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
			return
		}
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var input domain.UpdateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	user, err := s.userUC.Update(r.Context(), claims, id, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"user": user})
}

// deleteUser — DELETE /api/users/{id}
// Auth : ADMIN, RESPONSABLE
// ETUDIANTS-FIX-E4 : retourne deletedDependencies (sessions/reponses/soumissions)
// pour que le frontend affiche un toast détaillé.
func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		// SECT-B2C-SELF-SERVICE : ENSEIGNANT B2C peut supprimer les ETUDIANTS de son étab
		if role == "ENSEIGNANT" {
			isB2C, err := s.isB2CSelfService(r.Context(), claims)
			if err != nil || !isB2C {
				writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
				return
			}
		} else {
			writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
			return
		}
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	deps, err := s.userUC.Delete(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message":             "utilisateur supprimé",
		"deletedDependencies": deps,
	})
}

// getUserDependencies — GET /api/users/{id}/dependencies
//
// ETUDIANTS-FIX-E10 : retourne les comptes d'entités liées à un user avant
// suppression (sessions, réponses, soumissions). Permet au frontend d'afficher
// une preview dans l'AlertDialog de suppression (pattern identique à
// /api/filieres/{id}/dependencies, /api/unites-enseignement/{id}/dependencies,
// /api/affectations/{id}/dependencies). canDelete=false si des dépendances
// existent (informatif — la suppression reste autorisée car les tables
// enfants ont ON DELETE CASCADE).
func (s *Server) getUserDependencies(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	// Ownership check : récupère le user + vérifie l'accès
	user, err := s.userUC.GetByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Compter les dépendances (best-effort, RLS off)
	deps := s.userUC.CountUserDependencies(r.Context(), id)
	// ENSEIGNANTS-FIX-EN3 : canDelete basé sur TOUTES les deps (étudiant +
	// enseignant). Si l'user a des épreuves/affectations, canDelete=false.
	canDelete := deps.Sessions == 0 && deps.Reponses == 0 && deps.Soumissions == 0 &&
		deps.Epreuves == 0 && deps.Devoirs == 0 && deps.Affectations == 0 && deps.EnseignantFilieres == 0

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		// Déps étudiant
		"sessions":    deps.Sessions,
		"reponses":    deps.Reponses,
		"soumissions": deps.Soumissions,
		// Déps enseignant (EN3)
		"epreuves":           deps.Epreuves,
		"devoirs":            deps.Devoirs,
		"affectations":       deps.Affectations,
		"enseignantFilieres": deps.EnseignantFilieres,
		// Global
		"canDelete": canDelete,
		"userId":    id,
		"userName":  user.Name,
		"userEmail": user.Email,
		"userRole":  string(user.Role),
	})
}

// importUsers — POST /api/users/import
// Auth : ADMIN, RESPONSABLE
// ETUDIANTS-FIX-E2 : import en masse d'étudiants/enseignants via CSV parsé côté
// frontend. Body : { users: [{name, email}], role, filiereId?, etablissementId? }.
// Pour chaque user : génère un password aléatoire 8 chars, crée le User, collecte
// le password temporaire pour retour au frontend (download CSV mots-de-passe).
// Retourne : { imported, errors: [{row, email, error}], users: [{id, name, email, password, role}] }.
func (s *Server) importUsers(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	var input struct {
		Users []struct {
			Name  string `json:"name"`
			Email string `json:"email"`
		} `json:"users"`
		Role            string  `json:"role"`
		FiliereID       *string `json:"filiereId,omitempty"`
		EtablissementID *string `json:"etablissementId,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if len(input.Users) == 0 {
		writeJSONError(w, http.StatusBadRequest, "users requis (au moins 1)")
		return
	}
	if input.Role == "" {
		writeJSONError(w, http.StatusBadRequest, "role requis")
		return
	}

	type importedUser struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	type importError struct {
		Row   int    `json:"row"`
		Email string `json:"email"`
		Error string `json:"error"`
	}

	imported := 0
	users := []importedUser{}
	errors := []importError{}

	for i, u := range input.Users {
		createInput := domain.CreateUserInput{
			Name:      u.Name,
			Email:     u.Email,
			Role:      domain.Role(input.Role),
			FiliereID: input.FiliereID,
			Actif:     boolPtrTrue(),
		}
		// EtablissementID : RESPONSABLE forcé au sien par le usecase ; ADMIN utilise le body
		if role == "ADMIN" && input.EtablissementID != nil {
			createInput.EtablissementID = input.EtablissementID
		}

		user, tempPwd, err := s.userUC.Create(r.Context(), claims, createInput)
		if err != nil {
			errors = append(errors, importError{
				Row:   i + 1,
				Email: u.Email,
				Error: err.Error(),
			})
			continue
		}
		imported++
		users = append(users, importedUser{
			ID:       user.ID,
			Name:     user.Name,
			Email:    user.Email,
			Password: tempPwd,
			Role:     string(user.Role),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"imported": imported,
		"errors":   errors,
		"users":    users,
	})
}

// boolPtrTrue retourne un pointeur vers true (helper local).
func boolPtrTrue() *bool {
	b := true
	return &b
}

// Valide qu'une string n'est pas vide
func requireNonEmpty(s string) bool {
	return strings.TrimSpace(s) != ""
}

// resetUserPassword — POST /api/users/{id}/reset-password
//
// U5 (CRITICAL) : admin reset le password d'un user.
// - Reset loginAttempts + lockedUntil (déverrouille le compte)
// - Set mustChangePwd=true (force changement au prochain login)
// - Révoque tous les refresh tokens (force re-login)
// - Audit PASSWORD_RESET
//
// Body: {"password": "newPassword"} (min 8 chars). Si password vide, un mot de
// passe temporaire aléatoire est généré (retourné dans la response).
//
// Auth : ADMIN, RESPONSABLE (sur users de son établissement).
func (s *Server) resetUserPassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	// Si password vide, générer un mot de passe temporaire aléatoire (8 chars).
	password := req.Password
	if password == "" {
		var pwdErr error
		password, pwdErr = generateRandomPassword(8)
		if pwdErr != nil {
			writeJSONError(w, http.StatusInternalServerError, "erreur de génération de mot de passe")
			return
		}
	}

	tempPassword, err := s.userUC.ResetPassword(r.Context(), claims, id, password)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"message":            "mot de passe réinitialisé",
		"temporaryPassword":  tempPassword,
		"mustChangePassword": true,
	})
}

// unlockUserAccount — POST /api/users/{id}/unlock
//
// U5 (CRITICAL) : admin déverrouille un compte sans changer le password.
// - Reset loginAttempts + lockedUntil
// - Audit PASSWORD_RESET (method=unlock_only)
//
// Auth : ADMIN, RESPONSABLE (sur users de son établissement).
func (s *Server) unlockUserAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	role := claims.Role
	if role != "ADMIN" && role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	if err := s.userUC.UnlockAccount(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"message": "compte déverrouillé",
	})
}

// generateRandomPassword génère un mot de passe aléatoire alphanumérique (crypto/rand).
// FIX (audit 2025): en cas d'erreur crypto, on retourne une erreur au lieu d'un mot de passe
// déterministe (le fallback précédent charset[i%len(charset)] était prédictible).
func generateRandomPassword(length int) (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
	b := make([]byte, length)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", fmt.Errorf("crypto/rand error: %w", err)
		}
		b[i] = charset[n.Int64()]
	}
	return string(b), nil
}

// ════════════════════════════════════════════════════════════════════════════
// SECT-USER-CLEANUP-INFRA-1 — soft-delete + list orphelins + hard-delete orphelins
// ════════════════════════════════════════════════════════════════════════════

// softDeleteUser — DELETE /api/users/{id}/soft
//
// Marque un user comme soft-deleted (actif=false, deletedAt=NOW()). Le user
// reste en DB pour audit/tracabilité, sera hard-deleted par le CleanupWorker
// après 90 jours (corbeille RGPD).
//
// Auth : ADMIN only (vérifié côté router via RequireRole("ADMIN", "RESPONSABLE")).
// Le usecase fait un checkOwnership + empêche l'auto-soft-delete.
//
// Response : 200 { softDeleted: true, id }
func (s *Server) softDeleteUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	if err := s.userUC.SoftDeleteUser(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"softDeleted": true,
		"id":          id,
	})
}

// listOrphanUsers — GET /api/users/orphans
//
// Liste les users orphelins : actif=false AND (etablissementId IS NULL OR
// etablissementId=”) AND deletedAt IS NULL. Pour l'onglet "Orphelins" côté
// admin. Les users soft-deleted (deletedAt IS NOT NULL) ne sont PAS listés
// ici (ils sont "en corbeille", invisibles).
//
// Auth : ADMIN only (vérifié côté router via RequireRole("ADMIN")).
//
// Response : 200 { users: [...], count: N }
func (s *Server) listOrphanUsers(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	users, err := s.userUC.ListOrphanUsers(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"users": users,
		"count": len(users),
	})
}

// hardDeleteOrphans — POST /api/users/cleanup-orphans
//
// Déclenche manuellement la purge des users soft-deleted plus anciens que 90
// jours. En complément du CleanupWorker automatique (toutes les 24h), l'admin
// peut forcer la purge via cet endpoint.
//
// Auth : ADMIN only (vérifié côté router via RequireRole("ADMIN")).
//
// Response : 200 { deletedCount: N }
func (s *Server) hardDeleteOrphans(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Defense-in-depth : le router vérifie déjà RequireRole("ADMIN"), mais on
	// re-vérifie ici au cas où la route serait enregistrée sans middleware.
	if claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé à purger les orphelins")
		return
	}

	count, err := s.userUC.HardDeleteOrphanUsers(r.Context())
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"deletedCount": count,
	})
}
