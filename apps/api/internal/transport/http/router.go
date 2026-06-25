// Package http transporte les handlers HTTP et le routeur chi.
package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/udevrard7/sect/apps/api/internal/middleware"
	"github.com/udevrard7/sect/apps/api/internal/repository"
	"github.com/udevrard7/sect/apps/api/internal/usecase"
)

// Server holds the HTTP server dependencies.
type Server struct {
	router   *chi.Mux
	userRepo *repository.UserRepository
	authUC   *usecase.AuthUseCase
}

// NewServer crée et configure le serveur HTTP.
func NewServer(
	userRepo *repository.UserRepository,
	authUC *usecase.AuthUseCase,
	corsOrigins []string,
	authMiddleware func(http.Handler) http.Handler,
) *Server {
	s := &Server{userRepo: userRepo, authUC: authUC}
	s.setupRouter(corsOrigins, authMiddleware)
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) setupRouter(corsOrigins []string, authMiddleware func(http.Handler) http.Handler) {
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

	// Health check (public)
	r.Get("/health", s.health)

	// Auth routes publiques (login, refresh, logout — pas de middleware Auth)
	r.Group(func(r chi.Router) {
		r.Post("/api/auth/login", s.login)
		r.Post("/api/auth/refresh", s.refresh)
		r.Post("/api/auth/logout", s.logout)
	})

	// Routes authentifiées — middleware Auth appliqué via Group
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)

		// /api/me
		r.With(middleware.RequireAuth).Get("/api/me", s.me)

		// /api/auth/change-password
		r.With(middleware.RequireAuth).Post("/api/auth/change-password", s.changePassword)
	})

	s.router = r
}
