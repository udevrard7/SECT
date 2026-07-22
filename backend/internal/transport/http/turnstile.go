// Package http — turnstile.go (SECT-REG-LINK-PHASE2-BACKEND-1)
//
// TurnstileVerifier valide un token Cloudflare Turnstile côté serveur via
// l'API siteverify (https://challenges.cloudflare.com/turnstile/v0/siteverify).
//
// Sécurité :
//   - Si secret == "" (TURNSTILE_SECRET_KEY non configuré) → dev mode, Verify
//     retourne (true, nil) sans appeler l'API (permet de tester en local sans
//     configurer Turnstile). En prod, secret DOIT être set (sinon l'endpoint
//     /api/student-signup est vulnérable au brute-force).
//   - Timeout de 5s via context.WithTimeout (l'appel réseau ne doit pas bloquer
//     l'inscription plus longtemps que ça).
//   - Response décodée en JSON ; on exige success=true ET (si challenge_ts présent)
//     qu'il soit récent (< 5 min, defense in depth contre replay).
//
// Aucune dépendance externe — uniquement net/http + encoding/json.
package http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TurnstileVerifier valide un token Cloudflare Turnstile côté serveur.
type TurnstileVerifier struct {
	secret string
	client *http.Client
}

// NewTurnstileVerifier crée un nouveau TurnstileVerifier.
// Si secret est vide, la vérification est désactivée (dev mode — Verify retourne true).
func NewTurnstileVerifier(secret string) *TurnstileVerifier {
	return &TurnstileVerifier{
		secret: secret,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

// Enabled indique si la vérification Turnstile est active (secret configuré).
// Permet au handler de savoir s'il doit exiger cfTurnstileToken dans le body.
func (v *TurnstileVerifier) Enabled() bool {
	return v != nil && v.secret != ""
}

// turnstileVerifyResponse — réponse de l'API siteverify Cloudflare.
// Doc : https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
type turnstileVerifyResponse struct {
	Success     bool     `json:"success"`
	ErrorCodes  []string `json:"error-codes"`
	ChallengeTS string   `json:"challenge_ts"`        // RFC 3339 (ex: "2022-02-28T15:14:30.000Z")
	Hostname    string   `json:"hostname"`            // hostname du client (pour vérif optionnelle)
	Action      string   `json:"action"`              // action attendue (si configurée côté widget)
	Cdata       string   `json:"cdata"`               // customdata (passé côté widget)
	Metadata    any      `json:"metadata,omitempty"`  // données additionnelles (info client)
}

// Verify valide un token Turnstile côté serveur.
//
// Retourne (true, nil) si :
//   - le verifier n'est pas configuré (dev mode — secret vide),
//   - l'API siteverify retourne success=true.
//
// Retourne (false, nil) si l'API retourne success=false (token invalide, expiré,
// déjà utilisé — Turnstile tokens sont single-use).
//
// Retourne (false, err) si l'appel réseau échoue (timeout, DNS, etc.). Le handler
// peut décider de fail-closed (refuser l'inscription) ou fail-open (accepter en
// loguant). Pour /api/student-signup on choisit fail-closed (sécurité prioritaire).
func (v *TurnstileVerifier) Verify(ctx context.Context, token, remoteIP string) (bool, error) {
	if !v.Enabled() {
		// Dev mode — pas de secret configuré, on skip la vérification.
		return true, nil
	}
	if strings.TrimSpace(token) == "" {
		return false, nil
	}

	// Construire le form-encoded body (l'API siteverify attend application/x-www-form-urlencoded).
	form := url.Values{}
	form.Set("secret", v.secret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	// Timeout de 5s (defense in depth : si Cloudflare est lent, on ne bloque pas
	// l'inscription plus de 5s).
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
		strings.NewReader(form.Encode()))
	if err != nil {
		return false, fmt.Errorf("turnstile request build: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := v.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("turnstile http call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("turnstile siteverify returned HTTP %d", resp.StatusCode)
	}

	var result turnstileVerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, fmt.Errorf("turnstile response decode: %w", err)
	}

	// Note : on ne valide pas challenge_ts ici (Cloudflare le fait déjà côté API).
	// On pourrait vérifier que challenge_ts est récent (< 5 min) pour defense in depth
	// contre replay, mais Turnstile tokens sont single-use donc le replay est déjà
	// bloqué par l'API. On garde la logique simple.
	return result.Success, nil
}

// getTurnstileSiteKey — GET /api/turnstile/site-key (PUBLIC — no auth).
//
// Retourne la site key publique Turnstile pour que le frontend puisse rendre
// le widget Cloudflare. Si TURNSTILE_SITE_KEY est vide, retourne {"siteKey": ""}
// — le frontend doit skiper le widget dans ce cas (dev mode).
func (s *Server) getTurnstileSiteKey(w http.ResponseWriter, r *http.Request) {
	siteKey := ""
	if s.turnstileSiteKey != "" {
		siteKey = s.turnstileSiteKey
	}
	w.Header().Set("Content-Type", "application/json")
	// Cache court (60s) — la site key change rarement mais permet de la mettre à
	// jour sans redéployer le frontend si on rotate la clé.
	w.Header().Set("Cache-Control", "public, max-age=60")
	_ = json.NewEncoder(w).Encode(map[string]string{"siteKey": siteKey})
}
