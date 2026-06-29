// Package jwt — émission et vérification de JWT HMAC-SHA256 natifs Go.
//
// Deux types de tokens :
//   - Access token  : 15 min, stateless, contient les claims (sub, role, etablissementId, ...)
//   - Refresh token : 7 jours, stateful (stocké hashé en DB), opaque (random)
//
// Le access token est signé avec JWT_SECRET (HMAC-SHA256).
// Le refresh token est un random de 64 bytes, hashé SHA-256 avant stockage.
package jwt

import (
        "crypto/hmac"
        "crypto/rand"
        "crypto/sha256"
        "encoding/base64"
        "encoding/hex"
        "encoding/json"
        "errors"
        "fmt"
        "strings"
        "time"

        "github.com/udevrard7/sect/backend/internal/db"
)

// Durées standards
const (
        AccessTokenTTL  = 15 * time.Minute
        RefreshTokenTTL = 7 * 24 * time.Hour
        RefreshTokenLen = 64 // longueur du refresh token en clair (bytes) → 128 chars hex
)

// Claims contient toutes les claims du access token JWT.
type Claims struct {
        Subject         string `json:"sub"`                  // user ID
        Role            string `json:"role"`                 // ADMIN/RESPONSABLE/ENSEIGNANT/ETUDIANT
        EtablissementID string `json:"etablissement_id"`     // '' pour ADMIN
        FiliereID       string `json:"filiere_id,omitempty"` // optionnel
        Email           string `json:"email"`
        Name            string `json:"name"`
        IssuedAt        int64  `json:"iat"`
        ExpiresAt       int64  `json:"exp"`
        TokenType       string `json:"typ"` // "access" ou "refresh"
        // U3 (CRITICAL) : MustChangePwd dans le JWT pour permettre au middleware
        // RequireAuth d'enforcer le changement de password obligatoire. Avant ce fix,
        // le flag était en DB mais non inclus dans le JWT → un user avec password
        // temporaire pouvait utiliser l'API indéfiniment (bypass du force-change-password).
        MustChangePwd bool `json:"must_change_pwd"`
}

// Signer gère l'émission et la vérification des JWT.
type Signer struct {
        secret []byte
}

// NewSigner crée un nouveau Signer avec le secret partagé.
func NewSigner(secret string) *Signer {
        return &Signer{secret: []byte(secret)}
}

// GenerateAccessToken crée un access token JWT signé.
func (s *Signer) GenerateAccessToken(claims db.SessionClaims, email, name string) (string, time.Time, error) {
        expiresAt := time.Now().Add(AccessTokenTTL)
        c := Claims{
                Subject:         claims.UserID,
                Role:            claims.Role,
                EtablissementID: claims.EtablissementID,
                FiliereID:       claims.FiliereID,
                Email:           email,
                Name:            name,
                IssuedAt:        time.Now().Unix(),
                ExpiresAt:       expiresAt.Unix(),
                TokenType:       "access",
                MustChangePwd:   claims.MustChangePwd, // U3
        }
        token, err := s.sign(c)
        if err != nil {
                return "", time.Time{}, err
        }
        return token, expiresAt, nil
}

// VerifyAccessToken vérifie signature + expiration et retourne les claims.
func (s *Signer) VerifyAccessToken(token string) (*Claims, error) {
        c, err := s.verify(token)
        if err != nil {
                return nil, err
        }
        if c.TokenType != "access" {
                return nil, fmt.Errorf("expected access token, got %s", c.TokenType)
        }
        if time.Now().Unix() >= c.ExpiresAt {
                return nil, errors.New("token expired")
        }
        return c, nil
}

// --- Refresh tokens (opaque, stateful) ---

// GenerateRefreshToken crée un refresh token aléatoire (clair) + son hash SHA-256.
func GenerateRefreshToken() (plaintext string, hash string, err error) {
        buf := make([]byte, RefreshTokenLen)
        if _, err := rand.Read(buf); err != nil {
                return "", "", fmt.Errorf("generate random: %w", err)
        }
        plaintext = hex.EncodeToString(buf)
        hash = HashRefreshToken(plaintext)
        return plaintext, hash, nil
}

// HashRefreshToken calcule le hash SHA-256 d'un refresh token.
func HashRefreshToken(plaintext string) string {
        h := sha256.Sum256([]byte(plaintext))
        return hex.EncodeToString(h[:])
}

// --- Implémentation interne ---

func (s *Signer) sign(c Claims) (string, error) {
        header := map[string]string{"alg": "HS256", "typ": "JWT"}
        headerJSON, err := json.Marshal(header)
        if err != nil {
                return "", fmt.Errorf("marshal header: %w", err)
        }
        payloadJSON, err := json.Marshal(c)
        if err != nil {
                return "", fmt.Errorf("marshal payload: %w", err)
        }

        encodedHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
        encodedPayload := base64.RawURLEncoding.EncodeToString(payloadJSON)
        signingInput := encodedHeader + "." + encodedPayload

        sig := s.hmacSha256([]byte(signingInput))
        encodedSig := base64.RawURLEncoding.EncodeToString(sig)

        return signingInput + "." + encodedSig, nil
}

func (s *Signer) verify(token string) (*Claims, error) {
        parts := strings.Split(token, ".")
        if len(parts) != 3 {
                return nil, errors.New("invalid token format")
        }

        signingInput := parts[0] + "." + parts[1]
        expectedSig := s.hmacSha256([]byte(signingInput))
        actualSig, err := base64.RawURLEncoding.DecodeString(parts[2])
        if err != nil {
                return nil, fmt.Errorf("decode signature: %w", err)
        }

        if !hmac.Equal(expectedSig, actualSig) {
                return nil, errors.New("invalid signature")
        }

        payload, err := base64.RawURLEncoding.DecodeString(parts[1])
        if err != nil {
                return nil, fmt.Errorf("decode payload: %w", err)
        }

        var c Claims
        if err := json.Unmarshal(payload, &c); err != nil {
                return nil, fmt.Errorf("unmarshal payload: %w", err)
        }

        return &c, nil
}

func (s *Signer) hmacSha256(data []byte) []byte {
        h := hmac.New(sha256.New, s.secret)
        h.Write(data)
        return h.Sum(nil)
}
