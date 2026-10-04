// Package domain — OuvrageSection : le TOC curaté par l'ADMIN
// (ADR-0007 §P3, migration 000126). Une section = une entrée de table des
// matières d'un ouvrage de la bibliothèque : elle permet à l'enseignant de
// cibler sa déclaration d'alignement au chapitre/section pertinent.
//
// Gouvernance G1 : dépôt/édition réservés à l'ADMIN (policies
// OuvrageSection_insert/update/delete 000126) ; lecture = tous les rôles
// de l'établissement via délégation à Ouvrage_select (EXISTS parent).
//
// Pas de soft delete : le TOC est une métadonnée légère — un DELETE réel
// conserve les alignements (FK ON DELETE SET NULL → ouvrageSectionId NULL,
// la déclaration « ouvrage entier » reste valide).
package domain

import (
	"context"
	"time"
)

// OuvrageSection — entrée du TOC d'un ouvrage.
type OuvrageSection struct {
	ID        string    `json:"id"`
	OuvrageID string    `json:"ouvrageId"`
	Titre     string    `json:"titre"`
	PageDebut *int      `json:"pageDebut,omitempty"`
	PageFin   *int      `json:"pageFin,omitempty"`
	Ordre     int       `json:"ordre"`
	CreatedAt time.Time `json:"createdAt"`
}

// CreateOuvrageSectionInput — création (ADMIN).
type CreateOuvrageSectionInput struct {
	OuvrageID string `json:"ouvrageId"`
	Titre     string `json:"titre"`
	PageDebut *int   `json:"pageDebut,omitempty"`
	PageFin   *int   `json:"pageFin,omitempty"`
	Ordre     int    `json:"ordre"`
}

// UpdateOuvrageSectionInput — PATCH tri-state (pattern UpdateOuvrageInput) :
// pointeur non-nil = nouvelle valeur ; UnsetPageDebut/UnsetPageFin = NULL.
type UpdateOuvrageSectionInput struct {
	Titre          *string `json:"titre,omitempty"`
	PageDebut      *int    `json:"pageDebut,omitempty"`
	UnsetPageDebut bool    `json:"-"`
	PageFin        *int    `json:"pageFin,omitempty"`
	UnsetPageFin   bool    `json:"-"`
	Ordre          *int    `json:"ordre,omitempty"`
}

// OuvrageSectionRepository interface (000126).
type OuvrageSectionRepository interface {
	// ListByOuvrage — TOC ordonné (RLS : etab-scoped via parent Ouvrage).
	ListByOuvrage(ctx context.Context, ouvrageID string) ([]*OuvrageSection, error)
	// Create — ADMIN (G1). FK ouvrageId invisible/invalide → 42501/23503.
	Create(ctx context.Context, input CreateOuvrageSectionInput) (*OuvrageSection, error)
	// Update — PATCH tri-state (ADMIN). 0 ligne RLS → NotFound.
	Update(ctx context.Context, id string, input UpdateOuvrageSectionInput) (*OuvrageSection, error)
	// Delete — DELETE réel (métadonnée légère, ADMIN ; les alignements
	// survécuent via ON DELETE SET NULL).
	Delete(ctx context.Context, id string) error
	// FindByID — pour la validation d'existence (RLS).
	FindByID(ctx context.Context, id string) (*OuvrageSection, error)
}
