// Package repository — implémentation BadgeProgressionRepository
// (ADR-0008 §3, bibliothèque P4 : badges « lecteur assidu »).
//
// Le PREMIER writer de BadgeProgression du backend Go : les 31 lignes
// historiques viennent de l'ancienne stack Prisma, aucun code Go
// n'écrivait la table (POST /api/badges était un no-op documenté).
//
// RLS : BadgeProgression_select_self / _modify_system (000128) — self
// OU is_system ; l'évaluation tourne sous les claims du lecteur
// (userId = self), un futur worker passerait par is_system.
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// BadgeProgressionRepository implémente domain.BadgeProgressionRepository.
type BadgeProgressionRepository struct {
	pool *pgxpool.Pool
}

// NewBadgeProgressionRepository crée un nouveau BadgeProgressionRepository.
func NewBadgeProgressionRepository(pool *pgxpool.Pool) *BadgeProgressionRepository {
	return &BadgeProgressionRepository{pool: pool}
}

// GetByCle — l'état courant de la progression d'un user pour un badge
// (résolu par cle) ; (nil, nil) = aucune progression.
func (r *BadgeProgressionRepository) GetByCle(ctx context.Context, userID, cle string) (*domain.BadgeProgressionSnapshot, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("GetByCle badge: claims manquants dans le context")
	}
	var out *domain.BadgeProgressionSnapshot
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
                        SELECT bp."niveauActuel"::text, bp."valeurActuelle", bp."debloque", bp."dateObtention"
                        FROM "BadgeProgression" bp
                        JOIN "BadgeDefinition" bd ON bd."id" = bp."badgeDefinitionId"
                        WHERE bp."userId" = $1 AND bd."cle" = $2`,
			userID, cle)
		var s domain.BadgeProgressionSnapshot
		err := row.Scan(&s.NiveauActuel, &s.ValeurActuelle, &s.Debloque, &s.DateObtention)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil // aucune progression — pas une erreur
			}
			return fmt.Errorf("scan badge progression: %w", err)
		}
		out = &s
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// UpsertByCle — insert ou update de la progression (ON CONFLICT
// ("userId","badgeDefinitionId") — UNIQUE 000003). Dernier écrivain
// gagne : la métrique est recomputée depuis OuvrageLecture, l'upsert
// est idempotent.
func (r *BadgeProgressionRepository) UpsertByCle(ctx context.Context, userID, cle string, in domain.BadgeProgressionUpsert) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return fmt.Errorf("UpsertByCle badge: claims manquants dans le context")
	}
	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
                        INSERT INTO "BadgeProgression"
                                ("id", "userId", "badgeDefinitionId", "niveauActuel", "valeurActuelle",
                                 "valeurPalier", "valeurProchain", "debloque", "dateObtention", "createdAt", "updatedAt")
                        VALUES ($1, $2, (SELECT "id" FROM "BadgeDefinition" WHERE "cle" = $3),
                                $4::"NiveauBadge", $5, $6, $7, $8, $9, now(), now())
                        ON CONFLICT ("userId", "badgeDefinitionId")
                        DO UPDATE SET
                                "niveauActuel"   = EXCLUDED."niveauActuel",
                                "valeurActuelle" = EXCLUDED."valeurActuelle",
                                "valeurPalier"   = EXCLUDED."valeurPalier",
                                "valeurProchain" = EXCLUDED."valeurProchain",
                                "debloque"       = EXCLUDED."debloque",
                                "dateObtention"  = EXCLUDED."dateObtention",
                                "updatedAt"      = now()`,
			uuid.NewString(), userID, cle,
			in.NiveauActuel, in.ValeurActuelle, in.ValeurPalier,
			in.ValeurProchain, in.Debloque, in.DateObtention)
		if err != nil {
			return fmt.Errorf("upsert badge progression: %w", err)
		}
		return nil
	})
}
