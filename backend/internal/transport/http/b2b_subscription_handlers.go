package http

// b2b_subscription_handlers.go — Self-service B2B (inscription établissement)
//
// SECT-B2B-FACTURATION (Priorité 3) : permet à un établissement de s'inscrire
// lui-même sans intervention admin. Crée Établissement + RESPONSABLE + abonnement
// ESSAI (14 jours). L'admin valide ensuite via updateAbonnement (ESSAI → ACTIF).

import (
        "encoding/json"
        "log/slog"
        "net/http"
        "strings"

        "github.com/udevrard7/sect/backend/internal/mailer"
        "golang.org/x/crypto/bcrypt"
)

// b2bSubscriptionRequest — body du POST /api/subscriptions/b2b (PUBLIC).
type b2bSubscriptionRequest struct {
        EtabNom       string `json:"etabNom"`
        EtabType      string `json:"etabType"`
        EtabVille     string `json:"etabVille"`
        EtabPays      string `json:"etabPays"`
        EtabTelephone string `json:"etabTelephone"`
        RespName      string `json:"respName"`
        RespEmail     string `json:"respEmail"`
        RespPassword  string `json:"respPassword"`
        NbEtudiants   int    `json:"nbEtudiants"`
}

// b2bSubscriptionResponse — réponse de succès (201).
type b2bSubscriptionResponse struct {
        User struct {
                ID    string `json:"id"`
                Email string `json:"email"`
                Name  string `json:"name"`
                Role  string `json:"role"`
        } `json:"user"`
        EtablissementID    string `json:"etablissementId"`
        EtablissementNom   string `json:"etablissementNom"`
        AbonnementID       string `json:"abonnementId"`
        AbonnementStatut   string `json:"abonnementStatut"`
        EssaiJours         int    `json:"essaiJours"`
        Message            string `json:"message"`
}

// createB2BSubscription — POST /api/subscriptions/b2b (PUBLIC)
func (s *Server) createB2BSubscription(w http.ResponseWriter, r *http.Request) {
        slog.Info("createB2BSubscription handler called")

        var req b2bSubscriptionRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
                return
        }

        // Validation
        req.EtabNom = strings.TrimSpace(req.EtabNom)
        req.RespName = strings.TrimSpace(req.RespName)
        req.RespEmail = strings.ToLower(strings.TrimSpace(req.RespEmail))
        req.RespPassword = strings.TrimSpace(req.RespPassword)
        req.EtabVille = strings.TrimSpace(req.EtabVille)
        req.EtabTelephone = strings.TrimSpace(req.EtabTelephone)

        if req.EtabNom == "" {
                writeJSONError(w, http.StatusBadRequest, "nom de l'établissement requis")
                return
        }
        if req.RespName == "" {
                writeJSONError(w, http.StatusBadRequest, "nom du responsable requis")
                return
        }
        if !strings.Contains(req.RespEmail, "@") || !strings.Contains(req.RespEmail, ".") {
                writeJSONError(w, http.StatusBadRequest, "email invalide")
                return
        }
        if len(req.RespPassword) < 8 {
                writeJSONError(w, http.StatusBadRequest, "password : minimum 8 caractères")
                return
        }
        if req.NbEtudiants < 50 {
                req.NbEtudiants = 50 // plancher capitation
        }

        // Hasher le mot de passe
        hash, err := bcrypt.GenerateFromPassword([]byte(req.RespPassword), 10)
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "hash password failed")
                return
        }

        // Appeler la fonction SECURITY DEFINER
        var resp b2bSubscriptionResponse
        var verificationToken string
        row := s.dbPool.QueryRow(r.Context(), `
                SELECT o_user_id, o_user_email, o_user_name, o_etablissement_id,
                       o_etablissement_nom, o_abonnement_id, o_abonnement_statut,
                       o_message, o_verification_token
                FROM create_b2b_subscription($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, req.EtabNom, req.EtabType, req.EtabVille, req.EtabPays,
                req.EtabTelephone, req.RespName, req.RespEmail, string(hash), req.NbEtudiants)

        if err := row.Scan(
                &resp.User.ID, &resp.User.Email, &resp.User.Name,
                &resp.EtablissementID, &resp.EtablissementNom,
                &resp.AbonnementID, &resp.AbonnementStatut, &resp.Message, &verificationToken,
        ); err != nil {
                slog.Error("create_b2b_subscription SQL failed", "error", err.Error(), "email", req.RespEmail)
                errMsg := err.Error()
                switch {
                case strings.Contains(errMsg, "EMAIL_EXISTS"):
                        writeJSONError(w, http.StatusConflict, "un compte existe déjà avec cet email")
                case strings.Contains(errMsg, "ETAB_ALREADY_EXISTS"):
                        writeJSONError(w, http.StatusConflict, "un établissement avec ce nom a déjà un essai ou un abonnement actif")
                case strings.Contains(errMsg, "PHONE_ALREADY_USED"):
                        writeJSONError(w, http.StatusConflict, "ce numéro de téléphone est déjà utilisé par un autre établissement")
                default:
                        writeJSONError(w, http.StatusInternalServerError, "erreur interne: "+errMsg)
                }
                return
        }

        resp.User.Role = "RESPONSABLE"

        // SECT-B2B-ANTI-ABUS : envoyer l'email de vérification au RESPONSABLE
        if s.mailer != nil && verificationToken != "" {
                verifyURL := s.appBaseURL + "/b2b/verify?token=" + verificationToken
                _ = s.mailer.Send(mailer.Email{
                        To:      resp.User.Email,
                        Subject: "SECT — Vérifiez votre email pour " + resp.EtablissementNom,
                        Body: "Bonjour " + resp.User.Name + ",\n\n" +
                                "Merci de votre inscription. Veuillez vérifier votre email en cliquant sur le lien suivant :\n" +
                                verifyURL + "\n\n" +
                                "Après vérification, notre équipe validera votre établissement sous 24h.\n\n" +
                                "L'équipe SECT",
                })
        }

        slog.Info("B2B subscription created (pending validation)",
                "etabId", resp.EtablissementID, "etabNom", resp.EtablissementNom,
                "respEmail", resp.User.Email, "aboId", resp.AbonnementID)

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(resp)
}
