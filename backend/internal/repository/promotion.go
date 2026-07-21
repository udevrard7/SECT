// Package repository — implémentation pgx de PromotionRepository.
//
// SECT-PROMOTION-BACKEND-1 : ce fichier implémente le port domain.PromotionRepository
// pour la feature de clôture d'année académique. Il s'appuie sur :
//
//   - La table "PromotionBatch" (migration 000087) — CRUD batches.
//   - La table "ReglesPassage" (migration 000087) — lecture config seuils.
//   - La fonction SECURITY DEFINER cloturer_annee_etudiant (migration 000087) —
//     cascade atomique par étudiant (bypass RLS, appelée directement via pool.QueryRow).
//
// Patterns RLS (cf. SECT-ANNEE-RLS-FIX-2, SECT-INSCRIPTION-SIGNUP-HOOK-1) :
//   - Méthodes HTTP (CreateBatch, GetBatch, ListBatchesByEtablissement,
//     GetReglesPassage, ListEtudiantsForPromotion) : db.WithTx + claims de
//     l'utilisateur connecté (db.ClaimsFromContext). Les policies
//     PromotionBatch_select/modify + ReglesPassage_select/modify + User_select
//     filtrent les rows visibles par le RESPONSABLE same-etab + ADMIN.
//   - Méthode worker (UpdateBatchStatut) : db.WithTx + db.SystemClaims() (la
//     policy PromotionBatch_modify accepte is_system()).
//   - Méthode SECURITY DEFINER (CloturerEtudiant) : pool.QueryRow direct, la
//     fonction SQL bypass RLS (SECURITY DEFINER = exécutée en tant que owner).
package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// PromotionRepository implémente domain.PromotionRepository.
type PromotionRepository struct {
	pool *pgxpool.Pool
}

// NewPromotionRepository crée un nouveau PromotionRepository.
func NewPromotionRepository(pool *pgxpool.Pool) *PromotionRepository {
	return &PromotionRepository{pool: pool}
}

// CreateBatch insère un nouveau batch PENDING. RLS via claims (RESPONSABLE
// same-etab). Retourne le batch avec ID + CreatedAt peuplés.
//
// Les counts sont initialisés à 0 par défaut côté SQL ; on ne les pose pas dans
// l'INSERT. L'ID est généré côté Go (google/uuid) pour rester cohérent avec
// le pattern des autres repositories (cf. academique.go).
func (r *PromotionRepository) CreateBatch(ctx context.Context, batch domain.PromotionBatch) (*domain.PromotionBatch, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("CreateBatch: claims manquants dans le context")
	}

	if batch.ID == "" {
		batch.ID = "batch_" + uuid.NewString()
	}

	// Details : si l'appelant (usecase) a déjà fourni un JSON string (ex:
	// overrides sérialisés), on le garde tel quel. Sinon nil.
	var detailsArg any
	if batch.Details != nil && *batch.Details != "" {
		detailsArg = *batch.Details
	} else {
		detailsArg = nil
	}

	var (
		id              string
		statut          string
		createdAt       time.Time
		totalEtudiants  int
		promuCount      int
		redoublantCount int
		diplomeCount    int
		excluCount      int
		erreurCount     int
		progression     int
		seuilMoyenne    float64
	)

	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
                        INSERT INTO "PromotionBatch" (
                                "id", "etablissementId", "anneeSourceId", "anneeCibleId",
                                "statut", "runById", "seuilMoyenne", "totalEtudiants",
                                "promuCount", "redoublantCount", "diplomeCount", "excluCount",
                                "erreurCount", "progression", "details", "createdAt"
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, 0, 0, 0, 0, $8, CURRENT_TIMESTAMP)
                        RETURNING "id", "statut", "seuilMoyenne", "totalEtudiants",
                                  "promuCount", "redoublantCount", "diplomeCount", "excluCount",
                                  "erreurCount", "progression", "createdAt"`,
			batch.ID, batch.EtablissementID, batch.AnneeSourceID, batch.AnneeCibleID,
			string(batch.Statut), batch.RunByID, batch.SeuilMoyenne, detailsArg,
		).Scan(
			&id, &statut, &seuilMoyenne, &totalEtudiants,
			&promuCount, &redoublantCount, &diplomeCount, &excluCount,
			&erreurCount, &progression, &createdAt,
		)
		if err != nil {
			return fmt.Errorf("CreateBatch insert: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	batch.ID = id
	batch.Statut = domain.PromotionBatchStatut(statut)
	batch.SeuilMoyenne = seuilMoyenne
	batch.TotalEtudiants = totalEtudiants
	batch.PromuCount = promuCount
	batch.RedoublantCount = redoublantCount
	batch.DiplomeCount = diplomeCount
	batch.ExcluCount = excluCount
	batch.ErreurCount = erreurCount
	batch.Progression = progression
	batch.CreatedAt = createdAt
	return &batch, nil
}

// GetBatch récupère un batch par ID. RLS via claims.
// Retourne nil + domain.NotFoundError si introuvable (pgx.ErrNoRows).
func (r *PromotionRepository) GetBatch(ctx context.Context, batchID string) (*domain.PromotionBatch, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("GetBatch: claims manquants dans le context")
	}

	var batch domain.PromotionBatch
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		return scanBatchRow(tx.QueryRow(ctx, `
                        SELECT "id", "etablissementId", "anneeSourceId", "anneeCibleId",
                               "statut", "runById", "seuilMoyenne", "totalEtudiants",
                               "promuCount", "redoublantCount", "diplomeCount", "excluCount",
                               "erreurCount", "progression", "details", "errorMessage",
                               "createdAt", "termineAt"
                        FROM "PromotionBatch"
                        WHERE "id" = $1`, batchID), &batch)
	})
	if err != nil {
		return nil, mapBatchErr(err)
	}
	return &batch, nil
}

// ListBatchesByEtablissement retourne l'historique des batches d'un étab,
// trié par createdAt DESC. RLS via claims.
func (r *PromotionRepository) ListBatchesByEtablissement(ctx context.Context, etablissementID string) ([]domain.PromotionBatch, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("ListBatchesByEtablissement: claims manquants dans le context")
	}

	var batches []domain.PromotionBatch
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT "id", "etablissementId", "anneeSourceId", "anneeCibleId",
                               "statut", "runById", "seuilMoyenne", "totalEtudiants",
                               "promuCount", "redoublantCount", "diplomeCount", "excluCount",
                               "erreurCount", "progression", "details", "errorMessage",
                               "createdAt", "termineAt"
                        FROM "PromotionBatch"
                        WHERE "etablissementId" = $1
                        ORDER BY "createdAt" DESC`, etablissementID)
		if err != nil {
			return fmt.Errorf("ListBatchesByEtablissement query: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var b domain.PromotionBatch
			if err := scanBatchRows(rows, &b); err != nil {
				return err
			}
			batches = append(batches, b)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return batches, nil
}

// UpdateBatchStatut met à jour le statut + counts + progression + errorMessage
// d'un batch. Appelée par le worker (SystemClaims) après chaque étudiant et à
// la fin du traitement.
//
// NB : on n'utilise pas claims du context (le worker n'en pose pas) — on
// utilise db.SystemClaims() directement. La policy PromotionBatch_modify
// accepte is_system() (migration 000087).
//
// Si statut=COMPLETED, on pose aussi termineAt=NOW(). Si statut=FAILED,
// errorMessage doit être non-nil.
func (r *PromotionRepository) UpdateBatchStatut(ctx context.Context, batchID string, statut domain.PromotionBatchStatut, counts domain.PromotionBatchResult, errorMessage *string) error {
	// Conversion de la liste d'erreurs en JSON pour la colonne details.
	// Le worker passe les erreurs dans counts.Erreurs — on les persiste pour
	// que le frontend puisse les afficher après polling /status.
	var detailsArg any
	if len(counts.Erreurs) > 0 {
		if b, err := json.Marshal(map[string]any{
			"erreurs": counts.Erreurs,
		}); err == nil {
			s := string(b)
			detailsArg = s
		}
	}

	// terminéAt : posé si statut terminal (COMPLETED ou FAILED).
	var termineAtArg any
	if statut == domain.PromotionBatchStatutCompleted || statut == domain.PromotionBatchStatutFailed {
		termineAtArg = time.Now().UTC()
	} else {
		termineAtArg = nil
	}

	err := db.WithTx(ctx, r.pool, db.SystemClaims(), func(tx pgx.Tx) error {
		// SECT-CLOTURE-E2E-VERIFY-1 (fix indexation) : on inclut TOUJOURS
		// "errorMessage" = $11 dans la clause SET (avec COALESCE pour préserver
		// l'ancienne valeur si errorMessage est nil). L'ancienne version sautait
		// $11 quand errorMessage était nil, mais gardait $12 pour termineAt →
		// mismatch d'index ($12 référencé mais seulement 10 args fournis) →
		// erreur silencieuse → le batch restait RUNNING.
		query := `
                        UPDATE "PromotionBatch" SET
                                "statut" = $2,
                                "totalEtudiants" = $3,
                                "promuCount" = $4,
                                "redoublantCount" = $5,
                                "diplomeCount" = $6,
                                "excluCount" = $7,
                                "erreurCount" = $8,
                                "progression" = $9,
                                "details" = COALESCE($10, "details"),
                                "errorMessage" = COALESCE($11, "errorMessage"),
                                "termineAt" = COALESCE($12, "termineAt")
                        WHERE "id" = $1`

		// errorMessageArg : nil si non fourni (COALESCE préserve l'ancienne valeur).
		var errorMessageArg any
		if errorMessage != nil {
			errorMessageArg = *errorMessage
		}

		args := []any{
			batchID,
			string(statut),
			counts.TotalEtudiants,
			counts.PromuCount,
			counts.RedoublantCount,
			counts.DiplomeCount,
			counts.ExcluCount,
			counts.ErreurCount,
			counts.Progression,
			detailsArg,
			errorMessageArg,
			termineAtArg,
		}

		ct, err := tx.Exec(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("UpdateBatchStatut exec: %w", err)
		}
		if ct.RowsAffected() == 0 {
			return fmt.Errorf("UpdateBatchStatut: batch %s introuvable (0 ligne affectée)", batchID)
		}
		return nil
	})
	return err
}

// GetReglesPassage récupère les règles d'un établissement. RLS via claims.
// Retourne nil + domain.NotFoundError si aucune ligne (cas anormal — le
// backfill 000087 devrait couvrir tous les étab).
func (r *PromotionRepository) GetReglesPassage(ctx context.Context, etablissementID string) (*domain.ReglesPassage, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("GetReglesPassage: claims manquants dans le context")
	}

	var regles domain.ReglesPassage
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
                        SELECT "id", "etablissementId", "seuilMoyennePassage",
                               "seuilMoyenneRattrapage", "creditsMinPourcent", "regime",
                               "limiteRedoublements", "createdAt", "updatedAt"
                        FROM "ReglesPassage"
                        WHERE "etablissementId" = $1`, etablissementID,
		).Scan(
			&regles.ID, &regles.EtablissementID, &regles.SeuilMoyennePassage,
			&regles.SeuilMoyenneRattrapage, &regles.CreditsMinPourcent, &regles.Regime,
			&regles.LimiteRedoublements, &regles.CreatedAt, &regles.UpdatedAt,
		)
	})
	if err != nil {
		return nil, mapBatchErr(err)
	}
	return &regles, nil
}

// ListEtudiantsForPromotion retourne la liste des étudiants éligibles à la
// clôture pour un établissement + une année source donnés. RLS via claims.
//
// La query est volontairement monolithique (LEFT JOINs + LATERAL) pour éviter
// N+1 sur un établissement avec des centaines d'étudiants. La décision suggérée
// est calculée côté SQL en reprenant exactement la même logique que la
// fonction cloturer_annee_etudiant (migration 000087) :
//
//	WHEN niveau IS NULL         → 'EN_COURS' (étudiant sans niveau, à corriger)
//	WHEN niveau terminal
//	  AND moyenne ≥ seuil       → 'DIPLOME'
//	WHEN niveau terminal        → 'REDOUBLANT'
//	WHEN moyenne ≥ seuil
//	  AND credits_totaux > 0
//	  AND credits_valides ≥ credits_totaux × creditsMinPourcent / 100
//	                             → 'PROMU'
//	ELSE                        → 'REDOUBLANT'
//
// Les règles (seuilMoyennePassage, creditsMinPourcent) sont lues via un LEFT
// JOIN sur "ReglesPassage" (UNIQUE par étab). Si aucune ligne n'existe (cas
// anormal), les seuils tombent à NULL → la décision devient 'REDOUBLANT'
// (CASE WHEN NULL ≥ NULL est toujours faux). Le usecase charge les règles en
// parallèle pour fallback sur ReglesPassageDefaults si nécessaire.
func (r *PromotionRepository) ListEtudiantsForPromotion(ctx context.Context, etablissementID, anneeSourceID string) ([]domain.EtudiantProgression, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("ListEtudiantsForPromotion: claims manquants dans le context")
	}

	var etudiants []domain.EtudiantProgression
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT
                                u."id",
                                u."name",
                                u."email",
                                COALESCE(u."niveau"::text, '') AS niveau,
                                u."filiereId",
                                f."nom" AS filiere_nom,
                                COALESCE(moy.moyenne, 0) AS moyenne_annuelle,
                                COALESCE(cred.credits_valides, 0) AS credits_valides,
                                COALESCE(ue_tot.credits_totaux, 0) AS credits_totaux,
                                CASE
                                        WHEN u."niveau" IS NULL THEN 'EN_COURS'
                                        WHEN nn.is_terminal AND COALESCE(moy.moyenne, 0) >= rp."seuilMoyennePassage" THEN 'DIPLOME'
                                        WHEN nn.is_terminal THEN 'REDOUBLANT'
                                        WHEN COALESCE(moy.moyenne, 0) >= rp."seuilMoyennePassage"
                                             AND COALESCE(ue_tot.credits_totaux, 0) > 0
                                             AND COALESCE(cred.credits_valides, 0) >= COALESCE(ue_tot.credits_totaux, 0) * rp."creditsMinPourcent" / 100.0
                                        THEN 'PROMU'
                                        ELSE 'REDOUBLANT'
                                END::text AS decision_suggeree,
                                EXISTS (
                                        SELECT 1 FROM "Inscription" i
                                        WHERE i."etudiantId" = u."id" AND i."anneeAcademiqueId" = $2
                                ) AS inscription_existe
                        FROM "User" u
                        LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
                        LEFT JOIN "ReglesPassage" rp ON rp."etablissementId" = u."etablissementId"
                        LEFT JOIN LATERAL (
                                SELECT AVG(vu."moyenneUE") AS moyenne
                                FROM "ValidationUE" vu
                                WHERE vu."etudiantId" = u."id"
                                  AND vu."anneeAcademiqueId" = $2
                                  AND vu."statut" = 'VALIDEE'
                        ) moy ON true
                        LEFT JOIN LATERAL (
                                SELECT SUM(ue."creditsECTS") AS credits_valides
                                FROM "ValidationUE" vu
                                JOIN "UniteEnseignement" ue ON ue."id" = vu."uniteEnseignementId"
                                WHERE vu."etudiantId" = u."id"
                                  AND vu."anneeAcademiqueId" = $2
                                  AND vu."statut" = 'VALIDEE'
                        ) cred ON true
                        LEFT JOIN LATERAL (
                                SELECT SUM(ue."creditsECTS") AS credits_totaux
                                FROM "UniteEnseignement" ue
                                WHERE ue."filiereId" IS NOT DISTINCT FROM u."filiereId"
                                  AND ue."niveau" IS NOT DISTINCT FROM u."niveau"
                                  AND ue."actif" = true
                        ) ue_tot ON true
                        LEFT JOIN LATERAL (
                                SELECT fn.next_niveau, fn.is_terminal
                                FROM public.next_niveau(u."niveau") fn
                        ) nn ON true
                        WHERE u."etablissementId" = $1
                          AND u."role" = 'ETUDIANT'
                          AND u."actif" = true
                          AND u."deletedAt" IS NULL
                        ORDER BY u."name" ASC`, etablissementID, anneeSourceID)
		if err != nil {
			return fmt.Errorf("ListEtudiantsForPromotion query: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var e domain.EtudiantProgression
			var niveauStr string
			var decisionStr string
			if err := rows.Scan(
				&e.EtudiantID, &e.Nom, &e.Email, &niveauStr,
				&e.FiliereID, &e.FiliereNom,
				&e.MoyenneAnnuelle, &e.CreditsValides, &e.CreditsTotaux,
				&decisionStr, &e.InscriptionExiste,
			); err != nil {
				return fmt.Errorf("ListEtudiantsForPromotion scan: %w", err)
			}
			e.Niveau = domain.NiveauEtude(niveauStr)
			e.DecisionSuggeree = domain.StatutInscription(decisionStr)
			etudiants = append(etudiants, e)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return etudiants, nil
}

// CloturerEtudiant appelle la fonction SECURITY DEFINER cloturer_annee_etudiant
// (migration 000087). Bypass RLS (SECURITY DEFINER = exécutée en tant que owner).
//
// La fonction prend 12 paramètres (cf. signature SQL) et retourne un TABLE de
// 6 colonnes (decision, moyenne_annuelle, credits_valides, credits_totaux,
// nouveau_niveau, error_message). On scan les 6 colonnes via QueryRow.
//
// Si une erreur survient côté SQL (EXCEPTION WHEN OTHERS), la fonction
// retourne decision='EN_COURS' + error_message=SQLERRM. L'appelant (worker)
// vérifie error_message != "" pour compter l'erreur et logguer.
//
// NB : les paramètres anneeCibleID, filiereID, niveau, decisionOverride, motif,
// decideParID, batchID sont des *string (peuvent être nil = NULL en SQL). Le
// worker passe batchID=nil pour un override manuel (hors batch).
func (r *PromotionRepository) CloturerEtudiant(
	ctx context.Context,
	etudiantID, anneeSourceID string,
	anneeCibleID *string,
	filiereID *string,
	niveau *string,
	decisionOverride *string,
	motif *string,
	decideParID *string,
	batchID *string,
	regles domain.ReglesPassage,
) (domain.CloturerEtudiantResult, error) {
	var (
		decision       string
		moyenne        float64
		creditsValides int
		creditsTotaux  int
		nouveauNiveau  *string
		errorMessage   *string
	)

	// niveau est un *string côté Go mais la fonction SQL attend "NiveauEtude"
	// (enum Postgres). pgx v5 sait cast les strings en enum automatiquement
	// quand le type cible est connu — on passe donc directement *string.
	// Si niveau est nil (NULL), la fonction SQL gère (next_niveau(NULL) → NULL).
	err := r.pool.QueryRow(ctx, `
                SELECT decision, moyenne_annuelle, credits_valides, credits_totaux,
                       nouveau_niveau, error_message
                FROM public.cloturer_annee_etudiant(
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
                )`,
		etudiantID, anneeSourceID, anneeCibleID, filiereID, niveau,
		decisionOverride, motif, decideParID, batchID,
		regles.SeuilMoyennePassage, regles.SeuilMoyenneRattrapage, regles.CreditsMinPourcent,
	).Scan(&decision, &moyenne, &creditsValides, &creditsTotaux, &nouveauNiveau, &errorMessage)
	if err != nil {
		return domain.CloturerEtudiantResult{}, fmt.Errorf("CloturerEtudiant: %w", err)
	}

	result := domain.CloturerEtudiantResult{
		Decision:       domain.StatutInscription(decision),
		Moyenne:        moyenne,
		CreditsValides: creditsValides,
		CreditsTotaux:  creditsTotaux,
	}
	if nouveauNiveau != nil {
		result.NouveauNiveau = *nouveauNiveau
	}
	if errorMessage != nil {
		result.ErrorMessage = *errorMessage
	}
	return result, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// scanBatchRow scan une ligne de "PromotionBatch" depuis un pgx.Row (QueryRow).
func scanBatchRow(row pgx.Row, b *domain.PromotionBatch) error {
	return scanBatchCols(row, b)
}

// scanBatchRows scan une ligne de "PromotionBatch" depuis un pgx.Rows (itération).
func scanBatchRows(rows pgx.Rows, b *domain.PromotionBatch) error {
	return scanBatchCols(rows, b)
}

// scanner local (redéfini ici pour éviter l'import du helper partagé —
// le type scanner existe déjà dans helpers.go, on le réutilise via l'interface).
func scanBatchCols(s scanner, b *domain.PromotionBatch) error {
	var statut string
	err := s.Scan(
		&b.ID, &b.EtablissementID, &b.AnneeSourceID, &b.AnneeCibleID,
		&statut, &b.RunByID, &b.SeuilMoyenne, &b.TotalEtudiants,
		&b.PromuCount, &b.RedoublantCount, &b.DiplomeCount, &b.ExcluCount,
		&b.ErreurCount, &b.Progression, &b.Details, &b.ErrorMessage,
		&b.CreatedAt, &b.TermineAt,
	)
	if err != nil {
		return err
	}
	b.Statut = domain.PromotionBatchStatut(statut)
	return nil
}

// mapBatchErr convertit les erreurs pgx en erreurs domain. pgx.ErrNoRows
// devient domain.NotFoundError (pour que le handler retourne 404 proprement).
func mapBatchErr(err error) error {
	if err == nil {
		return nil
	}
	if err == pgx.ErrNoRows {
		return &domain.NotFoundError{Entity: "PromotionBatch", ID: ""}
	}
	return err
}
