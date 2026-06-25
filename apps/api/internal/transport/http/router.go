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
        router      *chi.Mux
        userRepo    *repository.UserRepository
        userUC      *usecase.UserUseCase
        authUC      *usecase.AuthUseCase
        etabUC      *usecase.EtablissementUseCase
        accessUC    *usecase.AccessUseCase
        filiereUC   *usecase.FiliereUseCase
        ueUC        *usecase.UEUseCase
        efUC        *usecase.EnseignantFiliereUseCase
        anneeUC     *usecase.AnneeUseCase
        epreuveUC   *usecase.EpreuveUseCase
        questionUC  *usecase.QuestionUseCase
        sessionUC   *usecase.SessionUseCase
        resultatUC  *usecase.ResultatUseCase
        documentUC  *usecase.DocumentUseCase
}

// NewServer crée et configure le serveur HTTP.
func NewServer(
        userRepo *repository.UserRepository,
        userUC *usecase.UserUseCase,
        authUC *usecase.AuthUseCase,
        etabUC *usecase.EtablissementUseCase,
        accessUC *usecase.AccessUseCase,
        filiereUC *usecase.FiliereUseCase,
        ueUC *usecase.UEUseCase,
        efUC *usecase.EnseignantFiliereUseCase,
        anneeUC *usecase.AnneeUseCase,
        epreuveUC *usecase.EpreuveUseCase,
        questionUC *usecase.QuestionUseCase,
        sessionUC *usecase.SessionUseCase,
        resultatUC *usecase.ResultatUseCase,
        documentUC *usecase.DocumentUseCase,
        corsOrigins []string,
        authMiddleware func(http.Handler) http.Handler,
) *Server {
        s := &Server{
                userRepo:    userRepo,
                userUC:      userUC,
                authUC:      authUC,
                etabUC:      etabUC,
                accessUC:    accessUC,
                filiereUC:   filiereUC,
                ueUC:        ueUC,
                efUC:        efUC,
                anneeUC:     anneeUC,
                epreuveUC:   epreuveUC,
                questionUC:  questionUC,
                sessionUC:   sessionUC,
                resultatUC:  resultatUC,
                documentUC:  documentUC,
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

                // /api/users
                r.Route("/api/users", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listUsers)
                        r.Post("/", s.createUser)
                        r.Get("/{id}", s.getUser)
                        r.Patch("/{id}", s.updateUser)
                        r.Delete("/{id}", s.deleteUser)
                })

                // /api/etablissements
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

                // /api/etablissement-access
                r.Route("/api/etablissement-access", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listAccess)
                        r.Post("/", s.createAccess)
                        r.Get("/check", s.checkAccess)
                        r.Get("/authorized-etablissements", s.authorizedEtablissements)
                        r.Patch("/{id}", s.updateAccess)
                })

                // /api/filieres
                r.Route("/api/filieres", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listFilieres)
                        r.Post("/", s.createFiliere)
                        r.Patch("/bulk", s.bulkFilieres)
                        r.Get("/export", s.exportFilieres)
                        r.Get("/{id}", s.getFiliere)
                        r.Patch("/{id}", s.updateFiliere)
                        r.Delete("/{id}", s.deleteFiliere)
                })

                // /api/unites-enseignement
                r.Route("/api/unites-enseignement", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listUEs)
                        r.Post("/", s.createUE)
                        r.Get("/{id}", s.getUE)
                        r.Patch("/{id}", s.updateUE)
                        r.Delete("/{id}", s.deleteUE)
                })

                // /api/enseignant-filieres
                r.Route("/api/enseignant-filieres", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listEnseignantFilieres)
                        r.Post("/", s.createEnseignantFilieres)
                        r.Delete("/", s.deleteEnseignantFilieres)
                })

                // /api/annees-academiques
                r.Route("/api/annees-academiques", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listAnnees)
                        r.Post("/", s.createAnnee)
                })

                // /api/epreuves
                r.Route("/api/epreuves", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listEpreuves)
                        r.Post("/", s.createEpreuve)
                        r.Get("/{id}", s.getEpreuve)
                        r.Patch("/{id}", s.updateEpreuve)
                        r.Delete("/{id}", s.deleteEpreuve)
                        r.Get("/{id}/questions", s.listEpreuveQuestions)
                })

                // /api/questions
                r.Route("/api/questions", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listQuestions)
                        r.Post("/", s.createQuestion)
                        r.Delete("/", s.batchDeleteQuestions)
                        r.Get("/{id}", s.getQuestion)
                        r.Patch("/{id}", s.updateQuestion)
                        r.Delete("/{id}", s.deleteQuestion)
                })

                // /api/sessions
                r.Route("/api/sessions", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listSessions)
                        r.Post("/", s.startSession)
                        r.Put("/", s.saveReponse)
                        r.Get("/{id}", s.getSession)
                        r.Post("/{id}/submit", s.submitSession)
                })

                // /api/resultats
                r.Route("/api/resultats", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listResultats)
                        r.Get("/overview", s.resultatsOverview)
                        r.Get("/etudiant-overview", s.resultatsEtudiantOverview)
                })

                // /api/documents
                r.Route("/api/documents", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listDocuments)
                        r.Post("/", s.uploadDocument)
                        r.Get("/{id}", s.getDocument)
                        r.Delete("/{id}", s.deleteDocument)
                        r.Get("/{id}/download", s.downloadDocument)
                })
        })

        s.router = r
}
