// Package http — handlers HTTP pour la clôture d'année académique.
//
// SECT-PROMOTION-BACKEND-1 : 6 endpoints exposés au frontend :
//
//	POST   /api/etablissements/{etablissementId}/cloture-annee
//	  → runPromotion : crée un batch PENDING (202 Accepted + batchId).
//	POST   /api/etablissements/{etablissementId}/cloture-annee/preview
//	  → previewPromotion : liste les étudiants + décision suggérée (sans appliquer).
//	GET    /api/etablissements/{etablissementId}/cloture-annee/status?batchId=X
//	  → getPromotionBatchStatus : polling progression d'un batch.
//	GET    /api/etablissements/{etablissementId}/cloture-annee/batches
//	  → listPromotionBatches : historique des batches.
//	GET    /api/etablissements/{etablissementId}/regles-passage
//	  → getReglesPassage : config seuils de l'étab.
//	POST   /api/etudiants/{etudiantId}/promote
//	  → promoteStudentManual : override individuel hors batch.
//
// Auth : RequireAuth + RequireRoleOrPersonalEtab("ADMIN", "RESPONSABLE")
// (le prof B2C dans un étab PERSONNEL peut aussi clôturer — cohérent avec les
// autres mutations académiques). Le usecase valide en plus le scoping
// (RESPONSABLE ne peut agir que sur SON étab).
//
// Pattern identique à academique_handlers.go (claims via middleware.ClaimsFromContext,
// MapDomainError pour erreurs domaine → codes HTTP, json.NewEncoder pour response).
package http

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// runPromotionRequest — body du POST /cloture-annee.
//
//   - anneeSourceId : ID de l'année à clôturer (obligatoire).
//   - anneeCibleId  : ID de l'année cible (optionnel — si nil, pas de nouvelle
//     inscription cible pour les PROMU/REDOUBLANT ; cas d'archive pure).
//   - overrides     : décisions manuelles par étudiant (optionnel).
type runPromotionRequest struct {
	AnneeSourceID string                    `json:"anneeSourceId"`
	AnneeCibleID  *string                   `json:"anneeCibleId,omitempty"`
	Overrides     []domain.OverrideDecision `json:"overrides,omitempty"`
}

// runPromotion — POST /api/etablissements/{etablissementId}/cloture-annee
//
// Crée un batch PENDING (le worker pickup dans les 10s). Retourne 202 Accepted
// + { batchId, statut: "PENDING" } pour que le frontend commence à poller
// /status et afficher une barre de progression.
//
// Le RESPONSABLE peut saisir des overrides (décisions manuelles) dans le
// formulaire de clôture. Le usecase les sérialise en JSON dans batch.Details ;
// le worker les parse au démarrage et les applique avant la logique auto.
func (s *Server) runPromotion(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	etabID := chi.URLParam(r, "etablissementId")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "id établissement requis")
		return
	}

	var req runPromotionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	input := domain.RunPromotionInput{
		EtablissementID: etabID,
		AnneeSourceID:   req.AnneeSourceID,
		AnneeCibleID:    req.AnneeCibleID,
		RunByID:         claims.UserID,
		Overrides:       req.Overrides,
	}

	batch, err := s.promotionUC.RunPromotion(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]any{
		"batchId": batch.ID,
		"statut":  string(batch.Statut),
	})
}

// previewPromotion — POST /api/etablissements/{etablissementId}/cloture-annee/preview
//
// Calcule pour chaque étudiant éligible : niveau, moyenne annuelle, crédits
// validés/totaux, décision suggérée (sans appliquer). Permet au RESPONSABLE de
// reviewer la promotion avant de confirmer le batch.
//
// La query SQL est monolithique (LEFT JOINs + LATERAL) — 1 seule passe pour
// tous les étudiants de l'étab. Safe à appeler plusieurs fois (aucune écriture).
func (s *Server) previewPromotion(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	etabID := chi.URLParam(r, "etablissementId")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "id établissement requis")
		return
	}

	var req struct {
		AnneeSourceID string `json:"anneeSourceId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	etudiants, err := s.promotionUC.PreviewPromotion(r.Context(), claims, etabID, req.AnneeSourceID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"etudiants": etudiants,
		"total":     len(etudiants),
	})
}

// getPromotionBatchStatus — GET /api/etablissements/{etablissementId}/cloture-annee/status?batchId=X
//
// Polling du statut d'un batch (progression + counts en temps réel). Le worker
// UPDATE le batch après chaque étudiant → le frontend peut afficher une barre
// de progression animée.
//
// Query param : batchId (obligatoire).
// Le usecase valide que le batch appartient bien à l'étab de l'URL (defense in
// depth — la RLS filtre déjà, mais on vérifie côté usecase aussi).
func (s *Server) getPromotionBatchStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	batchID := r.URL.Query().Get("batchId")
	if batchID == "" {
		writeJSONError(w, http.StatusBadRequest, "query param 'batchId' requis")
		return
	}

	batch, err := s.promotionUC.GetBatchStatus(r.Context(), claims, batchID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Si le batch a des erreurs (details JSON), on les décode pour le frontend.
	var erreurs []domain.EtudiantErreur
	if batch.Details != nil && *batch.Details != "" {
		var payload struct {
			Erreurs []domain.EtudiantErreur `json:"erreurs"`
		}
		if err := json.Unmarshal([]byte(*batch.Details), &payload); err == nil {
			erreurs = payload.Erreurs
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"batchId":         batch.ID,
		"statut":          string(batch.Statut),
		"totalEtudiants":  batch.TotalEtudiants,
		"promuCount":      batch.PromuCount,
		"redoublantCount": batch.RedoublantCount,
		"diplomeCount":    batch.DiplomeCount,
		"excluCount":      batch.ExcluCount,
		"erreurCount":     batch.ErreurCount,
		"progression":     batch.Progression,
		"errorMessage":    batch.ErrorMessage,
		"createdAt":       batch.CreatedAt,
		"termineAt":       batch.TermineAt,
		"erreurs":         erreurs,
	})
}

// listPromotionBatches — GET /api/etablissements/{etablissementId}/cloture-annee/batches
//
// Historique des batches de l'étab (plus récent en premier). Permet au
// RESPONSABLE de consulter les runs passés (qui a clôturé quand, combien de
// promus/redoublants/etc).
func (s *Server) listPromotionBatches(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	etabID := chi.URLParam(r, "etablissementId")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "id établissement requis")
		return
	}

	batches, err := s.promotionUC.ListBatches(r.Context(), claims, etabID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"batches": batches,
		"total":   len(batches),
	})
}

// getReglesPassage — GET /api/etablissements/{etablissementId}/regles-passage
//
// Récupère la config des seuils de passage (seuilMoyennePassage,
// seuilMoyenneRattrapage, creditsMinPourcent, regime, limiteRedoublements).
// Si l'étab n'a pas de ligne ReglesPassage (cas anormal — backfill 000087
// manquant), le usecase retourne les défauts (10/20, 8/20, 60%, STRICT, 2).
func (s *Server) getReglesPassage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	etabID := chi.URLParam(r, "etablissementId")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "id établissement requis")
		return
	}

	regles, err := s.promotionUC.GetReglesPassage(r.Context(), claims, etabID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(regles)
}

// promoteStudentManualRequest — body du POST /api/etudiants/{etudiantId}/promote.
//
//   - anneeSourceId : année à clôturer pour cet étudiant (obligatoire).
//   - anneeCibleId  : année cible pour la nouvelle inscription si PROMU/REDOUBLANT.
//   - decision      : une de PROMU/REDOUBLANT/DIPLOME/EXCLU/REORIENTE/QUITTE.
//   - motif         : raison optionnelle (journalisée dans AuditLog + Inscription.raisonDecision).
type promoteStudentManualRequest struct {
	AnneeSourceID string  `json:"anneeSourceId"`
	AnneeCibleID  *string `json:"anneeCibleId,omitempty"`
	Decision      string  `json:"decision"`
	Motif         string  `json:"motif,omitempty"`
}

// promoteStudentManual — POST /api/etudiants/{etudiantId}/promote
//
// Override individuel hors batch : le RESPONSABLE force une décision pour un
// étudiant spécifique (ex: exclusion pour faute, réorientation, diplôme
// anticipé). La fonction SQL cloturer_annee_etudiant est appelée avec
// decisionOverride=decision → court-circuite la logique auto.
//
// Le decideParID est posé à claims.UserID (pour audit). batchID=nil (manuel,
// pas rattaché à un batch). La fonction SQL insère elle-même AuditLog
// (action=PROMOTION_DECISION_* selon la décision).
func (s *Server) promoteStudentManual(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	etudiantID := chi.URLParam(r, "etudiantId")
	if etudiantID == "" {
		writeJSONError(w, http.StatusBadRequest, "id étudiant requis")
		return
	}

	var req promoteStudentManualRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	result, err := s.promotionUC.PromoteStudentManual(
		r.Context(), claims, etudiantID, req.AnneeSourceID, req.AnneeCibleID,
		domain.StatutInscription(req.Decision), req.Motif,
	)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Si la fonction SQL a renvoyé une erreur (EXCEPTION WHEN OTHERS), on
	// retourne 500 avec le message — l'appelant peut le corriger.
	if result.ErrorMessage != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{
			"error":         "erreur lors de la clôture",
			"details":       result.ErrorMessage,
			"etudiantId":    etudiantID,
			"anneeSourceId": req.AnneeSourceID,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"etudiantId":      etudiantID,
		"anneeSourceId":   req.AnneeSourceID,
		"decision":        string(result.Decision),
		"moyenneAnnuelle": result.Moyenne,
		"creditsValides":  result.CreditsValides,
		"creditsTotaux":   result.CreditsTotaux,
		"nouveauNiveau":   result.NouveauNiveau,
		"message":         "décision appliquée avec succès",
	})
}

// runPromotionSync — POST /api/etablissements/{etablissementId}/cloture-annee/run-sync
//
// SECT-CLOTURE-E2E-VERIFY-1 : variante SYNCHRONE de runPromotion. Traite le batch
// dans la requête HTTP (au lieu d'async via le worker). Nécessaire sur Render free
// tier où le worker async est tué par le cold start.
//
// Retourne 200 OK avec le résultat final (counts + erreurs). Le frontend passe
// directement à l'étape Bilan (pas de polling).
//
// Timeout : 25s (limite Render free = 30s). Pour >800 étudiants, le traitement
// peut dépasser — dans ce cas le frontend doit utiliser le mode async (runPromotion
// + polling /status) ou découper en chunks.
func (s *Server) runPromotionSync(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	etabID := chi.URLParam(r, "etablissementId")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "id établissement requis")
		return
	}

	var req runPromotionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	input := domain.RunPromotionInput{
		EtablissementID: etabID,
		AnneeSourceID:   req.AnneeSourceID,
		AnneeCibleID:    req.AnneeCibleID,
		RunByID:         claims.UserID,
		Overrides:       req.Overrides,
	}

	// Context avec timeout 25s (< 30s Render free).
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()

	result, err := s.promotionUC.RunPromotionSync(ctx, claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"batchId":         result.BatchID,
		"statut":          string(result.Statut),
		"totalEtudiants":  result.TotalEtudiants,
		"promuCount":      result.PromuCount,
		"redoublantCount": result.RedoublantCount,
		"diplomeCount":    result.DiplomeCount,
		"excluCount":      result.ExcluCount,
		"erreurCount":     result.ErreurCount,
		"erreurs":         result.Erreurs,
	})
}
