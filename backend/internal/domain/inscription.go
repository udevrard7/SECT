// Package domain — entités et ports liés aux inscriptions annuelles des étudiants.
//
// SECT-INSCRIPTION-SCHEMA-1 (migration 000087) : la table "Inscription" est la
// pivot historisée (1 ligne par étudiant par année académique) qui fige le niveau,
// la moyenne, les crédits et la décision de fin d'année. Elle remplace User.niveau
// (champ plat mutable) comme source de vérité historique.
//
// SECT-INSCRIPTION-SIGNUP-HOOK-1 (migration 000088) : une Inscription EN_COURS
// est créée automatiquement quand un étudiant s'inscrit via signup-link, pour
// l'année courante de son établissement.
package domain

import (
	"context"
	"time"
)

// StatutInscription représente le statut d'une inscription annuelle.
// Miroir Go de l'enum Postgres "StatutInscription" (migration 000087).
type StatutInscription string

const (
	StatutInscriptionEnCours    StatutInscription = "EN_COURS"   // inscrit pour l'année, non clôturé
	StatutInscriptionPromu      StatutInscription = "PROMU"      // validé, passe au niveau supérieur
	StatutInscriptionRedoublant StatutInscription = "REDOUBLANT" // échec, reste au même niveau
	StatutInscriptionDiplome    StatutInscription = "DIPLOME"    // niveau terminal validé, archivé
	StatutInscriptionExclu      StatutInscription = "EXCLU"      // renvoyé (décision manuelle)
	StatutInscriptionReoriente  StatutInscription = "REORIENTE"  // changé de filière (décision manuelle)
	StatutInscriptionQuitte     StatutInscription = "QUITTE"     // a quitté l'établissement
)

// Inscription est l'entité persisted en table "Inscription".
//
// Une ligne = un étudiant pour une année académique. UNIQUE(etudiantId, anneeAcademiqueId).
// Le statut démarre à EN_COURS à l'inscription, puis passe à PROMU/REDOUBLANT/
// DIPLOME/EXCLU/REORIENTE/QUITTE à la clôture de fin d'année.
//
// moyenneAnnuelle + creditsValides + creditsTotaux sont figés au moment de la
// clôture (snapshot) — pas recalculés. C'est essentiel pour l'intégrité
// historique des bulletins (si une note change a posteriori, la décision perd
// son sens si on recalcule).
type Inscription struct {
	ID                string            `json:"id"`
	EtudiantID        string            `json:"etudiantId"`
	AnneeAcademiqueID string            `json:"anneeAcademiqueId"`
	FiliereID         *string           `json:"filiereId,omitempty"`
	Niveau            NiveauEtude       `json:"niveau"`
	Statut            StatutInscription `json:"statut"`
	MoyenneAnnuelle   *float64          `json:"moyenneAnnuelle,omitempty"`
	CreditsValides    int               `json:"creditsValides"`
	CreditsTotaux     int               `json:"creditsTotaux"`
	DecisionManuelle  bool              `json:"decisionManuelle"`
	RaisonDecision    *string           `json:"raisonDecision,omitempty"`
	DecideParID       *string           `json:"decideParId,omitempty"`
	DateCloture       *time.Time        `json:"dateCloture,omitempty"`
	BatchID           *string           `json:"batchId,omitempty"`
	CreatedAt         time.Time         `json:"createdAt"`
	UpdatedAt         time.Time         `json:"updatedAt"`
}

// CreateInscriptionForSignupResult — résultat de la fonction SQL
// create_inscription_for_signup (migration 000088, SECURITY DEFINER).
//
// Codes possibles :
//   - "OK" : Inscription créée (InscriptionID + AnneeID renseignés)
//   - "EXISTS" : idempotent — Inscription déjà existante (InscriptionID renseigné)
//   - "NO_CURRENT_YEAR" : l'établissement n'a pas d'année courante définie
//   - "NO_NIVEAU" : l'étudiant n'a pas de niveau renseigné (cas anormal)
//   - "ERROR" : erreur SQL (Message contient SQLERRM)
type CreateInscriptionForSignupResult struct {
	Code          string
	InscriptionID *string
	AnneeID       *string
	Message       *string
}

// InscriptionRepository définit l'interface d'accès à la table "Inscription".
//
// Méthodes RLS-off (bypass RLS — endpoints publics / workers) :
//   - CreateForSignup (fonction SECURITY DEFINER create_inscription_for_signup)
//
// Méthodes RLS-on (claims requises via db.WithTx) :
//   - ListByEtudiant, ListByAnnee (SELECT policies Inscription_select)
type InscriptionRepository interface {
	// CreateForSignup crée une Inscription EN_COURS pour un étudiant venant de
	// s'inscrire via signup-link, pour l'année courante de son établissement.
	// Appelle la fonction SECURITY DEFINER create_inscription_for_signup (bypass
	// RLS — endpoint public). Idempotent (code "EXISTS" si déjà existant).
	// Non bloquant : si échec (NO_CURRENT_YEAR, ERROR), l'inscription étudiante
	// réussit quand même — l'erreur est loggée par l'appelant.
	CreateForSignup(ctx context.Context, etudiantID, etablissementID string, filiereID *string, niveau *string) (*CreateInscriptionForSignupResult, error)

	// ListByEtudiant retourne l'historique complet d'un étudiant (toutes années
	// confondues), trié par année descendante. RLS via claims (ETUDIANT self,
	// RESPONSABLE same-etab, ADMIN with etab access).
	ListByEtudiant(ctx context.Context, etudiantID string) ([]Inscription, error)

	// ListByAnnee retourne toutes les inscriptions d'une année académique pour
	// un établissement (tous étudiants), trié par nom étudiant. RLS via claims.
	// Utilisé par la prévisualisation de clôture (SECT-PROMOTION-BACKEND-1).
	ListByAnnee(ctx context.Context, anneeAcademiqueID, etablissementID string) ([]Inscription, error)
}
