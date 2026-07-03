// Package usecase — logique métier Messagerie (chat temps réel + IA hybride).
//
// MessagerieUseCase orchestre le repository Messagerie + le service AI +
// un broadcaster temps réel (SSE hub). Toutes les méthodes publiques reçoivent
// en premier paramètre le context (qui porte les claims RLS posés par le
// middleware Auth) puis les db.SessionClaims extraits du JWT.
//
// Règles de sécurité :
//   - Anti-spoofing : claims.UserID est toujours utilisé comme userID pour les
//     mutations (l'utilisateur ne peut agir qu'en son nom). Le repo renforce
//     ce check via `claims.UserID != userID` au niveau SQL.
//   - RLS : Neon filtre automatiquement les Conversation/Message visibles selon
//     les claims posés par db.WithTx. Si l'utilisateur n'a pas accès, la query
//     renvoie 0 ligne → NotFoundError.
//   - Rôles : ListSignalements/ResolveSignalement réservés RESPONSABLE/ADMIN.
//   - DM : un ETUDIANT ne peut DM que ses enseignants (CanStudentDMEnseignant).
package usecase

import (
        "context"
        "fmt"
        "log/slog"
        "strings"
        "time"

        "github.com/udevrard7/sect/backend/internal/ai"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// ============================================================
// BROADCASTER (interface abstraite pour éviter une dépendance circulaire
// usecase → transport/http. Implémentée par transport/http.MessagerieHub).
// ============================================================

// MessageBroadcaster pousse les events temps réel aux clients connectés
// (SSE ou WebSocket). Nil-safe : si le hub est nil, les broadcasts sont
// silencieusement droppés (utile pour les tests et le bootstrap).
type MessageBroadcaster interface {
        // BroadcastMessage pousse un event "message_new" aux participants donnés.
        BroadcastMessage(participantIDs []string, msg *domain.Message)
        // BroadcastEvent pousse un event générique (typing, read, edit, delete).
        BroadcastEvent(participantIDs []string, eventType string, data any)
}

// ============================================================
// MESSAGERIE USECASE
// ============================================================

// MessagerieUseCase implémente les cas d'usage du module Messagerie.
type MessagerieUseCase struct {
        messagerieRepo domain.MessagerieRepository
        aiService      *ai.AIService
        hub            MessageBroadcaster
}

// NewMessagerieUseCase construit un nouveau MessagerieUseCase.
// hub peut être nil (broadcasts droppés silencieusement).
func NewMessagerieUseCase(repo domain.MessagerieRepository, aiSvc *ai.AIService, hub MessageBroadcaster) *MessagerieUseCase {
        return &MessagerieUseCase{
                messagerieRepo: repo,
                aiService:      aiSvc,
                hub:            hub,
        }
}

// ============================================================
// CONVERSATIONS
// ============================================================

// ListConversations retourne les conversations accessibles à l'utilisateur
// courant (RLS filtre selon le rôle / filière / établissement).
func (uc *MessagerieUseCase) ListConversations(ctx context.Context, claims db.SessionClaims) (*domain.ConversationListResult, error) {
        // BUGFIX (MESSAGERIE-AUTO-SALONS) : EnsureAutoConversations était écrit
        // mais jamais appelé → les salons CLASSE/PROMO/EQUIPE/STAFF n'étaient
        // jamais créés automatiquement. Câblage ici (lazy) : au premier listing
        // de l'utilisateur, on s'assure que ses salons collectifs existent et
        // qu'il y est inscrit. Les salons déjà existants sont juste vérifiés
        // (GetOrCreateAuto est idempotent). Best-effort : si l'auto-création
        // échoue (ex: user sans filière), on log et on continue (ne bloque pas
        // le listing des autres conversations).
        _ = uc.EnsureAutoConversations(ctx, claims)

        return uc.messagerieRepo.ListByUser(ctx, claims.UserID)
}

// GetConversation retourne une conversation par son ID. RLS filtre
// automatiquement : si l'utilisateur n'y a pas accès → NotFoundError.
func (uc *MessagerieUseCase) GetConversation(ctx context.Context, claims db.SessionClaims, id string) (*domain.Conversation, error) {
        if id == "" {
                return nil, &domain.ValidationError{Field: "id", Message: "id requis"}
        }
        return uc.messagerieRepo.GetByID(ctx, id)
}

// GetOrCreateIAPrivate retourne la conversation IA privée de l'utilisateur
// (1 par user). La crée si elle n'existe pas. Helper utilisé par le frontend
// au démarrage de l'onglet "Assistant IA".
func (uc *MessagerieUseCase) GetOrCreateIAPrivate(ctx context.Context, claims db.SessionClaims) (*domain.Conversation, error) {
        return uc.messagerieRepo.GetOrCreateIAPrivate(ctx, claims.UserID)
}

// CreateDirect crée une conversation DIRECT (1-à-1) avec targetUserID.
//
// Règles d'autorisation par rôle :
//   - ETUDIANT    : ne peut DM que ses enseignants (CanStudentDMEnseignant —
//     anti-spam : il faut qu'une épreuve de l'enseignant soit inscrite à son
//     dossier). Sinon → UnauthorizedError.
//   - ENSEIGNANT  : peut DM tout user de son établissement (RLS filtrera).
//   - RESPONSABLE : peut DM tout user de son établissement (RLS filtrera).
//   - ADMIN       : peut DM tout user.
func (uc *MessagerieUseCase) CreateDirect(ctx context.Context, claims db.SessionClaims, targetUserID string, titre *string) (*domain.Conversation, error) {
        if targetUserID == "" {
                return nil, &domain.ValidationError{Field: "targetUserId", Message: "targetUserId requis"}
        }
        if targetUserID == claims.UserID {
                return nil, &domain.ValidationError{Field: "targetUserId", Message: "auto-DM interdit"}
        }
        if claims.EtablissementID == "" {
                return nil, &domain.UnauthorizedError{Message: "établissement manquant dans les claims"}
        }

        role := domain.Role(claims.Role)
        switch role {
        case domain.RoleEtudiant:
                // Anti-spam : l'étudiant ne peut DM que ses enseignants.
                allowed, err := uc.messagerieRepo.CanStudentDMEnseignant(ctx, claims.UserID, targetUserID)
                if err != nil {
                        return nil, err
                }
                if !allowed {
                        return nil, &domain.UnauthorizedError{Message: "vous ne pouvez contacter que vos enseignants"}
                }
        case domain.RoleEnseignant, domain.RoleResponsable, domain.RoleAdmin:
                // RLS Conversation_insert filtrera par établissement.
                // (le repo renforcera createdBy = claims.UserID au niveau SQL)
        default:
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé à créer des conversations DIRECT"}
        }

        return uc.messagerieRepo.CreateDirect(ctx, claims.UserID, targetUserID, titre, claims.EtablissementID)
}

// EnsureAutoConversations crée (de façon idempotente) les salons auto
// accessibles à l'utilisateur. À appeler au login pour pré-populer la sidebar.
//
//   - ETUDIANT    : CLASSE (si filiereId + niveau disponibles) + PROMO
//   - ENSEIGNANT  : EQUIPE + STAFF
//   - RESPONSABLE : EQUIPE + STAFF
//   - ADMIN       : rien (les ADMIN n'ont pas de salon auto dédiqué)
//
// EnsureAutoConversations s'assure que les salons collectifs auxquels
// l'utilisateur a droit existent et qu'il y est inscrit. Appelé
// automatiquement au listConversations (lazy).
//
// BUGFIX (MESSAGERIE-AUTO-SALONS-CLASSE) : avant cette correction, le salon
// CLASSE était skippé car SessionClaims n'a pas de champ Niveau. Désormais on
// charge filiereId + niveau depuis la DB via GetUserFiliereAndNiveau (le JWT
// ne contient pas niveau, on évite de le propager pour ne pas invalider les
// tokens existants).
//
// Étudiant    : PROMO (filière) + CLASSE (filière + niveau)
// Enseignant  : EQUIPE (établissement) + STAFF (établissement)
// Responsable : EQUIPE (établissement) + STAFF (établissement)
// ADMIN       : rien (pas d'établissement rattaché)
//
// Best-effort : les erreurs non critiques sont loggées et ne bloquent pas
// la suite (ex: user sans filière → skip PROMO/CLASSE, pas d'erreur).
func (uc *MessagerieUseCase) EnsureAutoConversations(ctx context.Context, claims db.SessionClaims) error {
        role := domain.Role(claims.Role)
        if claims.EtablissementID == "" {
                return nil // ADMIN global ou user sans étab : pas de salon auto.
        }

        switch role {
        case domain.RoleEtudiant:
                // Charger filiereId + niveau depuis la DB (le JWT n'a pas niveau).
                filiereID, niveau, err := uc.messagerieRepo.GetUserFiliereAndNiveau(ctx, claims.UserID)
                if err != nil {
                        // Log + skip (best-effort : l'étudiant sans filière/niveau n'a
                        // juste pas de salon CLASSE/PROMO, ce n'est pas une erreur fatale).
                        slog.Warn("EnsureAutoConversations: GetUserFiliereAndNiveau failed",
                                "userId", claims.UserID, "error", err)
                        return nil
                }

                if filiereID != "" {
                        fil := filiereID
                        // PROMO : filiereId uniquement.
                        conv, err := uc.messagerieRepo.GetOrCreateAuto(ctx, domain.ConversationTypePromo, claims.EtablissementID, &fil, nil)
                        if err != nil {
                                return fmt.Errorf("EnsureAutoConversations PROMO: %w", err)
                        }
                        // Inscrire l'étudiant au salon PROMO (lazy registration).
                        if conv != nil {
                                if _, err := uc.messagerieRepo.EnsureParticipant(ctx, conv.ID, claims.UserID); err != nil {
                                        slog.Warn("EnsureAutoConversations: EnsureParticipant PROMO failed",
                                                "userId", claims.UserID, "convId", conv.ID, "error", err)
                                }
                        }
                }

                if filiereID != "" && niveau != "" {
                        fil := filiereID
                        niv := niveau
                        // CLASSE : filiereId + niveau ( désormais possible grâce à
                        // GetUserFiliereAndNiveau qui charge niveau depuis la DB).
                        conv, err := uc.messagerieRepo.GetOrCreateAuto(ctx, domain.ConversationTypeClasse, claims.EtablissementID, &fil, &niv)
                        if err != nil {
                                return fmt.Errorf("EnsureAutoConversations CLASSE: %w", err)
                        }
                        // Inscrire l'étudiant au salon CLASSE.
                        if conv != nil {
                                if _, err := uc.messagerieRepo.EnsureParticipant(ctx, conv.ID, claims.UserID); err != nil {
                                        slog.Warn("EnsureAutoConversations: EnsureParticipant CLASSE failed",
                                                "userId", claims.UserID, "convId", conv.ID, "error", err)
                                }
                        }
                }

        case domain.RoleEnseignant, domain.RoleResponsable:
                // EQUIPE pédagogique de l'établissement (enseignants + responsables).
                conv, err := uc.messagerieRepo.GetOrCreateAuto(ctx, domain.ConversationTypeEquipe, claims.EtablissementID, nil, nil)
                if err != nil {
                        return fmt.Errorf("EnsureAutoConversations EQUIPE: %w", err)
                }
                if conv != nil {
                        if _, err := uc.messagerieRepo.EnsureParticipant(ctx, conv.ID, claims.UserID); err != nil {
                                slog.Warn("EnsureAutoConversations: EnsureParticipant EQUIPE failed",
                                        "userId", claims.UserID, "convId", conv.ID, "error", err)
                        }
                }

                // STAFF (responsables + admin de l'établissement uniquement).
                // La policy Conversation_select filtre STAFF à is_responsable()/is_admin(),
                // donc on ne crée/inscrit STAFF que pour le RESPONSABLE (pas l'enseignant).
                if role == domain.RoleResponsable {
                        conv2, err := uc.messagerieRepo.GetOrCreateAuto(ctx, domain.ConversationTypeStaff, claims.EtablissementID, nil, nil)
                        if err != nil {
                                return fmt.Errorf("EnsureAutoConversations STAFF: %w", err)
                        }
                        if conv2 != nil {
                                if _, err := uc.messagerieRepo.EnsureParticipant(ctx, conv2.ID, claims.UserID); err != nil {
                                        slog.Warn("EnsureAutoConversations: EnsureParticipant STAFF failed",
                                                "userId", claims.UserID, "convId", conv2.ID, "error", err)
                                }
                        }
                }
        }
        return nil
}

// ============================================================
// MESSAGES
// ============================================================

// ListMessages retourne les messages d'une conversation (cursor pagination).
// cursor format : "RFC3339Nano|uuid" du dernier message vu (nil = page initiale).
// limit par défaut : 50 (max 200).
func (uc *MessagerieUseCase) ListMessages(ctx context.Context, claims db.SessionClaims, conversationID string, cursor *string, limit int) (*domain.MessageListResult, error) {
        if conversationID == "" {
                return nil, &domain.ValidationError{Field: "conversationId", Message: "conversationId requis"}
        }
        if limit <= 0 || limit > 200 {
                limit = 50
        }
        return uc.messagerieRepo.ListMessages(ctx, conversationID, cursor, limit)
}

// SendMessage poste un message dans une conversation. Le comportement dépend
// du type de conversation et du contenu :
//
//  1. Conversation IA : NE PAS persister le message user (ephemère). Appeler
//     l'AIService avec l'historique récent + le contenu user, puis persister
//     uniquement la réponse IA (IsIA=true, UserID=nil). Broadcaster la réponse
//     IA aux connexions de l'utilisateur. Retourner la réponse IA.
//
//  2. Salon collectif (CLASSE/PROMO/EQUIPE/STAFF/DIRECT) avec mention
//     @assistant : persister le message user normalement, PUIS appeler l'IA et
//     persister sa réponse (ReplyToID = message user). Broadcaster les 2
//     messages aux participants. Retourner le message user.
//
//  3. Sinon : persister le message user + broadcaster aux participants.
//     Retourner le message user.
//
// RLS : EnsureParticipant garantit que l'utilisateur est inscrit avant
// l'insertion (lazy registration pour les salons auto).
func (uc *MessagerieUseCase) SendMessage(ctx context.Context, claims db.SessionClaims, conversationID string, input domain.SendMessageInput) (*domain.Message, error) {
        if conversationID == "" {
                return nil, &domain.ValidationError{Field: "conversationId", Message: "conversationId requis"}
        }
        if strings.TrimSpace(input.Contenu) == "" {
                return nil, &domain.ValidationError{Field: "contenu", Message: "contenu requis"}
        }
        // Le client ne devrait jamais mettre isIA=true lui-même.
        if input.IsIA {
                return nil, &domain.ValidationError{Field: "isIA", Message: "isIA=true interdit côté client"}
        }

        // 1. Lazy registration (auto-conv CLASSE/PROMO/EQUIPE/STAFF).
        if _, err := uc.messagerieRepo.EnsureParticipant(ctx, conversationID, claims.UserID); err != nil {
                return nil, err
        }

        // 2. Récupérer la conversation pour connaître son type.
        conv, err := uc.messagerieRepo.GetByID(ctx, conversationID)
        if err != nil {
                return nil, err
        }

        // 3. Branchement selon le type de conversation.
        if conv.Type == domain.ConversationTypeIA {
                return uc.sendIAMessage(ctx, claims, conversationID, input)
        }

        // Cas 2 + 3 : insérer le message user d'abord.
        userMsg, err := uc.messagerieRepo.CreateMessage(ctx, &domain.Message{
                ConversationID: conversationID,
                UserID:         &claims.UserID,
                IsIA:           false,
                Contenu:        input.Contenu,
                ReplyToID:      input.ReplyToID,
        })
        if err != nil {
                return nil, err
        }

        // Broadcaster le message user aux participants.
        uc.broadcastToParticipants(ctx, conversationID, userMsg)

        // Cas 2 : si @assistant mentionné dans un salon collectif, appeler l'IA en
        // plus et persister sa réponse. Non-bloquant : si l'IA échoue, le message
        // user reste valide (déjà persisté + broadcasté).
        if domain.HasAssistantMention(input.Contenu) {
                uc.generateAIResponseInGroup(ctx, claims, conversationID, userMsg)
        }

        return userMsg, nil
}

// sendIAMessage gère le flux IA conversation : ne pas persister le message
// user, appeler l'IA, persister uniquement la réponse IA.
func (uc *MessagerieUseCase) sendIAMessage(ctx context.Context, claims db.SessionClaims, conversationID string, input domain.SendMessageInput) (*domain.Message, error) {
        if uc.aiService == nil {
                return nil, &domain.UnauthorizedError{Message: "service IA non configuré"}
        }

        // Construire le contexte LLM : system prompt + historique récent + contenu user.
        aiMessages := uc.buildIAContext(ctx, claims, conversationID, input.Contenu)

        result, err := uc.aiService.ChatCompletion(ctx, aiMessages)
        if err != nil {
                slog.Warn("IA ChatCompletion failed (conv IA)", "conversationId", conversationID, "error", err)
                return nil, fmt.Errorf("IA indisponible: %w", err)
        }

        // Persister la réponse IA (UserID=nil, IsIA=true).
        aiMsg, err := uc.messagerieRepo.CreateMessage(ctx, &domain.Message{
                ConversationID: conversationID,
                UserID:         nil,
                IsIA:           true,
                Contenu:        result.Content,
        })
        if err != nil {
                return nil, err
        }

        // Broadcaster la réponse IA aux connexions de l'utilisateur.
        uc.broadcastToParticipants(ctx, conversationID, aiMsg)

        return aiMsg, nil
}

// generateAIResponseInGroup appelle l'IA suite à une mention @assistant dans
// un salon collectif, et persiste la réponse (ReplyToID = userMsg.ID).
// Non-bloquant : si l'IA échoue, on log warn et on return (le message user
// reste valide).
func (uc *MessagerieUseCase) generateAIResponseInGroup(ctx context.Context, claims db.SessionClaims, conversationID string, userMsg *domain.Message) {
        if uc.aiService == nil {
                return
        }

        aiMessages := []ai.ChatMessage{
                {Role: "system", Content: iaGroupAssistantSystemPrompt(claims)},
                {Role: "user", Content: userMsg.Contenu},
        }

        result, err := uc.aiService.ChatCompletion(ctx, aiMessages)
        if err != nil {
                slog.Warn("IA ChatCompletion (@assistant in group) failed", "conversationId", conversationID, "error", err)
                return
        }

        userMsgID := userMsg.ID
        aiMsg, err := uc.messagerieRepo.CreateMessage(ctx, &domain.Message{
                ConversationID: conversationID,
                UserID:         nil,
                IsIA:           true,
                Contenu:        result.Content,
                ReplyToID:      &userMsgID,
        })
        if err != nil {
                slog.Warn("persist IA response (@assistant) failed", "conversationId", conversationID, "error", err)
                return
        }

        uc.broadcastToParticipants(ctx, conversationID, aiMsg)
}

// buildIAContext construit la liste de messages pour l'appel LLM d'une conv IA.
// System prompt + 10 derniers messages (ordre chronologique) + contenu user.
func (uc *MessagerieUseCase) buildIAContext(ctx context.Context, claims db.SessionClaims, conversationID, userContent string) []ai.ChatMessage {
        messages := []ai.ChatMessage{
                {Role: "system", Content: iaPrivateAssistantSystemPrompt(claims)},
        }

        // Récupérer les 10 derniers messages (ListMessages renvoie newest-first).
        result, err := uc.messagerieRepo.ListMessages(ctx, conversationID, nil, 10)
        if err == nil && result != nil {
                // Reverse pour oldest-first (ordre chronologique pour le LLM).
                for i := len(result.Messages) - 1; i >= 0; i-- {
                        m := result.Messages[i]
                        role := "user"
                        if m.IsIA {
                                role = "assistant"
                        }
                        messages = append(messages, ai.ChatMessage{Role: role, Content: m.Contenu})
                }
        }

        messages = append(messages, ai.ChatMessage{Role: "user", Content: userContent})
        return messages
}

// iaPrivateAssistantSystemPrompt retourne le system prompt pour une conv IA
// privée (1-à-1 avec l'assistant).
func iaPrivateAssistantSystemPrompt(claims db.SessionClaims) string {
        parts := []string{
                "Tu es Assistant SECT, un tuteur pédagogique de la plateforme SECT (Système d'Évaluation Casse-Tête).",
                "Tu aides l'utilisateur à comprendre les concepts du cours, à préparer ses examens, et à résoudre des problèmes pédagogiques.",
                "Réponds en français, de façon concise, structurée et bienveillante. Si la question sort du cadre pédagogique, recentre poliment.",
        }
        if claims.Role != "" {
                parts = append(parts, "Rôle de l'utilisateur : "+claims.Role+".")
        }
        if claims.Name != "" {
                parts = append(parts, "Nom de l'utilisateur : "+claims.Name+".")
        }
        return strings.Join(parts, " ")
}

// iaGroupAssistantSystemPrompt retourne le system prompt pour une mention
// @assistant dans un salon collectif.
func iaGroupAssistantSystemPrompt(claims db.SessionClaims) string {
        parts := []string{
                "Tu es Assistant SECT, un tuteur pédagogique. Tu as été mentionné (@assistant) dans un salon de discussion collectif.",
                "Réponds en français, de façon concise et utile, en t'adressant au groupe. Si la question sort du cadre pédagogique, recentre poliment.",
        }
        if claims.Role != "" {
                parts = append(parts, "Rôle de l'utilisateur qui t'a mentionné : "+claims.Role+".")
        }
        return strings.Join(parts, " ")
}

// EditMessage édite le contenu d'un message (auteur uniquement, RLS enforced).
func (uc *MessagerieUseCase) EditMessage(ctx context.Context, claims db.SessionClaims, messageID, newContenu string) (*domain.Message, error) {
        if messageID == "" {
                return nil, &domain.ValidationError{Field: "messageId", Message: "messageId requis"}
        }
        if strings.TrimSpace(newContenu) == "" {
                return nil, &domain.ValidationError{Field: "contenu", Message: "contenu requis"}
        }

        msg, err := uc.messagerieRepo.EditMessage(ctx, messageID, claims.UserID, newContenu)
        if err != nil {
                return nil, err
        }

        // Broadcaster l'event "message_edited" aux participants (permet aux clients
        // de remplacer le message existant dans leur UI au lieu d'en ajouter un nouveau).
        if uc.hub != nil {
                ids := uc.participantIDs(ctx, msg.ConversationID)
                uc.hub.BroadcastEvent(ids, "message_edited", msg)
        }
        return msg, nil
}

// DeleteMessage soft-delete un message (auteur ou modérateur, RLS enforced).
func (uc *MessagerieUseCase) DeleteMessage(ctx context.Context, claims db.SessionClaims, messageID string) error {
        if messageID == "" {
                return &domain.ValidationError{Field: "messageId", Message: "messageId requis"}
        }

        // Récupérer le message avant suppression pour connaître conversationID.
        msg, err := uc.messagerieRepo.GetMessageByID(ctx, messageID)
        if err != nil {
                return err
        }

        if err := uc.messagerieRepo.SoftDeleteMessage(ctx, messageID, claims.UserID); err != nil {
                return err
        }

        // Broadcaster l'event "message_deleted".
        if uc.hub != nil {
                ids := uc.participantIDs(ctx, msg.ConversationID)
                uc.hub.BroadcastEvent(ids, "message_deleted", map[string]string{
                        "messageId":      messageID,
                        "conversationId": msg.ConversationID,
                })
        }
        return nil
}

// ============================================================
// PARTICIPANTS / READ / MUTE
// ============================================================

// MarkAsRead met à jour lastReadAt pour le participant courant.
// lastReadAt par défaut = now() si zéro.
func (uc *MessagerieUseCase) MarkAsRead(ctx context.Context, claims db.SessionClaims, conversationID string, lastReadAt time.Time) error {
        if conversationID == "" {
                return &domain.ValidationError{Field: "conversationId", Message: "conversationId requis"}
        }
        if lastReadAt.IsZero() {
                lastReadAt = time.Now()
        }
        if err := uc.messagerieRepo.MarkAsRead(ctx, conversationID, claims.UserID, lastReadAt); err != nil {
                return err
        }
        // Broadcaster l'event "read" (permet aux autres participants de voir "lu").
        if uc.hub != nil {
                ids := uc.participantIDs(ctx, conversationID)
                uc.hub.BroadcastEvent(ids, "read", map[string]any{
                        "conversationId": conversationID,
                        "userId":         claims.UserID,
                        "lastReadAt":     lastReadAt,
                })
        }
        return nil
}

// SetMuted active/désactive les notifications pour le participant courant.
func (uc *MessagerieUseCase) SetMuted(ctx context.Context, claims db.SessionClaims, conversationID string, muted bool) error {
        if conversationID == "" {
                return &domain.ValidationError{Field: "conversationId", Message: "conversationId requis"}
        }
        return uc.messagerieRepo.SetMuted(ctx, conversationID, claims.UserID, muted)
}

// ListParticipants retourne les participants actifs d'une conversation.
func (uc *MessagerieUseCase) ListParticipants(ctx context.Context, claims db.SessionClaims, conversationID string) ([]*domain.ConversationParticipant, error) {
        if conversationID == "" {
                return nil, &domain.ValidationError{Field: "conversationId", Message: "conversationId requis"}
        }
        return uc.messagerieRepo.ListParticipants(ctx, conversationID)
}

// ListParticipantsWithUsers retourne les participants enrichis avec les infos
// utilisateur (name, email, role). Utilisé par l'UI pour afficher la liste
// des participants + badges online + bouton DM.
func (uc *MessagerieUseCase) ListParticipantsWithUsers(ctx context.Context, claims db.SessionClaims, conversationID string) ([]*domain.ParticipantWithUser, error) {
        if conversationID == "" {
                return nil, &domain.ValidationError{Field: "conversationId", Message: "conversationId requis"}
        }
        return uc.messagerieRepo.ListParticipantsWithUsers(ctx, conversationID)
}

// ============================================================
// SIGNALEMENTS
// ============================================================

// SignalMessage crée un signalement pour un message.
// RLS : le user doit avoir accès au message (sinon GetMessageByID → NotFoundError).
// Duplicate : la contrainte unique (messageId, userId) interdit de signaler 2x
// le même message → ConflictError.
func (uc *MessagerieUseCase) SignalMessage(ctx context.Context, claims db.SessionClaims, messageID string, input domain.SignalMessageInput) (*domain.MessageSignalement, error) {
        if messageID == "" {
                return nil, &domain.ValidationError{Field: "messageId", Message: "messageId requis"}
        }
        if input.Raison == "" {
                return nil, &domain.ValidationError{Field: "raison", Message: "raison requis"}
        }

        // Vérifier que le message existe et est accessible au user (RLS).
        if _, err := uc.messagerieRepo.GetMessageByID(ctx, messageID); err != nil {
                return nil, err
        }

        s := &domain.MessageSignalement{
                MessageID:   messageID,
                UserID:      claims.UserID,
                Raison:      input.Raison,
                Commentaire: input.Commentaire,
        }

        created, err := uc.messagerieRepo.Signal(ctx, s)
        if err != nil {
                // Détection du duplicate (uk_signal_msg_user). L'erreur pgx contient
                // généralement "uk_signal_msg_user" ou "unique constraint".
                msg := err.Error()
                if strings.Contains(msg, "uk_signal_msg_user") || strings.Contains(msg, "unique constraint") || strings.Contains(msg, "duplicate key") {
                        return nil, &domain.ConflictError{Message: "message déjà signalé par cet utilisateur"}
                }
                return nil, err
        }
        return created, nil
}

// ListSignalements liste les signalements de l'établissement courant,
// optionnellement filtrés par statut. Réservé RESPONSABLE/ADMIN.
func (uc *MessagerieUseCase) ListSignalements(ctx context.Context, claims db.SessionClaims, statut *domain.SignalementStatut) ([]*domain.MessageSignalement, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleResponsable && role != domain.RoleAdmin {
                return nil, &domain.UnauthorizedError{Message: "réservé RESPONSABLE et ADMIN"}
        }
        if claims.EtablissementID == "" {
                return nil, &domain.UnauthorizedError{Message: "établissement manquant dans les claims"}
        }
        return uc.messagerieRepo.ListSignalements(ctx, claims.EtablissementID, statut)
}

// ResolveSignalement marque un signalement comme résolu/rejeté.
// Réservé RESPONSABLE/ADMIN. statut doit être RESOLU ou REJETE.
func (uc *MessagerieUseCase) ResolveSignalement(ctx context.Context, claims db.SessionClaims, id string, statut domain.SignalementStatut) (*domain.MessageSignalement, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleResponsable && role != domain.RoleAdmin {
                return nil, &domain.UnauthorizedError{Message: "réservé RESPONSABLE et ADMIN"}
        }
        if id == "" {
                return nil, &domain.ValidationError{Field: "id", Message: "id requis"}
        }
        if statut == "" {
                return nil, &domain.ValidationError{Field: "statut", Message: "statut requis"}
        }
        if statut != domain.SignalementStatutResolu && statut != domain.SignalementStatutRejete && statut != domain.SignalementStatutEnCours {
                return nil, &domain.ValidationError{Field: "statut", Message: "statut doit être EN_COURS, RESOLU ou REJETE"}
        }
        return uc.messagerieRepo.ResolveSignalement(ctx, id, claims.UserID, statut)
}

// ============================================================
// HELPERS (broadcast)
// ============================================================

// broadcastToParticipants fetch les participantIDs et pousse un event
// "message_new" à chacun. No-op si hub est nil.
func (uc *MessagerieUseCase) broadcastToParticipants(ctx context.Context, conversationID string, msg *domain.Message) {
        if uc.hub == nil {
                return
        }
        ids := uc.participantIDs(ctx, conversationID)
        if len(ids) == 0 {
                return
        }
        uc.hub.BroadcastMessage(ids, msg)
}

// participantIDs retourne la liste des userIDs des participants actifs.
// En cas d'erreur, retourne une slice vide (best-effort pour le broadcast).
func (uc *MessagerieUseCase) participantIDs(ctx context.Context, conversationID string) []string {
        participants, err := uc.messagerieRepo.ListParticipants(ctx, conversationID)
        if err != nil {
                slog.Warn("ListParticipants for broadcast failed", "conversationId", conversationID, "error", err)
                return nil
        }
        ids := make([]string, 0, len(participants))
        for _, p := range participants {
                ids = append(ids, p.UserID)
        }
        return ids
}
