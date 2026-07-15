package http

// b2b_facturation.go — Facturation capitation B2B automatique.
//
// SECT-B2B-FACTURATION : quand l'admin active un abonnement B2B (ESSAI → ACTIF),
// on crée automatiquement une facture capitation :
//   montant = max(nbEtudiantsActifs, 50) × 900 FCFA/an
// + envoie un email au RESPONSABLE de l'établissement avec la facture PDF.

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

// createB2BFactureIfApplicable crée la facture B2B si le plan est capitation (B2B).
// Appelé en goroutine après updateAbonnement (ESSAI → ACTIF).
func (s *Server) createB2BFactureIfApplicable(aboID, planID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 1. Vérifier que le plan est B2B (capitation)
	var branche string
	err := appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT COALESCE("branche", '') FROM "Plan" WHERE "id" = $1`, planID).Scan(&branche)
	})
	if err != nil || branche != "B2B" {
		return // Pas B2B, pas de facture capitation
	}

	// 2. Créer la facture via la fonction SQL (idempotente)
	var factureID, factureNumero string
	var montantHT, montantTTC float64
	var nbEtudiants int
	var alreadyExists bool
	err = appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT o_facture_id, o_numero, o_montant_ht, o_montant_ttc, o_nb_etudiants, o_already_exists
			FROM create_b2b_facture($1)
		`, aboID).Scan(&factureID, &factureNumero, &montantHT, &montantTTC, &nbEtudiants, &alreadyExists)
	})
	if err != nil {
		slog.Error("createB2BFacture: SQL failed", "aboId", aboID, "error", err.Error())
		return
	}

	if alreadyExists {
		slog.Info("createB2BFacture: already exists, skip", "aboId", aboID, "factureId", factureID)
		return
	}

	slog.Info("B2B facture créée",
		"aboId", aboID, "factureId", factureID, "numero", factureNumero,
		"montantTTC", montantTTC, "nbEtudiants", nbEtudiants)

	// 3. Envoyer l'email au RESPONSABLE
	if s.mailer == nil {
		return
	}

	var respEmail, respName, etabNom string
	err = appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT u."email", u."name", e."nom"
			FROM "Abonnement" a
			JOIN "Etablissement" e ON e."id" = a."etablissementId"
			JOIN "User" u ON u."etablissementId" = a."etablissementId" AND u."role" = 'RESPONSABLE'
			WHERE a."id" = $1
			LIMIT 1
		`, aboID).Scan(&respEmail, &respName, &etabNom)
	})
	if err != nil {
		slog.Error("createB2BFacture: failed to get responsable", "aboId", aboID, "error", err.Error())
		return
	}

	factureURL := s.appBaseURL + "/api/factures/" + factureID + "/pdf"
	loginURL := s.appBaseURL + "/login"

	// Réutiliser le template facture_paid (déjà créé pour B2C)
	tplData := emailtpl.FacturePaidData{
		EmailData:  emailtpl.DefaultData(respName, s.appBaseURL),
		Numero:     factureNumero,
		PlanNom:    "Institutionnel (B2B)",
		MontantTTC: formatFCFA(montantTTC),
		Periode:    "annuel (capitation)",
		DateDebut:  time.Now().Format("02/01/2006"),
		DateFin:    time.Now().AddDate(1, 0, 0).Format("02/01/2006"),
		FactureURL: factureURL,
		LoginURL:   loginURL,
	}

	if err := s.mailer.Send(mailer.Email{
		To:      respEmail,
		Subject: "Facture SECT — " + etabNom + " — " + factureNumero,
		Body:    emailtpl.FacturePaidText(tplData),
		HTML:    emailtpl.FacturePaidHTML(tplData),
	}); err != nil {
		slog.Error("createB2BFacture: email failed", "aboId", aboID, "email", respEmail, "error", err.Error())
	} else {
		slog.Info("B2B facture email sent",
			"aboId", aboID, "factureId", factureID, "email", respEmail,
			"etablissement", etabNom, "montant", fmt.Sprintf("%.0f FCFA", montantTTC))
	}
}
