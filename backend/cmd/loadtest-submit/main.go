// Package main — cmd/loadtest-submit
//
// LOADTEST-SUBMIT-1 : test de charge réel du pic de soumission d'examen.
//
// OBJECTIF
// Valider en conditions réelles le comportement du rate limiting 202 async
// (OPT-11 / SUBMIT-RATELIMIT-1) quand N étudiants soumettent leur examen
// simultanément à t=0 (worst case sans jitter) ou étalés sur une fenêtre
// de jitter (simulation du frontend OPT-11 / SUBMIT-JITTER-1).
//
// CE QUE LE SCRIPT MESURE
//   - Distribution des codes HTTP de réponse (200 / 202 / 4xx / 5xx)
//   - Latences : min, p50, p95, p99, max
//   - Nombre de retries 202 → 200 (chaîne complète)
//   - Throughput global (submits/s effectivement traités)
//   - Comportement sous saturation (N > SUBMIT_MAX_CONCURRENT)
//
// MODES D'AUTHENTIFICATION
//  1. --mode=fake (défaut) : génère N JWT signés avec le même JWT_SECRET que
//     le backend, rôles ETUDIANT, user IDs loadtest-1..N. Les tokens passent
//     l'auth middleware (signature valide), atteignent le submitLimiter, et
//     déclenchent le comportement 202/200. Le usecase Submit échouera ensuite
//     (sessions inexistantes en DB) → codes 4xx/5xx après le slot acquis.
//     CE MODE SUFFIT POUR VALIDER LE 202 : le limiter s'exécute AVANT le
//     usecase Submit, donc les 202 sont renvoyés correctement sans dépendance
//     sur des données réelles.
//  2. --mode=login : login N étudiants via POST /api/go-auth/login (email +
//     password communs, suffixe -i). Récupère de vrais access_token cookies.
//     Mode end-to-end (nécessite N comptes étudiants créés en DB).
//  3. --mode=token-file : lit N tokens JWT depuis --token-file (1 par ligne).
//     Utile pour rejouer un test avec des tokens capturés côté frontend.
//
// USAGE
//
//	# Test worst case : 100 étudiants simultanés, pas de jitter (valide 202)
//	go run ./cmd/loadtest-submit -n 100 -url http://localhost:8080 \
//	    -session test-session-id -secret $JWT_SECRET
//
//	# Test avec jitter frontend simulé (45s, comme OPT-11)
//	go run ./cmd/loadtest-submit -n 1000 -url http://localhost:8080 \
//	    -session test-session-id -secret $JWT_SECRET -jitter 45000
//
//	# Test end-to-end contre Render prod
//	go run ./cmd/loadtest-submit -n 200 -url https://sect-zead.onrender.com \
//	    -session <real-session-id> -secret $JWT_SECRET -mode login \
//	    -login-email-base etudiant -login-password Test1234!
//
// FLAGS
//
//	-n              Nombre d'étudiants simultanés (défaut 50)
//	-url            Base URL du backend (défaut http://localhost:8080)
//	-session        ID de session à soumettre (défaut "loadtest-session")
//	-secret         JWT_SECRET (défaut : $JWT_SECRET env)
//	-mode           fake | login | token-file (défaut fake)
//	-token-file     Fichier de tokens (mode token-file)
//	-login-email-base  Base d'email pour mode login (ex: "etudiant" → etudiant-1@…)
//	-login-password    Password commun pour mode login
//	-login-email-domain Domaine email (défaut "loadtest.local")
//	-jitter         Délai max de jitter en ms avant 1er submit (défaut 0 = worst case)
//	-retries        Max retries sur 202 (défaut 10, comme le frontend)
//	-retry-default  Délai de retry par défaut si header Retry-After absent (défaut 3s)
//	-timeout        Timeout HTTP par requête (défaut 30s, = timeout Render)
//	-verbose        Log chaque requête (défaut false)
//
// Auteur : udevrard7 <ulrichdouh@gmail.com>
package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/jwt"
)

// result est le résultat d'un submit (1 étudiant, après retries éventuels).
type result struct {
	studentID    int
	finalCode    int // code HTTP final (après retries)
	retries      int // nb de 202 reçus avant succès/échec final
	totalLatency time.Duration
	retryCodes   []int // historique des codes (ex: [202, 202, 200])
	err          string
}

func main() {
	startTime := time.Now()

	// --- Flags ---
	n := flag.Int("n", 50, "Nombre d'étudiants simultanés")
	baseURL := flag.String("url", "http://localhost:8080", "Base URL du backend")
	sessionID := flag.String("session", "loadtest-session", "ID de session à soumettre")
	secretFlag := flag.String("secret", "", "JWT_SECRET (défaut: $JWT_SECRET env)")
	mode := flag.String("mode", "fake", "Mode d'auth: fake | login | token-file")
	tokenFile := flag.String("token-file", "", "Fichier de tokens (mode token-file)")
	loginEmailBase := flag.String("login-email-base", "etudiant", "Base d'email pour mode login")
	loginPassword := flag.String("login-password", "", "Password commun pour mode login")
	loginEmailDomain := flag.String("login-email-domain", "loadtest.local", "Domaine email pour mode login")
	jitterMs := flag.Int("jitter", 0, "Délai max de jitter en ms avant 1er submit (0 = worst case)")
	maxRetries := flag.Int("retries", 10, "Max retries sur 202")
	retryDefault := flag.Duration("retry-default", 3*time.Second, "Délai retry par défaut si pas de Retry-After")
	httpTimeout := flag.Duration("timeout", 30*time.Second, "Timeout HTTP par requête")
	verbose := flag.Bool("verbose", false, "Log chaque requête")
	flag.Parse()

	// --- Secret ---
	secret := *secretFlag
	if secret == "" {
		secret = os.Getenv("JWT_SECRET")
	}
	if secret == "" && *mode == "fake" {
		log.Fatal("JWT_SECRET requis en mode fake (flag -secret ou env JWT_SECRET)")
	}

	// --- Sanity check URL ---
	healthURL := *baseURL + "/health"
	if code, err := pingHealth(healthURL, *httpTimeout); err != nil || code != 200 {
		log.Fatalf("backend injoignable sur %s (code=%d err=%v) — démarre le backend avant le test", healthURL, code, err)
	}
	fmt.Printf("✓ Backend joignable : %s (200 OK)\n", *baseURL)

	// --- Préparation des tokens ---
	fmt.Printf("→ Préparation de %d tokens (mode=%s)...\n", *n, *mode)
	tokens, err := prepareTokens(*n, *mode, *baseURL, secret, *tokenFile,
		*loginEmailBase, *loginPassword, *loginEmailDomain, *httpTimeout)
	if err != nil {
		log.Fatalf("préparation tokens: %v", err)
	}
	fmt.Printf("✓ %d tokens prêts\n", len(tokens))

	// --- Lancement du test ---
	fmt.Printf("\n🎯 Lancement du test de charge : %d étudiants, jitter=%dms, maxRetries=%d\n",
		*n, *jitterMs, *maxRetries)
	fmt.Printf("   Endpoint : POST %s/api/sessions/%s/submit\n", *baseURL, *sessionID)
	fmt.Printf("   Démarrage dans 3s (Ctrl-C pour annuler)...\n\n")
	time.Sleep(3 * time.Second)

	submitURL := *baseURL + "/api/sessions/" + *sessionID + "/submit"
	results := runLoadTest(*n, tokens, submitURL, *jitterMs, *maxRetries,
		*retryDefault, *httpTimeout, *verbose)

	elapsed := time.Since(startTime)

	// --- Rapport ---
	printReport(results, elapsed, *n, *jitterMs)
}

// runLoadTest lance N goroutines simultanées et collecte les résultats.
func runLoadTest(n int, tokens []string, submitURL string, jitterMs int,
	maxRetries int, retryDefault time.Duration, httpTimeout time.Duration,
	verbose bool) []result {

	start := make(chan struct{})
	var wg sync.WaitGroup
	results := make([]result, n)

	// Compteurs temps réel pour la progression
	var done atomic.Int64
	var queued atomic.Int64
	var succeeded atomic.Int64
	var failed atomic.Int64

	// Goroutine de progression
	progressDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				d := done.Load()
				fmt.Printf("   [progress] %d/%d done | 202 queued: %d | 200 ok: %d | err: %d\n",
					d, n, queued.Load(), succeeded.Load(), failed.Load())
			case <-progressDone:
				return
			}
		}
	}()

	client := &http.Client{Timeout: httpTimeout}

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			// Jitter optionnel : attendre [0, jitterMs] avant le 1er submit.
			if jitterMs > 0 {
				jitter, _ := rand.Int(rand.Reader, big.NewInt(int64(jitterMs+1)))
				time.Sleep(time.Duration(jitter.Int64()) * time.Millisecond)
			}

			// Attendre le signal de départ simultané (worst case sans jitter).
			<-start

			r := result{studentID: idx + 1, retryCodes: []int{}}
			startTime := time.Now()
			token := tokens[idx]

			body := bytes.NewReader([]byte(`{}`))
			currentRetry := 0

			for {
				req, err := http.NewRequest("POST", submitURL, body)
				if err != nil {
					r.err = fmt.Sprintf("new request: %v", err)
					break
				}
				req.Header.Set("Authorization", "Bearer "+token)
				req.Header.Set("Content-Type", "application/json")

				resp, err := client.Do(req)
				if err != nil {
					r.err = fmt.Sprintf("http: %v", err)
					break
				}

				// Lire le body pour pouvoir réutiliser la connexion (keep-alive).
				_, _ = io.Copy(io.Discard, resp.Body)
				_ = resp.Body.Close()

				r.retryCodes = append(r.retryCodes, resp.StatusCode)

				if verbose {
					log.Printf("[#%d] attempt %d → %d (Retry-After=%q)",
						idx+1, currentRetry, resp.StatusCode, resp.Header.Get("Retry-After"))
				}

				if resp.StatusCode == 202 {
					// En file d'attente — retry après Retry-After.
					queued.Add(1)
					if currentRetry >= maxRetries {
						r.err = fmt.Sprintf("max retries (%d) atteint, dernier code 202", maxRetries)
						r.finalCode = 202
						break
					}
					currentRetry++
					wait := parseRetryAfter(resp.Header.Get("Retry-After"), retryDefault)
					time.Sleep(wait)
					// Reset body reader pour le retry.
					body.Reset([]byte(`{}`))
					continue
				}

				// Code non-202 : c'est le résultat final.
				r.finalCode = resp.StatusCode
				if resp.StatusCode == 200 {
					succeeded.Add(1)
				} else if resp.StatusCode >= 400 {
					failed.Add(1)
				}
				break
			}

			r.retries = currentRetry
			r.totalLatency = time.Since(startTime)
			results[idx] = r
			done.Add(1)
		}(i)
	}

	// Départ simultané : toutes les goroutines attendaient sur `start`.
	close(start)
	wg.Wait()
	close(progressDone)

	return results
}

// prepareTokens génère ou récupère N tokens JWT selon le mode choisi.
func prepareTokens(n int, mode, baseURL, secret, tokenFile,
	loginEmailBase, loginPassword, loginEmailDomain string,
	httpTimeout time.Duration) ([]string, error) {

	switch mode {
	case "fake":
		return generateFakeTokens(n, secret)
	case "login":
		return loginStudents(n, baseURL, loginEmailBase, loginPassword, loginEmailDomain, httpTimeout)
	case "token-file":
		return readTokenFile(tokenFile, n)
	default:
		return nil, fmt.Errorf("mode inconnu: %s (attendu: fake|login|token-file)", mode)
	}
}

// generateFakeTokens signe N JWT valides (rôle ETUDIANT, user IDs fictifs).
func generateFakeTokens(n int, secret string) ([]string, error) {
	signer := jwt.NewSigner(secret)
	tokens := make([]string, n)
	for i := 0; i < n; i++ {
		claims := db.SessionClaims{
			UserID:          fmt.Sprintf("loadtest-%d", i+1),
			Role:            "ETUDIANT",
			EtablissementID: "loadtest-etab",
		}
		token, _, err := signer.GenerateAccessToken(claims,
			fmt.Sprintf("loadtest-%d@loadtest.local", i+1),
			fmt.Sprintf("Loadtest Student %d", i+1))
		if err != nil {
			return nil, fmt.Errorf("sign token %d: %w", i+1, err)
		}
		tokens[i] = token
	}
	return tokens, nil
}

// loginStudents authentifie N étudiants via /api/go-auth/login.
// Attend : email = {base}-{i+1}@{domain}, password commun.
func loginStudents(n int, baseURL, emailBase, password, domain string,
	httpTimeout time.Duration) ([]string, error) {

	if password == "" {
		return nil, fmt.Errorf("--login-password requis en mode login")
	}

	client := &http.Client{Timeout: httpTimeout}
	tokens := make([]string, n)
	var wg sync.WaitGroup
	errs := make([]error, n)

	sem := make(chan struct{}, 10) // 10 logins en parallèle max
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			email := fmt.Sprintf("%s-%d@%s", emailBase, idx+1, domain)
			body := fmt.Sprintf(`{"email":%q,"password":%q}`, email, password)
			req, _ := http.NewRequest("POST", baseURL+"/api/go-auth/login", bytes.NewReader([]byte(body)))
			req.Header.Set("Content-Type", "application/json")
			resp, err := client.Do(req)
			if err != nil {
				errs[idx] = err
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				b, _ := io.ReadAll(resp.Body)
				errs[idx] = fmt.Errorf("login %s: %d %s", email, resp.StatusCode, string(b))
				return
			}
			// Le token est dans le cookie access_token (httpOnly).
			for _, c := range resp.Cookies() {
				if c.Name == "access_token" {
					tokens[idx] = c.Value
					return
				}
			}
			// Fallback : peut-être dans le body JSON (selon implémentation).
			var payload struct {
				AccessToken string `json:"accessToken"`
			}
			if jsonErr := json.NewDecoder(resp.Body).Decode(&payload); jsonErr == nil && payload.AccessToken != "" {
				tokens[idx] = payload.AccessToken
				return
			}
			errs[idx] = fmt.Errorf("login %s: pas de token dans cookie ni body", email)
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			return nil, fmt.Errorf("login #%d: %w", i+1, err)
		}
	}
	return tokens, nil
}

// readTokenFile lit N tokens depuis un fichier (1 par ligne).
func readTokenFile(path string, n int) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var tokens []string
	for _, line := range bytes.Split(data, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if len(line) > 0 {
			tokens = append(tokens, string(line))
		}
	}
	if len(tokens) < n {
		return nil, fmt.Errorf("token-file contient %d tokens, %d requis", len(tokens), n)
	}
	return tokens[:n], nil
}

// pingHealth vérifie que le backend répond sur /health.
func pingHealth(url string, timeout time.Duration) (int, error) {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// parseRetryAfter parse le header Retry-After (en secondes, format entier).
func parseRetryAfter(val string, fallback time.Duration) time.Duration {
	if val == "" {
		return fallback
	}
	var sec int
	if _, err := fmt.Sscanf(val, "%d", &sec); err != nil || sec <= 0 {
		return fallback
	}
	return time.Duration(sec) * time.Second
}

// printReport affiche le rapport final du test de charge.
func printReport(results []result, elapsed time.Duration, n, jitterMs int) {
	// --- Agrégation ---
	codeCounts := map[int]int{}
	var latencies []time.Duration
	var retriesCount int
	var totalRetries202 int
	var serverErrors int // 5xx + erreurs réseau (les vrais échecs)
	var clientErrors int // 4xx (sauf 401/403 = problème auth)
	var authErrors int   // 401/403
	var networkErrors int

	for _, r := range results {
		codeCounts[r.finalCode]++
		latencies = append(latencies, r.totalLatency)
		retriesCount += r.retries
		if r.retries > 0 {
			totalRetries202++
		}
		switch {
		case r.err != "" && r.finalCode == 0:
			networkErrors++
		case r.finalCode == 401 || r.finalCode == 403:
			authErrors++
		case r.finalCode >= 500:
			serverErrors++
		case r.finalCode >= 400:
			clientErrors++
		}
	}

	// Latences triées pour percentiles.
	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	realErrors := serverErrors + networkErrors
	success200 := codeCounts[200]

	fmt.Println("\n" + "════════════════════════════════════════════════════════════════")
	fmt.Println("  RAPPORT DE TEST DE CHARGE — PIC DE SOUMISSION")
	fmt.Println("════════════════════════════════════════════════════════════════")
	fmt.Printf("  Étudiants        : %d\n", n)
	fmt.Printf("  Jitter           : %d ms\n", jitterMs)
	fmt.Printf("  Durée totale     : %s\n", elapsed.Round(time.Millisecond))
	fmt.Printf("  Throughput       : %.1f submits/s (effectivement traités)\n", float64(n)/elapsed.Seconds())
	fmt.Println("────────────────────────────────────────────────────────────────")
	fmt.Println("  Distribution des codes HTTP finaux :")
	for code, count := range codeCounts {
		pct := float64(count) / float64(n) * 100
		label := http.StatusText(code)
		if label == "" {
			label = "NETWORK_ERR"
		}
		fmt.Printf("    %d %-25s %5d (%5.1f%%)\n", code, label, count, pct)
	}
	fmt.Println("────────────────────────────────────────────────────────────────")
	fmt.Println("  Latences (après retries éventuels) :")
	if len(latencies) > 0 {
		fmt.Printf("    min  : %s\n", latencies[0].Round(time.Millisecond))
		fmt.Printf("    p50  : %s\n", latencies[len(latencies)/2].Round(time.Millisecond))
		fmt.Printf("    p95  : %s\n", latencies[(len(latencies)*95)/100].Round(time.Millisecond))
		fmt.Printf("    p99  : %s\n", latencies[(len(latencies)*99)/100].Round(time.Millisecond))
		fmt.Printf("    max  : %s\n", latencies[len(latencies)-1].Round(time.Millisecond))
	}
	fmt.Println("────────────────────────────────────────────────────────────────")
	fmt.Println("  Comportement 202 (rate limiting async — OPT-11) :")
	fmt.Printf("    Étudiants ayant reçu au moins 1× 202 : %d (%.1f%%)\n",
		totalRetries202, float64(totalRetries202)/float64(n)*100)
	fmt.Printf("    Total retries 202→...                : %d\n", retriesCount)
	if totalRetries202 > 0 {
		fmt.Printf("    Moyenne retries/étudiant (affectés)  : %.2f\n",
			float64(retriesCount)/float64(totalRetries202))
	}
	fmt.Println("────────────────────────────────────────────────────────────────")
	fmt.Println("  Catégories d'issues :")
	fmt.Printf("    200 OK (succès complet)              : %d (%.1f%%)\n", success200, float64(success200)/float64(n)*100)
	fmt.Printf("    4xx client (session invalide, etc.)  : %d (%.1f%%) — attendu en mode fake\n",
		clientErrors, float64(clientErrors)/float64(n)*100)
	fmt.Printf("    401/403 (auth)                       : %d (%.1f%%)\n",
		authErrors, float64(authErrors)/float64(n)*100)
	fmt.Printf("    5xx serveur                          : %d (%.1f%%)\n",
		serverErrors, float64(serverErrors)/float64(n)*100)
	fmt.Printf("    Erreurs réseau/timeout               : %d (%.1f%%)\n",
		networkErrors, float64(networkErrors)/float64(n)*100)
	fmt.Println("════════════════════════════════════════════════════════════════")

	// Verdict — basé sur les VRAIS échecs (5xx + timeout), pas sur les 4xx
	// (en mode fake, les 4xx sont attendus car les sessions n'existent pas).
	fmt.Println("  VERDICT :")
	if realErrors == 0 && authErrors == 0 {
		if totalRetries202 > 0 {
			fmt.Printf("    ✅ Le 202 async PROTÈGE le pic : %d étudiants mis en file, %d retries,\n",
				totalRetries202, retriesCount)
			fmt.Printf("       AUCUN timeout ni 5xx — le cache RAM (donc les réponses) est préservé.\n")
			if success200 > 0 {
				fmt.Printf("       %d submits ont abouti en 200 (chemin complet).\n", success200)
			} else {
				fmt.Printf("       (0 succès 200 car mode fake — sessions fictives. Le comportement\n")
				fmt.Printf("        du limiter est validé : 202 renvoyés correctement sous saturation.)\n")
			}
		} else {
			fmt.Printf("    ✅ Système tient la charge sans saturation (0× 202, 0 erreur serveur).\n")
		}
	} else if realErrors < n/10 {
		fmt.Printf("    ⚠️  %d erreurs serveur/réseau (<10%%) — charge limite atteinte mais acceptable.\n", realErrors)
	} else {
		fmt.Printf("    ❌ %d erreurs serveur/réseau (≥10%%) — système en souffrance.\n", realErrors)
		fmt.Printf("       Recommandation : augmenter SUBMIT_MAX_CONCURRENT (>5) ou activer Render Starter.\n")
	}
	if authErrors > 0 {
		fmt.Printf("    ⚠️  %d erreurs 401/403 — vérifier le JWT_SECRET ou les comptes étudiants.\n", authErrors)
	}
	fmt.Println("════════════════════════════════════════════════════════════════")
}
