// Package repository contient les implémentations concrètes des interfaces
// du domaine, utilisant pgx pour accéder à Neon Postgres.
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/apps/api/internal/db"
	"github.com/udevrard7/sect/apps/api/internal/domain"
)

// UserRepository implémente domain.UserRepository avec pgx.
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository crée un nouveau UserRepository.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// FindByID récupère un utilisateur par son ID.
// Les claims RLS sont extraites du context et posées sur la transaction.
// RLS garantit que l'utilisateur ne peut voir que les profils autorisés
// par son rôle (self pour ETUDIANT, établissement pour RESPONSABLE, etc.).
func (r *UserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var user *domain.User
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
			       "image", "actif", "mustChangePwd", "niveau"
			FROM "User"
			WHERE "id" = $1
		`, id)

		u, err := scanUser(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "User", ID: id}
			}
			return fmt.Errorf("query user: %w", err)
		}
		user = u
		return nil
	})

	if err != nil {
		return nil, err
	}
	return user, nil
}

// FindByEmail récupère un utilisateur par son email (pour l'authentification).
// L'auth contourne le RLS (SET LOCAL row_security = off) car elle s'exécute
// avant que les claims de session ne soient posées.
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Bypass RLS pour l'auth (avant pose des claims)
	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	row := tx.QueryRow(ctx, `
		SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
		       "image", "actif", "mustChangePwd", "niveau"
		FROM "User"
		WHERE "email" = $1 AND "actif" = true
	`, email)

	user, err := scanUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "User", ID: email}
		}
		return nil, fmt.Errorf("query user by email: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return user, nil
}

// ListByEtablissement liste les utilisateurs d'un établissement.
// Les claims RLS doivent être posées (RESPONSABLE/ADMIN avec accès).
func (r *UserRepository) ListByEtablissement(ctx context.Context, etablissementID string) ([]*domain.User, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var users []*domain.User
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
			       "image", "actif", "mustChangePwd", "niveau"
			FROM "User"
			WHERE "etablissementId" = $1
			ORDER BY "name"
		`, etablissementID)
		if err != nil {
			return fmt.Errorf("query users: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			user, err := scanUser(rows)
			if err != nil {
				return fmt.Errorf("scan user: %w", err)
			}
			users = append(users, user)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return users, nil
}

// scanner est l'interface commune entre pgx.Row et pgx.Rows.
type scanner interface {
	Scan(dest ...any) error
}

func scanUser(s scanner) (*domain.User, error) {
	u := &domain.User{}
	err := s.Scan(
		&u.ID,
		&u.Email,
		&u.Name,
		&u.Role,
		&u.EtablissementID,
		&u.FiliereID,
		&u.Image,
		&u.Actif,
		&u.MustChangePwd,
		&u.Niveau,
	)
	if err != nil {
		return nil, err
	}
	return u, nil
}
