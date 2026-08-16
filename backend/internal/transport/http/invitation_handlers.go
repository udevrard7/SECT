package http

import (
        "encoding/json"
        "net/http"
        "strings"

        "github.com/go-chi/chi/v5"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// invitation_handlers.go — 6 handlers HTTP pour le module /api/invitations
// (E1-INVITATIONS).
//
// Endpoints authentifiés (RequireAuth + RequireRole RESPONSABLE/ADMIN via
// router.go) :
//   GET    /api/invitations                 listInvitations
//   POST   /api/invitations                 createInvitation
//   PATCH  /api/invitations/{id}/renvoyer   resendInvitation
//   DELETE /api/invitations/{id}            cancelInvitation
//
// Endpoints PUBLICS (pas de RequireAuth — le token d'invitation est l'auth) :
//   GET    /api/invitations/verify?token=X  verifyInvitation
//   POST   /api/invitations/accept          acceptInvitation

// ============================================================
// ENDPOINTS AUTHENTIFIÉS
// ============================================================

// listInvitations — GET /api/invitations
// Query params : createdById, used (bool), role, limit (default 50).
// Auth : RESPONSABLE, ADMIN, ENSEIGNANT (RequireRole appliqué au niveau router
// via r.With(middleware.RequireRole(...))).
//
// Le frontend etudiants-page.tsx / enseignants-page.tsx filtre par rôle côté
// client (`invitations.filter(inv => inv.role === 'ETUDIANT')`) — on retourne
// donc toutes les invitations visibles (RLS gère le scoping creator OR
// responsable same-etab OR admin) sans filtrer par rôle côté API.
func (s *Server) listInvitations(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        params := domain.InvitationListParams{
                CreatedByID: r.URL.Query().Get("createdById"),
                Role:        r.URL.Query().Get("role"),
                Used:        parseBoolQueryParam(r.URL.Query().Get("used")),
                Limit:       parseIntQueryParam(r.URL.Query().Get("limit"), 50),
        }

        invitations, err := s.invitationUC.List(r.Context(), claims, params)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{"invitations": invitations})
}

// createInvitationRequest — body du POST /api/invitations.
// createdById est ignoré (toujours = claims.UserID côté usecase).
type createInvitationRequest struct {
        Email           string  `json:"email"`
        Role            string  `json:"role"`
        Name            *string `json:"name,omitempty"`
        FiliereID       *string `json:"filiereId,omitempty"`
        EtablissementID *string `json:"etablissementId,omitempty"`
        CreatedByID     string  `json:"createdById,omitempty"` // ignoré (sécurité)
}

// createInvitation — POST /api/invitations
// Auth : RESPONSABLE, ADMIN.
// Génère un token 32 chars hex, expiresAt = now + 7j, createdById = claims.UserID.
// Retourne 201 { token, invitation }.
func (s *Server) createInvitation(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var req createInvitationRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
                return
        }

        input := domain.CreateInvitationInput{
                Email:           req.Email,
                Role:            domain.Role(req.Role),
                Name:            req.Name,
                FiliereID:       req.FiliereID,
                EtablissementID: req.EtablissementID,
        }

        invitation, err := s.invitationUC.Create(r.Context(), claims, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        _ = json.NewEncoder(w).Encode(map[string]any{
                "token":       invitation.Token,
                "invitation": invitation,
        })
}

// resendInvitation — PATCH /api/invitations/{id}/renvoyer
// Auth : RESPONSABLE, ADMIN.
// Régénère un nouveau token (32 chars), reset expiresAt = now + 7j,
// used=false, usedAt=NULL.
// Retourne 200 { token, invitation }.
func (s *Server) resendInvitation(w http.ResponseWriter, r *http.Request) {
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

        invitation, token, err := s.invitationUC.Resend(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
                "token":       token,
                "invitation": invitation,
        })
}

// cancelInvitation — DELETE /api/invitations/{id}
// Auth : RESPONSABLE, ADMIN.
// Hard delete. Retourne 200 { deleted: true, id } ou 404 si introuvable.
func (s *Server) cancelInvitation(w http.ResponseWriter, r *http.Request) {
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

        if err := s.invitationUC.Cancel(r.Context(), claims, id); err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
                "deleted": true,
                "id":      id,
        })
}

// ============================================================
// ENDPOINTS PUBLICS (PAS DE RequireAuth)
// ============================================================

// writeInvitationStateError écrit une erreur JSON avec un champ `code` métier
// (contrat attendu par le frontend accept-invitation-page.tsx).
//
// Format : { "error": "<message>", "code": "<CODE>" }
// Codes : NOT_FOUND (404), ALREADY_USED (400), EXPIRED (400), USER_EXISTS (400).
func writeInvitationStateError(w http.ResponseWriter, e *domain.InvitationStateError) {
        status := http.StatusBadRequest
        if e.Code == "NOT_FOUND" {
                status = http.StatusNotFound
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(status)
        // On construit le JSON manuellement pour garantir l'ordre des champs et
        // l'échappement correct (le message peut contenir des accents).
        resp, _ := json.Marshal(map[string]string{"error": e.Message, "code": e.Code})
        _, _ = w.Write(resp)
}

// verifyInvitation — GET /api/invitations/verify?token=X (PUBLIC)
//
// Logique :
//  1. Cherche Invitation par token (bypass RLS — le token est l'auth).
//  2. Si introuvable → 404 { error, code: "NOT_FOUND" }.
//  3. Si used=true → 400 { error, code: "ALREADY_USED" }.
//  4. Si expiresAt < now → 400 { error, code: "EXPIRED" }.
//  5. Si un User avec cet email existe déjà → 400 { error, code: "USER_EXISTS" }.
//  6. Sinon → 200 { invitation: { id, email, role, name, etablissement, filiere, createdBy, expiresAt, createdAt } }.
func (s *Server) verifyInvitation(w http.ResponseWriter, r *http.Request) {
        token := strings.TrimSpace(r.URL.Query().Get("token"))
        if token == "" {
                writeInvitationStateError(w, &domain.InvitationStateError{Code: "NOT_FOUND", Message: "Invitation introuvable"})
                return
        }

        invitation, err := s.invitationUC.Verify(r.Context(), token)
        if err != nil {
                if stateErr, ok := err.(*domain.InvitationStateError); ok {
                        writeInvitationStateError(w, stateErr)
                        return
                }
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
                "invitation": invitation,
        })
}

// acceptInvitationRequest — body du POST /api/invitations/accept (PUBLIC).
type acceptInvitationRequest struct {
        Token    string `json:"token"`
        Password string `json:"password"`
        Name     string `json:"name"`
}

// acceptInvitation — POST /api/invitations/accept (PUBLIC)
//
// Body : { token, password, name }
// Logique :
//  1. Cherche Invitation par token (bypass RLS).
//  2. Si introuvable/used/expirée → 400 avec code approprié.
//  3. Valide password (min 8 chars).
//  4. Hash avec bcrypt cost 10.
//  5. Crée User (id uuid, name, email=invitation.email, role=invitation.role,
//     etablissementId, filiereId, actif=true, mustChangePwd=false, matricule
//     généré si ETUDIANT).
//  6. Marque Invitation used=true, usedAt=now.
//  7. Retourne 201 { user: { id, name, email, role }, message: "Compte créé" }.
func (s *Server) acceptInvitation(w http.ResponseWriter, r *http.Request) {
        var req acceptInvitationRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
                return
        }

        input := domain.AcceptInvitationInput{
                Token:    strings.TrimSpace(req.Token),
                Password: req.Password,
                Name:     strings.TrimSpace(req.Name),
        }

        user, err := s.invitationUC.Accept(r.Context(), input)
        if err != nil {
                if stateErr, ok := err.(*domain.InvitationStateError); ok {
                        writeInvitationStateError(w, stateErr)
                        return
                }
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        _ = json.NewEncoder(w).Encode(map[string]any{
                "user": map[string]any{
                        "id":    user.ID,
                        "name":  user.Name,
                        "email": user.Email,
                        "role":  user.Role,
                },
                "message": "Compte créé",
        })
}
