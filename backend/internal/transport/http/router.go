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
        "github.com/udevrard7/sect/backend/internal/monitoring"
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
        // Messagerie (Task 6) : chat temps réel + IA hybride.
        messagerieUC  *usecase.MessagerieUseCase
        messagerieHub *MessagerieHub
        aiService     *ai.AIService
        storage       domain.StorageClient
        // CACHE-RAM-1 : cache en mémoire write-behind pour les sessions d'examen actives.
        // Le handler saveReponse écrit en RAM (< 1ms) ; un worker goroutine synchronise
        // vers Neon toutes les 30s ; le handler submitSession force un flush immédiat.
        sessionCache *cache.SessionCache
        // Monitoring : Event Recorder + Health Checker (audit monitoring 2025)
        monRecorder      *monitoring.Recorder
        monHealthChecker *monitoring.HealthChecker
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
        messagerieUC *usecase.MessagerieUseCase,
        messagerieHub *MessagerieHub,
        aiService *ai.AIService,
        storage domain.StorageClient,
        dbPool *pgxpool.Pool,
        corsOrigins []string,
        authMiddleware func(http.Handler) http.Handler,
        monRecorder *monitoring.Recorder,
        monHealthChecker *monitoring.HealthChecker,
) *Server {
        s := &Server{
                dbPool:           dbPool,
                userRepo:         userRepo,
                userUC:           userUC,
                authUC:           authUC,
                etabUC:           etabUC,
                accessUC:         accessUC,
                filiereUC:        filiereUC,
                ueUC:             ueUC,
                efUC:             efUC,
                anneeUC:          anneeUC,
                invitationUC:     invitationUC,
                epreuveUC:        epreuveUC,
                questionUC:       questionUC,
                sessionUC:        sessionUC,
                resultatUC:       resultatUC,
                documentUC:       documentUC,
                certificatUC:     certificatUC,
                correctionUC:     correctionUC,
                examPrepUC:       examPrepUC,
                messagerieUC:     messagerieUC,
                messagerieHub:    messagerieHub,
                aiService:        aiService,
                storage:          storage,
                monRecorder:      monRecorder,
                monHealthChecker: monHealthChecker,
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
        // Monitoring middleware : capture erreurs 5xx + panics → MonitoringEvent
        r.Use(monitoring.Middleware(s.monRecorder, nil))
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
                // SELF-SERVICE RESET (000054) : "mot de passe oublié" — 2 endpoints publics.
                // requestPasswordReset : toujours 200 (anti-énumération).
                // confirmPasswordReset : valide le token + définit le nouveau mot de passe.
                r.Post("/api/auth/password-reset", s.requestPasswordReset)
                r.Post("/api/auth/password-reset/confirm", s.confirmPasswordReset)
                // SECT-B2C-SOUSCRIPTION-AUTO : souscription B2C publique (enseignant
                // freelance). Crée auto étab personnel + user ENSEIGNANT + abonnement.
                r.Post("/api/subscriptions/b2c", s.createB2CSubscription)
                // SECT-B2C-PAIEMENT : confirmation de paiement (V1 simulation, V2 CinetPay).
                // Active l'abonnement EN_ATTENTE_PAIEMENT → ACTIF.
                r.Post("/api/subscriptions/b2c/{id}/confirm-payment", s.confirmB2CPayment)
                // ACCESS-ASSISTANCE : mode assistance ADMIN (accès temporaire aux pages RESPONSABLE).
                r.With(authMiddleware, middleware.RequireAuth, middleware.RequireRole("ADMIN")).Post("/api/auth/assistance-mode", s.enterAssistanceMode)
                r.With(authMiddleware, middleware.RequireAuth, middleware.RequireRole("ADMIN")).Post("/api/auth/exit-assistance-mode", s.exitAssistanceMode)
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

        // Landing demo (public — pour la section "Démo interactive" du landing page).
        // Génère un QCM via le provider IA actif en base. Rate-limité par IP.
        r.Post("/api/landing-demo", s.landingDemo)

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
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait créer/modifier/supprimer des
                // établissements). Les GET restent ouverts à tous les rôles authentifiés
                // (RLS filtre les lignes visibles).
                r.Route("/api/etablissements", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listEtablissements)
                        r.Get("/{id}", s.getEtablissement)
                        r.Get("/{id}/annee-courante", s.getCurrentAnnee)
                        r.Get("/{id}/watermark", s.getWatermark)
                        // Mutations : ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Post("/", s.createEtablissement)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Patch("/{id}", s.updateEtablissement)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Delete("/{id}", s.deleteEtablissement)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Post("/upload-logo", s.uploadLogo)
                        // PARAMETRES-FIX-P3 : endpoint dédié pour supprimer le logo.
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Delete("/{id}/logo", s.deleteLogo)
                        // Migration 000017 : gestion de l'année académique courante.
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Post("/{id}/annee-courante", s.setCurrentAnnee)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Patch("/{id}/watermark", s.updateWatermark)
                })

                // /api/etablissement-access
                // ACCES-ETABLISSEMENTS-FIX-AE3 : RequireRole("ADMIN", "RESPONSABLE") pour
                // défense en profondeur (le usecase gère les rôles en interne, mais un
                // ENSEIGNANT/ETUDIANT authentifié ne doit même pas atteindre le usecase).
                r.Route("/api/etablissement-access", func(r chi.Router) {
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ADMIN", "RESPONSABLE"))
                        r.Get("/", s.listAccess)
                        r.Post("/", s.createAccess)
                        r.Get("/check", s.checkAccess)
                        r.Get("/authorized-etablissements", s.authorizedEtablissements)
                        r.Patch("/{id}", s.updateAccess)
                        // ACCES-ETABLISSEMENTS-FIX-AE1 : annulation d'une demande EN_ATTENTE.
                        r.Delete("/{id}", s.deleteAccess)
                })

                // /api/filieres
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait créer/modifier des filières).
                r.Route("/api/filieres", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listFilieres)
                        r.Get("/export", s.exportFilieres)
                        r.Get("/{id}/dependencies", s.getFiliereDependencies)
                        r.Get("/{id}", s.getFiliere)
                        // Mutations : ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Post("/", s.createFiliere)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Patch("/bulk", s.bulkFilieres)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Patch("/{id}", s.updateFiliere)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Delete("/{id}", s.deleteFiliere)
                })

                // /api/unites-enseignement
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait créer/modifier des UE).
                r.Route("/api/unites-enseignement", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listUEs)
                        r.Get("/{id}/dependencies", s.getUEDependencies)
                        r.Get("/{id}", s.getUE)
                        // Mutations : ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Post("/", s.createUE)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Patch("/{id}", s.updateUE)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Delete("/{id}", s.deleteUE)
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
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait créer des années académiques).
                r.Route("/api/annees-academiques", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listAnnees)
                        r.Get("/{id}", s.getAnnee)
                        // Mutations : ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Post("/", s.createAnnee)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Patch("/{id}", s.updateAnnee)
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Delete("/{id}", s.deleteAnnee)
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
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait créer/modifier des épreuves).
                r.Route("/api/epreuves", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listEpreuves)
                        r.Get("/auto-close", s.epreuveAutoClose) // B4-MES-EPREUVES : clôture auto
                        r.Get("/orphelines", s.listOrphanEpreuves) // P2-E3
                        r.Get("/session-speciale", s.listSessionSpeciale) // P2-E3
                        r.Get("/{id}", s.getEpreuve)
                        r.Get("/{id}/questions", s.listEpreuveQuestions)
                        r.Get("/{id}/status", s.getEpreuveStatus) // IA-WORKER-1 : polling statut génération IA
                        // Mutations : ENSEIGNANT + ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/", s.createEpreuve)
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/session-speciale", s.createSessionSpeciale)
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Patch("/{id}", s.updateEpreuve)
                        // CORBEILLE-FIX C1 : RequireRole sur DELETE epreuves (avant : RequireAuth seul).
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Delete("/{id}", s.deleteEpreuve)
                        // AI-CONNECT-1 : génération IA d'épreuves via le backend AIService.
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/generate", s.epreuvesGenerate)
                })

                // /api/questions
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait créer/modifier des questions).
                r.Route("/api/questions", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listQuestions)
                        // QUESTIONS-IA-FIX : test-zai consomme des tokens IA.
                        // Avant : RequireAuth seul → un ETUDIANT pouvait boucler
                        // dessus et faire exploser la facture. Restreint à ADMIN.
                        r.With(middleware.RequireRole("ADMIN")).Get("/test-zai", s.testZaiConnection)                          // P2-Q3
                        r.Get("/{id}", s.getQuestion)
                        // Mutations : ENSEIGNANT + ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/", s.createQuestion)
                        // CORBEILLE-FIX C1+C2 : RequireRole + BatchSoftDelete (avant : hard delete).
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Delete("/", s.batchDeleteQuestions)
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Patch("/{id}", s.updateQuestion)
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/{id}/regenerate", s.regenerateQuestion) // P2-Q2
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

                // /api/messagerie — chat temps réel + IA hybride (Task 6)
                //
                // Conversations : liste, détail, création DIRECT, IA privé.
                // Messages : liste (cursor), envoi, édition, suppression.
                // Participants : liste, mark-as-read, mute.
                // Signalements : réservés RESPONSABLE/ADMIN (sous-groupe RequireRole).
                // SSE stream : /stream pour les events temps réel (message_new, edited,
                // deleted, read, typing). Le hub est in-memory (pas de Redis) — les
                // clients reconnectent automatiquement via EventSource natif.
                r.Route("/api/messagerie", func(r chi.Router) {
                        // Le propriétaire PaaS (ADMIN) n'a pas accès à la messagerie.
                        // MESSAGERIE-ADMIN-BLOCK : middleware dédié pour retourner 403 proprement.
                        r.Use(middleware.RequireAuth)
                        r.Use(middleware.BlockAdmin)
                        // Conversations
                        r.Get("/conversations", s.listConversations)
                        r.Post("/conversations/ia-private", s.getOrCreateIAPrivate)
                        r.Post("/conversations/direct", s.createDirect)
                        r.Get("/conversations/{id}", s.getConversation)
                        // Messages d'une conversation
                        r.Get("/conversations/{id}/messages", s.listMessages)
                        r.Post("/conversations/{id}/messages", s.sendMessage)
                        // Participants / read / mute
                        r.Post("/conversations/{id}/lu", s.markAsRead)
                        r.Patch("/conversations/{id}/mute", s.setMuted)
                        r.Get("/conversations/{id}/participants", s.listParticipants)
                        // Gestion conversation : quitter / vider
                        r.Delete("/conversations/{id}", s.leaveConversation)
                        r.Post("/conversations/{id}/clear", s.clearConversation)
                        // Messages (edit / delete / signaler / hide batch)
                        r.Patch("/messages/{id}", s.editMessage)
                        r.Delete("/messages/{id}", s.deleteMessage)
                        r.Post("/messages/{id}/signaler", s.signalMessage)
                        r.Post("/messages/{id}/reactions", s.toggleReaction)
                        r.Post("/messages/hide", s.hideMessages)
                        // SSE stream temps réel
                        r.Get("/stream", s.messagerieStream)
                        // Presence : liste des userIDs en ligne (polling 10-15s côté frontend)
                        r.Get("/presence", s.presence)
                        // Signalements : réservés RESPONSABLE/ADMIN
                        r.Group(func(r chi.Router) {
                                r.Use(middleware.RequireRole("RESPONSABLE", "ADMIN"))
                                r.Get("/signalements", s.listSignalements)
                                r.Patch("/signalements/{id}", s.resolveSignalement)
                        })
                })

                // /api/documents
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait uploader/supprimer des documents).
                r.Route("/api/documents", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listDocuments)
                        r.Get("/{id}", s.getDocument)
                        r.Get("/{id}/download", s.downloadDocument)
                        // Mutations : ENSEIGNANT + ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/", s.uploadDocument)
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Delete("/", s.batchDeleteDocuments) // BUGFIX (CORBEILLE-1): batch delete
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Delete("/{id}", s.deleteDocument)
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/{id}/analyze", s.analyzeDocument) // P1-D3
                })

                // /api/certificats (verify est publique, définie plus haut)
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait créer/révoquer des certificats).
                r.Route("/api/certificats", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listCertificats)
                        r.Get("/watermark-config", s.getWatermarkConfig)       // P3b
                        r.Get("/{id}", s.getCertificat)
                        // Mutations : ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Patch("/watermark-config", s.updateWatermarkConfig)  // P3b
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Post("/", s.createCertificat)                        // P3c
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Post("/{id}/revoquer", s.revokeCertificat)
                })

                // /api/correction
                // SECURITY-FIX (audit 2025) : RequireRole sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait corriger/noter des copies).
                r.Route("/api/correction", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.listCorrectionSessions)
                        // Mutations : ENSEIGNANT + ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/retourner-batch", s.retournerBatch)
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/{sessionId}/retourner", s.retournerSession)
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/{sessionId}/ai-grade", s.aiGradeSession)            // IA-CORRECTION-1
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Patch("/{sessionId}/ai-grade", s.saveGradeOrFinalize)      // P1b-CORRECTION : save grade + finalize
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Post("/{sessionId}/ai-grade-batch", s.batchAiGrade)        // P1b-CORRECTION : batch IA
                        r.With(middleware.RequireRole("ENSEIGNANT", "ADMIN", "RESPONSABLE")).Patch("/reponses/{reponseId}", s.updateReponse)
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
                        // AUDIO-DELETE-STUDENT : supprime un podcast (ligne DB + objet R2).
                        r.Delete("/audio/{id}", s.deleteAudio)
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
                        // N5 FIX : batch mark-all-read (1 requête au lieu de N).
                        r.Post("/mark-all-read", s.alertesMarkAllRead)
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

                // NOTIFICATIONS-FIX-N7 : RequireRole("ADMIN") sur /admin.
                r.Route("/api/notifications", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.notificationsListReal)
                        // N2 FIX : /me — NotificationAdmin destinées au user courant
                        // (RLS migration 000018 filtre par destinataireId/destinataireRole).
                        r.Get("/me", s.notificationsMeList)
                        r.Patch("/me/{id}", s.notificationsMeMarkRead)
                        // Phase 3 : unified (VIEW), SSE stream, preferences.
                        r.Get("/unified", s.notificationsUnifiedList)
                        r.Get("/stream", s.notificationsStream)
                        r.Get("/preferences", s.notificationsPreferencesGet)
                        r.Patch("/preferences", s.notificationsPreferencesUpdate)
                        // /admin : réservé ADMIN, mutations (POST/PATCH/DELETE).
                        r.With(middleware.RequireRole("ADMIN")).Get("/admin", s.notificationsAdminReal)
                        r.With(middleware.RequireRole("ADMIN")).Post("/admin", s.createNotificationAdmin)
                        r.With(middleware.RequireRole("ADMIN")).Post("/admin/mark-all-read", s.markAllReadAdmin)
                        r.With(middleware.RequireRole("ADMIN")).Patch("/admin/{id}", s.updateNotificationAdmin)
                        r.With(middleware.RequireRole("ADMIN")).Delete("/admin/{id}", s.deleteNotificationAdmin)
                        // NOTIFICATIONS-FIX-N8 : suppression en masse des notifications lues.
                        r.With(middleware.RequireRole("ADMIN")).Delete("/admin", s.deleteAllReadAdmin)
                })

                // ABONNEMENTS-FIX-A4 : RequireRole("ADMIN") sur toutes les routes
                // abonnements/plans/factures (SaaS admin only). Avant : RequireAuth seul,
                // la RLS filtrait mais un ENSEIGNANT/ETUDIANT authentifié pouvait appeler.
                r.Route("/api/abonnements", func(r chi.Router) {
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ADMIN"))
                        r.Get("/", s.abonnementsListReal)
                        // ABONNEMENTS-FIX-A1 : mutations (POST/PATCH/DELETE).
                        r.Post("/", s.createAbonnement)
                        r.Patch("/{id}", s.updateAbonnement)
                        r.Delete("/{id}", s.deleteAbonnement) // résilier (statut → RESILIE)
                        // SECT-ABONNEMENT-SOFT-DELETE : soft delete (deletedAt = NOW()),
                        // seulement si déjà résilié. Masque l'abonnement des listes.
                        r.Delete("/{id}/hard", s.softDeleteAbonnement)
                })

                r.Route("/api/factures", func(r chi.Router) {
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ADMIN"))
                        r.Get("/", s.facturesListReal)
                        // FACTURATION-FIX-F1+F2+F3+F4 : mutations (POST/GET/{id}/PATCH/DELETE).
                        r.Post("/", s.createFacture)
                        r.Get("/{id}", s.getFactureByID)
                        r.Patch("/{id}", s.updateFacture)
                        r.Delete("/{id}", s.cancelFacture)
                })

                r.Route("/api/plans", func(r chi.Router) {
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ADMIN"))
                        r.Get("/", s.plansListReal)
                        // ABONNEMENTS-FIX-A2 : mutations (POST/PATCH).
                        r.Post("/", s.createPlan)
                        r.Patch("/{id}", s.updatePlan)
                })

                // CONFIGURATION-FIX-C4 : RequireRole("ADMIN") + route POST (C2).
                r.Route("/api/platform-settings", func(r chi.Router) {
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ADMIN"))
                        r.Get("/", s.platformSettingsReal)
                        r.Post("/", s.updatePlatformSettings)
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

                // MONITORING-FIX-M7 : RequireRole("ADMIN") sur monitoring + logs.
                r.Route("/api/monitoring", func(r chi.Router) {
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ADMIN"))
                        r.Get("/", s.monitoringEventsReal)
                        // Bug B2 (audit monitoring) : healthcheck réel des services
                        r.Get("/health", s.monitoringHealthCheck)
                        // MONITORING-FIX-M2 : mutations (POST/PATCH/DELETE).
                        r.Post("/", s.createMonitoringEvent)
                        // Action de masse : résoudre/ignorer plusieurs événements en une requête.
                        r.Post("/bulk", s.bulkMonitoringEvents)
                        r.Patch("/{id}", s.resolveMonitoringEvent)
                        r.Delete("/{id}", s.ignoreMonitoringEvent)
                })

                r.Route("/api/logs", func(r chi.Router) {
                        r.Use(middleware.RequireAuth, middleware.RequireRole("ADMIN"))
                        r.Get("/", s.logsListReal)
                })

                // SECURITY-FIX (audit 2025) : RequireRole ADMIN sur les mutations (avant :
                // RequireAuth seul → un ETUDIANT pouvait modifier la whitelist IP).
                r.Route("/api/ip-whitelist", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.ipWhitelistListReal)
                        // Mutations : ADMIN uniquement.
                        r.With(middleware.RequireRole("ADMIN")).Post("/", s.createIpWhitelist)
                        r.With(middleware.RequireRole("ADMIN")).Patch("/{id}", s.updateIpWhitelist)
                        r.With(middleware.RequireRole("ADMIN")).Delete("/{id}", s.deleteIpWhitelist)
                })

                // SECURITY-FIX (audit 2025) : RequireRole ADMIN+RESPONSABLE sur les mutations
                // (avant : RequireAuth seul → un ETUDIANT pouvait modifier les paramètres de sécurité).
                r.Route("/api/security-settings", func(r chi.Router) {
                        r.Use(middleware.RequireAuth)
                        r.Get("/", s.securitySettingsGetReal)
                        r.Get("/etablissement/{id}", s.securitySettingsByEtablissement)    // B5-MES-EPREUVES
                        // Mutations : ADMIN + RESPONSABLE uniquement.
                        r.With(middleware.RequireRole("ADMIN", "RESPONSABLE")).Patch("/etablissement/{id}", s.updateSecuritySettingsByEtablissement)
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
