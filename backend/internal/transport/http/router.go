// Package http transporte les handlers HTTP et le routeur chi.
package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/ai"
	"github.com/udevrard7/sect/backend/internal/cache"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/repository"
	"github.com/udevrard7/sect/backend/internal/usecase"
)

// Server holds the HTTP server dependencies.
type Server struct {
	router       *chi.Mux
	dbPool       *pgxpool.Pool
	userRepo     *repository.UserRepository
	userUC       *usecase.UserUseCase
	authUC       *usecase.AuthUseCase
	etabUC       *usecase.EtablissementUseCase
	accessUC     *usecase.AccessUseCase
	filiereUC    *usecase.FiliereUseCase
	ueUC         *usecase.UEUseCase
	efUC         *usecase.EnseignantFiliereUseCase
	anneeUC      *usecase.AnneeUseCase
	epreuveUC    *usecase.EpreuveUseCase
	questionUC   *usecase.QuestionUseCase
	sessionUC    *usecase.SessionUseCase
	resultatUC   *usecase.ResultatUseCase
	documentUC   *usecase.DocumentUseCase
	certificatUC *usecase.CertificatUseCase
	correctionUC *usecase.CorrectionUseCase
	examPrepUC   *usecase.ExamPrepUseCase
	aiService    *ai.AIService
	// CACHE-RAM-1 : cache en mémoire write-behind pour les sessions d'examen actives.
	// Le handler saveReponse écrit en RAM (< 1ms) ; un worker goroutine synchronise
	// vers Neon toutes les 30s ; le handler submitSession force un flush immédiat.
	sessionCache *cache.SessionCache
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
	certificatUC *usecase.CertificatUseCase,
	correctionUC *usecase.CorrectionUseCase,
	examPrepUC *usecase.ExamPrepUseCase,
	aiService *ai.AIService,
	dbPool *pgxpool.Pool,
	corsOrigins []string,
	authMiddleware func(http.Handler) http.Handler,
) *Server {
	s := &Server{
		dbPool:       dbPool,
		userRepo:     userRepo,
		userUC:       userUC,
		authUC:       authUC,
		etabUC:       etabUC,
		accessUC:     accessUC,
		filiereUC:    filiereUC,
		ueUC:         ueUC,
		efUC:         efUC,
		anneeUC:      anneeUC,
		epreuveUC:    epreuveUC,
		questionUC:   questionUC,
		sessionUC:    sessionUC,
		resultatUC:   resultatUC,
		documentUC:   documentUC,
		certificatUC: certificatUC,
		correctionUC: correctionUC,
		examPrepUC:   examPrepUC,
		aiService:    aiService,
	}
	// CACHE-RAM-1 : initialiser le cache RAM write-behind.
	s.sessionCache = cache.NewSessionCache()
	s.setupRouter(corsOrigins, authMiddleware)
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) setupRouter(corsOrigins []string, authMiddleware func(http.Handler) http.Handler) {
	r := chi.NewRouter()

	// Middlewares globaux
	// NOTE: chimw.RealIP retiré — on utilise middleware.GetClientIP() qui lit
	// X-Forwarded-For / X-Real-IP directement (Vercel injecte ces headers).
	// chimw.RealIP modifie r.RemoteAddr ce qui peut causer des conflits.
	r.Use(chimw.RequestID)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Cookie"},
		ExposedHeaders:   []string{"Link", "Set-Cookie"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check (public)
	// /health pour Render healthCheckPath (sans préfixe /api)
	// /api/health pour le rewrite Vercel (préfixe /api/* → Go /api/*)
	r.Get("/health", s.health)
	r.Get("/api/health", s.health)

	// Auth routes publiques
	r.Group(func(r chi.Router) {
		r.Post("/api/auth/login", s.login)
		r.Post("/api/auth/refresh", s.refresh)
		r.Post("/api/auth/logout", s.logout)
	})

	// Certificats verify (public — no auth required for verification)
	r.Get("/api/certificats/verify/{code}", s.verifyCertificat)

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

		// /api/affectations (enseignant↔UE) — BUGFIX (PROG-ACAD-2)
		r.Route("/api/affectations", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.listAffectations)
			r.Post("/", s.createAffectation)
			r.Patch("/{id}", s.updateAffectation)
			r.Delete("/{id}", s.deleteAffectation)
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
			r.Get("/{id}/status", s.getEpreuveStatus) // IA-WORKER-1 : polling statut génération IA
			// AI-CONNECT-1 : génération IA d'épreuves via le backend AIService.
			r.Post("/generate", s.epreuvesGenerate)
		})

		// AI-CONNECT-1 : /api/ai-assistant — chat flottant pédagogique.
		// Appelle le backend AIService (jamais d'appel IA direct côté client).
		r.Route("/api/ai-assistant", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Post("/", s.aiAssistant)
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
			r.Get("/overview", s.resultatsOverviewRealV2)
			r.Get("/etudiant-overview", s.resultatsEtudiantOverviewReal)
		})

		// /api/documents
		r.Route("/api/documents", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.listDocuments)
			r.Post("/", s.uploadDocument)
			r.Get("/{id}", s.getDocument)
			r.Delete("/", s.batchDeleteDocuments) // BUGFIX (CORBEILLE-1): batch delete
			r.Delete("/{id}", s.deleteDocument)
			r.Get("/{id}/download", s.downloadDocument)
		})

		// /api/certificats (verify est publique, définie plus haut)
		r.Route("/api/certificats", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.listCertificats)
			r.Get("/{id}", s.getCertificat)
			r.Post("/{id}/revoquer", s.revokeCertificat)
		})

		// /api/correction
		r.Route("/api/correction", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.listCorrectionSessions)
			r.Post("/retourner-batch", s.retournerBatch)
			r.Post("/{sessionId}/retourner", s.retournerSession)
			r.Post("/{sessionId}/ai-grade", s.aiGradeSession) // IA-CORRECTION-1
			r.Patch("/reponses/{reponseId}", s.updateReponse)
		})

		// /api/exam-prep
		r.Route("/api/exam-prep", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			// Dashboard
			r.Get("/dashboard", s.examPrepDashboard)
			// Documents (student-scoped)
			r.Get("/documents", s.listExamPrepDocuments)
			// Review (spaced repetition)
			r.Get("/review", s.listReviewItems)
			r.Post("/review", s.markReviewed)
			// Planning (study sessions)
			r.Get("/planning", s.listStudySessions)
			r.Post("/planning", s.createStudySession)
			r.Delete("/planning/{id}", s.deleteStudySession)
			// Practice
			r.Get("/practice", s.listPracticeAttempts)
			// EXAM-PREP-CONNECT-1 - Étape 2b : génération async (202 + PracticeQueue).
			// Déclarée AVANT la route paramétrée /practice/{id}/submit pour que chi
			// distingue correctement "/practice/generate" (statique) de "/practice/{id}/submit" (param).
			r.Post("/practice/generate", s.examPrepGeneratePractice)
			r.Post("/practice/{id}/submit", s.submitPractice)
			// EXAM-PREP-CONNECT-1 - Étape 3 : Q&A RAG synchrone.
			r.Post("/qa", s.examPrepQA)
			// Help threads
			r.Get("/help", s.listHelpThreads)
			r.Post("/help", s.createHelpThread)
			r.Post("/help/{id}/close", s.closeHelpThread)
			r.Get("/help/{id}/messages", s.listHelpMessages)
			r.Post("/help/{id}/messages", s.createHelpMessage)
		})

		// ── Endpoints stubs (éviter 404 sur le dashboard) ──
		r.Route("/api/stats", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/enseignant", s.statsEnseignant)
			r.Get("/etudiant", s.statsEtudiant)
			r.Get("/admin", s.statsAdmin)
			r.Get("/responsable", s.statsResponsable)
		})

		r.Route("/api/badges", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.badgesList)
			r.Post("/", s.badgesList)
		})

		r.Route("/api/devoirs", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.devoirsListReal)
			r.Get("/stats", s.devoirsStatsReal)
		})

		r.Route("/api/alertes", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.alertesListReal)
		})

		r.Route("/api/surveillance", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.surveillanceListSessions)
			r.Get("/stats", s.surveillanceStatsV2)
			// SSE-STREAM-1 : Server-Sent Events pour surveillance temps réel
			r.Get("/stream", s.surveillanceStream) // SSE endpoint
		})

		r.Route("/api/corbeille", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.corbeilleListReal)
			// BUGFIX (CORBEILLE-1) : endpoints restore + purge manquants
			r.Post("/restore", s.corbeilleRestore)
			r.Delete("/purge", s.corbeillePurge)
		})

		r.Route("/api/notifications", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.notificationsListReal)
			r.Get("/admin", s.notificationsAdminReal)
		})

		r.Route("/api/abonnements", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.abonnementsListReal)
		})

		r.Route("/api/factures", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.facturesListReal)
		})

		r.Route("/api/plans", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.plansListReal)
		})

		r.Route("/api/platform-settings", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.platformSettingsReal)
		})

		r.Route("/api/ai-providers", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.With(middleware.RequireRole("ADMIN")).Get("/", s.aiProvidersListReal)

			// AI-PROVIDERS-1 : 11 endpoints pour la gestion des AI providers.
			// Tous réservés ADMIN (clauses r.With explicites ci-dessous).
			r.With(middleware.RequireRole("ADMIN")).Post("/", s.aiProviderCreate)
			r.With(middleware.RequireRole("ADMIN")).Post("/activate", s.aiProviderActivate)
			r.With(middleware.RequireRole("ADMIN")).Post("/priority", s.aiProviderPriority)
			r.With(middleware.RequireRole("ADMIN")).Get("/models", s.aiProviderModels)

			// Sous-route failover (statut, config, health) — ADMIN uniquement.
			r.Route("/failover", func(r chi.Router) {
				r.Use(middleware.RequireRole("ADMIN"))
				r.Get("/status", s.aiProviderFailoverStatus)
				r.Post("/config", s.aiProviderFailoverConfig)
				r.Get("/health", s.aiProviderFailoverHealth)
				r.Post("/health", s.aiProviderFailoverHealth)
			})

			// Routes paramétrées {id} — déclarées après les routes statiques.
			// Chi distingue automatiquement "/activate" (statique) de "/{id}" (param).
			r.With(middleware.RequireRole("ADMIN")).Get("/{id}", s.aiProviderGet)
			r.With(middleware.RequireRole("ADMIN")).Patch("/{id}", s.aiProviderUpdate)
			r.With(middleware.RequireRole("ADMIN")).Delete("/{id}", s.aiProviderDelete)
			r.With(middleware.RequireRole("ADMIN")).Get("/{id}/test", s.aiProviderTest)
			r.With(middleware.RequireRole("ADMIN")).Post("/{id}/test", s.aiProviderTest)
		})

		r.Route("/api/monitoring", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.monitoringEventsReal)
		})

		r.Route("/api/logs", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.logsListReal)
		})

		r.Route("/api/ip-whitelist", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.ipWhitelistListReal)
		})

		r.Route("/api/security-settings", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.securitySettingsGetReal)
		})

		r.Route("/api/enseignant", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/context", s.enseignantContextReal)
			r.Get("/etudiants", s.enseignantEtudiantsReal)
		})

		r.Route("/api/etudiants", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.etudiantsListReal)
		})

		r.Route("/api/validations-ue", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", s.validationsUEListReal)
		})

		// Catch-all pour les routes API non implémentées (évite 404 brut)
		r.NotFound(s.apiNotFound)
	})

	s.router = r
}
