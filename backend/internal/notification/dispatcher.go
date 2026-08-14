// Package notification — dispatcher central pour les notifications in-app,
// web push et email transactionnel.
//
// SECT-NOTIF-DISPATCHER-1 : ce package est LE point d'entrée unique pour tous
// les modules métier qui veulent notifier un utilisateur. Il encapsule les
// 4 canaux de delivery :
//
//  1. In-app (persisté) : INSERT dans NotificationAdmin (table existante,
//     consultée par le bell + la page notifications via /api/notifications/me).
//  2. Temps réel : Broadcast SSE via globalNotificationHub (hub existant dans
//     transport/http/notification_hub.go). Le bell reçoit l'événement instantanément.
//  3. Web push PWA : si l'utilisateur a une PushSubscription active ET sa
//     préférence pushEnabled=true pour la catégorie. Nécessite VAPID configuré
//     (SECT-NOTIF-VAPID-1). Non bloquant si VAPID absent.
//  4. Email transactionnel : si la préférence emailEnabled=true pour la
//     catégorie ET un mailer configuré. Non bloquant.
//
// L'API est volontairement simple : `dispatcher.Dispatch(ctx, event)`. Les
// modules métier n'ont pas à connaître les canaux — le dispatcher lit les
// préférences utilisateur et décide quoi envoyer.
//
// Toutes les erreurs sont non-bloquantes : si l'INSERT DB échoue, on log + on
// tente quand même le SSE (best-effort). Si le push échoue, on log + on
// continue. La mutation métier (ex: publication d'affectation) ne doit JAMAIS
// échouer à cause d'une notification.
package notification

import (
        "context"
        "encoding/json"
        "fmt"
        "log/slog"
        "time"

        webpush "github.com/SherClockHolmes/webpush-go"
        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"

        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/mailer"
)

// Event représente une notification à dispatcher.
//
// Les champs mappent 1:1 la table NotificationAdmin (pour le canal in-app
// persisté) + le payload SSE (pour le temps réel).
//
// UserID est le destinataire (toujours un user spécifique — pas de broadcast
// global pour l'instant). Si vous voulez notifier un rôle entier (ex: tous
// les RESPONSABLES), créez un Event par utilisateur.
type Event struct {
        // Destinataire (requis).
        UserID string

        // Contenu (requis).
        Type    string // "AFFECTATION_PUBLISHED", "CLOTURE_DECISION", "RESULTAT_PUBLIE"…
        Titre   string
        Message string

        // Classification (optionnel, défaut "info" / "general").
        Categorie string // "pedagogique", "evaluation", "admin", "messagerie"…
        Priorite  string // "info", "success", "warning", "error"

        // Action (optionnel) — un bouton dans le bell qui ouvre une URL.
        ActionURL   string // "/mes-enseignants", "/mes-resultats"…
        ActionLabel string // "Voir", "Consulter"…

        // Icône (optionnel) — nom lucide-react (ex: "GraduationCap", "Send").
        Icone string

        // Scoping (optionnel) — pour la RLS NotificationUnified (filiere/épreuve).
        FiliereID string
        EpreuveID string

        // Expiration (optionnel) — la notif disparaît du bell après cette date.
        ExpiresAt *time.Time

        // Email (optionnel) — si fourni + emailEnabled, un email est envoyé.
        // Si non fourni, seul le canal in-app + push sont utilisés.
        Email *EmailContent
}

// EmailContent est le payload email (optionnel) attaché à un Event.
type EmailContent struct {
        Subject string
        Body    string // texte
        HTML    string // HTML optionnel
}

// Dispatcher est le service central de notification. Thread-safe (pool pgx
// est thread-safe, slog aussi). Doit être instancié une fois au démarrage
// (main.go) et passé aux usecases/handlers qui en ont besoin.
type Dispatcher struct {
        pool   *pgxpool.Pool
        mailer mailer.Mailer // peut être nil (LogMailer par défaut)
        logger *slog.Logger

        // SECT-NOTIF-VAPID-1 : clés VAPID pour web push. Vides = push désactivé.
        vapidPublicKey  string
        vapidPrivateKey string
        vapidSubject    string

        // FCM mobile push (canal 5). nil = FCM désactivé (dev mode).
        fcmSender *FCMSender

        // broadcastSSE est une fonction injectée (pour éviter une dépendance
        // circulaire avec transport/http). Elle est wirée dans main.go après
        // création du hub. nil = pas de SSE (tests unitaires).
        broadcastSSE func(userID string, event SSEEvent)
}

// SSEEvent est le payload poussé via SSE au bell. Miroir de
// transport/http.NotificationEvent mais sans dépendance circulaire.
type SSEEvent struct {
        Type      string          `json:"type"`      // "notification"
        Data      json.RawMessage `json:"data"`      // notification JSON
        Timestamp string          `json:"timestamp"` // RFC3339
}

// New crée un nouveau Dispatcher.
//
// mailer peut être nil (pas d'email). broadcastSSE peut être nil (pas de SSE,
// utile en tests). Le pool est requis (pour l'INSERT NotificationAdmin).
// vapidPublicKey/vapidPrivateKey vides = push désactivé (dev mode).
// fcmSender peut être nil (FCM désactivé, dev mode).
func New(pool *pgxpool.Pool, m mailer.Mailer, logger *slog.Logger, broadcastSSE func(userID string, event SSEEvent), vapidPublicKey, vapidPrivateKey, vapidSubject string, fcmSender *FCMSender) *Dispatcher {
        if logger == nil {
                logger = slog.Default()
        }
        return &Dispatcher{
                pool:            pool,
                mailer:          m,
                logger:          logger,
                broadcastSSE:    broadcastSSE,
                vapidPublicKey:  vapidPublicKey,
                vapidPrivateKey: vapidPrivateKey,
                vapidSubject:    vapidSubject,
                fcmSender:       fcmSender,
        }
}

// Dispatch envoie un Event via les canaux appropriés (in-app + SSE + push +
// email). Non-bloquant : si un canal échoue, on log et on continue. La
// mutation métier appelante ne doit jamais échouer à cause de Dispatch.
//
// Étapes :
//  1. INSERT NotificationAdmin (persisté, pour le bell + historique).
//  2. Broadcast SSE (temps réel, si broadcastSSE fourni).
//  3. Lecture préférences (pushEnabled / emailEnabled) — non bloquant si absent.
//  4. Web push (si PushSubscription active + pushEnabled) — SECT-NOTIF-VAPID-1.
//  5. Email (si Email fourni + emailEnabled + mailer configuré).
func (d *Dispatcher) Dispatch(ctx context.Context, event Event) {
        if d == nil {
                return // Dispatcher nil = no-op (tests unitaires sans infra)
        }
        if event.UserID == "" {
                d.logger.Warn("notification.Dispatcher: UserID vide, skip")
                return
        }

        // Defaults
        if event.Type == "" {
                event.Type = "GENERIC"
        }
        if event.Categorie == "" {
                event.Categorie = "general"
        }
        if event.Priorite == "" {
                event.Priorite = "info"
        }

        // 1. INSERT NotificationAdmin (avec SystemClaims — bypass RLS, le dispatcher
        // est un service système qui écrit pour le compte des modules métier).
        notifID := uuid.NewString()
        var actionURL, actionLabel, icone, expiresAt any
        if event.ActionURL != "" {
                actionURL = event.ActionURL
        }
        if event.ActionLabel != "" {
                actionLabel = event.ActionLabel
        }
        if event.Icone != "" {
                icone = event.Icone
        }
        if event.ExpiresAt != nil {
                expiresAt = *event.ExpiresAt
        }

        // Payload SSE (on le construit avant l'INSERT pour pouvoir le broadcaster
        // même si l'INSERT échoue — best-effort).
        ssePayload := map[string]any{
                "id":          notifID,
                "type":        event.Type,
                "titre":       event.Titre,
                "message":     event.Message,
                "categorie":   event.Categorie,
                "priorite":    event.Priorite,
                "actionUrl":   event.ActionURL,
                "actionLabel": event.ActionLabel,
                "icone":       event.Icone,
                "unreadCount": -1, // -1 = le bell doit refetch le compte (on ne le calcule pas ici)
                "createdAt":   time.Now().UTC().Format(time.RFC3339),
        }

        // SECT-NOTIF-E2E-VERIFY-1 fix : utiliser context.Background() au lieu du ctx
        // HTTP — une fois la réponse envoyée, le contexte HTTP est annulé et le
        // COMMIT peut échouer silencieusement. Le dispatcher doit vivre sa propre
        // vie (fire-and-forget).
        insertCtx := context.Background()
        insertErr := db.WithTx(insertCtx, d.pool, db.SystemClaims(), func(tx pgx.Tx) error {
                _, err := tx.Exec(insertCtx, `
                        INSERT INTO "NotificationAdmin"
                                ("id", "type", "titre", "message", "destinataireId", "destinataireRole",
                                 "lu", "actionUrl", "actionLabel", "priorite", "categorie", "icone",
                                 "expireLe", "createdAt")
                        VALUES ($1, $2, $3, $4, $5, NULL, false, $6, $7, $8, $9, $10, $11, NOW())`,
                        notifID, event.Type, event.Titre, event.Message, event.UserID,
                        actionURL, actionLabel, event.Priorite, event.Categorie, icone, expiresAt)
                return err
        })
        if insertErr != nil {
                d.logger.Error("notification.Dispatcher: INSERT NotificationAdmin failed (continuing with SSE)",
                        "userId", event.UserID, "type", event.Type, "error", insertErr)
                // On continue quand même — le SSE est indépendant
        }

        // 2. Broadcast SSE (temps réel)
        if d.broadcastSSE != nil {
                data, _ := json.Marshal(ssePayload)
                d.broadcastSSE(event.UserID, SSEEvent{
                        Type:      "notification",
                        Data:      data,
                        Timestamp: time.Now().UTC().Format(time.RFC3339),
                })
        }

        // 3. Lecture préférences (non bloquant — défaut push+email si absent)
        pref := d.fetchPreferences(ctx, event.UserID, event.Categorie)

        // 4. Web push (SECT-NOTIF-VAPID-1 — hook pour plus tard)
        if pref.pushEnabled {
                d.sendPush(ctx, event.UserID, ssePayload)
        }

        // 5. Email
        if pref.emailEnabled && event.Email != nil && d.mailer != nil {
                d.sendEmail(event.UserID, *event.Email)
        }

        // 6. FCM mobile push (Android + iOS) — if FCMSender configured
        if d.fcmSender != nil {
                d.fcmSender.SendToUser(ctx, event.UserID, ssePayload)
        }
}

// preferenceResult contient les préférences pour une catégorie.
type preferenceResult struct {
        pushEnabled  bool
        emailEnabled bool
}

// fetchPreferences lit NotificationPreference pour (userId, categorie).
// Si aucune ligne n'existe, retourne les défauts (push=true, email=true).
// Non bloquant : si la lecture échoue, retourne les défauts.
func (d *Dispatcher) fetchPreferences(ctx context.Context, userID, categorie string) preferenceResult {
        def := preferenceResult{pushEnabled: true, emailEnabled: true}
        var push, email bool
        err := d.pool.QueryRow(ctx, `
                SELECT "pushEnabled", "emailEnabled"
                FROM "NotificationPreference"
                WHERE "userId" = $1 AND "categorie" = $2`, userID, categorie).Scan(&push, &email)
        if err != nil {
                // Pas de ligne (ou erreur) → défauts
                return def
        }
        return preferenceResult{pushEnabled: push, emailEnabled: email}
}

// sendPush envoie une notification web push à l'utilisateur via les
// PushSubscription actives. Utilise la librairie webpush-go avec les clés
// VAPID. Non bloquant : si VAPID non configuré ou pas de subscription, log + skip.
//
// SECT-NOTIF-VAPID-1.
func (d *Dispatcher) sendPush(ctx context.Context, userID string, payload map[string]any) {
        if d.vapidPrivateKey == "" || d.vapidPublicKey == "" {
                // VAPID non configuré — push désactivé (dev mode).
                return
        }

        // Récupérer les PushSubscription actives pour cet utilisateur.
        rows, err := d.pool.Query(ctx,
                `SELECT "endpoint", "p256dh", "auth" FROM "PushSubscription" WHERE "userId" = $1`,
                userID)
        if err != nil {
                d.logger.Warn("notification.sendPush: query subscriptions failed",
                        "userId", userID, "error", err)
                return
        }
        defer rows.Close()

        // Sérialiser le payload en JSON compact.
        payloadBytes, err := json.Marshal(payload)
        if err != nil {
                return
        }

        subCount := 0
        for rows.Next() {
                var endpoint, p256dh, auth string
                if err := rows.Scan(&endpoint, &p256dh, &auth); err != nil {
                        continue
                }

                sub := webpush.Subscription{
                        Endpoint: endpoint,
                        Keys: webpush.Keys{
                                P256dh: p256dh,
                                Auth:   auth,
                        },
                }

                // Envoyer le push (timeout 10s par subscription).
                resp, err := webpush.SendNotificationWithContext(ctx, payloadBytes, &sub, &webpush.Options{
                        VAPIDPublicKey:  d.vapidPublicKey,
                        VAPIDPrivateKey: d.vapidPrivateKey,
                        Subscriber:      d.vapidSubject,
                        TTL:             30, // 30 secondes (notifications temps réel)
                })
                if err != nil {
                        d.logger.Warn("notification.sendPush: send failed",
                                "userId", userID, "endpoint", endpoint[:30], "error", err)
                        continue
                }
                if resp != nil {
                        resp.Body.Close()
                }
                subCount++
        }

        if subCount > 0 {
                d.logger.Debug("notification.sendPush: sent",
                        "userId", userID, "subscriptions", subCount, "type", payload["type"])
        }
}

// sendEmail envoie un email via le mailer. Non bloquant.
func (d *Dispatcher) sendEmail(userID string, email EmailContent) {
        // Récupérer l'email du user
        var to string
        err := d.pool.QueryRow(context.Background(),
                `SELECT email FROM "User" WHERE id = $1`, userID).Scan(&to)
        if err != nil {
                d.logger.Warn("notification.Dispatcher: sendEmail user email not found",
                        "userId", userID, "error", err)
                return
        }
        if to == "" {
                return
        }

        go func() {
                if err := d.mailer.Send(mailer.Email{
                        To:      to,
                        Subject: email.Subject,
                        Body:    email.Body,
                        HTML:    email.HTML,
                }); err != nil {
                        d.logger.Warn("notification.Dispatcher: email send failed",
                                "userId", userID, "to", to, "subject", email.Subject, "error", err)
                }
        }()
}

// FormatRFC3339 helper pour les timestamps (utilisé par les callers).
func FormatRFC3339(t time.Time) string { return t.UTC().Format(time.RFC3339) }

// Error wrapper (au cas où un caller veut vérifier le type d'erreur).
type DispatchError struct {
        Reason string
}

func (e *DispatchError) Error() string { return fmt.Sprintf("dispatch: %s", e.Reason) }
