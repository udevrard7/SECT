// Package domain — entités Messagerie (Conversation, Message, Participant, etc.)
//
// Module Messagerie unifié (chat temps réel par rôle + IA hybride).
// Migration DB : 000037_create_messagerie.up.sql
package domain

import (
        "context"
        "encoding/json"
        "time"
)

// ============================================================
// ENUMS
// ============================================================

// ConversationType — type de salon de discussion.
type ConversationType string

const (
        ConversationTypeIA     ConversationType = "IA"     // 1-à-1 privé avec l'assistant IA
        ConversationTypeClasse ConversationType = "CLASSE" // groupe filière + niveau
        ConversationTypePromo  ConversationType = "PROMO"  // groupe filière (tous niveaux)
        ConversationTypeEquipe ConversationType = "EQUIPE" // enseignants + responsable d'un établissement
        ConversationTypeStaff  ConversationType = "STAFF"  // responsables + admin d'un établissement
        ConversationTypeDirect ConversationType = "DIRECT" // 1-à-1 entre 2 users
)

// IsValidConversationType vérifie qu'un type est valide.
func IsValidConversationType(t string) bool {
        switch ConversationType(t) {
        case ConversationTypeIA, ConversationTypeClasse, ConversationTypePromo,
                ConversationTypeEquipe, ConversationTypeStaff, ConversationTypeDirect:
                return true
        }
        return false
}

// MessageAttachmentType — type de pièce jointe.
type MessageAttachmentType string

const (
        AttachmentTypeImage MessageAttachmentType = "IMAGE"
        AttachmentTypeFile  MessageAttachmentType = "FILE"
        AttachmentTypeAudio MessageAttachmentType = "AUDIO"
)

// SignalementRaison — raison du signalement d'un message.
type SignalementRaison string

const (
        SignalementRaisonHarcelement       SignalementRaison = "HARCELEMENT"
        SignalementRaisonSpam              SignalementRaison = "SPAM"
        SignalementRaisonContenuInappropr SignalementRaison = "CONTENU_INAPPROPRIE"
        SignalementRaisonAutre             SignalementRaison = "AUTRE"
)

// SignalementStatut — statut de traitement d'un signalement.
type SignalementStatut string

const (
        SignalementStatutOuvert   SignalementStatut = "OUVERT"
        SignalementStatutEnCours  SignalementStatut = "EN_COURS"
        SignalementStatutResolu   SignalementStatut = "RESOLU"
        SignalementStatutRejete   SignalementStatut = "REJETE"
)

// ============================================================
// ENTITIES
// ============================================================

// Conversation — salon de discussion (IA, classe, promo, équipe, staff, direct).
type Conversation struct {
        ID              string            `json:"id"`
        Type            ConversationType  `json:"type"`
        Titre           *string           `json:"titre,omitempty"`
        EtablissementID *string           `json:"etablissementId,omitempty"`
        FiliereID       *string           `json:"filiereId,omitempty"`
        Niveau          *string           `json:"niveau,omitempty"`
        CreatedBy       string            `json:"createdBy"`
        CreatedAt       time.Time         `json:"createdAt"`
        UpdatedAt       time.Time         `json:"updatedAt"`
        DeletedAt       *time.Time        `json:"deletedAt,omitempty"`
}

// ConversationParticipant — participation d'un user à une conversation
// (tracking lastReadAt pour indicateur non-lu + muted).
type ConversationParticipant struct {
        ID             string     `json:"id"`
        ConversationID string     `json:"conversationId"`
        UserID         string     `json:"userId"`
        LastReadAt     *time.Time `json:"lastReadAt,omitempty"`
        Muted          bool       `json:"muted"`
        JoinedAt       time.Time  `json:"joinedAt"`
        LeftAt         *time.Time `json:"leftAt,omitempty"`
}

// ParticipantWithUser — participant enrichi avec les infos utilisateur
// (pour l'affichage de la liste des participants dans l'UI messagerie).
type ParticipantWithUser struct {
        ConversationParticipant
        User *MessageUserRef `json:"user,omitempty"`
}

// Message — message posté dans une conversation (user ou IA).
type Message struct {
        ID             string     `json:"id"`
        ConversationID string     `json:"conversationId"`
        UserID         *string    `json:"userId,omitempty"` // NULL si message IA
        IsIA           bool       `json:"isIA"`
        Contenu        string     `json:"contenu"`
        ContenuHTML    *string    `json:"contenuHtml,omitempty"`
        ReplyToID      *string    `json:"replyToId,omitempty"`
        EditedAt       *time.Time `json:"editedAt,omitempty"`
        DeletedAt      *time.Time `json:"deletedAt,omitempty"`
        CreatedAt      time.Time  `json:"createdAt"`

        // Champs joints (peuplés par le repo pour le frontend)
        User         *MessageUserRef      `json:"user,omitempty"`
        ReplyTo      *MessageRef          `json:"replyTo,omitempty"`
        Attachments  []MessageAttachment  `json:"attachments,omitempty"`
        // Niveau 2 — réactions émojis agrégées (1 ReactionSummary par émoji).
        Reactions    []ReactionSummary    `json:"reactions,omitempty"`
}

// MessageUserRef — expéditeur allégé (pour hydratation batch).
type MessageUserRef struct {
        ID    string `json:"id"`
        Name  string `json:"name"`
        Email string `json:"email"`
        Role  string `json:"role"`
}

// MessageRef — message auquel on répond (référence allégée pour thread).
type MessageRef struct {
        ID      string  `json:"id"`
        Contenu string  `json:"contenu"`
        IsIA    bool    `json:"isIA"`
}

// MessageAttachment — pièce jointe d'un message (image, fichier, audio).
type MessageAttachment struct {
        ID        string                 `json:"id"`
        MessageID string                 `json:"messageId"`
        Type      MessageAttachmentType  `json:"type"`
        URL       string                 `json:"url"`
        Filename  string                 `json:"filename"`
        MimeType  string                 `json:"mimeType"`
        Size      int                    `json:"size"`
        CreatedAt time.Time              `json:"createdAt"`
}

// MessageReaction — réaction émoji d'un utilisateur sur un message.
// Agrégée côté repo pour produire ReactionSummary (compteur par émoji + liste
// des userIDs + flag "est-ce ma réaction").
type MessageReaction struct {
        ID        string    `json:"id"`
        MessageID string    `json:"messageId"`
        UserID    string    `json:"userId"`
        Emoji     string    `json:"emoji"` // caractère UTF-8 (ex: '👍')
        CreatedAt time.Time `json:"createdAt"`
}

// ReactionSummary — réaction agrégée pour un message (1 par émoji distinct).
// Renvoyé par ListMessages pour hydrater le rendu côté frontend.
type ReactionSummary struct {
        Emoji     string   `json:"emoji"`
        Count     int      `json:"count"`
        UserIDs   []string `json:"userIds"`
        ReactedByMe bool   `json:"reactedByMe"` // true si l'utilisateur courant a réagi
}

// MessageSignalement — signalement d'un message inapproprié.
type MessageSignalement struct {
        ID          string              `json:"id"`
        MessageID   string              `json:"messageId"`
        UserID      string              `json:"userId"`
        Raison      SignalementRaison   `json:"raison"`
        Commentaire *string             `json:"commentaire,omitempty"`
        Statut      SignalementStatut   `json:"statut"`
        ResolvedAt  *time.Time          `json:"resolvedAt,omitempty"`
        ResolvedBy  *string             `json:"resolvedBy,omitempty"`
        CreatedAt   time.Time           `json:"createdAt"`
}

// ============================================================
// DTOs (Data Transfer Objects) — réponses API
// ============================================================

// ConversationWithMeta — conversation + métadonnées (dernier message, non-lu count).
// Utilisé pour la liste des conversations dans la sidebar.
type ConversationWithMeta struct {
        Conversation
        LastMessage      *Message `json:"lastMessage,omitempty"`
        UnreadCount      int      `json:"unreadCount"`
        ParticipantsCount int      `json:"participantsCount"`
}

// ConversationListResult — réponse paginée de GET /api/messagerie/conversations.
type ConversationListResult struct {
        Conversations []ConversationWithMeta `json:"conversations"`
        Total         int                    `json:"total"`
}

// MessageListResult — réponse paginée de GET /api/messagerie/conversations/{id}/messages.
// Utilise cursor-based pagination (createdAt + id) pour le scroll infini.
type MessageListResult struct {
        Messages   []Message `json:"messages"`
        NextCursor *string   `json:"nextCursor,omitempty"` // format "createdAt|id"
        HasMore    bool      `json:"hasMore"`
}

// ============================================================
// INPUTS (payloads pour les mutations)
// ============================================================

// SendMessageInput — payload pour POST /api/messagerie/conversations/{id}/messages.
type SendMessageInput struct {
        Contenu    string  `json:"contenu"`
        ReplyToID  *string `json:"replyToId,omitempty"`
        // Pour les messages IA : si true, le backend forward au AIService au lieu d'insérer
        // directement. Le client ne devrait jamais mettre isIA=true lui-même.
        IsIA bool `json:"isIA,omitempty"`
}

// CreateDirectConversationInput — payload pour POST /api/messagerie/conversations (DIRECT).
type CreateDirectConversationInput struct {
        TargetUserID string  `json:"targetUserId"`
        Titre        *string `json:"titre,omitempty"`
}

// SignalMessageInput — payload pour POST /api/messagerie/messages/{id}/signaler.
type SignalMessageInput struct {
        Raison      SignalementRaison `json:"raison"`
        Commentaire *string           `json:"commentaire,omitempty"`
}

// MarkAsReadInput — payload pour POST /api/messagerie/conversations/{id}/lu.
type MarkAsReadInput struct {
        LastReadAt time.Time `json:"lastReadAt"` // heure du dernier message lu
}

// ============================================================
// HELPER : détecter la mention @assistant dans un message
// ============================================================

// HasAssistantMention détecte si un message mentionne @assistant.
// Utilisé par le usecase pour déclencher l'IA dans un salon collectif.
func HasAssistantMention(contenu string) bool {
        // Recherche case-insensitive de "@assistant" (mot entier).
        // BUGFIX (MESSAGERIE-GROUP-IA) : avant, le code utilisait i+11 au lieu de
        // i+10 (len("@assistant") == 10), donc la comparaison contenait 1 caractère
        // de trop et ne matchait JAMAIS → l'IA en salon collectif n'était jamais
        // déclenchée. Corrigé : on utilise la constante len("@assistant") = 10.
        const mention = "@assistant"
        const mlen = len(mention) // 10
        contenuLower := ""
        for _, r := range contenu {
                if r >= 'A' && r <= 'Z' {
                        contenuLower += string(r + 32)
                } else {
                        contenuLower += string(r)
                }
        }
        for i := 0; i+mlen <= len(contenuLower); i++ {
                if contenuLower[i:i+mlen] == mention {
                        // Vérifier que ce n'est pas un préfixe (ex: @assistante).
                        if i+mlen == len(contenuLower) {
                                return true
                        }
                        next := contenuLower[i+mlen]
                        if next == ' ' || next == '\t' || next == '\n' || next == ',' ||
                                next == '.' || next == '!' || next == '?' || next == ':' || next == ';' {
                                return true
                        }
                }
        }
        return false
}

// ============================================================
// INTERFACE REPOSITORY
// ============================================================

// MessagerieRepository — interface pour persister les entités Messagerie.
// Toutes les méthodes reçoivent le context (qui contient les claims RLS posés
// par le middleware Auth via db.WithTx).
type MessagerieRepository interface {
        // ─── Conversations ───
        // ListByUser retourne les conversations accessibles à l'utilisateur courant,
        // avec métadonnées (dernier message, unread count, participants count).
        ListByUser(ctx context.Context, userID string) (*ConversationListResult, error)

        // GetByID retourne une conversation par son ID (RLS filtre automatiquement).
        GetByID(ctx context.Context, id string) (*Conversation, error)

        // GetOrCreateIAPrivate retourne la conversation IA privée de l'utilisateur
        // (1 par user). La crée si elle n'existe pas.
        GetOrCreateIAPrivate(ctx context.Context, userID string) (*Conversation, error)

        // GetOrCreateAuto retourne une conversation auto (CLASSE/PROMO/EQUIPE/STAFF)
        // pour un scope donné. La crée si elle n'existe pas.
        GetOrCreateAuto(ctx context.Context, convType ConversationType, etablissementID string, filiereID, niveau *string) (*Conversation, error)

        // GetUserFiliereAndNiveau retourne (filiereId, niveau) d'un utilisateur
        // directement depuis la table User. Utilisé par EnsureAutoConversations pour
        // créer le salon CLASSE (qui nécessite niveau, absent des SessionClaims/JWT).
        // Bypass RLS (lecture admin-like via le pool, l'utilisateur est déjà authentifié).
        GetUserFiliereAndNiveau(ctx context.Context, userID string) (filiereID, niveau string, err error)

        // CreateDirect crée une conversation DIRECT entre 2 users (avec checks usecase).
        CreateDirect(ctx context.Context, creatorID, targetID string, titre *string, etablissementID string) (*Conversation, error)

        // ─── Participants ───
        // EnsureParticipant ajoute un user à une conversation s'il n'y est pas déjà
        // (lazy registration pour les salons auto). Retourne le participant.
        EnsureParticipant(ctx context.Context, conversationID, userID string) (*ConversationParticipant, error)

        // LeaveConversation fait quitter une conversation à l'utilisateur (soft-delete
        // du participant via leftAt). La conversation n'est plus visible dans sa liste.
        // Pour un DM, équivaut à "supprimer la conversation pour moi".
        LeaveConversation(ctx context.Context, conversationID, userID string) error

        // MarkAsRead met à jour lastReadAt pour un participant.
        MarkAsRead(ctx context.Context, conversationID, userID string, lastReadAt time.Time) error

        // SetMuted active/désactive les notifications pour un participant.
        SetMuted(ctx context.Context, conversationID, userID string, muted bool) error

        // ListParticipants retourne les participants actifs d'une conversation.
        ListParticipants(ctx context.Context, conversationID string) ([]*ConversationParticipant, error)

        // ListParticipantsWithUsers retourne les participants enrichis avec les
        // infos utilisateur (name, email, role) via JOIN sur la table User.
        // Utilisé par l'UI pour afficher la liste des participants + badges online.
        ListParticipantsWithUsers(ctx context.Context, conversationID string) ([]*ParticipantWithUser, error)

        // ─── Messages ───
        // ListMessages retourne les messages d'une conversation (cursor-based pagination).
        // cursor = "createdAt|id" du dernier message vu (NULL = page initiale).
        ListMessages(ctx context.Context, conversationID string, cursor *string, limit int) (*MessageListResult, error)

        // CreateMessage insère un message (user ou IA). Si isIA=true, userID doit être NULL.
        CreateMessage(ctx context.Context, msg *Message) (*Message, error)

        // EditMessage édite le contenu d'un message (auteur uniquement).
        EditMessage(ctx context.Context, messageID, userID, newContenu string) (*Message, error)

        // SoftDelete masque un message (auteur ou modérateur).
        SoftDeleteMessage(ctx context.Context, messageID, userID string) error

        // HideMessagesForUser masque une liste de messages pour un utilisateur
        // (per-user, n'impacte pas les autres). Utilisé pour :
        //   - Sélection multiple + suppression ("pour moi")
        //   - Vider une conversation ("pour moi")
        // Idempotent (ON CONFLICT DO NOTHING).
        HideMessagesForUser(ctx context.Context, messageIDs []string, userID string) error

        // ClearConversationForUser masque TOUS les messages d'une conversation pour
        // un utilisateur (per-user). Équivaut à "vider la conversation pour moi".
        // Retourne le nombre de messages masqués.
        ClearConversationForUser(ctx context.Context, conversationID, userID string) (int, error)

        // GetByID retourne un message par son ID.
        GetMessageByID(ctx context.Context, id string) (*Message, error)

        // GetMessageConversationID retourne uniquement le conversationId d'un message
        // (bypass RLS — lecture légère pour le broadcast après soft-delete modérateur).
        // Utilisé par DeleteMessage quand le modérateur n'a pas accès à la conversation
        // (ex: responsable modérant un salon CLASSE/PROMO qu'il ne voit pas).
        GetMessageConversationID(ctx context.Context, messageID string) (string, error)

        // ─── Réactions émojis (Niveau 2) ───
        // ToggleReaction ajoute ou retire la réaction de l'utilisateur sur un message
        // (toggle : si elle existe → DELETE + retourne false "removed" ; sinon → INSERT
        // + retourne true "added"). RLS : l'utilisateur ne peut réagir qu'aux messages
        // visibles (policy Reaction_insert hérite de Message_select).
        // Retourne (added bool, reaction *MessageReaction si added, err error).
        ToggleReaction(ctx context.Context, messageID, userID, emoji string) (added bool, reaction *MessageReaction, err error)

        // ListReactionsByMessageIDs retourne toutes les réactions pour une liste de
        // messageIDs, agrégées par message puis par émoji. Le flag reactedByMe est
        // positionné selon userID. Utilisé par ListMessages pour hydrater les bulles
        // en une seule query (évite N+1).
        ListReactionsByMessageIDs(ctx context.Context, messageIDs []string, userID string) (map[string][]ReactionSummary, error)

        // ─── Pièces jointes ───
        CreateAttachment(ctx context.Context, att *MessageAttachment) (*MessageAttachment, error)
        ListAttachmentsByMessage(ctx context.Context, messageID string) ([]*MessageAttachment, error)

        // ─── Signalements ───
        Signal(ctx context.Context, s *MessageSignalement) (*MessageSignalement, error)
        ListSignalements(ctx context.Context, etablissementID string, statut *SignalementStatut) ([]*MessageSignalement, error)
        ResolveSignalement(ctx context.Context, id, resolverID string, statut SignalementStatut) (*MessageSignalement, error)

        // ─── DM eligibility (étudiant → enseignant de ses épreuves) ───
        // CanStudentDMEnseignant vérifie si l'enseignant a au moins une épreuve
        // à laquelle l'étudiant est inscrit (anti-spam).
        CanStudentDMEnseignant(ctx context.Context, etudiantID, enseignantID string) (bool, error)

        // IsUserStudentInSameEtablissement vérifie si targetUserID est un étudiant
        // du même établissement que l'appelant. Utilisé pour autoriser les DM
        // étudiant ↔ étudiant au sein d'un même établissement.
        IsUserStudentInSameEtablissement(ctx context.Context, targetUserID, etablissementID string) (bool, error)
}

// MarshalJSON pour ConversationType : sérialiser en string (pas en nombre).
// (déjà géré par le type string sous-jacent, mais on le rappelle pour clarté)

// Ensure json.RawMessage est utilisé pour DetailParQuestion (compatible encoding/json).
var _ json.RawMessage
