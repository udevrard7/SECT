// Package worker — worker async de traitement des batches de clôture d'année.
//
// SECT-PROMOTION-BACKEND-1 : ce worker pickup les batches PENDING créés par
// POST /api/etablissements/{id}/cloture-annee, les passe en RUNNING, traitent
// chaque étudiant via la fonction SECURITY DEFINER cloturer_annee_etudiant
// (best-effort), puis marque le batch COMPLETED. Le frontend poll
// /api/etablissements/{id}/cloture-annee/status?batchId=X pour suivre la
// progression en temps réel (progression + counts mis à jour après chaque
// étudiant).
//
// Pattern identique à cleanup_worker.go (struct + NewXxxWorker + Start +
// ticker goroutine + processXxx method + first run on startup). Toutes les
// opérations DB utilisent db.SystemClaims() (la policy is_system() des tables
// PromotionBatch/ReglesPassage/User accepte le bypass worker).
//
// Concurrency safety : fetchAndClaimPendingBatch utilise SELECT ... FOR UPDATE
// SKIP LOCKED + UPDATE statut=RUNNING dans la même tx → claim atomique. Si
// plusieurs instances du worker tournent (Render multi-instance), chaque batch
// est traité par exactement un worker. Le ticker 10s permet un pickup rapide
// après création du batch.
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"runtime/debug"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// promotionTickInterval : intervalle entre 2 checks de batches PENDING.
// 10s = bon compromis entre réactivité (le RESPONSABLE attend peu après POST)
// et coût DB (1 SELECT toutes les 10s = négligeable). Aligné sur le spec
// SECT-PROMOTION-BACKEND-1.
const promotionTickInterval = 10 * time.Second

// PromotionWorker vérifie périodiquement les batches PENDING et les traite.
type PromotionWorker struct {
	dbPool    *pgxpool.Pool
	logger    *slog.Logger
	promoRepo domain.PromotionRepository
	stopCh    chan struct{}
}

// NewPromotionWorker crée un nouveau worker de promotion.
func NewPromotionWorker(dbPool *pgxpool.Pool, logger *slog.Logger, promoRepo domain.PromotionRepository) *PromotionWorker {
	return &PromotionWorker{
		dbPool:    dbPool,
		logger:    logger,
		promoRepo: promoRepo,
		stopCh:    make(chan struct{}),
	}
}

// Start lance le worker en goroutine (non-bloquant). Vérifie toutes les 10s
// les batches PENDING et les traite. Premier check immédiat au démarrage
// (comme CleanupWorker) pour rattraper les batches en attente si le serveur
// a redémarré.
func (w *PromotionWorker) Start(ctx context.Context) {
	w.logger.Info("Promotion Worker started, checking every 10s...")

	go func() {
		defer close(w.stopCh)
		// SECT-CLOTURE-E2E-VERIFY-1 (fix panic) : recover global pour qu'un panic
		// dans processPendingBatches ne tue pas définitivement la goroutine. Sans
		// ce recover, un panic (ex: nil deref sur un étudiant sans niveau, erreur
		// SQL inattendue) fait mourir le worker jusqu'au redémarrage du serveur,
		// laissant les batches PENDING/RUNNING orphelins.
		defer func() {
			if r := recover(); r != nil {
				w.logger.Error("PromotionWorker: PANIC in goroutine (recovered, worker continues)",
					"panic", r, "stack", string(debug.Stack()))
			}
		}()

		// Premier check immédiat au démarrage (rattrapage des batches PENDING
		// créés pendant que le serveur était down — cf. cleanup_worker).
		w.safeProcessPendingBatches(ctx)

		ticker := time.NewTicker(promotionTickInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("Promotion Worker stopping...")
				return
			case <-ticker.C:
				w.safeProcessPendingBatches(ctx)
			}
		}
	}()
}

// safeProcessPendingBatches wrap processPendingBatches avec un recover par
// itération. Un panic sur un batch (données incohérentes, SQL inattendu) est
// loggé + le worker continue les ticks suivants (au lieu de mourir).
func (w *PromotionWorker) safeProcessPendingBatches(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			w.logger.Error("PromotionWorker: PANIC in processPendingBatches (recovered)",
				"panic", r, "stack", string(debug.Stack()))
		}
	}()
	w.processPendingBatches(ctx)
}

// processPendingBatches traite UN batch PENDING (le plus ancien). Si plusieurs
// batches sont en attente, ils seront traités un par un aux prochains ticks.
//
// Étapes :
//  1. Claim atomique d'un batch PENDING (SELECT FOR UPDATE SKIP LOCKED +
//     UPDATE statut=RUNNING dans la même tx).
//  2. Charge les ReglesPassage de l'étab (fallback défauts si absent).
//  3. Charge la liste des étudiants éligibles (ListEtudiantsForPromotion).
//  4. UPDATE batch totalEtudiants=len(students).
//  5. Parse les overrides depuis Details JSON (décisions manuelles).
//  6. Pour chaque étudiant : appelle CloturerEtudiant (SQL function). Incrément
//     le count correspondant à la décision. UPDATE batch progression + counts
//     après chaque étudiant (live polling). Best-effort : si erreur, incrément
//     erreurCount + log + continue.
//  7. UPDATE batch statut=COMPLETED + termineAt=NOW().
//  8. INSERT AuditLog (action=PROMOTION_BATCH_COMPLETED, details avec counts).
func (w *PromotionWorker) processPendingBatches(ctx context.Context) {
	// 1. Claim atomique d'un batch PENDING.
	batch, err := w.fetchAndClaimPendingBatch(ctx)
	if err != nil {
		w.logger.Error("PromotionWorker: fetch pending batch failed", "error", err)
		return
	}
	if batch == nil {
		return // rien à traiter
	}

	w.logger.Info("PromotionWorker: processing batch",
		"batchId", batch.ID,
		"etablissementId", batch.EtablissementID,
		"anneeSourceId", batch.AnneeSourceID,
	)

	// 2. Charge les ReglesPassage de l'étab (SystemClaims — bypass RLS).
	// On wrap le context avec SystemClaims car les méthodes du repo attendent
	// des claims dans le context (db.ClaimsFromContext).
	sysCtx := db.WithClaimsContext(ctx, db.SystemClaims())
	regles, err := w.promoRepo.GetReglesPassage(sysCtx, batch.EtablissementID)
	if err != nil {
		// Si pas de ReglesPassage (cas anormal — backfill 000087 manquant),
		// on fallback sur les défauts. On log warn mais on continue.
		w.logger.Warn("PromotionWorker: ReglesPassage not found, using defaults",
			"batchId", batch.ID, "etablissementId", batch.EtablissementID, "error", err)
		defaults := domain.ReglesPassageDefaults
		defaults.EtablissementID = batch.EtablissementID
		regles = &defaults
	}

	// 3. Charge la liste des étudiants éligibles.
	etudiants, err := w.promoRepo.ListEtudiantsForPromotion(sysCtx, batch.EtablissementID, batch.AnneeSourceID)
	if err != nil {
		// Erreur fatale — on marque le batch FAILED.
		errMsg := fmt.Sprintf("ListEtudiantsForPromotion: %v", err)
		_ = w.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutFailed,
			domain.PromotionBatchResult{BatchID: batch.ID, Statut: domain.PromotionBatchStatutFailed},
			&errMsg)
		w.logger.Error("PromotionWorker: ListEtudiantsForPromotion failed — batch FAILED",
			"batchId", batch.ID, "error", err)
		return
	}

	// 4. UPDATE batch totalEtudiants.
	counts := domain.PromotionBatchResult{
		BatchID:        batch.ID,
		Statut:         domain.PromotionBatchStatutRunning,
		TotalEtudiants: len(etudiants),
	}
	if err := w.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutRunning, counts, nil); err != nil {
		w.logger.Error("PromotionWorker: update totalEtudiants failed", "batchId", batch.ID, "error", err)
		return
	}

	// 5. Parse les overrides depuis Details JSON.
	overrides := w.parseOverrides(batch.Details)
	w.logger.Info("PromotionWorker: overrides loaded",
		"batchId", batch.ID, "overrideCount", len(overrides))

	// 6. Pour chaque étudiant : CloturerEtudiant + incrément counts.
	var erreurs []domain.EtudiantErreur
	for _, etu := range etudiants {
		// Lookup override (décision manuelle) pour cet étudiant.
		var decisionOverride *string
		var motif *string
		if ov, ok := overrides[etu.EtudiantID]; ok {
			d := string(ov.Decision)
			decisionOverride = &d
			if ov.Motif != "" {
				motif = &ov.Motif
			}
		}

		// Conversion niveau (NiveauEtude string → *string pour la fonction SQL).
		// Si niveau est vide (étudiant sans niveau), on passe nil — la fonction
		// SQL next_niveau(NULL) retourne (NULL, false), et la décision tombera
		// sur 'REDOUBLANT' ou 'EN_COURS' avec error_message.
		var niveauPtr *string
		if string(etu.Niveau) != "" {
			n := string(etu.Niveau)
			niveauPtr = &n
		}

		// Appel à la fonction SECURITY DEFINER (bypass RLS).
		result, err := w.promoRepo.CloturerEtudiant(
			ctx,
			etu.EtudiantID, batch.AnneeSourceID, batch.AnneeCibleID,
			etu.FiliereID, niveauPtr,
			decisionOverride, motif,
			batch.RunByID, &batch.ID,
			*regles,
		)

		switch {
		case err != nil:
			// Erreur Go (pgx) — la fonction SQL n'a pas pu être appelée.
			counts.ErreurCount++
			erreurs = append(erreurs, domain.EtudiantErreur{
				EtudiantID: etu.EtudiantID,
				Nom:        etu.Nom,
				Erreur:     err.Error(),
			})
			w.logger.Error("PromotionWorker: CloturerEtudiant failed",
				"batchId", batch.ID, "etudiantId", etu.EtudiantID, "error", err)
		case result.ErrorMessage != "":
			// Erreur SQL (EXCEPTION WHEN OTHERS) — la fonction a attrapé l'erreur.
			counts.ErreurCount++
			erreurs = append(erreurs, domain.EtudiantErreur{
				EtudiantID: etu.EtudiantID,
				Nom:        etu.Nom,
				Erreur:     result.ErrorMessage,
			})
			w.logger.Error("PromotionWorker: CloturerEtudiant SQL error",
				"batchId", batch.ID, "etudiantId", etu.EtudiantID,
				"error", result.ErrorMessage)
		default:
			// Succès — incrément le count selon la décision.
			switch result.Decision {
			case domain.StatutInscriptionPromu:
				counts.PromuCount++
			case domain.StatutInscriptionRedoublant:
				counts.RedoublantCount++
			case domain.StatutInscriptionDiplome:
				counts.DiplomeCount++
			case domain.StatutInscriptionExclu, domain.StatutInscriptionReoriente, domain.StatutInscriptionQuitte:
				counts.ExcluCount++
			}
		}

		// Incrément progression + UPDATE batch (live polling).
		counts.Progression++
		if err := w.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutRunning, counts, nil); err != nil {
			w.logger.Error("PromotionWorker: update progression failed",
				"batchId", batch.ID, "progression", counts.Progression, "error", err)
		}
	}

	// 7. Final : statut=COMPLETED + termineAt=NOW().
	counts.Statut = domain.PromotionBatchStatutCompleted
	counts.Erreurs = erreurs
	if err := w.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutCompleted, counts, nil); err != nil {
		w.logger.Error("PromotionWorker: update COMPLETED failed",
			"batchId", batch.ID, "error", err)
	}

	// 8. Audit PROMOTION_BATCH_COMPLETED (direct SQL — pattern cleanup_worker).
	w.auditBatchCompleted(ctx, batch.ID, batch.EtablissementID, counts)

	w.logger.Info("PromotionWorker: batch COMPLETED",
		"batchId", batch.ID,
		"total", counts.TotalEtudiants,
		"promu", counts.PromuCount,
		"redoublant", counts.RedoublantCount,
		"diplome", counts.DiplomeCount,
		"exclu", counts.ExcluCount,
		"erreur", counts.ErreurCount,
	)
}

// fetchAndClaimPendingBatch claim atomiquement le plus ancien batch PENDING :
// SELECT ... FOR UPDATE SKIP LOCKED + UPDATE statut=RUNNING dans la même tx.
// Si aucun batch PENDING, retourne (nil, nil).
//
// FOR UPDATE SKIP LOCKED : si un autre worker a déjà locké un batch, on skip
// et on prend le suivant. Permet le parallelisme multi-instance sans
// contention. Le lock est libéré au COMMIT de la tx (statut=RUNNING est alors
// visible → les autres workers ne verront plus ce batch comme PENDING).
func (w *PromotionWorker) fetchAndClaimPendingBatch(ctx context.Context) (*domain.PromotionBatch, error) {
	var batch domain.PromotionBatch
	var statut string
	err := db.WithTx(ctx, w.dbPool, db.SystemClaims(), func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
                        SELECT "id", "etablissementId", "anneeSourceId", "anneeCibleId",
                               "statut", "runById", "seuilMoyenne", "details", "createdAt"
                        FROM "PromotionBatch"
                        WHERE "statut" = 'PENDING'
                        ORDER BY "createdAt" ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED`).Scan(
			&batch.ID, &batch.EtablissementID, &batch.AnneeSourceID, &batch.AnneeCibleID,
			&statut, &batch.RunByID, &batch.SeuilMoyenne, &batch.Details, &batch.CreatedAt,
		)
		if err != nil {
			return err
		}
		// UPDATE statut=RUNNING dans la même tx (lock tenu jusqu'au COMMIT).
		_, err = tx.Exec(ctx,
			`UPDATE "PromotionBatch" SET "statut" = 'RUNNING' WHERE "id" = $1`,
			batch.ID)
		return err
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	batch.Statut = domain.PromotionBatchStatut(statut)
	return &batch, nil
}

// parseOverrides parse le JSON Details du batch pour extraire les overrides
// (décisions manuelles saisies par le RESPONSABLE dans le formulaire de
// clôture). Format attendu :
//
//	{"overrides":[{"etudiantId":"user_abc","decision":"REDOUBLANT","motif":"..."}]}
//
// Retourne une map[etudiantId]OverrideDecision pour lookup O(1) dans la
// boucle de traitement. Si le parsing échoue (JSON malformé), log + retourne
// une map vide (le batch continue sans overrides — best-effort).
func (w *PromotionWorker) parseOverrides(details *string) map[string]domain.OverrideDecision {
	overrides := make(map[string]domain.OverrideDecision)
	if details == nil || *details == "" {
		return overrides
	}
	var payload struct {
		Overrides []domain.OverrideDecision `json:"overrides"`
	}
	if err := json.Unmarshal([]byte(*details), &payload); err != nil {
		w.logger.Error("PromotionWorker: parse overrides failed — ignoring overrides",
			"error", err, "details", *details)
		return overrides
	}
	for _, ov := range payload.Overrides {
		overrides[ov.EtudiantID] = ov
	}
	return overrides
}

// auditBatchCompleted journalise la fin d'un batch dans AuditLog.
// Pattern identique à cleanup_worker.insertAuditLog : INSERT direct via pool
// (la policy AuditLog_insert a WITH CHECK(true) → pas besoin de RLS bypass).
//
// Action = PROMOTION_BATCH_COMPLETED, entite = PromotionBatch, entiteId = batchID.
// details JSON : { batchId, totalEtudiants, promuCount, redoublantCount,
// diplomeCount, excluCount, erreurCount, erreurs }.
func (w *PromotionWorker) auditBatchCompleted(ctx context.Context, batchID, etablissementID string, counts domain.PromotionBatchResult) {
	details := map[string]any{
		"batchId":         batchID,
		"totalEtudiants":  counts.TotalEtudiants,
		"promuCount":      counts.PromuCount,
		"redoublantCount": counts.RedoublantCount,
		"diplomeCount":    counts.DiplomeCount,
		"excluCount":      counts.ExcluCount,
		"erreurCount":     counts.ErreurCount,
	}
	if len(counts.Erreurs) > 0 {
		details["erreurs"] = counts.Erreurs
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		w.logger.Error("PromotionWorker: marshal audit details failed", "error", err)
		return
	}

	auditID := "audit_" + uuid.NewString()
	_, err = w.dbPool.Exec(ctx, `
                INSERT INTO "AuditLog" ("id", "userId", "userEmail", "action", "entite", "entiteId", "details", "adresseIp", "etablissementId", "createdAt")
                VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        `,
		auditID,
		domain.AuditActionPromotionBatchCompleted,
		"PromotionBatch",
		batchID,
		string(detailsJSON),
		"system-worker",
		etablissementID,
	)
	if err != nil {
		w.logger.Error("PromotionWorker: audit PROMOTION_BATCH_COMPLETED failed",
			"batchId", batchID, "error", err)
	}
}
