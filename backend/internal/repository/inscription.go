// Package repository — implémentation pgx de InscriptionRepository.
//
// SECT-INSCRIPTION-SIGNUP-HOOK-1 : CreateForSignup appelle la fonction SQL
// SECURITY DEFINER create_inscription_for_signup (bypass RLS — endpoint public).
// SECT-PROMOTION-BACKEND-1 (à venir) : ListByEtudiant + ListByAnnee utilisent
// db.WithTx + claims (RLS ON, policies Inscription_select).
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// InscriptionRepository implémente domain.InscriptionRepository.
type InscriptionRepository struct {
	pool *pgxpool.Pool
}

// NewInscriptionRepository crée un nouveau InscriptionRepository.
func NewInscriptionRepository(pool *pgxpool.Pool) *InscriptionRepository {
	return &InscriptionRepository{pool: pool}
}

// CreateForSignup appelle la fonction SECURITY DEFINER create_inscription_for_signup.
// Bypass RLS (endpoint public). Idempotent.
func (r *InscriptionRepository) CreateForSignup(ctx context.Context, etudiantID, etablissementID string, filiereID *string, niveau *string) (*domain.CreateInscriptionForSignupResult, error) {
	// La fonction SQL attend p_niveau "NiveauEtude" (NOT NULL côté SQL, mais la
	// fonction gère NULL → code "NO_NIVEAU"). On passe NULL si niveau est nil.
	var (
		code          string
		inscriptionID *string
		anneeID       *string
		message       *string
	)

	err := r.pool.QueryRow(ctx, `
                SELECT o_code, o_inscription_id, o_annee_id, o_message
                FROM public.create_inscription_for_signup($1, $2, $3, $4)`,
		etudiantID, etablissementID, filiereID, niveau,
	).Scan(&code, &inscriptionID, &anneeID, &message)
	if err != nil {
		return nil, fmt.Errorf("CreateForSignup: %w", err)
	}

	return &domain.CreateInscriptionForSignupResult{
		Code:          code,
		InscriptionID: inscriptionID,
		AnneeID:       anneeID,
		Message:       message,
	}, nil
}

// ListByEtudiant retourne l'historique complet d'un étudiant (toutes années).
// RLS via claims (ETUDIANT self, RESPONSABLE same-etab, ADMIN with etab access).
func (r *InscriptionRepository) ListByEtudiant(ctx context.Context, etudiantID string) ([]domain.Inscription, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("ListByEtudiant: claims manquants dans le context")
	}

	var inscriptions []domain.Inscription
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT "id", "etudiantId", "anneeAcademiqueId", "filiereId", "niveau",
                               "statut", "moyenneAnnuelle", "creditsValides", "creditsTotaux",
                               "decisionManuelle", "raisonDecision", "decideParId", "dateCloture",
                               "batchId", "createdAt", "updatedAt"
                        FROM "Inscription"
                        WHERE "etudiantId" = $1
                        ORDER BY "createdAt" DESC`, etudiantID)
		if err != nil {
			return fmt.Errorf("ListByEtudiant query: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var ins domain.Inscription
			if err := rows.Scan(
				&ins.ID, &ins.EtudiantID, &ins.AnneeAcademiqueID, &ins.FiliereID, &ins.Niveau,
				&ins.Statut, &ins.MoyenneAnnuelle, &ins.CreditsValides, &ins.CreditsTotaux,
				&ins.DecisionManuelle, &ins.RaisonDecision, &ins.DecideParID, &ins.DateCloture,
				&ins.BatchID, &ins.CreatedAt, &ins.UpdatedAt,
			); err != nil {
				return fmt.Errorf("ListByEtudiant scan: %w", err)
			}
			inscriptions = append(inscriptions, ins)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return inscriptions, nil
}

// ListByEtudiantEnriched — comme ListByEtudiant mais avec les libellés
// (AnneeAcademique.libelle + Filiere.nom) JOINés côté SQL pour éviter N+1
// frontend. Tri par AnneeAcademique.dateDebut DESC (année la plus récente
// en premier), puis par createdAt DESC (tie-break pour 2 lignes même année —
// cas anormal, la contrainte UNIQUE(etudiantId, anneeAcademiqueId) empêche).
//
// RLS via claims (mêmes policies Inscription_select — le JOIN ne casse pas la
// RLS, les policies AnneeAcademique_select / Filiere_select laissent lire les
// métadonnées aux mêmes rôles autorisés à lire l'Inscription).
//
// SECT-INSCRIPTION-HISTORY-ENDPOINT-1.
func (r *InscriptionRepository) ListByEtudiantEnriched(ctx context.Context, etudiantID string) ([]domain.InscriptionWithLabels, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("ListByEtudiantEnriched: claims manquants dans le context")
	}

	var inscriptions []domain.InscriptionWithLabels
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT i."id", i."etudiantId", i."anneeAcademiqueId", i."filiereId", i."niveau",
                               i."statut", i."moyenneAnnuelle", i."creditsValides", i."creditsTotaux",
                               i."decisionManuelle", i."raisonDecision", i."decideParId", i."dateCloture",
                               i."batchId", i."createdAt", i."updatedAt",
                               a."libelle", f."nom"
                        FROM "Inscription" i
                        JOIN "AnneeAcademique" a ON a."id" = i."anneeAcademiqueId"
                        LEFT JOIN "Filiere" f ON f."id" = i."filiereId"
                        WHERE i."etudiantId" = $1
                        ORDER BY a."dateDebut" DESC, i."createdAt" DESC`, etudiantID)
		if err != nil {
			return fmt.Errorf("ListByEtudiantEnriched query: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var ins domain.InscriptionWithLabels
			if err := rows.Scan(
				&ins.ID, &ins.EtudiantID, &ins.AnneeAcademiqueID, &ins.FiliereID, &ins.Niveau,
				&ins.Statut, &ins.MoyenneAnnuelle, &ins.CreditsValides, &ins.CreditsTotaux,
				&ins.DecisionManuelle, &ins.RaisonDecision, &ins.DecideParID, &ins.DateCloture,
				&ins.BatchID, &ins.CreatedAt, &ins.UpdatedAt,
				&ins.AnneeLibelle, &ins.FiliereNom,
			); err != nil {
				return fmt.Errorf("ListByEtudiantEnriched scan: %w", err)
			}
			inscriptions = append(inscriptions, ins)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return inscriptions, nil
}

// ListByAnnee retourne toutes les inscriptions d'une année pour un établissement.
// RLS via claims. Utilisé par la prévisualisation de clôture.
//
// NB : on filtre par etablissementID via un JOIN sur User (l'étudiant appartient
// à l'étab) car Inscription n'a pas de colonne etablissementId directe. La RLS
// policy Inscription_select filtre déjà par user_in_my_etab(etudiantId), donc
// le JOIN est redondant en sécurité mais nécessaire pour le filtrage métier
// (un RESPONSABLE ne voit que son étab même si l'année est partagée — cas rare).
func (r *InscriptionRepository) ListByAnnee(ctx context.Context, anneeAcademiqueID, etablissementID string) ([]domain.Inscription, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("ListByAnnee: claims manquants dans le context")
	}

	var inscriptions []domain.Inscription
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT i."id", i."etudiantId", i."anneeAcademiqueId", i."filiereId", i."niveau",
                               i."statut", i."moyenneAnnuelle", i."creditsValides", i."creditsTotaux",
                               i."decisionManuelle", i."raisonDecision", i."decideParId", i."dateCloture",
                               i."batchId", i."createdAt", i."updatedAt"
                        FROM "Inscription" i
                        JOIN "User" u ON u."id" = i."etudiantId"
                        WHERE i."anneeAcademiqueId" = $1 AND u."etablissementId" = $2
                        ORDER BY u."name" ASC`, anneeAcademiqueID, etablissementID)
		if err != nil {
			return fmt.Errorf("ListByAnnee query: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var ins domain.Inscription
			if err := rows.Scan(
				&ins.ID, &ins.EtudiantID, &ins.AnneeAcademiqueID, &ins.FiliereID, &ins.Niveau,
				&ins.Statut, &ins.MoyenneAnnuelle, &ins.CreditsValides, &ins.CreditsTotaux,
				&ins.DecisionManuelle, &ins.RaisonDecision, &ins.DecideParID, &ins.DateCloture,
				&ins.BatchID, &ins.CreatedAt, &ins.UpdatedAt,
			); err != nil {
				return fmt.Errorf("ListByAnnee scan: %w", err)
			}
			inscriptions = append(inscriptions, ins)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return inscriptions, nil
}
