// Package domain contient les entités métier et les interfaces de repository.
// Cette couche ne dépend d'aucun framework ni base de données — elle définit
// uniquement le contrat métier (Clean Architecture : couche la plus interne).
package domain

import (
        "context"
        "fmt"
)

// Role représente les rôles utilisateur de la plateforme SECT.
type Role string

const (
        RoleAdmin       Role = "ADMIN"
        RoleResponsable Role = "RESPONSABLE"
        RoleEnseignant  Role = "ENSEIGNANT"
        RoleEtudiant    Role = "ETUDIANT"
)

// User est l'entité utilisateur centrale.
// Les champs correspondent aux colonnes de la table "User" en base.
type User struct {
        ID              string `json:"id"`
        Email           string `json:"email"`
        Name            string `json:"name"`
        Role            Role   `json:"role"`
        EtablissementID *string `json:"etablissementId,omitempty"`
        FiliereID       *string `json:"filiereId,omitempty"`
        Image           *string `json:"image,omitempty"`
        Actif           bool   `json:"actif"`
        MustChangePwd   bool   `json:"mustChangePwd"`
        Niveau          *string `json:"niveau,omitempty"`
}

// UserRepository définit l'interface pour accéder aux utilisateurs.
// L'implémentation concrète (repository/pgx) utilisera pgx + RLS.
type UserRepository interface {
        // FindByID récupère un utilisateur par son ID.
        // Les claims RLS doivent être posées avant l'appel.
        FindByID(ctx context.Context, id string) (*User, error)

        // FindByEmail récupère un utilisateur par son email (pour l'auth).
        FindByEmail(ctx context.Context, email string) (*User, error)

        // ListByEtablissement liste les utilisateurs d'un établissement.
        ListByEtablissement(ctx context.Context, etablissementID string) ([]*User, error)
}

// Error types du domaine
type NotFoundError struct {
        Entity string
        ID     string
}

func (e *NotFoundError) Error() string {
        return fmt.Sprintf("%s not found: %s", e.Entity, e.ID)
}

type UnauthorizedError struct {
        Message string
}

func (e *UnauthorizedError) Error() string {
        return e.Message
}
