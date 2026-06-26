// Package middleware — middlewares HTTP du backend SECT.
package middleware

import (
	"log/slog"
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
// Vercel (rewrite) injecte ces headers lors du transfert vers Render:
//
//	X-Forwarded-For: client_ip, vercel_proxy1, vercel_proxy2
//	X-Real-IP: client_ip (parfois)
//
// Ordre de priorité:
//  1. X-Forwarded-For (première IP = client réel)
//  2. X-Real-IP
//  3. CF-Connecting-IP (Cloudflare, si utilisé)
//  4. RemoteAddr (fallback — IP du proxy direct)
func GetClientIP(r *http.Request) string {
	// 1. X-Forwarded-For (format: "client, proxy1, proxy2")
	// Vercel injecte toujours ce header lors d'un rewrite
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.SplitN(xff, ",", 2)
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}

	// 2. X-Real-IP (posé par certains proxies)
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	// 3. CF-Connecting-IP (Cloudflare, si le trafic passe par CF)
	if cf := r.Header.Get("CF-Connecting-IP"); cf != "" {
		return strings.TrimSpace(cf)
	}

	// 4. Fallback: RemoteAddr (host:port) — IP du proxy direct (Render/Vercel)
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
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
				"client_ip", GetClientIP(r), // IP RÉELLE du client (via Vercel headers)
				"user_agent", r.Header.Get("User-Agent"),
			)
		})
	}
}
