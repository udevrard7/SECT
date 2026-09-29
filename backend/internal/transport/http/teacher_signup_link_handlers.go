package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// teacher_signup_link_handlers.go — 6 handlers HTTP pour le module
// /api/teacher-signup-links (auth) + /api/teacher-signup (public) —
// SECT-TEACHER-REG-LINK-1 (réplication du pattern student_signup_link_handlers.go).
//
// Endpoints authentifiés (RequireAuth + RequireRole via router.go) :
//   GET    /api/teacher-signup-links          listTeacherSignupLinks
//   POST   /api/teacher-signup-links          createTeacherSignupLink
//   DELETE /api/teacher-signup-links/{id}     revokeTeacherSignupLink
//
// Endpoints PUBLICS (pas de RequireAuth — le token du lien est l'auth) :
//   GET    /api/teacher-signup/verify?token=X verifyTeacherSignupLink
//   POST   /api/teacher-signup                acceptTeacherSignup (rate-limit + Turnstile + audit)

// ============================================================
// ENDPOINTS AUTHENTIFIÉS
// ============================================================

// createTeacherSignupLinkRequest — body du POST /api/teacher-signup-links.
// etablissementId + createdById sont ignorés (toujours forcés = claims côté usecase).
type createTeacherSignupLinkRequest struct {
	MaxUses                *int    `json:"maxUses,omitempty"`
	Label                  *string `json:"label,omitempty"`
	EmailDomainRestriction *string `json:"emailDomainRestriction,omitempty"` // B2B
	CustomWelcomeMessage   *string `json:"customWelcomeMessage,omitempty"`   // message perso welcome email
	ExpiresInHours         *int    `json:"expiresInHours,omitempty"`         // TTL personnalisé (1..8760 h)
	// Champs ignorés (sécurité) :
	EtablissementID string `json:"etablissementId,omitempty"`
	CreatedByID     string `json:"createdById,omitempty"`
}

// createTeacherSignupLink — POST /api/teacher-signup-links
// Auth : ADMIN ou RESPONSABLE (les ENSEIGNANT ne peuvent pas inviter
// d'autres enseignants — cohérent avec POST /api/invitations).
// Génère un token 32 chars hex, expiresAt = now + 30j (personnalisable),
// createdById = claims.UserID, etablissementId = claims.EtablissementID.
// Retourne 201 { id, token, url, expiresAt, maxUses, label, ... }.
func (s *Server) createTeacherSignupLink(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req createTeacherSignupLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	input := domain.CreateTeacherSignupLinkInput{
		MaxUses:                req.MaxUses,
		Label:                  req.Label,
		EmailDomainRestriction: req.EmailDomainRestriction,
		CustomWelcomeMessage:   req.CustomWelcomeMessage,
		ExpiresInHours:         req.ExpiresInHours,
	}

	link, publicURL, err := s.teacherSignupLinkUC.Create(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Sécurité : on ne loggue jamais le token en clair — seulement l'ID du lien.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id":                     link.ID,
		"token":                  link.Token, // retourné une seule fois à la création (pour construire l'URL)
		"url":                    publicURL,
		"expiresAt":              link.ExpiresAt,
		"maxUses":                link.MaxUses,
		"label":                  link.Label,
		"emailDomainRestriction": link.EmailDomainRestriction,
		"customWelcomeMessage":   link.CustomWelcomeMessage,
		"useCount":               link.UseCount,
		"actif":                  link.Actif,
	})
}

// listTeacherSignupLinks — GET /api/teacher-signup-links
// Auth : ADMIN ou RESPONSABLE.
// Retourne 200 { links: [...] } (les liens non supprimés du créateur courant).
//
// Le token + url sont retournés dans la liste pour permettre au créateur de
// copier le lien à nouveau (tant qu'il n'est pas révoqué ou expiré) — même
// contrat que SECT-LINK-COPY-LIST-1 côté étudiant.
func (s *Server) listTeacherSignupLinks(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	links, err := s.teacherSignupLinkUC.ListByCreator(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	type safeLink struct {
		ID                     string  `json:"id"`
		Token                  string  `json:"token"`
		URL                    string  `json:"url"`
		EtablissementID        string  `json:"etablissementId"`
		CreatedByID            string  `json:"createdById"`
		ExpiresAt              string  `json:"expiresAt"`
		MaxUses                *int    `json:"maxUses,omitempty"`
		UseCount               int     `json:"useCount"`
		Actif                  bool    `json:"actif"`
		Label                  *string `json:"label,omitempty"`
		EmailDomainRestriction *string `json:"emailDomainRestriction,omitempty"`
		CustomWelcomeMessage   *string `json:"customWelcomeMessage,omitempty"`
		CreatedAt              string  `json:"createdAt"`
	}
	safe := make([]safeLink, 0, len(links))
	for _, l := range links {
		safe = append(safe, safeLink{
			ID:                     l.ID,
			Token:                  l.Token,
			URL:                    s.teacherSignupLinkUC.PublicURL(l.Token),
			EtablissementID:        l.EtablissementID,
			CreatedByID:            l.CreatedByID,
			ExpiresAt:              l.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
			MaxUses:                l.MaxUses,
			UseCount:               l.UseCount,
			Actif:                  l.Actif,
			Label:                  l.Label,
			EmailDomainRestriction: l.EmailDomainRestriction,
			CustomWelcomeMessage:   l.CustomWelcomeMessage,
			CreatedAt:              l.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"links": safe})
}

// revokeTeacherSignupLink — DELETE /api/teacher-signup-links/{id}
// Auth : ADMIN ou RESPONSABLE.
// Soft-delete : actif=false + deletedAt=now. Idempotent (200 même si déjà révoqué).
// Retourne 200 { revoked: true, id, audited }.
//
// Le handler parse un body JSON optionnel { reason: "..." } pour journaliser
// la raison de la révocation dans AuditLog (même contrat que le flux étudiant
// SECT-ETABLISSEMENT-AUDIT-1). Body vide = raison vide (compat backward).
func (s *Server) revokeTeacherSignupLink(w http.ResponseWriter, r *http.Request) {
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

	// Parse optional body {reason: "..."} — intentionnellement non bloquant.
	var body struct {
		Reason string `json:"reason,omitempty"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body) // intentionally ignore error
	reason := strings.TrimSpace(body.Reason)

	ip := middleware.GetClientIP(r)
	if err := s.teacherSignupLinkUC.Revoke(r.Context(), claims, id, reason, ip); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"revoked": true,
		"id":      id,
		"audited": true, // confirm journalisation AuditLog
	})
}

// teacherSignupLinkStats — GET /api/teacher-signup-links/stats
//
// Auth : ADMIN, RESPONSABLE.
// Retourne des agrégats sur les TeacherSignupLinks (total/active/expired/revoked,
// totalUses, expiringSoon<24h, success/failure TeacherRegistrationEvent, top 5
// liens, créations par jour sur 30 jours, breakdown des échecs par code).
//
// Le scoping est appliqué par la RLS (RESPONSABLE = liens de son étab,
// ADMIN = tous). Cf. usecase.TeacherSignupLinkUseCase.Stats.
func (s *Server) teacherSignupLinkStats(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ADMIN" && claims.Role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}
	stats, err := s.teacherSignupLinkUC.Stats(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
}

// ============================================================
// ENDPOINTS PUBLICS (PAS DE RequireAuth)
// ============================================================

// verifyTeacherSignupLink — GET /api/teacher-signup/verify?token=X (PUBLIC)
//
// Logique :
//  1. Cherche TeacherSignupLink par token (bypass RLS — le token est l'auth).
//  2. Si introuvable → 404 { error, code: "NOT_FOUND" }.
//  3. Si !Actif → 400 { error, code: "INACTIVE" }.
//  4. Si expiresAt < now → 400 { error, code: "EXPIRED" }.
//  5. Si MaxUses && UseCount >= MaxUses → 400 { error, code: "QUOTA_EXCEEDED" }.
//  6. Sinon → 200 { valid, etablissement, creatorName, expiresAt, useCount, maxUses, ... }.
//
// Sécurité : ne jamais retourner createdById brut — seulement creatorName.
func (s *Server) verifyTeacherSignupLink(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		writeSignupStateError(w, http.StatusNotFound, "NOT_FOUND", "Lien d'inscription introuvable")
		return
	}

	link, err := s.teacherSignupLinkUC.Verify(r.Context(), token)
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
	if link.Creator != nil {
		// Sécurité : ne pas retourner createdById brut — seulement le nom.
		resp["creatorName"] = link.Creator.Name
	}
	if link.Label != nil {
		resp["label"] = *link.Label
	}
	// Exposer emailDomainRestriction au frontend pour afficher un hint
	// "Vous devez utiliser un email @univ-ci.edu" dans le formulaire.
	if link.EmailDomainRestriction != nil && *link.EmailDomainRestriction != "" {
		resp["emailDomainRestriction"] = *link.EmailDomainRestriction
	}
	// Exposer customWelcomeMessage pour prévisualisation côté frontend.
	if link.CustomWelcomeMessage != nil && *link.CustomWelcomeMessage != "" {
		resp["customWelcomeMessage"] = *link.CustomWelcomeMessage
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// ──────────────────────────────────────────────────────────────────────────
// Rate-limit par IP (en mémoire, par fenêtre glissante) — clone du
// studentSignupAllow : 10 requêtes / 10 min / IP. Volontairement peu strict
// pour ne pas bloquer un partage WhatsApp en salle des profs (plusieurs
// candidats derrière la même IP NAT). Le check Turnstile + l'atomicité SQL
// (USER_EXISTS, maxUses) sont les vrais garde-fous anti-abus.
// ──────────────────────────────────────────────────────────────────────────

const (
	teacherSignupMaxRequests = 10               // requêtes par fenêtre par IP
	teacherSignupWindow      = 10 * time.Minute // taille de la fenêtre
)

type teacherSignupEntry struct {
	count    int
	windowSt time.Time
}

var (
	teacherSignupMu      sync.Mutex
	teacherSignupBuckets = make(map[string]*teacherSignupEntry)
)

// teacherSignupAllow vérifie si l'IP peut encore appeler l'endpoint. Thread-safe.
func teacherSignupAllow(ip string) bool {
	teacherSignupMu.Lock()
	defer teacherSignupMu.Unlock()
	now := time.Now()
	e, ok := teacherSignupBuckets[ip]
	if !ok || now.Sub(e.windowSt) > teacherSignupWindow {
		teacherSignupBuckets[ip] = &teacherSignupEntry{count: 1, windowSt: now}
		return true
	}
	if e.count >= teacherSignupMaxRequests {
		return false
	}
	e.count++
	return true
}

// acceptTeacherSignupRequest — body du POST /api/teacher-signup (PUBLIC).
type acceptTeacherSignupRequest struct {
	Token            string `json:"token"`
	Email            string `json:"email"`
	Name             string `json:"name"`
	Password         string `json:"password"`
	CfTurnstileToken string `json:"cfTurnstileToken"` // Cloudflare Turnstile
}

// acceptTeacherSignup — POST /api/teacher-signup (PUBLIC)
//
// Body : { token, email, name, password, cfTurnstileToken? }
// Logique :
//  1. Rate-limit check (par IP).
//  2. Turnstile verify (si configuré — fail-closed).
//  3. Appelle usecase.Accept (validation + hash + SQL + audit + email).
//  4. Si OK → 201 { user: {...}, message }.
//  5. Sinon → 400/404/409/429 selon le code métier.
func (s *Server) acceptTeacherSignup(w http.ResponseWriter, r *http.Request) {
	// Rate limit par IP.
	ip := middleware.GetClientIP(r)
	if !teacherSignupAllow(ip) {
		w.Header().Set("Retry-After", "600")
		writeJSONError(w, http.StatusTooManyRequests,
			"Trop de tentatives d'inscription depuis cette adresse. Réessayez dans quelques minutes.")
		return
	}

	var req acceptTeacherSignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Turnstile verify (si configuré). Fail-closed : si Turnstile est activé
	// mais que le token est manquant/invalide, on refuse (400 TURNSTILE_FAILED).
	if s.turnstileVerifier != nil && s.turnstileVerifier.Enabled() {
		ok, verr := s.turnstileVerifier.Verify(r.Context(), strings.TrimSpace(req.CfTurnstileToken), ip)
		if verr != nil {
			writeSignupStateError(w, http.StatusBadRequest, "TURNSTILE_FAILED",
				"Vérification anti-bot indisponible. Réessayez dans un instant.")
			return
		}
		if !ok {
			writeSignupStateError(w, http.StatusBadRequest, "TURNSTILE_FAILED",
				"Vérification anti-bot échouée. Veuillez rafraîchir la page et réessayer.")
			return
		}
	}

	res, err := s.teacherSignupLinkUC.Accept(r.Context(),
		strings.TrimSpace(req.Token),
		strings.TrimSpace(req.Email),
		strings.TrimSpace(req.Name),
		req.Password, // ne pas trim le password (les espaces peuvent être volontaires)
		ip,
		r.UserAgent(),
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
		"role": "ENSEIGNANT",
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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"user":    user,
		"message": res.Message,
	})
}
