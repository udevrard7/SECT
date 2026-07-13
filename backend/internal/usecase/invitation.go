// Package usecase — logique métier Invitation (E1-INVITATIONS).
package usecase

import (
        "context"
        "crypto/rand"
        "encoding/hex"
        "fmt"
        "strings"
        "time"

        "golang.org/x/crypto/bcrypt"

        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/emailtpl"
        "github.com/udevrard7/sect/backend/internal/mailer"
)

// Durée de validité d'une invitation (7 jours).
const invitationTTL = 7 * 24 * time.Hour

// BcryptCost — identique à usecase.AuthUseCase / usecase.UserUseCase.
const invitationBcryptCost = 10

// InvitationUseCase implémente les cas d'usage des invitations.
type InvitationUseCase struct {
        invitationRepo domain.InvitationRepository
        mailer         mailer.Mailer
        appBaseURL     string
        quotaChecker   domain.QuotaChecker // SECT-QUOTA-GUARDS : nil = pas de vérification
}

// NewInvitationUseCase crée un nouveau InvitationUseCase.
// mailer + appBaseURL sont utilisés pour envoyer l'email d'invitation (template
// HTML "Savane" — SECT) via ResendMailer (ou fallback SMTP/Log).
// quotaChecker est optionnel (nil = pas de vérification de quota).
func NewInvitationUseCase(invitationRepo domain.InvitationRepository, mailSvc mailer.Mailer, appBaseURL string, quotaChecker domain.QuotaChecker) *InvitationUseCase {
        return &InvitationUseCase{
                invitationRepo: invitationRepo,
                mailer:         mailSvc,
                appBaseURL:     appBaseURL,
                quotaChecker:   quotaChecker,
        }
}

// generateToken génère un token aléatoire de 32 chars hex (16 octets).
// Utilisé pour Create et Resend.
func generateInvitationToken() (string, error) {
        b := make([]byte, 16) // 16 octets → 32 chars hex
        if _, err := rand.Read(b); err != nil {
                return "", fmt.Errorf("generate token: %w", err)
        }
        return hex.EncodeToString(b), nil
}

// validateEmail — validation basique d'email (suffisante pour le usecase).
func validateEmail(email string) bool {
        email = strings.TrimSpace(strings.ToLower(email))
        if email == "" || len(email) > 254 {
                return false
        }
        at := strings.IndexByte(email, '@')
        if at < 1 || at == len(email)-1 {
                return false
        }
        if strings.IndexByte(email[at+1:], '.') == -1 {
                return false
        }
        return true
}

// List liste les invitations (RLS gère le scoping : creator OR responsable
// same-etab OR admin). Le usecase ne fait que propager les filres et valider
// le rôle. Le frontend filtre par rôle côté client (etudiants-page.tsx fait
// `invitations.filter(inv => inv.role === 'ETUDIANT')`).
//
// Rôles autorisés : RESPONSABLE, ADMIN, ENSEIGNANT.
func (uc *InvitationUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.InvitationListParams) ([]*domain.Invitation, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.invitationRepo.List(ctx, params)
}

// Create crée une invitation (RESPONSABLE, ADMIN).
// - Génère un token 32 chars hex via crypto/rand.
// - expiresAt = now + 7 jours.
// - CreatedByID = claims.UserID (le body.createdById du client est ignoré
//   pour sécurité — on ne fait jamais confiance au client pour l'identité
//   du créateur).
// - EtablissementID = claims.EtablissementID (RESPONSABLE) ou body.etablissementId (ADMIN).
func (uc *InvitationUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateInvitationInput) (*domain.Invitation, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Validation
        input.Email = strings.TrimSpace(strings.ToLower(input.Email))
        if !validateEmail(input.Email) {
                return nil, &domain.ValidationError{Field: "email", Message: "email invalide"}
        }
        if input.Role == "" {
                return nil, &domain.ValidationError{Field: "role", Message: "requis"}
        }
        // Le rôle ADMIN ne peut pas être invité (sécurité).
        if input.Role == domain.RoleAdmin {
                return nil, &domain.ValidationError{Field: "role", Message: "rôle ADMIN non invitable"}
        }

        // Permission matrix : RESPONSABLE peut inviter ENSEIGNANT/ETUDIANT ;
        // ADMIN peut inviter RESPONSABLE/ENSEIGNANT/ETUDIANT.
        if role == domain.RoleResponsable {
                if input.Role != domain.RoleEnseignant && input.Role != domain.RoleEtudiant {
                        return nil, &domain.UnauthorizedError{Message: "un RESPONSABLE ne peut inviter que des ENSEIGNANT ou ETUDIANT"}
                }
        }

        // CreatedByID = claims.UserID (jamais le body).
        input.CreatedByID = claims.UserID

        // EtablissementID : RESPONSABLE force au sien ; ADMIN peut spécifier.
        if role == domain.RoleResponsable {
                if claims.EtablissementID == "" {
                        return nil, &domain.UnauthorizedError{Message: "responsable sans établissement"}
                }
                ownEtab := claims.EtablissementID
                input.EtablissementID = &ownEtab
        }

        // Générer token + expiresAt.
        token, err := generateInvitationToken()
        if err != nil {
                return nil, err
        }
        input.Token = token
        input.ExpiresAt = time.Now().Add(invitationTTL)

        invitation, err := uc.invitationRepo.Create(ctx, input)
        if err != nil {
                return nil, err
        }

        // Envoyer l'email d'invitation (non bloquant : si l'envoi échoue, l'invitation
        // reste créée en DB — le token est retourné dans la réponse API pour fallback).
        // On récupère les infos étab/filière/créateur via FindByID pour l'email.
        uc.sendInvitationEmail(ctx, invitation)

        return invitation, nil
}

// Resend régénère un nouveau token (32 chars), reset expiresAt = now + 7j,
// used=false, usedAt=NULL. Permet de relancer une invitation expirée ou
// perdue sans recréer de ligne. (RESPONSABLE, ADMIN)
func (uc *InvitationUseCase) Resend(ctx context.Context, claims db.SessionClaims, id string) (*domain.Invitation, string, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, "", &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Vérifier que l'invitation existe (RLS filtre).
        existing, err := uc.invitationRepo.FindByID(ctx, id)
        if err != nil {
                return nil, "", err
        }
        _ = existing // existence check suffisant ; RLS gère le scoping

        // Générer nouveau token + expiresAt.
        newToken, err := generateInvitationToken()
        if err != nil {
                return nil, "", err
        }
        newExpires := time.Now().Add(invitationTTL)
        usedFalse := false

        updated, err := uc.invitationRepo.Update(ctx, id, domain.UpdateInvitationInput{
                Token:     &newToken,
                ExpiresAt: &newExpires,
                Used:      &usedFalse,
                UsedAt:    nil, // reset usedAt à NULL
        })
        if err != nil {
                return nil, "", err
        }

        // Renvoyer l'email d'invitation avec le nouveau token (non bloquant).
        uc.sendInvitationEmail(ctx, updated)

        return updated, newToken, nil
}

// sendInvitationEmail envoie l'email d'invitation via le mailer (ResendMailer
// en production). Non bloquant : si l'envoi échoue, l'invitation reste créée en
// DB et le token est retourné dans la réponse API pour fallback manuel.
//
// Récupère les infos contextuelles (établissement, filière, créateur) via
// FindByID pour personnaliser l'email.
func (uc *InvitationUseCase) sendInvitationEmail(ctx context.Context, invitation *domain.Invitation) {
        if uc.mailer == nil {
                return
        }

        // Récupérer les relations (étab + filière + créateur) pour l'email.
        full, err := uc.invitationRepo.FindByID(ctx, invitation.ID)
        if err == nil && full != nil {
                invitation = full // utiliser la version enrichie
        }

        // Préparer les données du template.
        var etabNom, filiereNom, inviterName string
        if invitation.Etablissement != nil {
                etabNom = invitation.Etablissement.Nom
        }
        if invitation.Filiere != nil {
                filiereNom = invitation.Filiere.Nom
        }
        // Note : FindByID ne peuple pas VerifyCreatedBy, mais on a le CreatedByID.
        // Pour l'email, on ne met l'inviterName que si on l'a (sinon on l'omet).

        acceptLink := uc.appBaseURL + "/invitation?token=" + invitation.Token
        tplData := emailtpl.InvitationData{
                EmailData:      emailtpl.DefaultData("", uc.appBaseURL),
                AcceptLink:     acceptLink,
                TTLDays:        int(invitationTTL.Hours() / 24),
                Role:           string(invitation.Role),
                RoleLabel:      emailtpl.RoleLabelFR(string(invitation.Role)),
                EtablissementNom: etabNom,
                FiliereNom:     filiereNom,
                InviterName:    inviterName,
        }

        _ = uc.mailer.Send(mailer.Email{
                To:      invitation.Email,
                Subject: "SECT — Invitation à rejoindre la plateforme",
                Body:    emailtpl.InvitationText(tplData),
                HTML:    emailtpl.InvitationHTML(tplData),
        })
}

// Cancel supprime une invitation (hard delete). (RESPONSABLE, ADMIN)
// Retourne NotFoundError si l'invitation n'existe pas ou n'est pas visible
// par le créateur (RLS).
func (uc *InvitationUseCase) Cancel(ctx context.Context, claims db.SessionClaims, id string) error {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.invitationRepo.Delete(ctx, id)
}

// Verify vérifie un token d'invitation (PUBLIC — pas d'auth).
//
// Étapes :
//  1. Cherche l'invitation par token (bypass RLS — le token est l'auth).
//  2. Si introuvable → InvitationStateError{Code: "NOT_FOUND"}.
//  3. Si used=true → InvitationStateError{Code: "ALREADY_USED"}.
//  4. Si expiresAt < now → InvitationStateError{Code: "EXPIRED"}.
//  5. Si un User avec cet email existe déjà → InvitationStateError{Code: "USER_EXISTS"}.
//  6. Sinon → retourne l'invitation (avec relations verify peuplées).
func (uc *InvitationUseCase) Verify(ctx context.Context, token string) (*domain.Invitation, error) {
        invitation, err := uc.invitationRepo.FindByToken(ctx, token)
        if err != nil {
                if nf, ok := err.(*domain.NotFoundError); ok && nf.Entity == "Invitation" {
                        return nil, &domain.InvitationStateError{Code: "NOT_FOUND", Message: "Invitation introuvable"}
                }
                return nil, err
        }
        if invitation.Used {
                return nil, &domain.InvitationStateError{Code: "ALREADY_USED", Message: "Invitation déjà utilisée"}
        }
        if time.Now().After(invitation.ExpiresAt) {
                return nil, &domain.InvitationStateError{Code: "EXPIRED", Message: "Invitation expirée"}
        }
        exists, err := uc.invitationRepo.UserExistsByEmail(ctx, invitation.Email)
        if err != nil {
                return nil, err
        }
        if exists {
                return nil, &domain.InvitationStateError{Code: "USER_EXISTS", Message: "Compte déjà existant"}
        }
        return invitation, nil
}

// Accept crée le User à partir d'une invitation valide (PUBLIC — pas d'auth).
//
// Étapes :
//  1. Cherche l'invitation par token (bypass RLS).
//  2. Vérifie état (NOT_FOUND / ALREADY_USED / EXPIRED).
//  3. Valide password (min 8 chars).
//  4. Hash password (bcrypt cost 10).
//  5. Crée User + marque invitation used=true en une seule transaction.
//     Si role=ETUDIANT, génère un matricule séquentiel au format FIL/LJ/YY/NNN.
//
// Note : on ne vérifie pas USER_EXISTS côté usecase (le repo AcceptInvitation
// le détectera via unique constraint sur email → ConflictError). C'est plus
// sûr car atomique : pas de fenêtre de race entre Verify et Accept.
func (uc *InvitationUseCase) Accept(ctx context.Context, input domain.AcceptInvitationInput) (*domain.User, error) {
        if input.Token == "" {
                return nil, &domain.InvitationStateError{Code: "NOT_FOUND", Message: "Invitation introuvable"}
        }
        if strings.TrimSpace(input.Name) == "" {
                return nil, &domain.ValidationError{Field: "name", Message: "requis"}
        }
        if len(input.Password) < 8 {
                return nil, &domain.ValidationError{Field: "password", Message: "minimum 8 caractères"}
        }

        // Vérifier l'invitation (même logique que Verify mais sans USER_EXISTS
        // — le repo AcceptInvitation gère la conflict sur email).
        invitation, err := uc.invitationRepo.FindByToken(ctx, input.Token)
        if err != nil {
                if nf, ok := err.(*domain.NotFoundError); ok && nf.Entity == "Invitation" {
                        return nil, &domain.InvitationStateError{Code: "NOT_FOUND", Message: "Invitation introuvable"}
                }
                return nil, err
        }
        if invitation.Used {
                return nil, &domain.InvitationStateError{Code: "ALREADY_USED", Message: "Invitation déjà utilisée"}
        }
        if time.Now().After(invitation.ExpiresAt) {
                return nil, &domain.InvitationStateError{Code: "EXPIRED", Message: "Invitation expirée"}
        }

        // SECT-QUOTA-GUARDS : vérifier le quota avant acceptation.
        // L'invitation contient l'etablissementId + le rôle invité.
        if uc.quotaChecker != nil && invitation.EtablissementID != nil && *invitation.EtablissementID != "" {
                etabID := *invitation.EtablissementID
                if invitation.Role == domain.RoleEtudiant {
                        if err := uc.quotaChecker.CheckStudentsQuota(ctx, etabID); err != nil {
                                return nil, err
                        }
                }
                if invitation.Role == domain.RoleEnseignant {
                        if err := uc.quotaChecker.CheckEnseignantsQuota(ctx, etabID); err != nil {
                                return nil, err
                        }
                }
        }

        // Hasher le password (bcrypt cost 10).
        hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), invitationBcryptCost)
        if err != nil {
                return nil, fmt.Errorf("hash password: %w", err)
        }
        input.Password = string(hash)

        // Créer le User + marquer l'invitation used en une seule transaction.
        user, err := uc.invitationRepo.AcceptInvitation(ctx, invitation, input)
        if err != nil {
                return nil, err
        }

        // SECT-WELCOME-EMAIL : envoyer l'email de bienvenue (synchrone).
        // SYNCHRONE : sur Render free tier, un goroutine peut être tué avant la fin.
        // L'appel Resend prend < 1s, c'est acceptable pour l'utilisateur.
        if uc.mailer != nil {
                uc.sendWelcomeEmail(invitation, user)
        }

        return user, nil
}

// sendWelcomeEmail envoie l'email de bienvenue après acceptation d'invitation.
// SYNCHRONE : utilise un context avec timeout de 30s.
func (uc *InvitationUseCase) sendWelcomeEmail(invitation *domain.Invitation, user *domain.User) {
        // Context avec timeout de 30s (évite les fuites si DB ou Resend est lent).
        ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer cancel()

        // Récupérer les infos enrichies (étab + filière + créateur) pour l'email.
        full, err := uc.invitationRepo.FindByID(ctx, invitation.ID)
        if err == nil && full != nil {
                invitation = full
        }

        var etabNom, filiereNom, inviterName string
        if invitation.Etablissement != nil {
                etabNom = invitation.Etablissement.Nom
        } else if invitation.VerifyEtablissement != nil {
                etabNom = invitation.VerifyEtablissement.Nom
        }
        if invitation.Filiere != nil {
                filiereNom = invitation.Filiere.Nom
        } else if invitation.VerifyFiliere != nil {
                filiereNom = invitation.VerifyFiliere.Nom
        }
        if invitation.VerifyCreatedBy != nil {
                inviterName = invitation.VerifyCreatedBy.Name
        }

        // Avantages selon le rôle
        roleLabel := emailtpl.RoleLabelFR(string(invitation.Role))
        var avantages []string
        switch invitation.Role {
        case domain.RoleEtudiant:
                avantages = []string{
                        "Accès à vos épreuves et examens en ligne",
                        "Passation d'examens avec surveillance anti-fraude",
                        "Consultation de vos notes et relevés en temps réel",
                        "Réception de vos certificats et badges numériques",
                        "Espace de révision (exam-prep) avec IA",
                        "Messagerie avec vos enseignants",
                }
        case domain.RoleEnseignant:
                avantages = []string{
                        "Création d'épreuves (QCU, QCM, QRC, code)",
                        "Génération d'examens par IA",
                        "Correction automatique par IA",
                        "Surveillance anti-fraude (proctoring)",
                        "Tableau de bord analytics pédagogiques",
                        "Messagerie avec vos étudiants",
                }
        case domain.RoleResponsable:
                avantages = []string{
                        "Gestion de votre établissement",
                        "Création de filières et unités d'enseignement",
                        "Invitation d'enseignants et d'étudiants",
                        "Tableau de bord et statistiques globales",
                        "Gestion des abonnements et facturation",
                        "Accès aux logs d'audit et sécurité",
                }
        }

        tplData := emailtpl.WelcomeInvitationData{
                EmailData:        emailtpl.DefaultData(user.Name, uc.appBaseURL),
                Role:             string(invitation.Role),
                RoleLabel:        roleLabel,
                EtablissementNom: etabNom,
                FiliereNom:       filiereNom,
                InviterName:      inviterName,
                LoginURL:         uc.appBaseURL + "/login",
                Avantages:        avantages,
        }

        _ = uc.mailer.Send(mailer.Email{
                To:      user.Email,
                Subject: "Bienvenue sur SECT — Votre compte est prêt",
                Body:    emailtpl.WelcomeInvitationText(tplData),
                HTML:    emailtpl.WelcomeInvitationHTML(tplData),
        })
}
