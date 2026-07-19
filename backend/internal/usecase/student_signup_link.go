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
//  2. Hash password : bcrypt.GenerateFromPassword(cost 10).
//  3. Appelle repo.AcceptSignup (fonction SQL accept_student_signup SECURITY DEFINER).
//  4. Mappe le code retour :
//     - OK → envoie email de bienvenue StudentWelcomeHTML/Text (non bloquant,
//       log si erreur), retourne le résultat.
//     - NOT_FOUND / INACTIVE / EXPIRED / QUOTA_EXCEEDED / USER_EXISTS →
//       SignupLinkStateError correspondant.
//
// Note : on NE vérifie pas l'état du lien côté usecase avant d'appeler AcceptSignup.
// La fonction SQL fait ces checks atomiquement (defense in depth) — c'est plus
// sûr car il n'y a pas de fenêtre de race entre Verify et Accept.
func (uc *StudentSignupLinkUseCase) Accept(ctx context.Context, token, email, name, password string) (*domain.AcceptSignupResult, error) {
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
                // Succès → envoyer l'email de bienvenue (non bloquant).
                if uc.mailer != nil {
                        uc.sendStudentWelcomeEmail(ctx, token, res)
                }
                return res, nil
        case "NOT_FOUND":
                return nil, &domain.SignupLinkStateError{Code: "NOT_FOUND", Message: fallbackMsg(res.Message, "Lien d'inscription introuvable")}
        case "INACTIVE":
                return nil, &domain.SignupLinkStateError{Code: "INACTIVE", Message: fallbackMsg(res.Message, "Ce lien d'inscription a été révoqué")}
        case "EXPIRED":
                return nil, &domain.SignupLinkStateError{Code: "EXPIRED", Message: fallbackMsg(res.Message, "Ce lien d'inscription a expiré")}
        case "QUOTA_EXCEEDED":
                return nil, &domain.SignupLinkStateError{Code: "QUOTA_EXCEEDED", Message: fallbackMsg(res.Message, "Quota d'inscriptions atteint pour ce lien")}
        case "USER_EXISTS":
                return nil, &domain.SignupLinkStateError{Code: "USER_EXISTS", Message: fallbackMsg(res.Message, "Un compte existe déjà avec cet email")}
        default:
                return nil, fmt.Errorf("unknown accept_student_signup code: %s (%s)", res.Code, res.Message)
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
