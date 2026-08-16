package http

// facture_email_handlers.go — Création de facture + email à la confirmation de paiement.
//
// SECT-FACTURE-EMAIL : après confirm_b2c_payment (succès), on crée automatiquement
// une facture PAYEE via create_b2c_facture() et on envoie un email au prof B2C
// avec le lien de téléchargement PDF.
//
// Appelé depuis :
//   - handleGeniusPaySuccess (webhook GeniusPay)
//   - getB2CPaymentStatus (polling frontend, cas où l'abo vient d'être activé)

import (
        "context"
        "fmt"
        "log/slog"
        "time"

        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/emailtpl"
        "github.com/udevrard7/sect/backend/internal/mailer"
)

// createAndSendFacture crée la facture pour un abonnement B2C dont le paiement
// vient d'être confirmé, puis envoie l'email de facture au prof.
//
// Idempotente : create_b2c_facture retourne la facture existante si déjà créée.
// L'email n'est envoyé que si la facture vient d'être créée (alreadyExists=false).
//
// SYNCHRONE avec timeout 30s (Render free tier tue les goroutines asynchrones).
func (s *Server) createAndSendFacture(ctx context.Context, aboID string) {
        if s.mailer == nil {
                slog.Warn("createAndSendFacture: no mailer configured, skipping email", "aboId", aboID)
                return
        }

        // 1. Créer la facture via la fonction SQL (idempotente)
        var factureID, factureNumero string
        var montantHT, montantTTC float64
        var alreadyExists bool
        err := appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT o_facture_id, o_numero, o_montant_ht, o_montant_ttc, o_already_exists
                        FROM create_b2c_facture($1)
                `, aboID).Scan(&factureID, &factureNumero, &montantHT, &montantTTC, &alreadyExists)
        })
        if err != nil {
                slog.Error("createAndSendFacture: create_b2c_facture failed", "aboId", aboID, "error", err.Error())
                return
        }

        // Si la facture existait déjà, ne pas renvoyer l'email (idempotence)
        if alreadyExists {
                slog.Info("createAndSendFacture: facture already existed, skipping email", "aboId", aboID, "factureId", factureID)
                return
        }

        slog.Info("Facture B2C créée", "aboId", aboID, "factureId", factureID, "numero", factureNumero, "montantTTC", montantTTC)

        // 2. Récupérer les infos pour l'email (user + plan + dates)
        var userEmail, userName, planNom, periode string
        var dateDebut, dateFin time.Time
        err = appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT u."email", u."name", p."nom",
                               COALESCE(a."periodeAbonnement", 'mensuel'),
                               a."dateDebut", a."dateFin"
                        FROM "Abonnement" a
                        JOIN "User" u ON u."etablissementId" = a."etablissementId" AND u."role" = 'ENSEIGNANT'
                        JOIN "Plan" p ON p."id" = a."planId"
                        WHERE a."id" = $1
                        LIMIT 1
                `, aboID).Scan(&userEmail, &userName, &planNom, &periode, &dateDebut, &dateFin)
        })
        if err != nil {
                slog.Error("createAndSendFacture: failed to get user/plan info", "aboId", aboID, "error", err.Error())
                return
        }

        // 3. Envoyer l'email de facture (synchrone)
        // Note : le mailer Resend a son propre timeout interne, pas besoin de context timeout ici.

        // Lien de téléchargement PDF (route frontend /api/factures/{id}/pdf)
        factureURL := s.appBaseURL + "/api/factures/" + factureID + "/pdf"
        loginURL := s.appBaseURL + "/login"

        tplData := emailtpl.FacturePaidData{
                EmailData:   emailtpl.DefaultData(userName, s.appBaseURL),
                Numero:      factureNumero,
                PlanNom:     planNom,
                MontantTTC:  formatFCFA(montantTTC),
                Periode:     periode,
                DateDebut:   dateDebut.Format("02/01/2006"),
                DateFin:     dateFin.Format("02/01/2006"),
                FactureURL:  factureURL,
                LoginURL:    loginURL,
        }

        if err := s.mailer.Send(mailer.Email{
                To:      userEmail,
                Subject: "Votre facture SECT — " + factureNumero,
                Body:    emailtpl.FacturePaidText(tplData),
                HTML:    emailtpl.FacturePaidHTML(tplData),
        }); err != nil {
                slog.Error("createAndSendFacture: failed to send email", "aboId", aboID, "email", userEmail, "error", err.Error())
        } else {
                slog.Info("Facture email sent", "aboId", aboID, "factureId", factureID, "email", userEmail)
        }
}

// formatFCFA formate un montant en FCFA avec séparateur de milliers.
// Ex: 4900 → "4 900 FCFA"
func formatFCFA(amount float64) string {
        // Arrondir à l'entier le plus proche
        intAmount := int64(amount + 0.5)
        s := fmt.Sprintf("%d", intAmount)
        // Ajouter les espaces comme séparateurs de milliers (depuis la droite)
        n := len(s)
        if n <= 3 {
                return s + " FCFA"
        }
        result := ""
        for i, c := range s {
                if i > 0 && (n-i)%3 == 0 {
                        result += " "
                }
                result += string(c)
        }
        return result + " FCFA"
}
