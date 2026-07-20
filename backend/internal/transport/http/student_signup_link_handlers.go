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

// student_signup_link_handlers.go — 6 handlers HTTP pour le module
// /api/student-signup-links (auth) + /api/student-signup (public) +
// /api/turnstile/site-key (public) — SECT-REG-LINK-B2C-MVP-1 + PHASE 2.
//
// Endpoints authentifiés (RequireAuth + RequireRoleOrPersonalEtab via router.go) :
//   GET    /api/student-signup-links          listStudentSignupLinks
//   POST   /api/student-signup-links          createStudentSignupLink
//   DELETE /api/student-signup-links/{id}     revokeStudentSignupLink
//
// Endpoints PUBLICS (pas de RequireAuth — le token du lien est l'auth) :
//   GET    /api/student-signup/verify?token=X verifyStudentSignupLink
//   POST   /api/student-signup                acceptStudentSignup (Phase 2 : rate-limit + Turnstile + audit)
//   GET    /api/turnstile/site-key            getTurnstileSiteKey (Phase 2 — public, retourne site key)

// ============================================================
// ENDPOINTS AUTHENTIFIÉS
// ============================================================

// createStudentSignupLinkRequest — body du POST /api/student-signup-links.
// etablissementId + createdById sont ignorés (toujours forcés = claims côté usecase).
// Phase 2 : ajout emailDomainRestriction (optionnel — B2B only).
// Phase 3 : ajout customWelcomeMessage (optionnel — message perso dans welcome email).
// VALIDITY-1 : ajout expiresInHours (optionnel — TTL personnalisé en heures, 1..8760).
// MATRICULE-1 : ajout requireMatricule (optionnel — B2B only, force l'étudiant à saisir
// un matricule à l'inscription, validé via etab.regexMatricule).
type createStudentSignupLinkRequest struct {
        FiliereID              *string `json:"filiereId,omitempty"`
        Niveau                 *string `json:"niveau,omitempty"`
        MaxUses                *int    `json:"maxUses,omitempty"`
        Label                  *string `json:"label,omitempty"`
        EmailDomainRestriction *string `json:"emailDomainRestriction,omitempty"` // PHASE 2 — B2B
        CustomWelcomeMessage   *string `json:"customWelcomeMessage,omitempty"`   // PHASE 3 — message perso welcome email
        RequireMatricule       *bool   `json:"requireMatricule,omitempty"`       // MATRICULE-1 — B2B, force matricule saisi
        ExpiresInHours         *int    `json:"expiresInHours,omitempty"`         // VALIDITY-1 — TTL personnalisé (1..8760 h)
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
                FiliereID:              req.FiliereID,
                Niveau:                 req.Niveau,
                MaxUses:                req.MaxUses,
                Label:                  req.Label,
                EmailDomainRestriction: req.EmailDomainRestriction,
                CustomWelcomeMessage:   req.CustomWelcomeMessage, // PHASE 3
                RequireMatricule:       req.RequireMatricule,     // MATRICULE-1
                ExpiresInHours:         req.ExpiresInHours,       // VALIDITY-1
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
                "id":                     link.ID,
                "token":                  link.Token, // retourné une seule fois à la création (pour construire l'URL)
                "url":                    publicURL,
                "expiresAt":              link.ExpiresAt,
                "maxUses":                link.MaxUses,
                "label":                  link.Label,
                "emailDomainRestriction": link.EmailDomainRestriction,            // PHASE 2 — peut être nil
                "customWelcomeMessage":   link.CustomWelcomeMessage,             // PHASE 3 — peut être nil
                "requireMatricule":       link.RequireMatricule,                  // MATRICULE-1 — bool
                "useCount":               link.UseCount,
                "actif":                  link.Actif,
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
                ID                     string     `json:"id"`
                EtablissementID        string     `json:"etablissementId"`
                FiliereID              *string    `json:"filiereId,omitempty"`
                Niveau                 *string    `json:"niveau,omitempty"`
                CreatedByID            string     `json:"createdById"`
                ExpiresAt              string     `json:"expiresAt"`
                MaxUses                *int       `json:"maxUses,omitempty"`
                UseCount               int        `json:"useCount"`
                Actif                  bool       `json:"actif"`
                Label                  *string    `json:"label,omitempty"`
                EmailDomainRestriction *string    `json:"emailDomainRestriction,omitempty"` // PHASE 2
                CustomWelcomeMessage   *string    `json:"customWelcomeMessage,omitempty"`   // PHASE 3
                RequireMatricule       bool       `json:"requireMatricule"`                 // MATRICULE-1
                CreatedAt              string     `json:"createdAt"`
        }
        safe := make([]safeLink, 0, len(links))
        for _, l := range links {
                safe = append(safe, safeLink{
                        ID:                     l.ID,
                        EtablissementID:        l.EtablissementID,
                        FiliereID:              l.FiliereID,
                        Niveau:                 l.Niveau,
                        CreatedByID:            l.CreatedByID,
                        ExpiresAt:              l.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
                        MaxUses:                l.MaxUses,
                        UseCount:               l.UseCount,
                        Actif:                  l.Actif,
                        Label:                  l.Label,
                        EmailDomainRestriction: l.EmailDomainRestriction,
                        CustomWelcomeMessage:   l.CustomWelcomeMessage,
                        RequireMatricule:       l.RequireMatricule,
                        CreatedAt:              l.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
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
        case "INACTIVE", "EXPIRED", "QUOTA_EXCEEDED", "DOMAIN_NOT_ALLOWED", "TURNSTILE_FAILED", "MATRICULE_REQUIRED", "MATRICULE_INVALID":
                writeSignupStateError(w, http.StatusBadRequest, e.Code, e.Message)
        default:
                writeSignupStateError(w, http.StatusBadRequest, e.Code, e.Message)
        }
}

// ──────────────────────────────────────────────────────────────────────────
// Phase 2 — Rate-limit par IP (en mémoire, simple, par fenêtre glissante)
// Clone de landingDemoAllow mais adapté pour /api/student-signup :
//   - 10 requêtes / 10 min / IP (vs 40/10min pour landing-demo qui est plus
//     tolérant car le QCM IA coûte moins cher qu'une création de compte).
//   - Le rate-limit est VOLONTAIREMENT peu strict pour ne pas bloquer un
//     partage WhatsApp en amphi (50 étudiants derrière la même IP NAT). Le
//     check Turnstile + l'atomicité SQL (USER_EXISTS, maxUses) sont les vrais
//     garde-fous anti-abus.
// ──────────────────────────────────────────────────────────────────────────

const (
        studentSignupMaxRequests = 10               // requêtes par fenêtre par IP
        studentSignupWindow      = 10 * time.Minute // taille de la fenêtre
)

type studentSignupEntry struct {
        count    int
        windowSt time.Time
}

var (
        studentSignupMu      sync.Mutex
        studentSignupBuckets = make(map[string]*studentSignupEntry)
)

// studentSignupAllow vérifie si l'IP peut encore appeler l'endpoint. Thread-safe.
func studentSignupAllow(ip string) bool {
        studentSignupMu.Lock()
        defer studentSignupMu.Unlock()
        now := time.Now()
        e, ok := studentSignupBuckets[ip]
        if !ok || now.Sub(e.windowSt) > studentSignupWindow {
                studentSignupBuckets[ip] = &studentSignupEntry{count: 1, windowSt: now}
                return true
        }
        if e.count >= studentSignupMaxRequests {
                return false
        }
        e.count++
        return true
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
                etab := map[string]any{
                        "nom":  link.Etablissement.Nom,
                        "type": link.Etablissement.Type,
                }
                // MATRICULE-1 — exposer la config matricule de l'étab au frontend pour
                // qu'il puisse valider l'input étudiant (regex) + afficher un placeholder
                // (example) + helper (format). Uniquement si non-nil ET non-vide.
                if link.Etablissement.MatriculeRegex != nil && *link.Etablissement.MatriculeRegex != "" {
                        etab["matriculeRegex"] = *link.Etablissement.MatriculeRegex
                }
                if link.Etablissement.MatriculeFormat != nil && *link.Etablissement.MatriculeFormat != "" {
                        etab["matriculeFormat"] = *link.Etablissement.MatriculeFormat
                }
                if link.Etablissement.MatriculeExample != nil && *link.Etablissement.MatriculeExample != "" {
                        etab["matriculeExample"] = *link.Etablissement.MatriculeExample
                }
                resp["etablissement"] = etab
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
        // Phase 2 — exposer emailDomainRestriction au frontend pour qu'il puisse
        // afficher un hint "Vous devez utiliser un email @univ-ci.edu" dans le form
        // d'inscription. nil/absent = pas de restriction.
        if link.EmailDomainRestriction != nil && *link.EmailDomainRestriction != "" {
                resp["emailDomainRestriction"] = *link.EmailDomainRestriction
        }
        // Phase 3 — exposer customWelcomeMessage au frontend pour qu'il puisse
        // prévisualiser le message personnalisé avant que l'étudiant ne soumette
        // le form. nil/absent = pas de message (le frontend ne l'affiche pas).
        // NB : ce message sera aussi injecté dans l'email de bienvenue post-accept
        // (côté usecase.sendStudentWelcomeEmail). L'exposer côté verify permet au
        // frontend de l'afficher en preview (optionnel — non bloquant).
        if link.CustomWelcomeMessage != nil && *link.CustomWelcomeMessage != "" {
                resp["customWelcomeMessage"] = *link.CustomWelcomeMessage
        }

        // MATRICULE-1 — exposer requireMatricule au frontend pour qu'il puisse
        // afficher le champ matricule dans le wizard d'inscription. Si false/absent,
        // le frontend ne montre pas le champ (comportement inchangé). Si true, le
        // frontend affiche le champ + valide via etab.matriculeRegex (exposé ci-dessus
        // dans l'objet etablissement).
        if link.RequireMatricule {
                resp["requireMatricule"] = true
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(resp)
}

// studentSignupLinkStats — GET /api/student-signup-links/stats (Phase 3)
//
// Auth : ADMIN, RESPONSABLE, ENSEIGNANT.
// Retourne des agrégats sur les StudentSignupLinks (total/active/expired/revoked,
// totalUses, expiringSoon<24h, success/failure RegistrationEvent, top 5 liens,
// créations par jour sur 30 jours, breakdown des échecs par code).
//
// Le scoping est appliqué par la RLS (ENSEIGNANT = ses liens, RESPONSABLE = liens
// de son étab, ADMIN = tous). Cf. usecase.StudentSignupLinkUseCase.Stats.
//
// Réponse 200 : cf. domain.StudentSignupLinkStats.
// Réponse 401 : pas authentifié.
// Réponse 403 : rôle non autorisé (ETUDIANT).
func (s *Server) studentSignupLinkStats(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        if claims.Role != "ADMIN" && claims.Role != "RESPONSABLE" && claims.Role != "ENSEIGNANT" {
                writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
                return
        }
        stats, err := s.studentSignupLinkUC.Stats(r.Context(), claims)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(stats)
}

// acceptStudentSignupRequest — body du POST /api/student-signup (PUBLIC).
// Phase 2 : ajout cfTurnstileToken (optionnel — requis si Turnstile configuré).
// MATRICULE-1 : ajout matricule (optionnel — requis si link.requireMatricule=true,
// validé via etab.regexMatricule côté SQL).
type acceptStudentSignupRequest struct {
        Token            string `json:"token"`
        Email            string `json:"email"`
        Name             string `json:"name"`
        Password         string `json:"password"`
        Matricule        string `json:"matricule,omitempty"`        // MATRICULE-1 — matricule saisi (B2B)
        CfTurnstileToken string `json:"cfTurnstileToken"` // PHASE 2 — token Cloudflare Turnstile
}

// acceptStudentSignup — POST /api/student-signup (PUBLIC)
//
// Body : { token, email, name, password, matricule?, cfTurnstileToken? }
// Phase 2 :
//   - Rate-limit par IP (10 req / 10 min / IP — clone de landingDemoAllow).
//   - Vérification Cloudflare Turnstile (si configuré).
//   - Audit RegistrationEvent (via usecase.logAudit).
// Logique :
//  1. Rate-limit check (par IP).
//  2. Turnstile verify (si configuré).
//  3. Appelle usecase.Accept (qui gère validation + hash + SQL + audit + email).
//  4. Si OK → 201 { user: {...}, message }.
//  5. Sinon → 400/404/409/429 selon le code métier.
func (s *Server) acceptStudentSignup(w http.ResponseWriter, r *http.Request) {
        // Phase 2 — rate limit par IP (clone landingDemoAllow).
        ip := middleware.GetClientIP(r)
        if !studentSignupAllow(ip) {
                w.Header().Set("Retry-After", "600")
                writeJSONError(w, http.StatusTooManyRequests,
                        "Trop de tentatives d'inscription depuis cette adresse. Réessayez dans quelques minutes.")
                return
        }

        var req acceptStudentSignupRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
                return
        }

        // Phase 2 — Turnstile verify (si configuré). Fail-closed : si Turnstile est
        // activé (secret configuré) mais que le token est manquant/invalide, on
        // refuse l'inscription (400 TURNSTILE_FAILED).
        if s.turnstileVerifier != nil && s.turnstileVerifier.Enabled() {
                ok, verr := s.turnstileVerifier.Verify(r.Context(), strings.TrimSpace(req.CfTurnstileToken), ip)
                if verr != nil {
                        // Erreur réseau / Cloudflare indisponible — fail-closed (sécurité prioritaire).
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

        res, err := s.studentSignupLinkUC.Accept(r.Context(),
                strings.TrimSpace(req.Token),
                strings.TrimSpace(req.Email),
                strings.TrimSpace(req.Name),
                req.Password, // ne pas trim le password (les espaces peuvent être volontaires)
                req.Matricule, // ne pas trim ici — le usecase+SQL trim/trient eux-mêmes
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
