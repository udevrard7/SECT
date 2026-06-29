// Package usecase — logique métier d'authentification.
package usecase

import (
        "context"
        "encoding/json"
        "fmt"
        "time"

        "github.com/google/uuid"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/jwt"
        "golang.org/x/crypto/bcrypt"
)

// MarshalDetails sérialise un map en JSON pour le champ AuditLog.details.
func MarshalDetails(m map[string]any) string {
        if len(m) == 0 {
                return "{}"
        }
        b, err := json.Marshal(m)
        if err != nil {
                return "{}"
        }
        return string(b)
}

// Constantes de sécurité
const (
        MaxLoginAttempts = 5
        LockDuration     = 15 * time.Minute
        BcryptCost       = 10 // identique à bcryptjs côté Next.js
)

// AuthUseCase implémente les cas d'usage d'authentification.
type AuthUseCase struct {
        authRepo domain.AuthRepository
        signer   *jwt.Signer
}

// NewAuthUseCase crée un nouveau AuthUseCase.
func NewAuthUseCase(authRepo domain.AuthRepository, signer *jwt.Signer) *AuthUseCase {
        return &AuthUseCase{authRepo: authRepo, signer: signer}
}

// LoginRequest est le payload de /api/auth/login.
type LoginRequest struct {
        Identifier string `json:"identifier"` // email ou matricule
        Password   string `json:"password"`
}

// LoginResponse est la réponse de /api/auth/login.
type LoginResponse struct {
        User         domain.User `json:"user"`
        AccessToken  string      `json:"accessToken"`
        RefreshToken string      `json:"refreshToken"`
        ExpiresAt    time.Time   `json:"expiresAt"`
}

// Login authentifie un utilisateur et retourne un token pair (access + refresh).
//
// Flux :
// 1. Récupère l'utilisateur par email ou matricule (bypass RLS)
// 2. Vérifie que le compte n'est pas verrouillé (lockedUntil)
// 3. Compare le mot de passe avec bcrypt
// 4. Si échec : incrémente loginAttempts, log audit, retourne InvalidCredentials
// 5. Si succès : reset loginAttempts, crée refresh token, émet access token, log audit
func (uc *AuthUseCase) Login(ctx context.Context, req LoginRequest, ip, userAgent string) (*LoginResponse, error) {
        if req.Identifier == "" || req.Password == "" {
                return nil, &domain.InvalidCredentialsError{}
        }

        // 1. Récupérer l'utilisateur
        user, err := uc.authRepo.FindUserForAuth(ctx, req.Identifier)
        if err != nil {
                if _, ok := err.(*domain.NotFoundError); ok {
                        return nil, &domain.InvalidCredentialsError{}
                }
                return nil, fmt.Errorf("find user for auth: %w", err)
        }

        // 2. Vérifier verrouillage
        // U16 (HIGH): auto-reset loginAttempts/lockedUntil si le lockout a expiré.
        // Avant ce fix, après 5 échecs l'user avait 1 essai / 15min à vie : si le
        // password était faux, loginAttempts passait à 6 → re-lock 15min → boucle infinie.
        // Maintenant, si lockedUntil est dans le passé, on reset avant de tester le password.
        if user.LockedUntil != nil && !user.LockedUntil.After(time.Now()) {
                // Lockout expiré → reset loginAttempts + lockedUntil
                _ = uc.authRepo.UpdateLoginSuccess(ctx, user.ID)
                user.LoginAttempts = 0
                user.LockedUntil = nil
        }
        if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
                _ = uc.audit(ctx, strPtr(user.ID), strPtr(user.Email), domain.AuditActionLoginLocked, ip, map[string]any{
                        "lockedUntil": user.LockedUntil,
                })
                return nil, &domain.AccountLockedError{LockedUntil: *user.LockedUntil}
        }

        // 3. Vérifier mot de passe
        if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
                // Incrémenter les tentatives
                attempts, _ := uc.authRepo.IncrementLoginAttempts(ctx, user.ID, MaxLoginAttempts, LockDuration)
                _ = uc.audit(ctx, strPtr(user.ID), strPtr(user.Email), domain.AuditActionLoginFailed, ip, map[string]any{
                        "attempts":    attempts,
                        "identifier":  req.Identifier,
                        "maxAttempts": MaxLoginAttempts,
                })
                return nil, &domain.InvalidCredentialsError{}
        }

        // 4. Vérifier que le compte est actif
        if !user.Actif {
                _ = uc.audit(ctx, strPtr(user.ID), strPtr(user.Email), domain.AuditActionLoginFailed, ip, map[string]any{
                        "reason": "account_disabled",
                })
                return nil, &domain.AccountDisabledError{}
        }

        // 5. Login réussi : reset attempts, update derniereConnexion
        if err := uc.authRepo.UpdateLoginSuccess(ctx, user.ID); err != nil {
                return nil, fmt.Errorf("update login success: %w", err)
        }

        // 6. Créer refresh token
        refreshPlaintext, refreshHash, err := jwt.GenerateRefreshToken()
        if err != nil {
                return nil, fmt.Errorf("generate refresh token: %w", err)
        }

        rt := &domain.RefreshToken{
                ID:        generateID(),
                UserID:    user.ID,
                TokenHash: refreshHash,
                ExpiresAt: time.Now().Add(jwt.RefreshTokenTTL),
                CreatedAt: time.Now(),
                UserAgent: userAgent,
                IP:        ip,
        }
        if err := uc.authRepo.CreateRefreshToken(ctx, rt); err != nil {
                return nil, fmt.Errorf("create refresh token: %w", err)
        }

        // 7. Émettre access token
        claims := sessionClaimsFromUser(user)
        accessToken, expiresAt, err := uc.signer.GenerateAccessToken(claims, user.Email, user.Name)
        if err != nil {
                return nil, fmt.Errorf("generate access token: %w", err)
        }

        // 8. Audit log
        _ = uc.audit(ctx, strPtr(user.ID), strPtr(user.Email), domain.AuditActionLogin, ip, map[string]any{
                "role":        user.Role,
                "loginMethod": loginMethod(req.Identifier),
        })

        return &LoginResponse{
                User:         user.User,
                AccessToken:  accessToken,
                RefreshToken: refreshPlaintext,
                ExpiresAt:    expiresAt,
        }, nil
}

// RefreshRequest est le payload de /api/auth/refresh.
type RefreshRequest struct {
        RefreshToken string `json:"refreshToken"`
}

// Refresh valide un refresh token et émet un nouveau token pair.
// L'ancien refresh token est révoqué (rotation).
func (uc *AuthUseCase) Refresh(ctx context.Context, req RefreshRequest, ip, userAgent string) (*LoginResponse, error) {
        if req.RefreshToken == "" {
                return nil, &domain.InvalidTokenError{Reason: "empty token"}
        }

        // 1. Hasher le refresh token et le chercher en base
        hash := jwt.HashRefreshToken(req.RefreshToken)
        rt, err := uc.authRepo.FindRefreshTokenByHash(ctx, hash)
        if err != nil {
                if _, ok := err.(*domain.NotFoundError); ok {
                        return nil, &domain.InvalidTokenError{Reason: "not found"}
                }
                return nil, fmt.Errorf("find refresh token: %w", err)
        }

        // 2. Vérifier qu'il est valide
        if !rt.IsValid() {
                return nil, &domain.InvalidTokenError{Reason: "revoked or expired"}
        }

        // 3. Récupérer l'utilisateur
        user, err := uc.authRepo.GetUserByID(ctx, rt.UserID)
        if err != nil {
                return nil, fmt.Errorf("get user by id: %w", err)
        }

        // 4. Vérifier actif
        if !user.Actif {
                return nil, &domain.AccountDisabledError{}
        }

        // 5. Révoquer l'ancien refresh token (rotation)
        if err := uc.authRepo.RevokeRefreshToken(ctx, rt.ID); err != nil {
                return nil, fmt.Errorf("revoke old refresh token: %w", err)
        }

        // 6. Créer un nouveau refresh token
        newRefreshPlaintext, newRefreshHash, err := jwt.GenerateRefreshToken()
        if err != nil {
                return nil, fmt.Errorf("generate refresh token: %w", err)
        }
        newRT := &domain.RefreshToken{
                ID:        generateID(),
                UserID:    user.ID,
                TokenHash: newRefreshHash,
                ExpiresAt: time.Now().Add(jwt.RefreshTokenTTL),
                CreatedAt: time.Now(),
                UserAgent: userAgent,
                IP:        ip,
        }
        if err := uc.authRepo.CreateRefreshToken(ctx, newRT); err != nil {
                return nil, fmt.Errorf("create refresh token: %w", err)
        }

        // 7. Nouvel access token
        claims := sessionClaimsFromUser(user)
        accessToken, expiresAt, err := uc.signer.GenerateAccessToken(claims, user.Email, user.Name)
        if err != nil {
                return nil, fmt.Errorf("generate access token: %w", err)
        }

        // 8. Audit
        _ = uc.audit(ctx, strPtr(user.ID), strPtr(user.Email), domain.AuditActionRefreshToken, ip, nil)

        return &LoginResponse{
                User:         user.User,
                AccessToken:  accessToken,
                RefreshToken: newRefreshPlaintext,
                ExpiresAt:    expiresAt,
        }, nil
}

// Logout révoque le refresh token fourni. L'access token reste valide jusqu'à expiration
// (stateless) — le client doit le supprimer côté frontend.
func (uc *AuthUseCase) Logout(ctx context.Context, refreshToken, ip string) error {
        if refreshToken == "" {
                return nil // no-op
        }

        hash := jwt.HashRefreshToken(refreshToken)
        rt, err := uc.authRepo.FindRefreshTokenByHash(ctx, hash)
        if err != nil {
                // Token déjà invalide ou inexistant → logout silencieux
                return nil
        }

        if err := uc.authRepo.RevokeRefreshToken(ctx, rt.ID); err != nil {
                return fmt.Errorf("revoke refresh token: %w", err)
        }

        _ = uc.audit(ctx, &rt.UserID, nil, domain.AuditActionLogout, ip, nil)
        return nil
}

// ChangePasswordRequest est le payload de /api/auth/change-password.
type ChangePasswordRequest struct {
        CurrentPassword string `json:"currentPassword"`
        NewPassword     string `json:"newPassword"`
}

// ChangePassword vérifie l'ancien mot de passe et en définit un nouveau.
// Révoque tous les refresh tokens existants (sécurité — force re-login autres sessions).
func (uc *AuthUseCase) ChangePassword(ctx context.Context, userID string, req ChangePasswordRequest, ip string) error {
        if req.CurrentPassword == "" || req.NewPassword == "" {
                return &domain.InvalidCredentialsError{}
        }
        if len(req.NewPassword) < 8 {
                return fmt.Errorf("new password too short (min 8 chars)")
        }

        // 1. Récupérer l'utilisateur avec son hash
        user, err := uc.authRepo.GetUserByID(ctx, userID)
        if err != nil {
                return fmt.Errorf("get user: %w", err)
        }

        // 2. Vérifier l'ancien mot de passe
        if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword)); err != nil {
                return &domain.InvalidCredentialsError{}
        }

        // 3. Hasher le nouveau
        hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), BcryptCost)
        if err != nil {
                return fmt.Errorf("hash password: %w", err)
        }

        // 4. Mettre à jour
        if err := uc.authRepo.UpdatePassword(ctx, userID, string(hash)); err != nil {
                return fmt.Errorf("update password: %w", err)
        }

        // 5. Révoquer tous les refresh tokens (force re-login)
        if err := uc.authRepo.RevokeAllUserRefreshTokens(ctx, userID); err != nil {
                return fmt.Errorf("revoke refresh tokens: %w", err)
        }

        // 6. Audit
        _ = uc.audit(ctx, &userID, &user.Email, domain.AuditActionChangePassword, ip, nil)

        return nil
}

// --- Helpers ---

func (uc *AuthUseCase) audit(ctx context.Context, userID *string, userEmail *string, action, ip string, details map[string]any) error {
        var detailsStr string
        if details != nil {
                detailsStr = MarshalDetails(details)
        }
        return uc.authRepo.CreateAuditLog(ctx, &domain.AuditLogEntry{
                UserID:    userID,
                UserEmail: userEmail,
                Action:    action,
                Entite:    "User",
                EntiteID:  userID,
                Details:   detailsStr,
                AdresseIP: ip,
        })
}

func sessionClaimsFromUser(u *domain.AuthUser) db.SessionClaims {
        return db.SessionClaims{
                UserID:          u.ID,
                Role:            string(u.Role),
                EtablissementID: derefString(u.EtablissementID),
                FiliereID:       derefString(u.FiliereID),
                MustChangePwd:   u.MustChangePwd, // U3
        }
}

func loginMethod(identifier string) string {
        if isEmail(identifier) {
                return "email"
        }
        return "matricule"
}

func isEmail(s string) bool {
        for _, c := range s {
                if c == '@' {
                        return true
                }
        }
        return false
}

func derefString(p *string) string {
        if p == nil {
                return ""
        }
        return *p
}

func strPtr(s string) *string {
        return &s
}

func generateID() string {
        return uuid.NewString()
}
