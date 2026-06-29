// Package usecase — logique métier des établissements.
package usecase

import (
        "context"
        "crypto/rand"
        "fmt"
        "regexp"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "golang.org/x/crypto/bcrypt"
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
//
// ABONNEMENTS-FIX-A3 : pool ajouté pour la transaction atomique du wizard
// de souscription (étab + responsable + abonnement dans une seule tx).
type EtablissementUseCase struct {
        etabRepo domain.EtablissementRepository
        accessUC *AccessUseCase
        pool     *pgxpool.Pool
}

// NewEtablissementUseCase crée un nouveau EtablissementUseCase.
func NewEtablissementUseCase(etabRepo domain.EtablissementRepository, accessUC *AccessUseCase, pool *pgxpool.Pool) *EtablissementUseCase {
        return &EtablissementUseCase{etabRepo: etabRepo, accessUC: accessUC, pool: pool}
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

// CreateResult est le retour enrichi du usecase Create (ABONNEMENTS-FIX-A3).
// Responsable/Invitation/Abonnement ne sont peuplés que si le wizard a fourni
// les champs correspondants (ResponsableEmail + PlanID).
type CreateResult struct {
        Etablissement       *domain.Etablissement
        TemporaryPassword   string // mode "direct" (vide si mode "invitation")
        InvitationToken     string // mode "invitation" (vide si mode "direct")
        InvitationExpiresAt time.Time
        AbonnementID        string
        PlanNom             string
}

// Create crée un établissement (ADMIN only).
//
// ABONNEMENTS-FIX-A3 : si input.ResponsableEmail + input.PlanID sont fournis,
// crée en plus (en une transaction atomique) :
//   - mode "direct" : un utilisateur RESPONSABLE avec password temporaire
//   - mode "invitation" : une Invitation avec token (valide 7 jours)
//   - un Abonnement liant l'établissement au plan
//
// Avant ce fix, le frontend envoyait ces champs mais le backend les ignorait
// (CreateEtablissementInput ne les contenait pas) → seul l'établissement était
// créé, sans responsable ni abonnement. Le wizard de souscription affichait
// alors des credentials vides à l'étape 4.
func (uc *EtablissementUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateEtablissementInput) (*CreateResult, error) {
        if claims.Role != string(domain.RoleAdmin) {
                return nil, &domain.UnauthorizedError{Message: "seul un ADMIN peut créer un établissement"}
        }
        if input.Nom == "" {
                return nil, &domain.ValidationError{Field: "nom", Message: "requis"}
        }

        // Déterminer si on est en mode wizard (souscription complète) ou simple création.
        hasWizard := input.ResponsableEmail != nil && *input.ResponsableEmail != "" &&
                input.PlanID != nil && *input.PlanID != ""

        if !hasWizard {
                // Création simple (comportement historique) : juste l'établissement.
                etab, err := uc.etabRepo.Create(ctx, input)
                if err != nil {
                        return nil, err
                }
                return &CreateResult{Etablissement: etab}, nil
        }

        // ─── Mode wizard : transaction atomique ───
        respEmail := strings.ToLower(strings.TrimSpace(*input.ResponsableEmail))
        if !strings.Contains(respEmail, "@") {
                return nil, &domain.ValidationError{Field: "responsableEmail", Message: "email invalide"}
        }
        respMode := "direct"
        if input.ResponsableMode != nil && *input.ResponsableMode != "" {
                respMode = *input.ResponsableMode
        }
        if respMode != "direct" && respMode != "invitation" {
                return nil, &domain.ValidationError{Field: "responsableMode", Message: "doit être 'direct' ou 'invitation'"}
        }
        if respMode == "direct" && (input.ResponsableNom == nil || *input.ResponsableNom == "") {
                return nil, &domain.ValidationError{Field: "responsableNom", Message: "requis en mode direct"}
        }

        // Valider regexMatricule si fourni (P10 déjà appliqué sur Update, ici aussi).
        if input.RegexMatricule != nil && *input.RegexMatricule != "" {
                if _, err := regexp.Compile(*input.RegexMatricule); err != nil {
                        return nil, &domain.ValidationError{Field: "regexMatricule", Message: "regex invalide: " + err.Error()}
                }
        }

        result := &CreateResult{}
        errTx := db.WithTx(ctx, uc.pool, claims, func(tx pgx.Tx) error {
                // 1. Créer l'établissement (bypass RLS via CreateInTx qui ne pose pas les claims).
                // Le repo CreateInTx fait SET LOCAL row_security = off dans sa propre tx,
                // mais ici on est déjà dans une tx du caller → on doit désactiver RLS manuellement
                // pour l'INSERT Etablissement (ADMIN doit pouvoir créer sans EtablissementAccess préexistant).
                if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                        return fmt.Errorf("disable rls: %w", err)
                }
                etab, err := uc.etabRepo.CreateInTx(ctx, tx, input)
                if err != nil {
                        return err
                }
                result.Etablissement = etab

                // 2. Créer le responsable ou l'invitation.
                if respMode == "direct" {
                        tempPwd, err := generateRandomPasswordLocal(8)
                        if err != nil {
                                return fmt.Errorf("generate password: %w", err)
                        }
                        hash, err := bcrypt.GenerateFromPassword([]byte(tempPwd), 10)
                        if err != nil {
                                return fmt.Errorf("hash password: %w", err)
                        }
                        userID := "user_" + uuid.NewString()
                        respName := *input.ResponsableNom
                        if _, err := tx.Exec(ctx, `
                                INSERT INTO "User" ("id", "email", "name", "password", "role", "etablissementId",
                                        "actif", "mustChangePwd", "loginAttempts", "createdAt", "updatedAt")
                                VALUES ($1, $2, $3, $4, 'RESPONSABLE'::"Role", $5, true, true, 0, now(), now())
                        `, userID, respEmail, respName, string(hash), etab.ID); err != nil {
                                // unique violation (email déjà utilisé)
                                return &domain.ConflictError{Message: "email responsable déjà utilisé"}
                        }
                        // U2 (fix EtablissementAccess) : créer une demande d'accès auto-approuvée
                        // pour l'ADMIN (sinon l'étab est invisible à l'admin dans la liste filtrée).
                        accessID := "eacc_" + uuid.NewString()
                        if _, err := tx.Exec(ctx, `
                                INSERT INTO "EtablissementAccess" ("id", "adminId", "etablissementId", "statut",
                                        "dateDebut", "dateFin", "approuvePar", "createdAt", "updatedAt")
                                VALUES ($1, $2, $3, 'APPROUVE', now(), NULL, $2, now(), now())
                        `, accessID, claims.UserID, etab.ID); err != nil {
                                return fmt.Errorf("create etablissement access: %w", err)
                        }
                        result.TemporaryPassword = tempPwd
                } else {
                        // mode "invitation" : générer un token 32 hex.
                        token, err := generateInvitationToken()
                        if err != nil {
                                return fmt.Errorf("generate invitation token: %w", err)
                        }
                        expiresAt := time.Now().Add(7 * 24 * time.Hour)
                        invID := "inv_" + uuid.NewString()
                        var respName any
                        if input.ResponsableNom != nil && *input.ResponsableNom != "" {
                                respName = *input.ResponsableNom
                        }
                        if _, err := tx.Exec(ctx, `
                                INSERT INTO "Invitation" ("id", "token", "email", "role", "name",
                                        "etablissementId", "expiresAt", "used", "createdById", "createdAt")
                                VALUES ($1, $2, $3, 'RESPONSABLE', $4, $5, $6, false, $7, now())
                        `, invID, token, respEmail, respName, etab.ID, expiresAt, claims.UserID); err != nil {
                                return fmt.Errorf("create invitation: %w", err)
                        }
                        result.InvitationToken = token
                        result.InvitationExpiresAt = expiresAt
                }

                // 3. Créer l'abonnement (statut ESSAI par défaut, 14 jours période essai).
                aboID := "abo_" + uuid.NewString()
                var planNom string
                if err := tx.QueryRow(ctx, `SELECT "nom" FROM "Plan" WHERE "id" = $1`, *input.PlanID).Scan(&planNom); err != nil {
                        return &domain.ValidationError{Field: "planId", Message: "plan introuvable"}
                }
                // Calculer la date de fin selon la période (annuel = +1 an, mensuel = +1 mois).
                dateFin := time.Now().Add(30 * 24 * time.Hour) // mensuel par défaut
                if input.PeriodeFacturation != nil && *input.PeriodeFacturation == "annuel" {
                        dateFin = time.Now().Add(365 * 24 * time.Hour)
                }
                statut := "ESSAI"
                if _, err := tx.Exec(ctx, `
                        INSERT INTO "Abonnement" ("id", "etablissementId", "planId", "statut", "dateDebut",
                                "dateFin", "periodeEssaiJours", "montantPaye", "renouvellementAuto",
                                "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4::"StatutAbonnement", now(), $5, 14, 0, true, now(), now())
                `, aboID, etab.ID, *input.PlanID, statut, dateFin); err != nil {
                        return fmt.Errorf("create abonnement: %w", err)
                }
                result.AbonnementID = aboID
                result.PlanNom = planNom

                return nil
        })

        if errTx != nil {
                // A3-DEBUG temporaire : logger l'erreur exacte pour diagnostiquer le 500.
                // Sera retiré après résolution.
                fmt.Printf("[A3-DEBUG] wizard tx error: %v (type: %T)\n", errTx, errTx)
                return nil, errTx
        }
        return result, nil
}

// generateRandomPasswordLocal génère un password aléatoire alphanumérique (8 chars).
// Duplique usecase/user.go:generateRandomPassword pour éviter une dépendance circulaire
// (user.go n'est pas importable depuis etablissement.go sans refactor).
func generateRandomPasswordLocal(n int) (string, error) {
        const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
        b := make([]byte, n)
        max := make([]byte, 1)
        for i := range b {
                if _, err := rand.Read(max); err != nil {
                        return "", err
                }
                b[i] = charset[int(max[0])%len(charset)]
        }
        return string(b), nil
}

// Note : generateInvitationToken est défini dans invitation.go (même package).
// Pas besoin de le redéfinir ici.

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
