// Package usecase — bibliothèque P4 : dimension sociale (ADR-0008).
//
// OuvrageSocialUseCase porte les annotations (visibilité
// PRIVEE/FILIERE/ETABLISSEMENT), la file de propositions G1
// (RESPONSABLE propose → ADMIN tranche), les veilles thématiques
// (notification au dépôt) et l'évaluation du badge « lecteur assidu »
// — le premier badge décerné par le backend Go.
//
// Principe directeur : « l'IA propose, l'enseignant décide » de P3
// devient ici « le social enrichit, la RLS cloisonne » — AUCUNE
// méthode ne fait de SQL direct ; tout passe par les repositories sous
// les claims de l'appelant, les policies 000127/000128 font le scope.
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/notification"
)

// OuvrageSocialUseCase — cas d'usage sociaux de la bibliothèque.
type OuvrageSocialUseCase struct {
	annotationRepo  domain.OuvrageAnnotationRepository
	propositionRepo domain.OuvragePropositionRepository
	veilleRepo      domain.OuvrageVeilleRepository
	badgeRepo       domain.BadgeProgressionRepository
	ouvrageRepo     domain.OuvrageRepository
	lectureRepo     domain.OuvrageLectureRepository
	notifDispatcher *notification.Dispatcher
}

// NewOuvrageSocialUseCase — constructeur (pattern projet : dépendances
// explicites ; le notifDispatcher est injecté ensuite via setter, cf.
// promotionUC.SetNotificationDispatcher).
func NewOuvrageSocialUseCase(
	annotationRepo domain.OuvrageAnnotationRepository,
	propositionRepo domain.OuvragePropositionRepository,
	veilleRepo domain.OuvrageVeilleRepository,
	badgeRepo domain.BadgeProgressionRepository,
	ouvrageRepo domain.OuvrageRepository,
	lectureRepo domain.OuvrageLectureRepository,
) *OuvrageSocialUseCase {
	return &OuvrageSocialUseCase{
		annotationRepo:  annotationRepo,
		propositionRepo: propositionRepo,
		veilleRepo:      veilleRepo,
		badgeRepo:       badgeRepo,
		ouvrageRepo:     ouvrageRepo,
		lectureRepo:     lectureRepo,
	}
}

// SetNotificationDispatcher — injection tardive (pattern promotion.go :
// main.go construit le dispatcher APRÈS les usecases).
func (uc *OuvrageSocialUseCase) SetNotificationDispatcher(d *notification.Dispatcher) {
	uc.notifDispatcher = d
}

// ──────────────────────────────────────────────────────────────────────
// Annotations (ADR-0008 §1)
// ──────────────────────────────────────────────────────────────────────

// ListAnnotations — annotations visibles de l'appelant sur un ouvrage
// (le pré-check FindByID garantit le 404 d'auto-masquage des ouvrages
// invisibles, pattern GetLecture).
func (uc *OuvrageSocialUseCase) ListAnnotations(ctx context.Context, claims db.SessionClaims, ouvrageID string, page int) ([]domain.OuvrageAnnotation, error) {
	if _, err := uc.ouvrageRepo.FindByID(ctx, ouvrageID); err != nil {
		return nil, err
	}
	if page < 0 {
		page = 0
	}
	return uc.annotationRepo.ListByOuvrage(ctx, ouvrageID, page)
}

// CreateAnnotation — POST : validations bornées (page, contenu,
// visibilité) ; FILIERE exige une filière (claims, sinon User — jamais
// de fallback silencieux PRIVEE).
func (uc *OuvrageSocialUseCase) CreateAnnotation(ctx context.Context, claims db.SessionClaims, input domain.CreateAnnotationInput) (*domain.OuvrageAnnotation, error) {
	if claims.UserID == "" {
		return nil, &domain.UnauthorizedError{Message: "identité requise pour annoter"}
	}
	if _, err := uc.ouvrageRepo.FindByID(ctx, input.OuvrageID); err != nil {
		return nil, err // 404 d'auto-masquage (RLS)
	}
	if input.Page < 1 || input.Page > domain.MaxPageAnnotation {
		return nil, &domain.ValidationError{Field: "page", Message: fmt.Sprintf("page entre 1 et %d requise", domain.MaxPageAnnotation)}
	}
	input.Contenu = strings.TrimSpace(input.Contenu)
	if len(input.Contenu) < domain.MinContenuAnnotation {
		return nil, &domain.ValidationError{Field: "contenu", Message: "contenu requis"}
	}
	if len(input.Contenu) > domain.MaxContenuAnnotation {
		return nil, &domain.ValidationError{Field: "contenu", Message: fmt.Sprintf("contenu limité à %d caractères", domain.MaxContenuAnnotation)}
	}
	if !domain.IsValidVisibiliteAnnotation(input.Visibilite) {
		return nil, &domain.ValidationError{Field: "visibilite", Message: "visibilité invalide (PRIVEE, FILIERE, ETABLISSEMENT)"}
	}
	input.UserID = claims.UserID
	if input.Visibilite == domain.VisibiliteAnnotationFiliere {
		fil := strings.TrimSpace(claims.FiliereID)
		if fil == "" {
			return nil, &domain.ValidationError{Field: "visibilite", Message: "visibilité FILIERE réservée aux membres d'une filière (vous n'en avez pas)"}
		}
		input.FiliereID = &fil
	} else {
		input.FiliereID = nil
	}
	return uc.annotationRepo.Create(ctx, input)
}

// UpdateAnnotation — PATCH propriétaire (contenu/visibilite optionnels).
func (uc *OuvrageSocialUseCase) UpdateAnnotation(ctx context.Context, claims db.SessionClaims, annotationID string, input domain.UpdateAnnotationInput) (*domain.OuvrageAnnotation, error) {
	if input.Contenu != nil {
		v := strings.TrimSpace(*input.Contenu)
		if len(v) < domain.MinContenuAnnotation || len(v) > domain.MaxContenuAnnotation {
			return nil, &domain.ValidationError{Field: "contenu", Message: fmt.Sprintf("contenu entre 1 et %d caractères", domain.MaxContenuAnnotation)}
		}
		input.Contenu = &v
	}
	if input.Visibilite != nil {
		if !domain.IsValidVisibiliteAnnotation(*input.Visibilite) {
			return nil, &domain.ValidationError{Field: "visibilite", Message: "visibilité invalide"}
		}
		if *input.Visibilite == domain.VisibiliteAnnotationFiliere && strings.TrimSpace(claims.FiliereID) == "" {
			return nil, &domain.ValidationError{Field: "visibilite", Message: "visibilité FILIERE réservée aux membres d'une filière"}
		}
	}
	return uc.annotationRepo.Update(ctx, annotationID, input)
}

// DeleteAnnotation — DELETE propriétaire.
func (uc *OuvrageSocialUseCase) DeleteAnnotation(ctx context.Context, claims db.SessionClaims, annotationID string) error {
	return uc.annotationRepo.Delete(ctx, annotationID)
}

// ──────────────────────────────────────────────────────────────────────
// Propositions (ADR-0008 §2) — file G1
// ──────────────────────────────────────────────────────────────────────

// CreateProposition — RESPONSABLE propose un ouvrage (métadonnées
// seulement — le dépôt du PDF reste un acte ADMIN, G1).
func (uc *OuvrageSocialUseCase) CreateProposition(ctx context.Context, claims db.SessionClaims, input domain.CreatePropositionInput) (*domain.OuvrageProposition, error) {
	if claims.Role != "RESPONSABLE" && claims.Role != "ADMIN" {
		return nil, &domain.UnauthorizedError{Message: "proposition d'ouvrage réservée au RESPONSABLE (file G1, ADR-0007/0008)"}
	}
	if strings.TrimSpace(claims.EtablissementID) == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "établissement requis (file par établissement, G2)"}
	}
	if strings.TrimSpace(input.Titre) == "" {
		return nil, &domain.ValidationError{Field: "titre", Message: "titre requis"}
	}
	if !domain.IsValidOuvrageCategorie(input.Categorie) {
		return nil, &domain.ValidationError{Field: "categorie", Message: "catégorie invalide"}
	}
	if strings.TrimSpace(input.LicenceOrigine) == "" {
		return nil, &domain.ValidationError{Field: "licenceOrigine", Message: "licence/origine des droits requise (garde-fou ADR-0007 §risques)"}
	}
	if input.Niveau != nil && *input.Niveau != "" {
		if !domain.IsValidNiveauEtude(*input.Niveau) {
			return nil, &domain.ValidationError{Field: "niveau", Message: "niveau invalide (L1, L2, L3, M1, M2, DOCTORAT)"}
		}
	} else {
		input.Niveau = nil
	}
	if input.FiliereID != nil && strings.TrimSpace(*input.FiliereID) == "" {
		input.FiliereID = nil
	}
	input.EtablissementID = claims.EtablissementID
	input.ProposantID = claims.UserID
	return uc.propositionRepo.Create(ctx, input)
}

// ListPropositions — la file (scoping RLS : ADMIN voit tout, le
// RESPONSABLE voit ses propositions).
func (uc *OuvrageSocialUseCase) ListPropositions(ctx context.Context, claims db.SessionClaims, params domain.PropositionListParams) (*domain.PropositionListResult, error) {
	if claims.Role != "RESPONSABLE" && claims.Role != "ADMIN" {
		return nil, &domain.UnauthorizedError{Message: "file de propositions réservée au RESPONSABLE et à l'ADMIN"}
	}
	return uc.propositionRepo.List(ctx, params)
}

// TrancheProposition — l'ADMIN tranche (ACCEPTEE/REFUSEE) et le
// proposant est notifié (fire-and-forget, jamais bloquant).
func (uc *OuvrageSocialUseCase) TrancheProposition(ctx context.Context, claims db.SessionClaims, id string, input domain.TranchePropositionInput) (*domain.OuvrageProposition, error) {
	if claims.Role != "ADMIN" {
		return nil, &domain.UnauthorizedError{Message: "la décision sur une proposition est réservée à l'ADMIN (G1)"}
	}
	if input.Decision != domain.PropositionAcceptee && input.Decision != domain.PropositionRefusee {
		return nil, &domain.ValidationError{Field: "decision", Message: "decision doit valoir ACCEPTEE ou REFUSEE"}
	}
	motif := ""
	if input.MotifRefus != nil {
		motif = strings.TrimSpace(*input.MotifRefus)
	}
	if input.Decision == domain.PropositionRefusee && motif == "" {
		return nil, &domain.ValidationError{Field: "motifRefus", Message: "motif de refus requis (feedback au proposant)"}
	}
	var motifPtr *string
	if motif != "" {
		motifPtr = &motif
	}

	p, err := uc.propositionRepo.Trancher(ctx, id, input.Decision, motifPtr, claims.UserID)
	if err != nil {
		return nil, err
	}

	// Notification au proposant — best-effort (pattern promotion.go).
	if uc.notifDispatcher != nil {
		titre, msg := "Proposition d'ouvrage acceptée",
			fmt.Sprintf("Votre proposition « %s » a été acceptée par l'administration — le dépôt du fichier suivra.", p.Titre)
		if input.Decision == domain.PropositionRefusee {
			titre, msg = "Proposition d'ouvrage refusée",
				fmt.Sprintf("Votre proposition « %s » a été refusée. Motif : %s", p.Titre, motif)
		}
		uc.notifDispatcher.Dispatch(ctx, notification.Event{
			UserID:      p.ProposantID,
			Type:        "PROPOSITION_TRANCHEE",
			Titre:       titre,
			Message:     msg,
			Categorie:   "bibliotheque",
			Priorite:    "info",
			ActionURL:   "/bibliotheque",
			ActionLabel: "Voir la bibliothèque",
			Icone:       "BookMarked",
		})
	}
	return p, nil
}

// LinkPropositionOuvrage — lie l'ouvrage déposé à une proposition
// ACCEPTEE (POST /api/ouvrages avec propositionId ; l'ouvrage EXISTE
// déjà — un échec de liaison ne détruit jamais le dépôt).
func (uc *OuvrageSocialUseCase) LinkPropositionOuvrage(ctx context.Context, claims db.SessionClaims, propositionID, ouvrageID string) error {
	if claims.Role != "ADMIN" {
		return &domain.UnauthorizedError{Message: "liaison réservée à l'ADMIN (G1)"}
	}
	return uc.propositionRepo.LinkOuvrage(ctx, propositionID, ouvrageID)
}

// DeleteProposition — retrait du proposant (EN_ATTENTE) ou ADMIN.
func (uc *OuvrageSocialUseCase) DeleteProposition(ctx context.Context, claims db.SessionClaims, id string) error {
	if claims.Role != "RESPONSABLE" && claims.Role != "ADMIN" {
		return &domain.UnauthorizedError{Message: "retrait réservé au proposant et à l'ADMIN"}
	}
	return uc.propositionRepo.Delete(ctx, id)
}

// ──────────────────────────────────────────────────────────────────────
// Veilles (ADR-0008 §4)
// ──────────────────────────────────────────────────────────────────────

// ListVeilles — les veilles de l'appelant.
func (uc *OuvrageSocialUseCase) ListVeilles(ctx context.Context, claims db.SessionClaims) ([]domain.OuvrageVeille, error) {
	return uc.veilleRepo.ListByUser(ctx, claims.UserID)
}

// CreateVeille — une recherche sauvegardée (terme 2..100, catégorie
// optionnelle). UNIQUE(userId, terme) → 409.
func (uc *OuvrageSocialUseCase) CreateVeille(ctx context.Context, claims db.SessionClaims, input domain.CreateVeilleInput) (*domain.OuvrageVeille, error) {
	if strings.TrimSpace(claims.EtablissementID) == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "veille réservée aux membres d'un établissement (cloisonnement G2)"}
	}
	input.Terme = strings.TrimSpace(input.Terme)
	if len(input.Terme) < domain.MinTermeVeille || len(input.Terme) > domain.MaxTermeVeille {
		return nil, &domain.ValidationError{Field: "terme", Message: fmt.Sprintf("terme entre %d et %d caractères", domain.MinTermeVeille, domain.MaxTermeVeille)}
	}
	if input.Categorie != nil && !domain.IsValidOuvrageCategorie(*input.Categorie) {
		return nil, &domain.ValidationError{Field: "categorie", Message: "catégorie invalide"}
	}
	input.UserID = claims.UserID
	input.EtablissementID = claims.EtablissementID
	return uc.veilleRepo.Create(ctx, input)
}

// DeleteVeille — suppression propriétaire.
func (uc *OuvrageSocialUseCase) DeleteVeille(ctx context.Context, claims db.SessionClaims, id string) error {
	return uc.veilleRepo.Delete(ctx, id, claims.UserID)
}

// NotifierVeilles — appelé APRÈS un dépôt réussi (handler upload) :
// matching des veilles de l'établissement contre l'ouvrage + notification
// de chaque abonné. Best-effort TOTAL : aucune erreur ne remonte (un
// dépôt réussi ne doit jamais échouer à cause de la veille).
func (uc *OuvrageSocialUseCase) NotifierVeilles(ctx context.Context, claims db.SessionClaims, o *domain.Ouvrage) {
	if uc.notifDispatcher == nil || o == nil {
		return
	}
	abonnes, err := uc.veilleRepo.MatchingAbonnes(ctx, o.EtablissementID, o)
	if err != nil {
		slog.Warn("bibliothèque: matching veilles échoué (dépôt servi quand-même)", "ouvrageId", o.ID, "error", err)
		return
	}
	for _, v := range abonnes {
		uc.notifDispatcher.Dispatch(ctx, notification.Event{
			UserID:      v.UserID,
			Type:        "OUVRAGE_VEILLE",
			Titre:       "Nouvel ouvrage correspondant à votre veille",
			Message:     fmt.Sprintf("« %s » vient d'être ajouté à la bibliothèque et correspond à votre alerte « %s ».", o.Titre, v.Terme),
			Categorie:   "bibliotheque",
			Priorite:    "info",
			ActionURL:   "/bibliotheque",
			ActionLabel: "Ouvrir la bibliothèque",
			Icone:       "Bell",
		})
	}
	if len(abonnes) > 0 {
		slog.Info("bibliothèque: veilles notifiées", "ouvrageId", o.ID, "abonnes", len(abonnes))
	}
}

// ──────────────────────────────────────────────────────────────────────
// Badge « lecteur assidu » (ADR-0008 §3)
// ──────────────────────────────────────────────────────────────────────

// lecteurAssiduPaliers — paliers ordonnés (niveau → seuil en secondes).
var lecteurAssiduPaliers = []struct {
	Niveau string
	Seuil  int64
}{
	{"BRONZE", domain.LecteurAssiduBronzeSeuil},
	{"ARGENT", domain.LecteurAssiduArgentSeuil},
	{"OR", domain.LecteurAssiduOrSeuil},
	{"DIAMANT", domain.LecteurAssiduDiamantSeuil},
}

// EvaluateLecteurAssidu — recalcule la progression du badge depuis les
// secondes de lecture cumulées (OuvrageLecture) et upsert la
// progression. Retourne les CLES des badges dont le niveau vient de
// monter (première obtention ou palier supérieur) — vide si rien de
// nouveau. Idempotent : rappeler sans nouvelle lecture ne re-notifie pas.
//
// Appelé depuis PUT /api/ouvrages/{id}/lecture (best-effort après
// l'upsert de télémétrie) et POST /api/badges (recalcul explicite, la
// réponse newlyUnlocked est enfin remplie).
func (uc *OuvrageSocialUseCase) EvaluateLecteurAssidu(ctx context.Context, claims db.SessionClaims) []string {
	if claims.UserID == "" {
		return nil
	}
	total, err := uc.lectureRepo.SumTempsLectureByUser(ctx, claims.UserID)
	if err != nil {
		slog.Warn("bibliothèque: SUM lecture pour badge échoué", "userId", claims.UserID, "error", err)
		return nil
	}

	// Niveau atteint + prochain palier.
	niveau := ""
	var palier int64
	var prochain *int64
	for i, p := range lecteurAssiduPaliers {
		if total >= p.Seuil {
			niveau = p.Niveau
			palier = p.Seuil
			if i+1 < len(lecteurAssiduPaliers) {
				n := lecteurAssiduPaliers[i+1].Seuil
				prochain = &n
				palier = n // palier à afficher = le prochain objectif
			}
		}
	}
	if niveau == "" {
		// Pas encore BRONZE : progression vers le premier palier.
		niveau = "BRONZE"
		palier = domain.LecteurAssiduBronzeSeuil
		n := int64(domain.LecteurAssiduBronzeSeuil)
		prochain = &n
	}
	if prochain == nil {
		// DIAMANT atteint : plus de prochain niveau.
		palier = domain.LecteurAssiduDiamantSeuil
	}
	debloque := total >= domain.LecteurAssiduBronzeSeuil

	// Avant/après pour détecter une NOUVELLE obtention (montée de
	// niveau), sans re-notifier un état déjà connu.
	snapshot, err := uc.badgeRepo.GetByCle(ctx, claims.UserID, domain.LecteurAssiduCle)
	if err != nil {
		slog.Warn("bibliothèque: lecture progression badge échouée", "userId", claims.UserID, "error", err)
		return nil
	}
	// Nouvelle obtention = niveau débloqué qui MONTE (première obtention
	// BRONZE ou palier supérieur). Jamais notifié si pas débloqué, ni
	// re-notifié à niveau constant (idempotent).
	nouveau := debloque && (snapshot == nil ||
		!snapshot.Debloque ||
		niveauRang(niveau) > niveauRang(snapshot.NiveauActuel))

	var dateObtention *time.Time
	if debloque {
		if snapshot != nil && snapshot.Debloque && niveauRang(niveau) <= niveauRang(snapshot.NiveauActuel) {
			dateObtention = snapshot.DateObtention // stable : on garde la 1re date au même niveau
		} else {
			t := time.Now().UTC()
			dateObtention = &t
		}
	}

	pi := int(palier)
	var pProchain *int
	if prochain != nil {
		pi2 := int(*prochain)
		pProchain = &pi2
	}
	if err := uc.badgeRepo.UpsertByCle(ctx, claims.UserID, domain.LecteurAssiduCle, domain.BadgeProgressionUpsert{
		NiveauActuel:   niveau,
		ValeurActuelle: int(total),
		ValeurPalier:   pi,
		ValeurProchain: pProchain,
		Debloque:       debloque,
		DateObtention:  dateObtention,
	}); err != nil {
		slog.Warn("bibliothèque: upsert progression badge échoué", "userId", claims.UserID, "error", err)
		return nil
	}

	if !nouveau {
		return nil
	}

	// Notification de la nouvelle obtention (fire-and-forget).
	if uc.notifDispatcher != nil {
		titre := "Badge « Lecteur assidu » débloqué !"
		msg := fmt.Sprintf("Félicitations — vous avez atteint le niveau %s du badge Lecteur assidu. Continuez à explorer la bibliothèque !", niveau)
		uc.notifDispatcher.Dispatch(ctx, notification.Event{
			UserID:      claims.UserID,
			Type:        "BADGE_DEBLOQUE",
			Titre:       titre,
			Message:     msg,
			Categorie:   "pedagogique",
			Priorite:    "success",
			ActionURL:   "/profil",
			ActionLabel: "Voir mes récompenses",
			Icone:       "BookOpen",
		})
	}
	return []string{domain.LecteurAssiduCle}
}

// niveauRang — ordre des niveaux (BRONZE < ARGENT < OR < DIAMANT) ;
// valeur inconnue = 0.
func niveauRang(niveau string) int {
	switch niveau {
	case "BRONZE":
		return 1
	case "ARGENT":
		return 2
	case "OR":
		return 3
	case "DIAMANT":
		return 4
	}
	return 0
}
