// Package ai — helpers pour parser extraConfig des providers IA.
//
// Bug #2 (CRITICAL, audit ai-providers 2025) : le champ extraConfig (JSON)
// stocke les credentials ZAI (apiKey, baseUrl, chatId, userId, token) mais
// getActiveProvider l'ignorait. Pour ZAI, le champ apiKey de AIProviderConfig
// est souvent NULL — c'est extraConfig.apiKey qui contient la vraie clé.
//
// Ce fichier fournit applyExtraConfig qui fusionne extraConfig dans la config
// du provider actif. Utilisé par AIService.getActiveProvider et worker.getActiveProviderShared.
package ai

import (
        "encoding/json"
        "fmt"
        "strings"
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

// ApplyExtraConfig fusionne extraConfig dans la config du provider actif.
//
// Règles :
//   - Si provider.APIKey est vide, utiliser extraConfig.APIKey (cas ZAI).
//   - Si provider.BaseURL est vide, utiliser extraConfig.BaseURL.
//   - Pour les providers ZAI, extraConfig peut contenir un token alternatif.
//
// Cette fonction ne modifie pas la config si extraConfig est vide.
func ApplyExtraConfig(p *ActiveProvider, extraConfigRaw string) {
        ec := ParseExtraConfig(extraConfigRaw)
        if ec.APIKey != "" && p.APIKey == "" {
                p.APIKey = ec.APIKey
        }
        if ec.BaseURL != "" && p.BaseURL == "" {
                p.BaseURL = ec.BaseURL
        }
}

// ActiveProvider est la projection d'une ligne AIProviderConfig lue depuis la DB.
// (Rendu public pour être partagé entre ai et worker packages via ce helper.)
type ActiveProvider struct {
        ID          string
        Name        string
        Provider    string
        BaseURL     string
        APIKey      string
        Model       string
        Temperature float64
        MaxTokens   int
        ExtraConfig string // raw JSON, pour debug/logging
        Capability  string // DASHSCOPE-AUDIO-1 : 'chat' (défaut), 'tts', 'audio'
}

// ValidateProvider vérifie qu'un provider a les champs requis pour fonctionner.
// Retourne une erreur descriptive si un champ critique manque.
func ValidateProvider(p *ActiveProvider) error {
        if p.Name == "" {
                return fmt.Errorf("provider: name manquant")
        }
        if p.Provider == "" {
                return fmt.Errorf("provider %s: type manquant", p.Name)
        }
        if p.BaseURL == "" {
                return fmt.Errorf("provider %s (%s): baseUrl manquant (vérifiez extraConfig pour ZAI)", p.Name, p.Provider)
        }
        // apiKey requise pour tous sauf providers publics (rare)
        if p.APIKey == "" && !isPublicProvider(p.Provider) {
                return fmt.Errorf("provider %s (%s): apiKey manquante (vérifiez extraConfig pour ZAI)", p.Name, p.Provider)
        }
        if p.Model == "" {
                return fmt.Errorf("provider %s (%s): model manquant", p.Name, p.Provider)
        }
        return nil
}

// isPublicProvider retourne true pour les providers qui ne nécessitent pas d'apiKey.
// (Aucun provider actuel n'est public, mais on garde l'extension pour l'avenir.)
func isPublicProvider(providerType string) bool {
        switch strings.ToUpper(providerType) {
        case "":
                return true
        default:
                return false
        }
}
