#!/usr/bin/env bash
# ============================================================
# SECT-BACKUP-1 — Test de restauration (D6/D8) + moteur break-glass
# ADR-0013 §15 — la PREUVE qu'un backup existe vraiment.
#
# Télécharge un backup Object Storage, le DÉCHIFFRE avec la clé
# privée escrowée (jamais stockée sur la VM — passée par
# --identity-file au moment du test), le restaure dans le cluster
# PG DÉDIÉ (port 5433, 127.0.0.1 — D6 : ne touche JAMAIS au cluster
# mikcloud 18-main/5432), puis VÉRIFIE :
#   - checksums sha256 (index clair vs fichiers téléchargés) ;
#   - counts par table vs manifest chiffré (égalité EXACTE) ;
#   - policies RLS et nombre de tables vs manifest.
# Rapport PASS/FAIL sur stdout + Discord (piste d'audit). À la
# réussite : marker restore-ok-<mois> (le watchdog cesse de rappeler).
#
# BREAK-GLASS « Neon down » (runbook §7) : ce script EST le moteur de
# restauration — l'utiliser avec --keep pour poser la base, puis
# suivre le runbook (bascule DSN, JAMAIS automatisée — anti-décision
# n°4 : les promotions sont humaines et approuvées).
#
# Usage :
#   sudo sect_restore_test.sh --identity-file /chemin/escrow.key
#   sudo sect_restore_test.sh --identity-file K --date 2026-10-12 --keep
#   sect_restore_test.sh --self-test
# ============================================================
set -euo pipefail
umask 077

ENV_FILE="${SECT_BACKUP_ENV:-/opt/sect/backup.env}"
STAGING_DIR="${SECT_BACKUP_STAGING:-/var/lib/sect-backup}"
RESTORE_PORT="${RESTORE_PG_PORT:-5433}"
RESTORE_DB="${RESTORE_PG_DB:-sect_restore_test}"
RCLONE_REMOTE="${RCLONE_REMOTE:-oci}"
IDENTITY=""
WANT_DATE=""
KEEP=false

log() { printf '%s [sect-restore] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ÉCHEC — $*"; notify_discord "❌ Test de restauration SECT échoué" "$* ($(date -u +%FT%TZ)). Le backup n'est PAS prouvé restaurable — runbook §6/§7." 0xED4245; exit 1; }

notify_discord() { # <titre> <description> <couleur>
    local title="$1" desc="$2" color="${3:-0x95A5A6}"
    if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
        log "Discord non configuré — journal seulement : $title"
        return 0
    fi
    desc=${desc//\"/\'} ; desc=${desc//$'\n'/ · }
    curl -fsS --max-time 10 -X POST -H 'Content-Type: application/json' \
        --data "$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"SECT Backup"},"timestamp":"%s"}]}' \
            "$title" "$desc" "$color" "$(date -u +%FT%TZ)")" \
        "${DISCORD_WEBHOOK_URL%/}" >/dev/null \
        || log "AVERTISSEMENT : envoi Discord a échoué (non fatal)"
}

load_env() {
    [ -r "$ENV_FILE" ] || die "env introuvable : $ENV_FILE"
    local key val
    while IFS= read -r raw || [ -n "$raw" ]; do
        case "$raw" in ''|'#'*) continue ;; esac
        key="${raw%%=*}"; val="${raw#*=}"
        case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
        # shellcheck disable=SC2163
        export "$key" && printf -v "$key" '%s' "$val"
    done < "$ENV_FILE"
}

# psql/pg_restore sur le cluster DÉDIÉ (5433) — via l'OS user postgres
# (auth peer ; le script tourne en root, cf. sudo exigé).
local_pg() { # <bin> <args...>
    local bin="$1"; shift
    local dir=""
    for v in 18 17 16; do
        [ -x "/usr/lib/postgresql/$v/bin/$bin" ] && { dir="/usr/lib/postgresql/$v/bin"; break; }
    done
    [ -n "$dir" ] || die "binaire PG $bin introuvable (pgdg)"
    sudo -n -u postgres "$dir/$bin" -p "$RESTORE_PORT" "$@"
}

self_test() {
    local rc=0
    bash -n "$0" || rc=1
    for fn in local_pg load_env; do
        declare -f "$fn" >/dev/null || { echo "self-test: fonction $fn absente"; rc=1; }
    done
    if [ $rc -eq 0 ]; then echo "self-test: OK"; else echo "self-test: ÉCHEC"; fi
    exit $rc
}

# ───────────────────────── args ─────────────────────────
while [ $# -gt 0 ]; do
    case "$1" in
        --self-test)     self_test ;;
        --identity-file) IDENTITY="${2:?--identity-file requiert un chemin}"; shift 2 ;;
        --date)          WANT_DATE="${2:?--date requiert YYYY-MM-DD}"; shift 2 ;;
        --keep)          KEEP=true; shift ;;
        *) die "argument inconnu : $1 (usage : --identity-file K [--date D] [--keep])" ;;
    esac
done

[ -n "$IDENTITY" ] || { grep -q self-test "$0" 2>/dev/null; echo "usage : $0 --identity-file <clé privée escrow> [--date YYYY-MM-DD] [--keep]"; exit 2; }
[ "$(id -u)" = "0" ] || die "à exécuter en root (sudo) — auth peer postgres + staging root"
[ -f "$IDENTITY" ] || die "fichier identité introuvable : $IDENTITY"
load_env
: "${BACKUP_BUCKET:?backup.env : BACKUP_BUCKET requis}"
command -v age >/dev/null 2>&1 || die "binaire age absent"
command -v rclone >/dev/null 2>&1 || die "binaire rclone absent"
command -v python3 >/dev/null 2>&1 || die "python3 requis (comparaison manifest)"

# ───────────────────────── 1. Sélection du backup ─────────────────────────
if [ -z "$WANT_DATE" ]; then
    WANT_DATE="$(rclone lsf --dirs-only "${RCLONE_REMOTE}:${BACKUP_BUCKET}/daily/" 2>/dev/null | sed 's:/$::' | sort | tail -1)"
    [ -n "$WANT_DATE" ] || die "aucun backup trouvé dans ${RCLONE_REMOTE}:${BACKUP_BUCKET}/daily/"
fi
log "backup testé : daily/$WANT_DATE"

WORK="$STAGING_DIR/restore-test-$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

rclone copy "${RCLONE_REMOTE}:${BACKUP_BUCKET}/daily/$WANT_DATE/" "$WORK/" \
    || die "téléchargement échoué (bucket/policy — runbook §3)"

# ───────────────────────── 2. Intégrité (sans la clé) ─────────────────────────
[ -f "$WORK/sect-index-$WANT_DATE.json" ] || die "index clair absent dans le backup (sect-index-$WANT_DATE.json)"
python3 - "$WORK" "$WANT_DATE" <<'PYEOF' || die "checksums sha256 NON conformes au index (corruption upload/storage)"
import json, hashlib, sys, os
work, date = sys.argv[1], sys.argv[2]
idx = json.load(open(os.path.join(work, f"sect-index-{date}.json")))
ok = True
for name, meta in idx["files"].items():
    p = os.path.join(work, name)
    if not os.path.exists(p):
        print(f"  MANQUANT {name}"); ok = False; continue
    h = hashlib.sha256(open(p, "rb").read()).hexdigest()
    size = os.path.getsize(p)
    status = "OK" if (h == meta["sha256"] and size == meta["bytes"]) else "NON CONFORME"
    if status != "OK": ok = False
    print(f"  {status} {name} ({size} o)")
sys.exit(0 if ok else 1)
PYEOF
log "checksums conformes au index clair"

# ───────────────────────── 3. Déchiffrement (clé escrow) ─────────────────────────
for stem in "sect-$WANT_DATE.dump" "sect-globals-$WANT_DATE.sql" "sect-manifest-$WANT_DATE.json"; do
    age --decrypt -i "$IDENTITY" -o "$WORK/$stem" "$WORK/$stem.age" \
        || die "déchiffrement échoué pour $stem — clé escrow erronée ? (runbook §3.3)"
done
log "déchiffrement OK — la preuve que l'escrow fonctionne"

# ───────────────────────── 4. Restauration (cluster dédié 5433 — D6) ─────────────────────────
sudo -n true 2>/dev/null || die "sudo non-interactif requis"
if ! sudo -n pg_lsclusters 2>/dev/null | awk -v p="$RESTORE_PORT" '$3==p && $4=="online"{found=1} END{exit !found}'; then
    die "cluster dédié (port $RESTORE_PORT) absent ou offline — install.sh le crée (runbook §4)"
fi
# le staging est root-only (umask 077) mais pg_restore/psql tournent en
# postgres (auth peer) — sans ce chown : « Permission denied » sur le dump
# (constaté run #38103148731) et globals silencieusement non appliqués.
chown -R postgres:postgres "$WORK"

local_pg psql -d postgres -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\"" >/dev/null \
    || die "DROP DATABASE échoué"
local_pg psql -d postgres -c "CREATE DATABASE \"$RESTORE_DB\"" >/dev/null \
    || die "CREATE DATABASE échoué"

# Globals : rôles (conflits de rôles existants = journalisés, non fatals)
log "application des globals (rôles)…"
local_pg psql -d postgres -v ON_ERROR_STOP=0 -f "$WORK/sect-globals-$WANT_DATE.sql" >/dev/null 2>"$WORK/globals.err" \
    && log "globals : appliqués sans erreur" \
    || log "globals : erreurs journalisées (rôles pré-existants — non fatal) : $(grep -c ERROR "$WORK/globals.err" 2>/dev/null || echo '?')"

# Schéma + données + policies RLS
log "pg_restore (schéma + données + RLS)…"
local_pg pg_restore --no-owner --no-privileges -d "$RESTORE_DB" "$WORK/sect-$WANT_DATE.dump" \
    || die "pg_restore a échoué"

# ───────────────────────── 5. Vérification vs manifest (D8) ─────────────────────────
PGB="$(dirname "$(sudo -n -u postgres sh -c 'command -v psql' 2>/dev/null || echo /usr/lib/postgresql/18/bin/psql)")"
PGB="${PGB:-/usr/lib/postgresql/18/bin}"
python3 - "$WORK" "$WANT_DATE" "$RESTORE_DB" "$PGB" <<'PYEOF' > "$WORK/verify.txt" || die "VÉRIFICATION NON CONFORME au manifest — journal : $WORK/verify.txt"
import json, subprocess, sys, os
work, date, dbname, pgb = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
manifest = json.load(open(os.path.join(work, f"sect-manifest-{date}.json")))

def q(sql):
    out = subprocess.run(
        ["sudo", "-n", "-u", "postgres", f"{pgb}/psql", "-p", "5433",
         "-d", dbname, "-tA", "-c", sql],
        capture_output=True, text=True, check=True)
    return out.stdout.strip()

def qi(sql):
    return int(q(sql))

rest_tables = qi("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
rest_policies = qi("SELECT count(*) FROM pg_policies WHERE schemaname = 'public'")
rest_size = qi("SELECT pg_database_size(current_database())")
print(f"  informatif  dbSize   : manifest={manifest['dbSizeBytes']:>12,}  restauré={rest_size:>12,}")
print(f"  {'OK' if rest_tables == manifest['tableCount'] else 'NON CONFORME':12} tables   : manifest={manifest['tableCount']:>12,}  restauré={rest_tables:>12,}")
print(f"  {'OK' if rest_policies == manifest['policyCount'] else 'NON CONFORME':12} policies : manifest={manifest['policyCount']:>12,}  restauré={rest_policies:>12,}")

ok = rest_tables == manifest["tableCount"] and rest_policies == manifest["policyCount"]
for table, expected in (manifest.get("tables") or {}).items():
    got = qi(f'SELECT count(*) FROM "{table}"')
    match = got == expected
    ok = ok and match
    print(f"  {'OK' if match else 'NON CONFORME':12} {table:14} manifest={expected:>8,} restauré={got:>8,}")
sys.exit(0 if ok else 1)
PYEOF
cat "$WORK/verify.txt"

# ───────────────────────── 6. Conclusion + marker ─────────────────────────
MON="$(date -u +%Y-%m)"
if $KEEP; then
    log "--keep : base $RESTORE_DB laissée en place (break-glass/inspection — runbook §7)"
else
    local_pg psql -d postgres -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\"" >/dev/null
    log "base de test nettoyée"
fi
date -u +%FT%TZ > "$STAGING_DIR/restore-ok-$MON"
notify_discord "✅ Test de restauration SECT — PASS ($WANT_DATE)" "Backup daily/$WANT_DATE restauré et vérifié (counts conformes au manifest) sur le cluster dédié 5433. Marker restore-ok-$MON posé." 0x57F287
log "SUCCÈS — le backup daily/$WANT_DATE est PROUVÉ restaurable"
