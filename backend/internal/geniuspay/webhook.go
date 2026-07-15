// webhook.go — Vérification de signature HMAC-SHA256 des webhooks GeniusPay.
//
// Doc GeniusPay (geniuspay://docs/webhooks) :
//   signature = HMAC-SHA256(timestamp + "." + raw_json_payload, webhook_secret)
//
// Headers à vérifier :
//   - X-Webhook-Signature : hexadécimal de la signature
//   - X-Webhook-Timestamp : Unix timestamp (rejeter si > 5 min = replay attack)
//   - X-Webhook-Event     : nom de l'événement (payment.success, payment.failed...)
package geniuspay

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

// MaxWebhookAge est la tolérance d'âge d'un webhook (replay attack protection).
// Doc GeniusPay : 300 secondes (5 min).
const MaxWebhookAge = 5 * time.Minute

// WebhookPayload — structure du body JSON envoyé par GeniusPay.
type WebhookPayload struct {
	ID        string        `json:"id"`         // UUID du webhook (idempotence)
	Event     string        `json:"event"`      // payment.success, payment.failed...
	Timestamp int64         `json:"timestamp"`  // Unix timestamp
	CreatedAt string        `json:"created_at"` // ISO datetime
	Data      WebhookData   `json:"data"`
	Environment string      `json:"environment"` // sandbox | live
}

// WebhookData — détail de la transaction dans le webhook.
type WebhookData struct {
	Object        string            `json:"object"`          // "transaction"
	ID            int               `json:"id"`              // ID interne
	Reference     string            `json:"reference"`       // MTX-XXXXXX
	Amount        float64           `json:"amount"`
	Currency      string            `json:"currency"`
	Fees          float64           `json:"fees,omitempty"`
	NetAmount     float64           `json:"net_amount,omitempty"`
	Status        string            `json:"status"`          // completed, failed...
	PaymentMethod string            `json:"payment_method,omitempty"`
	Provider      string            `json:"provider,omitempty"` // wave, orange...
	CustomerName  string            `json:"customer_name,omitempty"`
	CustomerPhone string            `json:"customer_phone,omitempty"`
	Metadata      map[string]string `json:"metadata,omitempty"`
}

// VerifySignature vérifie la signature HMAC-SHA256 d'un webhook GeniusPay.
//
// Paramètres :
//   - rawPayload : body brut de la requête (NE PAS utiliser le JSON décodé)
//   - signature  : valeur du header X-Webhook-Signature (hex)
//   - timestamp  : valeur du header X-Webhook-Timestamp (Unix seconds, string)
//   - secret     : whsec_sandbox_... ou whsec_live_...
//
// Retourne nil si valide, une erreur sinon (signature invalide OU timestamp trop vieux).
//
// Utilise hmac.Equal (constant-time) pour éviter les timing attacks.
func VerifySignature(rawPayload, signature, timestamp, secret string) error {
	if secret == "" {
		return fmt.Errorf("geniuspay: webhook secret non configuré (GENIUSPAY_WEBHOOK_SECRET)")
	}
	if signature == "" || timestamp == "" {
		return fmt.Errorf("geniuspay: signature ou timestamp manquant")
	}

	// 1. Vérifier l'âge du timestamp (replay attack protection)
	var ts int64
	if _, err := fmt.Sscanf(timestamp, "%d", &ts); err != nil {
		return fmt.Errorf("geniuspay: timestamp invalide: %w", err)
	}
	webhookTime := time.Unix(ts, 0)
	if age := time.Since(webhookTime); age > MaxWebhookAge || age < -MaxWebhookAge {
		return fmt.Errorf("geniuspay: webhook trop vieux (%v > %v)", age, MaxWebhookAge)
	}

	// 2. Calculer la signature attendue : HMAC-SHA256(timestamp + "." + payload, secret)
	data := timestamp + "." + rawPayload
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(data))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	// 3. Comparer en constant-time
	if !hmac.Equal([]byte(expectedSig), []byte(signature)) {
		return fmt.Errorf("geniuspay: signature invalide")
	}
	return nil
}

// IsPaymentSuccessEvent retourne true si l'événement webhook correspond à un
// paiement réussi (payment.success).
func (p *WebhookPayload) IsPaymentSuccessEvent() bool {
	return p.Event == "payment.success"
}

// IsPaymentFailedEvent retourne true pour payment.failed ou payment.cancelled.
func (p *WebhookPayload) IsPaymentFailedEvent() bool {
	return p.Event == "payment.failed" || p.Event == "payment.cancelled"
}
