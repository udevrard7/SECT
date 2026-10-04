// Package usecase — logique métier Ouvrage (bibliothèque numérique,
// ADR-0007 P1). Gouvernance : G1 dépôt ADMIN seul ; lecteurs = tous les
// rôles de l'établissement (le scoping réel est fait par les policies
// RLS Ouvrage_*, la défense ici est en profondeur).
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/storage"
)

// defautQuotaBibliothequeMo — quota stockage bibliothèque par établissement
// (ADR-0007 : cible initiale 2 Go, configurable).
const defautQuotaBibliothequeMo int64 = 2048

// OuvrageUseCase implémente les cas d'usage de la bibliothèque.
type OuvrageUseCase struct {
	ouvrageRepo domain.OuvrageRepository
	storage     domain.StorageClient
	quotaMo     int64
}

// NewOuvrageUseCase crée un nouveau OuvrageUseCase. Le quota bibliothèque
// est lu à la construction (BIBLIOTHEQUE_QUOTA_MO, défaut 2048 Mo).
func NewOuvrageUseCase(ouvrageRepo domain.OuvrageRepository, storageClient domain.StorageClient) *OuvrageUseCase {
	quota := defautQuotaBibliothequeMo
	if v := os.Getenv("BIBLIOTHEQUE_QUOTA_MO"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			quota = n
		} else {
			slog.Warn("BIBLIOTHEQUE_QUOTA_MO invalide, défaut conservé", "value", v, "défaut", defautQuotaBibliothequeMo)
		}
	}
	return &OuvrageUseCase{ouvrageRepo: ouvrageRepo, storage: storageClient, quotaMo: quota}
}

// List — catalogue (tous rôles authentifiés ; la RLS scope l'établissement
// et masque corbeille + droits expirés pour les lecteurs).
func (uc *OuvrageUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.OuvrageListParams) (*domain.OuvrageListResult, error) {
	if params.IncludeDeleted {
		// La corbeille ne concerne que l'ADMIN (badge + restore) — les
		// lecteurs ne la voient jamais (policy Ouvrage_select sans
		// deletedAt IS NULL pour is_admin).
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
	return uc.ouvrageRepo.List(ctx, params)
}

// GetByID — fiche d'un ouvrage (RLS : 404 si invisible).
func (uc *OuvrageUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Ouvrage, error) {
	return uc.ouvrageRepo.FindByID(ctx, id)
}

// Upload — dépôt d'un ouvrage (ADMIN seul, G1 ; le router double-vérifie
// via RequireRole("ADMIN") — défense en profondeur).
//
// Flux (pattern document.go) :
//  1. validations métier (titre, catégorie, licence, niveau enum, PDF, taille) ;
//  2. quota stockage de l'établissement (SumTailles + taille du fichier) ;
//  3. upload R2 (clé ouvrages/{oid}/{ts}_{nom} — mode DB-only si R2 absent) ;
//  4. INSERT (FK invalides → ValidationError via le repo, pas de 500) ;
//  5. si l'INSERT échoue : best-effort suppression de l'objet R2.
func (uc *OuvrageUseCase) Upload(ctx context.Context, claims db.SessionClaims, input domain.CreateOuvrageInput, content []byte) (*domain.Ouvrage, error) {
	if claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "dépôt d'ouvrage réservé à l'ADMIN (G1, ADR-0007)"}
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
	if strings.TrimSpace(input.EtablissementID) == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "établissement requis (catalogue par établissement, G2)"}
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

	// Quota stockage bibliothèque de l'établissement.
	sum, err := uc.ouvrageRepo.SumTaillesByEtablissement(ctx, input.EtablissementID)
	if err != nil {
		return nil, fmt.Errorf("quota check: %w", err)
	}
	if sum+int64(fileSize) > uc.quotaMo*1024*1024 {
		return nil, &domain.ValidationError{
			Field:   "file",
			Message: fmt.Sprintf("quota stockage bibliothèque dépassé pour cet établissement (%d Mo utilisés + %d Mo > limite %d Mo) — purgez la corbeille ou augmentez BIBLIOTHEQUE_QUOTA_MO", sum/(1024*1024), fileSize/(1024*1024), uc.quotaMo),
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

// Update — modification d'un ouvrage (ADMIN).
func (uc *OuvrageUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateOuvrageInput) (*domain.Ouvrage, error) {
	if claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "modification d'ouvrage réservée à l'ADMIN (G1)"}
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
	return uc.ouvrageRepo.Update(ctx, id, input)
}

// SoftDelete — corbeille (ADMIN). Le fichier R2 reste (restauration
// possible ; purge des octets = job séparé, ADR-0007 §stockage).
func (uc *OuvrageUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) error {
	if claims.Role != string(domain.RoleAdmin) {
		return &domain.UnauthorizedError{Message: "suppression d'ouvrage réservée à l'ADMIN (G1)"}
	}
	return uc.ouvrageRepo.SoftDelete(ctx, id)
}

// Restore — sort un ouvrage de la corbeille (ADMIN).
func (uc *OuvrageUseCase) Restore(ctx context.Context, claims db.SessionClaims, id string) (*domain.Ouvrage, error) {
	if claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "restauration d'ouvrage réservée à l'ADMIN (G1)"}
	}
	return uc.ouvrageRepo.Restore(ctx, id)
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
