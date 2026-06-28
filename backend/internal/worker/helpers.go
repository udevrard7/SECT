package worker

import (
	"context"
	"net/http"
	"bytes"
	"time"

	"github.com/jackc/pgx/v5"
)

// pgxTxOptions retourne les options de transaction par défaut.
func pgxTxOptions() pgx.TxOptions {
	return pgx.TxOptions{}
}

// httpClient est le client HTTP partagé pour les appels IA.
var httpClient = &http.Client{
	Timeout: 5 * time.Minute,
}

// newHTTPRequest crée une requête HTTP avec auth Bearer.
func newHTTPRequest(ctx context.Context, method, url string, body []byte, apiKey string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	return req, nil
}
