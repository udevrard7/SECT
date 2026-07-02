// Package http — handlers HTTP pour le module Messagerie.
//
// Pattern uniforme (cf. session_handlers.go) :
//  1. Extraire claims via middleware.ClaimsFromContext → 401 si absent.
//  2. Pour les routes {id}, utiliser chi.URLParam(r, "id").
//  3. Décoder le body JSON si applicable → 400 si invalide.
//  4. Appeler le usecase → middleware.MapDomainError traduit l'erreur domaine
//     en code HTTP (404 NotFound, 403 Unauthorized, 409 Conflict, 400 Validation).
//  5. Encoder la réponse en JSON.
//
// Toutes les méthodes sont sur *Server (pattern existant). Le usecase est
// accessible via s.messagerieUC, le hub SSE via s.messagerieHub.
package http

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ============================================================
// CONVERSATIONS
// ============================================================

// listConversations — GET /api/messagerie/conversations
// Retourne les conversations accessibles à l'utilisateur courant avec métadonnées
// (dernier message, unread count, participants count).
func (s *Server) listConversations(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	result, err := s.messagerieUC.ListConversations(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// getConversation — GET /api/messagerie/conversations/{id}
func (s *Server) getConversation(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	conv, err := s.messagerieUC.GetConversation(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conv)
}

// getOrCreateIAPrivate — POST /api/messagerie/conversations/ia-private
// Retourne la conversation IA privée de l'utilisateur (la crée si absente).
// Body: vide ou {}.
func (s *Server) getOrCreateIAPrivate(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	conv, err := s.messagerieUC.GetOrCreateIAPrivate(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conv)
}

// createDirect — POST /api/messagerie/conversations/direct
// Body: { "targetUserId": "...", "titre": "..." (optional) }
func (s *Server) createDirect(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var input domain.CreateDirectConversationInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	conv, err := s.messagerieUC.CreateDirect(r.Context(), claims, input.TargetUserID, input.Titre)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conv)
}

// ============================================================
// MESSAGES
// ============================================================

// listMessages — GET /api/messagerie/conversations/{id}/messages
// Query params: cursor (optionnel, format "RFC3339Nano|uuid"), limit (défaut 50, max 200).
func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	conversationID := chi.URLParam(r, "id")
	// cursor optionnel : on accepte "" comme "pas de cursor" (page initiale).
	var cursor *string
	if c := r.URL.Query().Get("cursor"); c != "" {
		cursor = &c
	}
	limit := parseIntQueryParam(r.URL.Query().Get("limit"), 50)

	result, err := s.messagerieUC.ListMessages(r.Context(), claims, conversationID, cursor, limit)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// sendMessage — POST /api/messagerie/conversations/{id}/messages
// Body: { "contenu": "...", "replyToId": "..." (optional) }
//
// Comportement :
//   - Conv IA : ne persiste pas le message user, appelle l'IA, retourne la réponse IA.
//   - Mention @assistant dans un salon collectif : persiste le message user +
//     appelle l'IA en arrière-plan (réponse IA envoyée via SSE). Retourne le message user.
//   - Sinon : persiste le message user + broadcast. Retourne le message user.
func (s *Server) sendMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	conversationID := chi.URLParam(r, "id")
	var input domain.SendMessageInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	msg, err := s.messagerieUC.SendMessage(r.Context(), claims, conversationID, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}

// editMessage — PATCH /api/messagerie/messages/{id}
// Body: { "contenu": "..." }
func (s *Server) editMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	messageID := chi.URLParam(r, "id")
	var body struct {
		Contenu string `json:"contenu"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	msg, err := s.messagerieUC.EditMessage(r.Context(), claims, messageID, body.Contenu)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}

// deleteMessage — DELETE /api/messagerie/messages/{id}
func (s *Server) deleteMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	messageID := chi.URLParam(r, "id")
	if err := s.messagerieUC.DeleteMessage(r.Context(), claims, messageID); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"deleted": true})
}

// ============================================================
// PARTICIPANTS / READ / MUTE
// ============================================================

// markAsRead — POST /api/messagerie/conversations/{id}/lu
// Body: { "lastReadAt": "RFC3339" }
// Si lastReadAt absent → now().
func (s *Server) markAsRead(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	conversationID := chi.URLParam(r, "id")
	var body domain.MarkAsReadInput
	// Body optionnel — si absent, lastReadAt = now().
	_ = json.NewDecoder(r.Body).Decode(&body)
	lastReadAt := body.LastReadAt
	if lastReadAt.IsZero() {
		lastReadAt = time.Now()
	}
	if err := s.messagerieUC.MarkAsRead(r.Context(), claims, conversationID, lastReadAt); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"read": true})
}

// setMuted — PATCH /api/messagerie/conversations/{id}/mute
// Body: { "muted": true|false }
func (s *Server) setMuted(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	conversationID := chi.URLParam(r, "id")
	var body struct {
		Muted bool `json:"muted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if err := s.messagerieUC.SetMuted(r.Context(), claims, conversationID, body.Muted); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"muted": body.Muted})
}

// listParticipants — GET /api/messagerie/conversations/{id}/participants
func (s *Server) listParticipants(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	conversationID := chi.URLParam(r, "id")
	participants, err := s.messagerieUC.ListParticipants(r.Context(), claims, conversationID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"participants": participants})
}

// ============================================================
// SIGNALEMENTS
// ============================================================

// signalMessage — POST /api/messagerie/messages/{id}/signaler
// Body: { "raison": "HARCELEMENT|SPAM|CONTENU_INAPPROPRIE|AUTRE", "commentaire": "..." (optional) }
func (s *Server) signalMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	messageID := chi.URLParam(r, "id")
	var input domain.SignalMessageInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	signalement, err := s.messagerieUC.SignalMessage(r.Context(), claims, messageID, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(signalement)
}

// listSignalements — GET /api/messagerie/signalements
// Réservé RESPONSABLE/ADMIN (middleware.RequireRole appliqué au niveau du routeur).
// Query params: statut (optionnel, "OUVERT"|"EN_COURS"|"RESOLU"|"REJETE").
func (s *Server) listSignalements(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var statut *domain.SignalementStatut
	if s := r.URL.Query().Get("statut"); s != "" {
		st := domain.SignalementStatut(s)
		statut = &st
	}
	signalements, err := s.messagerieUC.ListSignalements(r.Context(), claims, statut)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"signalements": signalements})
}

// resolveSignalement — PATCH /api/messagerie/signalements/{id}
// Réservé RESPONSABLE/ADMIN.
// Body: { "statut": "RESOLU"|"REJETE"|"EN_COURS" }
func (s *Server) resolveSignalement(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	var body struct {
		Statut domain.SignalementStatut `json:"statut"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	signalement, err := s.messagerieUC.ResolveSignalement(r.Context(), claims, id, body.Statut)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(signalement)
}

// ============================================================
// SSE STREAM (delegate au hub)
// ============================================================

// messagerieStream — GET /api/messagerie/stream
// Endpoint SSE temps réel. Délègue au hub.
func (s *Server) messagerieStream(w http.ResponseWriter, r *http.Request) {
	if s.messagerieHub == nil {
		http.Error(w, "messagerie hub not initialized", http.StatusServiceUnavailable)
		return
	}
	s.messagerieHub.HandleSSE(w, r)
}
