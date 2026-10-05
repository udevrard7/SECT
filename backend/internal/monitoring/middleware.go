// Package monitoring — middleware HTTP pour capturer les erreurs et panics.
//
// Ce middleware wrap le routeur chi et enregistre automatiquement :
//   - Erreurs HTTP 5xx → Event{type=API, severite=ERROR}
//   - Panics recovered → Event{type=SYSTEM, severite=CRITICAL}
//   - Requêtes lentes (> 5s) → Event{type=API, severite=WARNING}
//   - Échantillon de CHAQUE requête /api/* → RequestSampler (ADR-0012 :
//     p50/p95 par endpoint — route normalisée au pattern chi)
package monitoring

import (
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// statusWriter capture le status code pour le middleware.
type statusWriter struct {
	http.ResponseWriter
	status int
	size   int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = 200
	}
	n, err := w.ResponseWriter.Write(b)
	w.size += n
	return n, err
}

// Middleware retourne un middleware chi qui enregistre les erreurs 5xx,
// panics, requêtes lentes (Recorder) et échantillonne les requêtes API
// (sampler, ADR-0012). recorder/sampler nil-safe.
func Middleware(recorder *Recorder, logger *slog.Logger, sampler *RequestSampler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			// Skip health checks et SSE streams (pour éviter le bruit)
			if r.URL.Path == "/health" || r.URL.Path == "/api/health" ||
				r.URL.Path == "/api/notifications/stream" ||
				r.URL.Path == "/api/surveillance/stream" {
				next.ServeHTTP(w, r)
				return
			}

			// Panic recovery
			defer func() {
				if rec := recover(); rec != nil {
					stack := debug.Stack()
					if recorder != nil {
						recorder.RecordCritical("SYSTEM",
							fmt.Sprintf("panic: %v", rec),
							fmt.Sprintf("handler: %s %s", r.Method, r.URL.Path),
						)
					}
					if logger != nil {
						logger.Error("panic recovered",
							"error", rec,
							"path", r.URL.Path,
							"method", r.Method,
							"stack", string(stack),
						)
					}
					http.Error(w, `{"error":"erreur interne du serveur"}`, http.StatusInternalServerError)
				}
			}()

			// Wrap response writer pour capturer le status
			sw := &statusWriter{ResponseWriter: w}
			next.ServeHTTP(sw, r)

			// ADR-0012 §3 : échantillonner CHAQUE requête /api/* (hors
			// OPTIONS/CORS) pour les p50/p95 par endpoint. La route est
			// lue APRÈS le handler via le RouteContext chi → pattern
			// normalisé (/api/epreuves/{id}), pas l'UUID brut.
			duration := time.Since(start)
			if sampler != nil && strings.HasPrefix(r.URL.Path, "/api/") && r.Method != "OPTIONS" {
				route := r.URL.Path
				if rctx := chi.RouteContext(r.Context()); rctx != nil {
					if p := rctx.RoutePattern(); p != "" {
						route = p
					}
				}
				status := sw.status
				if status == 0 {
					status = 200
				}
				sampler.Sample(r.Method, route, status, int(duration.Milliseconds()))
			}

			// Post-request : enregistrer les erreurs 5xx
			if sw.status >= 500 {
				if recorder != nil {
					recorder.RecordError("API",
						fmt.Sprintf("HTTP %d sur %s %s", sw.status, r.Method, r.URL.Path),
						fmt.Sprintf("%s %s", r.Method, r.URL.Path),
					)
				}
			}

			// Requêtes lentes (> 5s) → warning
			// ADR-0011 §5 : la latence mesurée est ENFIN envoyée dans
			// duree (avant : le middleware calculait les ms mais les
			// jetait → colonne duree toujours NULL pour les events auto,
			// latence moyenne frontend à 0).
			if duration > 5*time.Second {
				if recorder != nil {
					ms := int(duration.Milliseconds())
					recorder.Record(Event{
						Type:     "API",
						Severite: "WARNING",
						Message:  fmt.Sprintf("requête lente (%dms) sur %s %s", ms, r.Method, r.URL.Path),
						Source:   fmt.Sprintf("%s %s", r.Method, r.URL.Path),
						Duree:    &ms,
					})
				}
			}
		})
	}
}
