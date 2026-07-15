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

// checkAndExpire appelle les fonctions SQL expire_b2c_subscriptions +
// expire_b2b_subscriptions + envoie emails.
func (w *ExpireWorker) checkAndExpire(ctx context.Context) {
        // 1. Expirer les abonnements B2C (ACTIF avec dateFin < NOW())
        w.expireB2C(ctx)
        // 2. Expirer les abonnements B2B (ESSAI 14j + ACTIF dateFin < NOW())
        w.expireB2B(ctx)
}

// expireB2C expire les abonnements B2C (étab PERSONNEL).
func (w *ExpireWorker) expireB2C(ctx context.Context) {
        rows, err := w.dbPool.Query(ctx, `
                SELECT o_abonnement_id, o_user_email, o_user_name, o_plan_nom, o_plan_prix, o_date_fin
                FROM expire_b2c_subscriptions()
        `)
        if err != nil {
                w.logger.Error("Expire Worker B2C: SQL failed", "error", err.Error())
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

// b2bExpiredCandidate — un abonnement B2B qui vient d'être expiré.
type b2bExpiredCandidate struct {
        AboID        string
        UserEmail    string
        UserName     string
        EtabNom      string
        PlanNom      string
        ExpireReason string // ESSAI_EXPIRE ou ABONNEMENT_EXPIRE
        DateFin      *time.Time
}

// expireB2B expire les abonnements B2B (ESSAI 14j + ACTIF annuel).
func (w *ExpireWorker) expireB2B(ctx context.Context) {
        rows, err := w.dbPool.Query(ctx, `
                SELECT o_abonnement_id, o_user_email, o_user_name, o_etab_nom,
                       o_plan_nom, o_expire_reason, o_date_fin
                FROM expire_b2b_subscriptions()
        `)
        if err != nil {
                w.logger.Error("Expire Worker B2B: SQL failed", "error", err.Error())
                return
        }
        defer rows.Close()

        var candidates []b2bExpiredCandidate
        for rows.Next() {
                var c b2bExpiredCandidate
                if err := rows.Scan(&c.AboID, &c.UserEmail, &c.UserName, &c.EtabNom,
                        &c.PlanNom, &c.ExpireReason, &c.DateFin); err != nil {
                        w.logger.Error("Expire Worker B2B: scan failed", "error", err.Error())
                        continue
                }
                candidates = append(candidates, c)
        }

        if len(candidates) == 0 {
                return
        }

        w.logger.Info("Expire Worker B2B: subscriptions expired", "count", len(candidates))

        if w.mailer == nil {
                return
        }

        for _, c := range candidates {
                w.sendB2BExpiredEmail(ctx, c)
        }
}

// sendB2BExpiredEmail envoie l'email d'expiration B2B au RESPONSABLE.
func (w *ExpireWorker) sendB2BExpiredEmail(ctx context.Context, c b2bExpiredCandidate) {
        // Pour B2B, on réutilise le template d'expiration B2C (le message est similaire).
        // Le responsable peut contacter l'admin SECT pour renouveler.
        renouvellementURL := w.appBaseURL + "/login"
        loginURL := w.appBaseURL + "/login"

        dateFinStr := ""
        if c.DateFin != nil {
                dateFinStr = c.DateFin.Format("02/01/2006")
        } else {
                dateFinStr = "essai expiré"
        }

        tplData := emailtpl.AbonnementExpiredData{
                EmailData:         emailtpl.DefaultData(c.UserName, w.appBaseURL),
                PlanNom:           c.PlanNom + " — " + c.EtabNom,
                MontantTTC:        "voir facture",
                DateFin:           dateFinStr,
                RenouvellementURL: renouvellementURL,
                DowngradeURL:      loginURL,
                LoginURL:          loginURL,
        }

        subject := "Votre abonnement SECT a expiré — " + c.EtabNom
        if c.ExpireReason == "ESSAI_EXPIRE" {
                subject = "Votre période d'essai SECT est expirée — " + c.EtabNom
        }

        if err := w.mailer.Send(mailer.Email{
                To:      c.UserEmail,
                Subject: subject,
                Body:    emailtpl.AbonnementExpiredText(tplData),
                HTML:    emailtpl.AbonnementExpiredHTML(tplData),
        }); err != nil {
                w.logger.Error("Expire Worker B2B: email send failed",
                        "aboId", c.AboID, "email", c.UserEmail, "error", err.Error())
                return
        }

        w.logger.Info("B2B expiration email sent",
                "aboId", c.AboID, "email", c.UserEmail,
                "etab", c.EtabNom, "reason", c.ExpireReason)
}

// _ évite unused import warning (formatFCFA est dans relance_worker.go)
var _ = fmt.Sprintf
