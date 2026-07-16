// Package geniuspay implémente le client HTTP pour l'API GeniusPay
// (paiements Wave / Orange Money / MTN / cartes en Afrique de l'Ouest).
//
// SECT-GENIUSPAY-WAVE : intégration du paiement Wave pour le plan B2C
// Prof Premium (4 900 FCFA/mois).
//
// Documentation lue via MCP (geniuspay://docs/api) — voir docs-geniuspay-api.md
// (local, gitignoré). Points clés :
//   - Auth : Authorization: Bearer <api_key>
//   - Headers recommandés : User-Agent, X-Request-ID, X-Idempotency-Key
//     (évite le blocage anti-bot / rate-limit 100 req/min)
//   - POST /v1/merchant/payments ou /sandbox/payments/initiate → crée un paiement
//   - GET  /v1/merchant/payments/{reference} → récupère le statut
//   - Webhook : signature = HMAC-SHA256(timestamp + "." + raw_payload, secret)
package geniuspay

import (
        "bytes"
        "context"
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "strings"
        "time"

        "github.com/google/uuid"
)

// Client est le client HTTP GeniusPay. Goroutine-safe (http.Client l'est).
type Client struct {
        apiKey     string
        apiSecret  string // pour payouts futurs (non utilisé pour les paiements)
        baseURL    string // ex: https://api.geniuspay.ci (le path /v1/merchant ou /sandbox est ajouté par l'appelant)
        httpClient *http.Client
        userAgent  string
}

// NewClient crée un client GeniusPay. Si apiKey est vide, le client est nil-safe
// (les méthodes retournent ErrNotConfigured) — utile en dev sans config.
func NewClient(apiKey, apiSecret, baseURL string) *Client {
        if baseURL == "" {
                baseURL = "https://api.geniuspay.ci"
        }
        // Strip trailing slash pour faciliter le join
        baseURL = strings.TrimRight(baseURL, "/")
        return &Client{
                apiKey:    apiKey,
                apiSecret: apiSecret,
                baseURL:  baseURL,
                httpClient: &http.Client{
                        Timeout: 20 * time.Second, // GeniusPay répond en < 2s, 20s est large
                },
                userAgent: "SECT-App/1.0 (sect-app.vercel.app; ulrichdouh@gmail.com)",
        }
}

// IsConfigured indique si le client a une clé API (pour skip en dev si non config).
func (c *Client) IsConfigured() bool {
        return c != nil && c.apiKey != ""
}

// ErrNotConfigured est retourné quand GENIUSPAY_API_KEY n'est pas set.
var ErrNotConfigured = fmt.Errorf("geniuspay: client non configuré (GENIUSPAY_API_KEY manquant)")

// --- Requêtes / réponses API ---

// CreatePaymentRequest — body du POST /payments.
// Doc GeniusPay : amount (min 200 XOF), payment_method (wave_ci, orange_money_ci...),
// customer.phone (requis, format +225...), success_url, error_url, metadata.
//
// Si PaymentMethod est vide → mode checkout (GeniusPay affiche sa page de choix).
// Si PaymentMethod est "wave_ci" → redirection directe vers Wave.
// NB: orange_money_ci et mtn_money_ci sont ignorés par GeniusPay (retourne Wave).
// Pour Orange/MTN, on utilise le mode checkout (PaymentMethod vide).
type CreatePaymentRequest struct {
        Amount        int               `json:"amount"`              // en XOF (entier)
        Currency      string            `json:"currency,omitempty"`  // XOF défaut
        PaymentMethod string            `json:"payment_method,omitempty"` // vide = mode checkout
        CustomerPhone string            `json:"customer_phone,omitempty"` // format +225...
        CustomerName  string            `json:"customer_name,omitempty"`
        CustomerEmail string            `json:"customer_email,omitempty"`
        Description   string            `json:"description,omitempty"`
        SuccessURL    string            `json:"success_url,omitempty"`
        ErrorURL      string            `json:"error_url,omitempty"`
        Metadata      map[string]string `json:"metadata,omitempty"`
}

// PaymentData — structure de la réponse GeniusPay (champ data).
type PaymentData struct {
        Reference   string `json:"reference"`    // MTX-XXXXXX
        Amount      int    `json:"amount"`
        Currency    string `json:"currency"`
        Status      string `json:"status"`        // pending, completed, failed, cancelled
        PaymentURL  string `json:"payment_url"`   // URL de checkout Wave
        CheckoutURL string `json:"checkout_url"`  // alias (mode checkout sans payment_method)
        Gateway     string `json:"gateway"`       // wave, paystack, pawapay...
        ExpiresAt   string `json:"expires_at,omitempty"`
}

// apiResponse — enveloppe standard GeniusPay { success, data, message }.
type apiResponse struct {
        Success bool        `json:"success"`
        Data    PaymentData `json:"data"`
        Message string      `json:"message,omitempty"`
}

// CreatePayment crée un paiement chez GeniusPay.
// Retourne la référence + l'URL de checkout à renvoyer au frontend.
//
// Endpoint utilisé : POST {baseURL}/v1/merchant/payments
// (en sandbox, l'utilisateur set GENIUSPAY_BASE_URL avec le préfixe sandbox).
func (c *Client) CreatePayment(ctx context.Context, req CreatePaymentRequest) (*PaymentData, error) {
        if !c.IsConfigured() {
                return nil, ErrNotConfigured
        }
        if req.Amount < 200 {
                return nil, fmt.Errorf("geniuspay: montant minimum 200 XOF (reçu %d)", req.Amount)
        }
        if req.CustomerPhone == "" {
                return nil, fmt.Errorf("geniuspay: customer_phone requis")
        }

        body, err := json.Marshal(req)
        if err != nil {
                return nil, fmt.Errorf("geniuspay: marshal request: %w", err)
        }

        url := c.baseURL + "/v1/merchant/payments"

        httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
        if err != nil {
                return nil, fmt.Errorf("geniuspay: new request: %w", err)
        }
        c.setHeaders(httpReq)

        resp, err := c.httpClient.Do(httpReq)
        if err != nil {
                return nil, fmt.Errorf("geniuspay: http do: %w", err)
        }
        defer resp.Body.Close()

        respBody, _ := io.ReadAll(resp.Body)

        if resp.StatusCode >= 400 {
                var errResp apiResponse
                if json.Unmarshal(respBody, &errResp) == nil && errResp.Message != "" {
                        return nil, fmt.Errorf("geniuspay: API %d: %s", resp.StatusCode, errResp.Message)
                }
                return nil, fmt.Errorf("geniuspay: API %d: %s", resp.StatusCode, truncate(string(respBody), 200))
        }

        var apiResp apiResponse
        if err := json.Unmarshal(respBody, &apiResp); err != nil {
                return nil, fmt.Errorf("geniuspay: unmarshal response: %w (body: %s)", err, truncate(string(respBody), 200))
        }
        if !apiResp.Success {
                return nil, fmt.Errorf("geniuspay: success=false: %s", apiResp.Message)
        }

        // payment_url ou checkout_url (les deux sont retournés selon le mode)
        if apiResp.Data.PaymentURL == "" && apiResp.Data.CheckoutURL != "" {
                apiResp.Data.PaymentURL = apiResp.Data.CheckoutURL
        }
        if apiResp.Data.Reference == "" {
                return nil, fmt.Errorf("geniuspay: réponse sans référence (body: %s)", truncate(string(respBody), 200))
        }
        return &apiResp.Data, nil
}

// GetPayment récupère les détails d'un paiement par sa référence MTX-XXX.
// Utilisé pour vérifier le statut après retour utilisateur (double-check
// sécurité : ne jamais faire confiance aux return URLs seules — doc GeniusPay).
func (c *Client) GetPayment(ctx context.Context, reference string) (*PaymentData, error) {
        if !c.IsConfigured() {
                return nil, ErrNotConfigured
        }
        if reference == "" {
                return nil, fmt.Errorf("geniuspay: reference requis")
        }

        url := c.baseURL + "/v1/merchant/payments/" + reference
        httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
        if err != nil {
                return nil, fmt.Errorf("geniuspay: new request: %w", err)
        }
        c.setHeaders(httpReq)

        resp, err := c.httpClient.Do(httpReq)
        if err != nil {
                return nil, fmt.Errorf("geniuspay: http do: %w", err)
        }
        defer resp.Body.Close()

        respBody, _ := io.ReadAll(resp.Body)

        if resp.StatusCode >= 400 {
                return nil, fmt.Errorf("geniuspay: API %d: %s", resp.StatusCode, truncate(string(respBody), 200))
        }

        var apiResp apiResponse
        if err := json.Unmarshal(respBody, &apiResp); err != nil {
                return nil, fmt.Errorf("geniuspay: unmarshal: %w", err)
        }
        return &apiResp.Data, nil
}

// setHeaders pose les headers requis/recommandés par GeniusPay (anti-bot).
func (c *Client) setHeaders(req *http.Request) {
        req.Header.Set("Authorization", "Bearer "+c.apiKey)
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("Accept", "application/json")
        req.Header.Set("User-Agent", c.userAgent)
        req.Header.Set("X-Request-ID", uuid.NewString())
        // Accept-Language aide la détection géo (doc GeniusPay §2)
        req.Header.Set("Accept-Language", "fr-CI, fr;q=0.9")
}

func truncate(s string, n int) string {
        if len(s) <= n {
                return s
        }
        return s[:n] + "..."
}
