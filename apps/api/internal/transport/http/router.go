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
	router    *chi.Mux
	userRepo  *repository.UserRepository
	userUC    *usecase.UserUseCase
	authUC    *usecase.AuthUseCase
	etabUC    *usecase.EtablissementUseCase
	accessUC  *usecase.AccessUseCase
}

// NewServer crée et configure le serveur HTTP.
func NewServer(
	userRepo *repository.UserRepository,
	userUC *usecase.UserUseCase,
	authUC *usecase.AuthUseCase,
	etabUC *usecase.EtablissementUseCase,
	accessUC *usecase.AccessUseCase,
	corsOrigins []string,
	authMiddleware func(http.Handler) http.Handler,
) *Server {
	s := &Server{
		userRepo: userRepo,
		userUC:   userUC,
		authUC:   authUC,
		etabUC:   etabUC,
		accessUC: accessUC,
	}
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

	// Auth routes publiques
	r.Group(func(r chi.Router) {
		r.Post("/api/auth/login", s.login)
		r.Post("/api/auth/refresh", s.refresh)
		r.Post("/api/auth/logout", s.logout)
	})

	// Routes authentifiées
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)

		// /api/me
		r.With(middleware.RequireAuth).Get("/api/me", s.me)
		r.With(middleware.RequireAuth).Post("/api/auth/change-password", s.changePassword)

		// /api/users — CRUD utilisateurs
		r.Route("/api/users", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.listUsers)
			r.Post("/", s.createUser)
			r.Get("/{id}", s.getUser)
			r.Patch("/{id}", s.updateUser)
			r.Delete("/{id}", s.deleteUser)
		})

		// /api/etablissements — CRUD établissements
		r.Route("/api/etablissements", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.listEtablissements)
			r.Post("/", s.createEtablissement)
			r.Get("/{id}", s.getEtablissement)
			r.Patch("/{id}", s.updateEtablissement)
			r.Delete("/{id}", s.deleteEtablissement)
			r.Post("/upload-logo", s.uploadLogo)
			r.Get("/{id}/watermark", s.getWatermark)
			r.Patch("/{id}/watermark", s.updateWatermark)
		})

		// /api/etablissement-access — gestion des accès ADMIN
		r.Route("/api/etablissement-access", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.listAccess)
			r.Post("/", s.createAccess)
			r.Get("/check", s.checkAccess)
			r.Get("/authorized-etablissements", s.authorizedEtablissements)
			r.Patch("/{id}", s.updateAccess)
		})
	})

	s.router = r
}
