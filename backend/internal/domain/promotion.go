// Package domain — entités et ports pour la clôture de fin d'année académique.
//
// SECT-PROMOTION-BACKEND-1 : ce fichier définit le contrat métier de la feature
// de clôture d'année académique (year-end promotion). Il s'appuie sur le schéma
// DB mis en place par la migration 000087_academic_progression :
//
//   - Table "PromotionBatch" : suivi des jobs async de clôture (statut + counts).
//   - Table "ReglesPassage" : configuration des seuils par établissement.
//   - Table "Inscription" : pivot historisée (1 ligne par étudiant par année).
//   - Fonction SECURITY DEFINER cloturer_annee_etudiant(...) : cascade atomique
//     par étudiant (UPDATE User.niveau + INSERT/UPDATE Inscription source +
//     INSERT Inscription cible + INSERT AuditLog). Bypass RLS.
//
// Le worker (worker/promotion_worker.go) pickup les batches PENDING, les passe
// en RUNNING, traite chaque étudiant via cloturer_annee_etudiant (best-effort),
// puis marque le batch COMPLETED. Le frontend poll /status pour suivre la
// progression en temps réel.
//
// Le usecase (usecase/promotion.go) orchestre la validation des rôles +
// création du batch (PENDING). Il expose aussi PreviewPromotion (liste les
// étudiants avec décision suggérée, sans appliquer) et PromoteStudentManual
// (override individuel par un RESPONSABLE hors batch).
package domain

import (
	"context"
	"time"
)

// PromotionBatchStatut représente le statut d'un batch de clôture.
// Miroir Go de l'enum Postgres "PromotionBatchStatut" (migration 000087).
type PromotionBatchStatut string

const (
	// PromotionBatchStatutPending : job créé par POST /cloture-annee, en attente
	// de pickup par le worker (ticker 10s).
	PromotionBatchStatutPending PromotionBatchStatut = "PENDING"
	// PromotionBatchStatutRunning : worker en cours de traitement. La
	// progression + counts sont mis à jour après chaque étudiant.
	PromotionBatchStatutRunning PromotionBatchStatut = "RUNNING"
	// PromotionBatchStatutCompleted : terminé (tous les étudiants traités,
	// potentiellement avec des erreurs partielles — cf. erreurCount).
	PromotionBatchStatutCompleted PromotionBatchStatut = "COMPLETED"
	// PromotionBatchStatutFailed : échec global (erreur fatale, ex. impossible
	// de charger les étudiants). errorMessage contient le détail.
	PromotionBatchStatutFailed PromotionBatchStatut = "FAILED"
)

// PromotionBatch représente un job de clôture d'année académique pour un
// établissement. Miroir Go de la table "PromotionBatch" (migration 000087).
//
// Une ligne = un run de clôture (généralement 1 par an, mais le RESPONSABLE
// peut en lancer plusieurs — seul le dernier COMPLETED compte pour l'historique).
//
// Les counts (PromuCount, RedoublantCount, DiplomeCount, ExcluCount,
// ErreurCount) sont incrémentés par le worker après chaque étudiant traité.
// La progression (entier 0..totalEtudiants) permet au frontend d'afficher une
// barre de progression en temps réel via GET /status.
//
// Le champ Details (TEXT, JSON string) stocke les overrides éventuels saisis
// par le RESPONSABLE dans le formulaire de clôture :
//
//	{
//	  "overrides": [
//	    {"etudiantId":"user_abc","decision":"REDOUBLANT","motif":"absences répétées"}
//	  ]
//	}
//
// Le worker parse ce JSON au démarrage pour appliquer les décisions manuelles
// avant la logique automatique (cloturer_annee_etudiant prend decisionOverride
// en paramètre, qui court-circuite le calcul auto).
type PromotionBatch struct {
	ID              string               `json:"id"`
	EtablissementID string               `json:"etablissementId"`
	AnneeSourceID   string               `json:"anneeSourceId"`
	AnneeCibleID    *string              `json:"anneeCibleId,omitempty"`
	Statut          PromotionBatchStatut `json:"statut"`
	RunByID         *string              `json:"runById,omitempty"`
	SeuilMoyenne    float64              `json:"seuilMoyenne"`
	TotalEtudiants  int                  `json:"totalEtudiants"`
	PromuCount      int                  `json:"promuCount"`
	RedoublantCount int                  `json:"redoublantCount"`
	DiplomeCount    int                  `json:"diplomeCount"`
	ExcluCount      int                  `json:"excluCount"`
	ErreurCount     int                  `json:"erreurCount"`
	Progression     int                  `json:"progression"`
	Details         *string              `json:"details,omitempty"`
	ErrorMessage    *string              `json:"errorMessage,omitempty"`
	CreatedAt       time.Time            `json:"createdAt"`
	TermineAt       *time.Time           `json:"termineAt,omitempty"`
}

// ReglesPassage représente la configuration des seuils de passage pour un
// établissement. Miroir Go de la table "ReglesPassage" (migration 000087).
//
// Une seule ligne par établissement (UNIQUE etablissementId). Backfillée par
// la migration 000087 pour les établissements existants avec les valeurs par
// défaut (10/20, 8/20, 60%, STRICT, 2 redoublements max).
//
// La logique de décision (dans cloturer_annee_etudiant) est :
//
//	PROMU       si moyenne ≥ seuilMoyennePassage ET creditsValides ≥ creditsTotaux × creditsMinPourcent/100
//	REDOUBLANT  sinon (ou si seuil non atteint)
//	DIPLOME     si moyenne ≥ seuilMoyennePassage ET niveau terminal (DOCTORAT)
//
// Le regime (STRICT/TOLERANT) n'est pas encore exploité par la fonction SQL
// (réservé pour une future évolution : mode tolerant = rattrapage automatique
// entre seuilRattrapage et seuilPassage). LimiteRedoublements est également
// réservé (un étudiant qui dépasse la limite devrait être EXCLU automatiquement).
type ReglesPassage struct {
	ID                     string    `json:"id"`
	EtablissementID        string    `json:"etablissementId"`
	SeuilMoyennePassage    float64   `json:"seuilMoyennePassage"`
	SeuilMoyenneRattrapage float64   `json:"seuilMoyenneRattrapage"`
	CreditsMinPourcent     int       `json:"creditsMinPourcent"`
	Regime                 string    `json:"regime"`
	LimiteRedoublements    int       `json:"limiteRedoublements"`
	CreatedAt              time.Time `json:"createdAt"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

// ReglesPassageDefaults — valeurs par défaut utilisées quand un établissement
// n'a pas encore de ligne ReglesPassage en DB (cas anormal, le backfill 000087
// devrait couvrir tous les étab existants, mais par défense on initialise).
// Aligné sur les DEFAULT de la table SQL (migration 000087).
var ReglesPassageDefaults = ReglesPassage{
	SeuilMoyennePassage:    10.0,
	SeuilMoyenneRattrapage: 8.0,
	CreditsMinPourcent:     60,
	Regime:                 "STRICT",
	LimiteRedoublements:    2,
}

// EtudiantProgression — vue agrégée d'un étudiant éligible à la clôture,
// utilisée par PreviewPromotion (POST /cloture-annee/preview) et par le worker
// pour itérer sur la liste des étudiants à traiter.
//
// Tous les champs sont calculés en UNE seule query SQL (LEFT JOINs +
// subqueries) côté repository.ListEtudiantsForPromotion, pour éviter N+1
// queries sur un établissement avec des centaines d'étudiants.
//
// DecisionSuggeree est calculée côté SQL (reprend la même logique que
// cloturer_annee_etudiant, sans appliquer) — permet au frontend d'afficher
// la décision proposée avant que le RESPONSABLE ne confirme ou n'override.
type EtudiantProgression struct {
	EtudiantID        string            `json:"etudiantId"`
	Nom               string            `json:"nom"`
	Email             string            `json:"email"`
	Niveau            NiveauEtude       `json:"niveau"`
	FiliereID         *string           `json:"filiereId,omitempty"`
	FiliereNom        *string           `json:"filiereNom,omitempty"`
	MoyenneAnnuelle   float64           `json:"moyenneAnnuelle"`
	CreditsValides    int               `json:"creditsValides"`
	CreditsTotaux     int               `json:"creditsTotaux"`
	DecisionSuggeree  StatutInscription `json:"decisionSuggeree"`
	InscriptionExiste bool              `json:"inscriptionExiste"`
}

// OverrideDecision — décision manuelle saisie par le RESPONSABLE dans le
// formulaire de clôture (override de la logique auto pour un étudiant donné).
// Le RESPONSABLE peut forcer PROMU/REDOUBLANT/DIPLOME/EXCLU/REORIENTE/QUITTE
// avec un motif obligatoire (audit + traçabilité).
type OverrideDecision struct {
	EtudiantID string            `json:"etudiantId"`
	Decision   StatutInscription `json:"decision"`
	Motif      string            `json:"motif,omitempty"`
}

// RunPromotionInput — body du POST /api/etablissements/{id}/cloture-annee.
//
// Le RESPONSABLE fournit l'année source (celle qu'on clôture) et
// optionnellement l'année cible (celle où on crée les nouvelles Inscription
// EN_COURS pour les PROMU/REDOUBLANT). Si anneeCibleId est nil, aucune
// inscription cible n'est créée (cas d'archive pure — ex. fermeture étab).
//
// Overrides est optionnel : liste de décisions manuelles par étudiant. Le
// worker les parse depuis le champ Details (JSON) au démarrage.
type RunPromotionInput struct {
	EtablissementID string             `json:"-"`
	AnneeSourceID   string             `json:"anneeSourceId"`
	AnneeCibleID    *string            `json:"anneeCibleId,omitempty"`
	RunByID         string             `json:"-"`
	Overrides       []OverrideDecision `json:"overrides,omitempty"`
}

// EtudiantErreur — une erreur survenue lors du traitement d'un étudiant dans
// le batch. Le worker accumule ces erreurs et les retourne dans le batch
// (details JSON) pour que le frontend puisse les afficher après polling
// /status. Best-effort : si un étudiant échoue, on continue au suivant.
type EtudiantErreur struct {
	EtudiantID string `json:"etudiantId"`
	Nom        string `json:"nom,omitempty"`
	Erreur     string `json:"erreur"`
}

// PromotionBatchResult — résumé agrégé d'un batch (counts + erreurs),
// retourné par GetBatchStatus et ListBatches pour le frontend.
// Le worker UPDATE le batch avec ces mêmes counts après chaque étudiant.
type PromotionBatchResult struct {
	BatchID         string               `json:"batchId"`
	Statut          PromotionBatchStatut `json:"statut"`
	TotalEtudiants  int                  `json:"totalEtudiants"`
	PromuCount      int                  `json:"promuCount"`
	RedoublantCount int                  `json:"redoublantCount"`
	DiplomeCount    int                  `json:"diplomeCount"`
	ExcluCount      int                  `json:"excluCount"`
	ErreurCount     int                  `json:"erreurCount"`
	Progression     int                  `json:"progression"`
	Erreurs         []EtudiantErreur     `json:"erreurs,omitempty"`
}

// CloturerEtudiantResult — retour structuré de la fonction SQL
// cloturer_annee_etudiant (migration 000087). Les 6 champs correspondent aux
// 6 colonnes du RETURNS TABLE de la fonction SQL.
//
// Si une erreur survient côté SQL (EXCEPTION), la fonction retourne
// decision='EN_COURS', moyenne=0, credits=0, niveau=p_niveau (inchangé) et
// error_message=SQLERRM. Le worker vérifie error_message != "" pour compter
// l'erreur et logguer.
type CloturerEtudiantResult struct {
	Decision       StatutInscription
	Moyenne        float64
	CreditsValides int
	CreditsTotaux  int
	NouveauNiveau  string
	ErrorMessage   string
}

// PromotionRepository définit l'interface d'accès aux tables PromotionBatch
// + ReglesPassage + la fonction cloturer_annee_etudiant.
//
// Méthodes RLS-on (claims requises via db.WithTx) — appelées par les handlers
// HTTP avec les claims de l'utilisateur connecté :
//   - CreateBatch, GetBatch, ListBatchesByEtablissement (policies PromotionBatch_*)
//   - GetReglesPassage (policy ReglesPassage_select)
//   - ListEtudiantsForPromotion (SELECT User JOIN ValidationUE JOIN UE — RLS User_select)
//
// Méthode RLS-system (SystemClaims) — appelée par le worker :
//   - UpdateBatchStatut (policy PromotionBatch_modify accepte is_system())
//
// Méthode RLS-off (SECURITY DEFINER bypass) — appelée par le worker ET par
// PromoteStudentManual (override individuel) :
//   - CloturerEtudiant (SELECT * FROM cloturer_annee_etudiant(...))
type PromotionRepository interface {
	// CreateBatch insère un nouveau batch PENDING. RLS via claims (RESPONSABLE
	// same-etab). Retourne le batch avec ID + CreatedAt peuplés.
	CreateBatch(ctx context.Context, batch PromotionBatch) (*PromotionBatch, error)

	// GetBatch récupère un batch par ID. RLS via claims. Retourne nil +
	// NotFoundError si introuvable (ou si RLS cache la ligne — cross-etab).
	GetBatch(ctx context.Context, batchID string) (*PromotionBatch, error)

	// ListBatchesByEtablissement retourne l'historique des batches d'un étab,
	// trié par createdAt DESC (plus récent en premier). RLS via claims.
	ListBatchesByEtablissement(ctx context.Context, etablissementID string) ([]PromotionBatch, error)

	// UpdateBatchStatut met à jour le statut + les counts + progression d'un
	// batch. Appelée par le worker (SystemClaims) après chaque étudiant et à
	// la fin du traitement. errorMessage est non-nil si statut=FAILED.
	UpdateBatchStatut(ctx context.Context, batchID string, statut PromotionBatchStatut, counts PromotionBatchResult, errorMessage *string) error

	// GetReglesPassage récupère les règles d'un établissement. RLS via claims.
	// Retourne nil + NotFoundError si aucune ligne (cas anormal — le backfill
	// 000087 devrait couvrir tous les étab).
	GetReglesPassage(ctx context.Context, etablissementID string) (*ReglesPassage, error)

	// UpdateReglesPassage upsert les règles de passage d'un établissement. Si aucune
	// ligne n'existe pour l'établissement, elle est créée (INSERT). Sinon, UPDATE.
	// RLS via claims (RESPONSABLE same-etab only — pas l'ENSEIGNANT B2C qui ne gère
	// pas les règles pédagogiques de son étab personnel).
	UpdateReglesPassage(ctx context.Context, regles ReglesPassage) (*ReglesPassage, error)

	// ListEtudiantsForPromotion retourne la liste des étudiants éligibles à la
	// clôture pour un établissement + une année source donnés. RLS via claims.
	//
	// Critères d'éligibilité :
	//   - role = ETUDIANT
	//   - actif = true
	//   - deletedAt IS NULL
	//   - etablissementId = etablissementID
	//
	// Pour chaque étudiant, calcule en UNE seule query :
	//   - niveau (User.niveau, peut être vide si non renseigné)
	//   - filiereId + filiereNom (LEFT JOIN Filiere)
	//   - moyenneAnnuelle (AVG ValidationUE.moyenneUE WHERE annee=source AND statut=VALIDEE)
	//   - creditsValides (SUM UE.creditsECTS WHERE ValidationUE.statut=VALIDEE)
	//   - creditsTotaux (SUM UE.creditsECTS WHERE UE.filiereId=User.filiereId
	//     AND UE.niveau=User.niveau AND UE.actif=true)
	//   - decisionSuggeree (calcule via les mêmes règles que cloturer_annee_etudiant)
	//   - inscriptionExiste (EXISTS Inscription WHERE etudiantId+anneeSourceId)
	ListEtudiantsForPromotion(ctx context.Context, etablissementID, anneeSourceID string) ([]EtudiantProgression, error)

	// CloturerEtudiant appelle la fonction SECURITY DEFINER
	// cloturer_annee_etudiant (migration 000087). Bypass RLS (SECURITY DEFINER).
	//
	// La fonction fait atomiquement :
	//   1. Calcule moyenne + credits depuis ValidationUE
	//   2. Détermine la décision (auto selon regles, ou override si decisionOverride non-nil)
	//   3. Si PROMU : UPDATE User.niveau = next + INSERT Inscription(anneeCible, EN_COURS)
	//      Si REDOUBLANT : INSERT Inscription(anneeCible, EN_COURS, même niveau)
	//      Si DIPLOME/EXCLU/REORIENTE/QUITTE : pas de nouvelle inscription
	//   4. UPDATE Inscription(anneeSource) : statut + moyenne + credits + dateCloture
	//   5. INSERT AuditLog (action PROMOTION_DECISION_*)
	//   6. Retourne (decision, moyenne, credits_valides, credits_totaux, nouveau_niveau, error_message)
	//
	// Si une erreur survient (EXCEPTION WHEN OTHERS), la fonction retourne
	// decision='EN_COURS', error_message=SQLERRM. L'appelant (worker) vérifie
	// error_message != "" et compte l'erreur.
	CloturerEtudiant(ctx context.Context, etudiantID, anneeSourceID string, anneeCibleID *string, filiereID *string, niveau *string, decisionOverride *string, motif *string, decideParID *string, batchID *string, regles ReglesPassage) (CloturerEtudiantResult, error)
}
