// Package http — hub WebSocket temps réel pour la surveillance.
//
// SurveillanceHub gère les connexions WebSocket des enseignants surveillants.
// Chaque client s'abonne à des epreuveIds spécifiques. Quand un événement
// survient (session démarrée, soumise, alerte déclenchée), le hub pousse
// immédiatement l'événement aux clients abonnés — éliminant le polling
// TanStack Query (30s) et le SSE surveillanceStream (10s).
//
// OPT-7 : remplace le polling par push WebSocket. Pour N enseignants
// surveillants, au lieu de N×2 requêtes toutes les 30s (sessions + stats),
// seuls les événements réels sont poussés (~0 requêtes en période calme).
package http

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ============================================================
// MESSAGE TYPE
// ============================================================

// SurveillanceWSMessage represents a message pushed to surveillance clients.
type SurveillanceWSMessage struct {
	Type      string          `json:"type"`      // SESSION_STARTED, SESSION_SUBMITTED, ALERT_TRIGGERED, SESSION_UPDATED
	EpreuveID string          `json:"epreuveId"` // Which exam this relates to
	Payload   json.RawMessage `json:"payload"`   // The actual data
	Timestamp string          `json:"timestamp"`
}

// SurveillanceWSSubscribe is the command sent by the client to subscribe/unsubscribe.
type SurveillanceWSSubscribe struct {
	Action     string   `json:"action"`     // "subscribe" or "unsubscribe"
	EpreuveIDs []string `json:"epreuveIds"` // epreuve IDs to subscribe to
}

// ============================================================
// CLIENT
// ============================================================

// SurveillanceWSClient represents a connected surveillance WebSocket client.
type SurveillanceWSClient struct {
	userID     string
	epreuveIDs map[string]bool // Which epreuves this client is monitoring
	conn       *websocket.Conn
	hub        *SurveillanceHub
	send       chan []byte
}

// WritePump pumps messages from the hub to the WebSocket connection.
func (c *SurveillanceWSClient) WritePump() {
	ticker := time.NewTicker(30 * time.Second) // ping
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ReadPump pumps messages from the WebSocket connection to the hub.
// Parses subscribe/unsubscribe commands from the client.
func (c *SurveillanceWSClient) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// Parse subscription messages from client
		var cmd SurveillanceWSSubscribe
		if err := json.Unmarshal(message, &cmd); err != nil {
			continue
		}
		switch cmd.Action {
		case "subscribe":
			for _, id := range cmd.EpreuveIDs {
				c.epreuveIDs[id] = true
			}
		case "unsubscribe":
			for _, id := range cmd.EpreuveIDs {
				delete(c.epreuveIDs, id)
			}
		}
	}
}

// ============================================================
// HUB
// ============================================================

// SurveillanceHub manages WebSocket connections for real-time surveillance.
type SurveillanceHub struct {
	clients    map[*SurveillanceWSClient]bool
	broadcast  chan *SurveillanceWSMessage
	register   chan *SurveillanceWSClient
	unregister chan *SurveillanceWSClient
	mu         sync.RWMutex
	logger     *slog.Logger
}

// NewSurveillanceHub creates a new SurveillanceHub.
func NewSurveillanceHub(logger *slog.Logger) *SurveillanceHub {
	return &SurveillanceHub{
		clients:    make(map[*SurveillanceWSClient]bool),
		broadcast:  make(chan *SurveillanceWSMessage, 256),
		register:   make(chan *SurveillanceWSClient),
		unregister: make(chan *SurveillanceWSClient),
		logger:     logger,
	}
}

// Run starts the hub's event loop. Should be called in a goroutine.
func (h *SurveillanceHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			h.logger.Info("surveillance WS client connected", "userID", client.userID, "totalClients", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			h.logger.Info("surveillance WS client disconnected", "userID", client.userID, "totalClients", len(h.clients))

		case msg := <-h.broadcast:
			data, err := json.Marshal(msg)
			if err != nil {
				h.logger.Error("failed to marshal surveillance WS message", "error", err)
				continue
			}
			h.mu.RLock()
			for client := range h.clients {
				// Only send to clients monitoring this epreuve
				if client.epreuveIDs[msg.EpreuveID] {
					select {
					case client.send <- data:
					default:
						// Client buffer full, disconnect
						h.mu.RUnlock()
						h.mu.Lock()
						delete(h.clients, client)
						close(client.send)
						h.mu.Unlock()
						h.mu.RLock()
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastEvent sends a surveillance event to all connected clients watching
// the given epreuve. Non-blocking: drops the message if the broadcast channel
// is full (client will get the next event or a polling refresh).
func (h *SurveillanceHub) BroadcastEvent(msgType, epreuveID string, payload any) {
	if h == nil || epreuveID == "" {
		return
	}
	payloadData, err := json.Marshal(payload)
	if err != nil {
		return
	}
	msg := &SurveillanceWSMessage{
		Type:      msgType,
		EpreuveID: epreuveID,
		Payload:   payloadData,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	select {
	case h.broadcast <- msg:
	default:
		h.logger.Warn("surveillance broadcast channel full, dropping message")
	}
}

// ClientCount returns the number of connected surveillance WS clients (for monitoring).
func (h *SurveillanceHub) ClientCount() int {
	if h == nil {
		return 0
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// ============================================================
// WEBSOCKET UPGRADER + HANDLER
// ============================================================

// surveillanceUpgrader upgrades HTTP connections to WebSocket for surveillance.
var surveillanceUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true }, // CORS handled by middleware
}

// handleSurveillanceWS handles WebSocket upgrade for surveillance.
// Mounted at GET /api/surveillance/ws (RequireAuth applied by router).
func (s *Server) handleSurveillanceWS(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	// Only teachers, admins, and responsables can use surveillance WS
	if claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" && claims.Role != "RESPONSABLE" {
		writeJSONError(w, http.StatusForbidden, "surveillance requires ENSEIGNANT, ADMIN or RESPONSABLE role")
		return
	}

	conn, err := surveillanceUpgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade already sends an HTTP error response
		return
	}

	client := &SurveillanceWSClient{
		userID:     claims.UserID,
		epreuveIDs: make(map[string]bool),
		conn:       conn,
		hub:        s.surveillanceHub,
		send:       make(chan []byte, 256),
	}

	s.surveillanceHub.register <- client

	go client.WritePump()
	go client.ReadPump()
}
