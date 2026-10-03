// Package worker — clôture automatique des épreuves expirées.
//
// CLOTURE-AUTO-WORKER : goroutine périodique qui vérifie toutes les 60s les
// épreuves EN_COURS dont la dateFin + delaiGrace est dépassée, et les clôture
// automatiquement en DB.
//
// Aussi : clôture TOUS_SOUMIS — quand toutes les sessions d'une épreuve
// EN_COURS sont SOUMISES/CORRIGEE/RETOURNEE (plus aucune EN_COURS ou
// NON_COMMENCEE), l'épreuve est clôturée automatiquement.
//
// Ce worker garantit que les épreuves sont clôturées même sans étudiant
// actif pollant /api/epreuves/auto-close.
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
)

// AutoCloseWorker vérifie périodiquement les épreuves à clôture automatique.
type AutoCloseWorker struct {
	dbPool *pgxpool.Pool
	logger *slog.Logger
}

// NewAutoCloseWorker crée un nouveau worker de clôture automatique.
func NewAutoCloseWorker(dbPool *pgxpool.Pool, logger *slog.Logger) *AutoCloseWorker {
	return &AutoCloseWorker{dbPool: dbPool, logger: logger}
}

// Start lance le worker en goroutine (non-bloquant).
// À appeler dans main.go avant le serveur HTTP.
func (w *AutoCloseWorker) Start(ctx context.Context) {
	w.logger.Info("AutoClose Worker started, checking every 60s...")

	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()

		// Premier check immédiat au démarrage (récupération des épreuves
		// expirées pendant que le serveur était down).
		w.checkAndClose(ctx)

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("AutoClose Worker stopping...")
				return
			case <-ticker.C:
				w.checkAndClose(ctx)
			}
		}
	}()
}

// checkAndClose effectue les trois types de clôture automatique :
//  1. Délai dépassé : dateFin + delaiGrace < now
//  2. TOUS_SOUMIS : toutes les sessions sont SOUMISES/CORRIGEE/RETOURNEE
//  3. Sessions orphelines : EN_COURS sur épreuve close/supprimée
//     depuis > 24h → NON_SOUMIS (SECT-ANNEE-SURVEILLANCE)
func (w *AutoCloseWorker) checkAndClose(ctx context.Context) {
	closedByTimeout, err := w.closeExpiredEpreuves(ctx)
	if err != nil {
		w.logger.Error("AutoClose: closeExpiredEpreuves failed", "error", err)
	}
	if closedByTimeout > 0 {
		w.logger.Info("AutoClose: epreuves clôturées (délai dépassé)", "count", closedByTimeout)
	}

	closedByAllSubmitted, err := w.closeAllSubmittedEpreuves(ctx)
	if err != nil {
		w.logger.Error("AutoClose: closeAllSubmittedEpreuves failed", "error", err)
	}
	if closedByAllSubmitted > 0 {
		w.logger.Info("AutoClose: epreuves clôturées (tous soumis)", "count", closedByAllSubmitted)
	}

	// SECT-ANNEE-SURVEILLANCE : finaliser les sessions EN_COURS orphelines
	// (épreuve close ou supprimée depuis > 24h). Sans ça, un étudiant ayant
	// fermé son navigateur en plein examen — typiquement à la frontière d'un
	// changement d'année académique — laissait une session « active » pour
	// toujours : le KPI « Sessions actives » de la surveillance la comptait
	// indéfiniment, toutes années confondues.
	finalizedSessions, err := w.finalizeStaleSessions(ctx)
	if err != nil {
		w.logger.Error("AutoClose: finalizeStaleSessions failed", "error", err)
	}
	if finalizedSessions > 0 {
		w.logger.Info("AutoClose: sessions EN_COURS finalisées (épreuve close/supprimée)", "count", finalizedSessions)
	}
}

// closeExpiredEpreuves clôture les épreuves EN_COURS dont dateFin + grâce < now.
func (w *AutoCloseWorker) closeExpiredEpreuves(ctx context.Context) (int, error) {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Poser les claims system-worker pour RLS (policies Epreuve_all_system).
	if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
		return 0, fmt.Errorf("set claims: %w", err)
	}

	now := time.Now().UTC()

	// Clôturer toutes les épreuves EN_COURS ou TERMINEE dont
	// dateFin + delaiGrace < now.
	cmd, err := tx.Exec(ctx, `
                UPDATE "Epreuve"
                SET "statut" = 'CLOTUREE',
                    "clotureeAt" = $1,
                    "clotureeAutomatiquement" = true,
                    "raisonCloture" = 'Délai dépassé (fin de période + grâce)',
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "statut" IN ('EN_COURS', 'TERMINEE')
                  AND "deletedAt" IS NULL
                  AND "dateFin" IS NOT NULL
                  AND ("dateFin" + make_interval(mins => COALESCE("delaiGrace", 0))) < $1
        `, now)
	if err != nil {
		return 0, fmt.Errorf("update expired epreuves: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}

	closedCount := int(cmd.RowsAffected())
	if closedCount > 0 {
		// SECT-ALERTES-FIX-1 P5 : créer une Alerte SYSTEME + notifier l'enseignant
		// pour chaque épreuve clôturée automatiquement. Non bloquant.
		w.createAutoCloseAlertes(ctx, now)
	}

	return closedCount, nil
}

// closeAllSubmittedEpreuves clôture les épreuves EN_COURS où toutes les
// sessions sont SOUMISES, CORRIGEE ou RETOURNEE (plus aucune EN_COURS ou
// NON_COMMENCEE). Nécessite au moins 1 session pour déclencher.
func (w *AutoCloseWorker) closeAllSubmittedEpreuves(ctx context.Context) (int, error) {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
		return 0, fmt.Errorf("set claims: %w", err)
	}

	now := time.Now().UTC()

	// Trouver les épreuves EN_COURS qui ont au moins 1 session ET où
	// aucune session n'est EN_COURS ou NON_COMMENCEE.
	rows, err := tx.Query(ctx, `
                SELECT e."id", e."titre"
                FROM "Epreuve" e
                WHERE e."statut" = 'EN_COURS'
                  AND e."deletedAt" IS NULL
                  AND EXISTS (SELECT 1 FROM "SessionPassation" s WHERE s."epreuveId" = e."id")
                  AND NOT EXISTS (
                    SELECT 1 FROM "SessionPassation" s
                    WHERE s."epreuveId" = e."id"
                      AND s."statut" IN ('EN_COURS', 'NON_COMMENCEE')
                  )
        `)
	if err != nil {
		return 0, fmt.Errorf("query all-submitted epreuves: %w", err)
	}

	var epreuveIDs []string
	var titres []string
	for rows.Next() {
		var id, titre string
		if err := rows.Scan(&id, &titre); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan: %w", err)
		}
		epreuveIDs = append(epreuveIDs, id)
		titres = append(titres, titre)
	}
	rows.Close()

	if len(epreuveIDs) == 0 {
		if err := tx.Commit(ctx); err != nil {
			return 0, fmt.Errorf("commit (no rows): %w", err)
		}
		return 0, nil
	}

	// Clôturer ces épreuves
	cmd, err := tx.Exec(ctx, `
                UPDATE "Epreuve"
                SET "statut" = 'CLOTUREE',
                    "clotureeAt" = $1,
                    "clotureeAutomatiquement" = true,
                    "raisonCloture" = 'TOUS_SOUMIS',
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = ANY($2::text[])
                  AND "statut" = 'EN_COURS'
        `, now, epreuveIDs)
	if err != nil {
		return 0, fmt.Errorf("update all-submitted epreuves: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}

	for i, titre := range titres {
		w.logger.Info("AutoClose: TOUS_SOUMIS", "epreuveId", epreuveIDs[i], "titre", titre)
	}

	return int(cmd.RowsAffected()), nil
}

// finalizeStaleSessions passe les sessions EN_COURS « orphelines » à
// NON_SOUMIS : sessions dont l'épreuve est CLOTUREE (délai + grâce
// dépassés de plus de 24h) ou supprimée (deletedAt > 24h).
//
// Idempotent : ne touche que statut='EN_COURS' (re-vérifié dans
// l'UPDATE contre une soumission concurrente entre le SELECT et
// l'UPDATE). Un événement FORCE_SUBMIT est ajouté à logEvents — le JSON
// est parsé côté Go : une valeur corrompue ne fait pas échouer le batch,
// on repart d'un tableau vide.
//
// RLS : claims système (SystemClaims → is_system(), policy
// SessionPassation_all_system, migration 000117).
func (w *AutoCloseWorker) finalizeStaleSessions(ctx context.Context) (int, error) {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
		return 0, fmt.Errorf("set claims: %w", err)
	}

	now := time.Now().UTC()

	// 1. Sessions candidates — plafonnées à 500 par tick (60s) : rattrapage
	// progressif après un long arrêt du serveur ou un changement d'année.
	//
	// NOTE : $1::timestamp (cast explicite OBLIGATOIRE) — sans lui,
	// PostgreSQL infère $1 comme interval (règle « unknown + typé → typé »)
	// et la requête échoue dès la préparation :
	//   operator does not exist: timestamp without time zone < interval
	//   (SQLSTATE 42883) — la finalisation des sessions orphelines ne
	//   s'exécutait alors jamais (bug SECT-AUTOCLOSE-FIX-1).
	rows, err := tx.Query(ctx, `
		SELECT s."id", s."logEvents"
		FROM "SessionPassation" s
		JOIN "Epreuve" e ON e."id" = s."epreuveId"
		WHERE s."statut" = 'EN_COURS'
		  AND (
			(e."statut" = 'CLOTUREE' AND e."deletedAt" IS NULL
			  AND (e."dateFin" + make_interval(mins => COALESCE(e."delaiGrace", 0))) < $1::timestamp - interval '24 hours')
			OR
			(e."deletedAt" IS NOT NULL AND e."deletedAt" < $1::timestamp - interval '24 hours')
		  )
		LIMIT 500
	`, now)
	if err != nil {
		return 0, fmt.Errorf("query stale sessions: %w", err)
	}

	type staleSession struct {
		id        string
		logEvents []byte
	}
	var stale []staleSession
	for rows.Next() {
		ss := staleSession{}
		if err := rows.Scan(&ss.id, &ss.logEvents); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan stale session: %w", err)
		}
		stale = append(stale, ss)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("stale sessions rows: %w", err)
	}
	if len(stale) == 0 {
		if err := tx.Commit(ctx); err != nil {
			return 0, fmt.Errorf("commit (no rows): %w", err)
		}
		return 0, nil
	}

	// 2. logEvents mis à jour côté Go (parse sûr, corruption tolérée).
	ids := make([]string, 0, len(stale))
	logs := make([]string, 0, len(stale))
	for _, ss := range stale {
		var events []map[string]any
		if len(ss.logEvents) > 0 {
			_ = json.Unmarshal(ss.logEvents, &events) // corrompu → events reste nil
		}
		if events == nil {
			events = []map[string]any{}
		}
		events = append(events, map[string]any{
			"type":      "FORCE_SUBMIT",
			"timestamp": now.Format(time.RFC3339),
			"details":   "Session clôturée automatiquement (épreuve close ou supprimée)",
		})
		newLog, _ := json.Marshal(events)
		ids = append(ids, ss.id)
		logs = append(logs, string(newLog))
	}

	// 3. UPDATE batch — le statut EN_COURS est re-vérifié pour écarter une
	// soumission concurrente survenue entre le SELECT et l'UPDATE.
	cmd, err := tx.Exec(ctx, `
		UPDATE "SessionPassation" s
		SET "statut" = 'NON_SOUMIS',
		    "dateFin" = $1,
		    "logEvents" = v.le,
		    "updatedAt" = CURRENT_TIMESTAMP
		FROM (
		    SELECT unnest($2::text[]) AS id, unnest($3::text[]) AS le
		) AS v
		WHERE s."id" = v.id
		  AND s."statut" = 'EN_COURS'
	`, now, ids, logs)
	if err != nil {
		return 0, fmt.Errorf("update stale sessions: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return int(cmd.RowsAffected()), nil
}

// createAutoCloseAlertes crée une Alerte SYSTEME pour chaque épreuve clôturée
// automatiquement + notifie l'enseignant propriétaire. Non bloquant.
// SECT-ALERTES-FIX-1 P5.
func (w *AutoCloseWorker) createAutoCloseAlertes(ctx context.Context, closeTime time.Time) {
	// Récupérer les épreuves clôturées automatiquement à ce tick (clotureeAt ≈ closeTime)
	// RLS-ACTUAL-SWITCH-1 : lecture via claims système (Epreuve_all_system) —
	// collecte en tx courte. SECT-DEBTS-FIX-1 : l'INSERT Alerte passe aussi en
	// tx système (la policy Alerte_insert_system exige désormais is_system())
	// et fournit "updatedAt" (colonne NOT NULL sans default à l'origine :
	// l'ancien INSERT l'omettait → échec silencieux, les alertes
	// d'auto-clôture ne persistaient jamais).
	type closedEpreuve struct {
		epreuveID, titre, enseignantID string
	}
	var epreuves []closedEpreuve
	err := db.WithSystemTx(ctx, w.dbPool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                SELECT e."id", e."titre", e."enseignantId", e."filiereId"
                FROM "Epreuve" e
                WHERE e."statut" = 'CLOTUREE'
                  AND e."clotureeAutomatiquement" = true
                  AND e."clotureeAt" IS NOT NULL
                  AND e."clotureeAt" >= $1
        `, closeTime.Add(-5*time.Second))
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var ce closedEpreuve
			var filiereID *string
			if err := rows.Scan(&ce.epreuveID, &ce.titre, &ce.enseignantID, &filiereID); err != nil {
				continue
			}
			epreuves = append(epreuves, ce)
		}
		return rows.Err()
	})
	if err != nil {
		w.logger.Warn("createAutoCloseAlertes: query failed", "error", err)
		return
	}

	for _, ce := range epreuves {
		epreuveID, titre, enseignantID := ce.epreuveID, ce.titre, ce.enseignantID

		// INSERT Alerte SYSTEME en tx système (claims posés par WithSystemTx).
		// SECT-DEBTS-FIX-1 : "updatedAt" fourni explicitement (NOT NULL) et
		// erreur loggée — l'ancien code jetait l'erreur (`_, _ =`) tout en
		// loggant « créée » quoi qu'il arrive.
		alerteID := uuid.NewString()
		description := fmt.Sprintf("L'épreuve « %s » a été clôturée automatiquement (délai dépassé).", titre)
		if err := db.WithSystemTx(ctx, w.dbPool, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `
                        INSERT INTO "Alerte" ("id", "titre", "description", "severity", "type", "epreuveId", "userId", "lue", "resolu", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, 'INFO', 'SYSTEME', $4, $5, false, false, NOW(), NOW())`,
				alerteID,
				"Épreuve clôturée automatiquement",
				description,
				epreuveID, enseignantID)
			return err
		}); err != nil {
			w.logger.Error("AutoClose: échec création alerte SYSTEME",
				"epreuveId", epreuveID, "enseignantId", enseignantID, "error", err)
			continue
		}

		w.logger.Info("AutoClose: alerte SYSTEME créée", "epreuveId", epreuveID, "enseignantId", enseignantID)
	}
}
