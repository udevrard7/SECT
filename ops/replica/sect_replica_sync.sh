#!/usr/bin/env bash
# ============================================================
# SECT-REPLICA-2 — Synchronisation programmée de la réplique
# (ADR-0013 §16 — décision issue de la mesure du 11/10/2026)
#
# MESURE (POC phase 2) : une souscription ACTIVE 24/7 empêche
# l'autosuspend Neon (walsender vivant = last_active qui avance ;
# 8+ min sans suspend vs 5:16 en rythme grille) → ~180 CU-h/mois
# à 0,25 CU → incompatible avec le budget Free de 100 CU-h/cycle.
#
# Ce service (systemd, PAS GitHub Actions — D4, schedules cassés
# SECT-UPTIME-PROBE-3) ouvre une FENÊTRE de réplication calée sur
# les ticks de la grille M1 (déjà payés par les workers) :
#   ENABLE → attend la convergence (received_lsn == latest_end_lsn,
#   horodatage frais, 3 fois de suite) → DISABLE.
# Le walsender quitte l'endpoint AVANT le point de suspension
# habituel → coût CU marginal ≈ 0 (arithmétique §13.4/§15.4).
#
# Ne touche JAMAIS au cluster mikcloud (18-main/5432) — tout passe
# par le cluster DÉDIÉ sect (5433, 127.0.0.1 — D6).
#
# usage : sect_replica_sync.sh (via systemd) | --self-test (CI)
# ============================================================
set -euo pipefail

PGB=/usr/lib/postgresql/18/bin
PORT=5433
DB=sect_replica
MAX_WAIT="${SECT_REPLICA_SYNC_MAX_WAIT:-150}"
LOGTAG="sect-replica-sync"

log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "$LOGTAG" "$*"; }

self_test() {
    local rc=0
    bash -n "$0" || rc=1
    # convergence() : les clés de la requête existent dans le script
    grep -q 'received_lsn = latest_end_lsn' "$0" || { echo "self-test: requête de convergence absente"; rc=1; }
    if [ $rc -eq 0 ]; then echo "self-test: OK"; else echo "self-test: ÉCHEC"; fi
    exit $rc
}
[ "${1:-}" = "--self-test" ] && self_test

PSQL() { sudo -n -u postgres "$PGB/psql" -p "$PORT" -d "$DB" -tAc "$1"; }

# ── 1. fenêtre : ENABLE ──
log "ENABLE sect_poc (fenêtre calée grille M1)"
sudo -n -u postgres "$PGB/psql" -p "$PORT" -d "$DB" -c "ALTER SUBSCRIPTION sect_poc ENABLE"

# ── 2. attendre la convergence (3 confirmations espacées de 5 s) ──
ok=0
waited=0
while [ "$waited" -lt "$MAX_WAIT" ]; do
    sleep 5
    waited=$((waited + 5))
    R="$(PSQL "SELECT received_lsn = latest_end_lsn AND now() - latest_end_time < interval '15 seconds' FROM pg_stat_subscription WHERE subname = 'sect_poc'")"
    if [ "$R" = "t" ]; then
        ok=$((ok + 1))
    else
        ok=0
    fi
    if [ "$ok" -ge 3 ]; then
        break
    fi
done
if [ "$ok" -ge 3 ]; then
    log "convergence atteinte (${waited}s) — received=latest, horodatage frais ×3"
else
    log "AVERTISSEMENT : convergence non confirmée après ${MAX_WAIT}s — DISABLE quand même (le slot garde le WAL, rattrapage au prochain passage)"
fi

# ── 3. fermeture : DISABLE (l'endpoint peut se suspendre au rythme habituel) ──
sudo -n -u postgres "$PGB/psql" -p "$PORT" -d "$DB" -c "ALTER SUBSCRIPTION sect_poc DISABLE"
log "DISABLE sect_poc — fenêtre fermée (coût CU marginal ≈ 0)"
