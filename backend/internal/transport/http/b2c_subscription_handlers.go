package http

// b2c_subscription_handlers.go — Souscription B2C auto (enseignant freelance)
//
// Endpoints PUBLICS (pas d'auth) :
//   POST /api/subscriptions/b2c              — crée compte + abonnement
//   POST /api/subscriptions/b2c/{id}/confirm-payment — confirme paiement (V1 simulation)
//
// SECT-B2C-PAIEMENT : Prof Premium nécessite un paiement avant activation.
//   - Prof Solo (gratuit) → abonnement ACTIF directement
//   - Prof Premium (payant) → abonnement EN_ATTENTE_PAIEMENT, puis ACTIF après
//     confirmation du paiement via /confirm-payment
//
// V1 : simulation de paiement (page factice "Payer 4 900 FCFA" → succès simulé).
// V2 : intégration GeniusPay (paiement Wave).

import (
        "context"
        "encoding/json"
        "fmt"
        "log/slog"
        "net/http"
        "strings"
        "time"

        "github.com/go-chi/chi/v5"
        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/emailtpl"
        "github.com/udevrard7/sect/backend/internal/mailer"
        "golang.org/x/crypto/bcrypt"
)

// b2cSubscriptionRequest — body du POST /api/subscriptions/b2c (PUBLIC).
type b2cSubscriptionRequest struct {
        PlanID             string `json:"planId"`
        Name               string `json:"name"`
        Email              string `json:"email"`
        Password           string `json:"password"`
        Ville              string `json:"ville,omitempty"`
        PeriodeAbonnement  string `json:"periodeAbonnement,omitempty"` // "mensuel" (défaut) | "auto"
}

// b2cSubscriptionResponse — réponse de succès (201).
type b2cSubscriptionResponse struct {
        User struct {
                ID    string `json:"id"`
                Email string `json:"email"`
                Name  string `json:"name"`
                Role  string `json:"role"`
        } `json:"user"`
        EtablissementID   string  `json:"etablissementId"`
        EtablissementNom  string  `json:"etablissementNom"`
        AbonnementID      string  `json:"abonnementId"`
        AbonnementStatut  string  `json:"abonnementStatut"`
        AbonnementDateFin *string `json:"abonnementDateFin,omitempty"`
        AbonnementMontant float64 `json:"abonnementMontant"`
        PaymentRequired   bool    `json:"paymentRequired"`
        Message           string  `json:"message"`
}

// createB2CSubscription — POST /api/subscriptions/b2c (PUBLIC)
func (s *Server) createB2CSubscription(w http.ResponseWriter, r *http.Request) {
        slog.Info("createB2CSubscription handler called")

        var req b2cSubscriptionRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
                return
        }

        // Validation
        req.PlanID = strings.TrimSpace(req.PlanID)
        req.Name = strings.TrimSpace(req.Name)
        req.Email = strings.ToLower(strings.TrimSpace(req.Email))
        req.Password = strings.TrimSpace(req.Password)
        req.Ville = strings.TrimSpace(req.Ville)
        req.PeriodeAbonnement = strings.TrimSpace(req.PeriodeAbonnement)
        if req.PeriodeAbonnement == "" {
                req.PeriodeAbonnement = "mensuel"
        }
        if req.PeriodeAbonnement != "mensuel" && req.PeriodeAbonnement != "auto" {
                writeJSONError(w, http.StatusBadRequest, "periodeAbonnement invalide (mensuel ou auto)")
                return
        }

        if req.PlanID == "" {
                writeJSONError(w, http.StatusBadRequest, "planId requis")
                return
        }
        if req.Name == "" {
                writeJSONError(w, http.StatusBadRequest, "name requis")
                return
        }
        if !strings.Contains(req.Email, "@") || !strings.Contains(req.Email, ".") {
                writeJSONError(w, http.StatusBadRequest, "email invalide")
                return
        }
        if len(req.Password) < 8 {
                writeJSONError(w, http.StatusBadRequest, "password : minimum 8 caractères")
                return
        }

        // Hasher le mot de passe (bcrypt cost 10).
        hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "hash password failed")
                return
        }

        // Appel à la fonction SECURITY DEFINER create_b2c_subscription (nouvelle
        // signature avec p_periode_abonnement).
        var resp b2cSubscriptionResponse
        var dateFin *time.Time
        row := s.dbPool.QueryRow(r.Context(), `
                SELECT o_user_id, o_user_email, o_user_name, o_user_role,
                       o_etablissement_id, o_etablissement_nom,
                       o_abonnement_id, o_abonnement_statut, o_abonnement_date_fin,
                       o_abonnement_montant, o_payment_required
                FROM create_b2c_subscription($1, $2, $3, $4, $5, $6)
        `, req.PlanID, req.Name, req.Email, string(hash), req.Ville, req.PeriodeAbonnement)

        if err := row.Scan(
                &resp.User.ID, &resp.User.Email, &resp.User.Name, &resp.User.Role,
                &resp.EtablissementID, &resp.EtablissementNom,
                &resp.AbonnementID, &resp.AbonnementStatut, &dateFin,
                &resp.AbonnementMontant, &resp.PaymentRequired,
        ); err != nil {
                slog.Error("create_b2c_subscription SQL failed",
                        "error", err.Error(),
                        "error_type", fmt.Sprintf("%T", err),
                        "planId", req.PlanID,
                        "email", req.Email,
                )
                errMsg := err.Error()
                switch {
                case strings.Contains(errMsg, "PLAN_NOT_FOUND"):
                        writeJSONError(w, http.StatusBadRequest, "plan introuvable")
                case strings.Contains(errMsg, "PLAN_NOT_B2C"):
                        writeJSONError(w, http.StatusBadRequest, "ce plan n'est pas un plan B2C")
                case strings.Contains(errMsg, "EMAIL_EXISTS"):
                        writeJSONError(w, http.StatusConflict, "un compte existe déjà avec cet email. Connectez-vous ou utilisez 'mot de passe oublié'.")
                default:
                        writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                }
                return
        }

        if dateFin != nil {
                df := dateFin.Format(time.RFC3339)
                resp.AbonnementDateFin = &df
        }

        // Message adapté selon le statut
        if resp.PaymentRequired {
                resp.Message = "Compte créé. Finalisez votre paiement pour activer votre abonnement Prof Premium."
        } else {
                resp.Message = "Compte enseignant créé avec succès. Vous pouvez vous connecter."
        }

        // SECT-WELCOME-EMAIL : envoyer l'email de bienvenue (synchrone).
        // Pour Prof Solo : envoyé immédiatement. Pour Prof Premium : envoyé après
        // confirmation du paiement (dans confirmB2CPayment).
        // SYNCHRONE : sur Render free tier, un goroutine peut être tué avant la fin.
        if !resp.PaymentRequired {
                s.sendB2CWelcomeEmail(resp.User.Name, resp.User.Email, req.PlanID, req.PeriodeAbonnement)
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        _ = json.NewEncoder(w).Encode(resp)
}

// sendB2CWelcomeEmail envoie l'email de bienvenue B2C (non bloquant, asynchrone).
func (s *Server) sendB2CWelcomeEmail(userName, userEmail, planID, periodeAbonnement string) {
        if s.mailer == nil {
                return
        }

        // Déterminer le plan + avantages
        var planNom, planPrix string
        var isPremium bool
        var avantages []string

        if planID == "plan_b2c_prof_premium" {
                planNom = "Prof Premium"
                planPrix = "4 900 FCFA/mois"
                isPremium = true
                avantages = []string{
                        "Classes illimitées",
                        "200 étudiants max",
                        "Génération IA illimitée",
                        "Correction IA illimitée",
                        "Export PDF inclus",
                        "Support email prioritaire",
                }
        } else {
                planNom = "Prof Solo"
                planPrix = "Gratuit"
                isPremium = false
                avantages = []string{
                        "2 classes / groupes",
                        "40 étudiants max",
                        "Génération IA : 3 épreuves/mois",
                        "Correction IA : 3 épreuves/mois",
                        "Export PDF inclus",
                }
        }

        tplData := emailtpl.WelcomeB2CData{
                EmailData:   emailtpl.DefaultData(userName, s.appBaseURL),
                PlanNom:     planNom,
                PlanPrix:    planPrix,
                IsPremium:   isPremium,
                LoginURL:    s.appBaseURL + "/login",
                Avantages:   avantages,
        }

        _ = s.mailer.Send(mailer.Email{
                To:      userEmail,
                Subject: "Bienvenue sur SECT — Votre compte est prêt",
                Body:    emailtpl.WelcomeB2CText(tplData),
                HTML:    emailtpl.WelcomeB2CHTML(tplData),
        })
}

// confirmPaymentRequest — body du POST /api/subscriptions/b2c/{id}/confirm-payment.
type confirmPaymentRequest struct {
        MethodePaiement string `json:"methodePaiement"` // "simulation" (V1), "cinetpay" (V2)
}

// confirmPaymentResponse — réponse de succès (200).
type confirmPaymentResponse struct {
        AbonnementID     string  `json:"abonnementId"`
        Statut           string  `json:"statut"`
        DateFin          *string `json:"dateFin,omitempty"`
        ReferenceTransaction string `json:"referenceTransaction"`
        Message          string  `json:"message"`
}

// confirmB2CPayment — POST /api/subscriptions/b2c/{id}/confirm-payment (PUBLIC)
//
// V1 : simulation de paiement. Génère une référence de transaction factice et
// appelle la fonction confirm_b2c_payment pour activer l'abonnement.
//
// V2 (à venir) : cette route recevra le webhook CinetPay (ou sera appelée après
// redirection utilisateur). On validera la transaction via l'API CinetPay avant
// d'activer l'abonnement.
func (s *Server) confirmB2CPayment(w http.ResponseWriter, r *http.Request) {
        aboID := chi.URLParam(r, "id")
        if aboID == "" {
                writeJSONError(w, http.StatusBadRequest, "id abonnement requis")
                return
        }

        var req confirmPaymentRequest
        // Body optionnel pour V1 (simulation). Si vide, methode = "simulation".
        _ = json.NewDecoder(r.Body).Decode(&req)
        methode := strings.TrimSpace(req.MethodePaiement)
        if methode == "" {
                methode = "simulation"
        }

        // V1 : générer une référence de transaction factice.
        // V2 : on recevra la référence de CinetPay et on validera via leur API.
        reference := "SIM_" + strings.ReplaceAll(uuid.New().String(), "-", "")[:16]

        // Appeler la fonction SECURITY DEFINER confirm_b2c_payment.
        var resp confirmPaymentResponse
        var success bool
        var dateFin *time.Time
        row := s.dbPool.QueryRow(r.Context(), `
                SELECT o_success, o_abonnement_id, o_statut, o_date_fin
                FROM confirm_b2c_payment($1, $2, $3)
        `, aboID, methode, reference)

        if err := row.Scan(&success, &resp.AbonnementID, &resp.Statut, &dateFin); err != nil {
                slog.Error("confirm_b2c_payment SQL failed", "error", err.Error(), "aboId", aboID)
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }

        if !success {
                // L'abonnement n'est pas EN_ATTENTE_PAIEMENT (déjà payé, introuvable, etc.)
                if resp.Statut == "NOT_FOUND" {
                        writeJSONError(w, http.StatusNotFound, "abonnement introuvable")
                        return
                }
                writeJSONError(w, http.StatusConflict, "abonnement non en attente de paiement (statut actuel: "+resp.Statut+")")
                return
        }

        if dateFin != nil {
                df := dateFin.Format(time.RFC3339)
                resp.DateFin = &df
        }
        resp.ReferenceTransaction = reference
        resp.Message = "Paiement confirmé. Votre abonnement est maintenant actif."

        slog.Info("B2C payment confirmed",
                "aboId", aboID,
                "methode", methode,
                "reference", reference,
        )

        // SECT-WELCOME-EMAIL : envoyer l'email de bienvenue Premium après paiement.
        // SYNCHRONE (pas de goroutine) : sur Render free tier, un goroutine peut être
        // tué avant la fin de l'envoi. L'appel Resend prend < 1s, c'est acceptable.
        s.sendB2CPremiumWelcomeEmail(aboID)

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        _ = json.NewEncoder(w).Encode(resp)
}

// sendB2CPremiumWelcomeEmail envoie l'email de bienvenue Premium après paiement.
// SYNCHRONE : utilise appdb.WithTx avec claims ADMIN (bypass RLS) + timeout 30s.
func (s *Server) sendB2CPremiumWelcomeEmail(aboID string) {
        if s.mailer == nil {
                return
        }

        // Context avec timeout de 30s.
        ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer cancel()

        // Récupérer l'email + nom du user via l'abonnement.
        // WithTx pose les claims ADMIN → bypass RLS (User_select requiert des claims).
        var userEmail, userName string
        err := appdb.WithTx(ctx, s.dbPool, appdb.SessionClaims{Role: "ADMIN", UserID: "b2c-system"}, func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT u."email", u."name"
                        FROM "Abonnement" a
                        JOIN "User" u ON u."etablissementId" = a."etablissementId"
                        WHERE a."id" = $1 AND u."role" = 'ENSEIGNANT'
                        LIMIT 1
                `, aboID).Scan(&userEmail, &userName)
        })
        if err != nil {
                slog.Error("sendB2CPremiumWelcomeEmail: failed to get user", "aboId", aboID, "error", err.Error())
                return
        }

        tplData := emailtpl.WelcomeB2CData{
                EmailData: emailtpl.DefaultData(userName, s.appBaseURL),
                PlanNom:   "Prof Premium",
                PlanPrix:  "4 900 FCFA/mois",
                IsPremium: true,
                LoginURL:  s.appBaseURL + "/login",
                Avantages: []string{
                        "Classes illimitées",
                        "200 étudiants max",
                        "Génération IA illimitée",
                        "Correction IA illimitée",
                        "Export PDF inclus",
                        "Support email prioritaire",
                },
        }

        if err := s.mailer.Send(mailer.Email{
                To:      userEmail,
                Subject: "Bienvenue sur SECT — Votre compte Premium est actif",
                Body:    emailtpl.WelcomeB2CText(tplData),
                HTML:    emailtpl.WelcomeB2CHTML(tplData),
        }); err != nil {
                slog.Error("sendB2CPremiumWelcomeEmail: failed to send email", "aboId", aboID, "email", userEmail, "error", err.Error())
        } else {
                slog.Info("B2C Premium welcome email sent", "aboId", aboID, "email", userEmail)
        }
}
