// Package http — hub SSE temps réel pour le module Messagerie.
//
// MessagerieHub maintient une map userID → channels SSE. Chaque onglet connecté
// ouvre un channel buffer-32. Les events sont poussés via BroadcastMessage /
// BroadcastEvent (non-bloquants : drop si buffer plein pour éviter qu'un client
// lent bloque tout le hub).
//
// Implémente usecase.MessageBroadcaster (duck-typing — pas de dépendance
// usecase → transport/http).
//
// Choix SSE vs WebSocket :
//   - SSE (Server-Sent Events) choisi car :
//     1. Pas de nouvelle dépendance (gorilla/websocket non dans go.mod).
//     2. Plus simple à coder (5 méthodes vs ~15 pour WS).
//     3. Compatible avec le hub notification existant (notification_hub.go).
//     4. Render free tier gère mieux les SSE (connection keep-alive simple)
//        que les WebSockets (qui nécessitent un upgrade HTTP).
//     5. EventSource natif côté navigateur (auto-reconnect intégré).
//   - Inconvénient SSE : unidirectionnel (server → client uniquement). Pour la
//     messagerie, c'est suffisant : le client envoie les messages via POST
//     classique, et reçoit les nouveautés via SSE. Le "typing indicator" peut
//     se faire via un POST dédié qui déclenche un BroadcastEvent.
package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ============================================================
// EVENT TYPE
// ============================================================

// MessagerieEvent est l'événement poussé via SSE aux clients messagerie.
type MessagerieEvent struct {
	Type      string          `json:"type"`      // "message_new" | "message_edited" | "message_deleted" | "read" | "typing" | "hello"
	Data      json.RawMessage `json:"data"`      // payload JSON (nil pour heartbeat)
	Timestamp string          `json:"timestamp"` // RFC3339
}

// ============================================================
// HUB
// ============================================================

// MessagerieHub gère les connexions SSE par utilisateur (multi-onglet supporté
// via slice de channels par userID). Thread-safe via sync.RWMutex.
// In-memory (pas de Redis) — si le backend redémarre, les clients se
// reconnectent automatiquement (EventSource natif côté navigateur).
type MessagerieHub struct {
	mu      sync.RWMutex
	clients map[string][]chan MessagerieEvent // userID → channels (1 par onglet)
}

// NewMessagerieHub crée un nouveau MessagerieHub.
func NewMessagerieHub() *MessagerieHub {
	return &MessagerieHub{clients: make(map[string][]chan MessagerieEvent)}
}

// ============================================================
// INTERNAL (register / unregister)
// ============================================================

// register inscrit un client SSE pour un utilisateur. Retourne le channel
// sur lequel le client doit écouter. Le client DOIT appeler unregister à la
// déconnexion pour éviter les fuites.
func (h *MessagerieHub) register(userID string) chan MessagerieEvent {
	ch := make(chan MessagerieEvent, 32) // buffer 32 pour éviter le blocage
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[userID] = append(h.clients[userID], ch)
	return ch
}

// unregister désinscrit un client SSE. Ferme le channel et le retire de la slice.
func (h *MessagerieHub) unregister(userID string, ch chan MessagerieEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	channels := h.clients[userID]
	for i, c := range channels {
		if c == ch {
			// Retire le channel de la slice (préserve l'ordre des autres).
			h.clients[userID] = append(channels[:i], channels[i+1:]...)
			close(ch)
			break
		}
	}
	// Nettoie si plus aucun client pour ce user.
	if len(h.clients[userID]) == 0 {
		delete(h.clients, userID)
	}
}

// ============================================================
// BROADCAST (implémente usecase.MessageBroadcaster)
// ============================================================

// BroadcastMessage envoie un event "message_new" aux userIDs donnés.
// Non-bloquant : si le buffer du channel est plein, l'event est droppé
// (le client rattrapera via le prochain poll ou rechargement de page).
func (h *MessagerieHub) BroadcastMessage(participantIDs []string, msg *domain.Message) {
	if msg == nil || len(participantIDs) == 0 {
		return
	}
	data, _ := json.Marshal(msg)
	h.broadcast(participantIDs, "message_new", data)
}

// BroadcastEvent envoie un event génrique (typing, read, edit, delete) aux
// userIDs donnés. Non-bloquant.
func (h *MessagerieHub) BroadcastEvent(participantIDs []string, eventType string, data any) {
	if len(participantIDs) == 0 || eventType == "" {
		return
	}
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	h.broadcast(participantIDs, eventType, payload)
}

// broadcast est le helper interne qui pousse un event à tous les channels
// des userIDs donnés. Drop silencieux si buffer plein (client lent).
func (h *MessagerieHub) broadcast(participantIDs []string, eventType string, data json.RawMessage) {
	event := MessagerieEvent{
		Type:      eventType,
		Data:      data,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, uid := range participantIDs {
		for _, ch := range h.clients[uid] {
			select {
			case ch <- event:
			default:
				// Channel plein, drop l'event (client trop lent).
			}
		}
	}
}

// ============================================================
// SSE ENDPOINT
// ============================================================

// HandleSSE est l'endpoint SSE pour la messagerie temps réel.
// Mounted at GET /api/messagerie/stream (RequireAuth appliqué par le routeur).
//
// Protocole :
//   1. Le client ouvre une connexion EventSource vers /api/messagerie/stream.
//   2. Le serveur envoie un event "hello" avec le userId (pour confirmer la connexion).
//   3. Le serveur pousse les events "message_new", "message_edited",
//      "message_deleted", "read" au fur et à mesure (via BroadcastMessage/Event).
//   4. Un heartbeat est envoyé toutes les 45s pour maintenir la connexion
//      (anti-proxy-timeout, notamment Vercel/Render).
//   5. Le client se déconnecte → r.Context().Done() → unregister propre.
//
// Format SSE : `data: <json>\n\n` (séparateur \n\n obligatoire).
// Commentaires SSE : `: heartbeat\n\n` (ignorés par EventSource mais maintiennent
// la connexion ouverte).
func (h *MessagerieHub) HandleSSE(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Headers SSE standards. X-Accel-Buffering: no pour Nginx (Render proxy).
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, _ := w.(http.Flusher)
	flushIfNeeded := func() {
		if flusher != nil {
			flusher.Flush()
		}
	}

	// 1. Event "hello" initial (confirme la connexion au client).
	helloData, _ := json.Marshal(map[string]string{
		"userId": claims.UserID,
		"role":   claims.Role,
	})
	helloEvent, _ := json.Marshal(MessagerieEvent{
		Type:      "hello",
		Data:      helloData,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
	fmt.Fprintf(w, "data: %s\n\n", helloEvent)
	flushIfNeeded()

	// 2. Inscrire le client SSE pour recevoir les events broadcastés.
	ch := h.register(claims.UserID)
	defer h.unregister(claims.UserID, ch)

	// 3. Heartbeat 45s (anti-proxy-timeout).
	heartbeat := time.NewTicker(45 * time.Second)
	defer heartbeat.Stop()

	// 4. Boucle principale : push events au client.
	for {
		select {
		case <-r.Context().Done():
			// Client déconnecté (fermeture onglet / network drop).
			return
		case event := <-ch:
			payload, _ := json.Marshal(event)
			fmt.Fprintf(w, "data: %s\n\n", payload)
			flushIfNeeded()
		case <-heartbeat.C:
			// Commentaire SSE (ignoré par EventSource mais maintient la connexion).
			fmt.Fprintf(w, ": heartbeat\n\n")
			flushIfNeeded()
		}
	}
}
