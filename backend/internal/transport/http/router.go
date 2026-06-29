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
        "github.com/udevrard7/sect/backend/internal/domain"
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
        invitationUC *usecase.InvitationUseCase
        epreuveUC    *usecase.EpreuveUseCase
        questionUC   *usecase.QuestionUseCase
        sessionUC    *usecase.SessionUseCase
        resultatUC   *usecase.ResultatUseCase
        documentUC   *usecase.DocumentUseCase
        certificatUC *usecase.CertificatUseCase
        correctionUC *usecase.CorrectionUseCase
        examPrepUC   *usecase.ExamPrepUseCase
        aiService    *ai.AIService
        storage       domain.StorageClient
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
        invitationUC *usecase.InvitationUseCase,
        epreuveUC *usecase.EpreuveUseCase,
        questionUC *usecase.QuestionUseCase,
        sessionUC *usecase.SessionUseCase,
        resultatUC *usecase.ResultatUseCase,
        documentUC *usecase.DocumentUseCase,
        certificatUC *usecase.CertificatUseCase,
        correctionUC *usecase.CorrectionUseCase,
        examPrepUC *usecase.ExamPrepUseCase,
        aiService *ai.AIService,
        storage domain.StorageClient,
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
                invitationUC: invitationUC,
                epreuveUC:    epreuveUC,
                questionUC:   questionUC,
                sessionUC:    sessionUC,
                resultatUC:   resultatUC,
                documentUC:   documentUC,
                certificatUC: certificatUC,
                correctionUC: correctionUC,
                examPrepUC:   examPrepUC,
                aiService:    aiService,
                storage:       storage,
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

        // E1-INVITATIONS — endpoints publics (pas de RequireAuth).
        // Le token d'invitation sert d'authentification ; la RLS est
        // désactivée pour ces deux opérations (cf. repository/invitation.go).
        // Les routes /verify et /accept sont déclarées AVANT le r.Route
        // authentifié "/api/invitations" pour que chi les traite comme des
        // routes statiques publiques (la sous-route authentifiée
        // "/api/invitations/{id}/..." ne les intercepte pas).
        r.Get("/api/invitations/verify", s.verifyInvitation)
        r.Post("/api/invitations/accept", s.acceptInvitation)

        // Certificats verify (public — no auth required for verification)
        r.Get("/api/certificats/verify/{code}", s.verifyCertificat)

        // Routes authentifiées
        r.Group(func(r chi.Router) {
                r.Use(authMiddleware)

                // /api/me
                r.With(middleware.RequireAuth).Get("/api/me", s.me)
                r.With(middleware.RequireAuth).Post("/api/auth/change-password", s.changePassword)

                // /api/users
                // ETUDIANTS-FIX-E2 : route /import déclarée AVANT /{id} pour éviter
                // que chi matche "import" comme un paramètre id. E6 : RequireRole
                // sur mutations (POST/PATCH/DELETE) pour defense-in-depth.
                r.Route("/api/users", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listUsers)
                        r.Get("/{id}", s.getUser)
                        r.Group(func(r chi.Router) {
                                r.Use(middleware.RequireRole("RESPONSABLE", "ADMIN"))
                                r.Post("/", s.createUser)
                                r.Post("/import", s.importUsers) // ETUDIANTS-FIX-E2
                                r.Patch("/{id}", s.updateUser)
                                r.Delete("/{id}", s.deleteUser)
                                // ETUDIANTS-FIX-E10 : dependencies pour preview suppression
                                r.Get("/{id}/dependencies", s.getUserDependencies)
                                // U5 (CRITICAL) : endpoints admin pour reset password + unlock account.
                                // Avant ce fix, un user verrouillé était perdu (lockout permanent de fait).
                                r.Post("/{id}/reset-password", s.resetUserPassword)
                                r.Post("/{id}/unlock", s.unlockUserAccount)
                        })
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
                        // BUGFIX (FILIERES-CRITICAL-FIX-1) : /{id}/dependencies doit être
                        // déclaré avant /{id} pour éviter toute ambiguïté de routing chi.
                        r.Get("/{id}/dependencies", s.getFiliereDependencies)
                        r.Get("/{id}", s.getFiliere)
                        r.Patch("/{id}", s.updateFiliere)
                        r.Delete("/{id}", s.deleteFiliere)
                })

                // /api/unites-enseignement
                r.Route("/api/unites-enseignement", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listUEs)
                        r.Post("/", s.createUE)
                        // PROG-ACAD-CRITICAL-FIX-1 (BUG #1) : dependencies AVANT /{id} (chi routing)
                        r.Get("/{id}/dependencies", s.getUEDependencies)
                        r.Get("/{id}", s.getUE)
                        r.Patch("/{id}", s.updateUE)
                        r.Delete("/{id}", s.deleteUE)
                })

                // /api/enseignant-filieres
                // ENSEIGNANTS-FIX-EN6 : RequireRole RESPONSABLE+ADMIN sur mutations
                // (POST/DELETE). GET ouvert (ENSEIGNANT via RLS auto-scoping).
                r.Route("/api/enseignant-filieres", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listEnseignantFilieres)
                        r.Group(func(r chi.Router) {
                                r.Use(middleware.RequireRole("RESPONSABLE", "ADMIN"))
                                r.Post("/", s.createEnseignantFilieres)
                                r.Delete("/", s.deleteEnseignantFilieres)
                        })
                })

                // /api/affectations (enseignant↔UE) — BUGFIX (PROG-ACAD-2)
                // AFFECTATIONS-FIX-A4 : séparation GET (lecteur = ENSEIGNANT via
                // RLS auto-scoping, RESPONSABLE, ADMIN) vs mutations (réservées
                // RESPONSABLE+ADMIN). Avant, RequireAuth seul → un étudiant
                // authentifié pouvait appeler POST/PATCH/DELETE (la RLS
                // rejetait l'INSERT/UPDATE, mais on évite le spam + on log
                // proprement les accès non autorisés).
                r.Route("/api/affectations", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listAffectations)
                        r.Group(func(r chi.Router) {
                                r.Use(middleware.RequireRole("RESPONSABLE", "ADMIN"))
                                r.Post("/", s.createAffectation)
                                r.Patch("/{id}", s.updateAffectation)
                                r.Delete("/{id}", s.deleteAffectation)
                                // AFFECTATIONS-FIX-A12 : dependencies pour preview suppression
                                r.Get("/{id}/dependencies", s.getAffectationDependencies)
                        })
                })

                // /api/annees-academiques
                r.Route("/api/annees-academiques", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listAnnees)
                        r.Post("/", s.createAnnee)
                        // PROG-ACAD-CRITICAL-FIX-1 (BUG #9) : CRUD complet
                        r.Get("/{id}", s.getAnnee)
                        r.Patch("/{id}", s.updateAnnee)
                        r.Delete("/{id}", s.deleteAnnee)
                })

                // E1-INVITATIONS — endpoints authentifiés (RESPONSABLE, ADMIN
                // pour les mutations ; ENSEIGNANT inclus sur le GET car le
                // frontend enseignant n'appelle pas /api/invitations, mais la
                // RLS Invitation_select exclut les ETUDIANT de toute façon).
                // Verify + accept sont déclarés en public plus haut.
                r.Route("/api/invitations", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listInvitations)
                        r.With(middleware.RequireRole("RESPONSABLE", "ADMIN")).Post("/", s.createInvitation)
                        r.With(middleware.RequireRole("RESPONSABLE", "ADMIN")).Patch("/{id}/renvoyer", s.resendInvitation)
                        r.With(middleware.RequireRole("RESPONSABLE", "ADMIN")).Delete("/{id}", s.cancelInvitation)
                })

                // /api/epreuves
                r.Route("/api/epreuves", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listEpreuves)
                        r.Post("/", s.createEpreuve)
                        r.Get("/auto-close", s.epreuveAutoClose) // B4-MES-EPREUVES : clôture auto
                        r.Get("/orphelines", s.listOrphanEpreuves) // P2-E3
                        r.Get("/session-speciale", s.listSessionSpeciale) // P2-E3
                        r.Post("/session-speciale", s.createSessionSpeciale) // P2-E3
                        r.Get("/{id}", s.getEpreuve)
                        r.Patch("/{id}", s.updateEpreuve)
                        // CORBEILLE-FIX C1 : RequireRole sur DELETE epreuves (avant : RequireAuth seul).
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Delete("/{id}", s.deleteEpreuve)
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
                        r.Get("/test-zai", s.testZaiConnection)                          // P2-Q3
                        r.Post("/", s.createQuestion)
                        // CORBEILLE-FIX C1+C2 : RequireRole + BatchSoftDelete (avant : hard delete).
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Delete("/", s.batchDeleteQuestions)
                        r.Get("/{id}", s.getQuestion)
                        r.Patch("/{id}", s.updateQuestion)
                        r.Post("/{id}/regenerate", s.regenerateQuestion)                   // P2-Q2
                        // CORBEILLE-FIX C1 : RequireRole sur DELETE question (avant : RequireAuth seul).
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Delete("/{id}", s.deleteQuestion)
                })

                // /api/sessions
                r.Route("/api/sessions", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listSessions)
                        r.Post("/", s.startSession)
                        r.Put("/", s.saveReponse)
                        r.Put("/{id}", s.updateSessionBulk)    // B2-MES-EPREUVES : bulk save + alerte
                        r.Patch("/{id}", s.updateSessionBulk)  // P2-E4 : alias PATCH pour frontend (force submit)
                        r.Get("/{id}", s.getSession)
                        r.Post("/{id}/submit", s.submitSession)
                        r.Post("/{id}/capture", s.captureSession) // B3-MES-EPREUVES : capture écran
                })

                // /api/resultats
                r.Route("/api/resultats", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listResultats)
                        r.Get("/overview", s.resultatsOverviewRealV2)
                        r.Get("/etudiant-overview", s.resultatsEtudiantOverview)
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
                        r.Post("/{id}/analyze", s.analyzeDocument) // P1-D3
                })

                // /api/certificats (verify est publique, définie plus haut)
                r.Route("/api/certificats", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listCertificats)
                        r.Get("/watermark-config", s.getWatermarkConfig)       // P3b
                        r.Patch("/watermark-config", s.updateWatermarkConfig)  // P3b
                        r.Post("/", s.createCertificat)                        // P3c
                        r.Get("/{id}", s.getCertificat)
                        r.Post("/{id}/revoquer", s.revokeCertificat)
                })

                // /api/correction
                r.Route("/api/correction", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listCorrectionSessions)
                        r.Post("/retourner-batch", s.retournerBatch)
                        r.Post("/{sessionId}/retourner", s.retournerSession)
                        r.Post("/{sessionId}/ai-grade", s.aiGradeSession)            // IA-CORRECTION-1
                        r.Patch("/{sessionId}/ai-grade", s.saveGradeOrFinalize)      // P1b-CORRECTION : save grade + finalize
                        r.Post("/{sessionId}/ai-grade-batch", s.batchAiGrade)        // P1b-CORRECTION : batch IA
                        r.Patch("/reponses/{reponseId}", s.updateReponse)
                })

                // /api/exam-prep
                r.Route("/api/exam-prep", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        // Dashboard
                        r.Get("/dashboard", s.examPrepDashboard)
                        // Documents (student-scoped)
                        r.Get("/documents", s.listExamPrepDocuments)
                        // HIGHLIGHT-FLASHCARD-1 — DocumentReader endpoint (contenuTexte + métadonnées).
                        r.Get("/documents/{id}/read", s.readExamPrepDocument)
                        // Review (spaced repetition)
                        r.Get("/review", s.listReviewItems)
                        r.Post("/review", s.markReviewed)
                        // HIGHLIGHT-FLASHCARD-1 — Flashcards (highlight to flashcard).
                        r.Get("/flashcards", s.listFlashcards)
                        r.Post("/flashcards", s.createFlashcard)
                        r.Delete("/flashcards/{id}", s.deleteFlashcard)
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
                        // QUESTION-BANK-1 — Banque de questions collaborative + cache.
                        // GET  /question-bank         : liste des questions validées avec votes.
                        // POST /questions/{id}/vote   : upsert un vote (+1/-1).
                        // DELETE /questions/{id}/vote : retire le vote (un-vote).
                        r.Get("/question-bank", s.listQuestionBank)
                        r.Post("/questions/{id}/vote", s.voteQuestion)
                        r.Delete("/questions/{id}/vote", s.removeVote)
                        // AUDIO-LEARNING-1 — Mode Audio-Learning (podcasts de révision).
                        // POST   /documents/{id}/audio : crée un podcast (202 + AudioGenerationQueue).
                        // GET    /documents/{id}/audio : liste les podcasts du document.
                        // GET    /audio/{id}           : récupère un podcast (+ URL présignée si PRET).
                        r.Post("/documents/{id}/audio", s.generateAudio)
                        r.Get("/documents/{id}/audio", s.listDocumentAudio)
                        r.Get("/audio/{id}", s.getAudio)
                        // Help threads
                        r.Get("/help", s.listHelpThreads)
                        r.Post("/help", s.createHelpThread)
                        r.Post("/help/{id}/close", s.closeHelpThread)
                        r.Delete("/help/{id}", s.deleteHelpThread)
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

                        // P2-DEVOIRS-1 : mutations (ENSEIGNANT uniquement)
                        r.With(middleware.RequireRole("ENSEIGNANT")).Post("/", s.createDevoir)
                        r.With(middleware.RequireRole("ENSEIGNANT")).Get("/{id}", s.getDevoir)
                        r.With(middleware.RequireRole("ENSEIGNANT")).Patch("/{id}", s.updateDevoir)
                        r.With(middleware.RequireRole("ENSEIGNANT")).Delete("/{id}", s.deleteDevoir)
                })

                // P2-DEVOIRS-2 : soumissions (étudiant crée, enseignant note)
                r.Route("/api/soumissions", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Post("/presign-upload", s.presignUploadSoumission)  // P3-DEVOIRS-3 : URL présignée R2
                        r.Post("/", s.createSoumission)                        // ETUDIANT
                        r.Patch("/{id}", s.updateSoumission)                   // ETUDIANT (brouillon) ou ENSEIGNANT (note)
                        r.With(middleware.RequireRole("ENSEIGNANT")).Post("/{id}/ai-grade", s.aiGradeSoumission) // P4-DEVOIRS-4
                })

                // P2-DEVOIRS-2 : grilles d'évaluation (ENSEIGNANT)
                r.Route("/api/grilles-evaluation", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listGrillesEvaluation)
                        r.With(middleware.RequireRole("ENSEIGNANT")).Post("/", s.createGrilleEvaluation)
                        r.With(middleware.RequireRole("ENSEIGNANT")).Patch("/{id}", s.updateGrilleEvaluation)
                })

                r.Route("/api/alertes", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.alertesListReal)
                        // SURVEILLANCE-FIX-2 S7 : route PATCH manquante (marquer lue / résoudre).
                        r.Patch("/{id}", s.alerteUpdate)
                })

                // SURVEILLANCE-FIX-2 S13 : RequireRole ENSEIGNANT/ADMIN/RESPONSABLE
                // (avant : RequireAuth seul → un étudiant pouvait lire les sessions).
                r.Route("/api/surveillance", func(r chi.Router) {
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE"))
                        r.Get("/", s.surveillanceListSessions)
                        r.Get("/stats", s.surveillanceStatsV2)
                        // SSE-STREAM-1 : Server-Sent Events pour surveillance temps réel
                        r.Get("/stream", s.surveillanceStream) // SSE endpoint
                        // SURVEILLANCE-FIX-2 S2 : route POST /{id}/flag manquante.
                        r.Post("/{id}/flag", s.surveillanceFlagSession)
                })

                r.Route("/api/corbeille", func(r chi.Router) {
                        // CORBEILLE-FIX C9 : RequireRole (avant : RequireAuth seul → étudiants
                        // pouvaient appeler l'API corbeille).
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE"))
                        r.Get("/", s.corbeilleListReal)
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
                        // PARAMETRES-FIX-P2 : mutations (POST/PATCH/DELETE) pour la whitelist IP.
                        r.Post("/", s.createIpWhitelist)
                        r.Patch("/{id}", s.updateIpWhitelist)
                        r.Delete("/{id}", s.deleteIpWhitelist)
                })

                r.Route("/api/security-settings", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.securitySettingsGetReal)
                        r.Get("/etablissement/{id}", s.securitySettingsByEtablissement)    // B5-MES-EPREUVES
                        // PARAMETRES-FIX-P1+P5 : upsert (UPDATE si existe, INSERT sinon).
                        r.Patch("/etablissement/{id}", s.updateSecuritySettingsByEtablissement)
                })

                r.Route("/api/enseignant", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Use(middleware.RequireRole("ENSEIGNANT", "ADMIN")) // P2-M8
                        r.Get("/context", s.enseignantContextReal)
                        r.Get("/etudiants", s.enseignantEtudiantsReal)
                        r.Get("/fiche-notes", s.enseignantFicheNotes) // MES-ETUDIANTS-REFOUND-1
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
