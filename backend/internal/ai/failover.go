// Package ai — failover automatique pour les appels LLM.
//
// Bug #3 (CRITICAL, audit ai-providers 2025) : avant ce fix, le backend ne
// faisait QUE `WHERE isActive=true LIMIT 1` — un seul provider, jamais de
// bascule. Si le provider actif tombait (429/500/timeout), l'erreur remontait
// directement à l'utilisateur.
//
// Ce fichier implémente le failover server-side :
//  1. Lire TOUS les providers actifs triés par priorité.
//  2. Tenter chaque provider en ordre.
//  3. En cas d'échec (429/500/timeout/erreur réseau), passer au suivant.
//  4. Logger chaque bascule dans AIFailoverEvent (bug #5).
//  5. Retourner le premier succès.
//
// La config failover (maxConsecutiveFailures, cooldownDurationMs) est lue
// depuis PlatformSettings(id='ai_failover_config') si elle existe.
package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// FailoverConfig est la configuration du failover lue depuis PlatformSettings.
type FailoverConfig struct {
	Enabled                bool `json:"enabled"`                // défaut true — BUG #3 fix: maintenant vérifié
	MaxConsecutiveFailures int  `json:"maxConsecutiveFailures"` // défaut 3
	CooldownDurationMs     int  `json:"cooldownDurationMs"`     // défaut 60000 (60s)
	RetryAllProviders      bool `json:"retryAllProviders"`      // défaut false
}

// DefaultFailoverConfig retourne la config par défaut si PlatformSettings est vide.
func DefaultFailoverConfig() FailoverConfig {
	return FailoverConfig{
		Enabled:                true,
		MaxConsecutiveFailures: 3,
		CooldownDurationMs:     60000,
		RetryAllProviders:      false,
	}
}

// FailoverResult contient le résultat d'un appel avec failover.
type FailoverResult struct {
	Content      string
	Model        string
	ProviderUsed *ActiveProvider
	FailoverUsed bool // true si un provider de secours a été utilisé
}

// auditCtx construit un contexte DÉTACHÉ pour les écritures d'audit de
// failover (AIFailoverEvent). SECT-LATENCY-3 : avant, logFailoverEvent
// utilisait le ctx de la requête — quand l'appel IA échouait PARCE QUE ce
// ctx expirait (deadline 20-30s), l'INSERT échouait instantanément lui
// aussi → la table restait VIDE, exactement au moment où on avait besoin
// d'elle pour diagnostiquer. context.WithoutCancel garde les valeurs du
// ctx (trace) mais survit à l'annulation parent ; timeout court pour ne
// pas retarder la réponse.
func auditCtx(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
}

// attemptCtx borne UNE tentative provider quand le budget total est court
// (endpoint interactif). SECT-LATENCY-3 : avant, un provider qui pendait
// (connexion ouverte, jamais de réponse) consommait TOUT le budget — la
// chaîne de failover n'avait plus rien à distribuer aux suivants (3×30s
// constatés en prod : un seul essai effectif, 0 événement loggable).
// Politique v3 (SECT-LATENCY-4, mesure prod 19:57) : part FIXE de 15s par
// tentative (dans la limite du restant). v2 = 12s — la v1 « moitié du
// restant » affamait les providers
// de fin de chaîne (OpenRouter coupé à 4,7s alors qu'un QCM complet
// demande ~6s : providers lents en tête + part décroissante = les
// meilleurs jamais à l'aise). Budget long (workers, 5 min) : inchangé.
//
// SECT-LATENCY-4 : retourne aussi « capped » — vrai quand le restant était
// INFÉRIEUR à la part fixe, c'est-à-dire quand le provider n'a pas reçu sa
// part complète. Une deadline-exceeded sur une tentative capped est la
// faute du BUDGET PARENT (pas du provider) : le failover ne doit PAS le
// mettre en cooldown (cf. innocence dans ChatWithFailover).
func attemptCtx(ctx context.Context) (context.Context, context.CancelFunc, bool) {
	dl, ok := ctx.Deadline()
	if !ok {
		return ctx, func() {}, false
	}
	remaining := time.Until(dl)
	if remaining >= 60*time.Second {
		return ctx, func() {}, false
	}
	// SECT-LATENCY-4 : 15 s (mesure prod 19:57 — kimi-k2.6/OpenRouter
	// générait un QCM complet à ~46 tok/s : TTFB 1-2 s + ~400 tokens ≈
	// 10-12 s ; la part de 12 s coupait la réponse EN COURS. 15 s couvre
	// la génération avec marge pour la variabilité de charge des modèles
	// gratuits, tout en restant bornée (un provider pendant ne peut plus
	// emporter le budget).
	perAttempt := 15 * time.Second
	capped := remaining < perAttempt
	if capped {
		perAttempt = remaining
	}
	if perAttempt <= 0 {
		// Budget parent déjà épuisé : le ctx renvoyé est immédiatement mort.
		c, cancel := context.WithTimeout(ctx, 0)
		return c, cancel, true
	}
	c, cancel := context.WithTimeout(ctx, perAttempt)
	return c, cancel, capped
}

// ──────────────────────────────────────────────────────────────────────────
// SECT-LATENCY-3 : cooldown mémoire (implémentation de CooldownDurationMs)
// SECT-LATENCY-4 : cooldown JUSTE — deux distinctions mesurées en prod :
//   1. INNOCENT : un provider coupé par le budget PARENT épuisé (pas par sa
//      propre lenteur) ne reçoit AUCUN cooldown. Avant, OpenRouter — le seul
//      provider fonctionnel — était mis en cooldown 5 min parce que
//      MuleRouter (priorité devant lui) avait mangé 12 s du budget de 20 s
//      du landing-demo : la chaîne punissait le sauveteur pour la faute du
//      retardataire, et l'essai suivant partait avec 0 provider disponible.
//   2. HARD-FAIL : une erreur client PERMANENTE (401/403 clé invalide, 404
//      modèle inexistant, 402 crédits) reçoit un cooldown ÉTENDU (30 min)
//      au lieu du cooldown général. Ces erreurs ne se guérissent pas seules
//      — les retenter toutes les 5 min ne fait que brûler du budget et du
//      bruit d'audit. La règle « provider de tête toujours essayé » ne
//      l'exempte plus : un 403 permanent en priorité 1 ne doit pas être
//      réessayé à CHAQUE appel (0,2 s + 1 événement d'audit à chaque fois).
// ──────────────────────────────────────────────────────────────────────────

// cooldownEntry : moment du dernier échec + nature (hard ou transitoire).
type cooldownEntry struct {
	at   time.Time
	hard bool // erreur client permanente → cooldown étendu 30 min
}

// hardFailCooldown : fenêtre fixe pour les erreurs de configuration (clé,
// modèle, crédits). Indépendante du réglage CooldownDurationMs (qui couvre
// le transitoire : 429, 5xx, timeouts réseau).
const hardFailCooldown = 30 * time.Minute

// isHardFail détermine si une erreur d'appel provider est une erreur client
// PERMANENTE (ne se corrige pas sans intervention) : 401/403/404/402, et
// tout 4xx sauf 408 (request timeout) et 429 (quota — transitoire par
// nature). Les 5xx sont transitoires (panne du provider, réessayable).
func isHardFail(err error) bool {
	var phe *ProviderHTTPError
	if errors.As(err, &phe) {
		switch phe.StatusCode {
		case 408, 429:
			return false
		}
		return phe.StatusCode >= 400 && phe.StatusCode < 500
	}
	return false
}

// providerInCooldown indique si le provider a échoué récemment : fenêtre
// CooldownDurationMs (transitoire) ou hardFailCooldown (permanent). Le
// provider de TÊTE (priorité 1) reste exempté pour garantir une tentative
// réelle et une erreur parlante — SAUF s'il est en hard-fail (cf. ci-dessus).
func (s *AIService) providerInCooldown(id string, config FailoverConfig) bool {
	s.failMu.Lock()
	defer s.failMu.Unlock()
	if s.lastFailures == nil {
		return false
	}
	e, ok := s.lastFailures[id]
	if !ok {
		return false
	}
	if e.hard {
		return time.Since(e.at) < hardFailCooldown
	}
	if config.CooldownDurationMs <= 0 {
		return false
	}
	return time.Since(e.at) < time.Duration(config.CooldownDurationMs)*time.Millisecond
}

// providerHardFailed indique si le DERNIER échec du provider était une
// erreur client permanente. Utilisé pour retirer l'exemption de tête au
// provider priorité 1 cassé en configuration (403/404 à répétition).
func (s *AIService) providerHardFailed(id string) bool {
	s.failMu.Lock()
	defer s.failMu.Unlock()
	e, ok := s.lastFailures[id]
	return ok && e.hard
}

// providerFailed enregistre l'échec (démarre le cooldown). hard=true pour
// une erreur client permanente (cooldown étendu).
func (s *AIService) providerFailed(id string, hard bool) {
	s.failMu.Lock()
	defer s.failMu.Unlock()
	if s.lastFailures == nil {
		s.lastFailures = make(map[string]cooldownEntry)
	}
	s.lastFailures[id] = cooldownEntry{at: time.Now(), hard: hard}
}

// providerSucceeded efface le cooldown (guérison).
func (s *AIService) providerSucceeded(id string) {
	s.failMu.Lock()
	defer s.failMu.Unlock()
	if s.lastFailures != nil {
		delete(s.lastFailures, id)
	}
}

// ChatWithFailover tente l'appel LLM avec failover automatique.
//
// Comportement :
//  1. Lit tous les providers actifs triés par priorité.
//  2. Passe les providers en cooldown (échec récent — SECT-LATENCY-3 :
//     CooldownDurationMs ENFIN implémenté, la doc le promettait).
//  3. Pour chaque provider restant, tente ChatCompletion (borné par
//     tentative si le budget global est court, cf. attemptCtx).
//  4. Si succès → retourne le résultat.
//  5. Si échec → log dans AIFailoverEvent, passe au suivant.
//  6. Si tous échouent → retourne la dernière erreur.
func (s *AIService) ChatWithFailover(ctx context.Context, messages []ChatMessage, logger *slog.Logger) (*FailoverResult, error) {
	providers, err := s.getActiveProvidersForFailover(ctx)
	if err != nil {
		return nil, err
	}

	if len(providers) == 0 {
		return nil, fmt.Errorf("aucun provider IA actif — activez un provider via /api/ai-providers/activate")
	}

	config := s.getFailoverConfig(ctx)

	// BUG #3 fix : si le failover est désactivé, essayer uniquement le provider principal.
	if !config.Enabled {
		result, err := s.chatWithProvider(ctx, providers[0], messages)
		if err != nil {
			return nil, fmt.Errorf("provider principal %s échoué (failover désactivé): %w", providers[0].Name, err)
		}
		return &FailoverResult{
			Content:      result.Content,
			Model:        result.Model,
			ProviderUsed: providers[0],
			FailoverUsed: false,
		}, nil
	}

	var lastErr error
	var prevProvider *ActiveProvider // BUG #10 fix: pour tracer fromProvider→toProvider

	// SECT-LATENCY-4 : pré-filtrage des providers éligibles (cooldown),
	// AVANT de boucler, pour garantir le garde-fou : si TOUT est en
	// cooldown, on tente quand même le provider de tête — une tentative
	// réelle avec une erreur parlante vaut mieux qu'un échec abstrait
	// « tous en cooldown » sans aucune mesure réseau.
	type eligibleProvider struct {
		idx int
		p   *ActiveProvider
	}
	var eligible []eligibleProvider
	for i, p := range providers {
		// La tête (i=0) reste exemptée de cooldown pour garantir une
		// tentative réelle — SAUF hard-fail (erreur client permanente :
		// la retenter ne peut pas réussir ; mesure prod : Mistral 403
		// priorité 1 retenté à CHAQUE appel, 0,2 s + 1 événement d'audit).
		if (i > 0 || s.providerHardFailed(p.ID)) && s.providerInCooldown(p.ID, config) {
			if logger != nil {
				logger.Warn("AI provider en cooldown, sauté",
					"provider", p.Name,
					"cooldown_ms", config.CooldownDurationMs,
				)
			}
			continue
		}
		eligible = append(eligible, eligibleProvider{idx: i, p: p})
	}
	if len(eligible) == 0 {
		if logger != nil {
			logger.Warn("Tous les providers IA en cooldown — tentative du provider de tête en dernier recours",
				"provider", providers[0].Name,
			)
		}
		eligible = append(eligible, eligibleProvider{idx: 0, p: providers[0]})
	}

	for _, ep := range eligible {
		i, p := ep.idx, ep.p

		// SECT-LATENCY-4 : budget parent épuisé → ne pas « torturer »
		// les providers suivants avec des miettes. Mesuré en prod :
		// DeepSeek, Cerebras et ZAI recevaient 0,1-0,3 s en fin de
		// chaîne et échouaient instantanément par deadline — polluant
		// l'audit d'événements FAIL_OVER trompeurs (leurs erreurs
		// réelles sont 402/404 en < 1 s, pas des timeouts).
		if dl, ok := ctx.Deadline(); ok && time.Until(dl) < 500*time.Millisecond {
			if logger != nil {
				logger.Warn("Budget IA parent épuisé avant d'essayer le provider suivant",
					"provider", p.Name,
				)
			}
			break
		}

		// Tenter l'appel avec ce provider — borné par tentative si le
		// budget global est court (SECT-LATENCY-3, cf. attemptCtx).
		// capped = le provider n'a pas reçu sa part fixe complète.
		attCtx, cancelAttempt, capped := attemptCtx(ctx)
		result, err := s.chatWithProvider(attCtx, p, messages)
		cancelAttempt()
		if err == nil {
			s.providerSucceeded(p.ID)
			// Succès !
			if i > 0 && logger != nil {
				logger.Info("AI failover réussi",
					"failed_provider", providers[0].Name,
					"fallback_provider", p.Name,
				)
			}
			// BUG #9 fix: logger un événement FAIL_OVER si on a basculé
			if i > 0 && prevProvider != nil {
				s.logFailoverSuccessEvent(ctx, prevProvider, p)
			}
			return &FailoverResult{
				Content:      result.Content,
				Model:        result.Model,
				ProviderUsed: p,
				FailoverUsed: i > 0,
			}, nil
		}

		// Échec : logger et passer au suivant.
		lastErr = err
		prevProvider = p

		// SECT-LATENCY-4 — COOLDOWN JUSTE : un provider n'est mis en
		// cooldown QUE s'il est coupable (l'échec lui appartient :
		// erreur HTTP du provider, deadline de SA part fixe, réseau).
		// Innocent si l'erreur est une annulation/deadline ET :
		//   - la tentative était capped (part fixe non perçue, coupé
		//     par le budget PARENT — cas mesuré : OpenRouter recevait
		//     7,4 s restants au lieu de ses 12 s), ou
		//   - le ctx parent est mort (budget épuisé / client parti).
		// Avant le fix, le SAUVETEUR était puni 5 min pour la faute
		// du retardataire qui avait mangé le budget — l'appel suivant
		// partait avec AUCUN provider disponible (0,4 s → 503 sec).
		deadlineErr := errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled)
		innocent := deadlineErr && (capped || ctx.Err() != nil)
		if !innocent {
			s.providerFailed(p.ID, isHardFail(err))
		}
		if logger != nil {
			logger.Warn("AI provider échec, bascule vers le suivant",
				"provider", p.Name,
				"error", err.Error(),
				"innocent", innocent,
				"hard_fail", isHardFail(err),
				"next_index", i+1,
				"total_providers", len(providers),
			)
		}

		// Bug #5 : logger dans AIFailoverEvent (best-effort, ne bloque pas).
		// BUG #10 fix: passer le provider suivant pour fromProvider/toProvider.
		nextProvider := getNextProvider(providers, i+1)
		s.logFailoverEvent(ctx, p, nextProvider, err, i+1 < len(providers))
	}

	return nil, fmt.Errorf("tous les providers IA ont échoué, dernière erreur: %w", lastErr)
}

// getNextProvider retourne le provider à l'index donné, ou nil si hors limites.
// Utilisé pour renseigner fromProvider/toProvider dans AIFailoverEvent.
func getNextProvider(providers []*ActiveProvider, idx int) *ActiveProvider {
	if idx < len(providers) {
		return providers[idx]
	}
	return nil
}

// getActiveProvidersForFailover lit TOUS les providers actifs de capability='chat'
// triés par priorité. MULTI-CAPABILITY : filtre sur capability='chat' pour que le
// failover ne bascule qu'entre providers chat (jamais vers un provider tts/audio).
// Utilisé par ChatWithFailover pour avoir une liste de secours.
func (s *AIService) getActiveProvidersForFailover(ctx context.Context) ([]*ActiveProvider, error) {
	tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)"); err != nil {
		return nil, fmt.Errorf("set system claims: %w", err)
	}

	rows, err := tx.Query(ctx, `
                SELECT "id", "name", "provider",
                       COALESCE("baseUrl", ''), COALESCE("apiKey", ''), COALESCE("model", ''),
                       COALESCE("temperature", 0.7), COALESCE("maxTokens", 4096),
                       COALESCE("extraConfig", ''), COALESCE("capability", 'chat')
                FROM "AIProviderConfig"
                WHERE "isActive" = true AND COALESCE("capability", 'chat') = 'chat'
                ORDER BY "priority" ASC, "createdAt" ASC
        `)
	if err != nil {
		return nil, fmt.Errorf("query providers: %w", err)
	}
	defer rows.Close()

	var providers []*ActiveProvider
	for rows.Next() {
		p := &ActiveProvider{}
		// DASHSCOPE-AUDIO-1 : scan aussi la colonne capability (NULL → 'chat').
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Provider,
			&p.BaseURL, &p.APIKey, &p.Model,
			&p.Temperature, &p.MaxTokens, &p.ExtraConfig, &p.Capability,
		); err != nil {
			return nil, fmt.Errorf("scan provider: %w", err)
		}

		// Bug #2 : fusionner extraConfig (ZAI).
		ec := ParseExtraConfig(p.ExtraConfig)
		if ec.APIKey != "" && p.APIKey == "" {
			p.APIKey = ec.APIKey
		}
		if ec.BaseURL != "" && p.BaseURL == "" {
			p.BaseURL = ec.BaseURL
		}

		// Defaults de secours.
		if p.Model == "" {
			p.Model = "gpt-4o-mini"
		}
		if p.MaxTokens <= 0 {
			p.MaxTokens = 4096
		}

		// Skip providers invalides (sans baseUrl ou apiKey).
		if p.BaseURL == "" || p.APIKey == "" {
			continue
		}

		providers = append(providers, p)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows err: %w", err)
	}

	return providers, nil
}

// getFailoverConfig lit la config failover depuis PlatformSettings.
// Retourne DefaultFailoverConfig si la config est absente ou invalide.
func (s *AIService) getFailoverConfig(ctx context.Context) FailoverConfig {
	tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return DefaultFailoverConfig()
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

	var settingsJSON string
	err = tx.QueryRow(ctx, `SELECT "settings" FROM "PlatformSettings" WHERE "id" = 'ai_failover_config'`).Scan(&settingsJSON)
	if err != nil {
		return DefaultFailoverConfig()
	}

	var cfg FailoverConfig
	if err := json.Unmarshal([]byte(settingsJSON), &cfg); err != nil {
		return DefaultFailoverConfig()
	}

	// Defaults si champs manquants.
	if cfg.MaxConsecutiveFailures <= 0 {
		cfg.MaxConsecutiveFailures = 3
	}
	if cfg.CooldownDurationMs <= 0 {
		cfg.CooldownDurationMs = 60000
	}
	return cfg
}

// logFailoverEvent insère une entrée dans AIFailoverEvent (best-effort).
// Bug #5 : la table d'audit était toujours vide. Maintenant chaque échec
// provider est tracé pour diagnostic post-mortem.
// BUG #9 fix: utilise FAIL_OVER au lieu de PROVIDER_FAILURE quand un fallback existe.
// BUG #10 fix: remplit fromProvider et toProvider pour tracer la chaîne de bascule.
func (s *AIService) logFailoverEvent(ctx context.Context, failedProvider *ActiveProvider, nextProvider *ActiveProvider, callErr error, hasFallback bool) {
	// SECT-LATENCY-3 : ctx détaché (survit à l'annulation de la requête).
	ctx, cancel := auditCtx(ctx)
	defer cancel()

	tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

	// BUG #9 fix: utiliser FAIL_OVER quand il y a un provider de secours.
	eventType := "FAIL_OVER"
	if !hasFallback {
		eventType = "ALL_PROVIDERS_FAILED"
	}

	// Tronquer l'erreur pour éviter un log trop volumineux.
	errMsg := callErr.Error()
	if len(errMsg) > 500 {
		errMsg = errMsg[:500] + "…"
	}

	// BUG #10 fix: remplir fromProvider et toProvider.
	var fromProvider, toProvider *string
	from := failedProvider.Name
	fromProvider = &from
	if nextProvider != nil {
		to := nextProvider.Name
		toProvider = &to
	}

	_, _ = tx.Exec(ctx, `
                INSERT INTO "AIFailoverEvent" ("id", "providerId", "providerName", "eventType", "fromProvider", "toProvider", "reason", "errorDetails", "resolved", "createdAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, CURRENT_TIMESTAMP)
        `,
		"failover-"+failedProvider.ID+"-"+fmt.Sprintf("%d", time.Now().UnixNano()),
		failedProvider.ID, failedProvider.Name, eventType,
		fromProvider, toProvider,
		"HTTP error or timeout during chat completion",
		errMsg,
	)

	_ = tx.Commit(ctx)
}

// logFailoverSuccessEvent insère un événement RECOVERY quand le failover réussit
// (BUG #9 fix: tracer les bascules réussies, pas seulement les échecs).
func (s *AIService) logFailoverSuccessEvent(ctx context.Context, fromProvider *ActiveProvider, toProvider *ActiveProvider) {
	// SECT-LATENCY-3 : ctx détaché (cf. auditCtx).
	ctx, cancel := auditCtx(ctx)
	defer cancel()

	tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

	fromName := fromProvider.Name
	toName := toProvider.Name

	_, _ = tx.Exec(ctx, `
                INSERT INTO "AIFailoverEvent" ("id", "providerId", "providerName", "eventType", "fromProvider", "toProvider", "reason", "errorDetails", "resolved", "createdAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, '', true, CURRENT_TIMESTAMP)
        `,
		"recovery-"+toProvider.ID+"-"+fmt.Sprintf("%d", time.Now().UnixNano()),
		toProvider.ID, toProvider.Name, "RECOVERY",
		fromName, toName,
		fmt.Sprintf("Failover réussi: %s → %s", fromProvider.Name, toProvider.Name),
	)

	_ = tx.Commit(ctx)
}

// chatWithProvider fait l'appel LLM avec un provider spécifique.
// Wrapper autour de ChatCompletion qui utilise un ActiveProvider explicite.
func (s *AIService) chatWithProvider(ctx context.Context, p *ActiveProvider, messages []ChatMessage) (*ChatResult, error) {
	// Construire le body OpenAI-compatible.
	body := map[string]interface{}{
		"model":       p.Model,
		"messages":    messages,
		"temperature": p.Temperature,
		"max_tokens":  p.MaxTokens,
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode body: %w", err)
	}

	url := strings.TrimRight(p.BaseURL, "/") + "/chat/completions"
	req, err := newRequestWithContext(ctx, "POST", url, bodyBytes, p.APIKey)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("appel provider %s: %w", p.Name, err)
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := readResponseBody(resp)
	if err != nil {
		return nil, fmt.Errorf("lire réponse provider: %w", err)
	}

	if resp.StatusCode >= 400 {
		snippet := string(respBody)
		if len(snippet) > 300 {
			snippet = snippet[:300] + "…"
		}
		// SECT-LATENCY-4 : erreur typée (cf. ProviderHTTPError) pour que
		// le failover distingue erreurs permanentes et transitoires.
		return nil, &ProviderHTTPError{ProviderName: p.Name, StatusCode: resp.StatusCode, Body: snippet}
	}

	var parsed struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("parse réponse provider %s: %w", p.Name, err)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("provider %s: réponse sans choix", p.Name)
	}

	content := parsed.Choices[0].Message.Content
	model := parsed.Model
	if model == "" {
		model = p.Model
	}

	return &ChatResult{Content: content, Model: model}, nil
}
