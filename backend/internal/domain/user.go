// Package domain — entités et ports liés aux utilisateurs.
package domain

import (
        "context"
        "time"
)

// Role représente les rôles utilisateur de la plateforme SECT.
type Role string

const (
        RoleAdmin       Role = "ADMIN"
        RoleResponsable Role = "RESPONSABLE"
        RoleEnseignant  Role = "ENSEIGNANT"
        RoleEtudiant    Role = "ETUDIANT"
)

// NiveauEtude représente les niveaux académiques.
type NiveauEtude string

const (
        NiveauL1       NiveauEtude = "L1"
        NiveauL2       NiveauEtude = "L2"
        NiveauL3       NiveauEtude = "L3"
        NiveauM1       NiveauEtude = "M1"
        NiveauM2       NiveauEtude = "M2"
        NiveauDoctorat NiveauEtude = "DOCTORAT"
)

// User est l'entité utilisateur centrale.
type User struct {
        ID                string     `json:"id"`
        Email             string     `json:"email"`
        Name              string     `json:"name"`
        Role              Role       `json:"role"`
        EtablissementID   *string    `json:"etablissementId,omitempty"`
        FiliereID         *string    `json:"filiereId,omitempty"`
        Image             *string    `json:"image,omitempty"`
        Actif             bool       `json:"actif"`
        MustChangePwd     bool       `json:"mustChangePwd"`
        Matricule         *string    `json:"matricule,omitempty"`
        Niveau            *string    `json:"niveau,omitempty"`
        DerniereConnexion *time.Time `json:"derniereConnexion,omitempty"`
        CreatedAt         time.Time  `json:"createdAt"`
        UpdatedAt         time.Time  `json:"updatedAt"`
        // Relations (peuvent être nil)
        Etablissement *EtablissementRef `json:"etablissement,omitempty"`
        Filiere       *FiliereRef       `json:"filiere,omitempty"`
}

// EtablissementRef est une référence légère à un établissement (pour les réponses API).
type EtablissementRef struct {
        ID  string `json:"id"`
        Nom string `json:"nom"`
}

// FiliereRef est une référence légère à une filière.
type FiliereRef struct {
        ID   string `json:"id"`
        Nom  string `json:"nom"`
        Code string `json:"code"`
}

// UserListParams contient les paramètres de filtrage/pagination pour lister les users.
type UserListParams struct {
        Search          string // recherche insensible sur name + email
        Role            string // filtre par rôle
        Actif           *bool  // filtre par statut actif
        EtablissementID string // filtre par établissement
        FiliereID       string // filtre par filière
        Niveau          string // ETUDIANTS-FIX-E5 : filtre par niveau (L1/L2/L3/M1/M2/DOCTORAT)
        Page            int    // 1-based
        Limit           int    // default 20
}

// UserListResult est le résultat paginé d'une liste d'utilisateurs.
type UserListResult struct {
        Users []*User `json:"users"`
        Total int     `json:"total"`
        Page  int     `json:"page"`
        Limit int     `json:"limit"`
}

// CreateUserInput contient les données pour créer un utilisateur.
type CreateUserInput struct {
        Name            string  `json:"name"`
        Email           string  `json:"email"`
        Password        string  `json:"password"`
        Role            Role    `json:"role"`
        EtablissementID *string `json:"etablissementId,omitempty"`
        FiliereID       *string `json:"filiereId,omitempty"`
        Actif           *bool   `json:"actif,omitempty"`
        Matricule       *string `json:"matricule,omitempty"`
        Niveau          *string `json:"niveau,omitempty"`
        MustChangePwd   *bool   `json:"mustChangePwd,omitempty"` // ETUDIANTS-FIX-E3
}

// UpdateUserInput contient les champs optionnels pour mettre à jour un utilisateur.
type UpdateUserInput struct {
        Name            *string `json:"name,omitempty"`
        Email           *string `json:"email,omitempty"`
        Role            *Role   `json:"role,omitempty"`
        EtablissementID *string `json:"etablissementId,omitempty"`
        FiliereID       *string `json:"filiereId,omitempty"`
        Actif           *bool   `json:"actif,omitempty"`
        Password        *string `json:"password,omitempty"`
        Matricule       *string `json:"matricule,omitempty"`
        Niveau          *string `json:"niveau,omitempty"`
}

// UserRepository définit l'interface pour accéder aux utilisateurs.
type UserRepository interface {
        // FindByID récupère un utilisateur par son ID (RLS actif).
        FindByID(ctx context.Context, id string) (*User, error)

        // FindByEmail récupère un utilisateur par son email (pour l'auth).
        FindByEmail(ctx context.Context, email string) (*User, error)

        // List liste les utilisateurs selon les params (RLS filtre par établissement).
        List(ctx context.Context, params UserListParams) (*UserListResult, error)

        // Create crée un nouvel utilisateur.
        Create(ctx context.Context, input CreateUserInput, passwordHash string) (*User, error)

        // Update met à jour un utilisateur (partial update).
        Update(ctx context.Context, id string, input UpdateUserInput, passwordHash *string) (*User, error)

        // Delete supprime un utilisateur (hard delete avec cascade manuel).
        Delete(ctx context.Context, id string) error

        // CountByEtablissement compte les utilisateurs d'un établissement.
        CountByEtablissement(ctx context.Context, etablissementID string) (int, error)
}

// UserDependencyCounter est une interface optionnelle implémentée par le repo
// pour compter les dépendances d'un user avant suppression (ETUDIANTS-FIX-E4).
// Le usecase fait un type assertion : si le repo implémente cette interface,
// on compte les deps ; sinon on retourne des 0.
type UserDependencyCounter interface {
        CountDependencies(ctx context.Context, userID string) (sessions, reponses, soumissions int, err error)
}

// Permission helpers

// CreatableRoles définit la matrice de permissions : qui peut créer quel rôle.
var CreatableRoles = map[Role][]Role{
        RoleAdmin:       {RoleResponsable},
        RoleResponsable: {RoleEnseignant, RoleEtudiant},
        RoleEnseignant:  {},
        RoleEtudiant:    {},
}

// CanCreate vérifie si un créateur peut créer un utilisateur du rôle donné.
func CanCreate(creatorRole Role, targetRole Role) bool {
        allowed, ok := CreatableRoles[creatorRole]
        if !ok {
                return false
        }
        for _, r := range allowed {
                if r == targetRole {
                        return true
                }
        }
        return false
}

// Error types du domaine
type NotFoundError struct {
        Entity string
        ID     string
}

func (e *NotFoundError) Error() string {
        return e.Entity + " not found: " + e.ID
}

type ConflictError struct {
        Message string
}

func (e *ConflictError) Error() string { return e.Message }

type ValidationError struct {
        Field   string
        Message string
}

func (e *ValidationError) Error() string {
        return e.Field + ": " + e.Message
}

type UnauthorizedError struct {
        Message string
}

func (e *UnauthorizedError) Error() string { return e.Message }
