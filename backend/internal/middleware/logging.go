// Package middleware — middlewares HTTP du backend SECT.
package middleware

import (
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"
)

// statusRecorder capture le status code pour le logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// GetClientIP extrait l'IP RÉELLE du client depuis les headers de proxy.
//
// Ordre de priorité (sécurisé contre l'usurpation):
//  1. CF-Connecting-IP (Cloudflare — non usurpable, écrasé par CF)
//  2. X-Forwarded-For (Vercel injecte toujours ce header)
//  3. X-Real-IP (standard pour certains proxies)
//  4. RemoteAddr (fallback — IP de la connexion directe)
//
// Note sécurité: CF-Connecting-IP est vérifié EN PREMIER car Cloudflare
// garantit qu'il contient l'IP réelle du client, même si l'utilisateur
// a truqué X-Forwarded-For dans son navigateur.
func GetClientIP(r *http.Request) string {
	// 1. CF-Connecting-IP (Cloudflare — le plus fiable si présent car non usurpable)
	if cfIP := r.Header.Get("CF-Connecting-IP"); cfIP != "" {
		return strings.TrimSpace(cfIP)
	}

	// 2. X-Forwarded-For (Vercel injecte toujours ce header)
	//    Format: "client_ip, vercel_proxy1, vercel_proxy2"
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			clientIP := strings.TrimSpace(ips[0])
			if clientIP != "" {
				return clientIP
			}
		}
	}

	// 3. X-Real-IP (Standard pour certains autres proxies)
	if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
		return strings.TrimSpace(xrip)
	}

	// 4. RemoteAddr (Fallback — IP de la connexion réseau directe)
	// RemoteAddr contient l'IP au format "IP:port" (ex: "192.0.2.1:54321")
	// On utilise net.SplitHostPort pour retirer proprement le port.
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// Si le format n'a pas de port (rare mais possible selon l'environnement),
		// on nettoie et on retourne la valeur brute.
		return strings.TrimSpace(r.RemoteAddr)
	}

	return ip
}

// Logging middleware : log chaque requête HTTP avec method, path, status, durée, IP réelle.
func Logging(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: 200}

			next.ServeHTTP(rec, r)

			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"duration_ms", time.Since(start).Milliseconds(),
				"client_ip", GetClientIP(r),
				"user_agent", r.Header.Get("User-Agent"),
			)
		})
	}
}
