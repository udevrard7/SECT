package http

// demo_request_handlers.go — Demande de démo B2B (landing page)
//
// Endpoint PUBLIC (pas d'auth) : POST /api/demo-request
// Permet à un prospect institutionnel de demander une démo depuis le landing page.
// Envoie un email à l'admin via ResendMailer avec les infos du prospect.

import (
        "encoding/json"
        "log/slog"
        "net/http"
        "strings"

        "github.com/udevrard7/sect/backend/internal/emailtpl"
        "github.com/udevrard7/sect/backend/internal/mailer"
)

// demoRequestRequest — body du POST /api/demo-request (PUBLIC).
type demoRequestRequest struct {
        Nom              string `json:"nom"`
        Email            string `json:"email"`
        Telephone        string `json:"telephone,omitempty"`
        EtablissementNom string `json:"etablissementNom"`
        Ville            string `json:"ville,omitempty"`
        NbEtudiants      string `json:"nbEtudiants"`
        Message          string `json:"message,omitempty"`
}

// submitDemoRequest — POST /api/demo-request (PUBLIC)
//
// Body : { nom, email, telephone?, etablissementNom, ville?, nbEtudiants, message? }
// Réponse : 200 si l'email a été envoyé, 400 si validation échoue.
// L'email est envoyé à l'admin (support@sect.ftci.fr) via ResendMailer.
func (s *Server) submitDemoRequest(w http.ResponseWriter, r *http.Request) {
        var req demoRequestRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
                return
        }

        // Validation
        req.Nom = strings.TrimSpace(req.Nom)
        req.Email = strings.ToLower(strings.TrimSpace(req.Email))
        req.Telephone = strings.TrimSpace(req.Telephone)
        req.EtablissementNom = strings.TrimSpace(req.EtablissementNom)
        req.Ville = strings.TrimSpace(req.Ville)
        req.NbEtudiants = strings.TrimSpace(req.NbEtudiants)
        req.Message = strings.TrimSpace(req.Message)

        if req.Nom == "" {
                writeJSONError(w, http.StatusBadRequest, "nom requis")
                return
        }
        if !strings.Contains(req.Email, "@") || !strings.Contains(req.Email, ".") {
                writeJSONError(w, http.StatusBadRequest, "email invalide")
                return
        }
        if req.EtablissementNom == "" {
                writeJSONError(w, http.StatusBadRequest, "nom de l'établissement requis")
                return
        }
        if req.NbEtudiants == "" {
                writeJSONError(w, http.StatusBadRequest, "nombre d'étudiants requis")
                return
        }

        // Envoyer l'email à l'admin via ResendMailer.
        tplData := emailtpl.DemoRequestData{
                EmailData:        emailtpl.DefaultData("Équipe SECT", s.appBaseURL),
                Nom:              req.Nom,
                Email:            req.Email,
                Telephone:        req.Telephone,
                EtablissementNom: req.EtablissementNom,
                Ville:            req.Ville,
                NbEtudiants:      req.NbEtudiants,
                Message:          req.Message,
        }

        adminEmail := "ulrichdouh@gmail.com" // admin SECT
        if err := s.mailer.Send(mailer.Email{
                To:      adminEmail,
                Subject: "SECT — Nouvelle demande de démo B2B",
                Body:    emailtpl.DemoRequestText(tplData),
                HTML:    emailtpl.DemoRequestHTML(tplData),
        }); err != nil {
                slog.Error("demo request email failed", "error", err.Error(), "prospect", req.Email)
                writeJSONError(w, http.StatusInternalServerError, "erreur lors de l'envoi de l'email")
                return
        }

        slog.Info("demo request email sent",
                "prospect", req.Email,
                "etablissement", req.EtablissementNom,
                "nbEtudiants", req.NbEtudiants,
        )

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(map[string]string{
                "message": "Votre demande de démo a été envoyée. Notre équipe vous contactera dans les 24h.",
        })
}
