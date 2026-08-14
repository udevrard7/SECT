// Package repository — implémentation MessagerieRepository (chat temps réel + IA).
//
// Implémente domain.MessagerieRepository sur PostgreSQL (pgx) avec RLS Neon.
// Toutes les méthodes touchant la DB :
//   1. extraient les claims du context via db.ClaimsFromContext
//   2. utilisent db.WithTx (commit/rollback automatiques + pose des claims RLS)
//
// Les noms de colonnes DB sont en PascalCase entre guillemets doubles (cf.
// migration 000037_create_messagerie.up.sql). Les helpers derefStr /
// buildPlaceholders sont partagés avec les autres repositories du package.
package repository

import (
        "context"
        "fmt"
        "log/slog"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// ============================================================
// MESSAGERIE REPOSITORY
// ============================================================

// MessagerieRepository implémente domain.MessagerieRepository.
type MessagerieRepository struct {
        pool *pgxpool.Pool
}

// NewMessagerieRepository crée un nouveau MessagerieRepository.
func NewMessagerieRepository(pool *pgxpool.Pool) *MessagerieRepository {
        return &MessagerieRepository{pool: pool}
}

// Vérification à la compilation que l'implémentation satisfait l'interface.
var _ domain.MessagerieRepository = (*MessagerieRepository)(nil)

// colonnesConversation — l'ordre doit matcher scanConversation.
// "type" est cast en text car c'est un enum PostgreSQL.
const colonnesConversation = `"id", "type"::text, "titre", "etablissementId", "filiereId", "niveau",
        "createdBy", "createdAt", "updatedAt", "deletedAt"`

func scanConversation(s scanner) (*domain.Conversation, error) {
        c := &domain.Conversation{}
        var typeStr string
        if err := s.Scan(
                &c.ID, &typeStr, &c.Titre, &c.EtablissementID, &c.FiliereID, &c.Niveau,
                &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt, &c.DeletedAt,
        ); err != nil {
                return nil, err
        }
        c.Type = domain.ConversationType(typeStr)
        return c, nil
}

// colonnesParticipant — l'ordre doit matcher scanParticipant.
const colonnesParticipant = `"id", "conversationId", "userId", "lastReadAt", "muted", "joinedAt", "leftAt"`

func scanParticipant(s scanner) (*domain.ConversationParticipant, error) {
        p := &domain.ConversationParticipant{}
        if err := s.Scan(
                &p.ID, &p.ConversationID, &p.UserID, &p.LastReadAt, &p.Muted, &p.JoinedAt, &p.LeftAt,
        ); err != nil {
                return nil, err
        }
        return p, nil
}

// ============================================================
// CONVERSATIONS
// ============================================================

// ListByUser retourne les conversations accessibles à l'utilisateur courant,
// avec métadonnées (dernier message, unread count, participants count).
// RLS filtre automatiquement les conversations visibles (IA privée / classe /
// promo / équipe / staff / direct) selon les claims posés sur la transaction.
//
// UnreadCount : count des messages postérieurs au lastReadAt du participant
// (NULL = jamais lu → on compare à '1970-01-01'::timestamptz).
// LastMessage : récupéré via LEFT JOIN LATERAL (1 row max par conversation).
// ParticipantsCount : count des participants actifs (leftAt IS NULL).
func (r *MessagerieRepository) ListByUser(ctx context.Context, userID string) (*domain.ConversationListResult, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ListByUser: claims manquants dans le context")
        }

        result := &domain.ConversationListResult{Conversations: []domain.ConversationWithMeta{}}
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                query := `
                        SELECT c."id", c."type"::text, COALESCE(c."titre", other."name") AS "titre",
                               c."etablissementId", c."filiereId", c."niveau",
                               c."createdBy", c."createdAt", c."updatedAt", c."deletedAt",
                               lm."id", lm."conversationId", lm."userId", COALESCE(lm."isIA", false), lm."contenu",
                               lm."contenuHtml", lm."replyToId", lm."editedAt", lm."deletedAt", lm."createdAt",
                               (CASE WHEN p."userId" IS NULL THEN 0
                                 ELSE (SELECT count(*) FROM "Message" m
                                       WHERE m."conversationId" = c."id"
                                         AND m."deletedAt" IS NULL
                                         AND m."createdAt" > COALESCE(p."lastReadAt", '1970-01-01'::timestamptz))
                                END) AS unread_count,
                               (SELECT count(*) FROM "ConversationParticipant" p2
                                WHERE p2."conversationId" = c."id" AND p2."leftAt" IS NULL) AS participants_count
                        FROM "Conversation" c
                        LEFT JOIN "ConversationParticipant" p
                               ON p."conversationId" = c."id" AND p."userId" = $1
                        -- Bug 1 : pour les conversations DIRECT, récupère le nom de l'AUTRE
                        -- participant (encore actif) afin d'afficher son nom dans la sidebar
                        -- même si c."titre" est NULL (cas par défaut : le frontend ne set pas titre).
                        LEFT JOIN LATERAL (
                                SELECT u."name"
                                FROM "ConversationParticipant" op
                                JOIN "User" u ON u."id" = op."userId"
                                WHERE op."conversationId" = c."id"
                                  AND op."userId" <> $1
                                  AND op."leftAt" IS NULL
                                LIMIT 1
                        ) other ON c."type" = 'DIRECT'
                        LEFT JOIN LATERAL (
                                SELECT m."id", m."conversationId", m."userId", m."isIA", m."contenu", m."contenuHtml",
                                       m."replyToId", m."editedAt", m."deletedAt", m."createdAt"
                                FROM "Message" m
                                WHERE m."conversationId" = c."id" AND m."deletedAt" IS NULL
                                ORDER BY m."createdAt" DESC
                                LIMIT 1
                        ) lm ON true
                        -- Bug 3 : exclut les conversations que l'utilisateur a explicitement
                        -- quittées (p."leftAt" non-null). p est LEFT JOIN, donc quand l'user
                        -- n'a jamais été participant (salons auto non encore rejoints),
                        -- p."leftAt" est NULL → la conversation reste visible.
                        WHERE c."deletedAt" IS NULL AND (p."leftAt" IS NULL)
                        ORDER BY c."updatedAt" DESC
                `
                rows, err := tx.Query(ctx, query, userID)
                if err != nil {
                        return fmt.Errorf("query conversations: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        var cwm domain.ConversationWithMeta
                        var typeStr string
                        // Champs du dernier message (tous nullables via LEFT JOIN LATERAL).
                        var lmID, lmConvID, lmUserID, lmContenu, lmContenuHTML, lmReplyToID *string
                        var lmIsIA bool
                        var lmEditedAt, lmDeletedAt, lmCreatedAt *time.Time

                        if err := rows.Scan(
                                &cwm.ID, &typeStr, &cwm.Titre, &cwm.EtablissementID, &cwm.FiliereID, &cwm.Niveau,
                                &cwm.CreatedBy, &cwm.CreatedAt, &cwm.UpdatedAt, &cwm.DeletedAt,
                                &lmID, &lmConvID, &lmUserID, &lmIsIA, &lmContenu,
                                &lmContenuHTML, &lmReplyToID, &lmEditedAt, &lmDeletedAt, &lmCreatedAt,
                                &cwm.UnreadCount, &cwm.ParticipantsCount,
                        ); err != nil {
                                return fmt.Errorf("scan conversation: %w", err)
                        }
                        cwm.Type = domain.ConversationType(typeStr)

                        // Hydrate le dernier message si la LATERAL JOIN a matché.
                        if lmID != nil {
                                msg := &domain.Message{
                                        ID:             *lmID,
                                        ConversationID: derefStr(lmConvID),
                                        UserID:         lmUserID,
                                        IsIA:           lmIsIA,
                                        Contenu:        derefStr(lmContenu),
                                        ContenuHTML:    lmContenuHTML,
                                        ReplyToID:      lmReplyToID,
                                        EditedAt:       lmEditedAt,
                                        DeletedAt:      lmDeletedAt,
                                }
                                if lmCreatedAt != nil {
                                        msg.CreatedAt = *lmCreatedAt
                                }
                                cwm.LastMessage = msg
                        }
                        result.Conversations = append(result.Conversations, cwm)
                }
                // Vérifier rows.Err() — sinon une erreur pendant l'itération est silencieuse
                // et provoque "commit unexpectedly resulted in rollback" au Commit.
                if err := rows.Err(); err != nil {
                        return fmt.Errorf("rows.Err after conversations scan: %w", err)
                }
                result.Total = len(result.Conversations)
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// GetByID retourne une conversation par son ID. RLS filtre automatiquement :
// si l'utilisateur n'a pas accès à la conversation (IA d'un autre user, classe
// d'une autre filière, etc.), la query renvoie 0 ligne → NotFoundError.
func (r *MessagerieRepository) GetByID(ctx context.Context, id string) (*domain.Conversation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("GetByID: claims manquants dans le context")
        }

        var conv *domain.Conversation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Conversation" WHERE "id" = $1`, colonnesConversation), id)
                c, err := scanConversation(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Conversation", ID: id}
                        }
                        return fmt.Errorf("query conversation: %w", err)
                }
                conv = c
                return nil
        })
        if err != nil {
                return nil, err
        }
        return conv, nil
}

// GetOrCreateIAPrivate retourne la conversation IA privée de l'utilisateur
// (type='IA', createdBy=userID, etablissementId=NULL). La crée si elle n'existe
// pas, puis y inscrit automatiquement l'utilisateur comme participant.
func (r *MessagerieRepository) GetOrCreateIAPrivate(ctx context.Context, userID string) (*domain.Conversation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("GetOrCreateIAPrivate: claims manquants dans le context")
        }
        if claims.UserID != userID {
                // Sécurité : on ne peut créer/accéder qu'à SA propre conversation IA.
                return nil, fmt.Errorf("GetOrCreateIAPrivate: userID != claims.UserID (anti-spoofing)")
        }

        var conv *domain.Conversation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // 1. Tenter d'abord un SELECT (cas normal : la conv existe déjà).
                row := tx.QueryRow(ctx, fmt.Sprintf(`
                        SELECT %s FROM "Conversation"
                        WHERE "type" = 'IA' AND "createdBy" = $1 AND "deletedAt" IS NULL
                `, colonnesConversation), userID)
                c, err := scanConversation(row)
                if err == nil {
                        conv = c
                        return nil
                }
                if err != pgx.ErrNoRows {
                        return fmt.Errorf("query IA conversation: %w", err)
                }

                // 2. Sinon, créer la conversation IA.
                now := time.Now()
                convID := uuid.New().String()
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "Conversation" ("id", "type", "titre", "etablissementId", "filiereId", "niveau",
                                                    "createdBy", "createdAt", "updatedAt")
                        VALUES ($1, 'IA', NULL, NULL, NULL, NULL, $2, $3, $3)
                `, convID, userID, now); err != nil {
                        return fmt.Errorf("insert IA conversation: %w", err)
                }

                // 3. Inscrire l'utilisateur comme participant (lazy registration).
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "ConversationParticipant" ("id", "conversationId", "userId", "muted", "joinedAt")
                        VALUES ($1, $2, $3, false, $4)
                        ON CONFLICT ("conversationId", "userId") DO NOTHING
                `, uuid.New().String(), convID, userID, now); err != nil {
                        return fmt.Errorf("insert IA participant: %w", err)
                }

                // 4. Recharger pour peupler les timestamps DB (defaults).
                row2 := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Conversation" WHERE "id" = $1`, colonnesConversation), convID)
                c2, err := scanConversation(row2)
                if err != nil {
                        return fmt.Errorf("reload IA conversation: %w", err)
                }
                conv = c2
                return nil
        })
        if err != nil {
                return nil, err
        }
        return conv, nil
}

// GetOrCreateAuto retourne une conversation auto (CLASSE/PROMO/EQUIPE/STAFF)
// pour un scope donné. La crée si elle n'existe pas avec un titre auto-généré.
//
// Règles de scope :
//   - CLASSE : filiereId + niveau
//   - PROMO  : filiereId
//   - EQUIPE : etablissementId
//   - STAFF  : etablissementId
//
// createdBy est positionné à claims.UserID (le user qui a déclenché la création).
func (r *MessagerieRepository) GetOrCreateAuto(ctx context.Context, convType domain.ConversationType, etablissementID string, filiereID, niveau *string) (*domain.Conversation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("GetOrCreateAuto: claims manquants dans le context")
        }

        var conv *domain.Conversation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // 1. Construire la clause WHERE selon le type.
                var where string
                var args []any
                switch convType {
                case domain.ConversationTypeClasse:
                        if filiereID == nil || niveau == nil {
                                return fmt.Errorf("GetOrCreateAuto CLASSE: filiereId et niveau requis")
                        }
                        where = `"type" = 'CLASSE' AND "filiereId" = $1 AND "niveau" = $2 AND "deletedAt" IS NULL`
                        args = []any{*filiereID, *niveau}
                case domain.ConversationTypePromo:
                        if filiereID == nil {
                                return fmt.Errorf("GetOrCreateAuto PROMO: filiereId requis")
                        }
                        where = `"type" = 'PROMO' AND "filiereId" = $1 AND "deletedAt" IS NULL`
                        args = []any{*filiereID}
                case domain.ConversationTypeEquipe:
                        where = `"type" = 'EQUIPE' AND "etablissementId" = $1 AND "deletedAt" IS NULL`
                        args = []any{etablissementID}
                case domain.ConversationTypeStaff:
                        where = `"type" = 'STAFF' AND "etablissementId" = $1 AND "deletedAt" IS NULL`
                        args = []any{etablissementID}
                default:
                        return fmt.Errorf("GetOrCreateAuto: type non supporté %s (uniquement CLASSE/PROMO/EQUIPE/STAFF)", convType)
                }

                // 2. Tenter un SELECT d'abord.
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Conversation" WHERE %s`, colonnesConversation, where), args...)
                c, err := scanConversation(row)
                if err == nil {
                        conv = c
                        return nil
                }
                if err != pgx.ErrNoRows {
                        return fmt.Errorf("query auto conversation: %w", err)
                }

                // 3. Sinon, créer la conversation avec un titre auto-généré.
                titre := autoConversationTitle(convType, filiereID, niveau)
                now := time.Now()
                convID := uuid.New().String()

                // Construit les colonnes/valeurs selon le type (etablissementId/filiereId/niveau).
                var cols, vals string
                var insertArgs []any
                switch convType {
                case domain.ConversationTypeClasse:
                        cols = `"id", "type", "titre", "etablissementId", "filiereId", "niveau", "createdBy", "createdAt", "updatedAt"`
                        vals = `$1, 'CLASSE', $2, $3, $4, $5, $6, $7, $7`
                        insertArgs = []any{convID, titre, etablissementID, *filiereID, *niveau, claims.UserID, now}
                case domain.ConversationTypePromo:
                        cols = `"id", "type", "titre", "etablissementId", "filiereId", "createdBy", "createdAt", "updatedAt"`
                        vals = `$1, 'PROMO', $2, $3, $4, $5, $6, $6`
                        insertArgs = []any{convID, titre, etablissementID, *filiereID, claims.UserID, now}
                case domain.ConversationTypeEquipe:
                        cols = `"id", "type", "titre", "etablissementId", "createdBy", "createdAt", "updatedAt"`
                        vals = `$1, 'EQUIPE', $2, $3, $4, $5, $5`
                        insertArgs = []any{convID, titre, etablissementID, claims.UserID, now}
                case domain.ConversationTypeStaff:
                        cols = `"id", "type", "titre", "etablissementId", "createdBy", "createdAt", "updatedAt"`
                        vals = `$1, 'STAFF', $2, $3, $4, $5, $5`
                        insertArgs = []any{convID, titre, etablissementID, claims.UserID, now}
                }

                if _, err := tx.Exec(ctx, fmt.Sprintf(`INSERT INTO "Conversation" (%s) VALUES (%s)`, cols, vals), insertArgs...); err != nil {
                        return fmt.Errorf("insert auto conversation: %w", err)
                }

                // 4. Recharger pour peupler les timestamps DB (defaults).
                row2 := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Conversation" WHERE "id" = $1`, colonnesConversation), convID)
                c2, err := scanConversation(row2)
                if err != nil {
                        return fmt.Errorf("reload auto conversation: %w", err)
                }
                conv = c2
                return nil
        })
        if err != nil {
                return nil, err
        }
        return conv, nil
}

// GetUserFiliereAndNiveau retourne (filiereId, niveau) d'un utilisateur
// directement depuis la table User (bypass RLS — l'utilisateur est déjà
// authentifié, on lit ses propres attributs pour créer le salon CLASSE).
//
// Utilisé par EnsureAutoConversations : le JWT/SessionClaims ne contient pas
// le niveau (seulement filiereId), donc on charge depuis la DB.
func (r *MessagerieRepository) GetUserFiliereAndNiveau(ctx context.Context, userID string) (filiereID, niveau string, err error) {
        // Lecture simple sans transaction (SELECT sur User). Les policies RLS
        // User_select exigent is_responsable()/is_admin() ou self-match ; l'user
        // authentifié lit ses propres attributs → OK via les claims posés par le
        // pool. On utilise une tx courte pour poser les claims proprement.
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return "", "", fmt.Errorf("GetUserFiliereAndNiveau: claims manquants dans le context")
        }

        err = db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var fil, niv *string
                err := tx.QueryRow(ctx,
                        `SELECT "filiereId", "niveau" FROM "User" WHERE "id" = $1`,
                        userID,
                ).Scan(&fil, &niv)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return fmt.Errorf("GetUserFiliereAndNiveau: user %s introuvable", userID)
                        }
                        return fmt.Errorf("query user filiere/niveau: %w", err)
                }
                if fil != nil {
                        filiereID = *fil
                }
                if niv != nil {
                        niveau = *niv
                }
                return nil
        })
        return filiereID, niveau, err
}

// autoConversationTitle génère un titre par défaut pour les conversations auto.
// Le titre est principalement cosmétique : le frontend peut le surcharger à
// l'affichage à partir des métadonnées (filiereId, niveau, etc.).
func autoConversationTitle(convType domain.ConversationType, filiereID *string, niveau *string) string {
        switch convType {
        case domain.ConversationTypeClasse:
                if niveau != nil {
                        return "Classe " + *niveau
                }
                return "Classe"
        case domain.ConversationTypePromo:
                return "Promo"
        case domain.ConversationTypeEquipe:
                return "Équipe pédagogique"
        case domain.ConversationTypeStaff:
                return "Staff"
        default:
                return string(convType)
        }
}

// CreateDirect crée une conversation DIRECT (1-à-1) entre creatorID et targetID.
// Vérifie d'abord qu'une conversation DIRECT n'existe pas déjà entre ces 2 users
// (via la présence simultanée des 2 participants). Si oui, retourne l'existante.
//
// RLS : la policy Conversation_insert exige createdBy = current_user_id() et
// etablissementId = current_etablissement_id() pour les DIRECT.
func (r *MessagerieRepository) CreateDirect(ctx context.Context, creatorID, targetID string, titre *string, etablissementID string) (*domain.Conversation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("CreateDirect: claims manquants dans le context")
        }
        if claims.UserID != creatorID {
                return nil, fmt.Errorf("CreateDirect: creatorID != claims.UserID (anti-spoofing)")
        }
        if creatorID == targetID {
                return nil, fmt.Errorf("CreateDirect: creatorID == targetID (auto-DM interdit)")
        }

        var conv *domain.Conversation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // 1. Vérifier si une conv DIRECT existe déjà entre ces 2 users
                //    (les 2 doivent être participants actifs).
                var existingID string
                err := tx.QueryRow(ctx, `
                        SELECT c."id"
                        FROM "Conversation" c
                        WHERE c."type" = 'DIRECT' AND c."deletedAt" IS NULL
                          AND EXISTS (SELECT 1 FROM "ConversationParticipant" p1
                                      WHERE p1."conversationId" = c."id" AND p1."userId" = $1
                                        AND p1."leftAt" IS NULL)
                          AND EXISTS (SELECT 1 FROM "ConversationParticipant" p2
                                      WHERE p2."conversationId" = c."id" AND p2."userId" = $2
                                        AND p2."leftAt" IS NULL)
                        LIMIT 1
                `, creatorID, targetID).Scan(&existingID)
                if err == nil {
                        // Une conversation existe déjà → la retourner.
                        row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Conversation" WHERE "id" = $1`, colonnesConversation), existingID)
                        c, err := scanConversation(row)
                        if err != nil {
                                return fmt.Errorf("reload existing DIRECT conversation: %w", err)
                        }
                        conv = c
                        return nil
                }
                if err != pgx.ErrNoRows {
                        return fmt.Errorf("query existing DIRECT conversation: %w", err)
                }

                // 2. Créer la conversation DIRECT.
                now := time.Now()
                convID := uuid.New().String()
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "Conversation" ("id", "type", "titre", "etablissementId", "createdBy", "createdAt", "updatedAt")
                        VALUES ($1, 'DIRECT', $2, $3, $4, $5, $5)
                `, convID, titre, etablissementID, creatorID, now); err != nil {
                        return fmt.Errorf("insert DIRECT conversation: %w", err)
                }

                // 3. Inscrire les 2 participants.
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "ConversationParticipant" ("id", "conversationId", "userId", "muted", "joinedAt")
                        VALUES ($1, $2, $3, false, $4)
                `, uuid.New().String(), convID, creatorID, now); err != nil {
                        return fmt.Errorf("insert DIRECT participant creator: %w", err)
                }
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "ConversationParticipant" ("id", "conversationId", "userId", "muted", "joinedAt")
                        VALUES ($1, $2, $3, false, $4)
                `, uuid.New().String(), convID, targetID, now); err != nil {
                        return fmt.Errorf("insert DIRECT participant target: %w", err)
                }

                // 4. Recharger pour peupler les timestamps DB.
                row2 := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Conversation" WHERE "id" = $1`, colonnesConversation), convID)
                c2, err := scanConversation(row2)
                if err != nil {
                        return fmt.Errorf("reload DIRECT conversation: %w", err)
                }
                conv = c2
                return nil
        })
        if err != nil {
                return nil, err
        }
        return conv, nil
}

// ============================================================
// PARTICIPANTS
// ============================================================

// EnsureParticipant ajoute un user à une conversation s'il n'y est pas déjà
// (lazy registration pour les salons auto). Retourne le participant.
//
// Utilise ON CONFLICT DO NOTHING pour être idempotent. RLS : la policy
// Participant_insert exige userId = current_user_id() (je m'inscris moi-même).
func (r *MessagerieRepository) EnsureParticipant(ctx context.Context, conversationID, userID string) (*domain.ConversationParticipant, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("EnsureParticipant: claims manquants dans le context")
        }
        if claims.UserID != userID {
                return nil, fmt.Errorf("EnsureParticipant: userID != claims.UserID (anti-spoofing)")
        }

        var part *domain.ConversationParticipant
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                now := time.Now()
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "ConversationParticipant" ("id", "conversationId", "userId", "muted", "joinedAt")
                        VALUES ($1, $2, $3, false, $4)
                        ON CONFLICT ("conversationId", "userId") DO NOTHING
                `, uuid.New().String(), conversationID, userID, now); err != nil {
                        return fmt.Errorf("upsert participant: %w", err)
                }

                // SELECT pour retourner le participant (qu'il ait été inséré ou déjà existant).
                row := tx.QueryRow(ctx, fmt.Sprintf(`
                        SELECT %s FROM "ConversationParticipant"
                        WHERE "conversationId" = $1 AND "userId" = $2 AND "leftAt" IS NULL
                `, colonnesParticipant), conversationID, userID)
                p, err := scanParticipant(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "ConversationParticipant", ID: conversationID + ":" + userID}
                        }
                        return fmt.Errorf("query participant: %w", err)
                }
                part = p
                return nil
        })
        if err != nil {
                return nil, err
        }
        return part, nil
}

// LeaveConversation fait quitter une conversation à l'utilisateur (soft-delete
// du participant via leftAt). La conversation n'est plus visible dans sa liste.
// Pour un DM, équivaut à "supprimer la conversation pour moi".
// Idempotent : si déjà quittée, ne fait rien.
//
// Bug 3 (salons) : pour les salons collectifs (CLASSE/PROMO/EQUIPE/STAFF), un
// utilisateur peut voir le salon via RLS (basée sur rôle/filière) SANS avoir de
// row ConversationParticipant (jamais inscrit formellement — lazy registration).
// L'ancien UPDATE affectait 0 lignes → leftAt n'était jamais posé → le salon
// restait visible après "Quitter". Fix : UPSERT (INSERT ... ON CONFLICT DO
// UPDATE) qui crée un row avec leftAt set si l'utilisateur n'en avait pas, ou
// met à jour leftAt si le row existe. Le WHERE "leftAt" IS NULL sur la branche
// DO UPDATE garantit l'idempotence (déjà quitté → no-op).
func (r *MessagerieRepository) LeaveConversation(ctx context.Context, conversationID, userID string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return fmt.Errorf("LeaveConversation: claims manquants dans le context")
        }
        if claims.UserID != userID {
                return fmt.Errorf("LeaveConversation: userID != claims.UserID (anti-spoofing)")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                _, err := tx.Exec(ctx, `
                        INSERT INTO "ConversationParticipant" ("id", "conversationId", "userId", "muted", "joinedAt", "leftAt")
                        VALUES ($3, $1, $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        ON CONFLICT ("conversationId", "userId")
                        DO UPDATE SET "leftAt" = CURRENT_TIMESTAMP
                        WHERE "ConversationParticipant"."leftAt" IS NULL
                `, conversationID, userID, uuid.New().String())
                if err != nil {
                        return fmt.Errorf("leave conversation (upsert): %w", err)
                }
                return nil
        })
}

// MarkAsRead met à jour lastReadAt pour un participant.
// RLS : la policy Participant_update exige userId = current_user_id().
//
// BUGFIX (MESSAGERIE-BADGE-NON-PARTICIPANT) : un enseignant/responsable qui
// voit un salon CLASSE/PROMO de son établissement (policy Conversation_select
// autorise is_enseignant()/is_responsable()) sans en être participant (pas de
// row ConversationParticipant) déclenchait un NotFoundError 404 → le frontend
// rollback l'optimistic update → le badge restait affiché.
// Fix : si 0 rows affectés (non-participant), on ne lève plus d'erreur — c'est
// un no-op silencieux. Le badge est déjà géré côté ListByUser (unreadCount=0
// pour les non-participants), donc le frontend ne devrait même pas appeler
// /lu dans ce cas, mais par robustesse on évite le 404.
func (r *MessagerieRepository) MarkAsRead(ctx context.Context, conversationID, userID string, lastReadAt time.Time) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return fmt.Errorf("MarkAsRead: claims manquants dans le context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                ct, err := tx.Exec(ctx, `
                        UPDATE "ConversationParticipant"
                        SET "lastReadAt" = $3
                        WHERE "conversationId" = $1 AND "userId" = $2 AND "leftAt" IS NULL
                `, conversationID, userID, lastReadAt)
                if err != nil {
                        return fmt.Errorf("update lastReadAt: %w", err)
                }
                // Non-participant (enseignant/responsable qui consulte un salon
                // CLASSE/PROMO pour modération) → no-op, pas d'erreur.
                if ct.RowsAffected() == 0 {
                        return nil
                }
                return nil
        })
}

// SetMuted active/désactive les notifications pour un participant.
func (r *MessagerieRepository) SetMuted(ctx context.Context, conversationID, userID string, muted bool) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return fmt.Errorf("SetMuted: claims manquants dans le context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                ct, err := tx.Exec(ctx, `
                        UPDATE "ConversationParticipant"
                        SET "muted" = $3
                        WHERE "conversationId" = $1 AND "userId" = $2 AND "leftAt" IS NULL
                `, conversationID, userID, muted)
                if err != nil {
                        return fmt.Errorf("update muted: %w", err)
                }
                if ct.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "ConversationParticipant", ID: conversationID + ":" + userID}
                }
                return nil
        })
}

// ListParticipants retourne les participants actifs (leftAt IS NULL) d'une
// conversation. Le LEFT JOIN User permet d'hydrater le nom du user (non exposé
// dans le type ConversationParticipant mais utile pour le frontend via
// l'hydratation au niveau du usecase/handler).
//
// RLS : la policy Participant_select permet de voir les participants des
// conversations auxquelles j'ai accès.
func (r *MessagerieRepository) ListParticipants(ctx context.Context, conversationID string) ([]*domain.ConversationParticipant, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ListParticipants: claims manquants dans le context")
        }

        var result []*domain.ConversationParticipant
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, fmt.Sprintf(`
                        SELECT %s FROM "ConversationParticipant"
                        WHERE "conversationId" = $1 AND "leftAt" IS NULL
                        ORDER BY "joinedAt" ASC
                `, colonnesParticipant), conversationID)
                if err != nil {
                        return fmt.Errorf("query participants: %w", err)
                }
                defer rows.Close()
                for rows.Next() {
                        p, err := scanParticipant(rows)
                        if err != nil {
                                return fmt.Errorf("scan participant: %w", err)
                        }
                        result = append(result, p)
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        if result == nil {
                result = []*domain.ConversationParticipant{}
        }
        return result, nil
}

// ListParticipantsWithUsers retourne les participants enrichis avec les infos
// utilisateur (name, email, role) via LEFT JOIN sur la table User.
// Utilisé par l'UI pour afficher la liste des participants avec badges online.
func (r *MessagerieRepository) ListParticipantsWithUsers(ctx context.Context, conversationID string) ([]*domain.ParticipantWithUser, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ListParticipantsWithUsers: claims manquants dans le context")
        }

        var result []*domain.ParticipantWithUser
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, `
                        SELECT p."id", p."conversationId", p."userId", p."lastReadAt", p."muted",
                               p."joinedAt", p."leftAt",
                               u."id", u."name", u."email", u."role"::text
                        FROM "ConversationParticipant" p
                        LEFT JOIN "User" u ON u."id" = p."userId"
                        WHERE p."conversationId" = $1 AND p."leftAt" IS NULL
                        ORDER BY p."joinedAt" ASC
                `, conversationID)
                if err != nil {
                        return fmt.Errorf("query participants with users: %w", err)
                }
                defer rows.Close()
                for rows.Next() {
                        var p domain.ParticipantWithUser
                        var uID, uName, uEmail, uRole *string
                        if err := rows.Scan(
                                &p.ID, &p.ConversationID, &p.UserID, &p.LastReadAt, &p.Muted,
                                &p.JoinedAt, &p.LeftAt,
                                &uID, &uName, &uEmail, &uRole,
                        ); err != nil {
                                return fmt.Errorf("scan participant with user: %w", err)
                        }
                        // Hydrate User si le LEFT JOIN a matché.
                        if uID != nil {
                                p.User = &domain.MessageUserRef{
                                        ID:    *uID,
                                        Name:  derefStr(uName),
                                        Email: derefStr(uEmail),
                                        Role:  derefStr(uRole),
                                }
                        }
                        result = append(result, &p)
                }
                return rows.Err()
        })
        if err != nil {
                return nil, err
        }
        if result == nil {
                result = []*domain.ParticipantWithUser{}
        }
        return result, nil
}

// ============================================================
// MESSAGES
// ============================================================

// ListMessages retourne les messages d'une conversation avec cursor-based
// pagination (scroll infini).
//
// Cursor format : "createdAt|id" (RFC3339Nano + "|" + uuid).
// Si cursor est nil/empty → page initiale (messages les plus récents d'abord).
// Sinon → page suivante (messages plus anciens que le cursor).
//
// On récupère limit+1 rows pour déterminer hasMore. Si > limit rows, on garde
// les limit premières et on construit NextCursor à partir de la dernière.
//
// Hydratation :
//   - User (LEFT JOIN User u ON u."id" = m."userId") → MessageUserRef
//   - ReplyTo (LEFT JOIN Message r ON r."id" = m."replyToId") → MessageRef
//
// Les Attachments ne sont PAS chargés ici (seraient trop lourds) : le frontend
// les demande séparément via ListAttachmentsByMessage si besoin.
//
// RLS : la policy Message_select exige que l'utilisateur ait accès à la
// conversation parente.
func (r *MessagerieRepository) ListMessages(ctx context.Context, conversationID string, cursor *string, limit int) (*domain.MessageListResult, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ListMessages: claims manquants dans le context")
        }
        if limit <= 0 {
                limit = 50
        }

        // Parse le cursor si présent.
        var cursorTime *time.Time
        var cursorID *string
        if cursor != nil && *cursor != "" {
                parts := strings.SplitN(*cursor, "|", 2)
                if len(parts) != 2 {
                        return nil, fmt.Errorf("ListMessages: format cursor invalide (attendu 'createdAt|id')")
                }
                t, err := time.Parse(time.RFC3339Nano, parts[0])
                if err != nil {
                        return nil, fmt.Errorf("ListMessages: cursor createdAt invalide: %w", err)
                }
                cursorTime = &t
                id := parts[1]
                cursorID = &id
        }

        result := &domain.MessageListResult{Messages: []domain.Message{}}
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                args := []any{conversationID}
                // Exclure les messages masqués par l'utilisateur (MessageHiddenByUser).
                // current_setting('app.claims.user_id') est posé par SetClaimsTx.
                where := `WHERE m."conversationId" = $1 AND m."deletedAt" IS NULL
                          AND NOT EXISTS (SELECT 1 FROM "MessageHiddenByUser" h
                                          WHERE h."messageId" = m."id"
                                            AND h."userId" = current_setting('app.claims.user_id', true))`
                if cursorTime != nil && cursorID != nil {
                        // Page suivante : messages strictement plus anciens que le cursor
                        // (ou créés au même instant mais avec un id inférieur pour
                        // garantir un ordre total).
                        where += ` AND (m."createdAt" < $2 OR (m."createdAt" = $2 AND m."id" < $3))`
                        args = append(args, *cursorTime, *cursorID)
                }
                limitPlus := limit + 1
                query := fmt.Sprintf(`
                        SELECT m."id", m."conversationId", m."userId", m."isIA", m."contenu", m."contenuHtml",
                               m."replyToId", m."editedAt", m."deletedAt", m."createdAt",
                               u."id", u."name", u."email", u."role"::text,
                               r."id", r."contenu", r."isIA"
                        FROM "Message" m
                        LEFT JOIN "User" u ON u."id" = m."userId"
                        LEFT JOIN "Message" r ON r."id" = m."replyToId"
                        %s
                        ORDER BY m."createdAt" DESC, m."id" DESC
                        LIMIT $%d
                `, where, len(args)+1)
                args = append(args, limitPlus)

                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query messages: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        var msg domain.Message
                        // Champs User (tous nullables via LEFT JOIN, sauf si m."userId" est non-null).
                        var uID, uName, uEmail, uRole *string
                        // Champs ReplyTo (tous nullables via LEFT JOIN).
                        var rID, rContenu *string
                        var rIsIA *bool

                        if err := rows.Scan(
                                &msg.ID, &msg.ConversationID, &msg.UserID, &msg.IsIA, &msg.Contenu, &msg.ContenuHTML,
                                &msg.ReplyToID, &msg.EditedAt, &msg.DeletedAt, &msg.CreatedAt,
                                &uID, &uName, &uEmail, &uRole,
                                &rID, &rContenu, &rIsIA,
                        ); err != nil {
                                return fmt.Errorf("scan message: %w", err)
                        }

                        // Hydrate User si le LEFT JOIN a matché (m."userId" non-null).
                        if uID != nil {
                                msg.User = &domain.MessageUserRef{
                                        ID:    *uID,
                                        Name:  derefStr(uName),
                                        Email: derefStr(uEmail),
                                        Role:  derefStr(uRole),
                                }
                        }

                        // Hydrate ReplyTo si le LEFT JOIN a matché (m."replyToId" non-null).
                        if rID != nil {
                                msg.ReplyTo = &domain.MessageRef{
                                        ID:      *rID,
                                        Contenu: derefStr(rContenu),
                                        IsIA:    rIsIA != nil && *rIsIA,
                                }
                        }

                        result.Messages = append(result.Messages, msg)
                }

                // Si on a récupéré plus de `limit` messages, il y a une page suivante.
                if len(result.Messages) > limit {
                        result.HasMore = true
                        // On garde uniquement les `limit` premières (les plus récentes).
                        result.Messages = result.Messages[:limit]
                        // Construit le NextCursor à partir du dernier message conservé.
                        last := result.Messages[len(result.Messages)-1]
                        cursorStr := last.CreatedAt.Format(time.RFC3339Nano) + "|" + last.ID
                        result.NextCursor = &cursorStr
                }

                // Niveau 2 — hydratation des réactions agrégées (1 query batch,
                // évite N+1). On récupère toutes les réactions des messages de la
                // page courante en une seule fois via ListReactionsByMessageIDs.
                if len(result.Messages) > 0 {
                        msgIDs := make([]string, len(result.Messages))
                        for i, m := range result.Messages {
                                msgIDs[i] = m.ID
                        }
                        reactionsMap, rErr := r.ListReactionsByMessageIDs(ctx, msgIDs, claims.UserID)
                        if rErr != nil {
                                // Best-effort : si l'hydratation des réactions échoue,
                                // on ne bloque pas l'affichage des messages (on log
                                // et on continue sans réactions).
                                slog.Warn("ListMessages: ListReactionsByMessageIDs failed (best-effort skip)",
                                        "conversationId", conversationID, "error", rErr)
                        } else {
                                for i := range result.Messages {
                                        if summaries, ok := reactionsMap[result.Messages[i].ID]; ok {
                                                result.Messages[i].Reactions = summaries
                                        }
                                }
                        }
                }

                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// CreateMessage insère un message (user ou IA) et met à jour
// Conversation.updatedAt pour remonter la conversation en tête de liste.
//
// Si msg.ID est vide, un UUID est généré. Si isIA=true, userId doit être NULL
// (la policy Message_insert l'exige).
//
// RLS :
//   - Message user : userId = current_user_id() ET accès à la conversation
//   - Message IA   : isIA = true (réservé au backend, qui utilise des claims
//     système ou un user admin pour insérer les réponses IA)
func (r *MessagerieRepository) CreateMessage(ctx context.Context, msg *domain.Message) (*domain.Message, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("CreateMessage: claims manquants dans le context")
        }

        if msg.ID == "" {
                msg.ID = uuid.New().String()
        }
        now := time.Now()
        msg.CreatedAt = now

        var created *domain.Message
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // 1. INSERT le message.
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "Message" ("id", "conversationId", "userId", "isIA", "contenu", "contenuHtml",
                                               "replyToId", "createdAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, msg.ID, msg.ConversationID, msg.UserID, msg.IsIA, msg.Contenu, msg.ContenuHTML,
                        msg.ReplyToID, now); err != nil {
                        return fmt.Errorf("insert message: %w", err)
                }

                // 2. Met à jour Conversation.updatedAt (le trigger tr_conv_updated_at
                //   _refreshira automatiquement updatedAt = CURRENT_TIMESTAMP).
                if _, err := tx.Exec(ctx, `
                        UPDATE "Conversation" SET "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1
                `, msg.ConversationID); err != nil {
                        return fmt.Errorf("update conversation updatedAt: %w", err)
                }

                // 3. Recharge le message pour peupler les champs DB (defaults).
                // Bug 2 : on joint "User" pour que msg.User soit hydraté. Sans cela,
                // le message retourné (puis broadcasté via SSE) a User=nil → le
                // frontend affiche "Utilisateur" au lieu du nom de l'auteur dans les
                // salons collectifs. ListMessages fait déjà cette jointure, mais le
                // message créé et l'event temps-réel en manquaient.
                row := tx.QueryRow(ctx, `
                        SELECT m."id", m."conversationId", m."userId", m."isIA", m."contenu", m."contenuHtml",
                               m."replyToId", m."editedAt", m."deletedAt", m."createdAt",
                               u."id", u."name", u."email", u."role"::text
                        FROM "Message" m
                        LEFT JOIN "User" u ON u."id" = m."userId"
                        WHERE m."id" = $1
                `, msg.ID)
                m := &domain.Message{}
                var uID, uName, uEmail, uRole *string
                if err := row.Scan(
                        &m.ID, &m.ConversationID, &m.UserID, &m.IsIA, &m.Contenu, &m.ContenuHTML,
                        &m.ReplyToID, &m.EditedAt, &m.DeletedAt, &m.CreatedAt,
                        &uID, &uName, &uEmail, &uRole,
                ); err != nil {
                        return fmt.Errorf("reload message: %w", err)
                }
                if uID != nil {
                        m.User = &domain.MessageUserRef{
                                ID:    *uID,
                                Name:  derefStr(uName),
                                Email: derefStr(uEmail),
                                Role:  derefStr(uRole),
                        }
                }
                created = m
                return nil
        })
        if err != nil {
                return nil, err
        }
        return created, nil
}

// EditMessage édite le contenu d'un message (auteur uniquement).
// RLS : la policy Message_update exige userId = current_user_id() (ou
// responsable/admin de l'établissement). Le check explicite "userId" = $2
// renforce au niveau SQL même si RLS est désactivé.
func (r *MessagerieRepository) EditMessage(ctx context.Context, messageID, userID, newContenu string) (*domain.Message, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("EditMessage: claims manquants dans le context")
        }

        var edited *domain.Message
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // 1. UPDATE avec check auteur (RLS renforcera).
                ct, err := tx.Exec(ctx, `
                        UPDATE "Message"
                        SET "contenu" = $3, "editedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1 AND "userId" = $2 AND "deletedAt" IS NULL
                `, messageID, userID, newContenu)
                if err != nil {
                        return fmt.Errorf("update message: %w", err)
                }
                if ct.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "Message (ou non-auteur)", ID: messageID}
                }

                // 2. Recharge pour retourner le message édité.
                row := tx.QueryRow(ctx, `
                        SELECT "id", "conversationId", "userId", "isIA", "contenu", "contenuHtml",
                               "replyToId", "editedAt", "deletedAt", "createdAt"
                        FROM "Message" WHERE "id" = $1
                `, messageID)
                m := &domain.Message{}
                if err := row.Scan(
                        &m.ID, &m.ConversationID, &m.UserID, &m.IsIA, &m.Contenu, &m.ContenuHTML,
                        &m.ReplyToID, &m.EditedAt, &m.DeletedAt, &m.CreatedAt,
                ); err != nil {
                        return fmt.Errorf("reload edited message: %w", err)
                }
                edited = m
                return nil
        })
        if err != nil {
                return nil, err
        }
        return edited, nil
}

// SoftDeleteMessage masque un message (auteur ou modérateur).
// RLS : la policy Message_delete autorise l'auteur, l'enseignant de la conv
// (CLASSE/PROMO/EQUIPE), le responsable ou l'admin de l'établissement.
func (r *MessagerieRepository) SoftDeleteMessage(ctx context.Context, messageID, userID string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return fmt.Errorf("SoftDeleteMessage: claims manquants dans le context")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                ct, err := tx.Exec(ctx, `
                        UPDATE "Message"
                        SET "deletedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1 AND "deletedAt" IS NULL
                `, messageID)
                if err != nil {
                        return fmt.Errorf("soft delete message: %w", err)
                }
                if ct.RowsAffected() == 0 {
                        // BUGFIX (MESSAGERIE-MODERATION-IDEMPOTENT) : 0 ligne affectée peut
                        // signifier (a) le message n'existe pas, ou (b) il est déjà soft-deleté.
                        // Avant ce fix, on retournait NotFoundError dans les 2 cas → le
                        // panneau de modération affichait "Message introuvable" quand on
                        // cliquait "Masquer" sur un message déjà supprimé.
                        //
                        // Fix : vérifier si le message existe et est déjà supprimé. Si oui,
                        // retourner nil (idempotent — le message est déjà dans l'état voulu).
                        // Si le message n'existe vraiment pas, retourner NotFoundError.
                        var alreadyDeleted bool
                        err := tx.QueryRow(ctx, `
                                SELECT EXISTS(SELECT 1 FROM "Message" WHERE "id" = $1 AND "deletedAt" IS NOT NULL)
                        `, messageID).Scan(&alreadyDeleted)
                        if err != nil {
                                return fmt.Errorf("check already deleted: %w", err)
                        }
                        if alreadyDeleted {
                                // Idempotent : le message est déjà soft-deleté, pas d'erreur.
                                return nil
                        }
                        return &domain.NotFoundError{Entity: "Message", ID: messageID}
                }
                return nil
        })
}

// HideMessagesForUser masque une liste de messages pour un utilisateur (per-user).
// N'impacte pas les autres utilisateurs. Idempotent (ON CONFLICT DO NOTHING).
// Utilisé pour la sélection multiple + suppression "pour moi".
func (r *MessagerieRepository) HideMessagesForUser(ctx context.Context, messageIDs []string, userID string) error {
        if len(messageIDs) == 0 {
                return nil
        }
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return fmt.Errorf("HideMessagesForUser: claims manquants dans le context")
        }
        if claims.UserID != userID {
                return fmt.Errorf("HideMessagesForUser: userID != claims.UserID (anti-spoofing)")
        }

        return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // INSERT individuels (plus simple et compatible pooler Neon qui ne
                // supporte pas bien UNNEST avec prepared statements).
                for _, msgID := range messageIDs {
                        if _, err := tx.Exec(ctx, `
                                INSERT INTO "MessageHiddenByUser" ("messageId", "userId", "hiddenAt")
                                VALUES ($1, $2, CURRENT_TIMESTAMP)
                                ON CONFLICT ("messageId", "userId") DO NOTHING
                        `, msgID, userID); err != nil {
                                return fmt.Errorf("hide message %s for user: %w", msgID, err)
                        }
                }
                return nil
        })
}

// ClearConversationForUser masque TOUS les messages d'une conversation pour
// un utilisateur (per-user). Équivaut à "vider la conversation pour moi".
// Retourne le nombre de messages masqués.
func (r *MessagerieRepository) ClearConversationForUser(ctx context.Context, conversationID, userID string) (int, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return 0, fmt.Errorf("ClearConversationForUser: claims manquants dans le context")
        }
        if claims.UserID != userID {
                return 0, fmt.Errorf("ClearConversationForUser: userID != claims.UserID (anti-spoofing)")
        }

        var count int
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // Insérer dans MessageHiddenByUser tous les messages de la conversation
                // qui ne sont pas déjà masqués par cet utilisateur (ON CONFLICT DO NOTHING).
                ct, err := tx.Exec(ctx, `
                        INSERT INTO "MessageHiddenByUser" ("messageId", "userId", "hiddenAt")
                        SELECT m."id", $2, CURRENT_TIMESTAMP
                        FROM "Message" m
                        WHERE m."conversationId" = $1
                          AND m."deletedAt" IS NULL
                          AND NOT EXISTS (
                                SELECT 1 FROM "MessageHiddenByUser" h
                                WHERE h."messageId" = m."id" AND h."userId" = $2
                          )
                        ON CONFLICT ("messageId", "userId") DO NOTHING
                `, conversationID, userID)
                if err != nil {
                        return fmt.Errorf("clear conversation for user: %w", err)
                }
                count = int(ct.RowsAffected())
                return nil
        })
        return count, err
}

// GetMessageByID retourne un message par son ID. RLS filtre automatiquement
// (l'utilisateur doit avoir accès à la conversation parente).
func (r *MessagerieRepository) GetMessageByID(ctx context.Context, id string) (*domain.Message, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("GetMessageByID: claims manquants dans le context")
        }

        var msg *domain.Message
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        SELECT "id", "conversationId", "userId", "isIA", "contenu", "contenuHtml",
                               "replyToId", "editedAt", "deletedAt", "createdAt"
                        FROM "Message" WHERE "id" = $1
                `, id)
                m := &domain.Message{}
                if err := row.Scan(
                        &m.ID, &m.ConversationID, &m.UserID, &m.IsIA, &m.Contenu, &m.ContenuHTML,
                        &m.ReplyToID, &m.EditedAt, &m.DeletedAt, &m.CreatedAt,
                ); err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Message", ID: id}
                        }
                        return fmt.Errorf("query message: %w", err)
                }
                msg = m
                return nil
        })
        if err != nil {
                return nil, err
        }
        return msg, nil
}

// GetMessageConversationID retourne uniquement le conversationId d'un message.
// Bypass RLS (pas de db.WithTx, pas de claims posés) — utilisé par DeleteMessage
// pour le broadcast après soft-delete modérateur, quand le modérateur n'a pas
// accès à la conversation (ex: responsable modérant un salon CLASSE/PROMO).
//
// Sécurité : cette méthode ne retourne que le conversationId (pas le contenu),
// et est appelée uniquement après un soft-delete réussi (le modérateur a déjà
// été autorisé par la policy Message_update).
func (r *MessagerieRepository) GetMessageConversationID(ctx context.Context, messageID string) (string, error) {
        var conversationID string
        err := r.pool.QueryRow(ctx, `
                SELECT "conversationId" FROM "Message" WHERE "id" = $1
        `, messageID).Scan(&conversationID)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return "", &domain.NotFoundError{Entity: "Message", ID: messageID}
                }
                return "", fmt.Errorf("get message conversation id: %w", err)
        }
        return conversationID, nil
}

// ============================================================
// PIÈCES JOINTES
// ============================================================

// CreateAttachment insère une pièce jointe pour un message.
// RLS : la policy Attachment_insert exige que le message parent appartienne à
// l'utilisateur courant.
func (r *MessagerieRepository) CreateAttachment(ctx context.Context, att *domain.MessageAttachment) (*domain.MessageAttachment, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("CreateAttachment: claims manquants dans le context")
        }

        if att.ID == "" {
                att.ID = uuid.New().String()
        }
        now := time.Now()
        att.CreatedAt = now

        var created *domain.MessageAttachment
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "MessageAttachment" ("id", "messageId", "type", "url", "filename", "mimeType", "size", "createdAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, att.ID, att.MessageID, att.Type, att.URL, att.Filename, att.MimeType, att.Size, now); err != nil {
                        return fmt.Errorf("insert attachment: %w", err)
                }

                // Recharge pour peupler les champs DB.
                row := tx.QueryRow(ctx, `
                        SELECT "id", "messageId", "type"::text, "url", "filename", "mimeType", "size", "createdAt"
                        FROM "MessageAttachment" WHERE "id" = $1
                `, att.ID)
                a := &domain.MessageAttachment{}
                var typeStr string
                if err := row.Scan(
                        &a.ID, &a.MessageID, &typeStr, &a.URL, &a.Filename, &a.MimeType, &a.Size, &a.CreatedAt,
                ); err != nil {
                        return fmt.Errorf("reload attachment: %w", err)
                }
                a.Type = domain.MessageAttachmentType(typeStr)
                created = a
                return nil
        })
        if err != nil {
                return nil, err
        }
        return created, nil
}

// ListAttachmentsByMessage retourne toutes les pièces jointes d'un message.
// RLS : hérite de la visibilité du message parent.
func (r *MessagerieRepository) ListAttachmentsByMessage(ctx context.Context, messageID string) ([]*domain.MessageAttachment, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ListAttachmentsByMessage: claims manquants dans le context")
        }

        var result []*domain.MessageAttachment
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, `
                        SELECT "id", "messageId", "type"::text, "url", "filename", "mimeType", "size", "createdAt"
                        FROM "MessageAttachment"
                        WHERE "messageId" = $1
                        ORDER BY "createdAt" ASC
                `, messageID)
                if err != nil {
                        return fmt.Errorf("query attachments: %w", err)
                }
                defer rows.Close()
                for rows.Next() {
                        a := &domain.MessageAttachment{}
                        var typeStr string
                        if err := rows.Scan(
                                &a.ID, &a.MessageID, &typeStr, &a.URL, &a.Filename, &a.MimeType, &a.Size, &a.CreatedAt,
                        ); err != nil {
                                return fmt.Errorf("scan attachment: %w", err)
                        }
                        a.Type = domain.MessageAttachmentType(typeStr)
                        result = append(result, a)
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        if result == nil {
                result = []*domain.MessageAttachment{}
        }
        return result, nil
}

// ============================================================
// SIGNALEMENTS
// ============================================================

// Signal crée un signalement pour un message. Statut par défaut = 'OUVERT'.
// RLS : la policy Signalement_insert exige userId = current_user_id().
//
// Note : la contrainte unique (messageId, userId) interdit de signaler 2x le
// même message → on renvoie une ConflictError explicite en cas de duplicate.
func (r *MessagerieRepository) Signal(ctx context.Context, s *domain.MessageSignalement) (*domain.MessageSignalement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("Signal: claims manquants dans le context")
        }
        if claims.UserID != s.UserID {
                return nil, fmt.Errorf("Signal: s.UserID != claims.UserID (anti-spoofing)")
        }

        if s.ID == "" {
                s.ID = uuid.New().String()
        }
        if s.Statut == "" {
                s.Statut = domain.SignalementStatutOuvert
        }
        now := time.Now()
        s.CreatedAt = now

        var created *domain.MessageSignalement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "MessageSignalement" ("id", "messageId", "userId", "raison", "commentaire",
                                                         "statut", "createdAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, s.ID, s.MessageID, s.UserID, s.Raison, s.Commentaire, s.Statut, now); err != nil {
                        // Détection du duplicate (uk_signal_msg_user) — on laisse l'erreur
                        // remonter telle quelle, le usecase/handler la traduira.
                        return fmt.Errorf("insert signalement: %w", err)
                }

                // Recharge pour peupler les champs DB (statut default, resolvedAt/By NULL).
                row := tx.QueryRow(ctx, `
                        SELECT "id", "messageId", "userId", "raison"::text, "commentaire",
                               "statut"::text, "resolvedAt", "resolvedBy", "createdAt"
                        FROM "MessageSignalement" WHERE "id" = $1
                `, s.ID)
                sg, err := scanSignalement(row)
                if err != nil {
                        return fmt.Errorf("reload signalement: %w", err)
                }
                created = sg
                return nil
        })
        if err != nil {
                return nil, err
        }
        return created, nil
}

// scanSignalement scanne une ligne de MessageSignalement. Les enums raison et
// statut sont castés en text côté SQL puis convertis en types domain.
func scanSignalement(s scanner) (*domain.MessageSignalement, error) {
        sg := &domain.MessageSignalement{}
        var raisonStr, statutStr string
        if err := s.Scan(
                &sg.ID, &sg.MessageID, &sg.UserID, &raisonStr, &sg.Commentaire,
                &statutStr, &sg.ResolvedAt, &sg.ResolvedBy, &sg.CreatedAt,
        ); err != nil {
                return nil, err
        }
        sg.Raison = domain.SignalementRaison(raisonStr)
        sg.Statut = domain.SignalementStatut(statutStr)
        return sg, nil
}

// ListSignalements liste les signalements d'un établissement, optionnellement
// filtrés par statut. JOIN Message + Conversation pour filtrer par étab.
//
// RLS : la policy Signalement_select autorise :
//   - l'auteur du signalement (userId = current_user_id())
//   - le responsable de l'établissement
//   - l'admin (si admin_has_etablissement_access)
//
// Le filtre explicite c."etablissementId" = $1 redondant avec RLS garantit
// que même si RLS est désactivé, on ne sort pas de l'établissement demandé.
func (r *MessagerieRepository) ListSignalements(ctx context.Context, etablissementID string, statut *domain.SignalementStatut) ([]*domain.MessageSignalement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ListSignalements: claims manquants dans le context")
        }

        var result []*domain.MessageSignalement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                args := []any{etablissementID}
                where := `WHERE c."etablissementId" = $1`
                if statut != nil && *statut != "" {
                        where += fmt.Sprintf(` AND s."statut" = $%d`, len(args)+1)
                        args = append(args, string(*statut))
                }
                // MESSAGERIE-MODERATION-AUTO : exclure les signalements OUVERT/EN_COURS
                // dont le message a déjà été soft-deleté (modéré). Ces signalements sont
                // obsolètes — le message est déjà masqué.
                where += ` AND NOT (s."statut" IN ('OUVERT', 'EN_COURS') AND m."deletedAt" IS NOT NULL)`
                // MESSAGERIE-MODERATION-PURGE : exclure les signalements RESOLU/REJETE
                // de plus de 7 jours (basé sur resolvedAt si présent, sinon createdAt).
                // La liste "Résolus" ne conserve que les 7 derniers jours pour faciliter
                // la gestion des nouveaux signalements.
                where += ` AND NOT (s."statut" IN ('RESOLU', 'REJETE') AND COALESCE(s."resolvedAt", s."createdAt") < CURRENT_TIMESTAMP - INTERVAL '7 days')`

                // Hard-delete à la volée des signalements expirés (> 7 jours RESOLU/REJETE)
                // pour éviter l'accumulation en DB. Best-effort : si le DELETE échoue,
                // le filtre WHERE ci-dessus les exclut quand même de la liste.
                _, _ = tx.Exec(ctx, `
                        DELETE FROM "MessageSignalement"
                        WHERE "statut" IN ('RESOLU', 'REJETE')
                          AND COALESCE("resolvedAt", "createdAt") < CURRENT_TIMESTAMP - INTERVAL '7 days'
                `)

                query := fmt.Sprintf(`
                        SELECT s."id", s."messageId", s."userId", s."raison"::text, s."commentaire",
                               s."statut"::text, s."resolvedAt", s."resolvedBy", s."createdAt"
                        FROM "MessageSignalement" s
                        JOIN "Message" m ON m."id" = s."messageId"
                        JOIN "Conversation" c ON c."id" = m."conversationId"
                        %s
                        ORDER BY s."createdAt" DESC
                `, where)

                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query signalements: %w", err)
                }
                defer rows.Close()
                for rows.Next() {
                        sg, err := scanSignalement(rows)
                        if err != nil {
                                return fmt.Errorf("scan signalement: %w", err)
                        }
                        result = append(result, sg)
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        if result == nil {
                result = []*domain.MessageSignalement{}
        }
        return result, nil
}

// ResolveSignalement marque un signalement comme résolu (ou rejeté) par
// resolverID. RLS : la policy Signalement_update autorise responsable/admin.
func (r *MessagerieRepository) ResolveSignalement(ctx context.Context, id, resolverID string, statut domain.SignalementStatut) (*domain.MessageSignalement, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ResolveSignalement: claims manquants dans le context")
        }
        if claims.UserID != resolverID {
                return nil, fmt.Errorf("ResolveSignalement: resolverID != claims.UserID (anti-spoofing)")
        }

        var resolved *domain.MessageSignalement
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                ct, err := tx.Exec(ctx, `
                        UPDATE "MessageSignalement"
                        SET "statut" = $3, "resolvedAt" = CURRENT_TIMESTAMP, "resolvedBy" = $2
                        WHERE "id" = $1
                `, id, resolverID, statut)
                if err != nil {
                        return fmt.Errorf("update signalement: %w", err)
                }
                if ct.RowsAffected() == 0 {
                        return &domain.NotFoundError{Entity: "MessageSignalement", ID: id}
                }

                // Recharge pour retourner le signalement à jour.
                row := tx.QueryRow(ctx, `
                        SELECT "id", "messageId", "userId", "raison"::text, "commentaire",
                               "statut"::text, "resolvedAt", "resolvedBy", "createdAt"
                        FROM "MessageSignalement" WHERE "id" = $1
                `, id)
                sg, err := scanSignalement(row)
                if err != nil {
                        return fmt.Errorf("reload resolved signalement: %w", err)
                }
                resolved = sg
                return nil
        })
        if err != nil {
                return nil, err
        }
        return resolved, nil
}

// ============================================================
// DM ELIGIBILITY
// ============================================================

// CanStudentDMEnseignant vérifie si l'enseignant a au moins une épreuve à
// laquelle l'étudiant est inscrit (anti-spam : un étudiant ne peut DM que ses
// enseignants, pas n'importe quel enseignant de la plateforme).
//
// La query joint SessionPassation + Epreuve pour vérifier le lien
// étudiant ↔ enseignant via les épreuves non supprimées.
//
// RLS : SessionPassation et Epreuve ont leurs propres policies RLS — un étudiant
// ne voit que ses propres sessions, un enseignant que ses propres épreuves.
// Cette query est exécutée avec les claims de l'étudiant (current_user_id =
// etudiantID), donc RLS permet la lecture de SessionPassation où
// etudiantId = current_user_id() → cohérent.
func (r *MessagerieRepository) CanStudentDMEnseignant(ctx context.Context, etudiantID, enseignantID string) (bool, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return false, fmt.Errorf("CanStudentDMEnseignant: claims manquants dans le context")
        }
        // Sécurité : seuls l'étudiant lui-même (ou un admin/system) peut faire ce check.
        if claims.UserID != etudiantID && claims.Role != "ADMIN" {
                return false, fmt.Errorf("CanStudentDMEnseignant: etudiantID != claims.UserID (anti-spoofing)")
        }

        var allowed bool
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT EXISTS (
                                SELECT 1
                                FROM "SessionPassation" s
                                JOIN "Epreuve" e ON e."id" = s."epreuveId"
                                WHERE s."etudiantId" = $1
                                  AND e."enseignantId" = $2
                                  AND e."deletedAt" IS NULL
                        )
                `, etudiantID, enseignantID).Scan(&allowed)
        })
        if err != nil {
                return false, fmt.Errorf("CanStudentDMEnseignant: %w", err)
        }
        return allowed, nil
}

// IsUserStudentInSameEtablissement vérifie si targetUserID est un étudiant
// (role = ETUDIANT) appartenant à etablissementID. Utilisé pour autoriser les
// DM étudiant ↔ étudiant au sein d'un même établissement (même filière ou non,
// même niveau ou non — tout étudiant du même étab).
func (r *MessagerieRepository) IsUserStudentInSameEtablissement(ctx context.Context, targetUserID, etablissementID string) (bool, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return false, fmt.Errorf("IsUserStudentInSameEtablissement: claims manquants dans le context")
        }

        var isStudent bool
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                err := tx.QueryRow(ctx, `
                        SELECT EXISTS(
                                SELECT 1 FROM "User" u
                                WHERE u."id" = $1
                                  AND u."role" = 'ETUDIANT'
                                  AND u."etablissementId" = $2
                                  AND u."actif" = true
                        )
                `, targetUserID, etablissementID).Scan(&isStudent)
                if err != nil {
                        return fmt.Errorf("query IsUserStudentInSameEtablissement: %w", err)
                }
                return nil
        })
        if err != nil {
                return false, err
        }
        return isStudent, nil
}

// ============================================================
// RÉACTIONS ÉMOJIS (Niveau 2)
// ============================================================

// ToggleReaction ajoute ou retire la réaction de l'utilisateur sur un message.
// Toggle : si la réaction (messageId, userId, emoji) existe déjà → DELETE + retourne
// (false, nil, nil) "removed". Sinon → INSERT + retourne (true, reaction, nil) "added".
// RLS : policy Reaction_insert exige userId = current_user_id() ET accès au message.
// La contrainte unique uk_reaction_msg_user_emoji garantit l'idempotence du toggle.
func (r *MessagerieRepository) ToggleReaction(ctx context.Context, messageID, userID, emoji string) (bool, *domain.MessageReaction, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return false, nil, fmt.Errorf("ToggleReaction: claims manquants dans le context")
        }
        if claims.UserID != userID {
                return false, nil, fmt.Errorf("ToggleReaction: userID != claims.UserID (anti-spoofing)")
        }
        if emoji == "" {
                return false, nil, fmt.Errorf("ToggleReaction: emoji requis")
        }

        var added bool
        var reaction *domain.MessageReaction
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // 1. Tente l'INSERT. Si la contrainte unique est violée → la réaction
                //    existe déjà → on la DELETE (toggle off).
                reactionID := uuid.New().String()
                _, insertErr := tx.Exec(ctx, `
                        INSERT INTO "MessageReaction" ("id", "messageId", "userId", "emoji", "createdAt")
                        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                        ON CONFLICT ("messageId", "userId", "emoji") DO NOTHING
                `, reactionID, messageID, userID, emoji)
                if insertErr != nil {
                        return fmt.Errorf("insert reaction: %w", insertErr)
                }

                // 2. Vérifie si l'INSERT a réussi (la réaction est maintenant présente).
                var insertedID, insertedEmoji string
                var insertedAt time.Time
                queryErr := tx.QueryRow(ctx, `
                        SELECT "id", "emoji", "createdAt"
                        FROM "MessageReaction"
                        WHERE "messageId" = $1 AND "userId" = $2 AND "emoji" = $3
                `, messageID, userID, emoji).Scan(&insertedID, &insertedEmoji, &insertedAt)

                if queryErr == nil && insertedID == reactionID {
                        // L'INSERT a réussi (notre ID généré est présent) → ajout.
                        added = true
                        reaction = &domain.MessageReaction{
                                ID:        insertedID,
                                MessageID: messageID,
                                UserID:    userID,
                                Emoji:     insertedEmoji,
                                CreatedAt: insertedAt,
                        }
                        return nil
                }
                if queryErr != nil && queryErr != pgx.ErrNoRows {
                        return fmt.Errorf("query reaction after insert: %w", queryErr)
                }

                // 3. L'INSERT n'a pas réussi (conflit → la réaction existait déjà).
                //    On la DELETE (toggle off). RLS : policy Reaction_delete exige
                //    userId = current_user_id().
                _, delErr := tx.Exec(ctx, `
                        DELETE FROM "MessageReaction"
                        WHERE "messageId" = $1 AND "userId" = $2 AND "emoji" = $3
                `, messageID, userID, emoji)
                if delErr != nil {
                        return fmt.Errorf("delete reaction (toggle off): %w", delErr)
                }
                added = false
                return nil
        })
        if err != nil {
                return false, nil, err
        }
        return added, reaction, nil
}

// ListReactionsByMessageIDs récupère toutes les réactions pour une liste de
// messages et les agrège en map[messageID][]ReactionSummary (1 summary par
// émoji distinct, avec count, userIds, reactedByMe).
//
// Évite le problème N+1 : au lieu de 1 query par message, on fait 1 seule query
// pour tous les messageIds, puis on agrège en Go.
//
// Si messageIDs est vide, retourne une map vide (pas de query).
func (r *MessagerieRepository) ListReactionsByMessageIDs(ctx context.Context, messageIDs []string, userID string) (map[string][]domain.ReactionSummary, error) {
        result := map[string][]domain.ReactionSummary{}
        if len(messageIDs) == 0 {
                return result, nil
        }

        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("ListReactionsByMessageIDs: claims manquants dans le context")
        }

        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // 1 query pour toutes les réactions des messageIDs.
                rows, err := tx.Query(ctx, `
                        SELECT "messageId", "emoji", "userId"
                        FROM "MessageReaction"
                        WHERE "messageId" = ANY($1)
                        ORDER BY "messageId", "emoji", "createdAt"
                `, messageIDs)
                if err != nil {
                        return fmt.Errorf("query reactions: %w", err)
                }
                defer rows.Close()

                // Agrégation temporaire : map[messageID]map[emoji]struct{count, userIds, reactedByMe}
                type agg struct {
                        count        int
                        userIds      []string
                        reactedByMe  bool
                }
                temp := map[string]map[string]*agg{}

                for rows.Next() {
                        var msgID, emoji, reactorID string
                        if err := rows.Scan(&msgID, &emoji, &reactorID); err != nil {
                                return fmt.Errorf("scan reaction: %w", err)
                        }
                        if temp[msgID] == nil {
                                temp[msgID] = map[string]*agg{}
                        }
                        a, exists := temp[msgID][emoji]
                        if !exists {
                                a = &agg{}
                                temp[msgID][emoji] = a
                        }
                        a.count++
                        a.userIds = append(a.userIds, reactorID)
                        if reactorID == userID {
                                a.reactedByMe = true
                        }
                }
                if err := rows.Err(); err != nil {
                        return fmt.Errorf("rows.Err after reactions scan: %w", err)
                }

                // Conversion en map[messageID][]ReactionSummary.
                for msgID, byEmoji := range temp {
                        summaries := make([]domain.ReactionSummary, 0, len(byEmoji))
                        for emoji, a := range byEmoji {
                                summaries = append(summaries, domain.ReactionSummary{
                                        Emoji:        emoji,
                                        Count:        a.count,
                                        UserIDs:      a.userIds,
                                        ReactedByMe:  a.reactedByMe,
                                })
                        }
                        result[msgID] = summaries
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}
