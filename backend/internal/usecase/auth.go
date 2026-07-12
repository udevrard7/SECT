// Package usecase — logique métier d'authentification.
package usecase

import (
        "context"
        "crypto/rand"
        "crypto/sha256"
        "encoding/base64"
        "encoding/hex"
        "encoding/json"
        "fmt"
        "time"

        "github.com/google/uuid"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/emailtpl"
        "github.com/udevrard7/sect/backend/internal/jwt"
        "github.com/udevrard7/sect/backend/internal/mailer"
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

        // PasswordResetTokenTTL : durée de validité d'un lien de reset (30 min).
        PasswordResetTokenTTL = 30 * time.Minute
        // resetTokenLen : nombre d'octets aléatoires du token (32 → 256 bits d'entropie).
        resetTokenLen = 32
)

// AuthUseCase implémente les cas d'usage d'authentification.
type AuthUseCase struct {
        authRepo   domain.AuthRepository
        signer     *jwt.Signer
        mailer     mailer.Mailer
        appBaseURL string
}

// NewAuthUseCase crée un nouveau AuthUseCase.
// mailer peut être un SMTPMailer (production) ou un LogMailer (dev/fallback).
// appBaseURL sert à construire le lien de reset (ex: https://sect-app.vercel.app).
func NewAuthUseCase(authRepo domain.AuthRepository, signer *jwt.Signer, ml mailer.Mailer, appBaseURL string) *AuthUseCase {
        return &AuthUseCase{authRepo: authRepo, signer: signer, mailer: ml, appBaseURL: appBaseURL}
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
//
// U10 (HIGH) : utilise RevokeRefreshTokenByHashIfActive (UPDATE atomique) au lieu
// de FindRefreshTokenByHash + RevokeRefreshToken (deux queries séparées). Avant ce
// fix, deux requêtes concurrentes avec le même refresh token pouvaient toutes les
// deux passer le check IsValid, puis révoquer chacune → deux nouveaux tokens valides
// (race condition). Maintenant, seule la première requête gagne (UPDATE affecte 1 row) ;
// la deuxième obtient nil → InvalidTokenError.
func (uc *AuthUseCase) Refresh(ctx context.Context, req RefreshRequest, ip, userAgent string) (*LoginResponse, error) {
        if req.RefreshToken == "" {
                return nil, &domain.InvalidTokenError{Reason: "empty token"}
        }

        // 1. Hasher le refresh token
        hash := jwt.HashRefreshToken(req.RefreshToken)

        // 2. U10 : UPDATE atomique — révoque le token ET le retourne seulement s'il
        // était encore actif. Évite la race condition.
        rt, err := uc.authRepo.RevokeRefreshTokenByHashIfActive(ctx, hash)
        if err != nil {
                return nil, fmt.Errorf("revoke refresh token if active: %w", err)
        }
        if rt == nil {
                return nil, &domain.InvalidTokenError{Reason: "not found, revoked, or already used"}
        }

        // 3. Vérifier qu'il n'est pas expiré. Note : on ne check pas IsRevoked()
        // ici car le token vient d'être révoqué par RevokeRefreshTokenByHashIfActive
        // (revokedAt est maintenant non-nil). La rotation est le comportement attendu.
        // Si le token était déjà révoqué avant, rt serait nil (UPDATE n'aurait matché aucune row).
        if rt.IsExpired() {
                return nil, &domain.InvalidTokenError{Reason: "expired"}
        }

        // 4. Récupérer l'utilisateur
        user, err := uc.authRepo.GetUserByID(ctx, rt.UserID)
        if err != nil {
                return nil, fmt.Errorf("get user by id: %w", err)
        }

        // 5. Vérifier actif
        if !user.Actif {
                return nil, &domain.AccountDisabledError{}
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
//
// U13 (HIGH) : validation password — min 8 chars + new ≠ current (empêche de
// "changer" par le même password, contournant une politique d'expiration).
// U28 (LOW) : l'erreur "new password too short" retournait fmt.Errorf (non typée)
// → MapDomainError default → 500. Maintenant ValidationError → 400.
func (uc *AuthUseCase) ChangePassword(ctx context.Context, userID string, req ChangePasswordRequest, ip string) error {
        if req.CurrentPassword == "" || req.NewPassword == "" {
                return &domain.InvalidCredentialsError{}
        }
        // U28 : ValidationError (pas fmt.Errorf) pour avoir un 400 au lieu de 500.
        if len(req.NewPassword) < 8 {
                return &domain.ValidationError{Field: "newPassword", Message: "minimum 8 caractères"}
        }
        // U13 : refuser new == current (empêche le contournement de politique d'expiration).
        if req.NewPassword == req.CurrentPassword {
                return &domain.ValidationError{Field: "newPassword", Message: "le nouveau mot de passe doit être différent de l'actuel"}
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

// --- Mot de passe oublié (self-service reset) ---

// RequestPasswordReset génère un token de reset et envoie l'email.
//
// Sécurité anti-énumération : retourne TOUJOURS nil (succès) même si l'email
// n'existe pas. L'appelant renvoie un message générique "si un compte existe,
// un email a été envoyé". Ainsi un attaquant ne peut pas deviner quels emails
// sont enregistrés. On logge quand même les emails introuvables pour monitoring.
func (uc *AuthUseCase) RequestPasswordReset(ctx context.Context, email, ip, userAgent string) error {
        // 1. Chercher l'utilisateur par email (bypass RLS via find_user_for_auth).
        //    On ne traite que les emails (pas les matricules) pour le reset.
        user, err := uc.authRepo.FindUserForAuth(ctx, email)
        if err != nil {
                // Utilisateur introuvable → on ne fait rien, mais on retourne nil
                // (anti-énumération). Pas d'audit pour éviter le bruit / le flooding.
                return nil
        }

        // 2. Vérifier que le compte est actif (un compte désactivé ne peut pas reset).
        if !user.Actif {
                return nil // silencieux (anti-énumération)
        }

        // 3. Générer le token (32 octets → base64url, ~256 bits d'entropie).
        plaintext, hash, err := generateResetToken()
        if err != nil {
                return fmt.Errorf("generate reset token: %w", err)
        }

        // 4. Persister le hash en base.
        t := &domain.PasswordResetToken{
                ID:        generateID(),
                UserID:    user.ID,
                TokenHash: hash,
                ExpiresAt: time.Now().Add(PasswordResetTokenTTL),
                IP:        ip,
                UserAgent: userAgent,
        }
        if err := uc.authRepo.CreatePasswordResetToken(ctx, t); err != nil {
                return fmt.Errorf("create password reset token: %w", err)
        }

        // 5. Construire le lien + envoyer l'email (template HTML "Savane EdTech").
        resetLink := uc.appBaseURL + "/reset-password?token=" + plaintext
        tplData := emailtpl.PasswordResetData{
                EmailData:   emailtpl.DefaultData(user.Name, uc.appBaseURL),
                ResetLink:   resetLink,
                TTLMinutes:  int(PasswordResetTokenTTL.Minutes()),
        }
        htmlBody := emailtpl.PasswordResetHTML(tplData)
        textBody := emailtpl.PasswordResetText(tplData)

        if err := uc.mailer.Send(mailer.Email{
                To:      user.Email,
                Subject: "SECT — Réinitialisation de votre mot de passe",
                Body:    textBody,
                HTML:    htmlBody,
        }); err != nil {
                return fmt.Errorf("send reset email: %w", err)
        }

        // 6. Audit
        _ = uc.audit(ctx, &user.ID, &user.Email, domain.AuditActionPasswordResetRequested, ip, map[string]any{
                "expiresAt": t.ExpiresAt,
        })

        return nil
}

// ConfirmPasswordReset valide le token et définit le nouveau mot de passe.
//
// Étapes :
//  1. Hasher le token reçu, récupérer la ligne (non utilisée).
//  2. Vérifier non expiré.
//  3. Valider le nouveau mot de passe (min 8 chars).
//  4. Hasher bcrypt + update_password (SECURITY DEFINER).
//  5. Marquer le token utilisé + invalider les autres tokens du user.
//  6. Révoquer tous les refresh tokens (force re-login, comme ChangePassword).
//  7. Audit.
func (uc *AuthUseCase) ConfirmPasswordReset(ctx context.Context, token, newPassword, ip string) error {
        if token == "" {
                return &domain.InvalidTokenError{Reason: "empty token"}
        }
        if len(newPassword) < 8 {
                return &domain.ValidationError{Field: "newPassword", Message: "minimum 8 caractères"}
        }

        // 1. Hasher + lookup
        hash := hashResetToken(token)
        t, err := uc.authRepo.FindPasswordResetTokenByHash(ctx, hash)
        if err != nil {
                if _, ok := err.(*domain.NotFoundError); ok {
                        return &domain.InvalidTokenError{Reason: "not found or already used"}
                }
                return fmt.Errorf("find password reset token: %w", err)
        }

        // 2. Vérifier expiration
        if t.IsExpired() {
                return &domain.InvalidTokenError{Reason: "expired"}
        }

        // 3. Récupérer l'utilisateur (pour audit + vérifier actif)
        user, err := uc.authRepo.GetUserByID(ctx, t.UserID)
        if err != nil {
                return fmt.Errorf("get user: %w", err)
        }
        if !user.Actif {
                return &domain.AccountDisabledError{}
        }

        // 4. Hasher + update password
        bhash, err := bcrypt.GenerateFromPassword([]byte(newPassword), BcryptCost)
        if err != nil {
                return fmt.Errorf("hash password: %w", err)
        }
        if err := uc.authRepo.UpdatePassword(ctx, t.UserID, string(bhash)); err != nil {
                return fmt.Errorf("update password: %w", err)
        }

        // 5. Marquer le token utilisé + invalider les autres tokens du user
        if err := uc.authRepo.MarkPasswordResetTokenUsed(ctx, t.ID); err != nil {
                return fmt.Errorf("mark token used: %w", err)
        }
        if err := uc.authRepo.InvalidateUserPasswordResetTokens(ctx, t.UserID); err != nil {
                // Non bloquant : le reset a réussi, on logge juste.
                _ = err
        }

        // 6. Révoquer tous les refresh tokens (force re-login autres sessions)
        if err := uc.authRepo.RevokeAllUserRefreshTokens(ctx, t.UserID); err != nil {
                _ = err // non bloquant
        }

        // 7. Audit
        _ = uc.audit(ctx, &t.UserID, &user.Email, domain.AuditActionPasswordResetConfirmed, ip, nil)

        return nil
}

// generateResetToken crée un token de reset aléatoire (clair) + son hash SHA-256.
// Le token en clair est encodé en base64url (URL-safe pour les query params).
func generateResetToken() (plaintext string, hash string, err error) {
        buf := make([]byte, resetTokenLen)
        if _, err := rand.Read(buf); err != nil {
                return "", "", fmt.Errorf("generate random: %w", err)
        }
        plaintext = base64.RawURLEncoding.EncodeToString(buf)
        hash = hashResetToken(plaintext)
        return plaintext, hash, nil
}

// hashResetToken calcule le hash SHA-256 (hex) d'un token de reset.
// Même approche que jwt.HashRefreshToken (cohérence avec les refresh tokens).
func hashResetToken(plaintext string) string {
        h := sha256.Sum256([]byte(plaintext))
        return hex.EncodeToString(h[:])
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

// IssueNewTokens génère une nouvelle paire de tokens (access + refresh) pour
// un utilisateur donné. Utilisé par le mode assistance (ASSISTANCE-MODE) pour
// émettre un nouveau JWT avec un etablissementId différent, sans re-login.
func (uc *AuthUseCase) IssueNewTokens(ctx context.Context, userID, role, etablissementID, email, name string, mustChangePwd bool) (accessToken, refreshToken string, expiresAt time.Time, err error) {
        claims := db.SessionClaims{
                UserID:          userID,
                Role:            role,
                EtablissementID: etablissementID,
                MustChangePwd:   mustChangePwd,
        }

        accessToken, expiresAt, err = uc.signer.GenerateAccessToken(claims, email, name)
        if err != nil {
                return "", "", time.Time{}, fmt.Errorf("generate access token: %w", err)
        }

        refreshPlaintext, refreshHash, err := jwt.GenerateRefreshToken()
        if err != nil {
                return "", "", time.Time{}, fmt.Errorf("generate refresh token: %w", err)
        }

        rt := &domain.RefreshToken{
                ID:        generateID(),
                UserID:    userID,
                TokenHash: refreshHash,
                ExpiresAt: time.Now().Add(jwt.RefreshTokenTTL), // refresh expire dans 7 jours
        }
        if err := uc.authRepo.CreateRefreshToken(ctx, rt); err != nil {
                return "", "", time.Time{}, fmt.Errorf("create refresh token: %w", err)
        }

        return accessToken, refreshPlaintext, expiresAt, nil
}
