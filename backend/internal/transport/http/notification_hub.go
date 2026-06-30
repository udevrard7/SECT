// Package transport — hub SSE pour notifications temps réel (Phase 3).
package http

import (
	"encoding/json"
	"sync"
)

// NotificationEvent est l'événement poussé via SSE aux clients connectés.
// Contient la notification unifiée + le timestamp d'émission.
type NotificationEvent struct {
	Type      string          `json:"type"`      // "notification" | "heartbeat"
	Data      json.RawMessage `json:"data"`      // notification JSON (nil pour heartbeat)
	Timestamp string          `json:"timestamp"` // RFC3339
}

// notificationHub gère les connexions SSE par utilisateur.
// Thread-safe via sync.RWMutex. In-memory (pas de Redis) — si le backend
// redémarre, les clients se reconnectent automatiquement (EventSource natif).
type notificationHub struct {
	mu      sync.RWMutex
	clients map[string][]chan NotificationEvent // userId → channels
}

// globalNotificationHub est le singleton du hub (initialisé au démarrage).
var globalNotificationHub = &notificationHub{
	clients: make(map[string][]chan NotificationEvent),
}

// Register inscrit un client SSE pour un utilisateur. Retourne le channel
// sur lequel le client doit écouter. Le client DOIT appeler Unregister à la
// déconnexion pour éviter les fuites mémoire.
func (h *notificationHub) Register(userID string) chan NotificationEvent {
	ch := make(chan NotificationEvent, 16) // buffer 16 pour éviter le blocage
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[userID] = append(h.clients[userID], ch)
	return ch
}

// Unregister désinscrit un client SSE. Ferme le channel et le retire de la liste.
func (h *notificationHub) Unregister(userID string, ch chan NotificationEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	channels := h.clients[userID]
	for i, c := range channels {
		if c == ch {
			// Retire le channel de la slice
			h.clients[userID] = append(channels[:i], channels[i+1:]...)
			close(ch)
			break
		}
	}
	// Nettoie si plus aucun client
	if len(h.clients[userID]) == 0 {
		delete(h.clients, userID)
	}
}

// Broadcast envoie un événement à tous les clients SSE d'un utilisateur.
// Non-bloquant : si le buffer du channel est plein, l'événement est droppé
// (le client rattrapera via le prochain poll). Évite qu'un client lent
// bloque tout le hub.
func (h *notificationHub) Broadcast(userID string, event NotificationEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.clients[userID] {
		select {
		case ch <- event:
		default:
			// Channel plein, drop l'événement (client trop lent)
		}
	}
}
