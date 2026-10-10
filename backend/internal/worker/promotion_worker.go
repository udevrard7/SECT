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
// est traité par exactement un worker. Pickup après création du batch : réveil
// événementiel in-process < 1 s (ADR-0013 §13, wakeup.go) ; le ticker adaptatif est le
// filet de sécurité.
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
	"github.com/udevrard7/sect/backend/internal/monitoring"
)

// promotionTickInterval : intervalle de BASE entre 2 checks de batches PENDING.
// 10s = bon compromis entre réactivité (le RESPONSABLE attend peu après POST)
// et coût DB. Aligné sur le spec SECT-PROMOTION-BACKEND-1.
// M1 (ADR-0013 §11.4) : la cadence EFFECTIVE est adaptative — cette base est
// surchargée la nuit par le plancher de fenêtre (défaut 15 min, cf.
// internal/worker/cadence.go). NB : un SELECT toutes les 10 s n'est PAS
// négligeable côté Neon — il interdit toute suspension du compute
// (inactivité requise : 300 s).
// §13 (mode « à la demande ») : ce ticker n'est plus le CHEMIN CHAUD mais le
// FILET DE SÉCURITÉ — le pickup réactif vient du réveil événementiel
// (wakeup.go, < 1 s après le POST). La base 10 s reste la valeur effective
// si l'exploitant retire les planchers (WORKER_*_MIN_INTERVAL=0).
const promotionTickInterval = 10 * time.Second

// PromotionWorker vérifie périodiquement les batches PENDING et les traite.
type PromotionWorker struct {
	dbPool    *pgxpool.Pool
	logger    *slog.Logger
	promoRepo domain.PromotionRepository
	stopCh    chan struct{}
	reg       *monitoring.WorkerRegistry // ADR-0011 : registre monitoring (nil-safe)
	// ADR-0013 §13 : réveil événementiel (mode « à la demande »). Canal
	// buffer 1 fourni par WithWakeup ; nil = désactivé (le case du select
	// n'est alors jamais prêt — idiome Go : canal nil = case désactivée).
	wake <-chan struct{}
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

// WithRegistry injecte le registre de workers (ADR-0011 — visibilité dans
// l'onglet Système de /monitoring). Nil-safe.
func (w *PromotionWorker) WithRegistry(reg *monitoring.WorkerRegistry) *PromotionWorker {
	w.reg = reg
	return w
}

// WithWakeup branche le bus de réveil événementiel (ADR-0013 §13 — mode
// « à la demande »). L'abonnement est pris ICI (constructeur) et non dans
// Start : la goroutine de Start peut ne pas encore écouter lorsque le
// serveur HTTP sert sa première requête — un Notify arrivant dans cette
// fenêtre serait perdu (fallback filet 15 min). Nil-safe : sans bus, le
// canal reste nil → case jamais prêt.
func (w *PromotionWorker) WithWakeup(bus *WakeupBus) *PromotionWorker {
	if bus != nil {
		w.wake = bus.Subscribe(WorkerPromotion)
	}
	return w
}

// Start lance le worker en goroutine (non-bloquant). Deux chemins de pickup :
//
//  1. MODE « À LA DEMANDE » (ADR-0013 §13) : le handler runPromotion notifie
//     le bus (WithWakeup) dès le COMMIT d'un batch PENDING → réveil < 1 s
//     (mieux que les 10 s de polling historiques), puis DRAIN back-to-back
//     de tout ce qui est PENDING (« le worker reste rapide quand des
//     batches existent, ralentit sinon »).
//  2. FILET DE SÉCURITÉ : ticker adaptatif M1 (planchers jour/nuit 15 min) —
//     rattrape ce qui n'est PAS passé par l'API (reprise après restart,
//     Notify perdu, chemin externe futur).
//
// Premier check immédiat au démarrage (comme CleanupWorker) pour rattraper
// les batches en attente si le serveur a redémarré.
func (w *PromotionWorker) Start(ctx context.Context) {
	w.logger.Info("Promotion Worker started — mode à la demande (réveil < 1 s) + filet adaptatif M1")

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

		// SECT-CLOTURE-E2E-VERIFY-1 (fix orphan) : au démarrage, récupérer les
		// batches RUNNING orphelins (claimés par un worker précédent qui a
		// crashé/redémarré avant de finir le traitement). Sans ça, un batch
		// RUNNING reste bloqué à jamais (fetchAndClaim ne cherche que PENDING).
		// Stratégie : marquer RUNNING → PENDING pour re-traitement automatique
		// au premier tick. Les batches idempotents (cloturer_annee_etudiant
		// gère EXISTS sur Inscription) supportent un re-traitement safe.
		w.recoverOrphanBatches(ctx)

		// Premier check immédiat au démarrage (rattrapage des batches PENDING
		// créés pendant que le serveur était down — cf. cleanup_worker).
		w.reg.TrackContext(ctx, WorkerPromotion, w.safeDrainPendingBatches)

		// M1 (ADR-0013 §11.4/§13) : filet de sécurité adaptatif (planchers
		// nocturne ET jour) — le chemin chaud est le réveil événementiel.
		ticker := newAdaptiveTicker(WorkerPromotion, promotionTickInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("Promotion Worker stopping...")
				return
			case <-ticker.C:
				w.reg.TrackContext(ctx, WorkerPromotion, w.safeDrainPendingBatches)
			case <-w.wake: // nil-safe : canal nil = case jamais prêt (sans bus)
				w.logger.Info("PromotionWorker: réveil événementiel — drain immédiat (mode à la demande)")
				w.reg.TrackContext(ctx, WorkerPromotion, w.safeDrainPendingBatches)
			}
		}
	}()
}

// recoverOrphanBatches marque les batches RUNNING anciens (>2 min) comme PENDING
// pour re-traitement. Un batch RUNNING depuis >2 min est nécessairement orphelin
// (un batch normal est traité en <30s même pour 800 étudiants). Sans cette
// récupération, un crash du worker mid-treatment laisserait le batch bloqué.
//
// Idempotence : cloturer_annee_etudiant gère le cas où l'Inscription source
// existe déjà (la met à jour au lieu d'insérer). L'Inscription cible a un
// UNIQUE(etudiantId, anneeAcademiqueId) → un re-traitement ne crée pas de
// doublon. Safe de re-traiter.
func (w *PromotionWorker) recoverOrphanBatches(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			w.logger.Error("PromotionWorker: PANIC in recoverOrphanBatches (recovered)",
				"panic", r, "stack", string(debug.Stack()))
		}
	}()
	// db.WithTx pose les claims RLS (SET LOCAL app.claims.*) via SetClaimsTx.
	// Sans ça, is_system() retournerait false et la policy PromotionBatch_modify
	// (qui exige is_system() OR is_responsable()) rejetterait l'UPDATE silencieusement.
	var rowsAffected int64
	err := db.WithTx(ctx, w.dbPool, db.SystemClaims(), func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `
                        UPDATE "PromotionBatch"
                        SET "statut" = 'PENDING', "errorMessage" = NULL
                        WHERE "statut" = 'RUNNING'
                          AND "createdAt" < NOW() - INTERVAL '2 minutes'`)
		if err != nil {
			return err
		}
		rowsAffected = ct.RowsAffected()
		return nil
	})
	if err != nil {
		w.logger.Error("PromotionWorker: recoverOrphanBatches failed", "error", err)
		return
	}
	if rowsAffected > 0 {
		w.logger.Info("PromotionWorker: orphan RUNNING batches recovered to PENDING",
			"count", rowsAffected)
	}
}

// safeDrainPendingBatches wrap drainPendingBatches avec un recover. Un panic
// sur un batch (données incohérentes, SQL inattendu) est loggé + le worker
// continue les ticks suivants (au lieu de mourir).
func (w *PromotionWorker) safeDrainPendingBatches(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			w.logger.Error("PromotionWorker: PANIC in drain (recovered)",
				"panic", r, "stack", string(debug.Stack()))
		}
	}()
	w.drainPendingBatches(ctx)
}

// drainPendingBatches traite les batches PENDING jusqu'à épuisement,
// back-to-back (sans attendre le tick suivant). C'est le cœur du mode
// « à la demande » (ADR-0013 §13) : réveillé par le POST /cloture-annee
// (signal in-process) ou par le filet ticker, le worker ENCHAÎNE tout ce
// qui est PENDING puis se rendort sur la grille lente.
//
// Terminaison garantie : chaque itération claim atomiquement UN batch
// (PENDING → RUNNING via FOR UPDATE SKIP LOCKED) ; un batch traité sort de
// PENDING (COMPLETED ou FAILED, y compris via les recover). Les créations
// concurrentes pendant le drain sont précisément ce que le mode doit servir
// vite — les traiter immédiatement est le comportement attendu, pas une
// fuite.
func (w *PromotionWorker) drainPendingBatches(ctx context.Context) {
	for w.processPendingBatches(ctx) {
	}
}

// processPendingBatches traite UN batch PENDING (le plus ancien) et retourne
// true si un batch a été CLAIMÉ (quel que soit son dénouement — COMPLETED ou
// FAILED : il sort de PENDING dans tous les cas, le drain peut donc passer
// au suivant). Retourne false s'il n'y avait rien à claimer ou si le claim
// lui-même a échoué (erreur de lecture — le drain s'arrête, le tick suivant
// réessaye).
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
func (w *PromotionWorker) processPendingBatches(ctx context.Context) bool {
	// 1. Claim atomique d'un batch PENDING.
	batch, err := w.fetchAndClaimPendingBatch(ctx)
	if err != nil {
		w.logger.Error("PromotionWorker: fetch pending batch failed", "error", err)
		return false
	}
	if batch == nil {
		return false // rien à traiter
	}

	w.logger.Info("PromotionWorker: processing batch (step 1 claim OK)",
		"batchId", batch.ID,
		"etablissementId", batch.EtablissementID,
		"anneeSourceId", batch.AnneeSourceID,
	)

	// SECT-CLOTURE-E2E-VERIFY-1 (diagnostic) : catch-all recover qui marque le
	// batch FAILED avec le stack trace en errorMessage. Ainsi, même sans accès
	// aux logs Render, on voit la cause du crash en base (GET /status renvoie
	// errorMessage). Sans ça, un panic entre le claim et le marquage FAILED
	// laisse le batch RUNNING orphelin.
	defer func() {
		if r := recover(); r != nil {
			stack := string(debug.Stack())
			w.logger.Error("PromotionWorker: PANIC mid-treatment (marking batch FAILED)",
				"batchId", batch.ID, "panic", r, "stack", stack)
			errMsg := fmt.Sprintf("PANIC: %v\n%s", r, stack[:min(800, len(stack))])
			_ = w.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutFailed,
				domain.PromotionBatchResult{BatchID: batch.ID, Statut: domain.PromotionBatchStatutFailed},
				&errMsg)
		}
	}()

	// 2. Charge les ReglesPassage de l'étab (SystemClaims — bypass RLS).
	// On wrap le context avec SystemClaims car les méthodes du repo attendent
	// des claims dans le context (db.ClaimsFromContext).
	sysCtx := db.WithClaimsContext(ctx, db.SystemClaims())
	w.logger.Info("PromotionWorker: step 2 GetReglesPassage", "batchId", batch.ID)
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
	w.logger.Info("PromotionWorker: step 3 ListEtudiantsForPromotion", "batchId", batch.ID,
		"etablissementId", batch.EtablissementID, "anneeSourceId", batch.AnneeSourceID)
	etudiants, err := w.promoRepo.ListEtudiantsForPromotion(sysCtx, batch.EtablissementID, batch.AnneeSourceID)
	if err != nil {
		// Erreur fatale — on marque le batch FAILED.
		errMsg := fmt.Sprintf("ListEtudiantsForPromotion: %v", err)
		_ = w.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutFailed,
			domain.PromotionBatchResult{BatchID: batch.ID, Statut: domain.PromotionBatchStatutFailed},
			&errMsg)
		w.logger.Error("PromotionWorker: ListEtudiantsForPromotion failed — batch FAILED",
			"batchId", batch.ID, "error", err)
		return true // claimé (déjà FAILED) — le drain regarde le suivant
	}
	w.logger.Info("PromotionWorker: step 3 OK", "batchId", batch.ID, "etudiantCount", len(etudiants))

	// 4. UPDATE batch totalEtudiants.
	counts := domain.PromotionBatchResult{
		BatchID:        batch.ID,
		Statut:         domain.PromotionBatchStatutRunning,
		TotalEtudiants: len(etudiants),
	}
	if err := w.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutRunning, counts, nil); err != nil {
		w.logger.Error("PromotionWorker: update totalEtudiants failed", "batchId", batch.ID, "error", err)
		return true // claimé — orphelin RUNNING récupéré au restart (recoverOrphan)
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
	return true // claimé et traité jusqu'au bout
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
