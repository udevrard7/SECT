// Package usecase — logique métier TeacherSignupLink (SECT-TEACHER-REG-LINK-1).
//
// Réplication du pattern StudentSignupLink pour la page /enseignants. Trois
// cas d'usage :
//   - Create(ctx, claims, input) — RESPONSABLE / ADMIN uniquement
//   - Verify(ctx, token)         — PUBLIC (endpoint /verify, pré-remplir le form)
//   - Accept(ctx, token, email, name, password) — PUBLIC (endpoint /complete)
//
// Différences vs StudentSignupLinkUseCase :
//   - Création réservée RESPONSABLE/ADMIN (pas d'ENSEIGNANT — cohérent avec
//     POST /api/invitations) ;
//   - Pas de filiereId/niveau (affectations gérées après embauche) ;
//   - Pas de requireMatricule ;
//   - Pas de hook Inscription EN_COURS (réservé aux étudiants) ;
//   - Quota capitation via CheckEnseignantsQuota (vs CheckStudentsQuota) ;
//   - Email de bienvenue via le template WelcomeInvitation (rôle ENSEIGNANT,
//     mêmes avantages que l'acceptation d'invitation) + CustomMessage ajouté
//     au template (SECT-TEACHER-REG-LINK-1 : champ optionnel WelcomeInvitationData).
//
// Les constantes (TTL 30j, bornes 1h..8760h, bcrypt cost 10, regex email/domaine,
// max 500 chars) sont partagées avec student_signup_link.go (même package) —
// une seule source de vérité pour la politique des liens d'inscription.
package usecase

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/emailtpl"
	"github.com/udevrard7/sect/backend/internal/mailer"
	"github.com/udevrard7/sect/backend/internal/repository"
)

// enseignantAvantages — avantages affichés dans l'email de bienvenue enseignant
// (identiques à ceux du flux Invitation — invitation.go sendWelcomeEmail).
var enseignantAvantages = []string{
	"Création d'épreuves (QCU, QCM, QRC, code)",
	"Génération d'examens par IA",
	"Correction automatique par IA",
	"Surveillance anti-fraude (proctoring)",
	"Tableau de bord analytics pédagogiques",
	"Messagerie avec vos étudiants",
}

// TeacherSignupLinkUseCase implémente les cas d'usage des liens d'inscription
// direct enseignant.
type TeacherSignupLinkUseCase struct {
	repo       domain.TeacherSignupLinkRepository
	pool       *pgxpool.Pool
	mailer     mailer.Mailer
	appBaseURL string
	quotaRepo  domain.QuotaChecker // nil = pas de check (tests)
	appLogger  func(msg string, args ...any)

	// AuthRepository injecté pour journaliser la révocation d'un lien dans
	// AuditLog (avec etablissementId + reason). Peut être nil (tests) — Revoke
	// skippe alors l'audit log (non bloquant).
	authRepo *repository.AuthRepository
}

// NewTeacherSignupLinkUseCase crée un nouveau TeacherSignupLinkUseCase.
//
// quotaRepo est optionnel (nil = pas de vérification de quota — tests).
// mailer est optionnel (nil = pas d'email de bienvenue — utile en tests).
// appBaseURL sert à construire l'URL publique /inscription-enseignant?token=xxx.
func NewTeacherSignupLinkUseCase(
	repo domain.TeacherSignupLinkRepository,
	pool *pgxpool.Pool,
	mailSvc mailer.Mailer,
	appBaseURL string,
	quotaRepo domain.QuotaChecker,
	authRepo *repository.AuthRepository,
) *TeacherSignupLinkUseCase {
	return &TeacherSignupLinkUseCase{
		repo:       repo,
		pool:       pool,
		mailer:     mailSvc,
		appBaseURL: strings.TrimRight(appBaseURL, "/"),
		quotaRepo:  quotaRepo,
		authRepo:   authRepo,
	}
}

// PublicURL construit l'URL publique d'inscription enseignant à partir du token.
// Format : {appBaseURL}/inscription-enseignant?token={token}
func (uc *TeacherSignupLinkUseCase) PublicURL(token string) string {
	return uc.appBaseURL + "/inscription-enseignant?token=" + token
}

// SetLogger injecte un logger optionnel pour tracer les erreurs (email, audit)
// sans propager. Permet au main.go de brancher slog sans coupler le usecase
// à *slog.Logger.
func (uc *TeacherSignupLinkUseCase) SetLogger(fn func(msg string, args ...any)) {
	uc.appLogger = fn
}

// Create crée un nouveau lien d'inscription direct enseignant.
//
// Étapes :
//  1. Valide claims.Role ∈ {RESPONSABLE, ADMIN} (defense in depth — le
//     middleware RequireRole filtre déjà ; un ENSEIGNANT ne peut pas inviter
//     d'autres enseignants, cohérent avec POST /api/invitations).
//  2. Force input.EtablissementID = claims.EtablissementID,
//     input.CreatedByID = claims.UserID (le body du client est ignoré pour
//     sécurité — on ne fait jamais confiance au client pour l'identité du
//     créateur ni le rattachement étab).
//  3. Valide/normalise emailDomainRestriction (lower, trim, strip '@').
//  4. Valide customWelcomeMessage (trim, max 500 chars).
//  5. Génère token 32 chars hex + ExpiresAt = now + TTL (30j par défaut,
//     personnalisable via ExpiresInHours ∈ [1h, 8760h]).
//  6. Appelle repo.Create.
//  7. Retourne le lien + l'URL publique pré-construite pour le frontend.
//
// Note : pas d'envoi d'email à la création (le créateur partage le lien
// manuellement — WhatsApp, QR code, etc. — même UX que les liens étudiant).
func (uc *TeacherSignupLinkUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateTeacherSignupLinkInput) (*domain.TeacherSignupLink, string, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, "", &domain.UnauthorizedError{Message: "rôle non autorisé — seuls RESPONSABLE et ADMIN peuvent créer des liens enseignant"}
	}

	// Forçage sécurisé : on n'utilise JAMAIS les valeurs du body client pour
	// ces deux champs.
	if claims.EtablissementID == "" {
		return nil, "", &domain.UnauthorizedError{Message: "établissement requis dans la session"}
	}
	input.EtablissementID = claims.EtablissementID
	input.CreatedByID = claims.UserID

	// Validation/normalisation du domaine email (B2B). Identique au flux
	// étudiant : lower + trim + strip '@' initial. Vide → nil.
	if input.EmailDomainRestriction != nil {
		d := strings.TrimSpace(*input.EmailDomainRestriction)
		d = strings.TrimPrefix(d, "@")
		d = strings.ToLower(d)
		if d == "" {
			input.EmailDomainRestriction = nil
		} else if !signupDomainRegex.MatchString(d) {
			return nil, "", &domain.ValidationError{
				Field:   "emailDomainRestriction",
				Message: "format de domaine invalide (ex: univ-ci.edu)",
			}
		} else {
			input.EmailDomainRestriction = &d
		}
	}

	// Validation du customWelcomeMessage : trim + max 500 chars.
	if input.CustomWelcomeMessage != nil {
		msg := strings.TrimSpace(*input.CustomWelcomeMessage)
		if msg == "" {
			input.CustomWelcomeMessage = nil
		} else if len(msg) > signupCustomMsgMaxLen {
			return nil, "", &domain.ValidationError{
				Field:   "customWelcomeMessage",
				Message: fmt.Sprintf("le message personnalisé ne peut pas dépasser %d caractères", signupCustomMsgMaxLen),
			}
		} else {
			input.CustomWelcomeMessage = &msg
		}
	}

	// Génération token + expiration.
	token, err := generateSignupToken()
	if err != nil {
		return nil, "", err
	}

	// Durée de validité personnalisée (même politique que les liens étudiant).
	ttl := signupLinkTTL
	if input.ExpiresInHours != nil {
		h := *input.ExpiresInHours
		if h < signupLinkMinTTLHours || h > signupLinkMaxTTLHours {
			return nil, "", &domain.ValidationError{
				Field:   "expiresInHours",
				Message: fmt.Sprintf("la durée de validité doit être comprise entre %d h et %d h", signupLinkMinTTLHours, signupLinkMaxTTLHours),
			}
		}
		ttl = time.Duration(h) * time.Hour
	}
	input.ExpiresAt = time.Now().Add(ttl)

	link, err := uc.repo.Create(ctx, input, token)
	if err != nil {
		return nil, "", err
	}
	return link, uc.PublicURL(token), nil
}

// ListByCreator liste les liens non supprimés d'un créateur.
// Le créateur est déterminé par claims.UserID (RLS applique le filtrage).
func (uc *TeacherSignupLinkUseCase) ListByCreator(ctx context.Context, claims db.SessionClaims) ([]domain.TeacherSignupLink, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if claims.UserID == "" {
		return nil, &domain.UnauthorizedError{Message: "session invalide"}
	}
	return uc.repo.ListByCreator(ctx, claims.UserID)
}

// Revoke révoque un lien (soft-delete : actif=false + deletedAt=now).
// Le créateur (ou un admin / responsable de l'étab) peut révoquer.
//
// Après le soft-delete (réussi), on journalise l'action dans AuditLog avec :
//   - Action = AuditActionTeacherSignupLinkRevoked ("TEACHER_SIGNUP_LINK_REVOKED")
//   - Entite = "TeacherSignupLink" + EntiteID = id du lien
//   - Reason = reason (saisie optionnelle du dialog frontend)
//   - Details = JSON {linkId, revokedBy, revokedAt}
//
// L'audit log est NON BLOQUANT : si authRepo est nil (tests) ou si l'INSERT
// échoue, on log l'erreur via appLogger sans propager. La révocation reste
// valide (le soft-delete est déjà fait).
func (uc *TeacherSignupLinkUseCase) Revoke(ctx context.Context, claims db.SessionClaims, id, reason, ip string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return &domain.ValidationError{Field: "id", Message: "requis"}
	}
	if err := uc.repo.Revoke(ctx, id); err != nil {
		return err
	}

	// Journaliser la révocation dans AuditLog. Non bloquant.
	if uc.authRepo == nil {
		return nil
	}

	etabID := claims.EtablissementID
	userID := claims.UserID

	detailsJSON := MarshalDetails(map[string]any{
		"linkId":    id,
		"revokedBy": userID,
		"revokedAt": time.Now().UTC().Format(time.RFC3339),
	})

	var (
		userIDPtr  *string
		userEmailP *string
		etabIDPtr  *string
		idPtr      = id
	)
	if userID != "" {
		userIDPtr = &userID
	}
	if etabID != "" {
		etabIDPtr = &etabID
	}
	if claims.Email != "" {
		userEmailP = &claims.Email
	}

	auditEntry := &domain.AuditLogEntry{
		UserID:          userIDPtr,
		UserEmail:       userEmailP,
		Action:          domain.AuditActionTeacherSignupLinkRevoked,
		Entite:          "TeacherSignupLink",
		EntiteID:        &idPtr,
		Details:         detailsJSON,
		AdresseIP:       ip,
		EtablissementID: etabIDPtr,
		Reason:          reason,
	}
	if err := uc.authRepo.CreateAuditLog(ctx, auditEntry); err != nil {
		if uc.appLogger != nil {
			uc.appLogger("audit log failed for teacher signup link revoke",
				"link_id", id, "revoked_by", userID, "error", err)
		}
	}
	return nil
}

// Verify vérifie un token d'inscription enseignant (PUBLIC — pas d'auth).
//
// Étapes :
//  1. repo.FindByToken (SECURITY DEFINER, bypass RLS).
//  2. Si introuvable → SignupLinkStateError{Code: "NOT_FOUND"}.
//  3. Si !Actif → SignupLinkStateError{Code: "INACTIVE"}.
//  4. Si ExpiresAt < now → SignupLinkStateError{Code: "EXPIRED"}.
//  5. Si MaxUses != nil && UseCount >= MaxUses → SignupLinkStateError{Code: "QUOTA_EXCEEDED"}.
//  6. Sinon retourne le lien (pour pré-remplir le formulaire public).
func (uc *TeacherSignupLinkUseCase) Verify(ctx context.Context, token string) (*domain.TeacherSignupLink, error) {
	link, err := uc.repo.FindByToken(ctx, token)
	if err != nil {
		if nf, ok := err.(*domain.NotFoundError); ok && nf.Entity == "TeacherSignupLink" {
			return nil, &domain.SignupLinkStateError{Code: "NOT_FOUND", Message: "Lien d'inscription introuvable"}
		}
		return nil, err
	}
	if !link.Actif {
		return nil, &domain.SignupLinkStateError{Code: "INACTIVE", Message: "Ce lien d'inscription a été révoqué"}
	}
	if time.Now().After(link.ExpiresAt) {
		return nil, &domain.SignupLinkStateError{Code: "EXPIRED", Message: "Ce lien d'inscription a expiré"}
	}
	if link.MaxUses != nil && link.UseCount >= *link.MaxUses {
		return nil, &domain.SignupLinkStateError{Code: "QUOTA_EXCEEDED", Message: "Le nombre maximum d'inscriptions pour ce lien a été atteint"}
	}
	return link, nil
}

// Accept finalise l'inscription d'un enseignant via un lien direct (PUBLIC).
//
// Étapes :
//  1. Valide name non vide, password ≥ 8 chars, email format valide.
//  2. Charge le lien via FindByToken pour : vérifier le quota capitation B2B
//     via quotaRepo.CheckEnseignantsQuota, vérifier la restriction de domaine
//     email (defense in depth — le SQL le vérifie aussi atomiquement), logger
//     l'audit TeacherRegistrationEvent.
//  3. Hash password : bcrypt (cost 10).
//  4. Appelle repo.AcceptSignup (fonction SQL accept_teacher_signup SECURITY DEFINER).
//  5. Mappe le code retour : OK → email de bienvenue + audit succès ; sinon
//     SignupLinkStateError correspondant + audit échec.
func (uc *TeacherSignupLinkUseCase) Accept(ctx context.Context, token, email, name, password, ip, userAgent string) (*domain.AcceptTeacherSignupResult, error) {
	// Validation input.
	if strings.TrimSpace(token) == "" {
		return nil, &domain.SignupLinkStateError{Code: "NOT_FOUND", Message: "Lien d'inscription introuvable"}
	}
	if strings.TrimSpace(name) == "" {
		return nil, &domain.ValidationError{Field: "name", Message: "requis"}
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if !signupEmailRegex.MatchString(email) {
		return nil, &domain.ValidationError{Field: "email", Message: "email invalide"}
	}
	if len(password) < 8 {
		return nil, &domain.ValidationError{Field: "password", Message: "minimum 8 caractères"}
	}

	// Charger le lien pour : (1) check quota capitation B2B, (2) check
	// restriction domaine (defense in depth), (3) audit TeacherRegistrationEvent.
	// Si le token n'existe pas, on laisse AcceptSignup retourner NOT_FOUND
	// atomiquement. Pas d'audit possible (pas de linkID).
	var link *domain.TeacherSignupLink
	if l, ferr := uc.repo.FindByToken(ctx, token); ferr == nil && l != nil {
		link = l
	}

	// Check quota capitation enseignants (B2B). Non bloquant si erreur DB (on
	// log et on continue) — seul QuotaExceededError bloque.
	if link != nil && uc.quotaRepo != nil {
		if qerr := uc.quotaRepo.CheckEnseignantsQuota(ctx, link.EtablissementID); qerr != nil {
			if domain.IsQuotaExceeded(qerr) {
				uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "QUOTA_EXCEEDED")
				return nil, &domain.SignupLinkStateError{
					Code:    "QUOTA_EXCEEDED",
					Message: "Le quota d'enseignants de cet établissement est atteint. Contactez votre responsable ou le support SECT.",
				}
			}
			if uc.appLogger != nil {
				uc.appLogger("quota check failed (non-blocking)", "etablissement_id", link.EtablissementID, "error", qerr)
			}
		}
	}

	// Check restriction domaine (defense in depth). Le SQL le vérifie aussi
	// atomiquement, mais on le fait ici pour : logguer l'audit précisément
	// (DOMAIN_NOT_ALLOWED côté usecase) et retourner 4xx avant l'appel SQL.
	if link != nil && link.EmailDomainRestriction != nil && *link.EmailDomainRestriction != "" {
		if !strings.HasSuffix(email, "@"+strings.ToLower(*link.EmailDomainRestriction)) {
			uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "DOMAIN_NOT_ALLOWED")
			return nil, &domain.SignupLinkStateError{
				Code:    "DOMAIN_NOT_ALLOWED",
				Message: fmt.Sprintf("Cet email n'appartient pas au domaine autorisé : @%s", *link.EmailDomainRestriction),
			}
		}
	}

	// Hasher le password (bcrypt cost 10).
	hash, err := bcrypt.GenerateFromPassword([]byte(password), signupBcryptCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Appeler la fonction SQL atomique (crée User + incrémente useCount).
	res, err := uc.repo.AcceptSignup(ctx, token, email, string(hash), strings.TrimSpace(name))
	if err != nil {
		return nil, err
	}

	// Mapper le code métier.
	switch res.Code {
	case "OK":
		if link != nil {
			userID := ""
			if res.UserID != nil {
				userID = *res.UserID
			}
			uc.logAudit(ctx, link.ID, userID, email, ip, userAgent, true, "OK")
		}
		if uc.mailer != nil {
			uc.sendTeacherWelcomeEmail(ctx, token, res)
		}
		return res, nil
	case "NOT_FOUND":
		if link != nil {
			uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "NOT_FOUND")
		}
		return nil, &domain.SignupLinkStateError{Code: "NOT_FOUND", Message: fallbackMsg(res.Message, "Lien d'inscription introuvable")}
	case "INACTIVE":
		if link != nil {
			uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "INACTIVE")
		}
		return nil, &domain.SignupLinkStateError{Code: "INACTIVE", Message: fallbackMsg(res.Message, "Ce lien d'inscription a été révoqué")}
	case "EXPIRED":
		if link != nil {
			uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "EXPIRED")
		}
		return nil, &domain.SignupLinkStateError{Code: "EXPIRED", Message: fallbackMsg(res.Message, "Ce lien d'inscription a expiré")}
	case "QUOTA_EXCEEDED":
		if link != nil {
			uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "QUOTA_EXCEEDED")
		}
		return nil, &domain.SignupLinkStateError{Code: "QUOTA_EXCEEDED", Message: fallbackMsg(res.Message, "Quota d'inscriptions atteint pour ce lien")}
	case "DOMAIN_NOT_ALLOWED":
		// Cas théorique : race entre usecase check et SQL check. Le SQL est
		// authoritative.
		if link != nil {
			uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "DOMAIN_NOT_ALLOWED")
		}
		return nil, &domain.SignupLinkStateError{Code: "DOMAIN_NOT_ALLOWED", Message: fallbackMsg(res.Message, "Domaine email non autorisé")}
	case "USER_EXISTS":
		if link != nil {
			uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "USER_EXISTS")
		}
		return nil, &domain.SignupLinkStateError{Code: "USER_EXISTS", Message: fallbackMsg(res.Message, "Un compte existe déjà avec cet email")}
	default:
		if link != nil {
			uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, res.Code)
		}
		return nil, fmt.Errorf("unknown accept_teacher_signup code: %s (%s)", res.Code, res.Message)
	}
}

// logAudit logge un événement d'inscription dans "TeacherRegistrationEvent"
// via la fonction SQL log_teacher_registration_event (SECURITY DEFINER).
// Non bloquant : si l'audit échoue, on log l'erreur sans faire échouer
// l'inscription.
func (uc *TeacherSignupLinkUseCase) logAudit(ctx context.Context, linkID, userID, email, ip, userAgent string, success bool, code string) {
	if linkID == "" {
		return // rien à logger sans linkID
	}
	if err := uc.repo.LogRegistrationEvent(ctx, linkID, userID, email, ip, userAgent, success, code); err != nil && uc.appLogger != nil {
		uc.appLogger("teacher registration event log failed", "link_id", linkID, "code", code, "error", err)
	}
}

// sendTeacherWelcomeEmail envoie l'email de bienvenue après inscription réussie.
// Non bloquant : si l'envoi échoue, l'inscription reste valide (le User est créé
// en DB, l'enseignant peut se connecter). On log l'erreur sans propager.
//
// Utilise le template WelcomeInvitation (même template que l'acceptation d'une
// invitation enseignant — cohérence des emails) avec le CustomMessage du créateur
// (SECT-TEACHER-REG-LINK-1 : champ optionnel ajouté à WelcomeInvitationData,
// vide = rendu inchangé).
func (uc *TeacherSignupLinkUseCase) sendTeacherWelcomeEmail(ctx context.Context, token string, res *domain.AcceptTeacherSignupResult) {
	// Context avec timeout de 30s (évite fuite si DB ou Resend est lent).
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var (
		etabNom    string
		creatorNom string
		customMsg  string
	)
	if res.EtablissementNom != nil {
		etabNom = *res.EtablissementNom
	}
	// Récupérer le nom du créateur + customWelcomeMessage via FindByToken
	// (le résultat AcceptSignup ne retourne pas le créateur).
	if link, err := uc.repo.FindByToken(ctx, token); err == nil && link != nil {
		if link.Creator != nil {
			creatorNom = link.Creator.Name
		}
		if link.CustomWelcomeMessage != nil {
			customMsg = *link.CustomWelcomeMessage
		}
	}

	recipientName := ""
	if res.UserName != nil {
		recipientName = *res.UserName
	}
	toEmail := ""
	if res.UserEmail != nil {
		toEmail = *res.UserEmail
	}

	tplData := emailtpl.WelcomeInvitationData{
		EmailData:        emailtpl.DefaultData(recipientName, uc.appBaseURL),
		Role:             "ENSEIGNANT",
		RoleLabel:        "Enseignant",
		EtablissementNom: etabNom,
		InviterName:      creatorNom,
		LoginURL:         uc.appBaseURL + "/login",
		Avantages:        enseignantAvantages,
		CustomMessage:    customMsg,
	}

	if err := uc.mailer.Send(mailer.Email{
		To:      toEmail,
		Subject: "Bienvenue sur SECT — Votre compte enseignant est prêt",
		Body:    emailtpl.WelcomeInvitationText(tplData),
		HTML:    emailtpl.WelcomeInvitationHTML(tplData),
	}); err != nil && uc.appLogger != nil {
		// Sécurité : ne jamais logger le token en clair.
		userID := ""
		if res.UserID != nil {
			userID = *res.UserID
		}
		uc.appLogger("teacher welcome email failed", "user_id", userID, "error", err)
	}
}

// Stats — retourne les statistiques agrégées sur les TeacherSignupLinks de
// l'établissement (RESPONSABLE) ou globales (ADMIN).
//
// Scoping RLS :
//   - RESPONSABLE : la policy TeacherSignupLink_select laisse passer tous les
//     liens de son étab (is_responsable() AND etablissementId = current).
//   - ADMIN : is_admin() → tous les liens visibles.
//
// Toutes les queries sont exécutées dans la même transaction RLS-aware
// (db.WithTx) pour garantir une vue cohérente. Le scoping est entièrement
// délégué à la RLS (sécurité by construction).
//
// Queries (clone du flux étudiant) :
//
//	1-6. Compteurs globaux (total/active/expired/revoked/expiringSoon/totalUses)
//	7.   Succès/échecs depuis TeacherRegistrationEvent (JOIN)
//	8.   Top 5 liens par useCount
//	9.   Créations par jour (30 derniers jours)
//
// 10.   Breakdown des échecs par code
func (uc *TeacherSignupLinkUseCase) Stats(ctx context.Context, claims db.SessionClaims) (*domain.TeacherSignupLinkStats, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if claims.UserID == "" {
		return nil, &domain.UnauthorizedError{Message: "session invalide"}
	}
	if role == domain.RoleResponsable && claims.EtablissementID == "" {
		return nil, &domain.UnauthorizedError{Message: "établissement requis dans la session"}
	}

	stats := &domain.TeacherSignupLinkStats{
		TopLinks:         []domain.TopLinkStat{},
		DailyCreations:   []domain.DailyCreationStat{},
		FailureBreakdown: map[string]int{},
	}

	err := db.WithTx(ctx, uc.pool, claims, func(tx pgx.Tx) error {
		// 1-6. Compteurs globaux en une seule query (FILTER pour perf).
		var total, active, expired, revoked, expiringSoon int
		var totalUses sql.NullInt64
		q := `
                        SELECT
                                count(*) AS total,
                                count(*) FILTER (WHERE "actif" = true AND "expiresAt" > NOW() AND "deletedAt" IS NULL) AS active,
                                count(*) FILTER (WHERE "actif" = false AND "deletedAt" IS NULL) AS expired,
                                count(*) FILTER (WHERE "deletedAt" IS NOT NULL) AS revoked,
                                count(*) FILTER (WHERE "expiresAt" < NOW() + INTERVAL '24 hours' AND "actif" = true AND "deletedAt" IS NULL) AS expiring_soon,
                                COALESCE(sum("useCount"), 0) AS total_uses
                        FROM "TeacherSignupLink"
                `
		if err := tx.QueryRow(ctx, q).Scan(&total, &active, &expired, &revoked, &expiringSoon, &totalUses); err == nil {
			stats.Total = total
			stats.Active = active
			stats.Expired = expired
			stats.Revoked = revoked
			stats.ExpiringSoon = expiringSoon
			if totalUses.Valid {
				stats.TotalUses = int(totalUses.Int64)
			}
		}

		// 7. Compteurs succès/échec depuis TeacherRegistrationEvent (via JOIN).
		regQ := `
                        SELECT
                                count(*) FILTER (WHERE r."success" = true) AS success,
                                count(*) FILTER (WHERE r."success" = false) AS failure
                        FROM "TeacherRegistrationEvent" r
                        JOIN "TeacherSignupLink" s ON s."id" = r."linkId"
                `
		var successCount, failureCount int
		if err := tx.QueryRow(ctx, regQ).Scan(&successCount, &failureCount); err == nil {
			stats.SuccessCount = successCount
			stats.FailureCount = failureCount
		}

		// 8. Top 5 liens par useCount.
		topQ := `
                        SELECT "id", COALESCE("label", 'Sans libellé'), "useCount", "maxUses", "expiresAt", "actif"
                        FROM "TeacherSignupLink"
                        WHERE "deletedAt" IS NULL
                        ORDER BY "useCount" DESC, "createdAt" DESC
                        LIMIT 5
                `
		rows, qerr := tx.Query(ctx, topQ)
		if qerr == nil {
			defer rows.Close()
			for rows.Next() {
				var tl domain.TopLinkStat
				var label string
				var maxUses *int
				var expiresAt time.Time
				var actif bool
				if err := rows.Scan(&tl.ID, &label, &tl.UseCount, &maxUses, &expiresAt, &actif); err == nil {
					tl.Label = label
					tl.MaxUses = maxUses
					tl.ExpiresAt = expiresAt.Format("2006-01-02T15:04:05Z07:00")
					tl.Actif = actif
					stats.TopLinks = append(stats.TopLinks, tl)
				}
			}
		}

		// 9. Daily creations (30 derniers jours).
		dailyQ := `
                        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                               count(*) AS count
                        FROM "TeacherSignupLink"
                        WHERE "createdAt" > NOW() - INTERVAL '30 days'
                        GROUP BY day
                        ORDER BY day ASC
                `
		rows2, qerr2 := tx.Query(ctx, dailyQ)
		if qerr2 == nil {
			defer rows2.Close()
			for rows2.Next() {
				var dc domain.DailyCreationStat
				if err := rows2.Scan(&dc.Day, &dc.Count); err == nil {
					stats.DailyCreations = append(stats.DailyCreations, dc)
				}
			}
		}

		// 10. Failure breakdown by code.
		fbQ := `
                        SELECT r."code", count(*) AS count
                        FROM "TeacherRegistrationEvent" r
                        JOIN "TeacherSignupLink" s ON s."id" = r."linkId"
                        WHERE r."success" = false
                        GROUP BY r."code"
                        ORDER BY count DESC
                `
		rows3, qerr3 := tx.Query(ctx, fbQ)
		if qerr3 == nil {
			defer rows3.Close()
			for rows3.Next() {
				var code string
				var count int
				if err := rows3.Scan(&code, &count); err == nil {
					stats.FailureBreakdown[code] = count
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return stats, nil
}
