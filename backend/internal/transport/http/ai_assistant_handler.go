// Package http — handler pour POST /api/ai-assistant.
//
// AI-ASSISTANT-1 : endpoint de chat IA pour le frontend.
// Le frontend (BackendAIProvider) envoie POST /api/ai-assistant
// avec { message, context }. Le backend appelle le LLM actif
// (avec failover automatique) et retourne { response, model }.
package http

import (
	"encoding/json"
	"net/http"

	"github.com/udevrard7/sect/backend/internal/ai"
)

// ──────────────────────────────────────────────────────────────────────────
// POST /api/ai-assistant — Chat pédagogique IA
// ──────────────────────────────────────────────────────────────────────────

// aiAssistantRequest est le body attendu par POST /api/ai-assistant.
type aiAssistantRequest struct {
	Message string `json:"message"`
	Context any    `json:"context"` // optionnel, réservé pour usage futur
}

// aiAssistantResponse est la réponse retournée au frontend.
type aiAssistantResponse struct {
	Response string `json:"response"`
	Model    string `json:"model"`
}

// systemPromptAssistant est le prompt système injecté avant chaque message
// utilisateur. Il définit le rôle et le ton de l'assistant IA SECT.
const systemPromptAssistant = "Tu es un assistant pédagogique IA pour la plateforme SECT (Système d'Évaluation Casse-Tête). Tu aides les enseignants et étudiants dans leurs tâches académiques. Réponds de manière claire, concise et utile."

// maxMessageLen est la longueur maximale autorisée pour le message utilisateur.
const maxMessageLen = 10000

// aiAssistant handler — traite les requêtes de chat IA du frontend.
//
// Flux :
//  1. Valide le body (message non vide, longueur ≤ 10000).
//  2. Construit les messages [system, user] et appelle AIService.ChatCompletion.
//  3. Retourne { response, model } en JSON.
func (s *Server) aiAssistant(w http.ResponseWriter, r *http.Request) {
	// Limiter la taille du body à 1 MiB pour éviter les abus.
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req aiAssistantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "body invalide")
		return
	}

	// Validation : message requis.
	if req.Message == "" {
		writeJSONError(w, http.StatusBadRequest, "message requis")
		return
	}

	// Validation : longueur maximale.
	if len(req.Message) > maxMessageLen {
		writeJSONError(w, http.StatusBadRequest, "message trop long (max 10000 caractères)")
		return
	}

	// Construire les messages pour le LLM : system prompt + message utilisateur.
	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPromptAssistant},
		{Role: "user", Content: req.Message},
	}

	// Appeler le service IA (failover automatique via ChatWithFailover).
	result, err := s.aiService.ChatCompletion(r.Context(), messages)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "erreur IA: "+err.Error())
		return
	}

	// Retourner la réponse au frontend.
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(aiAssistantResponse{
		Response: result.Content,
		Model:    result.Model,
	})
}
