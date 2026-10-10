// Package worker — cadences adaptatives (ADR-0013 §11.4, mesure M1).
//
// CONTEXTE (preuves SECT-DB-HYBRID-4, 10/10/2026) : plan Neon Free = 100 CU-h
// par cycle. Depuis le cutover OCI (09/10), les ticks workers (10 s/60 s/2 min)
// et le pool pgx (MinConns=5, health-check 30 s, idle 5 min) maintenaient le
// compute éveillé 24/7 (~6,3 CU-h/j → mur ~23-24/10, reset 01/11).
//
// M1 (approuvée par l'exploitant le 10/10/2026 — 0 €, réversible) :
//  1. intervalles workers configurables par env, défauts = constantes code ;
//  2. fenêtre nocturne (défaut 22:00-06:00 Africa/Abidjan) où tout tick est
//     plancher à ≥ WORKER_NIGHT_MIN_INTERVAL (défaut 15 min) ;
//  3. pool : MaxConnIdleTime 90 s + MinConns 0 (cf. internal/db/db.go).
//
// RENFORCEMENTS d'ingénierie inclus (aucun changement de cadence produit) :
//   - ALIGNEMENT GRILLE HORAIRE : tous les ticks tombent sur des frontières
//     d'horloge de leur intervalle (:00/:15/:30 pour 15 min). Sans cela, 4
//     workers à 15 min désynchronisés entretiennent 4 fenêtres d'éveil par
//     quart d'heure (≈ éveil nocturne ~100 %) ; alignés, ils partagent UNE
//     seule fenêtre (~6,5 min par 15 min : tick + résiduel conn idle 90 s +
//     timeout de suspension Neon 300 s) → duty nocturne ~43 %.
//   - WORKER_DAY_MIN_INTERVAL (défaut 0 = inactif) : même mécanique de
//     plancher pour les fenêtres de jour creuses, DÉSACTIVÉ par défaut
//     (latence produit inchangée le jour) — à activer par l'exploitant après
//     la mesure 48 h si le budget le requiert (cf. ADR-0013 §12).
//
// Variables d'environnement (toutes optionnelles, défauts = M1) :
//
//	WORKER_NIGHT_ENABLED         true|false   (défaut true)
//	WORKER_NIGHT_START_HOUR      0-23         (défaut 22, TZ ci-dessous)
//	WORKER_NIGHT_END_HOUR        0-23         (défaut 6 — fenêtre pouvant franchir minuit)
//	WORKER_NIGHT_TZ              zone IANA    (défaut Africa/Abidjan — UTC+0 toute l'année)
//	WORKER_NIGHT_MIN_INTERVAL    durée Go     (défaut 15m — plancher nocturne)
//	WORKER_DAY_MIN_INTERVAL      durée Go     (défaut 0 = désactivé — plancher jour, cf. §12)
//	WORKER_<NOM>_INTERVAL        durée Go     (override de la base, ex. WORKER_PROMOTION_INTERVAL=30s)
//	WORKER_<NOM>_NIGHT_EXEMPT    true|false   (sort un worker du plancher nocturne)
//	WORKER_<NOM>_DAY_EXEMPT      true|false   (idem plancher jour)
//
// <NOM> = nom du worker au registre ADR-0011 : auto-close, promotion, alerting,
// similarity, expire, relance, cleanup, bibliotheque-purge
// (ex. WORKER_AUTO_CLOSE_INTERVAL, WORKER_BIBLIOTHEQUE_PURGE_NIGHT_EXEMPT).
package worker

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// --- Fenêtre nocturne M1 (config lue une fois, au premier accès) ---

type nightWindow struct {
	enabled     bool
	startHour   int
	endHour     int
	tz          *time.Location
	minInterval time.Duration
}

var (
	nightOnce sync.Once
	night     nightWindow
)

func nightWindowConfig() nightWindow {
	nightOnce.Do(func() {
		w := nightWindow{
			enabled:     envBool("WORKER_NIGHT_ENABLED", true),
			startHour:   envInt("WORKER_NIGHT_START_HOUR", 22),
			endHour:     envInt("WORKER_NIGHT_END_HOUR", 6),
			minInterval: envDuration("WORKER_NIGHT_MIN_INTERVAL", 15*time.Minute),
		}
		tzName := envStr("WORKER_NIGHT_TZ", "Africa/Abidjan")
		loc, err := time.LoadLocation(tzName)
		if err != nil {
			// Repli UTC : Africa/Abidjan est UTC+0 toute l'année — en pratique
			// identique — mais on le crie dans les logs pour l'exploitant.
			slog.Default().Warn("cadence: WORKER_NIGHT_TZ invalide — repli UTC",
				"tz", tzName, "error", err)
			loc = time.UTC
		}
		w.tz = loc
		night = w
		slog.Default().Info("cadence M1: fenêtre nocturne chargée",
			"enabled", w.enabled,
			"fenetre", formatHour(w.startHour)+"-"+formatHour(w.endHour),
			"tz", loc.String(),
			"plancherNocturne", w.minInterval.String(),
			"plancherJour", envDuration("WORKER_DAY_MIN_INTERVAL", 0).String(),
		)
	})
	return night
}

// contains retourne true si t tombe dans la fenêtre (heure locale du TZ
// configuré). Fenêtre à cheval sur minuit (ex. 22→6) supportée ; fenêtre
// vide (début == fin) = jamais.
func (w nightWindow) contains(t time.Time) bool {
	if w.startHour == w.endHour {
		return false
	}
	h := t.In(w.tz).Hour()
	if w.startHour < w.endHour {
		return h >= w.startHour && h < w.endHour
	}
	return h >= w.startHour || h < w.endHour
}

// workerEnvSuffix transforme un nom de worker (registre ADR-0011) en suffixe
// de variable d'environnement : "auto-close" → "AUTO_CLOSE",
// "bibliotheque-purge" → "BIBLIOTHEQUE_PURGE".
func workerEnvSuffix(name string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(name) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}

// effectiveInterval calcule l'intervalle effectif d'un worker périodique :
//  1. base du code, surchargée par WORKER_<NOM>_INTERVAL si posée (garde-fou :
//     une valeur ≤ 0 est ignorée — sinon busy-loop) ;
//  2. pendant la fenêtre nocturne (sauf exemption) : plancher ≥ minInterval ;
//  3. hors fenêtre (sauf exemption) : plancher jour WORKER_DAY_MIN_INTERVAL
//     s'il est posé (défaut 0 = inchangé).
//
// Appelée à CHAQUE cycle par AdaptiveTicker → les transitions jour/nuit sont
// vivantes (aucun redémarrage requis à 22:00 ou 06:00).
func effectiveInterval(name string, base time.Duration, now time.Time) time.Duration {
	sfx := workerEnvSuffix(name)
	iv := envDuration("WORKER_"+sfx+"_INTERVAL", base)
	if iv <= 0 {
		iv = base
	}
	w := nightWindowConfig()
	isNight := w.enabled && w.contains(now)
	if isNight {
		if !envBool("WORKER_"+sfx+"_NIGHT_EXEMPT", false) && iv < w.minInterval {
			return w.minInterval
		}
		return iv
	}
	if dayMin := envDuration("WORKER_DAY_MIN_INTERVAL", 0); dayMin > 0 &&
		!envBool("WORKER_"+sfx+"_DAY_EXEMPT", false) && iv < dayMin {
		return dayMin
	}
	return iv
}

// nextAligned retourne l'attente jusqu'au prochain multiple de iv sur l'horloge
// (ex. iv=15m → tick à :00/:15/:30/:45). Tous les workers partageant une même
// grille tirent ENSEMBLE → UNE seule fenêtre d'éveil Neon au lieu de N. Les
// intervalles courants (10 s → 24 h) divisent tous 86400 s → alignement stable.
// Le résultat est toujours > 0 (Truncate arrondit vers le bas).
func nextAligned(now time.Time, iv time.Duration) time.Duration {
	return now.Truncate(iv).Add(iv).Sub(now)
}

// AdaptiveTicker est un time.Ticker dont l'intervalle est recalculé à chaque
// cycle (fenêtre nocturne M1, overrides env, plancher jour). Remplacement
// direct de time.NewTicker :
//
//	ticker := newAdaptiveTicker("auto-close", 60*time.Second)
//	defer ticker.Stop()
//	for {
//	        select {
//	        case <-ctx.Done():
//	                return
//	        case <-ticker.C:
//	                // ...
//	        }
//	}
//
// Sémantique identique à time.Ticker : premier tick après un intervalle,
// ticks suivants espacés d'un intervalle, tick droppé si le consommateur est
// lent (canal buffer 1). L'intervalle est réévalué APRÈS chaque tick : la
// transition 22:00 s'applique au tick suivant, sans redémarrage.
type AdaptiveTicker struct {
	C    chan time.Time
	name string
	base time.Duration
	stop chan struct{}
	done chan struct{}
	once sync.Once
}

// newAdaptiveTicker démarre le ticker (goroutine interne).
func newAdaptiveTicker(name string, base time.Duration) *AdaptiveTicker {
	t := &AdaptiveTicker{
		C:    make(chan time.Time, 1),
		name: name,
		base: base,
		stop: make(chan struct{}),
		done: make(chan struct{}),
	}
	go t.run()
	return t
}

func (t *AdaptiveTicker) run() {
	defer close(t.done)
	effective := func() time.Duration { return effectiveInterval(t.name, t.base, time.Now()) }

	first := effective()
	slog.Default().Info("cadence M1: worker périodique démarré",
		"worker", t.name, "base", t.base.String(), "effectif", first.String())

	timer := time.NewTimer(nextAligned(time.Now(), first))
	defer timer.Stop()

	prev := first
	for {
		select {
		case <-t.stop:
			return
		case now := <-timer.C:
			select {
			case t.C <- now:
			default: // consommateur lent : tick droppé (sémantique time.Ticker)
			}
			next := effective()
			if next != prev {
				slog.Default().Info("cadence M1: bascule de fenêtre",
					"worker", t.name, "avant", prev.String(), "apres", next.String())
				prev = next
			}
			timer.Reset(nextAligned(time.Now(), next))
		}
	}
}

// Stop arrête le ticker (idempotent) et attend la fin de la goroutine.
func (t *AdaptiveTicker) Stop() {
	t.once.Do(func() { close(t.stop) })
	<-t.done
}

// --- Helpers env (privés au package, défauts explicites) ---

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(strings.TrimSpace(v)); err == nil {
			return b
		}
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(strings.TrimSpace(v)); err == nil {
			return d
		}
	}
	return fallback
}

func formatHour(h int) string { return fmt.Sprintf("%02d:00", h) }
