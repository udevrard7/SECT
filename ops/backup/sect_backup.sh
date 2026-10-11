#!/usr/bin/env bash
# ============================================================
# SECT-BACKUP-1 — Backup nocturne Neon chiffré → Object Storage OCI
# ADR-0013 §15 — décisions D1-D10 validées par l'exploitant (11/10/2026)
#
#   D1 pg_dump -Fc            · D2 age client-side (+ SSE bucket)
#   D3 rclone (API S3 OCI)    · D4 timer systemd 03:32 UTC, Persistent
#   D5 nightly (RPO 24 h)     · D6 cluster dédié 5433 (cible restore)
#   D7 CSK dédiée + policy scopée bucket
#   D8 dump + globals + manifest (counts auto-vérifiés au restore)
#   D9 rétention : 30 quotidiens + 12 mensuels (copie le 1ᵉʳ du mois)
#
# PREUVE MESURÉE (11/10/2026, sonde jetable lecture seule, jamais
# commitée) : le rôle du DSN direct (neondb_owner) porte BYPASSRLS
# sur Neon → pg_dump capture TOUTES les lignes, y compris les tables
# RLS FORCE (AlertingRule=11, RequestLog=4 886 comptés sans claims).
# Un dump amputé par RLS est donc EXCLU par construction.
#
# Calage CU (ADR-0013 §13.4) : 03:32 UTC tombe DANS la fenêtre d'éveil
# du tick 03:30 de la grille M1 (awake ≈ 03:30→03:36:30 : tick + conn
# idle 90 s + timeout de suspension 300 s) → coût CU marginal ≈ 0.
# NE PAS déplacer ce calage sans refaire l'arithmétique de l'ADR.
#
# Sécurité (D2/D7) :
#   - la clé PRIVÉE age ne vit JAMAIS sur la VM (escrow exploitant,
#     doublée) ; la VM ne connaît que la clé publique (AGE_RECIPIENT) ;
#   - backup.env est chmod 600 root ; les valeurs sont lues par un
#     parseur SANS eval (un DSN contient « & » — source/cassee serait
#     une faille silencieuse : l'affectation partirait en arrière-plan) ;
#   - rien n'est exposé : la VM ne fait que des connexions SORTANTES
#     (Neon :5432, Object Storage :443, Discord :443).
#
# Usage :
#   sect_backup.sh               — backup normal (timer systemd / manuel)
#   sect_backup.sh --announce    — notifier AUSSI le succès (1ʳᵉ fois)
#   sect_backup.sh --self-test    — contrôles internes sans effet de bord
# ============================================================
set -euo pipefail
umask 077

ENV_FILE="${SECT_BACKUP_ENV:-/opt/sect/backup.env}"
STAGING_DIR="${SECT_BACKUP_STAGING:-/var/lib/sect-backup}"
LOCK_FILE="${SECT_BACKUP_LOCK:-/run/sect-backup.lock}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANNOUNCE=false

log()  { printf '%s [sect-backup] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die()  { log "ÉCHEC — $*"; notify_discord "❌ Backup SECT échoué" "$* (host $(hostname), $(date -u +%FT%TZ)). Voir journalctl -u sect-backup.service — runbook §5." 0xED4245; exit 1; }

# ── Parseur env SANS eval — immune aux & ? espaces des DSN ──
# Lit ENV_FILE (format strict KEY=VALEUR, sans quotes, lignes
# commentées #) et exporte les clés sûres [A-Z0-9_]+.
load_env() {
    [ -r "$ENV_FILE" ] || die "env introuvable : $ENV_FILE (runbook §3)"
    local key val
    while IFS= read -r raw || [ -n "$raw" ]; do
        case "$raw" in ''|'#'*) continue ;; esac
        key="${raw%%=*}"
        val="${raw#*=}"
        case "$key" in
            *[!A-Za-z0-9_]*|'') continue ;;
        esac
        # shellcheck disable=SC2163
        export "$key" && printf -v "$key" '%s' "$val"
    done < "$ENV_FILE"
}

# Notification Discord (même format d'embed que l'AlertingWorker —
# canaux dégradation honnête : absent = log seulement, jamais fatal).
notify_discord() { # <titre> <description> <couleur>
    local title="$1" desc="$2" color="${3:-0x95A5A6}"
    if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
        log "Discord non configuré — message journalisé seulement : $title"
        return 0
    fi
    desc=${desc//\"/\'} ; desc=${desc//$'\n'/ · }
    curl -fsS --max-time 10 -X POST -H 'Content-Type: application/json' \
        --data "$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"SECT Backup"},"timestamp":"%s"}]}' \
            "$title" "$desc" "$color" "$(date -u +%FT%TZ)")" \
        "${DISCORD_WEBHOOK_URL%/}" >/dev/null \
        || log "AVERTISSEMENT : envoi Discord a échoué (non fatal)"
}

# ── Détection du client PG (pgdg) — la version DOIT être ≥ serveur ──
pg_bin_dir() {
    local d
    for v in 18 17 16; do
        d="/usr/lib/postgresql/$v/bin"
        [ -x "$d/pg_dump" ] && [ -x "$d/pg_dumpall" ] && { echo "$d"; return 0; }
    done
    command -v pg_dump >/dev/null 2>&1 && { dirname "$(command -v pg_dump)"; return 0; }
    return 1
}

# ── Rétention : entrées à PURGER (tout sauf les N dernières, triées — stdin) ──
# oldest_beyond N : liste triée → sorties = les plus anciennes au-delà du quota.
# (head -n -N = tout sauf les N dernières — GNU head, Ubuntu/runner.)
oldest_beyond() { head -n -"$1"; }

# Rétention D9 : purge distante au-delà de RETENTION_* 
prune_remote() { # <prefix> <keep>
    local prefix="$1" keep="$2" dir
    local listing
    listing=$(rclone lsf --dirs-only "${RCLONE_REMOTE}:${BACKUP_BUCKET}/${prefix}/" 2>/dev/null) \
        || { log "AVERTISSEMENT : listing ${prefix} impossible — purge différée"; return 0; }
    [ -z "$listing" ] && return 0
    while IFS= read -r dir; do
        [ -n "$dir" ] || continue
        log "prune ${prefix}/${dir}"
        rclone purge "${RCLONE_REMOTE}:${BACKUP_BUCKET}/${prefix}/${dir}" \
            || log "AVERTISSEMENT : purge ${dir} a échoué (non fatal, retenté demain)"
    done < <(printf '%s\n' "$listing" | sort | oldest_beyond "$keep")
}

# ── Manifest (D8) : counts des tables critiques, taille, policies ──
# Construit le SQL depuis MANIFEST_TABLES (validation anti-injection :
# identifiants [A-Za-z_][A-Za-z0-9_]* uniquement).
build_manifest_sql() {
    local tables="${MANIFEST_TABLES:-User,Epreuve,Reponse,RequestLog,AuditLog}"
    local unions="" t first=1
    IFS=',' read -ra arr <<< "$tables"
    for t in "${arr[@]}"; do
        t="$(echo "$t" | tr -d '[:space:]')"
        [ -z "$t" ] && continue
        if ! [[ "$t" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            die "MANIFEST_TABLES contient un identifiant invalide : « $t »"
        fi
        [ $first -eq 1 ] && first=0 || unions+=" UNION ALL "
        unions+="SELECT '$t' AS t, count(*) AS c FROM \"$t\""
    done
    local tables_json="(SELECT json_object_agg(t, c) FROM (${unions:-SELECT NULL::text AS t, NULL::bigint AS c WHERE false}) s)"
    echo "SELECT json_build_object(
        'generatedAt', now()::text,
        'source', 'neon',
        'dbSizeBytes', pg_database_size(current_database()),
        'tableCount', (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'),
        'policyCount', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
        'tables', ${tables_json}
    );"
}

# ───────────────────────── self-test (CI) ─────────────────────────
self_test() {
    local rc=0
    bash -n "$0" || rc=1
    # oldest_beyond : les entrées AU-DELÀ du quota sont bien les plus anciennes
    local pruned
    pruned=$(printf 'a\nb\nc\nd\ne\n' | oldest_beyond 2 | tr '\n' ' ')
    [ "$pruned" = "a b c " ] || { echo "self-test: oldest_beyond incorrect (« $pruned » — attendu : a b c)"; rc=1; }
    # Le parseur env : un DSN avec & est lu littéralement, sans fondre
    local tmp; tmp=$(mktemp)
    printf 'NEON_DIRECT_URL=postgres://u:p@h/db?a=1&b=2\nDISCORD_WEBHOOK_URL=\n# commentaire\n' > "$tmp"
    local out
    out=$(SECT_BACKUP_ENV="$tmp" bash -c '
        ENV_FILE="$SECT_BACKUP_ENV"
        while IFS= read -r raw || [ -n "$raw" ]; do
            case "$raw" in ""|"#"*) continue ;; esac
            key="${raw%%=*}"; val="${raw#*=}"
            case "$key" in *[!A-Za-z0-9_]*|"") continue ;; esac
            export "$key" && printf -v "$key" "%s" "$val"
        done < "$ENV_FILE"
        printf "%s" "${NEON_DIRECT_URL#postgres://}"')
    rm -f "$tmp"
    [ "$out" = "u:p@h/db?a=1&b=2" ] || { echo "self-test: parseur env a mutilé la valeur ( « $out » )"; rc=1; }
    # Le SQL du manifest se construit et cite les identifiants
    MANIFEST_TABLES="User,Reponse" out="$(build_manifest_sql 2>/dev/null)" \
        || { echo "self-test: build_manifest_sql a échoué"; rc=1; }
    grep -q 'FROM "User"' <<< "$out" || { echo "self-test: identifiant non quoté"; rc=1; }
    if [ $rc -eq 0 ]; then echo "self-test: OK"; else echo "self-test: ÉCHEC"; fi
    exit $rc
}

# ───────────────────────── main ─────────────────────────
[ "${1:-}" = "--self-test" ] && self_test
[ "${1:-}" = "--announce" ] && ANNOUNCE=true

load_env
: "${NEON_DIRECT_URL:?backup.env : NEON_DIRECT_URL requis (runbook §3)}"
: "${AGE_RECIPIENT:?backup.env : AGE_RECIPIENT requis (runbook §3.3)}"
: "${BACKUP_BUCKET:?backup.env : BACKUP_BUCKET requis (runbook §3.1)}"
RCLONE_REMOTE="${RCLONE_REMOTE:-oci}"
RETENTION_DAILY="${RETENTION_DAILY:-30}"
RETENTION_MONTHLY="${RETENTION_MONTHLY:-12}"
case "$AGE_RECIPIENT" in age1*|ssh-ed25519*) ;; *) die "AGE_RECIPIENT ne ressemble pas à une clé publique age (age1…)" ;; esac
command -v age >/dev/null 2>&1    || die "binaire age absent — install.sh l'installe (runbook §4)"
command -v rclone >/dev/null 2>&1  || die "binaire rclone absent — install.sh l'installe (runbook §4)"

PGB="$(pg_bin_dir)" || die "client PostgreSQL (pg_dump) introuvable — pgdg requis (§12.4 ADR)"
DATE="$(date -u +%F)"
MON="$(date -u +%Y-%m)"
RUN_DIR="$STAGING_DIR/run-$DATE-$$"
mkdir -p "$RUN_DIR"

# Un seul backup à la fois (timer + manuel ne se marchent pas dessus)
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    log "un backup est déjà en cours (lock $LOCK_FILE) — abandon silencieux"
    exit 0
fi

log "backup $DATE — staging $RUN_DIR"

# 1. Dump custom-compressé (D1) — toutes les lignes (preuve BYPASSRLS, cf. en-tête)
"$PGB/pg_dump" -Fc -d "$NEON_DIRECT_URL" -f "$RUN_DIR/sect-$DATE.dump" \
    || die "pg_dump a échoué (Neon joignable ? console : compute suspendu ?)"

# 2. Globals : rôles/permissions (D8 — requis par les 233 policies RLS au restore)
"$PGB/pg_dumpall" --globals-only -d "$NEON_DIRECT_URL" -f "$RUN_DIR/sect-globals-$DATE.sql" \
    || die "pg_dumpall --globals-only a échoué"

# 3. Manifest (D8) — counts vérifiés à CHAQUE test de restore
"$PGB/psql" -tA -d "$NEON_DIRECT_URL" -c "$(build_manifest_sql)" > "$RUN_DIR/sect-manifest-$DATE.json" \
    || die "manifest (counts) a échoué — une table de MANIFEST_TABLES a disparu ? (renommée par une migration)"
[ -s "$RUN_DIR/sect-manifest-$DATE.json" ] || die "manifest vide — refus de continuer"

# 4. Chiffrement age (D2) — clé publique seulement sur la VM
for f in "sect-$DATE.dump" "sect-globals-$DATE.sql" "sect-manifest-$DATE.json"; do
    age -R "$AGE_RECIPIENT" -o "$RUN_DIR/$f.age" "$RUN_DIR/$f" \
        || die "chiffrement age a échoué pour $f"
done

# 5. Index clair (checksums des fichiers CHIFFRÉS — vérifiables sans la clé)
{
    printf '{\n  "date": "%s",\n  "files": {\n' "$DATE"
    first=1
    for f in "sect-$DATE.dump.age" "sect-globals-$DATE.sql.age" "sect-manifest-$DATE.json.age"; do
        [ $first -eq 1 ] && first=0 || printf ',\n'
        printf '    "%s": {"sha256": "%s", "bytes": %s}' \
            "$f" "$(sha256sum "$RUN_DIR/$f" | cut -d' ' -f1)" "$(stat -c%s "$RUN_DIR/$f")"
    done
    printf '\n  }\n}\n'
} > "$RUN_DIR/sect-index-$DATE.json"

# 6. Upload (D3) — vérification taille par rclone à la copie
rclone copy "$RUN_DIR" "${RCLONE_REMOTE}:${BACKUP_BUCKET}/daily/$DATE/" \
    || die "upload rclone a échoué (endpoint/CSK/policy — runbook §3.1-3.2)"

# 7. Mensuel (D9) — copie supplémentaire le 1ᵉʳ du mois
if [ "$(date -u +%d)" = "01" ]; then
    rclone copy "$RUN_DIR" "${RCLONE_REMOTE}:${BACKUP_BUCKET}/monthly/$MON/" \
        || log "AVERTISSEMENT : copie mensuelle a échoué (non fatal)"
fi

# 8. Rétention glissante (D9)
prune_remote daily "$RETENTION_DAILY"
prune_remote monthly "$RETENTION_MONTHLY"

# 9. Marker de succès (le watchdog §13.6 vérifie < 36 h)
date -u +%FT%TZ > "$STAGING_DIR/last_success"

rm -rf "$RUN_DIR"

SIZE=$(du -sh "$STAGING_DIR" 2>/dev/null | cut -f1 || true)
log "SUCCÈS — daily/$DATE uploadé (${SIZE:-n/a} locaux purgeables)"
if $ANNOUNCE; then
    notify_discord "✅ Backup SECT $DATE" "Chiffré age → Object Storage (daily/$DATE). Test de restauration à effectuer : runbook §6, clé escrow requise." 0x57F287
fi
