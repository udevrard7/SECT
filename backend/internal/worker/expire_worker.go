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
// expire_b2b_subscriptions + expire_student_signup_links + envoie emails.
//
// SECT-REG-LINK-PHASE3-BACKEND-1 : ajout de expireStudentSignupLinks (marque
// actif=false les StudentSignupLinks expirés) + sendStudentSignupLinkReminders
// (envoie un email 24h avant expiration au créateur).
func (w *ExpireWorker) checkAndExpire(ctx context.Context) {
        // 1. Expirer les abonnements B2C (ACTIF avec dateFin < NOW())
        w.expireB2C(ctx)
        // 2. Expirer les abonnements B2B (ESSAI 14j + ACTIF dateFin < NOW())
        w.expireB2B(ctx)
        // 3. SECT-REG-LINK-PHASE3-BACKEND-1 — expirer les StudentSignupLinks (actif=false)
        w.expireStudentSignupLinks(ctx)
        // 4. SECT-REG-LINK-PHASE3-BACKEND-1 — envoyer reminders 24h aux créateurs
        w.sendStudentSignupLinkReminders(ctx)
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

// ════════════════════════════════════════════════════════════════════════════
// SECT-REG-LINK-PHASE3-BACKEND-1 — expiration + reminder StudentSignupLinks
// ════════════════════════════════════════════════════════════════════════════

// signupLinkExpiredCandidate — un StudentSignupLink expiré (retourné par
// expire_student_signup_links()). Actuellement les colonnes ne sont pas
// utilisées (le worker n'envoie pas d'email "votre lien a expiré"), mais
// elles sont disponibles pour une future feature.
type signupLinkExpiredCandidate struct {
        ID            string
        Token         string
        Label         *string
        CreatorEmail  *string
        CreatorName   *string
        EtabNom       *string
        ExpiresAt     time.Time
}

// expireStudentSignupLinks marque actif=false les StudentSignupLinks dont
// expiresAt < NOW(). Appelle la fonction SQL expire_student_signup_links()
// (SECURITY DEFINER — bypass RLS car le worker tourne sans claims utilisateur).
//
// Non bloquant : si la query échoue (DB indispo, fonction inexistante en dev
// avant migration 000081), on log l'erreur et on continue. Les liens seront
// expirés au prochain tick (1h plus tard).
func (w *ExpireWorker) expireStudentSignupLinks(ctx context.Context) {
        rows, err := w.dbPool.Query(ctx, `
                SELECT o_id, o_token, o_label, o_creator_email, o_creator_name, o_etab_nom, o_expires_at
                FROM expire_student_signup_links()
        `)
        if err != nil {
                w.logger.Error("ExpireWorker: expire_student_signup_links query failed", "error", err.Error())
                return
        }
        defer rows.Close()

        count := 0
        for rows.Next() {
                var c signupLinkExpiredCandidate
                if err := rows.Scan(&c.ID, &c.Token, &c.Label, &c.CreatorEmail, &c.CreatorName, &c.EtabNom, &c.ExpiresAt); err != nil {
                        w.logger.Error("ExpireWorker: expire_student_signup_links scan failed", "error", err.Error())
                        continue
                }
                count++
                // Note : pas d'email envoyé ici pour éviter le spam. Le reminder
                // 24h (avant expiration) est envoyé par sendStudentSignupLinkReminders.
        }
        if count > 0 {
                w.logger.Info("ExpireWorker: expired student signup links", "count", count)
        }
}

// signupLinkReminderCandidate — un StudentSignupLink actif expirant dans 24h,
// pour lequel le reminder n'a pas encore été envoyé.
type signupLinkReminderCandidate struct {
        ID        string
        Token     string
        Label     *string
        ExpiresAt time.Time
        UseCount  int
        MaxUses   *int
        Email     string
        Name      string
        EtabNom   string
        EtabType  string
}

// sendStudentSignupLinkReminders envoie un email 24h avant expiration au
// créateur des StudentSignupLinks éligibles.
//
// Critères de sélection (query SQL) :
//   - actif = true
//   - deletedAt IS NULL
//   - expiryReminderSent = false (anti-spam — 1 reminder max par lien)
//   - expiresAt BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
//
// Après envoi (ou tentative), marque expiryReminderSent=true via UPDATE direct
// (pool.Exec — le worker tourne en system-worker, pas de claims RLS).
//
// Non bloquant : si le mailer est nil (dev mode), return immédiat. Si l'envoi
// échoue pour un lien, on log et on continue (le reminder sera réessayé au
// prochain tick tant que expiryReminderSent reste false — mais si l'envoi
// échoue, on marque quand même le flag pour éviter le spam de retries qui
// échoueraient tous).
//
// Délai potentiel : le worker tourne toutes les 1h, donc un reminder peut
// être envoyé jusqu'à 1h après le seuil "24h avant expiration" (acceptable).
// Si le lien a été créé à expiresAt = now + 30j pile, le reminder partira
// à J-23 environ (29j après création). Tolérance OK pour un rappel.
func (w *ExpireWorker) sendStudentSignupLinkReminders(ctx context.Context) {
        if w.mailer == nil {
                return // dev mode, pas d'email
        }

        rows, err := w.dbPool.Query(ctx, `
                SELECT s."id", s."token", s."label", s."expiresAt", s."useCount", s."maxUses",
                       u."email", u."name",
                       e."nom" AS etab_nom, e."type" AS etab_type
                FROM "StudentSignupLink" s
                JOIN "User" u ON u."id" = s."createdById"
                LEFT JOIN "Etablissement" e ON e."id" = s."etablissementId"
                WHERE s."actif" = true
                  AND s."deletedAt" IS NULL
                  AND s."expiryReminderSent" = false
                  AND s."expiresAt" BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
        `)
        if err != nil {
                w.logger.Error("ExpireWorker: signup link reminder query failed", "error", err.Error())
                return
        }
        defer rows.Close()

        var candidates []signupLinkReminderCandidate
        for rows.Next() {
                var c signupLinkReminderCandidate
                if err := rows.Scan(&c.ID, &c.Token, &c.Label, &c.ExpiresAt, &c.UseCount, &c.MaxUses,
                        &c.Email, &c.Name, &c.EtabNom, &c.EtabType); err != nil {
                        w.logger.Error("ExpireWorker: signup link reminder scan failed", "error", err.Error())
                        continue
                }
                candidates = append(candidates, c)
        }
        if len(candidates) == 0 {
                return
        }

        w.logger.Info("ExpireWorker: sending signup link reminders", "count", len(candidates))

        for _, c := range candidates {
                w.sendSignupLinkReminderEmail(ctx, c)
                // Marquer reminder envoyé (anti-spam) — idempotent.
                // NB : on marque même si l'envoi a échoué, pour éviter de retry
                // indéfiniment (un email cassé restera cassé au prochain tick).
                // Si le flag ne peut pas être posé (DB error), on log et on
                // continue — le reminder sera ré-envoyé au prochain tick (acceptable).
                if _, err := w.dbPool.Exec(ctx,
                        `UPDATE "StudentSignupLink" SET "expiryReminderSent" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
                        c.ID); err != nil {
                        w.logger.Error("ExpireWorker: failed to mark reminder sent",
                                "linkId", c.ID, "error", err.Error())
                }
        }
}

// sendSignupLinkReminderEmail envoie un email de reminder 24h au créateur
// d'un StudentSignupLink. Utilise le template StudentSignupLinkReminderHTML.
//
// Non bloquant : si l'envoi échoue, on log et on continue (le flag
// expiryReminderSent sera quand même posé côté caller pour éviter le spam).
func (w *ExpireWorker) sendSignupLinkReminderEmail(ctx context.Context, c signupLinkReminderCandidate) {
        emailCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
        defer cancel()
        _ = emailCtx // ctx de travail (actuellement le template n'utilise pas le ctx)

        label := "Sans libellé"
        if c.Label != nil && *c.Label != "" {
                label = *c.Label
        }
        tplData := emailtpl.StudentSignupLinkReminderData{
                EmailData: emailtpl.DefaultData(c.Name, w.appBaseURL),
                Label:     label,
                ExpiresAt: c.ExpiresAt,
                UseCount:  c.UseCount,
                MaxUses:   c.MaxUses,
                EtabNom:   c.EtabNom,
                EtabType:  c.EtabType,
                LinkURL:   w.appBaseURL + "/etudiants",
        }
        if err := w.mailer.Send(mailer.Email{
                To:      c.Email,
                Subject: "SECT — Votre lien d'inscription expire dans 24h",
                Body:    emailtpl.StudentSignupLinkReminderText(tplData),
                HTML:    emailtpl.StudentSignupLinkReminderHTML(tplData),
        }); err != nil {
                w.logger.Error("ExpireWorker: signup link reminder email failed",
                        "linkId", c.ID, "email", c.Email, "error", err.Error())
        }
}
