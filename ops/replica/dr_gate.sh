#!/usr/bin/env bash
# ============================================================
# SECT-REPLICA-3 — Garde de santé DR (runbook oci-hybrid §3.8).
#
# ADR-0013 §6 phase 3 : support de DÉCISION (jamais de décision
# automatique — anti-décision n°4 : toute promotion est humaine,
# approuvée, avec runbook). Ce script COLLECTE les preuves et rend
# un verdict GO/NO-GO pour une promotion « Reprise sur réplique » :
#
#   G1  cluster dédié sect (5433) online ;
#   G2  base sect_replica joignable + 3 tables répliquées NON vides ;
#   G3  fraîcheur des données répliquées (max createdAt RequestLog) ;
#   G4  souscription état + dernière fenêtre de convergence ;
#   G5  primaire Neon : /health/db public + pg_isready pooler ;
#   G6  standby Render : /health/db direct ;
#   G7  place disque (restore/promotion ≈ quelques Go) ;
#   G8  backups Object Storage récents (voie de secours §3.8-B).
#
# LECTURE SEULE : aucune écriture nulle part (ni Neon, ni local).
#
# Usage (VM, user avec sudo -n) :  dr_gate.sh
#                                  dr_gate.sh --json   (sortie machine)
# ============================================================
set -euo pipefail

PGB=/usr/lib/postgresql/18/bin
PORT=5433
DB=sect_replica
JSON=false
[ "${1:-}" = "--json" ] && JSON=true

PG() { sudo -n -u postgres "$PGB/$1" -p "$PORT" "${@:2}"; }

# Valeurs par défaut surcidables par l'environnement de l'exploitant.
API_PUBLIC="${SECT_API_PUBLIC:-https://api.sect.ftci.fr}"
RENDER_DIRECT="${SECT_RENDER_DIRECT:-https://sect-zead.onrender.com}"

pass=0; fail=0; warn=0
ok()   { pass=$((pass+1)); printf '✅ %s\n' "$*"; }
bad()  { fail=$((fail+1)); printf '❌ %s\n' "$*"; }
soft() { warn=$((warn+1)); printf '⚠️  %s\n' "$*"; }

# ── G1 : cluster dédié ──
if pg_lsclusters 2>/dev/null | awk '$2=="sect" && $4=="online"{f=1} END{exit !f}'; then
    ok "G1 cluster « sect » (5433) online"
else
    bad "G1 cluster « sect » (5433) PAS online — promotion impossible"
fi

# ── G2 : base + tables répliquées ──
if PG psql -d "$DB" -tAc "SELECT 1" >/dev/null 2>&1; then
    ok "G2 base $DB joignable"
    for t in RequestLog AuditLog Reponse; do
        c=$(PG psql -d "$DB" -tAc "SELECT count(*) FROM \"$t\"" 2>/dev/null | tr -d '[:space:]') || c=""
        if [ -n "$c" ] && [ "$c" -gt 0 ] 2>/dev/null; then
            ok "G2 $t : $c lignes"
        else
            bad "G2 $t : vide/inaccessible (publication ou souscription HS)"
        fi
    done
else
    bad "G2 base $DB INJOIGNABLE"
fi

# ── G3 : fraîcheur (staleness) des données répliquées ──
stale_min=$(PG psql -d "$DB" -tAc \
    "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - max(\"createdAt\")))/60, -1)::int FROM \"RequestLog\"" \
    2>/dev/null | tr -d '[:space:]') || stale_min=""
if [ -n "$stale_min" ] && [ "$stale_min" -ge 0 ] 2>/dev/null; then
    if [ "$stale_min" -le 45 ]; then
        ok "G3 fraîcheur réplique : ${stale_min} min (RPO 30 min + fenêtre)"
    else
        soft "G3 fraîcheur réplique : ${stale_min} min (fenêtre :02/:32 manquées ?)"
    fi
else
    soft "G3 fraîcheur indéterminable"
fi

# ── G4 : souscription ──
substate=$(PG psql -d "$DB" -tAc \
    "SELECT COALESCE(string_agg(subname || '=' || subenabled::text, ','), 'absente') FROM pg_subscription" \
    2>/dev/null | tr -d '[:space:]') || substate="indéterminable"
last_end=$(PG psql -d "$DB" -tAc \
    "SELECT COALESCE(to_char(max(latest_end_time), 'YYYY-MM-DD HH24:MI:SS'), 'jamais') FROM pg_stat_subscription" \
    2>/dev/null | xargs echo) || last_end="indéterminable"
printf 'ℹ️  G4 souscription : %s — dernière convergence : %s UTC\n' "$substate" "$last_end"

# ── G5 : primaire Neon (2 sondes indépendantes) ──
health_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$API_PUBLIC/health/db" 2>/dev/null || echo 000)
if [ "$health_code" = "200" ]; then
    ok "G5 Neon via chemin public : 200"
else
    bad "G5 Neon via chemin public : HTTP $health_code"
fi
NEON_HOST=$(grep -E '^NEON_DATABASE_URL=' /opt/sect/.env 2>/dev/null | head -1 | sed -E 's|.*@([^/:]+).*|\1|')
if [ -n "$NEON_HOST" ]; then
    if "$PGB/pg_isready" -h "$NEON_HOST" -p 5432 -t 8 >/dev/null 2>&1; then
        soft "G5 pg_isready $NEON_HOST:5432 : accepte les connexions"
    else
        soft "G5 pg_isready $NEON_HOST:5432 : PAS de réponse (compute suspendu ou down)"
    fi
fi

# ── G6 : standby Render ──
render_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$RENDER_DIRECT/health/db" 2>/dev/null || echo 000)
if [ "$render_code" = "200" ]; then
    ok "G6 standby Render : 200"
else
    bad "G6 standby Render : HTTP $render_code (cold start possible — retry)"
fi

# ── G7 : place disque ──
free_gb=$(df -BG --output=avail /var/lib/postgresql 2>/dev/null | tail -1 | tr -dc '0-9') || free_gb=0
if [ "${free_gb:-0}" -ge 5 ]; then
    ok "G7 place disque : ${free_gb} Go libres"
else
    bad "G7 place disque : ${free_gb} Go libres (restore complet ≈ 1-2 Go requis)"
fi

# ── G8 : backups récents (voie de secours §3.8-B) ──
if command -v rclone >/dev/null 2>&1 && sudo -n test -r /opt/sect/backup/backup.env; then
    latest=$(sudo -n bash -c 'set -a; . /opt/sect/backup/backup.env 2>/dev/null; rclone lsf --files-only "$( [ -n "$OS_BUCKET" ] && echo "$OS_BUCKET" || echo sect-backups ):daily/ 2>/dev/null | sort | tail -1' 2>/dev/null || true)
    if [ -n "$latest" ]; then
        ok "G8 backup Object Storage : $latest (voie de secours §3.8-B disponible)"
    else
        soft "G8 listing backup indisponible (rclone/config) — voir sect_backup_watchdog"
    fi
else
    soft "G8 outillage backup absent/incomplet sur cette VM"
fi

# ── Verdict ──
echo "──────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
    echo "VERDICT : ✅ GO technique possible — DÉCISION HUMAINE REQUISE (anti-décision 4)"
else
    echo "VERDICT : ❌ NO-GO — ${fail} garde(s) en échec (voir ci-dessus)"
fi
[ "$warn" -gt 0 ] && echo "          (${warn} avertissement(s) à considérer)"

if [ "$JSON" = true ]; then
    printf '{"gate":{"pass":%d,"fail":%d,"warn":%d,"stale_min":%s,"subscription":"%s"}}\n' \
        "$pass" "$fail" "$warn" "${stale_min:-null}" "$substate"
fi
