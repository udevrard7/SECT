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
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/ledongthuc/pdf"
	"github.com/udevrard7/sect/backend/internal/ai"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/storage"
	"github.com/udevrard7/sect/backend/internal/tts"
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
	// SECT-TTS-1 : service de synthèse vocale (lecture orale — chaîne
	// gratuite Gemini → MeloTTS). nil = fonctionnalité absente (les
	// handlers répondent 503 explicite plutôt que de casser la lecture).
	ttsService *tts.Service
}

// NewOuvrageUseCase crée un nouveau OuvrageUseCase. Le quota bibliothèque
// est lu à la construction (BIBLIOTHEQUE_QUOTA_MO, défaut 2048 Mo).
// SECT-BIBLIO-P2 : lectureRepo pour la lecture mesurée (OuvrageLecture).
// SECT-BIBLIO-5 (000137) : aiService pour l'analyse IA du PDF (nil =
// analyse indisponible, le dépôt manuel reste possible — jamais bloquant).
func NewOuvrageUseCase(ouvrageRepo domain.OuvrageRepository, lectureRepo domain.OuvrageLectureRepository, storageClient domain.StorageClient, aiSvc *ai.AIService, ttsSvc *tts.Service) *OuvrageUseCase {
	quota := defautQuotaBibliothequeMo
	if v := os.Getenv("BIBLIOTHEQUE_QUOTA_MO"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			quota = n
		} else {
			slog.Warn("BIBLIOTHEQUE_QUOTA_MO invalide, défaut conservé", "value", v, "défaut", defautQuotaBibliothequeMo)
		}
	}
	return &OuvrageUseCase{ouvrageRepo: ouvrageRepo, lectureRepo: lectureRepo, storage: storageClient, aiService: aiSvc, quotaMo: quota, ttsService: ttsSvc}
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

	// SECT-BIBLIO-12 : couverture du catalogue — la PAGE 1 du PDF
	// rastérisée en JPEG (~600 px de large) au moment du dépôt, quand le
	// fichier est DÉJÀ en mémoire : zéro re-téléchargement R2. Best-effort
	// PARFAITEMENT toléré : un échec ne bloque JAMAIS le dépôt (la carte
	// retombe sur l'icône catégorie) ; l'échec n'est marqué en DB que si
	// pdftoppm est présent et échoue (PDF corrompu) — sinon silence
	// (outil absent = environnement, pas le document).
	couvertureKey, couvertureEchec := uc.genererCouverture(ctx, oid, content)
	input.CheminCouverture = couvertureKey
	input.CouvertureEchecAt = couvertureEchec

	created, err := uc.ouvrageRepo.Create(ctx, input)
	if err != nil {
		if uc.storage != nil {
			_ = uc.storage.Delete(ctx, objectKey) // best-effort (pattern document)
			if couvertureKey != nil && *couvertureKey != "" {
				_ = uc.storage.Delete(ctx, *couvertureKey)
			}
		}
		return nil, err
	}
	return created, nil
}

// ── SECT-BIBLIO-12 : couvertures du catalogue ──

// couvertureLargeurPx — largeur cible du JPEG de couverture. Les cartes
// affichent ~200-300 px (600 px couvre le 2x DPR des écrans denses).
const couvertureLargeurPx = 600

// couvertureBudget — budget de rastérisation pdftoppm (page 1) : au-delà,
// la commande est tuée et la couverture est marquée en échec. Une page 1
// se rend en < 1 s même sur un PDF lourd — 20 s = garde-fou large.
// NB time.Duration : TOUJOURS avec unité (leçon E2E : 20_000 nu = 20 µs →
// pdftoppm tué instantanément, « signal: killed »).
const couvertureBudget = 20 * time.Second

// couvertureObjectKey — clé R2 du JPEG de couverture. Vit sous le MÊME
// préfixe que le PDF (ouvrages/{oid}/…) : la purge d'un ouvrage ramasse
// les deux objets (bibliotheque_purge_worker).
func couvertureObjectKey(ouvrageID string) string {
	return fmt.Sprintf("ouvrages/%s/couverture.jpg", ouvrageID)
}

// rasteriserCouverture — page 1 du PDF → JPEG (~600 px de large) via
// pdftoppm (paquet Alpine poppler-utils du Dockerfile, même pattern que
// qpdf pour les PDFs chiffrés). Retourne (nil, err) si l'outil manque
// (LookPath) — l'appelant distingue « outil absent » (silence, pas de
// marqueur DB) de « outil présent + échec » (marqueur couvertureEchecAt).
// decryptPDF d'abord : les PDFs « sécurité standard Acrobat » à mot de
// passe utilisateur vide (SECT-BIBLIO-7) rendraient une page noire.
func rasteriserCouverture(ctx context.Context, content []byte) ([]byte, error) {
	pdftoppm, err := exec.LookPath("pdftoppm")
	if err != nil {
		return nil, fmt.Errorf("pdftoppm absent: %w", err)
	}
	if dec := decryptPDF(ctx, content); dec != nil {
		content = dec
	}

	in, err := os.CreateTemp("", "sect-couv-*.pdf")
	if err != nil {
		return nil, fmt.Errorf("temp in: %w", err)
	}
	inName := in.Name()
	defer func() { _ = os.Remove(inName) }()
	if _, err := in.Write(content); err != nil {
		_ = in.Close()
		return nil, fmt.Errorf("write in: %w", err)
	}
	if err := in.Close(); err != nil {
		return nil, fmt.Errorf("close in: %w", err)
	}

	outPrefix, err := os.MkdirTemp("", "sect-couv-*")
	if err != nil {
		return nil, fmt.Errorf("temp out: %w", err)
	}
	defer func() { _ = os.RemoveAll(outPrefix) }()
	// -singlefile : pas de suffixe de numéro de page (couverture.jpg).
	jpg := filepath.Join(outPrefix, "couverture.jpg")

	ctxRaster, cancel := context.WithTimeout(ctx, couvertureBudget)
	defer cancel()
	cmd := exec.CommandContext(ctxRaster, pdftoppm,
		"-jpeg", "-jpegopt", "quality=82",
		"-f", "1", "-l", "1",
		"-scale-to", strconv.Itoa(couvertureLargeurPx),
		"-singlefile",
		inName, filepath.Join(outPrefix, "couverture"))
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("pdftoppm: %w (sortie: %.200s)", err, string(out))
	}
	return os.ReadFile(jpg)
}

// genererCouverture — rastérise + stocke la couverture dans R2. Retourne
// les valeurs prêtes pour CreateOuvrageInput : (chemin, nil) si réussi ;
// (nil, &now) si pdftoppm est présent mais échoue (marqueur persisté —
// pas de retry automatique en boucle) ; (nil, nil) si l'outil manque
// (environnement sans poppler — la carte retombe sur l'icône catégorie).
// Jamais d'erreur remontante : la couverture ne doit JAMAIS bloquer un
// dépôt (garde-fou ADR-0007 — l'exploitant redépose du contenu, pas
// des images).
func (uc *OuvrageUseCase) genererCouverture(ctx context.Context, ouvrageID string, pdfContent []byte) (*string, *time.Time) {
	if uc.storage == nil {
		return nil, nil // mode DB-only (dev) : pas de couverture
	}
	jpg, err := rasteriserCouverture(ctx, pdfContent)
	if err != nil {
		if strings.Contains(err.Error(), "pdftoppm absent") {
			return nil, nil
		}
		now := time.Now()
		slog.Warn("SECT-BIBLIO-12: rastérisation couverture échouée (marqueur posé)",
			"ouvrageId", ouvrageID, "error", err.Error())
		return nil, &now
	}
	key := couvertureObjectKey(ouvrageID)
	if _, err := uc.storage.Upload(ctx, domain.StorageObject{
		Key:         key,
		Content:     jpg,
		ContentType: "image/jpeg",
	}); err != nil {
		// Échec R2 ≠ échec PDF : pas de marqueur (le PDF est sain, une
		// régénération explicite réussira probablement).
		slog.Warn("SECT-BIBLIO-12: upload couverture R2 échoué",
			"ouvrageId", ouvrageID, "error", err.Error())
		return nil, nil
	}
	return &key, nil
}

// GetCouvertureURL — SECT-BIBLIO-12 : URL présignée courte durée du JPEG
// de couverture (même TTL et même chaîne de contrôle que le fichier :
// FindByID sous RLS → ouvrage invisible = 404, jamais de fuite
// d'existence). Pas d'AuditLog : la couverture est un DÉRIVÉ VISUEL de
// la page 1, pas une lecture — en journaliser chaque affichage de
// catalogue noierait le journal (la lecture mesurée P2 reste LE journal
// de consultation, déclenchée par le lecteur plein écran).
func (uc *OuvrageUseCase) GetCouvertureURL(ctx context.Context, claims db.SessionClaims, id string, expiresIn int) (string, error) {
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return "", err // NotFoundError (RLS) tel quel
	}
	if o.CheminCouverture == nil || *o.CheminCouverture == "" {
		return "", &domain.NotFoundError{Entity: "OuvrageCouverture", ID: id}
	}
	if uc.storage == nil {
		return "", fmt.Errorf("stockage non configuré")
	}
	url, err := uc.storage.PresignURL(ctx, *o.CheminCouverture, expiresIn)
	if err != nil {
		return "", fmt.Errorf("presign couverture: %w", err)
	}
	return url, nil
}

// RegenererCouverture — SECT-BIBLIO-12 : régénération EXPLICITE par le
// gestionnaire (ADMIN/RESP/ENS dans son périmètre — canManageOuvrage ;
// utile pour les ouvrages déposés AVANT la migration 000140 et les
// échecs transitoires R2). Le PDF est STREAMÉ vers un fichier temp
// (jamais en RAM — jusqu'à 100 Mo), rastérisé, uploadé, puis les
// colonnes couverture sont mises à jour (le marqueur d'échec est
// RESET en cas de succès).
func (uc *OuvrageUseCase) RegenererCouverture(ctx context.Context, claims db.SessionClaims, id string) (*domain.Ouvrage, error) {
	if claims.Role != string(domain.RoleAdmin) &&
		claims.Role != string(domain.RoleResponsable) &&
		claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "régénération réservée à l'ADMIN, au RESPONSABLE et à l'ENSEIGNANT (son dépôt)"}
	}
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !canManageOuvrage(claims, o) {
		return nil, &domain.UnauthorizedError{Message: "régénération refusée : ouvrage hors de votre périmètre"}
	}
	if uc.storage == nil {
		return nil, fmt.Errorf("stockage non configuré (mode DB-only)")
	}
	if o.CheminStockage == nil || *o.CheminStockage == "" {
		return nil, &domain.ValidationError{Field: "file", Message: "ouvrage sans fichier stocké (mode DB-only)"}
	}

	// Stream R2 → disque (jamais en RAM).
	tmpDir, err := os.MkdirTemp("", "sect-regen-*")
	if err != nil {
		return nil, fmt.Errorf("temp dir: %w", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()
	pdfPath := filepath.Join(tmpDir, "source.pdf")
	if err := uc.storage.DownloadToFile(ctx, *o.CheminStockage, pdfPath); err != nil {
		return nil, fmt.Errorf("téléchargement du PDF: %w", err)
	}
	pdfContent, err := os.ReadFile(pdfPath)
	if err != nil {
		return nil, fmt.Errorf("lecture du PDF: %w", err)
	}

	// Rastérisation + upload : ici une erreur est RÉELLE (l'action est
	// explicite) — remontée au client avec contexte.
	jpg, err := rasteriserCouverture(ctx, pdfContent)
	if err != nil {
		if strings.Contains(err.Error(), "pdftoppm absent") {
			return nil, fmt.Errorf("outil de rastérisation indisponible sur ce déploiement (pdftoppm/poppler-utils)")
		}
		now := time.Now()
		if errUpd := uc.ouvrageRepo.UpdateCouverture(ctx, id, nil, &now); errUpd != nil {
			slog.Warn("SECT-BIBLIO-12: marqueur échec non posé", "ouvrageId", id, "error", errUpd.Error())
		}
		return nil, fmt.Errorf("rastérisation impossible (PDF illisible ?): %w", err)
	}
	key := couvertureObjectKey(id)
	if _, err := uc.storage.Upload(ctx, domain.StorageObject{
		Key:         key,
		Content:     jpg,
		ContentType: "image/jpeg",
	}); err != nil {
		return nil, fmt.Errorf("upload couverture R2: %w", err)
	}
	if err := uc.ouvrageRepo.UpdateCouverture(ctx, id, &key, nil); err != nil {
		return nil, err
	}
	return uc.ouvrageRepo.FindByID(ctx, id)
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
// SECT-BIBLIO-13 : disposition SIGNÉE "inline" — l'URL de lecture AFFICHE
// le PDF (lecteur, iframe, nouvel onglet) au lieu de le poser sur disque.
// L'acte « téléchargement » a sa propre route (GetTelechargementURL) qui,
// seul, impose attachment ET vérifie telechargementAutorise.
//
// SECT-BIBLIO-14 : réservé aux ouvrages telechargementAutorise=true.
// Le lecteur in-app n'appelle plus cette route pour un ouvrage verrouillé
// (rendu canvas via /flux, jamais d'URL présignée) — or une URL présignée
// collée dans la barre d'adresse redonne le lecteur PDF NATIF et son
// bouton « Télécharger » : c'était la fuite. 403 sinon : un ouvrage non
// autorisé au téléchargement ne se lit QUE par le lecteur sécurisé.
func (uc *OuvrageUseCase) GetFichierURL(ctx context.Context, claims db.SessionClaims, id string, ip string, expiresIn int) (string, error) {
	if expiresIn <= 0 || expiresIn > 900 {
		expiresIn = 900
	}
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return "", err
	}
	if !o.TelechargementAutorise {
		return "", &domain.UnauthorizedError{
			Message: "lecture par URL présignée réservée aux ouvrages autorisés au téléchargement — cet ouvrage se lit dans l’application (lecteur sécurisé)",
		}
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

	url, err := uc.storage.PresignURLAvecDisposition(ctx, *o.CheminStockage, expiresIn, "inline")
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

// GetTelechargementURL — SECT-BIBLIO-13 : URL présignée de TÉLÉCHARGEMENT
// (attachment), réservée aux ouvrages dont telechargementAutorise = true.
//
// Enforcement SERVEUR du flag (avant : seul le frontend masquait le bouton
// — un appel direct à /fichier donnait le fichier brut à n'importe qui
// voyait l'ouvrage) :
//   - ouvrage invisible (RLS)            → 404 (FindByID, pas de fuite) ;
//   - telechargementAutorise = false     → 403, message actionnable —
//     l'URL de téléchargement n'est JAMAIS émise, R2 ne sert jamais
//     l'octet en disposition attachment ;
//   - autorisé                           → présignature attachment (nom de
//     fichier sanitizé) + AuditLog OUVRAGE_TELECHARGEMENT (trace distincte
//     de la lecture — le fichier quitte le périmètre in-browser).
//
// Limite documentée (pas de DRM) : la lecture in-browser reste possible
// (droit par défaut, ADR-0007) et un utilisateur déterminé peut sauvegarder
// depuis le lecteur — l'API, elle, garantit que l'ACTE téléchargement est
// refusé, journalisé, et que rien n'est émis en disposition attachment
// sans autorisation.
func (uc *OuvrageUseCase) GetTelechargementURL(ctx context.Context, claims db.SessionClaims, id string, ip string, expiresIn int) (string, error) {
	if expiresIn <= 0 || expiresIn > 900 {
		expiresIn = 900
	}
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return "", err
	}
	if !o.TelechargementAutorise {
		return "", &domain.UnauthorizedError{
			Message: "téléchargement non autorisé pour cet ouvrage (lecture en ligne uniquement)",
		}
	}
	if o.CheminStockage == nil || *o.CheminStockage == "" {
		return "", &domain.ValidationError{Field: "fichier", Message: "fichier non stocké pour cet ouvrage (mode DB-only)"}
	}
	if uc.storage == nil {
		return "", &domain.ValidationError{
			Field:   "fichier",
			Message: "stockage non configuré (mode DB-only) — le téléchargement nécessite la configuration R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)",
		}
	}

	url, err := uc.storage.PresignURLAvecDisposition(ctx, *o.CheminStockage, expiresIn, dispositionTelechargement(o.Titre))
	if err != nil {
		return "", fmt.Errorf("presign téléchargement: %w", err)
	}

	// Audit du téléchargement — best-effort (le refus, lui, ne passe
	// jamais ici : 403 AVANT toute émission d'URL, rien à journaliser
	// côté succès manqué).
	auditErr := uc.ouvrageRepo.AuditTelechargement(ctx, domain.OuvrageAuditEntry{
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
		slog.Warn("bibliothèque: audit de téléchargement échoué (téléchargement servi quand-même)", "ouvrageId", o.ID, "error", auditErr)
	}
	return url, nil
}

// GetFluxLecture — SECT-BIBLIO-14 : flux d'octets du PDF, MÊME-ORIGINE,
// pour le lecteur SÉCURISÉ (rendu canvas pdf.js — ouvrages dont
// telechargementAutorise=false : le lecteur iframe/native est précisément
// la fuite que l'exploitant constatait, son bouton « Télécharger »
// natif ignorant le flag).
//
// Sémantique LECTURE — le droit par défaut (ADR-0007) : visibilité RLS
// via FindByID (404 si invisible), audit OUVRAGE_LECTURE (même trace que
// /fichier — c'est UN accès de lecture). Le flag telechargementAutorise
// ne s'applique PAS ici : il régit l'ACTE téléchargement (/telechargement
// → 403 + attachment JAMAIS émis) ; ce flux rend la lecture possible SANS
// exposer d'URL navigable au lecteur PDF natif du navigateur.
func (uc *OuvrageUseCase) GetFluxLecture(ctx context.Context, claims db.SessionClaims, id string, ip string) (*domain.OuvrageFluxLecture, error) {
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if o.CheminStockage == nil || *o.CheminStockage == "" {
		return nil, &domain.ValidationError{Field: "fichier", Message: "fichier non stocké pour cet ouvrage (mode DB-only)"}
	}
	if uc.storage == nil {
		return nil, &domain.ValidationError{
			Field:   "fichier",
			Message: "stockage non configuré (mode DB-only) — la lecture de fichier nécessite la configuration R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)",
		}
	}

	body, size, ct, err := uc.storage.DownloadStream(ctx, *o.CheminStockage)
	if err != nil {
		return nil, err
	}
	if ct == "" {
		ct = "application/pdf"
	}

	// Audit de l'accès (garde-fou ADR-0007) — best-effort, même trace
	// que /fichier : c'est une lecture, pas un téléchargement.
	auditErr := uc.ouvrageRepo.AuditLecture(ctx, domain.OuvrageAuditEntry{
		OuvrageID:       o.ID,
		Titre:           o.Titre,
		Categorie:       o.Categorie,
		ActorUserID:     claims.UserID,
		ActorEmail:      claims.Email,
		ActorIP:         ip,
		EtablissementID: o.EtablissementID,
		ExpiresIn:       0, // flux direct, pas de présignature : pas de TTL
	})
	if auditErr != nil {
		slog.Warn("bibliothèque: audit de lecture (flux) échoué (accès servi quand-même)", "ouvrageId", o.ID, "error", auditErr)
	}

	return &domain.OuvrageFluxLecture{
		Body:          body,
		ContentLength: size,
		ContentType:   ct,
		Filename:      nomFichierSanitize(o.Titre),
	}, nil
}

// dispositionTelechargement — en-tête Content-Disposition RFC 6266 :
// filename ASCII-sanitisé (fallback sûr) + filename* UTF-8 (accents
// français préservés — « École.pdf » reste lisible, pas « cole.pdf »).
// L'extension .pdf est imposée (P1 : PDF uniquement — jamais un .exe
// même si le titre est piégé).
func dispositionTelechargement(titre string) string {
	nomUTF8 := nomFichierSanitize(titre)

	// Fallback ASCII : chaque rune non-ASCII devient '-' (contrôle,
	// sens interdit) ; filename* porte le nom réel.
	nomASCII := strings.Map(func(r rune) rune {
		if r < 0x20 || r > 0x7e {
			return '-'
		}
		return r
	}, nomUTF8)

	return fmt.Sprintf("attachment; filename=\"%s\"; filename*=UTF-8''%s", nomASCII, encodeRFC5987(nomUTF8))
}

// nomFichierSanitize — nom de fichier dérivé du titre (SECT-BIBLIO-14,
// extrait de dispositionTelechargement) : trim, neutralisation de
// l'injection d'en-tête et des séparateurs de chemin, 80 runes max,
// extension .pdf IMPOSÉE. Utilisé par l'attachment (/telechargement) ET
// par l'inline du flux de lecture (/flux — nom d'audit visuel seulement).
func nomFichierSanitize(titre string) string {
	const maxRunes = 80

	base := strings.TrimSpace(titre)
	if base == "" {
		base = "ouvrage"
	}
	// Neutralise l'injection d'en-tête et les séparateurs de chemin.
	base = strings.Map(func(r rune) rune {
		switch r {
		case '"', '\\', '\r', '\n', ';', '/', '<', '>', '?', '*', ':', '|':
			return '-'
		}
		return r
	}, base)
	runes := []rune(base)
	if len(runes) > maxRunes {
		runes = runes[:maxRunes]
	}
	return string(runes) + domain.OuvrageExtension
}

// encodeRFC5987 — percent-encoding des attr-chars RFC 5987 (clé
// filename*) : tout octet hors du jeu sûr devient %XX hexadécimal majuscule.
func encodeRFC5987(s string) string {
	var sb strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') ||
			strings.IndexByte("!#$&+-.^_`|~*'()", c) >= 0 {
			sb.WriteByte(c)
		} else {
			fmt.Fprintf(&sb, "%%%02X", c)
		}
	}
	return sb.String()
}

// ──────────────────────────────────────────────────────────────────────
// SECT-BIBLIO-5 (tâche 2) : analyse IA du PDF, pré-remplissage assisté.
// ──────────────────────────────────────────────────────────────────────

// constantes d'analyse : pages extraites (couverture + page de titre +
// copyright suffisent — SECT-BIBLIO-6 : 8→5 pages et 12k→6k runes :
// les métadonnées vivent sur les 3 premières pages ; un prompt deux fois
// plus court divise le temps de traitement LLM par ~2 — décisif pour
// tenir dans la part fixe de 15 s par provider (failover.go attemptCtx)).
const (
	analyseMaxPages = 5
	analyseMaxRunes = 6_000
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

// decryptPDF — déchiffre un PDF protégé par la « sécurité standard
// Acrobat » avec mot de passe utilisateur VIDE (SECT-BIBLIO-7) via
// qpdf (paquet Alpine du Dockerfile, disponible sur OCI et Render).
// CAS RÉEL mesuré : PDFWriter 4.05 (an 2000) → /Filter /Standard /R 2
// /V 1 (RC4 40-bit, mot de passe propriétaire seul) — ledongthuc/pdf ne
// déchiffre pas (chaque flux RC4 se lit comme « zlib: invalid header »,
// texte vide → « PDF inextractible » alors que poppler/qpdf lisent tout).
// Retourne nil si qpdf est absent (dev local), si le PDF exige un VRAI
// mot de passe utilisateur, ou en tout échec — l'appelant retombe alors
// sur la dégradation douce existante. Aucun mot de passe deviné :
// --password= (vide) = exactement ce que l'utilisateur a pu ouvrir
// lui-même dans son lecteur.
func decryptPDF(ctx context.Context, content []byte) []byte {
	qpdf, err := exec.LookPath("qpdf")
	if err != nil {
		return nil
	}
	in, err := os.CreateTemp("", "sect-ouvrage-*.pdf")
	if err != nil {
		return nil
	}
	inName := in.Name()
	defer func() { _ = os.Remove(inName) }()

	out, err := os.CreateTemp("", "sect-ouvrage-dec-*.pdf")
	if err != nil {
		_ = in.Close()
		return nil
	}
	outName := out.Name()
	// qpdf écrase la sortie existante (vérifié) : on garde le nom, on
	// ferme le descripteur pour laisser qpdf réécrire le fichier.
	if err := out.Close(); err != nil {
		_ = in.Close()
		return nil
	}

	if _, err := in.Write(content); err != nil {
		_ = in.Close()
		return nil
	}
	if err := in.Close(); err != nil {
		return nil
	}
	// CommandContext : le budget analyze (75 s) tue un qpdf qui pend.
	cmd := exec.CommandContext(ctx, qpdf, "--decrypt", "--password=", inName, outName)
	if err := cmd.Run(); err != nil {
		return nil
	}
	dec, err := os.ReadFile(outName)
	if err != nil {
		return nil
	}
	return dec
}

// analyseLLMResponse — miroir du JSON strict attendu du LLM.
// categorie (SECT-BIBLIO-8) : l'un des 4 codes de la taxonomie
// ADR-0007 ou "" si indécidable — normalisé + validé après parse.
// licenceOrigine/filiere/niveau (SECT-BIBLIO-9) : piste copyright /
// discipline texte libre / code NiveauxEtude — validés après parse.
type analyseLLMResponse struct {
	Titre            domain.AnalyseOuvrageField `json:"titre"`
	Auteurs          domain.AnalyseOuvrageField `json:"auteurs"`
	Editeur          domain.AnalyseOuvrageField `json:"editeur"`
	Edition          domain.AnalyseOuvrageField `json:"edition"`
	AnneePublication domain.AnalyseOuvrageField `json:"anneePublication"`
	ISBN             domain.AnalyseOuvrageField `json:"isbn"`
	Categorie        domain.AnalyseOuvrageField `json:"categorie"`
	LicenceOrigine   domain.AnalyseOuvrageField `json:"licenceOrigine"`
	Filiere          domain.AnalyseOuvrageField `json:"filiere"`
	Niveau           domain.AnalyseOuvrageField `json:"niveau"`
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

// parseAnalyseOuvrageJSON — parse tolérant de la réponse LLM (miroir du
// pattern parseLandingDemoQCM, SECT-AI-REPAIR-1) : essai strict sur le
// texte défencé ; si échec, réparation ciblée du défaut mesuré sur
// qwen-flash (champs émis en objets top-level séparés :
// {"titre":{…}},{"auteurs":{…}} → {"titre":{…},"auteurs":{…}}) puis
// second essai strict. La réparation est un no-op sur un JSON strict ;
// le schéma cible n'a pas de tableaux d'objets (aucun « },{ » légitime).
// Une réponse tronquée retourne false — le retry de Analyze décide.
func parseAnalyseOuvrageJSON(raw string) (analyseLLMResponse, bool) {
	var parsed analyseLLMResponse
	s := stripJSONFences(raw)
	if err := json.Unmarshal([]byte(s), &parsed); err == nil {
		return parsed, true
	}
	repaired := strings.ReplaceAll(s, "},{", ",")
	if err := json.Unmarshal([]byte(repaired), &parsed); err == nil {
		return parsed, true
	}
	return parsed, false
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
		// SECT-BIBLIO-7 : PDFs chiffrés « sécurité standard Acrobat » à
		// mot de passe utilisateur VIDE (ex. PDFWriter 4.x avec mot de
		// passe propriétaire seul) — ledongthuc/pdf ne sait pas
		// déchiffrer, qpdf oui : on déchiffre en mémoire de travail
		// (fichiers temporaires) et on réextrait. L'utilisateur a pu
		// ouvrir ce PDF dans son lecteur : l'analyse doit aussi pouvoir
		// le lire. Dégradation douce si qpdf échoue/est absent.
		if dec := decryptPDF(ctx, content); dec != nil {
			texte, pages = extractPDFText(dec, analyseMaxPages, analyseMaxRunes)
		}
	}
	if strings.TrimSpace(texte) == "" {
		raison := "texte du PDF inextractible (document scanné ou protégé) — remplissez le formulaire manuellement"
		if bytes.Contains(content, []byte("/Encrypt")) {
			raison = "PDF chiffré (mot de passe requis) — déposez une version non protégée ou remplissez le formulaire manuellement"
		}
		return indisponible(raison), nil
	}

	systemPrompt := `Tu es un assistant documentaire d'une bibliothèque universitaire numérique ouest-africaine (SECT). On te fournit le texte extrait des premières pages d'un PDF (souvent couverture, page de titre et page de copyright). Extrais les métadonnées bibliographiques.
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format exact :
{"titre":{"valeur":"...","confiance":0,"preuve":"..."},"auteurs":{"valeur":"Nom Prénom; Nom Prénom","confiance":0,"preuve":"..."},"editeur":{"valeur":"...","confiance":0,"preuve":"..."},"edition":{"valeur":"...","confiance":0,"preuve":"..."},"anneePublication":{"valeur":"2024","confiance":0,"preuve":"..."},"isbn":{"valeur":"...","confiance":0,"preuve":"..."},"categorie":{"valeur":"REFERENTIEL_OFFICIEL","confiance":0,"preuve":"..."},"licenceOrigine":{"valeur":"...","confiance":0,"preuve":"..."},"filiere":{"valeur":"...","confiance":0,"preuve":"..."},"niveau":{"valeur":"DOCTORAT","confiance":0,"preuve":"..."},"langue":{"valeur":"Français","confiance":0,"preuve":"..."},"themes":{"valeur":"thème 1; thème 2","confiance":0,"preuve":"..."},"description":{"valeur":"résumé en 2 phrases maximum","confiance":0,"preuve":"..."}}
Règles strictes :
- confiance = entier 0 à 100 (100 = explicitement imprimé sur la page de titre ou le copyright ; 0 = absent).
- preuve = court extrait VERBATIM du document source, 120 caractères maximum ("" si absent).
- Si une information est absente du texte, mets valeur="" et confiance=0. N'INVENTE JAMAIS : un champ vide vaut mieux qu'une invention.
- auteurs et themes : plusieurs valeurs séparées par « ; ».
- anneePublication : uniquement une année plausible (1400-2100) vue dans le document.
- categorie : classe l'ouvrage dans la taxonomie documentaire SECT — utilise EXACTEMENT l'un de ces quatre codes :
  · REFERENTIEL_OFFICIEL : programme, référentiel, maquette ou standard émanant d'une AUTORITÉ (ministère, commission des programmes/d'examen, organisme de normalisation, texte réglementaire).
  · OUVRAGE_REFERENCE : manuel, traité ou dictionnaire CANONIQUE du domaine (référence citée en cours, encyclopédie spécialisée).
  · RECHERCHE_ACADEMIQUE : thèse, mémoire, article ou publication scientifique (revue, actes de colloque, rapport de recherche).
  · PRATIQUE_PROFESSIONNELLE : guide pratique, manuel orienté métier, cas concrets, ouvrage de mise en pratique professionnelle.
  La preuve de categorie = l'extrait qui justifie le classement. En cas de doute sérieux : valeur="" et confiance=0 (l'humain tranchera).
- licenceOrigine : recopie la MENTION DE COPYRIGHT ou de licence imprimée dans le document (ex : « © Éditions X, 2024 — Tous droits réservés », « Licence Creative Commons BY-NC-SA », « Document libre de droits », « Dépôt légal n°… »). C'est une PISTE documentaire pour la déclaration de l'opérateur, PAS une validation juridique — recopie fidèlement, n'interprète pas. Aucune mention imprimée ⇒ valeur="" et confiance=0 (l'opérateur déclarera l'origine réelle des droits lui-même).
- filiere : la DISCIPLINE dominante du document, en texte libre court (ex : « informatique », « sciences de l'éducation », « droit des affaires », « comptabilité »). JAMAIS un identifiant technique — juste la discipline, telle qu'un enseignant la nommerait. Indice type : intitulé de la filière/école sur la couverture, sujet dominant du document. Ambiguïté ou absence d'indice ⇒ valeur="" et confiance=0.
- niveau : le PUBLIC visé par le document, EXACTEMENT l'un de ces codes : L1, L2, L3 (licence), M1, M2 (master), DOCTORAT (thèse de doctorat). Base-toi UNIQUEMENT sur des indices imprimés (« manuel de Licence 3 », « cours de Master 1 », « THÈSE DE DOCTORAT », « École doctorale », « préparation au Doctorat »). Aucun indice fiable ⇒ valeur="" et confiance=0.
- Les noms propres africains sont courants (Diop, Traoré, Koné, Bamba, Kouassi…) : ne les « corrige » pas.`

	userPrompt := fmt.Sprintf("Nom du fichier : %s\n\nTexte extrait (pages 1-%d) :\n%s", nomFichier, pages, texte)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	// SECT-BIBLIO-7 — retry parse (pattern landing-demo SECT-AI-REPAIR-1) :
	// un LLM léger en tête de chaîne peut wrapper/tronquer le JSON (mesuré
	// ~1/3 des essais sur gpt-oss-20b) ou émettre les champs en objets
	// séparés (mesuré sur qwen-flash — réparé par parseAnalyseOuvrageJSON).
	// On retente UNE fois — le budget 75 s le permet ; une erreur IA
	// (réseau/4xx) ne consomme PAS de retry : elle sort immédiatement,
	// comportement inchangé. Le 2e essai passe par le failover qui
	// écarte un provider en échec.
	var (
		result *ai.ChatResult
		parsed analyseLLMResponse
		ok     bool
		llmErr error
	)
	for attempt := 1; attempt <= 2; attempt++ {
		result, llmErr = uc.aiService.ChatCompletion(ctx, messages)
		if llmErr != nil {
			break
		}
		if parsed, ok = parseAnalyseOuvrageJSON(result.Content); ok {
			break
		}
		slog.Info("bibliothèque : réponse IA non JSON, retry",
			"attempt", attempt,
			"model", result.Model,
			"fichier", nomFichier,
		)
	}
	if llmErr != nil {
		slog.Warn("bibliothèque: analyse IA échouée (saisie manuelle)", "fichier", nomFichier, "error", llmErr)
		return indisponible("analyse IA momentanément indisponible (provider en échec) — remplissez le formulaire manuellement ou réessayez"), nil
	}
	if !ok {
		slog.Warn("bibliothèque: réponse IA illisible après retry (saisie manuelle)", "fichier", nomFichier)
		return indisponible("réponse de l'analyse illisible — remplissez le formulaire manuellement ou réessayez"), nil
	}

	// Plausibilité de l'année (garde stupide anti-hallucination).
	if y := parsed.AnneePublication.Valeur; y != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(y)); err != nil || n < 1400 || n > 2100 {
			parsed.AnneePublication = domain.AnalyseOuvrageField{}
		} else {
			parsed.AnneePublication.Valeur = strconv.Itoa(n)
		}
	}
	// Categorie (SECT-BIBLIO-8) : normalisation tolérante (trim,
	// majuscules, espaces/tirets → underscore) puis validation contre
	// l'enum — un code inventé par le LLM devient une absence de
	// suggestion (garde-fou anti-hallucination, cohérent avec l'année).
	// La suggestion reste HUMAN-IN-THE-LOOP : l'Upload re-valide l'enum.
	if c := parsed.Categorie.Valeur; c != "" {
		norm := strings.ToUpper(strings.TrimSpace(c))
		norm = strings.ReplaceAll(norm, " ", "_")
		norm = strings.ReplaceAll(norm, "-", "_")
		if domain.IsValidOuvrageCategorie(domain.CategorieOuvrage(norm)) {
			parsed.Categorie.Valeur = norm
		} else {
			slog.Warn("bibliothèque: catégorie IA hors enum, suggestion ignorée",
				"valeur", c, "fichier", nomFichier)
			parsed.Categorie = domain.AnalyseOuvrageField{}
		}
	}
	// Niveau (SECT-BIBLIO-9) : normalisation (trim, majuscules) puis
	// validation contre NiveauxEtude — même garde que la catégorie.
	// "doctorat"/"Doctorat" ⇒ "DOCTORAT" ; code inventé ⇒ absence.
	if n := parsed.Niveau.Valeur; n != "" {
		norm := strings.ToUpper(strings.TrimSpace(n))
		if domain.IsValidNiveauEtude(norm) {
			parsed.Niveau.Valeur = norm
		} else {
			slog.Warn("bibliothèque: niveau IA hors enum, suggestion ignorée",
				"valeur", n, "fichier", nomFichier)
			parsed.Niveau = domain.AnalyseOuvrageField{}
		}
	}
	// LicenceOrigine (SECT-BIBLIO-9) : texte libre recopié — clamp de
	// longueur cohérent avec l'UI (l'Input accepte la même longueur) ;
	// la DÉCLARATION reste humaine, on ne « valide » jamais juridiquement.
	if l := parsed.LicenceOrigine.Valeur; len(l) > 300 {
		parsed.LicenceOrigine.Valeur = strings.TrimSpace(l[:300]) + "…"
	}
	// Filiere (SECT-BIBLIO-9) : discipline texte libre — trim seul, le
	// rapprochement CUID (accents/casse) est fait côté CLIENT sur les
	// options réelles de l'établissement (l'IA ne voit pas les CUID).
	parsed.Filiere.Valeur = strings.TrimSpace(parsed.Filiere.Valeur)
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
	clampField(&parsed.Categorie)
	clampField(&parsed.LicenceOrigine)
	clampField(&parsed.Filiere)
	clampField(&parsed.Niveau)
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
		Categorie:        parsed.Categorie,
		LicenceOrigine:   parsed.LicenceOrigine,
		Filiere:          parsed.Filiere,
		Niveau:           parsed.Niveau,
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
