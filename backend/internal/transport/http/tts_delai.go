// tts_delai.go — SECT-TTS-4 : délai d'écriture dédié aux réponses TTS.
//
// Le serveur HTTP global impose WriteTimeout=30 s (cmd/api/main.go) —
// une protection saine contre les clients lents sur TOUTES les routes.
// Mais la synthèse vocale d'un grand segment peut dépasser 30 s AVANT
// le premier octet de réponse (mesuré en production : ~70 s pour ~3 800
// runes sur gemini-2.5-flash-preview-tts ; le client voyait la connexion
// coupée sans réponse — curl exit 52). http.ResponseController permet
// de prolonger le délai POUR CETTE réponse uniquement, sans affaiblir
// la protection globale des autres routes.
package http

import (
	"net/http"
	"time"
)

// delaiEcritureTTS — marge totale (synthèse jusqu'à ~2 min par modèle
// essayé dans la file + écriture de l'audio). Cohérent avec le client
// HTTP du service TTS (Timeout 2 min par appel).
const delaiEcritureTTS = 4 * time.Minute

// prolongerDelaiEcritureTTS étend le délai d'écriture de la réponse en
// cours (best-effort : un échec silencieux retombe sur le délai global).
func prolongerDelaiEcritureTTS(w http.ResponseWriter) {
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(delaiEcritureTTS))
}
