// Package usecase — logique métier des utilisateurs.
package usecase

import (
        "context"
        "crypto/rand"
        "fmt"
        "math/big"
        "strings"

        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "golang.org/x/crypto/bcrypt"
)

// UserUseCase implémente les cas d'usage liés aux utilisateurs.
type UserUseCase struct {
        userRepo domain.UserRepository
}

// NewUserUseCase crée un nouveau UserUseCase.
func NewUserUseCase(userRepo domain.UserRepository) *UserUseCase {
        return &UserUseCase{userRepo: userRepo}
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
// - ADMIN : voit uniquement les RESPONSABLE (peut filtrer par etablissementId)
// - RESPONSABLE : voit les users de son établissement
// - ENSEIGNANT : voit les users de son établissement (étudiants de ses filières en pratique)
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
                // ADMIN ne voit que les RESPONSABLE
                repoParams.Role = string(domain.RoleResponsable)
                if params.EtablissementID != "" {
                        repoParams.EtablissementID = params.EtablissementID
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
        if err := uc.checkOwnership(claims, user); err != nil {
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
        } else if len(input.Password) < 6 {
                return nil, "", &domain.ValidationError{Field: "password", Message: "minimum 6 caractères"}
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
func (uc *UserUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateUserInput) (*domain.User, error) {
        // Récupérer l'utilisateur existant pour ownership check
        existing, err := uc.userRepo.FindByID(ctx, id)
        if err != nil {
                return nil, err
        }

        if err := uc.checkOwnership(claims, existing); err != nil {
                return nil, err
        }

        // RESPONSABLE ne peut pas définir le rôle ADMIN
        if input.Role != nil && *input.Role == domain.RoleAdmin && claims.Role != string(domain.RoleAdmin) {
                return nil, &domain.UnauthorizedError{Message: "seul un ADMIN peut attribuer le rôle ADMIN"}
        }

        // Hasher le nouveau password si fourni
        var passwordHash *string
        if input.Password != nil {
                if len(*input.Password) < 6 {
                        return nil, &domain.ValidationError{Field: "password", Message: "minimum 6 caractères"}
                }
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
// suppression (pour transparence — ETUDIANTS-FIX-E4).
type DeletedDependencies struct {
        Sessions   int `json:"sessions"`
        Reponses   int `json:"reponses"`
        Soumissions int `json:"soumissions"`
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

        if err := uc.checkOwnership(claims, existing); err != nil {
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
        deps := uc.countUserDependencies(ctx, id)

        if err := uc.userRepo.Delete(ctx, id); err != nil {
                return nil, err
        }
        return deps, nil
}

// countUserDependencies compte les sessions, réponses et soumissions d'un user.
// Best-effort : retourne un struct avec des 0 si les queries échouent (la RLS
// peut bloquer si le user n'est pas dans le même établissement, mais le
// checkOwnership a déjà validé l'accès avant).
func (uc *UserUseCase) countUserDependencies(ctx context.Context, userID string) *DeletedDependencies {
        deps := &DeletedDependencies{}
        // Les compteurs se font via le repo (qui a accès au pool pgx).
        counter, ok := uc.userRepo.(domain.UserDependencyCounter)
        if !ok {
                return deps
        }
        sessions, reponses, soumissions, _ := counter.CountDependencies(ctx, userID)
        deps.Sessions = sessions
        deps.Reponses = reponses
        deps.Soumissions = soumissions
        return deps
}

// checkOwnership vérifie que l'utilisateur courant peut accéder au user cible.
func (uc *UserUseCase) checkOwnership(claims db.SessionClaims, target *domain.User) error {
        role := domain.Role(claims.Role)

        switch role {
        case domain.RoleAdmin:
                // ADMIN peut accéder si target n'a pas d'établissement, OU via EtablissementAccess
                // (la vérification EtablissementAccess est complexe — pour l'instant on permet l'accès
                // car le RLS côté DB filtrera. TODO: ajouter check explicite EtablissementAccess)
                if target.EtablissementID != nil && *target.EtablissementID != "" {
                        // L'ADMIN a accès via RLS (admin_has_etablissement_access) — si pas d'accès, RLS bloque
                        // On laisse passer, la DB fera le filtrage
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

// isValidEmail valide basiquement un email.
func isValidEmail(s string) bool {
        return strings.Contains(s, "@") && strings.Contains(s, ".")
}
