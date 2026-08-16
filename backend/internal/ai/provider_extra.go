// Package ai — helpers pour parser extraConfig des providers IA.
//
// Bug #2 (CRITICAL, audit ai-providers 2025) : le champ extraConfig (JSON)
// stocke les credentials ZAI (apiKey, baseUrl, chatId, userId, token) mais
// getActiveProvider l'ignorait. Pour ZAI, le champ apiKey de AIProviderConfig
// est souvent NULL — c'est extraConfig.apiKey qui contient la vraie clé.
//
// BUG #8 fix: ActiveProvider est maintenant défini dans service.go (type canonique
// unique). Ce fichier ne conserve que les helpers de parsing extraConfig.
// Les fonctions mortes ApplyExtraConfig, ValidateProvider, isPublicProvider
// et le doublon ActiveProvider ont été supprimés.
package ai

import (
	"encoding/json"
)

// ExtraConfig est la structure JSON attendue dans AIProviderConfig.extraConfig.
// Tous les champs sont optionnels (le JSON peut contenir un sous-ensemble).
type ExtraConfig struct {
	APIKey   string `json:"apiKey"`
	BaseURL  string `json:"baseUrl"`
	ChatID   string `json:"chatId"`
	UserID   string `json:"userId"`
	Token    string `json:"token"`
	Provider string `json:"provider"` // pour debug
}

// ParseExtraConfig parse le champ extraConfig (TEXT JSON) d'AIProviderConfig.
// Retourne une structure vide si extraConfig est vide ou invalide (best-effort).
func ParseExtraConfig(raw string) ExtraConfig {
	var ec ExtraConfig
	if raw == "" {
		return ec
	}
	// Tolérant : si le JSON est invalide, on retourne une structure vide
	// plutôt que d'échouer (le provider peut fonctionner sans extraConfig).
	_ = json.Unmarshal([]byte(raw), &ec)
	return ec
}
