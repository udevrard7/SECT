// Package usecase contient la logique métier — orchestre les repositories
// et applique les règles business. C'est la couche qui consomme le domaine.
package usecase

import (
	"context"

	"github.com/udevrard7/sect/apps/api/internal/db"
	"github.com/udevrard7/sect/apps/api/internal/domain"
)

// UserUseCase implémente les cas d'usage liés aux utilisateurs.
type UserUseCase struct {
	userRepo domain.UserRepository
}

// NewUserUseCase crée un nouveau UserUseCase.
func NewUserUseCase(userRepo domain.UserRepository) *UserUseCase {
	return &UserUseCase{userRepo: userRepo}
}

// GetProfile récupère le profil de l'utilisateur courant.
// Utilise les claims RLS pour filtrer l'accès (RLS garantit que
// l'utilisateur ne peut voir que son propre profil, sauf si ADMIN
// avec autorisation EtablissementAccess).
func (uc *UserUseCase) GetProfile(ctx context.Context, claims db.SessionClaims) (*domain.User, error) {
	user, err := uc.userRepo.FindByID(ctx, claims.UserID)
	if err != nil {
		return nil, err
	}
	return user, nil
}
