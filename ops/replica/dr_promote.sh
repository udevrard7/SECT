#!/usr/bin/env bash
# ============================================================
# SECT-REPLICA-3 — Promotion « Reprise sur réplique OCI »
# (ADR-0013 §6 phase 3 — exécution du runbook oci-hybrid §3.8).
#
# ⚠ ANTI-DÉCISION 4 : JAMAIS de promotion automatique. Ce script
# exécute une décision HUMAINE déjà prise (voir dr_gate.sh pour
# collecter les preuves + le runbook §3.8 pour l'arbre de décision).
# Sans --confirm PROMOUVOIR : DRY RUN (aucune écriture).
#
# MODES :
#   dr_promote.sh                        → DRY RUN : plan + gate, 0 écriture
#   dr_promote.sh --prepare-publication  → PRÉ-POSITIONNEMENT online (0 coupure) :
#        élargit la publication sect_poc aux 84 tables applicatives
#        (schema_migrations EXCLU : golang-migrate la tient localement —
#        la copie initiale doublerait sa PK et bloquerait le sync worker)
#        + copie initiale via fenêtre (la réplique devient « promotion-ready »,
#        RPO complet ≤ 30 min — recommandé AVANT d'embarquer des
#        établissements, cf. ADR §14.7) ;
#   dr_promote.sh --confirm PROMOUVOIR   → exécution réelle (irréversible
#        sans la procédure de retour §3.8-C).
#
# SÉQUENCE --confirm (miroir §3.8) :
#   0. gate minimal (cluster 5433 up, base là, place disque) ;
#   1. STOP writers (docker compose stop api — plus AUCUNE écriture) ;
#   2. sync finale best-effort (si Neon joignable) + DROP SUBSCRIPTION
#      (slot nettoyé, ou détaché si origine morte : SET slot_name NONE) ;
#   3. grants RW complets pour le rôle applicatif (neondb_owner local) ;
#   4. resync des SÉQUENCES (resync_sequences.sql — §16.6) ;
#   5. bascule DSN : REPLICA_DATABASE_URL → NEON_DATABASE_URL
#      (l'ancien DSN Neon conservé en commentaire pour le RETOUR §3.8-C) ;
#   6. redémarrage API + workers → vérifs + annonce Discord.
#
# Usage : dr_promote.sh [--prepare-publication | --confirm PROMOUVOIR] [--self-test]
# ============================================================
set -euo pipefail

PGB=/usr/lib/postgresql/18/bin
PORT=5433
DB=sect_replica
ENV_FILE=/opt/sect/.env
COMPOSE_DIR=/opt/sect
LOGTAG="sect-dr-promote"
MODE=dry
CONFIRM=""

log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "$LOGTAG" "$*"; }
die() { printf '%s [%s] FATAL : %s\n' "$(date -u +%FT%TZ)" "$LOGTAG" "$*" >&2; exit 1; }

PG() { sudo -n -u postgres "$PGB/$1" -p "$PORT" "${@:2}"; }
local_psql() { PG psql -d "$DB" -tAc "$1" 2>/dev/null || true; }

self_test() {
    bash -n "$0" || die "syntaxe bash invalide"
    echo "self-test dr_promote : OK (syntaxe)"
    exit 0
}

for arg in "$@"; do
    case "$arg" in
        --self-test)          self_test ;;
        --prepare-publication) MODE=prepare ;;
        --confirm)            MODE=confirm ;;
        PROMOUVOIR)           CONFIRM=PROMOUVOIR ;;
        *) die "argument inconnu : $arg" ;;
    esac
done

# --confirm exige le mot exact PROMOUVOIR (symétrie failover.yml §3.7)
if [ "$MODE" = "confirm" ] && [ "$CONFIRM" != "PROMOUVOIR" ]; then
    die "--confirm exige le mot exact PROMOUVOIR (anti-décision 4 : promotion humaine)"
fi

# ── Lecture du DSN réplique (sert de base au DSN promu) ──
REPLICA_DSN=$(grep -E '^REPLICA_DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
[ -n "$REPLICA_DSN" ] || die "REPLICA_DATABASE_URL absent de $ENV_FILE — lancer d'abord le setup lectures locales (§3.8-A)"

discord() { # $1 titre  $2 description  $3 couleur
    local hook
    hook=$(grep -E '^DISCORD_WEBHOOK_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
    [ -n "$hook" ] || return 0
    curl -fsS --max-time 10 -X POST -H 'Content-Type: application/json' \
        --data "$(printf '{"embeds":[{"title":"%s","description":"%s","color":%s,"footer":{"text":"SECT DR"},"timestamp":"%s"}]}' \
        "$1" "$2" "$3" "$(date -u +%FT%TZ)")" "$hook" >/dev/null 2>&1 || true
}

neon_psql() { # $1 = SQL — via DSN direct (droits owner, publication)
    local dsn
    dsn=$(grep -E '^NEON_DIRECT_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
    [ -n "$dsn" ] || die "NEON_DIRECT_URL absent de $ENV_FILE"
    "$PGB/psql" "$dsn" -tAc "$1" 2>/dev/null
}

wait_convergence() { # $1 timeout s — attend received=latest x3 frais
    local timeout="$1" i=0 ok_streak=0
    while [ "$i" -lt "$timeout" ]; do
        state=$(local_psql "SELECT COALESCE((SELECT (received_lsn = latest_end_lsn AND latest_end_time > now() - interval '60 s')::int FROM pg_stat_subscription LIMIT 1), -1)")
        if [ "$state" = "1" ]; then
            ok_streak=$((ok_streak+1))
            [ "$ok_streak" -ge 3 ] && { log "convergence atteinte (${i}s)"; return 0; }
        else
            ok_streak=0
        fi
        sleep 5; i=$((i+5))
    done
    return 1
}

wait_rel_ready() { # $1 timeout s — toutes les tables de la souscription en état 'r'
    local timeout="$1" i=0
    while [ "$i" -lt "$timeout" ]; do
        pending=$(local_psql "SELECT count(*) FROM pg_subscription_rel WHERE srsubstate <> 'r'")
        [ "${pending:-1}" = "0" ] && { log "toutes les tables répliquées en état 'r' (${i}s)"; return 0; }
        sleep 5; i=$((i+5))
    done
    return 1
}

# ════════════════════════════════════════════════════════════
# MODE : --prepare-publication (online, idempotent, 0 coupure)
# ════════════════════════════════════════════════════════════
if [ "$MODE" = "prepare" ]; then
    log "PRÉ-POSITIONNEMENT : élargissement publication + copie initiale"
    # 1. Tables de Neon pas encore dans la publication sect_poc
    #    (identifiants via quote_ident — JAMAIS %L : un littéral chaîne est
    #    un identifiant invalide pour ALTER PUBLICATION, piège du run
    #    #38131147494 ; et PAS de to_regclass sur nom non quoté : le fold
    #    minuscules élimine toutes les tables CamelCase — piège n°2, la
    #    sonde de validation n'a retourné QUE schema_migrations à cause
    #    de lui ; schema_migrations exclu — cf. en-tête)
    TO_ADD=$(neon_psql "SELECT string_agg(t, ', ') FROM pg_tables pt, LATERAL (SELECT quote_ident(pt.schemaname)||'.'||quote_ident(pt.tablename) AS t) x WHERE pt.schemaname='public' AND pt.tablename <> 'schema_migrations' AND NOT EXISTS (SELECT 1 FROM pg_publication_tables pp WHERE pp.pubname='sect_poc' AND pp.schemaname=pt.schemaname AND pp.tablename=pt.tablename)")
    if [ -z "${TO_ADD:-}" ] || [ "$TO_ADD" = "NULL" ]; then
        log "publication déjà complète (84/84 tables applicatives)"
    else
        log "tables à ajouter : ${TO_ADD:0:200}…"
        neon_psql "ALTER PUBLICATION sect_poc ADD TABLE $TO_ADD" || die "ALTER PUBLICATION échoué"
        log "publication élargie"
    fi

    # 2. Fenêtre : enable + REFRESH PUBLICATION + copie initiale + disable
    #    (ENABLE tolérant : la fenêtre grille M1 :02/:32 peut l'avoir déjà
    #    fait — lancer ce mode de préférence à :15/:45, hors fenêtres)
    log "fenêtre de copie initiale (enable → refresh → r partout → disable)"
    PG psql -d "$DB" -c "ALTER SUBSCRIPTION sect_poc ENABLE" >/dev/null 2>&1 || log "souscription déjà ENABLE (fenêtre grille ?)"
    PG psql -d "$DB" -c "ALTER SUBSCRIPTION sect_poc REFRESH PUBLICATION" >/dev/null || die "REFRESH PUBLICATION échoué"
    wait_rel_ready 900 || { PG psql -d "$DB" -c "ALTER SUBSCRIPTION sect_poc DISABLE" >/dev/null 2>&1 || true; die "copie initiale non convergée en 900 s"; }
    wait_convergence 300 || true
    PG psql -d "$DB" -c "ALTER SUBSCRIPTION sect_poc DISABLE" >/dev/null || die "DISABLE échoué (CRITIQUE : autosuspend Neon bloqué — §16.3)"
    counts=$(local_psql "SELECT count(*) FROM pg_subscription_rel WHERE srsubstate='r'")
    log "pré-positionnement TERMINÉ : ${counts} tables prêtes, souscription DISABLE (grille M1 préservée)"
    discord "DR pré-positionnement réplique" "Publication élargie + copie initiale OK (${counts} tables en 'r'). Réplique promotion-ready (RPO ≤ 30 min)." 3066993
    exit 0
fi

# ════════════════════════════════════════════════════════════
# DRY RUN : plan + garde minimale (aucune écriture)
# ════════════════════════════════════════════════════════════
gate_summary() {
    pg_lsclusters 2>/dev/null | awk '$2=="sect"' || true
    printf 'tables répliquées : %s lignes (RequestLog)\n' "$(local_psql 'SELECT count(*) FROM "RequestLog"')"
    printf 'souscription : %s\n' "$(local_psql "SELECT string_agg(subname||'='||subenabled::text) FROM pg_subscription")"
    printf 'DSN réplique : présent (%s)\n' "$(echo "$REPLICA_DSN" | sed -E 's/:[^:@]+@/:***@/')"
    printf 'API container : %s\n' "$(sudo -n docker inspect -f '{{.State.Status}}' sect-api 2>/dev/null || echo 'inconnu')"
}

if [ "$MODE" = "dry" ]; then
    log "═══ DRY RUN — AUCUNE ÉCRITURE ═══"
    gate_summary
    cat <<'PLAN'
────────────────────────────────────────────
PLAN D'EXÉCUTION (--confirm PROMOUVOIR requis) :
  0. garde minimale (cluster 5433, base, disque)
  1. docker compose stop api          (STOP writers)
  2. sync finale best-effort + DROP SUBSCRIPTION (slot détachable si origine morte)
  3. grants RW complets (neondb_owner local, idempotent)
  4. resync SÉQUENCES (ops/replica/resync_sequences.sql)
  5. bascule DSN .env : REPLICA_DATABASE_URL → NEON_DATABASE_URL
     (ancien DSN Neon conservé en commentaire # pre-dr)
  6. docker compose up -d + health + /health/db + Discord
RETOUR : runbook oci-hybrid §3.8-C (dump/restore, JAMAIS de port exposé)
────────────────────────────────────────────
Exécuter d'abord : dr_gate.sh (preuves) puis lire §3.8 (arbre de décision)
PLAN
    exit 0
fi

# ════════════════════════════════════════════════════════════
# MODE : --confirm PROMOUVOIR (exécution réelle)
# ════════════════════════════════════════════════════════════
log "═══ PROMOTION RÉELLE — $DB devient primaire ═══"

# 0. garde minimale
pg_lsclusters 2>/dev/null | awk '$2=="sect" && $4=="online"{f=1} END{exit !f}' || die "cluster sect pas online"
free_gb=$(df -BG --output=avail /var/lib/postgresql 2>/dev/null | tail -1 | tr -dc '0-9')
[ "${free_gb:-0}" -ge 3 ] || die "place disque insuffisante (${free_gb} Go)"
log "garde minimale OK"

# 1. STOP writers
log "STOP writers (docker compose stop api)"
( cd "$COMPOSE_DIR" && sudo -n docker compose stop api ) || die "impossible d'arrêter l'API (bascule à la main ?)"

# 2. Sync finale best-effort + detach subscription
if PG psql -d "$DB" -c "ALTER SUBSCRIPTION sect_poc ENABLE" >/dev/null 2>&1; then
    log "sync finale (Neon joignable) — convergence 300 s max"
    wait_convergence 300 || log "AVERTISSEMENT : convergence non atteinte (on promeut l'état actuel)"
fi
if local_psql "SELECT count(*) FROM pg_subscription WHERE subname='sect_poc'" | grep -q '^1$'; then
    if ! PG psql -d "$DB" -c "DROP SUBSCRIPTION sect_poc" >/dev/null 2>&1; then
        log "origine injoignable → détachement du slot (SET slot_name = NONE) puis DROP"
        PG psql -d "$DB" -c "ALTER SUBSCRIPTION sect_poc DISABLE" >/dev/null 2>&1 || true
        PG psql -d "$DB" -c "ALTER SUBSCRIPTION sect_poc SET (slot_name = NONE)" >/dev/null 2>&1 || die "détachement slot impossible"
        PG psql -d "$DB" -c "DROP SUBSCRIPTION sect_poc" >/dev/null || die "DROP SUBSCRIPTION échoué"
    fi
fi
log "souscription retirée (la base locale est désormais indépendante)"

# 3. Grants RW complets pour le rôle applicatif (idempotent)
ROLE=$(echo "$REPLICA_DSN" | sed -E 's|postgresql://([^:]+):.*|\1|')
log "grants RW complets pour le rôle applicatif : $ROLE"
PG psql -d "$DB" -v ON_ERROR_STOP=1 -c "
    GRANT USAGE ON SCHEMA public TO \"$ROLE\";
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"$ROLE\";
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"$ROLE\";
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO \"$ROLE\";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"$ROLE\";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO \"$ROLE\";
" >/dev/null || die "grants échoués"

# 4. Resync séquences
log "resync des séquences (§16.6)"
PG psql -d "$DB" -v ON_ERROR_STOP=1 -f /opt/sect/replica/resync_sequences.sql || die "resync séquences échoué"

# 5. Bascule DSN (ancien DSN conservé en commentaire pour le retour §3.8-C)
TS=$(date -u +%Y%m%dT%H%MZ)
sudo -n cp "$ENV_FILE" "$ENV_FILE.pre-dr-$TS"
OLD_NEON=$(grep -E '^NEON_DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
sudo -n sed -i "s|^NEON_DATABASE_URL=.*|# pre-dr-$TS NEON_DATABASE_URL=$OLD_NEON|" "$ENV_FILE"
if grep -q '^REPLICA_DATABASE_URL=' "$ENV_FILE"; then
    sudo -n sed -i "s|^REPLICA_DATABASE_URL=.*|NEON_DATABASE_URL=$REPLICA_DSN\nREPLICA_DATABASE_URL=# désactivé (promu — plus de réplique locale)|" "$ENV_FILE"
else
    printf 'NEON_DATABASE_URL=%s\n' "$REPLICA_DSN" | sudo -n tee -a "$ENV_FILE" >/dev/null
fi
log "DSN basculé ($ENV_FILE sauvegardé : .env.pre-dr-$TS)"

# 6. Redémarrage + vérifs
log "redémarrage API+workers sur la base promue"
( cd "$COMPOSE_DIR" && sudo -n docker compose up -d ) || die "up échoué"
healthy=""
for i in $(seq 1 20); do
    if sudo -n docker inspect -f '{{.State.Health.Status}}' sect-api 2>/dev/null | grep -q healthy; then healthy=1; break; fi
    sleep 3
done
[ -n "$healthy" ] || die "API pas healthy après 60 s (docker compose logs api)"
sleep 3
hdb=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8090/api/health/db || echo 000)
log "/health/db local : HTTP $hdb (attendu 200 — base promue)"

log "═══ PROMOTION TERMINÉE ═══"
log "RETOUR VERS NEON : runbook oci-hybrid §3.8-C (dump/restore — jamais de port exposé, anti-décision 3)"
discord "🚨 DR : promotion réplique OCI" "sect_replica promue primaire (${TS}). Ancien DSN conservé (.env.pre-dr-${TS}). Retour : runbook §3.8-C." 15158332
