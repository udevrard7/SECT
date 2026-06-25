// Package http transporte les handlers HTTP et le routeur chi.
package http

import (
        "net/http"

        "github.com/go-chi/chi/v5"
        chimw "github.com/go-chi/chi/v5/middleware"
        "github.com/go-chi/cors"
        "github.com/udevrard7/sect/apps/api/internal/middleware"
        "github.com/udevrard7/sect/apps/api/internal/repository"
)

// Server holds the HTTP server dependencies.
type Server struct {
        router      *chi.Mux
        userRepo    *repository.UserRepository
        jwtSecret   string
}

// NewServer crée et configure le serveur HTTP avec tous les middlewares et routes.
func NewServer(userRepo *repository.UserRepository, jwtSecret string, corsOrigins []string) *Server {
        s := &Server{
                userRepo:  userRepo,
                jwtSecret: jwtSecret,
        }
        s.setupRouter(corsOrigins)
        return s
}

// ServeHTTP implémente http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
        s.router.ServeHTTP(w, r)
}

func (s *Server) setupRouter(corsOrigins []string) {
        r := chi.NewRouter()

        // Middlewares globaux
        r.Use(chimw.RequestID)
        r.Use(chimw.RealIP)
        r.Use(chimw.Recoverer)
        r.Use(cors.Handler(cors.Options{
                AllowedOrigins:   corsOrigins,
                AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
                AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
                ExposedHeaders:   []string{"Link"},
                AllowCredentials: true,
                MaxAge:           300,
        }))

        // Routes publiques (health)
        r.Get("/health", s.health)

        // Routes API (authentifiées)
        r.Route("/api", func(r chi.Router) {
                r.Use(middleware.Auth(s.jwtSecret))

                // /api/me — retourne l'utilisateur courant (démo RLS)
                r.With(middleware.RequireAuth).Get("/me", s.me)
        })

        s.router = r
}
