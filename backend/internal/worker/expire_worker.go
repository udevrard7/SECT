package worker

// expire_worker.go — Worker périodique d'expiration des abonnements B2C.
//
// SECT-B2C-EXPIRE : vérifie toutes les 1h les abonnements ACTIF dont la dateFin
// est dépassée, les passe à EXPIRE (bloque l'accès), et envoie un email au prof
// avec 2 options : renouveler OU rétrograder en Prof Solo gratuit.
//
// Le check est côté DB (fonction expire_b2c_subscriptions) pour atomicité.

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/emailtpl"
	"github.com/udevrard7/sect/backend/internal/mailer"
)

// ExpireWorker vérifie périodiquement les abonnements à expirer.
type ExpireWorker struct {
	dbPool    *pgxpool.Pool
	logger    *slog.Logger
	mailer    mailer.Mailer
	appBaseURL string
}

// NewExpireWorker crée un nouveau worker d'expiration.
func NewExpireWorker(dbPool *pgxpool.Pool, logger *slog.Logger, m mailer.Mailer, appBaseURL string) *ExpireWorker {
	return &ExpireWorker{
		dbPool:    dbPool,
		logger:    logger,
		mailer:    m,
		appBaseURL: appBaseURL,
	}
}

// Start lance le worker en goroutine (non-bloquant).
// Vérifie toutes les 1h (plus fréquent que relance car l'expiration doit être rapide).
func (w *ExpireWorker) Start(ctx context.Context) {
	w.logger.Info("Expire Worker started, checking every 1h...")

	go func() {
		// Premier check immédiat au démarrage.
		w.checkAndExpire(ctx)

		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("Expire Worker stopping...")
				return
			case <-ticker.C:
				w.checkAndExpire(ctx)
			}
		}
	}()
}

// expiredCandidate — un abonnement qui vient d'être expiré.
type expiredCandidate struct {
	AboID     string
	UserEmail string
	UserName  string
	PlanNom   string
	PlanPrix  float64
	DateFin   time.Time
}

// checkAndExpire appelle la fonction SQL expire_b2c_subscriptions + envoie emails.
func (w *ExpireWorker) checkAndExpire(ctx context.Context) {
	// 1. Appeler la fonction SQL (atomic : UPDATE + RETURNING)
	rows, err := w.dbPool.Query(ctx, `
		SELECT o_abonnement_id, o_user_email, o_user_name, o_plan_nom, o_plan_prix, o_date_fin
		FROM expire_b2c_subscriptions()
	`)
	if err != nil {
		w.logger.Error("Expire Worker: SQL failed", "error", err.Error())
		return
	}
	defer rows.Close()

	var candidates []expiredCandidate
	for rows.Next() {
		var c expiredCandidate
		if err := rows.Scan(&c.AboID, &c.UserEmail, &c.UserName, &c.PlanNom, &c.PlanPrix, &c.DateFin); err != nil {
			w.logger.Error("Expire Worker: scan failed", "error", err.Error())
			continue
		}
		candidates = append(candidates, c)
	}

	if len(candidates) == 0 {
		return // rien à expirer
	}

	w.logger.Info("Expire Worker: subscriptions expired", "count", len(candidates))

	if w.mailer == nil {
		return // dev mode, pas d'email
	}

	// 2. Envoyer un email à chaque prof expiré
	for _, c := range candidates {
		w.sendExpiredEmail(ctx, c)
	}
}

// sendExpiredEmail envoie l'email "abonnement expiré" avec options renouvellement/downgrade.
func (w *ExpireWorker) sendExpiredEmail(ctx context.Context, c expiredCandidate) {
	renouvellementURL := w.appBaseURL + "/paiement/renouvellement?abo=" + c.AboID
	downgradeURL := w.appBaseURL + "/abonnement-expire?abo=" + c.AboID + "&action=downgrade"
	loginURL := w.appBaseURL + "/login"

	tplData := emailtpl.AbonnementExpiredData{
		EmailData:         emailtpl.DefaultData(c.UserName, w.appBaseURL),
		PlanNom:           c.PlanNom,
		MontantTTC:        formatFCFA(c.PlanPrix),
		DateFin:           c.DateFin.Format("02/01/2006"),
		RenouvellementURL: renouvellementURL,
		DowngradeURL:      downgradeURL,
		LoginURL:          loginURL,
	}

	if err := w.mailer.Send(mailer.Email{
		To:      c.UserEmail,
		Subject: "Votre abonnement SECT a expiré — Renouvelez ou continuez en gratuit",
		Body:    emailtpl.AbonnementExpiredText(tplData),
		HTML:    emailtpl.AbonnementExpiredHTML(tplData),
	}); err != nil {
		w.logger.Error("Expire Worker: email send failed",
			"aboId", c.AboID, "email", c.UserEmail, "error", err.Error())
		return
	}

	w.logger.Info("Expiration email sent",
		"aboId", c.AboID, "email", c.UserEmail, "planNom", c.PlanNom)
}

// _ évite unused import warning (formatFCFA est dans relance_worker.go)
var _ = fmt.Sprintf
