package worker

// relance_worker.go — Worker périodique d'envoi d'emails de relance J-7.
//
// SECT-FACTURE-EMAIL : vérifie toutes les 6h les abonnements B2C ACTIF dont la
// dateFin est dans les 7 prochains jours, et envoie un email de relance.
// Le flag relanceEnvoyee évite le spam (1 relance par cycle d'abonnement).
//
// Reset du flag : quand l'abonnement est renouvelé (handler /renew), le flag
// est remis à false pour permettre une nouvelle relance au cycle suivant.

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/emailtpl"
	"github.com/udevrard7/sect/backend/internal/mailer"
)

// RelanceWorker envoie des emails de relance pour les abonnements expirant bientôt.
type RelanceWorker struct {
	dbPool    *pgxpool.Pool
	logger    *slog.Logger
	mailer    mailer.Mailer
	appBaseURL string
}

// NewRelanceWorker crée un nouveau worker de relance.
func NewRelanceWorker(dbPool *pgxpool.Pool, logger *slog.Logger, m mailer.Mailer, appBaseURL string) *RelanceWorker {
	return &RelanceWorker{
		dbPool:    dbPool,
		logger:    logger,
		mailer:    m,
		appBaseURL: appBaseURL,
	}
}

// Start lance le worker en goroutine (non-bloquant).
// Vérifie toutes les 6h (évite le spam + charge DB minimale).
func (w *RelanceWorker) Start(ctx context.Context) {
	w.logger.Info("Relance Worker started, checking every 6h...")

	go func() {
		// Premier check immédiat au démarrage (récupère les abonnements qui ont
		// expiré pendant que le serveur était down).
		w.checkAndSend(ctx)

		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("Relance Worker stopping...")
				return
			case <-ticker.C:
				w.checkAndSend(ctx)
			}
		}
	}()
}

// relanceCandidate — un abonnement qui needs relance.
type relanceCandidate struct {
	AboID       string
	UserEmail   string
	UserName    string
	PlanNom     string
	PlanPrix    float64
	Periode     string
	DateFin     time.Time
	JoursRest   int
}

// checkAndSend query la DB et envoie les emails de relance.
func (w *RelanceWorker) checkAndSend(ctx context.Context) {
	if w.mailer == nil {
		return // pas de mailer configuré (dev mode), skip
	}

	// Query : abonnements ACTIF, dateFin dans [now, now+7j], relanceEnvoyee=false
	rows, err := w.dbPool.Query(ctx, `
		SELECT a."id", u."email", u."name", p."nom", p."prixMensuel",
		       COALESCE(a."periodeAbonnement", 'mensuel'), a."dateFin"
		FROM "Abonnement" a
		JOIN "User" u ON u."etablissementId" = a."etablissementId" AND u."role" = 'ENSEIGNANT'
		JOIN "Plan" p ON p."id" = a."planId"
		WHERE a."statut" = 'ACTIF'
		  AND a."dateFin" IS NOT NULL
		  AND a."dateFin" BETWEEN NOW() AND NOW() + INTERVAL '7 days'
		  AND a."relanceEnvoyee" = false
		  AND a."deletedAt" IS NULL
	`)
	if err != nil {
		w.logger.Error("Relance Worker: query failed", "error", err.Error())
		return
	}
	defer rows.Close()

	var candidates []relanceCandidate
	for rows.Next() {
		var c relanceCandidate
		if err := rows.Scan(&c.AboID, &c.UserEmail, &c.UserName, &c.PlanNom,
			&c.PlanPrix, &c.Periode, &c.DateFin); err != nil {
			w.logger.Error("Relance Worker: scan failed", "error", err.Error())
			continue
		}
		c.JoursRest = int(c.DateFin.Sub(time.Now()).Hours() / 24)
		candidates = append(candidates, c)
	}

	if len(candidates) == 0 {
		return // rien à faire
	}

	w.logger.Info("Relance Worker: sending reminders", "count", len(candidates))

	for _, c := range candidates {
		w.sendRelance(ctx, c)
	}
}

// sendRelance envoie l'email de relance à un candidat + marque relanceEnvoyee=true.
func (w *RelanceWorker) sendRelance(ctx context.Context, c relanceCandidate) {
	// Email context avec timeout 30s
	emailCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	renouvellementURL := w.appBaseURL + "/paiement/renouvellement?abo=" + c.AboID
	loginURL := w.appBaseURL + "/login"

	tplData := emailtpl.AbonnementExpirationData{
		EmailData:         emailtpl.DefaultData(c.UserName, w.appBaseURL),
		PlanNom:           c.PlanNom,
		MontantTTC:        formatFCFA(c.PlanPrix),
		Periode:           c.Periode,
		DateFin:           c.DateFin.Format("02/01/2006"),
		JoursRestants:     fmt.Sprintf("%d", c.JoursRest),
		RenouvellementURL: renouvellementURL,
		LoginURL:          loginURL,
	}

	if err := w.mailer.Send(mailer.Email{
		To:      c.UserEmail,
		Subject: "Votre abonnement SECT expire dans " + fmt.Sprintf("%d", c.JoursRest) + " jour(s)",
		Body:    emailtpl.AbonnementExpirationText(tplData),
		HTML:    emailtpl.AbonnementExpirationHTML(tplData),
	}); err != nil {
		w.logger.Error("Relance Worker: email send failed",
			"aboId", c.AboID, "email", c.UserEmail, "error", err.Error())
		return
	}

	// Marquer relanceEnvoyee=true (évite le spam — 1 seule relance par cycle)
	_, err := w.dbPool.Exec(emailCtx, `
		UPDATE "Abonnement" SET "relanceEnvoyee" = true, "updatedAt" = NOW()
		WHERE "id" = $1
	`, c.AboID)
	if err != nil {
		w.logger.Error("Relance Worker: failed to set relanceEnvoyee",
			"aboId", c.AboID, "error", err.Error())
		return
	}

	w.logger.Info("Relance email sent",
		"aboId", c.AboID, "email", c.UserEmail, "joursRestants", c.JoursRest)
}

// formatFCFA formate un montant en FCFA avec séparateur de milliers.
func formatFCFA(amount float64) string {
	intAmount := int64(amount + 0.5)
	s := fmt.Sprintf("%d", intAmount)
	n := len(s)
	if n <= 3 {
		return s + " FCFA"
	}
	result := ""
	for i, ch := range s {
		if i > 0 && (n-i)%3 == 0 {
			result += " "
		}
		result += string(ch)
	}
	return result + " FCFA"
}

// _ évite unused import si appdb n'est pas utilisé directement ici
var _ = appdb.SystemClaims
