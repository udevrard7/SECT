package http

import (
        "encoding/json"
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
// Auth : ADMIN, RESPONSABLE, ENSEIGNANT
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // Vérifier le rôle (ADMIN, RESPONSABLE, ENSEIGNANT)
        role := claims.Role
        if role != "ADMIN" && role != "RESPONSABLE" && role != "ENSEIGNANT" {
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
                Page:            parseIntQueryParam(r.URL.Query().Get("page"), 1),
                Limit:           parseIntQueryParam(r.URL.Query().Get("limit"), 20),
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

        // ADMIN ou RESPONSABLE seulement
        role := claims.Role
        if role != "ADMIN" && role != "RESPONSABLE" {
                writeJSONError(w, http.StatusForbidden, "rôle non autorisé à créer des utilisateurs")
                return
        }

        var input domain.CreateUserInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
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
                writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
                return
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
                writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
                return
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
                Users          []struct {
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
