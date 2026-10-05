// Package monitoring — healthcheck service pour vérifier l'état réel des services.
//
// Bug B2 (CRITICAL, audit monitoring 2025) : les 6 services (API/DB/Auth/etc.)
// étaient hardcodés à 99.9x% dans le frontend. Ce service fait de vrais checks.
package monitoring

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
)

// ServiceStatus représente l'état d'un service monitoré.
type ServiceStatus struct {
	Name        string    `json:"name"`
	Status      string    `json:"status"`      // OPERATIONNEL | DEGRADE | INDISPONIBLE
	Uptime      string    `json:"uptime"`      // ADR-0011 : vide — pas de SLA mesuré (uptime fake supprimé)
	Latency     int64     `json:"latency"`     // ms
	LastCheck   string    `json:"lastCheck"`   // ISO timestamp
	LastError   string    `json:"lastError"`   // message d'erreur (vide si OK)
	ActiveConns int       `json:"activeConns"` // ADR-0011 : connexions DB actives (checkDatabase)
	CheckedAt   time.Time `json:"-"`
}

// HealthReport est le rapport complet de santé des services.
type HealthReport struct {
	Services     []ServiceStatus `json:"services"`
	Overall      string          `json:"overall"` // OPERATIONNEL | DEGRADE | INDISPONIBLE
	HealthyCount int             `json:"healthyCount"`
	TotalCount   int             `json:"totalCount"`
	CheckedAt    time.Time       `json:"checkedAt"`
}

// HealthChecker vérifie l'état réel des services.
type HealthChecker struct {
	pool   *pgxpool.Pool
	client *http.Client
}

// NewHealthChecker crée un nouveau HealthChecker.
func NewHealthChecker(pool *pgxpool.Pool) *HealthChecker {
	return &HealthChecker{
		pool:   pool,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// CheckAll vérifie tous les services en parallèle et retourne un rapport.
func (h *HealthChecker) CheckAll(ctx context.Context) *HealthReport {
	services := []ServiceStatus{
		h.checkDatabase(ctx),
		h.checkAPI(ctx),
		h.checkAuth(ctx),
		h.checkEvaluation(ctx),
		h.checkPayment(ctx),
		h.checkAI(ctx),
	}

	healthy := 0
	for _, s := range services {
		if s.Status == "OPERATIONNEL" {
			healthy++
		}
	}

	overall := "OPERATIONNEL"
	if healthy < len(services) {
		overall = "DEGRADE"
	}
	if healthy == 0 {
		overall = "INDISPONIBLE"
	}

	return &HealthReport{
		Services:     services,
		Overall:      overall,
		HealthyCount: healthy,
		TotalCount:   len(services),
		CheckedAt:    time.Now(),
	}
}

// checkDatabase vérifie la connexion Neon Postgres.
func (h *HealthChecker) checkDatabase(ctx context.Context) ServiceStatus {
	name := "Base de données"
	start := time.Now()

	if h.pool == nil {
		return h.fail(name, "pool DB non initialisé")
	}

	// Ping avec timeout
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	err := h.pool.Ping(pingCtx)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return ServiceStatus{
			Name:      name,
			Status:    "INDISPONIBLE",
			Uptime:    "",
			Latency:   latency,
			LastCheck: time.Now().Format(time.RFC3339),
			LastError: err.Error(),
			CheckedAt: time.Now(),
		}
	}

	// ADR-0011 : le nombre de connexions actives est désormais EXPOSÉ
	// (avant : scanné puis jeté). Métrique réelle du pool Neon.
	var activeConns int
	_ = h.pool.QueryRow(pingCtx, "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'").Scan(&activeConns)

	status := "OPERATIONNEL"
	if latency > 1000 {
		status = "DEGRADE"
	}

	return ServiceStatus{
		Name:        name,
		Status:      status,
		Uptime:      "", // ADR-0011 : plus de SLA hardcodé — latence + status mesurés
		Latency:     latency,
		LastCheck:   time.Now().Format(time.RFC3339),
		LastError:   "",
		ActiveConns: activeConns,
		CheckedAt:   time.Now(),
	}
}

// checkAPI vérifie l'API gateway (self).
func (h *HealthChecker) checkAPI(ctx context.Context) ServiceStatus {
	name := "API Gateway"
	start := time.Now()

	// Self-check : si ce code s'exécute, l'API répond
	latency := time.Since(start).Milliseconds()
	return ServiceStatus{
		Name:      name,
		Status:    "OPERATIONNEL",
		Uptime:    "",
		Latency:   latency,
		LastCheck: time.Now().Format(time.RFC3339),
		LastError: "",
		CheckedAt: time.Now(),
	}
}

// checkAuth vérifie le service d'authentification (JWT signer).
func (h *HealthChecker) checkAuth(ctx context.Context) ServiceStatus {
	name := "Auth"
	start := time.Now()

	// Check : peut-on lire un user dans la DB ? (le service auth dépend de la DB)
	if h.pool == nil {
		return h.fail(name, "pool DB non initialisé")
	}

	authCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var count int
	err := db.WithSystemTx(authCtx, h.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(authCtx, `SELECT count(*) FROM "User" WHERE "role" = 'ADMIN' LIMIT 1`).Scan(&count)
	})
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return ServiceStatus{
			Name:      name,
			Status:    "DEGRADE",
			Uptime:    "",
			Latency:   latency,
			LastCheck: time.Now().Format(time.RFC3339),
			LastError: err.Error(),
			CheckedAt: time.Now(),
		}
	}

	return ServiceStatus{
		Name:      name,
		Status:    "OPERATIONNEL",
		Uptime:    "",
		Latency:   latency,
		LastCheck: time.Now().Format(time.RFC3339),
		LastError: "",
		CheckedAt: time.Now(),
	}
}

// checkEvaluation vérifie le service d'évaluation (table Epreuve accessible).
func (h *HealthChecker) checkEvaluation(ctx context.Context) ServiceStatus {
	name := "Évaluation"
	start := time.Now()

	if h.pool == nil {
		return h.fail(name, "pool DB non initialisé")
	}

	evalCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var count int
	err := db.WithSystemTx(evalCtx, h.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(evalCtx, `SELECT count(*) FROM "Epreuve" WHERE "deletedAt" IS NULL LIMIT 1`).Scan(&count)
	})
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return h.fail(name, fmt.Sprintf("DB error: %v", err))
	}

	return ServiceStatus{
		Name:      name,
		Status:    "OPERATIONNEL",
		Uptime:    "",
		Latency:   latency,
		LastCheck: time.Now().Format(time.RFC3339),
		LastError: "",
		CheckedAt: time.Now(),
	}
}

// checkPayment vérifie le service de paiement (table Abonnement accessible).
func (h *HealthChecker) checkPayment(ctx context.Context) ServiceStatus {
	name := "Paiement"
	start := time.Now()

	if h.pool == nil {
		return h.fail(name, "pool DB non initialisé")
	}

	payCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var count int
	err := db.WithSystemTx(payCtx, h.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(payCtx, `SELECT count(*) FROM "Abonnement" LIMIT 1`).Scan(&count)
	})
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return h.fail(name, fmt.Sprintf("DB error: %v", err))
	}

	return ServiceStatus{
		Name:      name,
		Status:    "OPERATIONNEL",
		Uptime:    "",
		Latency:   latency,
		LastCheck: time.Now().Format(time.RFC3339),
		LastError: "",
		CheckedAt: time.Now(),
	}
}

// checkAI vérifie le service IA (provider actif accessible).
func (h *HealthChecker) checkAI(ctx context.Context) ServiceStatus {
	name := "Proctoring IA"
	start := time.Now()

	if h.pool == nil {
		return h.fail(name, "pool DB non initialisé")
	}

	aiCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var count int
	err := db.WithSystemTx(aiCtx, h.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(aiCtx, `SELECT count(*) FROM "AIProviderConfig" WHERE "isActive" = true LIMIT 1`).Scan(&count)
	})
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return h.fail(name, fmt.Sprintf("DB error: %v", err))
	}

	if count == 0 {
		return ServiceStatus{
			Name:      name,
			Status:    "DEGRADE",
			Uptime:    "",
			Latency:   latency,
			LastCheck: time.Now().Format(time.RFC3339),
			LastError: "aucun provider IA actif",
			CheckedAt: time.Now(),
		}
	}

	return ServiceStatus{
		Name:      name,
		Status:    "OPERATIONNEL",
		Uptime:    "",
		Latency:   latency,
		LastCheck: time.Now().Format(time.RFC3339),
		LastError: "",
		CheckedAt: time.Now(),
	}
}

// fail retourne un ServiceStatus INDISPONIBLE.
func (h *HealthChecker) fail(name, errMsg string) ServiceStatus {
	return ServiceStatus{
		Name:      name,
		Status:    "INDISPONIBLE",
		Uptime:    "",
		Latency:   0,
		LastCheck: time.Now().Format(time.RFC3339),
		LastError: errMsg,
		CheckedAt: time.Now(),
	}
}

// RunParallelChecks exécute tous les checks en parallèle (pour usage futur).
func RunParallelChecks(checks map[string]func() ServiceStatus) map[string]ServiceStatus {
	var wg sync.WaitGroup
	results := make(map[string]ServiceStatus)
	var mu sync.Mutex

	for name, check := range checks {
		wg.Add(1)
		go func(n string, c func() ServiceStatus) {
			defer wg.Done()
			status := c()
			mu.Lock()
			results[n] = status
			mu.Unlock()
		}(name, check)
	}

	wg.Wait()
	return results
}
