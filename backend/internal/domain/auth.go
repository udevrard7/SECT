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

// PasswordResetToken est l'entité persistée pour le reset "mot de passe oublié".
// Analogie avec RefreshToken : seul le HASH SHA-256 du token est stocké en DB.
type PasswordResetToken struct {
	ID        string
	UserID    string
	TokenHash string // SHA-256 du token en clair
	ExpiresAt time.Time
	UsedAt    *time.Time // nil = non utilisé
	CreatedAt time.Time
	IP        string
	UserAgent string
}

// IsUsed retourne true si le token a déjà été consommé.
func (t *PasswordResetToken) IsUsed() bool {
	return t.UsedAt != nil
}

// IsExpired retourne true si le token a expiré.
func (t *PasswordResetToken) IsExpired() bool {
	return time.Now().After(t.ExpiresAt)
}

// IsValid retourne true si le token est utilisable (non utilisé + non expiré).
func (t *PasswordResetToken) IsValid() bool {
	return !t.IsUsed() && !t.IsExpired()
}

// AuthRepository définit l'interface pour les opérations d'authentification.
type AuthRepository interface {
	// FindUserForAuth récupère un utilisateur par email OU matricule,
	// avec tous les champs nécessaires à l'auth (password, loginAttempts, lockedUntil).
	// Contourne RLS (appelé avant pose des claims).
	FindUserForAuth(ctx context.Context, identifier string) (*AuthUser, error)

	// FindUsersForAuth (SECT-B2C-MULTI-ETAB) récupère TOUS les comptes
	// correspondant à un email (multi-établissements B2C).
	FindUsersForAuth(ctx context.Context, identifier string) ([]MultiAccountInfo, error)

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

	// --- Password reset ("mot de passe oublié") ---

	// CreatePasswordResetToken insère un nouveau token de reset (hashé) en base.
	CreatePasswordResetToken(ctx context.Context, t *PasswordResetToken) error

	// FindPasswordResetTokenByHash récupère un token de reset par son hash.
	// Ne retourne que les tokens non utilisés. Retourne nil + NotFoundError
	// si introuvable (ou déjà utilisé).
	FindPasswordResetTokenByHash(ctx context.Context, hash string) (*PasswordResetToken, error)

	// MarkPasswordResetTokenUsed marque un token de reset comme utilisé (usedAt = now).
	MarkPasswordResetTokenUsed(ctx context.Context, tokenID string) error

	// InvalidateUserPasswordResetTokens marque tous les tokens non utilisés
	// d'un utilisateur comme utilisés (un token consommé invalide les autres).
	InvalidateUserPasswordResetTokens(ctx context.Context, userID string) error

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

	// GetPendingAbonnementByEtablissementID (SECT-GENIUSPAY-WAVE-SECURITY +
	// SECT-B2C-EXPIRE) : retourne l'ID + reason de l'abonnement bloquant le login.
	// reason = "pending" (EN_ATTENTE_PAIEMENT) ou "expired" (EXPIRE / dateFin < NOW).
	// Retourne ("", "", nil) si aucun → login OK.
	GetPendingAbonnementByEtablissementID(ctx context.Context, etablissementID string) (abonnementID string, reason string, err error)
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

// MultiAccountInfo — compte résumé pour le choix multi-établissement (B2C).
// SECT-B2C-MULTI-ETAB : quand un étudiant a des comptes dans plusieurs étab B2C,
// le login retourne cette liste pour que le frontend affiche une page de choix.
type MultiAccountInfo struct {
	UserID           string `json:"userId"`
	Email            string `json:"email"`
	Name             string `json:"name"`
	Role             string `json:"role"`
	EtablissementID  string `json:"etablissementId"`
	EtablissementNom string `json:"etablissementNom"`
}

// AuditLogEntry représente une entrée du journal d'audit.
//
// Champs WRITE (CreateAuditLog) : UserID, UserEmail, Action, Entite, EntiteID,
// Details, AdresseIP, EtablissementID, Reason. Ces champs sont persistés en DB.
//
// Champs READ (ListByEtablissement) : ID + CreatedAt sont renseignés
// uniquement par les méthodes de lecture (récupérés depuis la DB). Ils sont
// ignorés par CreateAuditLog (l'ID est généré via uuid.NewString() et le
// createdAt via CURRENT_TIMESTAMP côté SQL).
type AuditLogEntry struct {
	// Champs persistés (write path).
	UserID          *string
	UserEmail       *string
	Action          string // LOGIN, LOGOUT, LOGIN_FAILED, CHANGE_PASSWORD, etc.
	Entite          string // User, Etablissement, etc.
	EntiteID        *string
	Details         string // JSON string
	AdresseIP       string
	EtablissementID *string
	Reason          string

	// Champs de lecture seule (read path — populés par ListByEtablissement).
	ID        string
	CreatedAt time.Time
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

	// Self-service "mot de passe oublié" (000054)
	AuditActionPasswordResetRequested = "PASSWORD_RESET_REQUESTED"
	AuditActionPasswordResetConfirmed = "PASSWORD_RESET_CONFIRMED"

	// SECT-ETABLISSEMENT-AUDIT-1 — actions sur les liens d'inscription
	// étudiante (StudentSignupLink). La révocation est initiée par un
	// RESPONSABLE (ou ENSEIGNANT/ADMIN) et doit être journalisée AVEC
	// l'établissement + la raison optionnelle saisie dans le dialog de
	// confirmation côté frontend.
	AuditActionSignupLinkCreated = "SIGNUP_LINK_CREATED"
	AuditActionSignupLinkRevoked = "SIGNUP_LINK_REVOKED"
)

// Erreurs spécifiques à l'auth
type InvalidCredentialsError struct{}

func (e *InvalidCredentialsError) Error() string { return "identifiants incorrects" }

type AccountDisabledError struct{}

func (e *AccountDisabledError) Error() string { return "compte désactivé" }

// PaymentPendingError — SECT-GENIUSPAY-WAVE-SECURITY : levé quand un utilisateur
// B2C (Prof Premium) tente de se connecter alors que son abonnement bloque l'accès.
// Le frontend utilise AbonnementID + Reason pour rediriger vers la bonne page :
//   - Reason="pending"  → /paiement/retry (jamais payé, EN_ATTENTE_PAIEMENT)
//   - Reason="expired"  → /abonnement-expire (expiré, renouvellement ou downgrade)
type PaymentPendingError struct {
	AbonnementID string
	// Reason : "pending" (EN_ATTENTE_PAIEMENT) ou "expired" (EXPIRE / dateFin < NOW)
	Reason string
}

func (e *PaymentPendingError) Error() string {
	return "paiement en attente — finalisez votre paiement pour activer votre compte"
}

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
