// Package usecase — logique métier des établissements.
package usecase

import (
        "context"
        "regexp"

        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// E15 (MEDIUM) : validateurs pour la config watermark.
// hexColorRegex valide les codes hex #RRGGBB (cohérent avec les presets du frontend
// watermark-config-panel.tsx : #1B3A5C Marine, #C5A044 Or, etc.).
var hexColorRegex = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

// validWatermarkPatterns liste les patterns supportés par le frontend
// (PATTERN_OPTIONS dans watermark-config-panel.tsx). Un pattern invalide
// causait un default silencieux côté rendu PDF.
var validWatermarkPatterns = map[string]bool{
        "diamond": true,
        "circle":  true,
        "text":    true,
        "none":    true,
}

// EtablissementUseCase implémente les cas d'usage liés aux établissements.
//
// Dépend de AccessUseCase pour valider l'autorisation ADMIN sur les writes
// (bug E1/E6 : sans cette injection, le helper ValidateAccessForEtablissement
// était dead code et un ADMIN pouvait modifier/supprimer/uploader logo sur
// n'importe quel établissement sans autorisation EtablissementAccess).
type EtablissementUseCase struct {
        etabRepo  domain.EtablissementRepository
        accessUC  *AccessUseCase
}

// NewEtablissementUseCase crée un nouveau EtablissementUseCase.
func NewEtablissementUseCase(etabRepo domain.EtablissementRepository, accessUC *AccessUseCase) *EtablissementUseCase {
        return &EtablissementUseCase{etabRepo: etabRepo, accessUC: accessUC}
}

// List liste les établissements avec tenant scoping.
// - ADMIN : voit tous les établissements (RLS filtrera via EtablissementAccess)
// - RESPONSABLE : voit uniquement son établissement
func (uc *EtablissementUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.EtablissementListParams) ([]*domain.Etablissement, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.etabRepo.List(ctx, params)
}

// GetByID récupère un établissement par ID.
func (uc *EtablissementUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Etablissement, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        // RLS filtre : ADMIN ne voit que s'il a accès, RESPONSABLE voit le sien
        return uc.etabRepo.FindByID(ctx, id)
}

// Create crée un établissement (ADMIN only).
func (uc *EtablissementUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateEtablissementInput) (*domain.Etablissement, error) {
        if claims.Role != string(domain.RoleAdmin) {
                return nil, &domain.UnauthorizedError{Message: "seul un ADMIN peut créer un établissement"}
        }
        if input.Nom == "" {
                return nil, &domain.ValidationError{Field: "nom", Message: "requis"}
        }
        return uc.etabRepo.Create(ctx, input)
}

// Update met à jour un établissement.
// ADMIN : peut tout modifier (y compris pays, actif) — sous réserve d'avoir un
// accès EtablissementAccess valide (statut=APPROUVE + dates) pour cet étab.
// RESPONSABLE : peut modifier son établissement uniquement (pas pays/actif).
func (uc *EtablissementUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateEtablissementInput) (*domain.Etablissement, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // E1/E6 : check d'autorisation ADMIN via EtablissementAccess (RLS ne filtre
        // pas les writes car le repo bypass RLS sur Update). Pour RESPONSABLE, le
        // check ownership ci-dessous suffit.
        if role == domain.RoleAdmin {
                if err := uc.accessUC.ValidateAccessForEtablissement(ctx, claims, id); err != nil {
                        return nil, err
                }
        }

        // RESPONSABLE : restrictions
        if role == domain.RoleResponsable {
                if claims.EtablissementID != id {
                        return nil, &domain.UnauthorizedError{Message: "vous ne pouvez modifier que votre établissement"}
                }
                // RESPONSABLE ne peut pas modifier pays ni actif
                if input.Pays != nil || input.Actif != nil {
                        return nil, &domain.UnauthorizedError{Message: "RESPONSABLE ne peut pas modifier pays ou actif"}
                }
        }

        // E18 (LOW) : valider que Nom n'est pas vide si fourni.
        // Create valide Nom requis, mais Update n'avait aucune validation → un
        // PATCH {"nom": ""} set le nom à string vide (unique index permet un seul).
        if input.Nom != nil && *input.Nom == "" {
                return nil, &domain.ValidationError{Field: "nom", Message: "ne peut pas être vide"}
        }

        // PARAMETRES-FIX-P10 (LOW) : valider regexMatricule si fourni.
        // Avant : une regex invalide (ex: "[unclosed") était stockée en DB et
        // faisait crasher toute validation future (regexp.Compile panic côté
        // frontend ou autre service). Maintenant : ValidationError si invalide.
        if input.RegexMatricule != nil && *input.RegexMatricule != "" {
                if _, err := regexp.Compile(*input.RegexMatricule); err != nil {
                        return nil, &domain.ValidationError{Field: "regexMatricule", Message: "regex invalide: " + err.Error()}
                }
        }

        return uc.etabRepo.Update(ctx, id, input)
}

// UpdateLogo met à jour le logo (ADMIN ou RESPONSABLE propriétaire).
func (uc *EtablissementUseCase) UpdateLogo(ctx context.Context, claims db.SessionClaims, id string, logoData string) (*domain.Etablissement, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        // E1/E6 : check d'autorisation ADMIN via EtablissementAccess.
        if role == domain.RoleAdmin {
                if err := uc.accessUC.ValidateAccessForEtablissement(ctx, claims, id); err != nil {
                        return nil, err
                }
        }
        if role == domain.RoleResponsable && claims.EtablissementID != id {
                return nil, &domain.UnauthorizedError{Message: "vous ne pouvez modifier que votre établissement"}
        }
        if logoData == "" {
                return nil, &domain.ValidationError{Field: "logo", Message: "données logo requises"}
        }
        return uc.etabRepo.UpdateLogo(ctx, id, logoData)
}

// ClearLogo supprime le logo (SET logo = NULL). Mêmes règles d'autorisation
// que UpdateLogo (ADMIN via EtablissementAccess, RESPONSABLE propriétaire).
// PARAMETRES-FIX-P3b : corrige le bug où deleteLogo appelait UpdateLogo(ctx,
// claims, id, "") qui était rejeté par la validation "données logo requises".
func (uc *EtablissementUseCase) ClearLogo(ctx context.Context, claims db.SessionClaims, id string) (*domain.Etablissement, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if role == domain.RoleAdmin {
                if err := uc.accessUC.ValidateAccessForEtablissement(ctx, claims, id); err != nil {
                        return nil, err
                }
        }
        if role == domain.RoleResponsable && claims.EtablissementID != id {
                return nil, &domain.UnauthorizedError{Message: "vous ne pouvez modifier que votre établissement"}
        }
        return uc.etabRepo.ClearLogo(ctx, id)
}

// GetWatermark récupère la config watermark.
func (uc *EtablissementUseCase) GetWatermark(ctx context.Context, claims db.SessionClaims, id string) (*domain.WatermarkConfig, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.etabRepo.GetWatermark(ctx, id)
}

// UpdateWatermark met à jour la config watermark.
func (uc *EtablissementUseCase) UpdateWatermark(ctx context.Context, claims db.SessionClaims, id string, cfg domain.WatermarkConfig) (*domain.WatermarkConfig, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        // E1/E6 : check d'autorisation ADMIN via EtablissementAccess.
        if role == domain.RoleAdmin {
                if err := uc.accessUC.ValidateAccessForEtablissement(ctx, claims, id); err != nil {
                        return nil, err
                }
        }
        if role == domain.RoleResponsable && claims.EtablissementID != id {
                return nil, &domain.UnauthorizedError{Message: "vous ne pouvez modifier que votre établissement"}
        }
        // Validation : opacity entre 0 et 0.5
        if cfg.CertWatermarkOpacity < 0 || cfg.CertWatermarkOpacity > 0.5 {
                return nil, &domain.ValidationError{Field: "opacity", Message: "doit être entre 0 et 0.5"}
        }
        // E15 (MEDIUM) : validation des autres champs watermark.
        // Avant : seule opacity était validée. Color, pattern, text étaient acceptés
        // tels quels → on pouvait stocker color="INVALID", pattern="PATTERN_INEXISTANT",
        // text de 377 chars (testé en production). Le frontend watermark-config-panel.tsx
        // switch sur pattern ('diamond'|'circle'|'text'|'none') — un pattern invalide
        // causait un default silencieux. Une couleur invalide cassait le rendu PDF.

        // Text : max 50 chars (suffit pour "ORIGINAL", "COPIE AUTHENTIQUE", etc.).
        // 50 chars = limite raisonnable pour un watermark lisible sur un certificat.
        if len(cfg.CertWatermarkText) > 50 {
                return nil, &domain.ValidationError{Field: "certWatermarkText", Message: "doit faire au plus 50 caractères"}
        }
        if cfg.CertWatermarkText == "" {
                return nil, &domain.ValidationError{Field: "certWatermarkText", Message: "requis"}
        }

        // Color : regex hex ^#[0-9A-Fa-f]{6}$ (cohérent avec les presets du frontend).
        if !hexColorRegex.MatchString(cfg.CertWatermarkColor) {
                return nil, &domain.ValidationError{Field: "certWatermarkColor", Message: "doit être un code hex valide (#RRGGBB)"}
        }

        // Pattern : enum (diamond|circle|text|none) — cohérent avec PATTERN_OPTIONS du frontend.
        if !validWatermarkPatterns[cfg.CertWatermarkPattern] {
                return nil, &domain.ValidationError{Field: "certWatermarkPattern", Message: "doit être 'diamond', 'circle', 'text' ou 'none'"}
        }

        _, err := uc.etabRepo.UpdateWatermark(ctx, id, cfg)
        if err != nil {
                return nil, err
        }
        return uc.etabRepo.GetWatermark(ctx, id)
}

// Delete supprime un établissement (ADMIN only, sous réserve d'autorisation
// EtablissementAccess valide — bug E1/E6).
func (uc *EtablissementUseCase) Delete(ctx context.Context, claims db.SessionClaims, id string) error {
        if claims.Role != string(domain.RoleAdmin) {
                return &domain.UnauthorizedError{Message: "seul un ADMIN peut supprimer un établissement"}
        }
        if err := uc.accessUC.ValidateAccessForEtablissement(ctx, claims, id); err != nil {
                return err
        }
        return uc.etabRepo.Delete(ctx, id)
}

// E20 (LOW) : requireNonEmptyStr était dead code. Supprimé.
