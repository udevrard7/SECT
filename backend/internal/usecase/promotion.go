// Package usecase — logique métier pour la clôture d'année académique.
//
// SECT-PROMOTION-BACKEND-1 : orchestre la feature de promotion de fin d'année.
// Le usecase est LE point d'entrée pour les handlers HTTP ; il valide les
// rôles, charge les règles de passage, crée les batches PENDING (le worker
// prend le relais async pour le traitement), et expose le preview + override
// manuel.
//
// Dépendances injectées :
//   - promoRepo : port d'accès aux tables PromotionBatch + ReglesPassage +
//     fonction cloturer_annee_etudiant (cf. domain/promotion.go).
//   - authRepo : pour journaliser les actions dans AuditLog (pattern
//     SECT-ETABLISSEMENT-AUDIT-1 — authRepo.CreateAuditLog). Le spec permet
//     explicitement cette approche ("use the existing authRepo.CreateAuditLog
//     method OR direct SQL INSERT with SystemClaims").
//   - pool : pour la lecture défensive du filiereId+niveau d'un étudiant
//     lors du override manuel (PromoteStudentManual). Aucune méthode du
//     PromotionRepository ne couvre ce cas isolé — on fait un SELECT direct
//     plutôt que d'appeler ListEtudiantsForPromotion (qui chargerait TOUS les
//     étudiants de l'étab pour n'en garder qu'un).
//   - logger : journalisation structurée (slog) pour observabilité.
package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/notification"
	"github.com/udevrard7/sect/backend/internal/repository"
)

// PromotionUseCase implémente les cas d'usage de la clôture d'année académique.
//
// Méthodes (toutes prennent claims en paramètre pour valider le rôle + le
// scoping par établissement) :
//
//   - RunPromotion : crée un batch PENDING + journalise. Le worker prend le
//     relais async (ticker 10s) pour traiter chaque étudiant.
//   - PreviewPromotion : liste les étudiants éligibles avec décision suggérée
//     (sans appliquer). Permet au RESPONSABLE de reviewer avant de confirmer.
//   - GetBatchStatus : récupère un batch par ID (pour polling progression).
//   - ListBatches : historique des batches d'un étab.
//   - GetReglesPassage : config seuils d'un étab (ou défauts si non configurée).
//   - PromoteStudentManual : override individuel hors batch (POST /promote).
type PromotionUseCase struct {
	promoRepo domain.PromotionRepository
	authRepo  *repository.AuthRepository
	pool      *pgxpool.Pool
	logger    *slog.Logger

	// SECT-NOTIF-CLOTURE-1 : dispatcher de notifications (nil = pas de notif).
	// Injecté via SetNotificationDispatcher (setter — évite de casser la signature
	// NewPromotionUseCase existante). Appelé après chaque CloturerEtudiant pour
	// notifier l'étudiant de sa décision (promu/redoublant/diplômé).
	notifDispatcher *notification.Dispatcher
}

// NewPromotionUseCase crée un nouveau PromotionUseCase.
func NewPromotionUseCase(promoRepo domain.PromotionRepository, authRepo *repository.AuthRepository, pool *pgxpool.Pool, logger *slog.Logger) *PromotionUseCase {
	return &PromotionUseCase{
		promoRepo: promoRepo,
		authRepo:  authRepo,
		pool:      pool,
		logger:    logger,
	}
}

// SetNotificationDispatcher injecte le dispatcher de notifications (SECT-NOTIF-CLOTURE-1).
func (uc *PromotionUseCase) SetNotificationDispatcher(d *notification.Dispatcher) {
	uc.notifDispatcher = d
}

// RunPromotion crée un batch PENDING et journalise l'action. Le worker
// promotion_worker.go pickup le batch dans les 10s et traite chaque étudiant
// via cloturer_annee_etudiant.
//
// Étapes :
//  1. Valide le rôle (ADMIN/RESPONSABLE) + scoping (RESPONSABLE doit opérer
//     sur SON établissement).
//  2. Valide anneeSourceID != anneeCibleID (si anneeCibleID fourni).
//  3. Charge les ReglesPassage (ou défauts si aucune ligne).
//  4. Crée le batch PENDING avec seuilMoyenne = regles.SeuilMoyennePassage.
//     Les overrides (input.Overrides) sont sérialisés en JSON dans Details.
//  5. Journalise AuditLog (action=PROMOTION_BATCH_STARTED, entite=Etablissement).
//  6. Retourne le batch. Le worker picks it up async.
func (uc *PromotionUseCase) RunPromotion(ctx context.Context, claims db.SessionClaims, input domain.RunPromotionInput) (*domain.PromotionBatch, error) {
	// ── 1. Validation rôle + scoping ──
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé (ADMIN ou RESPONSABLE requis)"}
	}
	if input.EtablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}
	if input.AnneeSourceID == "" {
		return nil, &domain.ValidationError{Field: "anneeSourceId", Message: "requis"}
	}
	if role == domain.RoleResponsable && input.EtablissementID != claims.EtablissementID {
		return nil, &domain.UnauthorizedError{Message: "vous ne pouvez clôturer que votre établissement"}
	}

	// ── 2. Validation anneeSource != anneeCible ──
	if input.AnneeCibleID != nil && *input.AnneeCibleID == input.AnneeSourceID {
		return nil, &domain.ValidationError{
			Field:   "anneeCibleId",
			Message: "l'année cible doit être différente de l'année source",
		}
	}

	// ── 3. Charge ReglesPassage (avec fallback sur défauts) ──
	regles, err := uc.loadReglesPassage(ctx, claims, input.EtablissementID)
	if err != nil {
		return nil, err
	}

	// ── 4. Construit le batch PENDING ──
	// Les overrides sont sérialisés en JSON dans Details (le worker parse
	// au démarrage pour appliquer les décisions manuelles avant la logique auto).
	var detailsStr *string
	if len(input.Overrides) > 0 {
		detailsJSON, err := json.Marshal(map[string]any{
			"overrides": input.Overrides,
		})
		if err != nil {
			return nil, fmt.Errorf("marshal overrides: %w", err)
		}
		s := string(detailsJSON)
		detailsStr = &s
	}

	var runByID *string
	if input.RunByID != "" {
		runByID = &input.RunByID
	}

	batch := domain.PromotionBatch{
		EtablissementID: input.EtablissementID,
		AnneeSourceID:   input.AnneeSourceID,
		AnneeCibleID:    input.AnneeCibleID,
		Statut:          domain.PromotionBatchStatutPending,
		RunByID:         runByID,
		SeuilMoyenne:    regles.SeuilMoyennePassage,
		Details:         detailsStr,
	}

	// ── 5. INSERT PromotionBatch (RLS via claims) ──
	created, err := uc.promoRepo.CreateBatch(ctx, batch)
	if err != nil {
		return nil, fmt.Errorf("CreateBatch: %w", err)
	}

	// ── 6. INSERT AuditLog (PROMOTION_BATCH_STARTED) ──
	// Non-bloquant : si l'audit échoue, on log + on continue (le batch est
	// créé, le worker va le traiter — l'audit manquant est un moindre mal).
	uc.auditBatchStarted(ctx, claims, created, input)

	uc.logger.Info("PromotionUseCase: batch PENDING créé",
		"batchId", created.ID,
		"etablissementId", input.EtablissementID,
		"anneeSourceId", input.AnneeSourceID,
		"runById", input.RunByID,
		"overrides", len(input.Overrides),
	)

	return created, nil
}

// PreviewPromotion liste les étudiants éligibles à la clôture avec la décision
// suggérée (sans appliquer). Permet au RESPONSABLE de reviewer avant de
// confirmer le batch.
//
// La query SQL calcule moyenne + credits + décision en UNE passe (cf.
// repository.ListEtudiantsForPromotion). Aucune écriture — safe à appeler
// plusieurs fois.
func (uc *PromotionUseCase) PreviewPromotion(ctx context.Context, claims db.SessionClaims, etablissementID, anneeSourceID string) ([]domain.EtudiantProgression, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé (ADMIN ou RESPONSABLE requis)"}
	}
	if etablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}
	if anneeSourceID == "" {
		return nil, &domain.ValidationError{Field: "anneeSourceId", Message: "requis"}
	}
	if role == domain.RoleResponsable && etablissementID != claims.EtablissementID {
		return nil, &domain.UnauthorizedError{Message: "hors de votre établissement"}
	}
	return uc.promoRepo.ListEtudiantsForPromotion(ctx, etablissementID, anneeSourceID)
}

// GetBatchStatus récupère un batch par ID (pour polling progression).
// Le RESPONSABLE ne peut consulter que les batches de SON étab (defense in
// depth — la RLS policy PromotionBatch_select filtre déjà, mais on vérifie
// côté usecase aussi). L'ADMIN bypass.
func (uc *PromotionUseCase) GetBatchStatus(ctx context.Context, claims db.SessionClaims, batchID string) (*domain.PromotionBatch, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé (ADMIN ou RESPONSABLE requis)"}
	}
	if batchID == "" {
		return nil, &domain.ValidationError{Field: "batchId", Message: "requis"}
	}
	batch, err := uc.promoRepo.GetBatch(ctx, batchID)
	if err != nil {
		return nil, err
	}
	if role == domain.RoleResponsable && batch.EtablissementID != claims.EtablissementID {
		// On retourne NotFound plutôt que Forbidden pour ne pas leak l'existence
		// d'un batch cross-etab (sécurité par obscurité défensive).
		return nil, &domain.NotFoundError{Entity: "PromotionBatch", ID: batchID}
	}
	return batch, nil
}

// ListBatches retourne l'historique des batches d'un établissement (plus
// récent en premier). RLS via claims.
func (uc *PromotionUseCase) ListBatches(ctx context.Context, claims db.SessionClaims, etablissementID string) ([]domain.PromotionBatch, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé (ADMIN ou RESPONSABLE requis)"}
	}
	if etablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}
	if role == domain.RoleResponsable && etablissementID != claims.EtablissementID {
		return nil, &domain.UnauthorizedError{Message: "hors de votre établissement"}
	}
	return uc.promoRepo.ListBatchesByEtablissement(ctx, etablissementID)
}

// GetReglesPassage récupère les règles d'un établissement. Si aucune ligne
// n'existe en DB (cas anormal — le backfill 000087 devrait couvrir tous les
// étab), retourne les défauts (10/20, 8/20, 60%, STRICT, 2 redoublements).
func (uc *PromotionUseCase) GetReglesPassage(ctx context.Context, claims db.SessionClaims, etablissementID string) (*domain.ReglesPassage, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé (ADMIN ou RESPONSABLE requis)"}
	}
	if etablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}
	if role == domain.RoleResponsable && etablissementID != claims.EtablissementID {
		return nil, &domain.UnauthorizedError{Message: "hors de votre établissement"}
	}
	regles, err := uc.promoRepo.GetReglesPassage(ctx, etablissementID)
	if err != nil {
		// Si NotFoundError, on retourne les défauts plutôt que 404 — le frontend
		// peut ainsi afficher les seuils même si l'étab n'a pas de config.
		if _, ok := err.(*domain.NotFoundError); ok {
			defaults := domain.ReglesPassageDefaults
			defaults.EtablissementID = etablissementID
			return &defaults, nil
		}
		return nil, err
	}
	return regles, nil
}

// UpdateReglesPassageInput — body du PUT /api/etablissements/{id}/regles-passage.
//
// Les 5 champs correspondent aux 5 colonnes configurables de la table
// ReglesPassage (etablissementId + id sont fournis par l'URL ou générés côté SQL,
// pas par le client).
type UpdateReglesPassageInput struct {
	SeuilMoyennePassage    float64 `json:"seuilMoyennePassage"`
	SeuilMoyenneRattrapage float64 `json:"seuilMoyenneRattrapage"`
	CreditsMinPourcent     int     `json:"creditsMinPourcent"`
	Regime                 string  `json:"regime"`
	LimiteRedoublements    int     `json:"limiteRedoublements"`
}

// UpdateReglesPassage upsert les règles de passage d'un établissement (PUT
// /api/etablissements/{id}/regles-passage).
//
// Étapes :
//  1. Valide le rôle (ADMIN/RESPONSABLE — l'ENSEIGNANT B2C n'a pas accès à la
//     pédagogie de son étab personnel, contrairement aux autres mutations
//     académiques comme /promote). Le usecase est l'autorité ici — le middleware
//     RequireRoleOrPersonalEtab laisse passer l'ENSEIGNANT B2C, mais le usecase
//     le rejette.
//  2. Valide le scoping (RESPONSABLE ne peut modifier que SON étab).
//  3. Valide les seuils (defense in depth — le repo valide aussi, mais on échoue
//     vite côté usecase avant d'ouvrir une transaction).
//  4. Charge l'ID existant éventuel (pour le conserver lors de l'UPSERT — sinon
//     le repo génère un nouvel ID via 'regles_' || gen_random_uuid()).
//  5. Appelle promoRepo.UpdateReglesPassage (RLS via claims).
//  6. Journalise AuditLog (PROMOTION_REGLES_UPDATED). Non bloquant.
//  7. Retourne la ligne upsertée.
func (uc *PromotionUseCase) UpdateReglesPassage(ctx context.Context, claims db.SessionClaims, etablissementID string, input UpdateReglesPassageInput) (*domain.ReglesPassage, error) {
	// ── 1. Validation rôle ──
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé (ADMIN ou RESPONSABLE requis)"}
	}
	if etablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}

	// ── 2. Scoping RESPONSABLE ──
	if role == domain.RoleResponsable && etablissementID != claims.EtablissementID {
		return nil, &domain.UnauthorizedError{Message: "vous ne pouvez modifier que les règles de votre établissement"}
	}

	// ── 3. Validation seuils (defense in depth — repo valide aussi) ──
	regles := domain.ReglesPassage{
		EtablissementID:        etablissementID,
		SeuilMoyennePassage:    input.SeuilMoyennePassage,
		SeuilMoyenneRattrapage: input.SeuilMoyenneRattrapage,
		CreditsMinPourcent:     input.CreditsMinPourcent,
		Regime:                 input.Regime,
		LimiteRedoublements:    input.LimiteRedoublements,
	}
	if err := validateReglesPassageInput(input); err != nil {
		return nil, err
	}

	// ── 4. Charge l'ID existant (pour le conserver en cas d'UPDATE) ──
	// Le repo ferait un INSERT avec nouvel ID sinon. On préfère conserver
	// l'ID existant pour la traçabilité (lien avec AuditLog historique).
	existing, err := uc.promoRepo.GetReglesPassage(ctx, etablissementID)
	if err != nil {
		// NotFoundError = pas de ligne existante → INSERT avec nouvel ID. OK.
		if _, ok := err.(*domain.NotFoundError); !ok {
			return nil, fmt.Errorf("UpdateReglesPassage: load existing: %w", err)
		}
		// existing reste nil, l'ID sera généré côté SQL.
	} else {
		regles.ID = existing.ID
	}

	// ── 5. UPSERT (RLS via claims) ──
	updated, err := uc.promoRepo.UpdateReglesPassage(ctx, regles)
	if err != nil {
		return nil, err
	}

	// ── 6. AuditLog (non bloquant) ──
	uc.auditReglesUpdated(ctx, claims, etablissementID, input, existing)

	uc.logger.Info("PromotionUseCase: règles de passage mises à jour",
		"etablissementId", etablissementID,
		"seuilMoyennePassage", input.SeuilMoyennePassage,
		"seuilMoyenneRattrapage", input.SeuilMoyenneRattrapage,
		"creditsMinPourcent", input.CreditsMinPourcent,
		"regime", input.Regime,
		"limiteRedoublements", input.LimiteRedoublements,
		"modifiePar", claims.UserID,
	)

	return updated, nil
}

// validateReglesPassageInput valide les seuils d'un UpdateReglesPassageInput.
// Miroir côté usecase de repository.validateReglesPassage (defense in depth).
func validateReglesPassageInput(input UpdateReglesPassageInput) error {
	if input.SeuilMoyennePassage < 0 || input.SeuilMoyennePassage > 20 {
		return &domain.ValidationError{
			Field:   "seuilMoyennePassage",
			Message: "doit être compris entre 0 et 20",
		}
	}
	if input.SeuilMoyenneRattrapage < 0 || input.SeuilMoyenneRattrapage > input.SeuilMoyennePassage {
		return &domain.ValidationError{
			Field:   "seuilMoyenneRattrapage",
			Message: "doit être compris entre 0 et seuilMoyennePassage",
		}
	}
	if input.CreditsMinPourcent < 0 || input.CreditsMinPourcent > 100 {
		return &domain.ValidationError{
			Field:   "creditsMinPourcent",
			Message: "doit être compris entre 0 et 100",
		}
	}
	if input.LimiteRedoublements < 0 {
		return &domain.ValidationError{
			Field:   "limiteRedoublements",
			Message: "doit être un entier positif ou nul",
		}
	}
	if input.Regime != "STRICT" && input.Regime != "COMPENSATION" {
		return &domain.ValidationError{
			Field:   "regime",
			Message: "doit être 'STRICT' ou 'COMPENSATION'",
		}
	}
	return nil
}

// auditReglesUpdated journalise la mise à jour des règles de passage dans
// AuditLog. Non bloquant : si l'audit échoue, on log warn + on continue (les
// règles sont déjà persistées, l'audit manquant est un moindre mal).
//
// Action = PROMOTION_REGLES_UPDATED (nouvelle action), entite = Etablissement,
// entiteId = étab. details JSON : { avant: {...}, apres: {...}, modifiePar }.
func (uc *PromotionUseCase) auditReglesUpdated(ctx context.Context, claims db.SessionClaims, etablissementID string, input UpdateReglesPassageInput, existing *domain.ReglesPassage) {
	if uc.authRepo == nil {
		uc.logger.Warn("PromotionUseCase: authRepo nil, audit regles updated skip")
		return
	}
	details := map[string]any{
		"etablissementId": etablissementID,
		"modifiePar":      claims.UserID,
		"apres":           input,
	}
	if existing != nil {
		details["avant"] = map[string]any{
			"seuilMoyennePassage":    existing.SeuilMoyennePassage,
			"seuilMoyenneRattrapage": existing.SeuilMoyenneRattrapage,
			"creditsMinPourcent":     existing.CreditsMinPourcent,
			"regime":                 existing.Regime,
			"limiteRedoublements":    existing.LimiteRedoublements,
		}
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		uc.logger.Error("PromotionUseCase: marshal audit regles details failed", "error", err)
		return
	}
	etabID := etablissementID
	userID := claims.UserID
	entry := &domain.AuditLogEntry{
		UserID:          &userID,
		Action:          domain.AuditActionPromotionReglesUpdated,
		Entite:          "ReglesPassage",
		EntiteID:        &etabID,
		Details:         string(detailsJSON),
		AdresseIP:       "promotion-api",
		EtablissementID: &etabID,
		Reason:          "Règles de passage modifiées",
	}
	if err := uc.authRepo.CreateAuditLog(ctx, entry); err != nil {
		uc.logger.Error("PromotionUseCase: audit PROMOTION_REGLES_UPDATED failed",
			"etablissementId", etablissementID, "error", err)
	}
}

// PromoteStudentManual applique un override individuel hors batch (POST
// /api/etudiants/{id}/promote). Le RESPONSABLE force une décision pour un
// étudiant spécifique (PROMU/REDOUBLANT/DIPLOME/EXCLU/REORIENTE/QUITTE) avec
// un motif optionnel.
//
// Étapes :
//  1. Valide le rôle (ADMIN/RESPONSABLE).
//  2. Valide la décision (must be one of the 6 décisions non-EN_COURS).
//  3. Charge l'étudiant (filiereId + niveau) via SELECT direct sur "User"
//     (RLS via claims — le RESPONSABLE ne peut agir que sur un étudiant de
//     SON étab).
//  4. Charge les ReglesPassage (ou défauts).
//  5. Appelle promoRepo.CloturerEtudiant avec decisionOverride=decision,
//     decideParID=claims.UserID, batchID=nil (manual, pas de batch).
//  6. Retourne le résultat (décision appliquée + moyenne + credits + nouveau
//     niveau + error_message si erreur SQL).
func (uc *PromotionUseCase) PromoteStudentManual(
	ctx context.Context,
	claims db.SessionClaims,
	etudiantID, anneeSourceID string,
	anneeCibleID *string,
	decision domain.StatutInscription,
	motif string,
) (domain.CloturerEtudiantResult, error) {
	// ── 1. Validation rôle ──
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return domain.CloturerEtudiantResult{}, &domain.UnauthorizedError{Message: "rôle non autorisé (ADMIN ou RESPONSABLE requis)"}
	}
	if etudiantID == "" {
		return domain.CloturerEtudiantResult{}, &domain.ValidationError{Field: "etudiantId", Message: "requis"}
	}
	if anneeSourceID == "" {
		return domain.CloturerEtudiantResult{}, &domain.ValidationError{Field: "anneeSourceId", Message: "requis"}
	}

	// ── 2. Validation décision ──
	validDecisions := map[domain.StatutInscription]bool{
		domain.StatutInscriptionPromu:      true,
		domain.StatutInscriptionRedoublant: true,
		domain.StatutInscriptionDiplome:    true,
		domain.StatutInscriptionExclu:      true,
		domain.StatutInscriptionReoriente:  true,
		domain.StatutInscriptionQuitte:     true,
	}
	if !validDecisions[decision] {
		return domain.CloturerEtudiantResult{}, &domain.ValidationError{
			Field:   "decision",
			Message: "doit être une de PROMU, REDOUBLANT, DIPLOME, EXCLU, REORIENTE, QUITTE",
		}
	}

	// ── 3. Charge l'étudiant (filiereId + niveau + etablissementId) ──
	// SELECT direct via pool + RLS claims. Le RESPONSABLE ne peut agir que
	// sur un étudiant de SON étab (la RLS User_select filtre).
	etudiant, err := uc.fetchEtudiantForPromotion(ctx, claims, etudiantID)
	if err != nil {
		return domain.CloturerEtudiantResult{}, err
	}
	// Defense in depth : vérifie l'étab (la RLS devrait déjà bloquer, mais
	// on ajoute un check explicite pour les cas de misconfiguration RLS).
	if role == domain.RoleResponsable && etudiant.etablissementID != claims.EtablissementID {
		return domain.CloturerEtudiantResult{}, &domain.UnauthorizedError{Message: "vous ne pouvez agir que sur un étudiant de votre établissement"}
	}

	// ── 4. Charge ReglesPassage (ou défauts) ──
	regles, err := uc.loadReglesPassage(ctx, claims, etudiant.etablissementID)
	if err != nil {
		return domain.CloturerEtudiantResult{}, err
	}

	// ── 5. Appelle cloturer_annee_etudiant (SECURITY DEFINER, bypass RLS) ──
	decStr := string(decision)
	decideParID := claims.UserID
	var motifPtr *string
	if motif != "" {
		motifPtr = &motif
	}

	result, err := uc.promoRepo.CloturerEtudiant(
		ctx,
		etudiantID, anneeSourceID, anneeCibleID,
		etudiant.filiereID, etudiant.niveau,
		&decStr, motifPtr, &decideParID, nil, // batchID=nil = override manuel
		*regles,
	)
	if err != nil {
		return domain.CloturerEtudiantResult{}, fmt.Errorf("PromoteStudentManual: %w", err)
	}

	uc.logger.Info("PromotionUseCase: override manuel appliqué",
		"etudiantId", etudiantID,
		"anneeSourceId", anneeSourceID,
		"decision", decision,
		"decidePar", claims.UserID,
		"erreurSQL", result.ErrorMessage,
	)

	return result, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// loadReglesPassage charge les règles d'un établissement. Si aucune ligne
// n'existe (NotFoundError), retourne les défauts. Utilisé par RunPromotion +
// PromoteStudentManual pour calculer le seuilMoyenne et passer les seuils à
// cloturer_annee_etudiant.
func (uc *PromotionUseCase) loadReglesPassage(ctx context.Context, claims db.SessionClaims, etablissementID string) (*domain.ReglesPassage, error) {
	regles, err := uc.promoRepo.GetReglesPassage(ctx, etablissementID)
	if err != nil {
		if _, ok := err.(*domain.NotFoundError); ok {
			// Cas anormal — backfill 000087 manquant. On retourne les défauts.
			defaults := domain.ReglesPassageDefaults
			defaults.EtablissementID = etablissementID
			return &defaults, nil
		}
		return nil, fmt.Errorf("loadReglesPassage: %w", err)
	}
	return regles, nil
}

// auditBatchStarted journalise la création d'un batch dans AuditLog.
// Non-bloquant : si l'audit échoue, on log warn + on continue (le batch est
// déjà créé, l'audit manquant est un moindre mal).
//
// Action = PROMOTION_BATCH_STARTED, entite = Etablissement, entiteId = étab.
// details JSON : { batchId, anneeSourceId, anneeCibleId, runById, overrides }.
func (uc *PromotionUseCase) auditBatchStarted(ctx context.Context, claims db.SessionClaims, batch *domain.PromotionBatch, input domain.RunPromotionInput) {
	if uc.authRepo == nil {
		uc.logger.Warn("PromotionUseCase: authRepo nil, audit batch started skip")
		return
	}
	details := map[string]any{
		"batchId":       batch.ID,
		"anneeSourceId": input.AnneeSourceID,
		"runById":       input.RunByID,
		"seuilMoyenne":  batch.SeuilMoyenne,
		"overrides":     len(input.Overrides),
	}
	if input.AnneeCibleID != nil {
		details["anneeCibleId"] = *input.AnneeCibleID
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		uc.logger.Error("PromotionUseCase: marshal audit details failed", "error", err)
		return
	}
	etabID := batch.EtablissementID
	userID := claims.UserID
	entry := &domain.AuditLogEntry{
		UserID:          &userID,
		Action:          domain.AuditActionPromotionBatchStarted,
		Entite:          "Etablissement",
		EntiteID:        &etabID,
		Details:         string(detailsJSON),
		AdresseIP:       "promotion-api",
		EtablissementID: &etabID,
		Reason:          "Clôture d'année académique (batch créé)",
	}
	if err := uc.authRepo.CreateAuditLog(ctx, entry); err != nil {
		uc.logger.Error("PromotionUseCase: audit PROMOTION_BATCH_STARTED failed",
			"batchId", batch.ID, "error", err)
	}
}

// etudiantInfo — subset de User nécessaire pour CloturerEtudiant.
type etudiantInfo struct {
	etablissementID string
	filiereID       *string
	niveau          *string
}

// fetchEtudiantForPromotion récupère l'etablissementId + filiereId + niveau
// d'un étudiant. SELECT direct via pool + RLS claims (le RESPONSABLE ne peut
// agir que sur un étudiant de SON étab — la policy User_select filtre).
//
// On aurait pu ajouter une méthode au PromotionRepository, mais c'est un cas
// isolé (override manuel) — on évite de polluer l'interface pour un seul usecase.
// Le pattern est identique à cleanup_worker.insertAuditLog (SELECT direct).
func (uc *PromotionUseCase) fetchEtudiantForPromotion(ctx context.Context, claims db.SessionClaims, etudiantID string) (*etudiantInfo, error) {
	var info etudiantInfo
	err := db.WithTx(ctx, uc.pool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
                        SELECT "etablissementId", "filiereId", "niveau"::text
                        FROM "User"
                        WHERE "id" = $1
                          AND "role" = 'ETUDIANT'
                          AND "deletedAt" IS NULL`,
			etudiantID,
		).Scan(&info.etablissementID, &info.filiereID, &info.niveau)
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "Etudiant", ID: etudiantID}
		}
		return nil, fmt.Errorf("fetchEtudiantForPromotion: %w", err)
	}
	return &info, nil
}

// RunPromotionSync traite un batch de clôture de manière SYNCHRONE (dans la
// requête HTTP) au lieu d'async via le worker. Cette variante est nécessaire sur
// Render free tier où le worker async est tué par le cold start (la goroutine
// meurt avant de traiter le batch, laissant le statut RUNNING orphelin).
//
// Étapes (identiques au worker processPendingBatches, mais sync) :
//  1. Crée le batch PENDING (RunPromotion existant).
//  2. Charge ReglesPassage (fallback défauts).
//  3. Charge les étudiants éligibles.
//  4. Pour chaque étudiant : CloturerEtudiant + incrément counts. Best-effort.
//  5. Marque le batch COMPLETED + AuditLog.
//  6. Retourne le résultat final.
//
// Timeout : le handler HTTP doit mettre un timeout < 30s (limite Render free).
// Pour 800 étudiants, le traitement peut prendre 20-25s — acceptable. Au-delà,
// le frontend doit utiliser le mode async (worker) ou découper en chunks.
//
// SECT-CLOTURE-E2E-VERIFY-1 : cette méthode est le chemin principal de prod.
// Le worker async reste en place (defense-in-depth) mais n'est pas fiable sur
// Render free.
func (uc *PromotionUseCase) RunPromotionSync(ctx context.Context, claims db.SessionClaims, input domain.RunPromotionInput) (*domain.PromotionBatchResult, error) {
	// 1. Crée le batch PENDING (valide rôle + scoping + ReglesPassage).
	batch, err := uc.RunPromotion(ctx, claims, input)
	if err != nil {
		return nil, err
	}

	// 2. Charge ReglesPassage (déjà fait dans RunPromotion, mais on reload pour
	// avoir l'objet complet — RunPromotion ne le retourne pas).
	regles, err := uc.loadReglesPassage(ctx, claims, input.EtablissementID)
	if err != nil {
		errMsg := fmt.Sprintf("loadReglesPassage: %v", err)
		_ = uc.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutFailed,
			domain.PromotionBatchResult{BatchID: batch.ID, Statut: domain.PromotionBatchStatutFailed}, &errMsg)
		return nil, err
	}

	// 3. Marque le batch RUNNING.
	sysCtx := db.WithClaimsContext(ctx, db.SystemClaims())
	_ = uc.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutRunning,
		domain.PromotionBatchResult{BatchID: batch.ID, Statut: domain.PromotionBatchStatutRunning}, nil)

	// 4. Charge les étudiants éligibles.
	etudiants, err := uc.promoRepo.ListEtudiantsForPromotion(sysCtx, input.EtablissementID, input.AnneeSourceID)
	if err != nil {
		errMsg := fmt.Sprintf("ListEtudiantsForPromotion: %v", err)
		_ = uc.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutFailed,
			domain.PromotionBatchResult{BatchID: batch.ID, Statut: domain.PromotionBatchStatutFailed}, &errMsg)
		return nil, fmt.Errorf("%s", errMsg)
	}

	// 5. Parse les overrides.
	overrideMap := make(map[string]domain.OverrideDecision)
	if len(input.Overrides) > 0 {
		for _, ov := range input.Overrides {
			overrideMap[ov.EtudiantID] = ov
		}
	}

	// 6. Boucle de traitement (best-effort par étudiant).
	result := domain.PromotionBatchResult{
		BatchID:        batch.ID,
		Statut:         domain.PromotionBatchStatutRunning,
		TotalEtudiants: len(etudiants),
	}
	anneeCibleID := input.AnneeCibleID // déjà *string
	var runByIDPtr *string
	if input.RunByID != "" {
		r := input.RunByID
		runByIDPtr = &r
	}
	var batchIDPtr = &batch.ID

	for _, etu := range etudiants {
		var decisionOverride *string
		var motif *string
		if ov, ok := overrideMap[etu.EtudiantID]; ok {
			d := string(ov.Decision)
			decisionOverride = &d
			if ov.Motif != "" {
				motif = &ov.Motif
			}
		}
		var niveauPtr *string
		if string(etu.Niveau) != "" {
			n := string(etu.Niveau)
			niveauPtr = &n
		}

		dec, err := uc.promoRepo.CloturerEtudiant(
			ctx, etu.EtudiantID, input.AnneeSourceID, anneeCibleID,
			etu.FiliereID, niveauPtr,
			decisionOverride, motif,
			runByIDPtr, batchIDPtr, *regles,
		)
		if err != nil || dec.ErrorMessage != "" {
			result.ErreurCount++
			msg := dec.ErrorMessage
			if err != nil {
				msg = err.Error()
			}
			result.Erreurs = append(result.Erreurs, domain.EtudiantErreur{
				EtudiantID: etu.EtudiantID, Nom: etu.Nom, Erreur: msg,
			})
		} else {
			switch dec.Decision {
			case domain.StatutInscriptionPromu:
				result.PromuCount++
			case domain.StatutInscriptionRedoublant:
				result.RedoublantCount++
			case domain.StatutInscriptionDiplome:
				result.DiplomeCount++
			case domain.StatutInscriptionExclu, domain.StatutInscriptionReoriente, domain.StatutInscriptionQuitte:
				result.ExcluCount++
			}

			// SECT-NOTIF-CLOTURE-1 : notifier l'étudiant de sa décision.
			if uc.notifDispatcher != nil {
				titre, msg := uc.buildClotureNotification(dec.Decision, etu.Nom, input.AnneeSourceID)
				uc.notifDispatcher.Dispatch(ctx, notification.Event{
					UserID:      etu.EtudiantID,
					Type:        "CLOTURE_DECISION",
					Titre:       titre,
					Message:     msg,
					Categorie:   "pedagogique",
					Priorite:    "success",
					ActionURL:   "/mes-resultats",
					ActionLabel: "Voir mes résultats",
					Icone:       "GraduationCap",
				})
			}
		}
		result.Progression++
		// Update live (pour polling si le frontend suit en parallèle).
		_ = uc.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutRunning, result, nil)
	}

	// 7. Marque COMPLETED.
	result.Statut = domain.PromotionBatchStatutCompleted
	if err := uc.promoRepo.UpdateBatchStatut(ctx, batch.ID, domain.PromotionBatchStatutCompleted, result, nil); err != nil {
		uc.logger.Error("RunPromotionSync: UpdateBatchStatut COMPLETED failed", "batchId", batch.ID, "error", err)
	}

	// 8. AuditLog (non bloquant).
	uc.auditBatchCompleted(ctx, batch.ID, input.EtablissementID, input.RunByID, result)

	uc.logger.Info("RunPromotionSync: batch COMPLETED",
		"batchId", batch.ID,
		"total", result.TotalEtudiants,
		"promu", result.PromuCount,
		"redoublant", result.RedoublantCount,
		"diplome", result.DiplomeCount,
		"erreur", result.ErreurCount,
	)
	return &result, nil
}

// auditBatchCompleted journalise la fin d'un batch dans AuditLog. Non bloquant.
func (uc *PromotionUseCase) auditBatchCompleted(ctx context.Context, batchID, etablissementID, runByID string, result domain.PromotionBatchResult) {
	if uc.authRepo == nil {
		return
	}
	details := map[string]any{
		"batchId":         batchID,
		"etablissementId": etablissementID,
		"totalEtudiants":  result.TotalEtudiants,
		"promuCount":      result.PromuCount,
		"redoublantCount": result.RedoublantCount,
		"diplomeCount":    result.DiplomeCount,
		"excluCount":      result.ExcluCount,
		"erreurCount":     result.ErreurCount,
	}
	detailsJSON, _ := json.Marshal(details)
	var runByPtr *string
	if runByID != "" {
		runByPtr = &runByID
	}
	batchIDPtr := batchID
	entry := &domain.AuditLogEntry{
		UserID:   runByPtr,
		Action:   domain.AuditActionPromotionBatchCompleted,
		Entite:   "PromotionBatch",
		EntiteID: &batchIDPtr,
		Details:  string(detailsJSON),
	}
	_ = uc.authRepo.CreateAuditLog(ctx, entry)
}

// buildClotureNotification construit le titre + message de la notification
// envoyée à l'étudiant après clôture, selon sa décision.
// SECT-NOTIF-CLOTURE-1.
func (uc *PromotionUseCase) buildClotureNotification(decision domain.StatutInscription, nomEtudiant, anneeSourceID string) (titre, message string) {
	switch decision {
	case domain.StatutInscriptionPromu:
		titre = "Promotion accordée 🎓"
		message = fmt.Sprintf("%s, vous êtes promu(e) au niveau supérieur pour la prochaine année académique.", nomEtudiant)
	case domain.StatutInscriptionRedoublant:
		titre = "Décision de fin d'année"
		message = fmt.Sprintf("%s, vous redoublez l'année. Consultez vos résultats pour plus de détails.", nomEtudiant)
	case domain.StatutInscriptionDiplome:
		titre = "Diplôme obtenu 🎉"
		message = fmt.Sprintf("Félicitations %s, vous avez validé votre diplôme !", nomEtudiant)
	case domain.StatutInscriptionExclu:
		titre = "Décision de fin d'année"
		message = fmt.Sprintf("%s, consultez votre statut auprès de votre responsable.", nomEtudiant)
	default:
		titre = "Clôture de l'année académique"
		message = fmt.Sprintf("%s, votre année académique a été clôturée.", nomEtudiant)
	}
	return
}
