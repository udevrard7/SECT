// Package http — writedeadline.go
//
// SECT-LATENCY-3 — réarmement du write deadline des connexions.
//
// CONSTAT (audit latence du 11/10/2026) :
//   - le serveur HTTP (cmd/api/main.go) impose WriteTimeout=30s, deadline
//     posée à la LECTURE DES HEADERS de chaque requête ;
//   - tout écrit TCP après 30s de vie de la requête disparaît SILENCIEUSEMENT :
//     test local avec WriteTimeout=3s — les Fprintf post-deadline retournent
//     err=nil côté serveur mais ne sont JAMAIS reçus côté client, puis la
//     connexion reçoit un EOF (tuée par le serveur).
//
// VICTIMES PROUVÉES EN PROD :
//  1. POST /api/landing-demo : 503 journalisé à 30001ms mais connexion tuée
//     AVANT l'écriture → curl exit 52, http=000, réponse vide (run diag
//     38162229700 ×3) ;
//  2. les 3 flux SSE (messagerie/stream, notifications/stream, surveillance)
//     : heartbeats à 45s et événements perdus au-delà de 30s de connexion
//     → EventSource du client se reconnecte en boucle ; le RequestLog
//     montrait des « latences » de 950s = connexions zombies.
//
// FIX : http.ResponseController.SetWriteDeadline — mécanisme prévu par
// net/http pour les timeouts par-réponse. Il remonte la chaîne de wrappers
// via Unwrap() (statusRecorder, compressResponseWriter, statusWriter —
// les deux wrappers maison ont reçu leur Unwrap dans ce même commit).
package http

import (
	"net/http"
	"time"
)

// rearmWriteDeadline repousse le write deadline de la connexion sous-jacente
// de d à partir de maintenant. Best-effort : si un wrapper sans Unwrap existe
// encore dans la chaîne, l'erreur est ignorée (comportement inchangé par
// rapport à avant le fix — jamais pire).
func rearmWriteDeadline(w http.ResponseWriter, d time.Duration) {
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(d))
}
