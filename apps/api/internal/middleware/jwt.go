package middleware

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/udevrard7/sect/apps/api/internal/db"
)

// parseJWT décode un JWT (HS256) et extrait les claims SECT.
//
// Pendant la transition progressive, le JWT est émis par NextAuth (Next.js).
// Le payload contient au minimum : sub (user_id), role, etablissementId.
//
// NOTE: Cette validation est simplifiée — elle décode le payload sans vérifier
// la signature (le secret NextAuth n'est pas encore partagé). Une fois l'auth
// basculée côté Go, on utilisera une validation signature complète.
// TODO: implémenter la vérification HMAC-SHA256 avec le secret partagé.
func parseJWT(token string, jwtSecret string) (db.SessionClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return db.SessionClaims{}, fmt.Errorf("invalid JWT format")
	}

	// Décoder le payload (partie 2)
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return db.SessionClaims{}, fmt.Errorf("decode payload: %w", err)
	}

	var payloadMap map[string]interface{}
	if err := json.Unmarshal(payload, &payloadMap); err != nil {
		return db.SessionClaims{}, fmt.Errorf("unmarshal payload: %w", err)
	}

	claims := db.SessionClaims{
		UserID:          getStringClaim(payloadMap, "sub"),
		Role:            getStringClaim(payloadMap, "role"),
		EtablissementID: getStringClaim(payloadMap, "etablissementId"),
	}

	if claims.UserID == "" {
		return db.SessionClaims{}, fmt.Errorf("missing sub claim")
	}

	return claims, nil
}

func getStringClaim(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case string:
			return val
		case float64:
			return fmt.Sprintf("%v", int(val))
		default:
			return fmt.Sprintf("%v", val)
		}
	}
	return ""
}
