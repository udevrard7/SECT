// Package usecase — logique métier StudentSignupLink (SECT-REG-LINK-B2C-MVP-1).
//
// Trois cas d'usage :
//   - Create(ctx, claims, input) — RESPONSABLE / ENSEIGNANT (étab PERSONNEL) / ADMIN
//   - Verify(ctx, token)         — PUBLIC (endpoint /verify, pré-remplir le form)
//   - Accept(ctx, token, email, name, password) — PUBLIC (endpoint /complete)
//
// Différences vs InvitationUseCase :
//   - TTL 30 jours (vs 7j) — pas d'email envoyé à la génération, partage manuel
//     (WhatsApp, QR code, etc.), donc TTL plus longue.
//   - Pas de check USER_EXISTS côté usecase sur Verify : la fonction SQL
//     accept_student_signup gère atomiquement la détection via unique constraint
//     (catchée côté SQL → code USER_EXISTS). Pas de fenêtre de race.
//   - Pas de check quota côté MVP (Phase 1) — la migration 000079 note explicitement
//     "maxUses NULL = illimité (MVP Phase 1 ; quota check via plan en Phase 2)".
//     Le quotaRepo est quand même injecté pour anticipation Phase 2 (nil-safe).
//   - L'email de bienvenue est envoyé via StudentWelcomeHTML/Text (template dédié,
//     légèrement plus simple que WelcomeInvitation car focus étudiant B2C).
package usecase

import (
        "context"
        "crypto/rand"
        "encoding/hex"
        "fmt"
        "regexp"
        "strings"
        "time"

        "golang.org/x/crypto/bcrypt"

        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/emailtpl"
        "github.com/udevrard7/sect/backend/internal/mailer"
)

// Durée de validité d'un lien d'inscription direct (30 jours).
// Plus longue que invitationTTL (7 jours) car le lien est partagé manuellement
// (pas d'email automatique) — l'enseignant peut l'afficher en amphi, le mettre
// dans un groupe WhatsApp, l'imprimer en QR code, etc.
const signupLinkTTL = 30 * 24 * time.Hour

// signupBcryptCost — identique à invitationBcryptCost (10). Cohérent avec le
// usecase auth pour permettre une rotation uniforme des coûts si besoin.
const signupBcryptCost = 10

// signupEmailRegex — validation simple d'email. Suffixe TLD ≥ 2 lettres pour
// tolérer les nouveaux TLD (.africa, .ci, .sn, etc.). Le check finaliste reste
// la fonction SQL accept_student_signup qui normalise l'email en lower() et
// s'appuie sur le unique constraint de "User"."email".
var signupEmailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// signupDomainRegex — validation d'un domaine email (Phase 2). Autorise les
// labels alphanumériques + points + tirets (ex: "univ-ci.edu", "u-bourgogne.fr").
// Pas de '@' initial (le usecase le strippe si présent). Pas d'espaces.
var signupDomainRegex = regexp.MustCompile(`^[a-zA-Z0-9.-]+$`)

// StudentSignupLinkUseCase implémente les cas d'usage des liens d'inscription
// direct étudiant.
type StudentSignupLinkUseCase struct {
        repo        domain.StudentSignupLinkRepository
        pool        *pgxpool.Pool // SECT-REG-LINK-B2C-MVP-1 (fix RLS) : pour check is_enseignant_in_personal_etab via WithTx
        mailer      mailer.Mailer
        appBaseURL  string
        quotaRepo   domain.QuotaChecker // SECT-REG-LINK-B2C-MVP-1 Phase 2 ; nil = pas de check
        appLogger   func(msg string, args ...any)
}

// NewStudentSignupLinkUseCase crée un nouveau StudentSignupLinkUseCase.
//
// quotaRepo est optionnel (nil = pas de vérification de quota — MVP Phase 1).
// mailer est optionnel (nil = pas d'email de bienvenue — utile en tests).
// appBaseURL sert à construire l'URL publique /inscription?token=xxx.
func NewStudentSignupLinkUseCase(
        repo domain.StudentSignupLinkRepository,
        pool *pgxpool.Pool,
        mailSvc mailer.Mailer,
        appBaseURL string,
        quotaRepo domain.QuotaChecker,
) *StudentSignupLinkUseCase {
        return &StudentSignupLinkUseCase{
                repo:       repo,
                pool:       pool,
                mailer:     mailSvc,
                appBaseURL: strings.TrimRight(appBaseURL, "/"),
                quotaRepo:  quotaRepo,
        }
}

// generateSignupToken génère un token aléatoire de 32 chars hex (16 octets).
// Clone de generateInvitationToken — crypto/rand offre une entropie suffisante
// pour des tokens d'authentification (16 octets = 128 bits > 80 bits NIST).
func generateSignupToken() (string, error) {
        b := make([]byte, 16) // 16 octets → 32 chars hex
        if _, err := rand.Read(b); err != nil {
                return "", fmt.Errorf("generate signup token: %w", err)
        }
        return hex.EncodeToString(b), nil
}

// PublicURL construit l'URL publique d'inscription à partir du token.
// Format : {appBaseURL}/inscription?token={token}
func (uc *StudentSignupLinkUseCase) PublicURL(token string) string {
        return uc.appBaseURL + "/inscription?token=" + token
}

// Create crée un nouveau lien d'inscription direct étudiant.
//
// Étapes :
//  1. Valide claims.Role ∈ {RESPONSABLE, ENSEIGNANT, ADMIN} (le middleware
//     RequireRoleOrPersonalEtab filtre déjà, mais defense in depth).
//  2. Force input.EtablissementID = claims.EtablissementID,
//     input.CreatedByID = claims.UserID (le body du client est ignoré pour
//     sécurité — on ne fait jamais confiance au client pour l'identité du
//     créateur ni le rattachement étab).
//  3. Si ENSEIGNANT : input.FiliereID doit être nil. Un prof B2C n'a pas de
//     filière propre (son étab PERSONNEL est "global") — les étudiants rejoignent
//     l'établissement sans filière assignée. Le prof pourra les répartir
//     manuellement ensuite. (Spec MVP Phase 1.)
//  4. Génère token 32 chars hex + ExpiresAt = now + 30j.
//  5. Appelle repo.Create.
//  6. Retourne le lien + l'URL publique pré-construite pour le frontend.
//
// Note : pas d'envoi d'email à la création (le créateur partage le lien
// manuellement — WhatsApp, QR code, etc.). C'est la principale différence UX
// avec Invitation qui envoie un email automatiquement.
func (uc *StudentSignupLinkUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateStudentSignupLinkInput) (*domain.StudentSignupLink, string, error) {
        role := domain.Role(claims.Role)
        // Defense in depth : le middleware RequireRoleOrPersonalEtab applique déjà
        // ce filtrage, mais on vérifie côté usecase aussi pour ne pas dépendre
        // uniquement du wiring router.
        if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
                return nil, "", &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Forçage sécurisé : on n'utilise JAMAIS les valeurs du body client pour
        // ces deux champs.
        if claims.EtablissementID == "" {
                return nil, "", &domain.UnauthorizedError{Message: "établissement requis dans la session"}
        }
        input.EtablissementID = claims.EtablissementID
        input.CreatedByID = claims.UserID

        // SECT-REG-LINK-B2C-MVP-1 (fix RLS) : pour les ENSEIGNANTS, vérifier via la
        // fonction SECURITY DEFINER is_enseignant_in_personal_etab() que l'étab est
        // bien de type PERSONNEL. Cette fonction bypass RLS pour son SELECT interne
        // (contrairement à un SELECT direct sur Etablissement qui serait filtré par
        // la policy Etablissement_select pour sect_app en prod). Elle utilise
        // current_user_id() qui lit les claims posés par db.WithTx ci-dessous.
        // Pour ADMIN/RESPONSABLE, on fait confiance au middleware + RLS.
        if role == domain.RoleEnseignant {
                var isPersonal bool
                checkErr := db.WithTx(ctx, uc.pool, claims, func(tx pgx.Tx) error {
                        return tx.QueryRow(ctx, `SELECT is_enseignant_in_personal_etab()`).Scan(&isPersonal)
                })
                if checkErr != nil || !isPersonal {
                        return nil, "", &domain.UnauthorizedError{Message: "réservé aux enseignants B2C (établissement personnel)"}
                }
        }

        // Un prof B2C (ENSEIGNANT dans étab PERSONNEL) n'a pas de filière — son étab
        // est global. Les étudiants rejoignent l'établissement sans filière ; le prof
        // les répartira manuellement via /api/users/{id} PATCH si besoin.
        if role == domain.RoleEnseignant {
                input.FiliereID = nil
        }

        // SECT-REG-LINK-PHASE2-BACKEND-1 : validation/normalisation du domaine email.
        // On lower + trim + strip '@' initial si présent. Si vide après trim → nil (pas
        // de restriction). Si invalide (caractères non autorisés) → ValidationError.
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

        // Génération token + expiration.
        token, err := generateSignupToken()
        if err != nil {
                return nil, "", err
        }
        input.ExpiresAt = time.Now().Add(signupLinkTTL)

        link, err := uc.repo.Create(ctx, input, token)
        if err != nil {
                return nil, "", err
        }
        return link, uc.PublicURL(token), nil
}

// ListByCreator liste les liens non supprimés d'un créateur.
// Le créateur est déterminé par claims.UserID (RLS applique le filtrage).
func (uc *StudentSignupLinkUseCase) ListByCreator(ctx context.Context, claims db.SessionClaims) ([]domain.StudentSignupLink, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if claims.UserID == "" {
                return nil, &domain.UnauthorizedError{Message: "session invalide"}
        }
        return uc.repo.ListByCreator(ctx, claims.UserID)
}

// Revoke révoque un lien (soft-delete : actif=false + deletedAt=now).
// Le créateur (ou un admin / responsable de l'étab) peut révoquer.
func (uc *StudentSignupLinkUseCase) Revoke(ctx context.Context, claims db.SessionClaims, id string) error {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if id == "" {
                return &domain.ValidationError{Field: "id", Message: "requis"}
        }
        return uc.repo.Revoke(ctx, id)
}

// Verify vérifie un token d'inscription (PUBLIC — pas d'auth).
//
// Étapes :
//  1. repo.FindByToken (SECURITY DEFINER, bypass RLS).
//  2. Si introuvable → SignupLinkStateError{Code: "NOT_FOUND"}.
//  3. Si !Actif → SignupLinkStateError{Code: "INACTIVE"}.
//  4. Si ExpiresAt < now → SignupLinkStateError{Code: "EXPIRED"}.
//  5. Si MaxUses != nil && UseCount >= MaxUses → SignupLinkStateError{Code: "QUOTA_EXCEEDED"}.
//  6. Sinon retourne le lien (pour pré-remplir le formulaire public).
//
// Note : pas de check USER_EXISTS côté Verify (contrairement à Invitation qui
// le fait car l'email est connu à la création). Ici l'étudiant saisit son email
// à l'inscription — on ne peut pas pré-vérifier. La fonction SQL accept_student_signup
// catche le unique_violation atomiquement → code USER_EXISTS.
func (uc *StudentSignupLinkUseCase) Verify(ctx context.Context, token string) (*domain.StudentSignupLink, error) {
        link, err := uc.repo.FindByToken(ctx, token)
        if err != nil {
                if nf, ok := err.(*domain.NotFoundError); ok && nf.Entity == "StudentSignupLink" {
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

// Accept finalise l'inscription d'un étudiant via un lien direct (PUBLIC).
//
// Étapes :
//  1. Valide name non vide, password ≥ 8 chars, email format valide (regex simple).
//  2. Phase 2 — charge le lien via FindByToken (SECURITY DEFINER) pour :
//     - vérifier le quota capitation B2B via quotaRepo.CheckStudentsQuota,
//     - vérifier la restriction de domaine email (defense in depth côté usecase,
//       le SQL le vérifie aussi atomiquement),
//     - logger l'audit RegistrationEvent en cas de succès/échec (lien connu).
//  3. Hash password : bcrypt.GenerateFromPassword(cost 10).
//  4. Appelle repo.AcceptSignup (fonction SQL accept_student_signup SECURITY DEFINER).
//  5. Mappe le code retour :
//     - OK → envoie email de bienvenue + log audit success.
//     - NOT_FOUND / INACTIVE / EXPIRED / QUOTA_EXCEEDED / DOMAIN_NOT_ALLOWED /
//       USER_EXISTS → SignupLinkStateError correspondant + log audit failure.
//
// Note : on NE vérifie pas l'état du lien côté usecase AVANT d'appeler AcceptSignup
// pour les checks basiques (actif/expiresAt/maxUses) — la fonction SQL fait ces
// checks atomiquement (defense in depth, pas de fenêtre de race). En revanche, la
// restriction de domaine ET le quota capitation B2B sont vérifiés côté usecase
// AVANT l'appel SQL pour :
//   - pouvoir logguer l'audit précisément (lien connu, code DOMAIN_NOT_ALLOWED /
//     QUOTA_EXCEEDED),
//   - éviter un appel SQL inutile (le check quota capitation nécessite de toute
//     façon une lecture préalable côté QuotaRepository),
//   - retourner une réponse rapide (4xx) à l'utilisateur sans attendre la tx SQL.
// Le check SQL (DOMAIN_NOT_ALLOWED côté accept_student_signup) reste authoritative
// en cas de race (modification du link entre le FindByToken et le AcceptSignup).
//
// Phase 2 — la signature Accept gagne 2 nouveaux params ip + userAgent pour
// l'audit RegistrationEvent.
func (uc *StudentSignupLinkUseCase) Accept(ctx context.Context, token, email, name, password, ip, userAgent string) (*domain.AcceptSignupResult, error) {
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

        // Phase 2 — charger le lien pour : (1) check quota capitation B2B,
        // (2) check restriction domaine (defense in depth), (3) audit RegistrationEvent.
        // Si le token n'existe pas, on laisse AcceptSignup retourner NOT_FOUND
        // atomiquement. Pas d'audit possible (pas de linkID).
        var link *domain.StudentSignupLink
        if l, ferr := uc.repo.FindByToken(ctx, token); ferr == nil && l != nil {
                link = l
        }

        // Phase 2 — check quota capitation (B2B). Non bloquant si erreur DB (on log
        // et on continue) — seul QuotaExceededError bloque.
        if link != nil && uc.quotaRepo != nil {
                if qerr := uc.quotaRepo.CheckStudentsQuota(ctx, link.EtablissementID); qerr != nil {
                        if domain.IsQuotaExceeded(qerr) {
                                uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "QUOTA_EXCEEDED")
                                return nil, &domain.SignupLinkStateError{
                                        Code:    "QUOTA_EXCEEDED",
                                        Message: "Le quota d'étudiants de cet établissement est atteint. Contactez votre responsable ou le support SECT.",
                                }
                        }
                        // Erreur non-quota (DB, etc.) : on logge mais on ne bloque pas.
                        if uc.appLogger != nil {
                                uc.appLogger("quota check failed (non-blocking)", "etablissement_id", link.EtablissementID, "error", qerr)
                        }
                }
        }

        // Phase 2 — check restriction domaine (defense in depth). Le SQL le vérifie
        // aussi atomiquement, mais on le fait ici pour :
        //   - logguer l'audit précisément (DOMAIN_NOT_ALLOWED côté usecase),
        //   - retourner 4xx avant l'appel SQL (économie DB + UX rapide).
        if link != nil && link.EmailDomainRestriction != nil && *link.EmailDomainRestriction != "" {
                if !strings.HasSuffix(email, "@"+strings.ToLower(*link.EmailDomainRestriction)) {
                        uc.logAudit(ctx, link.ID, "", email, ip, userAgent, false, "DOMAIN_NOT_ALLOWED")
                        return nil, &domain.SignupLinkStateError{
                                Code:    "DOMAIN_NOT_ALLOWED",
                                Message: fmt.Sprintf("Cet email n'appartient pas au domaine autorisé : @%s", *link.EmailDomainRestriction),
                        }
                }
        }

        // Hasher le password (bcrypt cost 10, cohérent avec invitationBcryptCost).
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
                // Succès → log audit + envoyer email de bienvenue (non bloquant).
                if link != nil {
                        userID := ""
                        if res.UserID != nil {
                                userID = *res.UserID
                        }
                        uc.logAudit(ctx, link.ID, userID, email, ip, userAgent, true, "OK")
                }
                if uc.mailer != nil {
                        uc.sendStudentWelcomeEmail(ctx, token, res)
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
                // Cas théorique : race entre usecase check et SQL check (ex: link modifié
                // entre les deux). Le SQL est authoritative.
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
                return nil, fmt.Errorf("unknown accept_student_signup code: %s (%s)", res.Code, res.Message)
        }
}

// logAudit logge un événement d'inscription dans "RegistrationEvent" via la
// fonction SQL log_registration_event (SECURITY DEFINER, bypass RLS pour INSERT).
// Non bloquant : si l'audit échoue (DB indisponible, etc.), on log l'erreur sans
// faire échouer l'inscription.
func (uc *StudentSignupLinkUseCase) logAudit(ctx context.Context, linkID, userID, email, ip, userAgent string, success bool, code string) {
        if linkID == "" {
                return // rien à logger sans linkID
        }
        if err := uc.repo.LogRegistrationEvent(ctx, linkID, userID, email, ip, userAgent, success, code); err != nil && uc.appLogger != nil {
                uc.appLogger("registration event log failed", "link_id", linkID, "code", code, "error", err)
        }
}

// fallbackMsg retourne message si non vide, sinon fallback.
func fallbackMsg(message, fallback string) string {
        if strings.TrimSpace(message) != "" {
                return message
        }
        return fallback
}

// sendStudentWelcomeEmail envoie l'email de bienvenue après inscription réussie.
// Non bloquant : si l'envoi échoue, l'inscription reste valide (le User est créé
// en DB, l'étudiant peut se connecter). On log l'erreur sans propager.
//
// Récupère le contexte (étab, filière, créateur) via le token pour personnaliser
// l'email. Si FindByToken échoue (token déjà utilisé etc.), on utilise les
// données renvoyées par accept_student_signup.
func (uc *StudentSignupLinkUseCase) sendStudentWelcomeEmail(ctx context.Context, token string, res *domain.AcceptSignupResult) {
        // Context avec timeout de 30s (évite fuite si DB ou Resend est lent).
        ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer cancel()

        var (
                etabNom        string
                filiereNom     string
                enseignantNom  string
        )
        if res.EtablissementNom != nil {
                etabNom = *res.EtablissementNom
        }
        if res.FiliereNom != nil && *res.FiliereNom != "" {
                filiereNom = *res.FiliereNom
        } else {
                filiereNom = "—"
        }
        // Récupérer le nom du créateur via FindByToken (le résultat AcceptSignup
        // ne retourne pas le créateur — seulement l'étab et la filière).
        if link, err := uc.repo.FindByToken(ctx, token); err == nil && link != nil && link.Creator != nil {
                enseignantNom = link.Creator.Name
        }

        // Matricule pour l'email (peut être nil si pas de filière).
        matricule := ""
        if res.UserMatricule != nil {
                matricule = *res.UserMatricule
        }

        // Nom du destinataire (utilise le nom fourni par l'étudiant).
        recipientName := ""
        if res.UserName != nil {
                recipientName = *res.UserName
        }
        toEmail := ""
        if res.UserEmail != nil {
                toEmail = *res.UserEmail
        }

        tplData := emailtpl.StudentWelcomeData{
                EmailData:        emailtpl.DefaultData(recipientName, uc.appBaseURL),
                EtablissementNom: etabNom,
                FiliereNom:       filiereNom,
                EnseignantNom:    enseignantNom,
                LoginURL:         uc.appBaseURL + "/login",
                Matricule:        matricule,
        }

        if err := uc.mailer.Send(mailer.Email{
                To:      toEmail,
                Subject: "SECT — Votre compte étudiant est prêt",
                Body:    emailtpl.StudentWelcomeText(tplData),
                HTML:    emailtpl.StudentWelcomeHTML(tplData),
        }); err != nil && uc.appLogger != nil {
                // Sécurité : ne jamais logger le token en clair. On log seulement le
                // userID si disponible (jamais le token).
                userID := ""
                if res.UserID != nil {
                        userID = *res.UserID
                }
                uc.appLogger("student welcome email failed", "user_id", userID, "error", err)
        }
}

// SetLogger injecte un logger optionnel pour tracer les erreurs d'envoi email
// sans propager. Permet au main.go de brancher slog sans coupler le usecase
// à *slog.Logger.
func (uc *StudentSignupLinkUseCase) SetLogger(fn func(msg string, args ...any)) {
        uc.appLogger = fn
}
