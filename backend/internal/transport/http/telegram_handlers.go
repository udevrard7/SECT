// Package http — SECT-NOTIF-TELEGRAM-1 : liaison du compte Telegram
// (remplace le canal Instagram retiré : bot Telegram PARTAGÉ, gratuit).
//
// TROIS routes :
//
//	POST   /api/telegram/webhook  (PUBLIC — appelé par Telegram, sécurisé par
//	                               le header X-Telegram-Bot-Api-Secret-Token)
//	GET    /api/telegram/link     (auth — état + deep-link de connexion)
//	DELETE /api/telegram/link     (auth — déconnexion du canal)
//
// FLUX DE LIAISON (deep-link Telegram — un bot ne peut ÉCRIRE qu'aux chats
// qui l'ont démarré, d'où l'inversion par rapport au handle Instagram :
// l'étudiant ne « déclare » plus son pseudo, il clique et démarre) :
//
//  1. L'étudiant ouvre /profil → carte « Notifications Telegram ».
//  2. GET /api/telegram/link retourne
//     https://t.me/<bot>?start=<code> où <code> = hex(userID).sig(HMAC).
//  3. Le clic ouvre Telegram (app/web) avec le paramètre start pré-rempli ;
//     l'étudiant appuie sur Démarrer.
//  4. Telegram POST l'update sur /api/telegram/webhook : message "/start
//     <code>" → vérification HMAC → UPDATE User.telegramChatId (claims
//     système, policy User_update_system posée par la migration 000142) →
//     message de confirmation envoyé dans le chat.
//  5. Le dispatcher (canal 7) envoie ensuite les annonces pédagogiques à
//     ce chat_id (évaluation disponible, nouveau document, nouvel ouvrage).
//
// Le /start ne peut pas être contrefait : le code est signé par HMAC-SHA256
// (clé dérivée du JWT_SECRET — même durée de vie que les tokens) et un
// chat_id Telegram ne s'obtient qu'en passant réellement par Telegram.
//
// /stop (envoyé DANS Telegram) déconnecte le canal depuis le chat lui-même
// — symétrique du bouton « Déconnecter » de /profil. Un chat_id = un compte
// SECT au plus (index unique partiel 000142) : le message d'erreur guide la
// résolution (envoyer /stop depuis ce Telegram d'abord).
//
// Réponses du webhook : TOUJOURS 200 en cas de traitement (même code
// invalide — le message d'erreur part dans le chat) pour éviter que Telegram
// rejoue indéfiniment l'update ; 401 seulement si le secret est faux (à ce
// stade on ne sait pas à qui répondre — et ce n'est probablement pas
// Telegram), 503 si le canal n'est pas configuré.
package http

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// telegramUpdate — structure minimale d'un update Telegram (seuls les
// champs utiles ; allowed_updates=["message"] côté setWebhook).
type telegramUpdate struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		MessageID int64 `json:"message_id"`
		From      *struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
		} `json:"from"`
		Chat struct {
			ID   int64  `json:"id"`
			Type string `json:"type"` // "private", "group", ...
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
}

// telegramWebhook — POST /api/telegram/webhook (public, appelé par Telegram).
func (s *Server) telegramWebhook(w http.ResponseWriter, r *http.Request) {
	if s.telegramSender == nil || s.telegramWebhookSecret == "" {
		writeJSONError(w, http.StatusServiceUnavailable, "canal Telegram non configuré")
		return
	}
	got := r.Header.Get("X-Telegram-Bot-Api-Secret-Token")
	if subtle.ConstantTimeCompare([]byte(got), []byte(s.telegramWebhookSecret)) != 1 {
		// Secret faux → ce n'est pas Telegram (ou un webhook mal enregistré).
		writeJSONError(w, http.StatusUnauthorized, "secret webhook invalide")
		return
	}

	var upd telegramUpdate
	body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "body illisible")
		return
	}
	if err := json.Unmarshal(body, &upd); err != nil {
		// Telegram ne devrait jamais envoyer du JSON invalide : 400 pour qu'il
		// cesse de rejouer cet update précis.
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	// On ne traite que les messages PRIVÉS (le bot est conçu pour le 1:1 ;
	// un ajout en groupe serait du bruit).
	if upd.Message == nil || upd.Message.Chat.Type != "private" {
		w.WriteHeader(http.StatusOK)
		return
	}

	chatID := strconv.FormatInt(upd.Message.Chat.ID, 10)
	username := ""
	if upd.Message.From != nil {
		username = strings.TrimPrefix(strings.TrimSpace(upd.Message.From.Username), "@")
	}
	text := strings.TrimSpace(upd.Message.Text)

	// Commande + argument : "/start <code>" (le libellé peut aussi être
	// "/start@<botname> <code>" selon le client Telegram).
	fields := strings.Fields(text)
	var cmd, arg string
	if len(fields) > 0 {
		cmd = fields[0]
	}
	if len(fields) > 1 {
		arg = strings.TrimSpace(strings.Join(fields[1:], " "))
	}

	switch {
	case cmd == "/start" || strings.HasPrefix(cmd, "/start@"):
		s.telegramHandleStart(r.Context(), chatID, username, arg)
	case cmd == "/stop" || strings.HasPrefix(cmd, "/stop@"):
		s.telegramHandleStop(r.Context(), chatID)
	default:
		s.telegramReply(r.Context(), chatID, telegramHelpText)
	}

	w.WriteHeader(http.StatusOK)
}

const telegramHelpText = "🤖 Bot SECT — annonces pédagogiques.\n\n" +
	"Pour lier votre compte SECT : ouvrez votre profil SECT → carte « Notifications Telegram » → « Connecter Telegram », puis appuyez sur Démarrer ici.\n\n" +
	"Commandes :\n/start — lier votre compte (avec le lien du profil)\n/stop — déconnecter ce Telegram"

// telegramHandleStart traite « /start <code> » : vérifie le code HMAC puis
// lie le chat Telegram au compte SECT correspondant.
func (s *Server) telegramHandleStart(ctx context.Context, chatID, username, code string) {
	if code == "" {
		s.telegramReply(ctx, chatID,
			"👋 Bienvenue sur le bot SECT !\n\n"+
				"Pour recevoir les annonces ici (évaluations disponibles, nouveaux documents, nouveaux ouvrages), "+
				"cliquez sur « Connecter Telegram » depuis votre profil SECT — le lien qui s'ouvre porte votre code personnel — "+
				"puis revenez appuyer sur Démarrer.")
		return
	}

	userID, ok := s.telegramParseStartCode(code)
	if !ok {
		s.telegramReply(ctx, chatID,
			"⚠️ Code de liaison invalide ou expiré.\n"+
				"Générez un nouveau lien : profil SECT → Notifications Telegram → « Connecter Telegram ».")
		return
	}

	// Liaison sous claims système (policy User_update_system, 000142).
	// Un relink du même compte écrase simplement l'ancien chat (changement
	// de compte Telegram) ; un index unique partiel sur telegramChatId
	// empêche UN Telegram d'être lié à PLUSIEURS comptes SECT.
	var name string
	var usernameValue any // nil = SQL NULL
	if username != "" {
		usernameValue = username
	}
	err := appdb.WithSystemTx(ctx, s.dbPool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
                        UPDATE "User"
                        SET "telegramChatId" = $2, "telegramUsername" = $3, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1
                        RETURNING "name"
                `, userID, chatID, usernameValue).Scan(&name)
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			s.telegramReply(ctx, chatID,
				"⚠️ Ce compte Telegram est déjà lié à un autre compte SECT.\n"+
					"Envoyez d'abord /stop depuis ce Telegram, puis reprenez le lien de votre profil SECT.")
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			s.telegramReply(ctx, chatID,
				"⚠️ Code de liaison invalide ou expiré.\n"+
					"Générez un nouveau lien : profil SECT → Notifications Telegram → « Connecter Telegram ».")
			return
		}
		slog.Warn("telegram webhook: link update failed", "userId", userID, "error", err)
		s.telegramReply(ctx, chatID,
			"⚠️ Liaison impossible pour le moment — réessayez dans quelques minutes.")
		return
	}

	slog.Info("Telegram account linked", "userId", userID, "chatId", chatID, "username", username)
	s.telegramReply(ctx, chatID,
		"✅ Merci "+name+" ! Votre compte SECT est lié à ce Telegram.\n\n"+
			"Vous recevrez ici les annonces pédagogiques : évaluations disponibles, "+
			"nouveaux documents de cours, nouveaux ouvrages de votre filière.\n\n"+
			"Pour arrêter : envoyez /stop.")
}

// telegramHandleStop traite « /stop » : déconnecte le canal pour le chat
// appelant (symétrique du bouton « Déconnecter » de /profil).
func (s *Server) telegramHandleStop(ctx context.Context, chatID string) {
	var name string
	err := appdb.WithSystemTx(ctx, s.dbPool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
                        UPDATE "User"
                        SET "telegramChatId" = NULL, "telegramUsername" = NULL, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "telegramChatId" = $1
                        RETURNING "name"
                `, chatID).Scan(&name)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.telegramReply(ctx, chatID, "Aucun compte SECT n'est lié à ce Telegram.")
			return
		}
		slog.Warn("telegram webhook: stop update failed", "chatId", chatID, "error", err)
		s.telegramReply(ctx, chatID, "⚠️ Déconnexion impossible pour le moment — réessayez dans quelques minutes.")
		return
	}

	slog.Info("Telegram account unlinked", "chatId", chatID, "name", name)
	s.telegramReply(ctx, chatID,
		"✅ Canal Telegram déconnecté"+telegramNameSuffix(name)+
			". Vous ne recevrez plus les annonces SECT ici.\n"+
			"Pour vous reconnecter : profil SECT → Notifications Telegram.")
}

func telegramNameSuffix(name string) string {
	if strings.TrimSpace(name) == "" {
		return ""
	}
	return " (" + strings.TrimSpace(name) + ")"
}

// telegramReply envoie un message dans le chat (best-effort : une erreur
// d'envoi est journalisée, jamais remontée à Telegram en erreur HTTP).
func (s *Server) telegramReply(ctx context.Context, chatID, text string) {
	replyCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := s.telegramSender.SendMessage(replyCtx, chatID, text); err != nil {
		slog.Warn("telegram webhook: reply failed", "chatId", chatID, "error", err)
	}
}

// ──────────────────────────────────────────────────────────────────────
// GET/DELETE /api/telegram/link — profil self-service
// ──────────────────────────────────────────────────────────────────────

// telegramLinkState — réponse de GET /api/telegram/link.
type telegramLinkState struct {
	// Enabled : le canal est configuré côté serveur (bot token + secret).
	// False → la carte profil affiche « canal non configuré ».
	Enabled bool `json:"enabled"`
	// Connected : un chat Telegram est lié à ce compte.
	Connected bool `json:"connected"`
	// Username : handle Telegram lié (affichage uniquement, peut être vide
	// si l'utilisateur Telegram n'a pas de username public).
	Username string `json:"username"`
	// Link : deep-link de connexion (présent si Enabled).
	Link string `json:"link"`
}

// telegramLinkGet — GET /api/telegram/link (auth, tous rôles).
//
// Retourne l'état de liaison + le deep-link personnel
// https://t.me/<bot>?start=<code>. Tolérant à la fenêtre
// déploiement→migration (colonnes 000142 absentes → connected=false).
func (s *Server) telegramLinkGet(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// État en DB (self — RLS User_select id = current_user_id()).
	var chatID, username *string
	dbErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT "telegramChatId", "telegramUsername" FROM "User" WHERE "id" = $1`,
			claims.UserID).Scan(&chatID, &username)
	})
	if dbErr != nil && !errors.Is(dbErr, pgx.ErrNoRows) {
		// Fenêtre déploiement→migration (42703) ou transitoire : la carte
		// affiche « non connecté » — jamais d'erreur front.
		slog.Debug("telegram link state unreadable", "userId", claims.UserID, "error", dbErr)
	}

	state := telegramLinkState{
		Connected: chatID != nil && *chatID != "",
		Username:  derefStr(username),
	}

	if s.telegramSender == nil || s.telegramWebhookSecret == "" {
		// Canal non configuré (ex: token BotFather pas encore posé).
		state.Enabled = false
		s.telegramWriteState(w, state)
		return
	}

	botCtx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	bot, err := s.telegramSender.BotUsername(botCtx)
	if err != nil {
		// Bot injoignable (Telegram indisponible ou token révoqué) : état
		// visible, connexion impossible — pas d'erreur HTTP.
		slog.Warn("telegram link: getMe failed", "error", err)
		state.Enabled = false
		s.telegramWriteState(w, state)
		return
	}

	state.Enabled = true
	state.Link = "https://t.me/" + bot + "?start=" + s.telegramStartCode(claims.UserID)
	s.telegramWriteState(w, state)
}

// telegramLinkDelete — DELETE /api/telegram/link (auth, tous rôles).
// Déconnecte le canal (self — RLS User_update id = current_user_id()).
func (s *Server) telegramLinkDelete(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		ct, err := tx.Exec(r.Context(), `
                        UPDATE "User"
                        SET "telegramChatId" = NULL, "telegramUsername" = NULL, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1
                `, claims.UserID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	})
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	s.telegramWriteState(w, telegramLinkState{Enabled: s.telegramSender != nil && s.telegramWebhookSecret != ""})
}

func (s *Server) telegramWriteState(w http.ResponseWriter, state telegramLinkState) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(state)
}

// ──────────────────────────────────────────────────────────────────────
// Code de liaison deep-link : hex(uuid).sig — 49 chars ≤ 64 (limite du
// paramètre start de t.me). Signé HMAC-SHA256(clé dérivée du JWT_SECRET)
// sur le domaine "telegram-link:<userID>" — invérifiable sans le secret,
// vérification en temps constant.
// ──────────────────────────────────────────────────────────────────────

func (s *Server) telegramStartCode(userID string) string {
	id := strings.ReplaceAll(userID, "-", "")
	mac := hmac.New(sha256.New, []byte(s.telegramLinkKey))
	mac.Write([]byte("telegram-link:"))
	mac.Write([]byte(userID))
	return id + "." + hex.EncodeToString(mac.Sum(nil)[:8])
}

func (s *Server) telegramParseStartCode(code string) (string, bool) {
	parts := strings.SplitN(strings.TrimSpace(code), ".", 2)
	if len(parts) != 2 {
		return "", false
	}
	idHex, sig := parts[0], parts[1]
	if len(idHex) != 32 || len(sig) != 16 {
		return "", false
	}
	b, err := hex.DecodeString(idHex)
	if err != nil || len(b) != 16 {
		return "", false
	}
	userID := fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]), hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]), hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]))

	mac := hmac.New(sha256.New, []byte(s.telegramLinkKey))
	mac.Write([]byte("telegram-link:"))
	mac.Write([]byte(userID))
	expected := hex.EncodeToString(mac.Sum(nil)[:8])
	if subtle.ConstantTimeCompare([]byte(strings.ToLower(sig)), []byte(expected)) != 1 {
		return "", false
	}
	return userID, true
}
