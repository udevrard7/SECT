package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/udevrard7/sect/backend/internal/middleware"
)

// debugAuthEcho — endpoint temporaire de diagnostic pour valider le cookie forwarding
// Vercel → Render. À SUPPRIMER après le test.
//
// PUBLIC (pas de RequireAuth) mais le middleware Auth tourne avant et pose les claims
// si un token valide est présent (cookie ou header). Permet de voir exactement ce que
// le backend reçoit selon la configuration du proxy Vercel.
func (s *Server) debugAuthEcho(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"method":    r.Method,
		"path":      r.URL.Path,
	}

	// 1. Cookie access_token
	cookie, cookieErr := r.Cookie("access_token")
	cookieInfo := map[string]interface{}{
		"present": cookieErr == nil && cookie.Value != "",
	}
	if cookieErr == nil && cookie.Value != "" {
		preview := cookie.Value
		if len(preview) > 30 {
			preview = preview[:30] + "..."
		}
		cookieInfo["value_preview"] = preview
		cookieInfo["value_length"] = len(cookie.Value)
	}
	response["cookie"] = cookieInfo

	// 2. Authorization header
	authHeader := r.Header.Get("Authorization")
	headerInfo := map[string]interface{}{
		"present": authHeader != "",
	}
	if authHeader != "" {
		preview := authHeader
		if len(preview) > 40 {
			preview = preview[:40] + "..."
		}
		headerInfo["value_preview"] = preview
		headerInfo["is_bearer"] = strings.HasPrefix(authHeader, "Bearer ")
	}
	response["authorization_header"] = headerInfo

	// 3. Tous les cookies reçus (noms seulement)
	var cookieNames []string
	for _, c := range r.Cookies() {
		cookieNames = append(cookieNames, c.Name)
	}
	response["all_cookies"] = cookieNames

	// 4. Claims posés par le middleware Auth (si token valide)
	claims, hasClaims := middleware.ClaimsFromContext(r.Context())
	claimsInfo := map[string]interface{}{
		"present": hasClaims,
	}
	if hasClaims {
		claimsInfo["user_id"] = claims.UserID
		claimsInfo["role"] = claims.Role
		claimsInfo["etablissement_id"] = claims.EtablissementID
	}
	response["claims"] = claimsInfo

	// 5. IP client réelle + user agent
	response["client_ip"] = middleware.GetClientIP(r)
	response["user_agent"] = r.Header.Get("User-Agent")

	// 6. Headers de proxy (pour diagnostic du forwarding)
	proxyHeaders := map[string]string{}
	for _, h := range []string{"X-Forwarded-For", "X-Real-Ip", "CF-Connecting-IP", "X-Vercel-Id", "X-Forwarded-Proto", "X-Forwarded-Host", "Origin"} {
		if v := r.Header.Get(h); v != "" {
			proxyHeaders[h] = v
		}
	}
	response["proxy_headers"] = proxyHeaders

	// 7. Source d'auth effective (recalculée ici pour diagnostic)
	if cookieErr == nil && cookie.Value != "" {
		response["auth_source"] = "cookie"
	} else if authHeader != "" {
		response["auth_source"] = "header"
	} else {
		response["auth_source"] = "none"
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	json.NewEncoder(w).Encode(response)
}
