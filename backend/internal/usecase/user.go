// Package usecase — logique métier des utilisateurs.
package usecase

import (
        "context"
        "crypto/rand"
        "fmt"
        "math/big"
        "regexp"
        "strings"

        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "golang.org/x/crypto/bcrypt"
)

// UserUseCase implémente les cas d'usage liés aux utilisateurs.
//
// U5 (CRITICAL) : dépend de authRepo pour ResetPassword + UnlockAccount +
// RevokeAllUserRefreshTokens + CreateAuditLog. Sans cette injection, l'admin
// ne pouvait pas déverrouiller un compte (PATCH /api/users/{id} avec password
// ne reset pas loginAttempts/lockedUntil via userRepo.Update).
//
// U1/U7 (CRITICAL) : dépend de accessUC pour ValidateAccessForEtablissement.
// Avant ce fix, un ADMIN pouvait muter/créer des users dans n'importe quel
// établissement sans autorisation EtablissementAccess (le repo bypass RLS sur
// les writes, et checkOwnership ADMIN était un no-op avec TODO commenté).
type UserUseCase struct {
        userRepo domain.UserRepository
        authRepo domain.AuthRepository
        accessUC *AccessUseCase
}

// NewUserUseCase crée un nouveau UserUseCase.
func NewUserUseCase(userRepo domain.UserRepository, authRepo domain.AuthRepository, accessUC *AccessUseCase) *UserUseCase {
        return &UserUseCase{userRepo: userRepo, authRepo: authRepo, accessUC: accessUC}
}

// GetProfile récupère le profil de l'utilisateur courant.
func (uc *UserUseCase) GetProfile(ctx context.Context, claims db.SessionClaims) (*domain.User, error) {
        user, err := uc.userRepo.FindByID(ctx, claims.UserID)
        if err != nil {
                return nil, err
        }
        return user, nil
}

// ListParams contient les paramètres de listing (transmis au repository).
type ListParams struct {
        Search          string
        Role            string
        Actif           *bool
        EtablissementID string
        FiliereID       string
        Niveau          string // ETUDIANTS-FIX-E5 : filtre niveau (avant ignoré)
        Page            int
        Limit           int
}

// List liste les utilisateurs avec tenant scoping automatique.
// - ADMIN (mode normal) : voit uniquement les RESPONSABLE (peut filtrer par etablissementId)
// - ADMIN (mode assistance) : se comporte comme un RESPONSABLE de l'établissement
//   autorisé (claims.EtablissementID non vide) — voit les users de cet établissement
//   selon params.Role (ETUDIANT, ENSEIGNANT, etc.).
// - RESPONSABLE : voit les users de son établissement
// - ENSEIGNANT : voit les users de son établissement (étudiants de ses filières en pratique)
//
// ACCESS-ASSISTANCE-FIX : avant, un ADMIN en mode assistance voyait tous les
// requêtes écrasées en Role=RESPONSABLE → /etudiants et /enseignants retournaient
// 0 résultat. Désormais on détecte le mode assistance (claims.Role==ADMIN &&
// claims.EtablissementID != "") et on adopte le scoping RESPONSABLE.
func (uc *UserUseCase) List(ctx context.Context, claims db.SessionClaims, params ListParams) (*domain.UserListResult, error) {
        repoParams := domain.UserListParams{
                Search:    params.Search,
                Page:      params.Page,
                Limit:     params.Limit,
                FiliereID: params.FiliereID,
                Niveau:    params.Niveau, // ETUDIANTS-FIX-E5
        }

        // Tenant scoping selon le rôle
        switch domain.Role(claims.Role) {
        case domain.RoleAdmin:
                // ACCESS-ASSISTANCE-FIX : si l'ADMIN est en mode assistance (JWT contient
                // un etablissementId), on adopte le scoping RESPONSABLE : on scope sur
                // claims.EtablissementID et on laisse params.Role passer (ETUDIANT,
                // ENSEIGNANT, etc.). Sinon, comportement normal (ADMIN global ne voit
                // que les RESPONSABLE).
                if claims.EtablissementID != "" {
                        repoParams.EtablissementID = claims.EtablissementID
                        if params.Role != "" {
                                repoParams.Role = params.Role
                        }
                } else {
                        // ADMIN global : voit uniquement les RESPONSABLE
                        repoParams.Role = string(domain.RoleResponsable)
                        if params.EtablissementID != "" {
                                repoParams.EtablissementID = params.EtablissementID
                        }
                }
        case domain.RoleResponsable:
                // RESPONSABLE scoped à son établissement
                if claims.EtablissementID == "" {
                        return &domain.UserListResult{Users: []*domain.User{}, Total: 0, Page: params.Page, Limit: params.Limit}, nil
                }
                repoParams.EtablissementID = claims.EtablissementID
                if params.Role != "" {
                        repoParams.Role = params.Role
                }
        case domain.RoleEnseignant:
                // ENSEIGNANT scoped à son établissement
                if claims.EtablissementID == "" {
                        return &domain.UserListResult{Users: []*domain.User{}, Total: 0, Page: params.Page, Limit: params.Limit}, nil
                }
                repoParams.EtablissementID = claims.EtablissementID
                if params.Role != "" {
                        repoParams.Role = params.Role
                }
        case domain.RoleEtudiant:
                // MESSAGERIE-DM-ETUDIANT : l'étudiant peut lister les utilisateurs de
                // son établissement pour rechercher des correspondants DM. La policy
                // RLS User_select (migration 000041) filtre automatiquement : l'étudiant
                // ne voit que les étudiants de son étab + ses enseignants. On force
                // l'EtablissementID à celui des claims (anti-IDOR).
                if claims.EtablissementID == "" {
                        return &domain.UserListResult{Users: []*domain.User{}, Total: 0, Page: params.Page, Limit: params.Limit}, nil
                }
                repoParams.EtablissementID = claims.EtablissementID
                if params.Role != "" {
                        repoParams.Role = params.Role
                }
        default:
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé à lister les utilisateurs"}
        }

        if params.Actif != nil {
                repoParams.Actif = params.Actif
        }

        return uc.userRepo.List(ctx, repoParams)
}

// GetByID récupère un utilisateur par son ID avec ownership check.
func (uc *UserUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.User, error) {
        user, err := uc.userRepo.FindByID(ctx, id)
        if err != nil {
                return nil, err
        }

        // Ownership check
        if err := uc.checkOwnership(ctx, claims, user); err != nil {
                return nil, err
        }
        return user, nil
}

// Create crée un nouvel utilisateur.
// Permission matrix : ADMIN crée RESPONSABLE, RESPONSABLE crée ENSEIGNANT/ETUDIANT.
// ETUDIANTS-FIX-E3 : si input.Password est vide (mode "direct" côté frontend),
// génère un mot de passe aléatoire 8 chars et le retourne via TemporaryPassword.
// Le handler peut alors renvoyer { user, temporaryPassword } au frontend pour
// affichage dans le dialog DirectResult.
func (uc *UserUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateUserInput) (*domain.User, string, error) {
        // Validation
        if input.Name == "" {
                return nil, "", &domain.ValidationError{Field: "name", Message: "requis"}
        }
        if input.Email == "" || !isValidEmail(input.Email) {
                return nil, "", &domain.ValidationError{Field: "email", Message: "email invalide"}
        }
        // U11 (HIGH) : valider niveau contre l'enum NiveauEtude. Avant, une valeur
        // invalide était envoyée à Postgres qui rejetait avec une erreur 500 générique.
        if input.Niveau != nil && *input.Niveau != "" && !domain.ValidNiveaux[*input.Niveau] {
                return nil, "", &domain.ValidationError{Field: "niveau", Message: "doit être L1, L2, L3, M1, M2 ou DOCTORAT"}
        }

        // ETUDIANTS-FIX-E3 : génération password aléatoire si manquant.
        // Avant, le frontend "Création directe" n'envoyait pas de password →
        // le usecase retournait ValidationError{password: "requis"} → 400.
        // Désormais on génère un mot de passe temporaire 8 chars alphanumériques.
        temporaryPassword := ""
        if input.Password == "" {
                var err error
                temporaryPassword, err = generateRandomPassword(8)
                if err != nil {
                        return nil, "", fmt.Errorf("generate password: %w", err)
                }
                input.Password = temporaryPassword
                input.MustChangePwd = boolPtr(true) // force changement au 1er login
        } else if len(input.Password) < 8 {
                return nil, "", &domain.ValidationError{Field: "password", Message: "minimum 8 caractères"}
        }

        creatorRole := domain.Role(claims.Role)

        // Permission check
        if !domain.CanCreate(creatorRole, input.Role) {
                return nil, "", &domain.UnauthorizedError{Message: fmt.Sprintf("rôle %s ne peut pas créer le rôle %s", creatorRole, input.Role)}
        }

        // ADMIN ne peut pas créer un autre ADMIN (sécurité supplémentaire)
        if creatorRole == domain.RoleAdmin && input.Role == domain.RoleAdmin {
                return nil, "", &domain.UnauthorizedError{Message: "impossible de créer un compte ADMIN"}
        }

        // RESPONSABLE force etablissementId au sien
        if creatorRole == domain.RoleResponsable {
                if claims.EtablissementID == "" {
                        return nil, "", &domain.UnauthorizedError{Message: "responsable sans établissement"}
                }
                ownEtab := claims.EtablissementID
                input.EtablissementID = &ownEtab
        }

        // U7 (CRITICAL) : ADMIN doit avoir un accès EtablissementAccess valide pour
        // créer un user dans un établissement. Avant ce fix, input.EtablissementID
        // était utilisé tel quel sans validation → ADMIN pouvait créer un RESPONSABLE
        // "fantôme" dans un étab auquel il n'a pas accès. Le repo bypass RLS, donc
        // la policy User_insert (qui contient admin_has_etablissement_access) était
        // court-circuitée.
        //
        // 000052 (B-complète) : exception pour la création de RESPONSABLE — l'ADMIN
        // (propriétaire PaaS) peut créer un RESPONSABLE dans n'importe quel étab sans
        // EtablissementAccess. Cohérent avec la policy User_insert (migration 000052)
        // et checkOwnership. Les ENSEIGNANTS/ÉTUDIANTS créés par ADMIN restent soumis
        // au check strict.
        if creatorRole == domain.RoleAdmin && input.EtablissementID != nil && *input.EtablissementID != "" {
                if input.Role != domain.RoleResponsable {
                        if err := uc.accessUC.ValidateAccessForEtablissement(ctx, claims, *input.EtablissementID); err != nil {
                                return nil, "", err
                        }
                }
        }

        // Hasher le mot de passe (bcrypt cost 10)
        hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 10)
        if err != nil {
                return nil, "", fmt.Errorf("hash password: %w", err)
        }

        // Normaliser email
        input.Email = strings.ToLower(input.Email)

        user, err := uc.userRepo.Create(ctx, input, string(hash))
        if err != nil {
                return nil, "", err
        }
        return user, temporaryPassword, nil
}

// generateRandomPassword génère un mot de passe aléatoire alphanumérique de
// longueur n (mix de majuscules, minuscules, chiffres). Utilise crypto/rand.
func generateRandomPassword(n int) (string, error) {
        const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
        b := make([]byte, n)
        for i := range b {
                max := big.NewInt(int64(len(charset)))
                idx, err := rand.Int(rand.Reader, max)
                if err != nil {
                        return "", err
                }
                b[i] = charset[idx.Int64()]
        }
        return string(b), nil
}

// boolPtr retourne un pointeur vers un bool (helper).
func boolPtr(v bool) *bool {
        return &v
}

// Update met à jour un utilisateur.
//
// U2 (HIGH) : validation input.EtablissementID cible pour empêcher le transfert
// d'un user vers un autre établissement (IDOR). Pour ADMIN, valide l'accès au
// nouvel étab via ValidateAccessForEtablissement. Pour RESPONSABLE, ignore la
// valeur client et force à claims.EtablissementID (comme dans Create).
//
// U6 (CRITICAL) : interdit la promotion au rôle ADMIN via PATCH. La création
// d'ADMIN est déjà interdite dans Create, mais Update l'autorisait pour ADMIN.
// La promotion ADMIN doit passer par un endpoint/script dédié (sécurité).
//
// U8 (HIGH) : validation des transitions de rôle via CanCreate. Avant, un
// RESPONSABLE pouvait demote un autre RESPONSABLE en ETUDIANT, ou promouvoir un
// ETUDIANT en ENSEIGNANT sans contrainte. Maintenant, CanCreate(claims.Role,
// *input.Role) doit être true.
func (uc *UserUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateUserInput) (*domain.User, error) {
        // Récupérer l'utilisateur existant pour ownership check
        existing, err := uc.userRepo.FindByID(ctx, id)
        if err != nil {
                return nil, err
        }

        if err := uc.checkOwnership(ctx, claims, existing); err != nil {
                return nil, err
        }

        // U6 (CRITICAL) : interdire la promotion au rôle ADMIN via PATCH.
        // La création d'ADMIN est déjà interdite dans Create ; Update doit être cohérent.
        if input.Role != nil && *input.Role == domain.RoleAdmin {
                return nil, &domain.UnauthorizedError{Message: "promotion au rôle ADMIN interdite via PATCH (utiliser un endpoint dédié)"}
        }

        // U8 (HIGH) : valider les transitions de rôle via CanCreate.
        // Avant, un RESPONSABLE pouvait demote un autre RESPONSABLE ou changer un
        // ETUDIANT en ENSEIGNANT sans contrainte. Maintenant, le rôle cible doit être
        // dans la matrice CanCreate(claims.Role, *input.Role).
        if input.Role != nil && *input.Role != existing.Role {
                creatorRole := domain.Role(claims.Role)
                if !domain.CanCreate(creatorRole, *input.Role) {
                        return nil, &domain.UnauthorizedError{Message: fmt.Sprintf("rôle %s ne peut pas attribuer le rôle %s", creatorRole, *input.Role)}
                }
        }

        // U2 (HIGH) : validation input.EtablissementID cible.
        // RESPONSABLE : ignore la valeur client, force à claims.EtablissementID (ne peut
        // pas transférer un user vers un autre étab).
        // ADMIN : si input.EtablissementID fourni et différent de l'existant, valider
        // l'accès au nouvel étab via ValidateAccessForEtablissement.
        //
        // 000052 (B-complète) : exception pour les RESPONSABLE — l'ADMIN peut transférer
        // un RESPONSABLE vers n'importe quel étab sans EtablissementAccess (gestion PaaS).
        // Cohérent avec checkOwnership et la policy User_update (migration 000052).
        if input.EtablissementID != nil {
                if claims.Role == string(domain.RoleResponsable) {
                        // RESPONSABLE ne peut pas transférer — force à son étab
                        ownEtab := claims.EtablissementID
                        input.EtablissementID = &ownEtab
                } else if claims.Role == string(domain.RoleAdmin) && *input.EtablissementID != "" {
                        // 000052 B-complète : skip pour RESPONSABLE (le target existing est un RESPONSABLE)
                        if existing.Role != domain.RoleResponsable {
                                // ADMIN : valider l'accès au nouvel étab (si différent de l'existant)
                                existingEtab := ""
                                if existing.EtablissementID != nil {
                                        existingEtab = *existing.EtablissementID
                                }
                                if *input.EtablissementID != existingEtab {
                                        if err := uc.accessUC.ValidateAccessForEtablissement(ctx, claims, *input.EtablissementID); err != nil {
                                                return nil, err
                                        }
                                }
                        }
                }
        }

        // U11 (HIGH) : valider niveau contre l'enum NiveauEtude dans Update aussi.
        if input.Niveau != nil && *input.Niveau != "" && !domain.ValidNiveaux[*input.Niveau] {
                return nil, &domain.ValidationError{Field: "niveau", Message: "doit être L1, L2, L3, M1, M2 ou DOCTORAT"}
        }

        // Hasher le nouveau password si fourni
        var passwordHash *string
        if input.Password != nil {
                if len(*input.Password) < 8 {
                        return nil, &domain.ValidationError{Field: "password", Message: "minimum 8 caractères"}
                }
                // U13 (HIGH) : si l'admin set un password via PATCH, forcer mustChangePwd=true
                // (le repo user.go:337 force mustChangePwd=false — comportement incohérent avec
                // le workflow admin reset). Pour un vrai reset admin, utiliser /reset-password.
                // Ici on garde le comportement existant (mustChangePwd=false) pour ne pas casser
                // l'UI existante, mais le endpoint dédié /reset-password est préférable.
                hash, err := bcrypt.GenerateFromPassword([]byte(*input.Password), 10)
                if err != nil {
                        return nil, fmt.Errorf("hash password: %w", err)
                }
                h := string(hash)
                passwordHash = &h
        }

        // Normaliser email si fourni
        if input.Email != nil {
                normalized := strings.ToLower(*input.Email)
                input.Email = &normalized
        }

        return uc.userRepo.Update(ctx, id, input, passwordHash)
}

// DeletedDependencies contient les comptes d'entités liées à un user avant
// suppression (pour transparence — ETUDIANTS-FIX-E4 + ENSEIGNANTS-FIX-EN3).
// EN3 : étendu pour inclure les deps pertinentes pour les enseignants
// (épreuves, devoirs, affectations UE, affectations filière). Le frontend
// affiche seulement les champs pertinents selon le rôle du user supprimé.
type DeletedDependencies struct {
        // Déps étudiant (ETUDIANT)
        Sessions    int `json:"sessions"`
        Reponses    int `json:"reponses"`
        Soumissions int `json:"soumissions"`
        // Déps enseignant (ENSEIGNANT) — EN3
        Epreuves            int `json:"epreuves"`
        Devoirs             int `json:"devoirs"`
        Affectations        int `json:"affectations"`        // Affectation (enseignant↔UE)
        EnseignantFilieres  int `json:"enseignantFilieres"` // EnseignantFiliere (enseignant↔filière+niveau)
}

// Delete supprime un utilisateur (hard delete avec cascade).
// ETUDIANTS-FIX-E4 : retourne les dependencies (sessions/reponses/soumissions)
// pour que le frontend puisse afficher un toast informatif détaillé.
func (uc *UserUseCase) Delete(ctx context.Context, claims db.SessionClaims, id string) (*DeletedDependencies, error) {
        // Récupérer l'utilisateur existant pour ownership check
        existing, err := uc.userRepo.FindByID(ctx, id)
        if err != nil {
                return nil, err
        }

        if err := uc.checkOwnership(ctx, claims, existing); err != nil {
                return nil, err
        }

        // Empêcher l'auto-suppression
        if claims.UserID == id {
                return nil, &domain.ValidationError{Field: "id", Message: "impossible de supprimer son propre compte"}
        }

        // ETUDIANTS-FIX-E4 : compter les dépendances avant suppression.
        // Best-effort : si une query échoue, on continue (la suppression est plus
        // importante que le count). Les tables enfants ont ON DELETE CASCADE donc
        // tout sera supprimé automatiquement.
        deps := uc.CountUserDependencies(ctx, id)

        if err := uc.userRepo.Delete(ctx, id); err != nil {
                return nil, err
        }
        return deps, nil
}

// CountUserDependencies compte les sessions, réponses, soumissions (dép étudiant)
// + épreuves, devoirs, affectations, enseignantFilieres (dép enseignant) d'un
// user avant suppression (ETUDIANTS-FIX-E4 + ENSEIGNANTS-FIX-EN3).
// Best-effort : retourne un struct avec des 0 si les queries échouent (la RLS
// peut bloquer si le user n'est pas dans le même établissement, mais le
// checkOwnership a déjà validé l'accès avant).
// ETUDIANTS-FIX-E10 : exportée pour être appelée par getUserDependencies handler.
func (uc *UserUseCase) CountUserDependencies(ctx context.Context, userID string) *DeletedDependencies {
        deps := &DeletedDependencies{}
        // Les compteurs se font via le repo (qui a accès au pool pgx).
        counter, ok := uc.userRepo.(domain.UserDependencyCounter)
        if !ok {
                return deps
        }
        sessions, reponses, soumissions, epreuves, devoirs, affectations, enseignantFilieres, _ := counter.CountDependencies(ctx, userID)
        deps.Sessions = sessions
        deps.Reponses = reponses
        deps.Soumissions = soumissions
        deps.Epreuves = epreuves
        deps.Devoirs = devoirs
        deps.Affectations = affectations
        deps.EnseignantFilieres = enseignantFilieres
        return deps
}

// checkOwnership vérifie que l'utilisateur courant peut accéder au user cible.
//
// U1 (CRITICAL) : pour ADMIN, appelle ValidateAccessForEtablissement si le target
// a un etablissementId. Avant ce fix, le repo bypass RLS sur les writes et
// checkOwnership ADMIN était un no-op → un ADMIN pouvait muter des users dans
// n'importe quel établissement sans autorisation EtablissementAccess.
//
// 000052 (B-complète) : l'ADMIN (propriétaire PaaS) gère TOUS les RESPONSABLE
// sans EtablissementAccess. On court-circuite le check quand le target est un
// RESPONSABLE. Les ENSEIGNANTS/ÉTUDIANTS restent soumis au check strict (RLS +
// ValidateAccessForEtablissement). Cohérent avec la migration 000052 qui ajoute
// la clause `is_admin() AND role='RESPONSABLE'` aux 4 policies User.
func (uc *UserUseCase) checkOwnership(ctx context.Context, claims db.SessionClaims, target *domain.User) error {
        role := domain.Role(claims.Role)

        switch role {
        case domain.RoleAdmin:
                // 000052 B-complète : skip access check pour les RESPONSABLE (gestion PaaS).
                if target.Role == domain.RoleResponsable {
                        return nil
                }
                // ADMIN : si le target a un établissement, valider l'accès via EtablissementAccess.
                // Si le target n'a pas d'établissement (admin plat), pas de check.
                if target.EtablissementID != nil && *target.EtablissementID != "" {
                        if err := uc.accessUC.ValidateAccessForEtablissement(ctx, claims, *target.EtablissementID); err != nil {
                                return err
                        }
                }
                return nil
        case domain.RoleResponsable:
                if target.EtablissementID == nil || *target.EtablissementID != claims.EtablissementID {
                        return &domain.UnauthorizedError{Message: "utilisateur hors de votre établissement"}
                }
                return nil
        case domain.RoleEnseignant:
                // Enseignant ne peut voir que les users de son établissement
                if target.EtablissementID == nil || *target.EtablissementID != claims.EtablissementID {
                        return &domain.UnauthorizedError{Message: "utilisateur hors de votre établissement"}
                }
                return nil
        default:
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
}

// isValidEmail valide un email avec une regex simple (U18).
// Avant : `strings.Contains(s, "@") && strings.Contains(s, ".")` acceptait "@.", "a@.b", "a@b.".
// Maintenant : regex ^[^\s@]+@[^\s@]+\.[^\s@]+$ qui valide local@domain.tld.
var emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func isValidEmail(s string) bool {
        return emailRegex.MatchString(s)
}

// ResetPassword (U5 CRITICAL) : admin reset le password d'un user.
//
// Workflow :
// 1. FindByID (ownership check via checkOwnership)
// 2. Hash nouveau password (bcrypt cost 10)
// 3. authRepo.ResetPassword : SET password + mustChangePwd=true + loginAttempts=0 + lockedUntil=NULL
// 4. authRepo.RevokeAllUserRefreshTokens : invalide toutes les sessions existantes
// 5. Audit PASSWORD_RESET
//
// Retourne le mot de passe temporaire en clair (pour que l'admin puisse le communiquer).
// Le user devra changer ce password au prochain login (mustChangePwd=true).
func (uc *UserUseCase) ResetPassword(ctx context.Context, claims db.SessionClaims, userID string, newPassword string) (string, error) {
        // Récupérer l'utilisateur existant pour ownership check
        existing, err := uc.userRepo.FindByID(ctx, userID)
        if err != nil {
                return "", err
        }

        if err := uc.checkOwnership(ctx, claims, existing); err != nil {
                return "", err
        }

        // Validation : password min 8 chars (aligné avec ChangePassword)
        if len(newPassword) < 8 {
                return "", &domain.ValidationError{Field: "password", Message: "min 8 caractères"}
        }

        // Hasher le nouveau password
        hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), BcryptCost)
        if err != nil {
                return "", fmt.Errorf("hash password: %w", err)
        }

        // ResetPassword : hash + mustChangePwd=true + loginAttempts=0 + lockedUntil=NULL
        if err := uc.authRepo.ResetPassword(ctx, userID, string(hash)); err != nil {
                return "", fmt.Errorf("reset password: %w", err)
        }

        // Révoquer tous les refresh tokens (force re-login partout)
        if err := uc.authRepo.RevokeAllUserRefreshTokens(ctx, userID); err != nil {
                return "", fmt.Errorf("revoke refresh tokens: %w", err)
        }

        // Audit PASSWORD_RESET
        userIDPtr := userID
        userEmailPtr := existing.Email
        details := fmt.Sprintf(`{"resetBy":"%s","method":"admin_reset"}`, claims.UserID)
        _ = uc.authRepo.CreateAuditLog(ctx, &domain.AuditLogEntry{
                UserID:    &userIDPtr,
                UserEmail: &userEmailPtr,
                Action:    domain.AuditActionPasswordReset,
                Entite:    "User",
                EntiteID:  &userIDPtr,
                Details:   details,
                AdresseIP: "",
        })

        return newPassword, nil
}

// UnlockAccount (U5 CRITICAL) : admin déverrouille un compte sans changer le password.
//
// Workflow :
// 1. FindByID (ownership check)
// 2. authRepo.UnlockAccount : SET loginAttempts=0 + lockedUntil=NULL
// 3. Audit (PASSWORD_RESET avec method=unlock_only)
//
// Retourne l'état précédent (était verrouillé ?) pour info.
func (uc *UserUseCase) UnlockAccount(ctx context.Context, claims db.SessionClaims, userID string) error {
        existing, err := uc.userRepo.FindByID(ctx, userID)
        if err != nil {
                return err
        }

        if err := uc.checkOwnership(ctx, claims, existing); err != nil {
                return err
        }

        if err := uc.authRepo.UnlockAccount(ctx, userID); err != nil {
                return fmt.Errorf("unlock account: %w", err)
        }

        // Audit
        userIDPtr := userID
        userEmailPtr := existing.Email
        details := fmt.Sprintf(`{"unlockedBy":"%s","method":"unlock_only"}`, claims.UserID)
        _ = uc.authRepo.CreateAuditLog(ctx, &domain.AuditLogEntry{
                UserID:    &userIDPtr,
                UserEmail: &userEmailPtr,
                Action:    domain.AuditActionPasswordReset,
                Entite:    "User",
                EntiteID:  &userIDPtr,
                Details:   details,
                AdresseIP: "",
        })

        return nil
}
