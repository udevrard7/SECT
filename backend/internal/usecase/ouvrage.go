// Package usecase — logique métier Ouvrage (bibliothèque numérique,
// ADR-0007 P1 ; 000137 : visibilité 3 niveaux + analyse IA).
//
// Gouvernance 000137 (dérivation SERVEUR du périmètre — le client ne
// choisit JAMAIS sa visibilité, miroir des policies RLS Ouvrage_insert) :
//
//	ADMIN global      → PLATEFORME  (catalogue pour TOUS les clients
//	                    SECT — corrige la plainte « destiné à une
//	                    seule université ») ;
//	ADMIN assistance  → ETABLISSEMENT (l'étab assisté, ADR-0009) ;
//	RESPONSABLE       → ETABLISSEMENT (le sien), VALIDE d'office ;
//	ENSEIGNANT        → CLASSE (ses classes, intersection scellée
//	                    avec EnseignantFiliere), naît BROUILLON —
//	                    validé par le RESPONSABLE de son étab ;
//	ETUDIANT         → lecture seule (403 sur tout dépôt).
//
// Analyse IA (tâche 2) : l'IA PROPOSE (valeur+confiance+preuve par
// champ), l'HUMAIN dispose — aucune écriture en base sans relecture.
package usecase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/ledongthuc/pdf"
	"github.com/udevrard7/sect/backend/internal/ai"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/storage"
)

// defautQuotaBibliothequeMo — quota stockage bibliothèque par établissement
// (ADR-0007 : cible initiale 2 Go, configurable). 000137 : le même budget
// s'applique au catalogue commun PLATEFORME (SumTaillesPlateforme).
const defautQuotaBibliothequeMo int64 = 2048

// OuvrageUseCase implémente les cas d'usage de la bibliothèque.
type OuvrageUseCase struct {
	ouvrageRepo domain.OuvrageRepository
	lectureRepo domain.OuvrageLectureRepository
	storage     domain.StorageClient
	aiService   *ai.AIService
	quotaMo     int64
}

// NewOuvrageUseCase crée un nouveau OuvrageUseCase. Le quota bibliothèque
// est lu à la construction (BIBLIOTHEQUE_QUOTA_MO, défaut 2048 Mo).
// SECT-BIBLIO-P2 : lectureRepo pour la lecture mesurée (OuvrageLecture).
// SECT-BIBLIO-5 (000137) : aiService pour l'analyse IA du PDF (nil =
// analyse indisponible, le dépôt manuel reste possible — jamais bloquant).
func NewOuvrageUseCase(ouvrageRepo domain.OuvrageRepository, lectureRepo domain.OuvrageLectureRepository, storageClient domain.StorageClient, aiSvc *ai.AIService) *OuvrageUseCase {
	quota := defautQuotaBibliothequeMo
	if v := os.Getenv("BIBLIOTHEQUE_QUOTA_MO"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			quota = n
		} else {
			slog.Warn("BIBLIOTHEQUE_QUOTA_MO invalide, défaut conservé", "value", v, "défaut", defautQuotaBibliothequeMo)
		}
	}
	return &OuvrageUseCase{ouvrageRepo: ouvrageRepo, lectureRepo: lectureRepo, storage: storageClient, aiService: aiSvc, quotaMo: quota}
}

// List — catalogue (tous rôles authentifiés ; la RLS scope par la
// fonction ouvrage_visible 000137 : plateforme/établissement/classes,
// corbeille et droits expirés masqués pour les lecteurs, brouillons
// réservés déposant/responsable/admin).
func (uc *OuvrageUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.OuvrageListParams) (*domain.OuvrageListResult, error) {
	if params.IncludeDeleted {
		// La corbeille ne concerne que l'ADMIN (badge + restore) — les
		// lecteurs ne la voient jamais.
		if claims.Role != string(domain.RoleAdmin) {
			params.IncludeDeleted = false
		}
	}
	if params.Page < 1 {
		params.Page = 1
	}
	if params.Limit < 1 {
		params.Limit = 20
	}
	// Filtre brouillons : les lecteurs ne demandent jamais les
	// brouillons d'autrui (la RLS masquerait de toute façon).
	return uc.ouvrageRepo.List(ctx, params)
}

// GetByID — fiche d'un ouvrage (RLS : 404 si invisible).
func (uc *OuvrageUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Ouvrage, error) {
	return uc.ouvrageRepo.FindByID(ctx, id)
}

// deriveScope — périmètre DÉRIVÉ DU RÔLE (000137). Écrase systématiquement
// les champs de scoping de l'input : le client ne peut pas usurper un
// périmètre (2e ligne de défense après le form ; la 3e est la policy RLS).
func (uc *OuvrageUseCase) deriveScope(ctx context.Context, claims db.SessionClaims, input *domain.CreateOuvrageInput) error {
	switch claims.Role {
	case string(domain.RoleAdmin):
		if claims.EtablissementID != "" {
			// Mode assistance (ADR-0009) : l'ADMIN agit DANS le
			// périmètre de l'établissement assisté.
			input.Visibility = domain.VisibiliteEtablissement
			input.EtablissementID = claims.EtablissementID
		} else {
			// ADMIN global : catalogue commun à TOUS les clients.
			input.Visibility = domain.VisibilitePlateforme
			input.EtablissementID = ""
		}
		input.Statut = domain.StatutOuvrageValide
	case string(domain.RoleResponsable):
		if claims.EtablissementID == "" {
			return &domain.ValidationError{Field: "etablissementId", Message: "responsable sans établissement rattaché — dépôt impossible"}
		}
		input.Visibility = domain.VisibiliteEtablissement
		input.EtablissementID = claims.EtablissementID
		input.Statut = domain.StatutOuvrageValide
	case string(domain.RoleEnseignant):
		if claims.EtablissementID == "" {
			return &domain.ValidationError{Field: "etablissementId", Message: "enseignant sans établissement rattaché — dépôt impossible"}
		}
		input.Visibility = domain.VisibiliteClasse
		input.EtablissementID = claims.EtablissementID
		// Human-in-the-loop : le dépôt enseignant naît BROUILLON
		// (invisible des étudiants), validé par son responsable.
		input.Statut = domain.StatutOuvrageBrouillon
		// Intersection scellée serveur : seules SES classes réelles
		// (EnseignantFiliere) sont conservées — usurpation impossible.
		mesClasses, err := uc.ouvrageRepo.MesClassesEnseignant(ctx)
		if err != nil {
			return fmt.Errorf("mes classes: %w", err)
		}
		legitimes := make(map[string]bool, len(mesClasses))
		for _, c := range mesClasses {
			legitimes[c.FiliereID+"|"+c.Niveau] = true
		}
		gardees := make([]domain.OuvrageClasseInput, 0, len(input.Classes))
		for _, c := range input.Classes {
			if legitimes[c.FiliereID+"|"+c.Niveau] {
				gardees = append(gardees, c)
			} else {
				slog.Warn("bibliothèque: classe demandée hors périmètre enseignant, ignorée",
					"filiereId", c.FiliereID, "niveau", c.Niveau, "enseignant", claims.UserID)
			}
		}
		if len(gardees) == 0 {
			return &domain.ValidationError{
				Field:   "classes",
				Message: "au moins une de VOS classes est requise (ciblage « mes classes » uniquement — les classes hors de votre périmètre sont ignorées)",
			}
		}
		input.Classes = gardees
	default:
		return &domain.UnauthorizedError{Message: "dépôt d'ouvrage réservé à l'ADMIN, au RESPONSABLE et à l'ENSEIGNANT (l'étudiant est lecteur)"}
	}
	return nil
}

// Upload — dépôt d'un ouvrage (ADMIN/RESPONSABLE/ENSEIGNANT, 000137 ;
// le router double-vérifie via RequireRole — défense en profondeur).
//
// Flux (pattern document.go) :
//  1. dérivation SERVEUR du périmètre (deriveScope) ;
//  2. validations métier (titre, catégorie, licence, niveau enum, PDF, taille) ;
//  3. quota stockage (catalogue commun pour PLATEFORME, établissement sinon) ;
//  4. upload R2 (clé ouvrages/{oid}/{ts}_{nom} — mode DB-only si R2 absent) ;
//  5. INSERT + ciblage classes (FK invalides → ValidationError, pas de 500) ;
//  6. si l'INSERT échoue : best-effort suppression de l'objet R2.
func (uc *OuvrageUseCase) Upload(ctx context.Context, claims db.SessionClaims, input domain.CreateOuvrageInput, content []byte) (*domain.Ouvrage, error) {
	if err := uc.deriveScope(ctx, claims, &input); err != nil {
		return nil, err
	}
	if strings.TrimSpace(input.Titre) == "" {
		return nil, &domain.ValidationError{Field: "titre", Message: "titre requis"}
	}
	if !domain.IsValidOuvrageCategorie(input.Categorie) {
		return nil, &domain.ValidationError{Field: "categorie", Message: "catégorie invalide (REFERENTIEL_OFFICIEL, OUVRAGE_REFERENCE, RECHERCHE_ACADEMIQUE, PRATIQUE_PROFESSIONNELLE)"}
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
	if input.CreatedByID == "" {
		input.CreatedByID = claims.UserID
	}

	// Fichier : PDF uniquement en P1 (lecteur in-browser ; autres formats
	// = évolution marquée, cf. domain.ouvrage.go).
	if !strings.HasSuffix(strings.ToLower(input.NomFichier), domain.OuvrageExtension) {
		return nil, &domain.ValidationError{Field: "file", Message: "seuls les fichiers PDF sont acceptés en P1"}
	}
	fileSize := len(content)
	if int64(fileSize) > domain.MaxTailleOuvrage {
		return nil, &domain.ValidationError{Field: "file", Message: "fichier trop volumineux (max 100 Mo)"}
	}

	// Quota stockage : catalogue commun (PLATEFORME) ou établissement.
	var sum int64
	var err error
	if input.Visibility == domain.VisibilitePlateforme {
		sum, err = uc.ouvrageRepo.SumTaillesPlateforme(ctx)
	} else {
		sum, err = uc.ouvrageRepo.SumTaillesByEtablissement(ctx, input.EtablissementID)
	}
	if err != nil {
		return nil, fmt.Errorf("quota check: %w", err)
	}
	if sum+int64(fileSize) > uc.quotaMo*1024*1024 {
		return nil, &domain.ValidationError{
			Field:   "file",
			Message: fmt.Sprintf("quota stockage bibliothèque dépassé (%d Mo utilisés + %d Mo > limite %d Mo) — purgez la corbeille ou augmentez BIBLIOTHEQUE_QUOTA_MO", sum/(1024*1024), fileSize/(1024*1024), uc.quotaMo),
		}
	}

	// Clé R2 : l'ID est généré ici pour clé ouvrages/… (ADR-0007 §stockage) ;
	// le repo réutilise cet ID (input.ID) au lieu d'en générer un autre.
	oid := uuid.NewString()
	input.ID = oid
	objectKey := storage.GenerateOuvrageObjectKey(oid, input.NomFichier)
	key := objectKey
	input.CheminStockage = &key
	input.TailleFichier = fileSize
	if input.TypeMime == "" {
		input.TypeMime = domain.OuvrageMime
	}

	if uc.storage != nil {
		if _, err := uc.storage.Upload(ctx, domain.StorageObject{
			Key:           objectKey,
			Content:       content,
			ContentType:   domain.OuvrageMime,
			ContentLength: int64(fileSize),
		}); err != nil {
			return nil, fmt.Errorf("upload to R2: %w", err)
		}
	}

	created, err := uc.ouvrageRepo.Create(ctx, input)
	if err != nil {
		if uc.storage != nil {
			_ = uc.storage.Delete(ctx, objectKey) // best-effort (pattern document)
		}
		return nil, err
	}
	return created, nil
}

// canManageOuvrage — droit de gestion d'un ouvrage existant (000137) :
// ADMIN (tout), RESPONSABLE (son établissement), ENSEIGNANT (son dépôt).
// Le pré-fetch passe par la RLS : un ouvrage hors périmètre est déjà 404.
func canManageOuvrage(claims db.SessionClaims, o *domain.Ouvrage) bool {
	switch claims.Role {
	case string(domain.RoleAdmin):
		return true
	case string(domain.RoleResponsable):
		return o.EtablissementID != "" && o.EtablissementID == claims.EtablissementID
	case string(domain.RoleEnseignant):
		return o.CreatedByID == claims.UserID
	}
	return false
}

// Update — modification d'un ouvrage (ADMIN/RESPONSABLE/ENSEIGNANT
// dans leur périmètre ; promotion/démotion de visibilité = ADMIN seul ;
// statut = RESPONSABLE/ADMIN ; l'enseignant édite son brouillon mais
// ne le publie pas lui-même).
func (uc *OuvrageUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateOuvrageInput) (*domain.Ouvrage, error) {
	if claims.Role != string(domain.RoleAdmin) &&
		claims.Role != string(domain.RoleResponsable) &&
		claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "modification d'ouvrage réservée à l'ADMIN, au RESPONSABLE et à l'ENSEIGNANT (son dépôt)"}
	}
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err // NotFoundError (RLS) tel quel
	}
	if !canManageOuvrage(claims, o) {
		return nil, &domain.UnauthorizedError{Message: "modification refusée : cet ouvrage est hors de votre périmètre"}
	}

	if input.Categorie != nil && !domain.IsValidOuvrageCategorie(*input.Categorie) {
		return nil, &domain.ValidationError{Field: "categorie", Message: "catégorie invalide"}
	}
	if input.Niveau != nil && *input.Niveau != "" && !domain.IsValidNiveauEtude(*input.Niveau) {
		return nil, &domain.ValidationError{Field: "niveau", Message: "niveau invalide (L1, L2, L3, M1, M2, DOCTORAT)"}
	}
	if input.Titre != nil && strings.TrimSpace(*input.Titre) == "" {
		return nil, &domain.ValidationError{Field: "titre", Message: "le titre ne peut pas être vide"}
	}
	if input.LicenceOrigine != nil && strings.TrimSpace(*input.LicenceOrigine) == "" {
		return nil, &domain.ValidationError{Field: "licenceOrigine", Message: "la licence/origine ne peut pas être vide"}
	}

	// Promotion/démotion de périmètre : ADMIN seul (la RLS fige aussi —
	// Ouvrage_update WITH CHECK 000137). La promotion CONSERVE
	// l'établissement d'origine (retour possible — leçon sandbox
	// BIBLIOTHEQUE-2 : la promotion n'efface pas la provenance).
	if input.Visibility != nil {
		if claims.Role != string(domain.RoleAdmin) {
			return nil, &domain.UnauthorizedError{Message: "changement de visibilité réservé à l'ADMIN plateforme"}
		}
		if !domain.IsValidVisibiliteOuvrage(*input.Visibility) {
			return nil, &domain.ValidationError{Field: "visibility", Message: "visibilité invalide (PLATEFORME, ETABLISSEMENT, CLASSE)"}
		}
		// Une promotion ETABLISSEMENT→PLATEFORME doit garder son
		// établissement d'origine ; une démotion PLATEFORME(né NULL)→
		// ETABLISSEMENT exige un établissement cible.
		if *input.Visibility != domain.VisibilitePlateforme && o.EtablissementID == "" && claims.EtablissementID == "" {
			return nil, &domain.ValidationError{Field: "visibility", Message: "démotion impossible sans établissement d'origine ni établissement courant"}
		}
	}
	// Modération de statut : RESPONSABLE/ADMIN, jamais l'enseignant.
	if input.Statut != nil {
		if claims.Role == string(domain.RoleEnseignant) {
			return nil, &domain.UnauthorizedError{Message: "la validation d'un brouillon est réservée au RESPONSABLE de l'établissement ou à l'ADMIN"}
		}
		if *input.Statut != domain.StatutOuvrageValide && *input.Statut != domain.StatutOuvrageBrouillon {
			return nil, &domain.ValidationError{Field: "statut", Message: "statut invalide (VALIDE, BROUILLON)"}
		}
	}
	// Remplacement du ciblage classes : intersection scellée serveur.
	if input.Classes != nil && claims.Role == string(domain.RoleEnseignant) {
		mesClasses, err := uc.ouvrageRepo.MesClassesEnseignant(ctx)
		if err != nil {
			return nil, fmt.Errorf("mes classes: %w", err)
		}
		legitimes := make(map[string]bool, len(mesClasses))
		for _, c := range mesClasses {
			legitimes[c.FiliereID+"|"+c.Niveau] = true
		}
		gardees := make([]domain.OuvrageClasseInput, 0, len(input.Classes))
		for _, c := range input.Classes {
			if legitimes[c.FiliereID+"|"+c.Niveau] {
				gardees = append(gardees, c)
			}
		}
		if len(gardees) == 0 {
			return nil, &domain.ValidationError{Field: "classes", Message: "au moins une de VOS classes est requise pour le ciblage"}
		}
		input.Classes = gardees
	}

	return uc.ouvrageRepo.Update(ctx, id, input)
}

// ValiderOuvrage — modération human-in-the-loop (000137) : publie un
// BROUILLON (dépôt enseignant). RESPONSABLE de l'établissement ou ADMIN.
func (uc *OuvrageUseCase) ValiderOuvrage(ctx context.Context, claims db.SessionClaims, id string) (*domain.Ouvrage, error) {
	if claims.Role != string(domain.RoleAdmin) && claims.Role != string(domain.RoleResponsable) {
		return nil, &domain.UnauthorizedError{Message: "validation réservée au RESPONSABLE de l'établissement ou à l'ADMIN"}
	}
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if claims.Role == string(domain.RoleResponsable) &&
		(o.EtablissementID == "" || o.EtablissementID != claims.EtablissementID) {
		return nil, &domain.UnauthorizedError{Message: "validation réservée aux brouillons de VOTRE établissement"}
	}
	if o.Statut == domain.StatutOuvrageValide {
		return o, nil // idempotent : déjà validé
	}
	statut := domain.StatutOuvrageValide
	return uc.ouvrageRepo.Update(ctx, id, domain.UpdateOuvrageInput{Statut: &statut})
}

// SoftDelete — corbeille (ADMIN tout ; RESPONSABLE son étab ; ENSEIGNANT
// son dépôt). Le fichier R2 reste (restauration possible ; purge des
// octets = job séparé, ADR-0007 §stockage).
func (uc *OuvrageUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) error {
	if claims.Role != string(domain.RoleAdmin) &&
		claims.Role != string(domain.RoleResponsable) &&
		claims.Role != string(domain.RoleEnseignant) {
		return &domain.UnauthorizedError{Message: "suppression d'ouvrage réservée à l'ADMIN, au RESPONSABLE et à l'ENSEIGNANT (son dépôt)"}
	}
	if claims.Role != string(domain.RoleAdmin) {
		o, err := uc.ouvrageRepo.FindByID(ctx, id)
		if err != nil {
			return err
		}
		if !canManageOuvrage(claims, o) {
			return &domain.UnauthorizedError{Message: "suppression refusée : cet ouvrage est hors de votre périmètre"}
		}
	}
	return uc.ouvrageRepo.SoftDelete(ctx, id)
}

// Restore — sort un ouvrage de la corbeille (ADMIN tout ; resp/ens dans
// leur périmètre).
func (uc *OuvrageUseCase) Restore(ctx context.Context, claims db.SessionClaims, id string) (*domain.Ouvrage, error) {
	if claims.Role != string(domain.RoleAdmin) &&
		claims.Role != string(domain.RoleResponsable) &&
		claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "restauration réservée à l'ADMIN, au RESPONSABLE et à l'ENSEIGNANT (son dépôt)"}
	}
	if claims.Role != string(domain.RoleAdmin) {
		o, err := uc.ouvrageRepo.FindByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if !canManageOuvrage(claims, o) {
			return nil, &domain.UnauthorizedError{Message: "restauration refusée : cet ouvrage est hors de votre périmètre"}
		}
	}
	return uc.ouvrageRepo.Restore(ctx, id)
}

// MesClasses — les classes de l'enseignant courant (filière × niveau),
// pour le sélecteur « classes destinatrices » du formulaire de dépôt.
func (uc *OuvrageUseCase) MesClasses(ctx context.Context, claims db.SessionClaims) ([]domain.OuvrageClasseRef, error) {
	if claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "réservé à l'ENSEIGNANT (ciblage « mes classes »)"}
	}
	return uc.ouvrageRepo.MesClassesEnseignant(ctx)
}

// GetFichierURL — URL présignée pour la lecture in-browser (ADR-0007 :
// presigned courte durée, défaut 15 min). Journalise l'accès
// (AuditLog OUVRAGE_LECTURE, best-effort : une panne d'audit ne bloque pas
// la lecture — le garde-fou reste l'URL courte durée).
func (uc *OuvrageUseCase) GetFichierURL(ctx context.Context, claims db.SessionClaims, id string, ip string, expiresIn int) (string, error) {
	if expiresIn <= 0 || expiresIn > 900 {
		expiresIn = 900
	}
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return "", err
	}
	if o.CheminStockage == nil || *o.CheminStockage == "" {
		return "", &domain.ValidationError{Field: "fichier", Message: "fichier non stocké pour cet ouvrage (mode DB-only)"}
	}
	if uc.storage == nil {
		// Mode DB-only (R2 non configuré — pattern document) : erreur HONNÊTE
		// et lisible (affichée dans le lecteur), pas un 500 générique.
		return "", &domain.ValidationError{
			Field:   "fichier",
			Message: "stockage non configuré (mode DB-only) — la lecture de fichier nécessite la configuration R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)",
		}
	}

	url, err := uc.storage.PresignURL(ctx, *o.CheminStockage, expiresIn)
	if err != nil {
		return "", fmt.Errorf("presign: %w", err)
	}

	// Audit de l'accès (garde-fou ADR-0007) — best-effort.
	auditErr := uc.ouvrageRepo.AuditLecture(ctx, domain.OuvrageAuditEntry{
		OuvrageID:       o.ID,
		Titre:           o.Titre,
		Categorie:       o.Categorie,
		ActorUserID:     claims.UserID,
		ActorEmail:      claims.Email,
		ActorIP:         ip,
		EtablissementID: o.EtablissementID,
		ExpiresIn:       expiresIn,
	})
	if auditErr != nil {
		slog.Warn("bibliothèque: audit de lecture échoué (accès servi quand-même)", "ouvrageId", o.ID, "error", auditErr)
	}
	return url, nil
}

// ──────────────────────────────────────────────────────────────────────
// SECT-BIBLIO-5 (tâche 2) : analyse IA du PDF, pré-remplissage assisté.
// ──────────────────────────────────────────────────────────────────────

// constantes d'analyse : pages extraites (couverture + page de titre +
// copyright suffisent) et budget de texte envoyé au LLM.
const (
	analyseMaxPages = 8
	analyseMaxRunes = 12_000
)

// extractPDFText — extrait le texte des premières pages (lib pure Go,
// zéro dépendance externe ; les PDFs scannés/protégés → texte vide :
// l'analyse IA devient indisponible, la saisie manuelle reste possible).
func extractPDFText(content []byte, maxPages, maxRunes int) (string, int) {
	reader := bytes.NewReader(content)
	r, err := pdf.NewReader(reader, int64(len(content)))
	if err != nil {
		return "", 0
	}
	n := r.NumPage()
	if n > maxPages {
		n = maxPages
	}
	var sb strings.Builder
	for i := 1; i <= n; i++ {
		p := r.Page(i)
		if p.V.IsNull() {
			continue
		}
		txt, err := p.GetPlainText(nil)
		if err != nil {
			continue
		}
		sb.WriteString(txt)
		sb.WriteString("\n")
		if utf8.RuneCountInString(sb.String()) > maxRunes {
			break
		}
	}
	s := sb.String()
	if utf8.RuneCountInString(s) > maxRunes {
		runes := []rune(s)
		s = string(runes[:maxRunes])
	}
	return s, n
}

// analyseLLMResponse — miroir du JSON strict attendu du LLM.
type analyseLLMResponse struct {
	Titre            domain.AnalyseOuvrageField `json:"titre"`
	Auteurs          domain.AnalyseOuvrageField `json:"auteurs"`
	Editeur          domain.AnalyseOuvrageField `json:"editeur"`
	Edition          domain.AnalyseOuvrageField `json:"edition"`
	AnneePublication domain.AnalyseOuvrageField `json:"anneePublication"`
	ISBN             domain.AnalyseOuvrageField `json:"isbn"`
	Langue           domain.AnalyseOuvrageField `json:"langue"`
	Themes           domain.AnalyseOuvrageField `json:"themes"`
	Description      domain.AnalyseOuvrageField `json:"description"`
}

// stripJSONFences — retire d'éventuelles balises ```json … ``` autour de
// la réponse du LLM (réalité de terrain des chat completions).
func stripJSONFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if idx := strings.Index(s, "\n"); idx > 0 {
			s = s[idx+1:]
		}
		if idx := strings.LastIndex(s, "```"); idx >= 0 {
			s = s[:idx]
		}
	}
	return strings.TrimSpace(s)
}

// Analyze — analyse IA du PDF d'ouvrage : extraction locale du texte des
// premières pages, puis ChatCompletion sur les providers configurés
// (failover/cooldowns de l'AIService existant — aucun coût nouveau).
// La réponse porte valeur + confiance + preuve PAR CHAMP : l'humain
// voit POURQUOI l'IA propose une valeur et peut la corriger.
//
// Jamais bloquant : indisponible → Disponible=false + raison (saisie
// manuelle), erreur validation fichier → 400 honnête.
func (uc *OuvrageUseCase) Analyze(ctx context.Context, claims db.SessionClaims, content []byte, nomFichier string) (*domain.AnalyseOuvrageResult, error) {
	if claims.Role != string(domain.RoleAdmin) &&
		claims.Role != string(domain.RoleResponsable) &&
		claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "analyse réservée à l'ADMIN, au RESPONSABLE et à l'ENSEIGNANT (ceux qui déposent)"}
	}
	if !strings.HasSuffix(strings.ToLower(nomFichier), domain.OuvrageExtension) {
		return nil, &domain.ValidationError{Field: "file", Message: "seuls les fichiers PDF sont acceptés (P1)"}
	}
	if int64(len(content)) > domain.MaxTailleOuvrage {
		return nil, &domain.ValidationError{Field: "file", Message: "fichier trop volumineux (max 100 Mo)"}
	}
	indisponible := func(raison string) *domain.AnalyseOuvrageResult {
		return &domain.AnalyseOuvrageResult{Disponible: false, Raison: raison}
	}

	if uc.aiService == nil {
		return indisponible("service IA non configuré — remplissez le formulaire manuellement"), nil
	}

	texte, pages := extractPDFText(content, analyseMaxPages, analyseMaxRunes)
	if strings.TrimSpace(texte) == "" {
		return indisponible("texte du PDF inextractible (document scanné ou protégé) — remplissez le formulaire manuellement"), nil
	}

	systemPrompt := `Tu es un assistant documentaire d'une bibliothèque universitaire numérique ouest-africaine (SECT). On te fournit le texte extrait des premières pages d'un PDF (souvent couverture, page de titre et page de copyright). Extrais les métadonnées bibliographiques.
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format exact :
{"titre":{"valeur":"...","confiance":0,"preuve":"..."},"auteurs":{"valeur":"Nom Prénom; Nom Prénom","confiance":0,"preuve":"..."},"editeur":{"valeur":"...","confiance":0,"preuve":"..."},"edition":{"valeur":"...","confiance":0,"preuve":"..."},"anneePublication":{"valeur":"2024","confiance":0,"preuve":"..."},"isbn":{"valeur":"...","confiance":0,"preuve":"..."},"langue":{"valeur":"Français","confiance":0,"preuve":"..."},"themes":{"valeur":"thème 1; thème 2","confiance":0,"preuve":"..."},"description":{"valeur":"résumé en 2 phrases maximum","confiance":0,"preuve":"..."}}
Règles strictes :
- confiance = entier 0 à 100 (100 = explicitement imprimé sur la page de titre ou le copyright ; 0 = absent).
- preuve = court extrait VERBATIM du document source, 120 caractères maximum ("" si absent).
- Si une information est absente du texte, mets valeur="" et confiance=0. N'INVENTE JAMAIS : un champ vide vaut mieux qu'une invention.
- auteurs et themes : plusieurs valeurs séparées par « ; ».
- anneePublication : uniquement une année plausible (1400-2100) vue dans le document.
- Les noms propres africains sont courants (Diop, Traoré, Koné, Bamba, Kouassi…) : ne les « corrige » pas.`

	userPrompt := fmt.Sprintf("Nom du fichier : %s\n\nTexte extrait (pages 1-%d) :\n%s", nomFichier, pages, texte)

	result, err := uc.aiService.ChatCompletion(ctx, []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	})
	if err != nil {
		slog.Warn("bibliothèque: analyse IA échouée (saisie manuelle)", "fichier", nomFichier, "error", err)
		return indisponible("analyse IA momentanément indisponible (provider en échec) — remplissez le formulaire manuellement ou réessayez"), nil
	}

	var parsed analyseLLMResponse
	if err := json.Unmarshal([]byte(stripJSONFences(result.Content)), &parsed); err != nil {
		slog.Warn("bibliothèque: réponse IA illisible (saisie manuelle)", "error", err)
		return indisponible("réponse de l'analyse illisible — remplissez le formulaire manuellement"), nil
	}

	// Plausibilité de l'année (garde stupide anti-hallucination).
	if y := parsed.AnneePublication.Valeur; y != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(y)); err != nil || n < 1400 || n > 2100 {
			parsed.AnneePublication = domain.AnalyseOuvrageField{}
		} else {
			parsed.AnneePublication.Valeur = strconv.Itoa(n)
		}
	}
	// Clamp des confiances.
	clampField := func(f *domain.AnalyseOuvrageField) {
		if f.Confiance < 0 {
			f.Confiance = 0
		}
		if f.Confiance > 100 {
			f.Confiance = 100
		}
		if len(f.Preuve) > 200 {
			f.Preuve = f.Preuve[:200] + "…"
		}
	}
	clampField(&parsed.Titre)
	clampField(&parsed.Auteurs)
	clampField(&parsed.Editeur)
	clampField(&parsed.Edition)
	clampField(&parsed.AnneePublication)
	clampField(&parsed.ISBN)
	clampField(&parsed.Langue)
	clampField(&parsed.Themes)
	clampField(&parsed.Description)

	return &domain.AnalyseOuvrageResult{
		Disponible:       true,
		Titre:            parsed.Titre,
		Auteurs:          parsed.Auteurs,
		Editeur:          parsed.Editeur,
		Edition:          parsed.Edition,
		AnneePublication: parsed.AnneePublication,
		ISBN:             parsed.ISBN,
		Langue:           parsed.Langue,
		Themes:           parsed.Themes,
		Description:      parsed.Description,
		Modele:           result.Model,
		PagesAnalysees:   pages,
	}, nil
}

// ──────────────────────────────────────────────────────────────────────
// SECT-BIBLIO-P2 (ADR-0007 §P2) : la lecture mesurée.
// ──────────────────────────────────────────────────────────────────────

// GetLecture — la progression de lecture de l'utilisateur sur un
// ouvrage (nil = première lecture). Le pré-check FindByID garantit le
// 404 d'auto-masquage : un ouvrage invisible répond « introuvable »
// même sans progression enregistrée (pas de fuite d'existence via
// {"lecture": null}), cohérent avec GET /api/ouvrages/{id}.
func (uc *OuvrageUseCase) GetLecture(ctx context.Context, claims db.SessionClaims, ouvrageID string) (*domain.OuvrageLecture, error) {
	if _, err := uc.ouvrageRepo.FindByID(ctx, ouvrageID); err != nil {
		return nil, err // NotFoundError (RLS) tel quel
	}
	return uc.lectureRepo.GetLecture(ctx, ouvrageID, claims.UserID)
}

// sanitizePagesVues — télémétrie TOLÉRANTE : les clés non numériques ou
// hors [1, MaxPageOuvrage] et les valeurs ≤ 0 sont DROPPÉEs ; les
// valeurs > MaxVuesParPage sont CLAMPÉEs ; la map est bornée à
// MaxEntreesPagesVues entrées (premiers arrivés — la fusion repo
// re-trie si la map fusionnée dépasse la borne).
func sanitizePagesVues(in map[string]int) map[string]int {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]int, len(in))
	for k, v := range in {
		n, err := strconv.Atoi(k)
		if err != nil || n < 1 || n > domain.MaxPageOuvrage {
			continue // clé invalide : droppée silencieusement
		}
		if v < 1 {
			continue // vue nulle/négative : droppée
		}
		if v > domain.MaxVuesParPage {
			v = domain.MaxVuesParPage // clamp
		}
		if len(out) >= domain.MaxEntreesPagesVues {
			break // borne anti-gonflement
		}
		out[strconv.Itoa(n)] = v
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// RecordLecture — upsert de la télémétrie (PUT /api/ouvrages/{id}/lecture).
// Tous les rôles authentifiés (le lecteur étudiant est le principal
// utilisateur) — le scoping propriétaire + ouvrage visible est fait par
// les policies RLS OuvrageLecture_* (000124/000137), défense en
// profondeur ici : les valeurs sont clampées/sanitarisées AVANT le repo.
func (uc *OuvrageUseCase) RecordLecture(ctx context.Context, claims db.SessionClaims, ouvrageID string, input domain.RecordLectureInput) (*domain.OuvrageLecture, error) {
	if claims.UserID == "" {
		return nil, &domain.UnauthorizedError{Message: "identité requise pour la télémétrie de lecture"}
	}
	// Clamps tolérants (jamais de 400 pour un heartbeat : une sonde ne
	// doit pas casser la lecture).
	if input.DernierePage != nil {
		p := clampInt(*input.DernierePage, 1, domain.MaxPageOuvrage)
		input.DernierePage = &p
	}
	if input.TempsDeltaSec < 0 {
		input.TempsDeltaSec = 0
	}
	if input.TempsDeltaSec > domain.MaxTempsDeltaSec {
		input.TempsDeltaSec = domain.MaxTempsDeltaSec
	}
	input.PagesVues = sanitizePagesVues(input.PagesVues)
	return uc.lectureRepo.UpsertLecture(ctx, ouvrageID, claims.UserID, input)
}

// ActiviteEtablissement — agrégats d'activité de la bibliothèque
// (ADR-0007 §P2 : « activité lisible par l'enseignant »). 000137 : les
// lectures des ouvrages PLATEFORME par les membres de l'établissement
// comptent dans SON activité (fonction SQL 000137).
//
// Gating (défense en profondeur — le router double-vérifie via
// RequireRole, la fonction SQL ré-impose le contrôle en interne) :
//   - ETUDIANT → 403 (l'activité de lecture est une vue enseignante) ;
//   - hors de SON établissement → 403 (cloisonnement), pour TOUS
//     les rôles (ADR-0009) : l'ADMIN global (sans établissement)
//     passe par le mode assistance — JWT avec etablissementId, accès
//     APPROUVE par le RESPONSABLE (B-2), max 24 h, audit trail.
func (uc *OuvrageUseCase) ActiviteEtablissement(ctx context.Context, claims db.SessionClaims, etablissementID string) ([]domain.OuvrageActivite, error) {
	if claims.Role != string(domain.RoleEnseignant) &&
		claims.Role != string(domain.RoleResponsable) &&
		claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "activité de bibliothèque réservée aux enseignants, responsables et admin (ADR-0007 §P2)"}
	}
	if claims.EtablissementID != etablissementID {
		return nil, &domain.UnauthorizedError{Message: "activité lisible uniquement pour votre propre établissement — l'ADMIN global doit activer le mode assistance (accès à faire approuver par le responsable de l'établissement)"}
	}
	return uc.lectureRepo.ActiviteEtablissement(ctx, etablissementID)
}

// clampInt — borne inclusive [min, max] (miroir local du helper repo —
// le usecase ne dépend pas du package repository).
func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
