package http

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// student_signup_link_handlers.go — 5 handlers HTTP pour le module
// /api/student-signup-links (auth) + /api/student-signup (public) — SECT-REG-LINK-B2C-MVP-1.
//
// Endpoints authentifiés (RequireAuth + RequireRoleOrPersonalEtab via router.go) :
//   GET    /api/student-signup-links          listStudentSignupLinks
//   POST   /api/student-signup-links          createStudentSignupLink
//   DELETE /api/student-signup-links/{id}     revokeStudentSignupLink
//
// Endpoints PUBLICS (pas de RequireAuth — le token du lien est l'auth) :
//   GET    /api/student-signup/verify?token=X verifyStudentSignupLink
//   POST   /api/student-signup                acceptStudentSignup

// ============================================================
// ENDPOINTS AUTHENTIFIÉS
// ============================================================

// createStudentSignupLinkRequest — body du POST /api/student-signup-links.
// etablissementId + createdById sont ignorés (toujours forcés = claims côté usecase).
type createStudentSignupLinkRequest struct {
	FiliereID *string `json:"filiereId,omitempty"`
	Niveau    *string `json:"niveau,omitempty"`
	MaxUses   *int    `json:"maxUses,omitempty"`
	Label     *string `json:"label,omitempty"`
	// Champs ignorés (sécurité) :
	EtablissementID string `json:"etablissementId,omitempty"`
	CreatedByID     string `json:"createdById,omitempty"`
}

// createStudentSignupLink — POST /api/student-signup-links
// Auth : ADMIN, RESPONSABLE, ou ENSEIGNANT dans étab PERSONNEL.
// Génère un token 32 chars hex, expiresAt = now + 30j, createdById = claims.UserID,
// etablissementId = claims.EtablissementID. Si ENSEIGNANT, filiereId est forcé à nil.
// Retourne 201 { id, token, url, expiresAt, maxUses, label }.
func (s *Server) createStudentSignupLink(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req createStudentSignupLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	input := domain.CreateStudentSignupLinkInput{
		FiliereID: req.FiliereID,
		Niveau:    req.Niveau,
		MaxUses:   req.MaxUses,
		Label:     req.Label,
	}

	link, publicURL, err := s.studentSignupLinkUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Sécurité : on ne loggue jamais le token en clair — seulement l'ID du lien.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"id":        link.ID,
		"token":     link.Token, // retourné une seule fois à la création (pour construire l'URL)
		"url":       publicURL,
		"expiresAt": link.ExpiresAt,
		"maxUses":   link.MaxUses,
		"label":     link.Label,
		"useCount":  link.UseCount,
		"actif":     link.Actif,
	})
}

// listStudentSignupLinks — GET /api/student-signup-links
// Auth : ADMIN, RESPONSABLE, ou ENSEIGNANT dans étab PERSONNEL.
// Retourne 200 { links: [...] } (les liens non supprimés du créateur courant).
//
// NB : pour ne pas exposer le token en clair (secret d'authentification),
// les liens sont retournés sans token. Le frontend a déjà l'URL à la création.
// Si l'utilisateur a perdu l'URL, il doit recréer un lien (POST).
func (s *Server) listStudentSignupLinks(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	links, err := s.studentSignupLinkUC.ListByCreator(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Sécurité : NE PAS retourner le token dans la liste. On prépare une vue
	// "sécurisée" sans token (le token est un secret d'authentification).
	type safeLink struct {
		ID              string     `json:"id"`
		EtablissementID string     `json:"etablissementId"`
		FiliereID       *string    `json:"filiereId,omitempty"`
		Niveau          *string    `json:"niveau,omitempty"`
		CreatedByID     string     `json:"createdById"`
		ExpiresAt       string     `json:"expiresAt"`
		MaxUses         *int       `json:"maxUses,omitempty"`
		UseCount        int        `json:"useCount"`
		Actif           bool       `json:"actif"`
		Label           *string    `json:"label,omitempty"`
		CreatedAt       string     `json:"createdAt"`
	}
	safe := make([]safeLink, 0, len(links))
	for _, l := range links {
		safe = append(safe, safeLink{
			ID:              l.ID,
			EtablissementID: l.EtablissementID,
			FiliereID:       l.FiliereID,
			Niveau:          l.Niveau,
			CreatedByID:     l.CreatedByID,
			ExpiresAt:       l.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
			MaxUses:         l.MaxUses,
			UseCount:        l.UseCount,
			Actif:           l.Actif,
			Label:           l.Label,
			CreatedAt:       l.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"links": safe})
}

// revokeStudentSignupLink — DELETE /api/student-signup-links/{id}
// Auth : ADMIN, RESPONSABLE, ou ENSEIGNANT dans étab PERSONNEL.
// Soft-delete : actif=false + deletedAt=now. Idempotent (200 même si déjà révoqué).
// Retourne 200 { revoked: true, id }.
func (s *Server) revokeStudentSignupLink(w http.ResponseWriter, r *http.Request) {
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

	if err := s.studentSignupLinkUC.Revoke(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"revoked": true,
		"id":      id,
	})
}

// ============================================================
// ENDPOINTS PUBLICS (PAS DE RequireAuth)
// ============================================================

// writeSignupStateError écrit une erreur JSON avec un champ `code` métier
// (contrat attendu par le frontend inscription-page.tsx).
//
// Format : { "error": "<message>", "code": "<CODE>" }
// Codes : NOT_FOUND (404), INACTIVE (400), EXPIRED (400),
//         QUOTA_EXCEEDED (400), USER_EXISTS (409).
func writeSignupStateError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// On construit le JSON manuellement pour garantir l'ordre des champs et
	// l'échappement correct (le message peut contenir des accents).
	resp, _ := json.Marshal(map[string]string{"error": message, "code": code})
	_, _ = w.Write(resp)
}

// mapSignupStateError convertit une *domain.SignupLinkStateError en réponse HTTP
// avec le bon status + code métier.
func mapSignupStateError(w http.ResponseWriter, e *domain.SignupLinkStateError) {
	switch e.Code {
	case "NOT_FOUND":
		writeSignupStateError(w, http.StatusNotFound, e.Code, e.Message)
	case "USER_EXISTS":
		// 409 Conflict — un compte existe déjà avec cet email.
		writeSignupStateError(w, http.StatusConflict, e.Code, e.Message)
	case "INACTIVE", "EXPIRED", "QUOTA_EXCEEDED":
		writeSignupStateError(w, http.StatusBadRequest, e.Code, e.Message)
	default:
		writeSignupStateError(w, http.StatusBadRequest, e.Code, e.Message)
	}
}

// verifyStudentSignupLink — GET /api/student-signup/verify?token=X (PUBLIC)
//
// Logique :
//  1. Cherche StudentSignupLink par token (bypass RLS — le token est l'auth).
//  2. Si introuvable → 404 { error, code: "NOT_FOUND" }.
//  3. Si !Actif → 400 { error, code: "INACTIVE" }.
//  4. Si expiresAt < now → 400 { error, code: "EXPIRED" }.
//  5. Si MaxUses && UseCount >= MaxUses → 400 { error, code: "QUOTA_EXCEEDED" }.
//  6. Sinon → 200 { valid: true, etablissement, filiere, creatorName, expiresAt, useCount, maxUses }.
//
// Sécurité : ne jamais retourner createdById brut — seulement creatorName.
func (s *Server) verifyStudentSignupLink(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		writeSignupStateError(w, http.StatusNotFound, "NOT_FOUND", "Lien d'inscription introuvable")
		return
	}

	link, err := s.studentSignupLinkUC.Verify(r.Context(), token)
	if err != nil {
		if stateErr, ok := err.(*domain.SignupLinkStateError); ok {
			mapSignupStateError(w, stateErr)
			return
		}
		middleware.MapDomainError(w, err)
		return
	}

	// Construction de la réponse publique (sans createdById brut).
	resp := map[string]any{
		"valid":     true,
		"expiresAt": link.ExpiresAt,
		"useCount":  link.UseCount,
	}
	if link.MaxUses != nil {
		resp["maxUses"] = *link.MaxUses
	} else {
		resp["maxUses"] = nil
	}
	if link.Etablissement != nil {
		resp["etablissement"] = map[string]any{
			"nom":  link.Etablissement.Nom,
			"type": link.Etablissement.Type,
		}
	}
	if link.Filiere != nil {
		resp["filiere"] = map[string]any{
			"nom":  link.Filiere.Nom,
			"code": link.Filiere.Code,
		}
	}
	if link.Creator != nil {
		// Sécurité : ne pas retourner createdById brut — seulement le nom du créateur.
		resp["creatorName"] = link.Creator.Name
	}
	if link.Niveau != nil {
		resp["niveau"] = *link.Niveau
	}
	if link.Label != nil {
		resp["label"] = *link.Label
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// acceptStudentSignupRequest — body du POST /api/student-signup (PUBLIC).
type acceptStudentSignupRequest struct {
	Token    string `json:"token"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

// acceptStudentSignup — POST /api/student-signup (PUBLIC)
//
// Body : { token, email, name, password }
// Logique :
//  1. Valide name non vide, password ≥ 8 chars, email format valide.
//  2. Hash password (bcrypt cost 10).
//  3. Appelle la fonction SQL accept_student_signup (SECURITY DEFINER) qui crée
//     le User ETUDIANT + incrémente useCount atomiquement.
//  4. Si OK → envoie email de bienvenue StudentWelcome (non bloquant) + retourne
//     201 { user: {...}, message }.
//  5. Sinon → 400/404/409 selon le code métier.
func (s *Server) acceptStudentSignup(w http.ResponseWriter, r *http.Request) {
	var req acceptStudentSignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	res, err := s.studentSignupLinkUC.Accept(r.Context(),
		strings.TrimSpace(req.Token),
		strings.TrimSpace(req.Email),
		strings.TrimSpace(req.Name),
		req.Password, // ne pas trim le password (les espaces peuvent être volontaires)
	)
	if err != nil {
		if stateErr, ok := err.(*domain.SignupLinkStateError); ok {
			mapSignupStateError(w, stateErr)
			return
		}
		middleware.MapDomainError(w, err)
		return
	}

	// Construire la réponse user (sans informations sensibles).
	user := map[string]any{
		"role": "ETUDIANT",
	}
	if res.UserID != nil {
		user["id"] = *res.UserID
	}
	if res.UserName != nil {
		user["name"] = *res.UserName
	}
	if res.UserEmail != nil {
		user["email"] = *res.UserEmail
	}
	if res.UserMatricule != nil {
		user["matricule"] = *res.UserMatricule
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"user":    user,
		"message": res.Message,
	})
}
