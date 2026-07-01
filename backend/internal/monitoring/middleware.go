// Package monitoring — middleware HTTP pour capturer les erreurs et panics.
//
// Ce middleware wrap le routeur chi et enregistre automatiquement :
//   - Erreurs HTTP 5xx → Event{type=API, severite=ERROR}
//   - Panics recovered → Event{type=SYSTEM, severite=CRITICAL}
//   - Requêtes lentes (> 5s) → Event{type=API, severite=WARNING}
package monitoring

import (
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"
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
// panics, et requêtes lentes dans MonitoringEvent via le Recorder.
func Middleware(recorder *Recorder, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			// Skip health checks (pour éviter le bruit)
			if r.URL.Path == "/health" || r.URL.Path == "/api/health" {
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

			// Post-request : enregistrer les erreurs 5xx
			duration := time.Since(start)
			if sw.status >= 500 {
				if recorder != nil {
					recorder.RecordError("API",
						fmt.Sprintf("HTTP %d sur %s %s", sw.status, r.Method, r.URL.Path),
						fmt.Sprintf("%s %s", r.Method, r.URL.Path),
					)
				}
			}

			// Requêtes lentes (> 5s) → warning
			if duration > 5*time.Second {
				if recorder != nil {
					ms := int(duration.Milliseconds())
					recorder.RecordWarning("API",
						fmt.Sprintf("requête lente (%dms) sur %s %s", ms, r.Method, r.URL.Path),
						fmt.Sprintf("%s %s", r.Method, r.URL.Path),
					)
				}
			}
		})
	}
}
