// Package domain — entités et ports liés à l'authentification.
package domain

import (
        "context"
        "time"
)

// Credentials représente les identifiants de connexion.
// Identifier accepte un email OU un matricule (le repository détermine lequel).
type Credentials struct {
        Identifier string `json:"identifier"` // email ou matricule
        Password   string `json:"password"`
}

// AuthSession est le résultat d'un login réussi.
type AuthSession struct {
        User         User      `json:"user"`
        AccessToken  string    `json:"accessToken"`  // JWT court (15 min)
        RefreshToken string    `json:"refreshToken"` // token long (7 jours) — en clair, hashé en DB
        ExpiresAt    time.Time `json:"expiresAt"`    // expiration de l'access token
}

// RefreshToken est l'entité persistée en base (jamais renvoyée au client).
type RefreshToken struct {
        ID        string
        UserID    string
        TokenHash string // SHA-256 du refresh token
        ExpiresAt time.Time
        RevokedAt *time.Time // nil = actif
        CreatedAt time.Time
        UserAgent string
        IP        string
}

// IsRevoked retourne true si le token a été révoqué.
func (rt *RefreshToken) IsRevoked() bool {
        return rt.RevokedAt != nil
}

// IsExpired retourne true si le token a expiré.
func (rt *RefreshToken) IsExpired() bool {
        return time.Now().After(rt.ExpiresAt)
}

// IsValid retourne true si le token est utilisable (non révoqué + non expiré).
func (rt *RefreshToken) IsValid() bool {
        return !rt.IsRevoked() && !rt.IsExpired()
}

// AuthRepository définit l'interface pour les opérations d'authentification.
type AuthRepository interface {
        // FindUserForAuth récupère un utilisateur par email OU matricule,
        // avec tous les champs nécessaires à l'auth (password, loginAttempts, lockedUntil).
        // Contourne RLS (appelé avant pose des claims).
        FindUserForAuth(ctx context.Context, identifier string) (*AuthUser, error)

        // UpdateLoginSuccess met à jour l'utilisateur après un login réussi :
        // reset loginAttempts=0, lockedUntil=NULL, derniereConnexion=now.
        UpdateLoginSuccess(ctx context.Context, userID string) error

        // IncrementLoginAttempts incrémente loginAttempts et, si le seuil est atteint,
        // pose lockedUntil = now + lockDuration. Retourne le nouveau count.
        IncrementLoginAttempts(ctx context.Context, userID string, maxAttempts int, lockDuration time.Duration) (int, error)

        // CreateRefreshToken insère un nouveau refresh token (hashé) en base.
        CreateRefreshToken(ctx context.Context, rt *RefreshToken) error

        // FindRefreshTokenByHash récupère un refresh token par son hash.
        // Retourne nil + NotFoundError si introuvable.
        FindRefreshTokenByHash(ctx context.Context, hash string) (*RefreshToken, error)

        // RevokeRefreshToken marque un refresh token comme révoqué (revokedAt = now).
        RevokeRefreshToken(ctx context.Context, tokenID string) error

        // RevokeRefreshTokenByHashIfActive (U10) : UPDATE atomique qui ne retourne
        // le token que s'il était encore actif (revokedAt IS NULL). Permet d'éviter
        // la race condition où deux requêtes concurrentes passent le check
        // FindRefreshTokenByHash puis révoquent chacune (→ deux nouveaux tokens valides).
        // Avec cette méthode, seule la première requête gagne ; la deuxième obtient
        // nil → InvalidTokenError.
        RevokeRefreshTokenByHashIfActive(ctx context.Context, hash string) (*RefreshToken, error)

        // RevokeAllUserRefreshTokens révoque tous les refresh tokens actifs d'un utilisateur.
        RevokeAllUserRefreshTokens(ctx context.Context, userID string) error

        // CreateAuditLog insère une entrée dans le journal d'audit.
        CreateAuditLog(ctx context.Context, entry *AuditLogEntry) error

        // GetUserByID récupère un utilisateur par son ID (avec champs auth).
        GetUserByID(ctx context.Context, userID string) (*AuthUser, error)

        // UpdatePassword met à jour le hash du mot de passe + reset mustChangePwd + reset attempts.
        UpdatePassword(ctx context.Context, userID string, passwordHash string) error

        // ResetPassword (U5) : reset complet pour admin reset — hash + loginAttempts=0 +
        // lockedUntil=NULL + mustChangePwd=true (force l'user à changer au prochain login).
        // Différent de UpdatePassword qui set mustChangePwd=false (changement volontaire par l'user).
        ResetPassword(ctx context.Context, userID string, passwordHash string) error

        // UnlockAccount (U5) : déverrouille un compte sans changer le password.
        // Reset loginAttempts=0 + lockedUntil=NULL. Pour les cas où l'admin veut juste
        // débloquer sans reset le password (ex: user a oublié mais admin veut lui donner
        // une chance de se souvenir).
        UnlockAccount(ctx context.Context, userID string) error
}

// AuthUser est l'entité User avec les champs sensibles nécessaires à l'auth.
// Séparé de User pour éviter d'exposer le password hash dans l'API.
type AuthUser struct {
        User
        Password          string // bcrypt hash
        LoginAttempts     int
        LockedUntil       *time.Time
        DerniereConnexion *time.Time
}

// AuditLogEntry représente une entrée du journal d'audit.
type AuditLogEntry struct {
        UserID    *string
        UserEmail *string
        Action    string // LOGIN, LOGOUT, LOGIN_FAILED, CHANGE_PASSWORD, etc.
        Entite    string // User, Etablissement, etc.
        EntiteID  *string
        Details   string // JSON string
        AdresseIP string
}

// Actions d'audit standardisées
const (
        AuditActionLogin          = "LOGIN"
        AuditActionLoginFailed    = "LOGIN_FAILED"
        AuditActionLoginLocked    = "LOGIN_LOCKED"
        AuditActionLogout         = "LOGOUT"
        AuditActionRefreshToken   = "TOKEN_REFRESHED"
        AuditActionChangePassword = "CHANGE_PASSWORD"
        AuditActionPasswordReset  = "PASSWORD_RESET"
)

// Erreurs spécifiques à l'auth
type InvalidCredentialsError struct{}

func (e *InvalidCredentialsError) Error() string { return "identifiants incorrects" }

type AccountDisabledError struct{}

func (e *AccountDisabledError) Error() string { return "compte désactivé" }

type AccountLockedError struct {
        LockedUntil time.Time
}

func (e *AccountLockedError) Error() string { return "compte temporairement verrouillé" }

type MustChangePasswordError struct{}

func (e *MustChangePasswordError) Error() string { return "changement de mot de passe requis" }

type InvalidTokenError struct {
        Reason string
}

func (e *InvalidTokenError) Error() string { return "token invalide: " + e.Reason }
