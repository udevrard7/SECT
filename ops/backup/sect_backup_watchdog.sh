#!/usr/bin/env bash
# ============================================================
# SECT-BACKUP-1 — Watchdog backups (ADR-0013 §15)
#
# Timer systemd 12:32 UTC quotidien. Deux rôles :
#   1. SILENCE : marker last_success vieux de > 36 h → alerte Discord
#      (un backup qui échoue alerte de lui-même ; le silence couvre
#      timer désactivé / VM réinstallée / cron mort — le cas sournois).
#      NB : si la VM entière est down, c'est la sonde P1 GitHub qui
#      alerte (uptime-probe) — périmètres complémentaires, jamais
#      doublons.
#   2. RAPPEL MENSUEL : les 1-3 du mois → rappel « test de restauration
#      dû » (runbook §6 — ~15 min, clé escrow requise) tant que le
#      mois n'a pas de marker restore-ok. Un backup non testé
#      n'existe pas (décision D8/ADR §6 phase 1).
#
# Vérifie AUSSI le listing bucket (bucket/policy/rétention cassés =
# dégradation visible, pas silencieuse).
#
# Usage :
#   sect_backup_watchdog.sh             — contrôle (timer systemd)
#   sect_backup_watchdog.sh --self-test — contrôles internes (CI)
# ============================================================
set -euo pipefail
umask 077

ENV_FILE="${SECT_BACKUP_ENV:-/opt/sect/backup.env}"
STAGING_DIR="${SECT_BACKUP_STAGING:-/var/lib/sect-backup}"
SILENCE_HOURS="${SECT_BACKUP_SILENCE_HOURS:-36}"

log()  { printf '%s [sect-watchdog] %s\n' "$(date -u +%FT%TZ)" "$*"; }
warn() { log "ALERTE — $*"; notify_discord "⚠️ Watchdog backups SECT" "$*. ($(date -u +%FT%TZ)) — runbook docs/ops/backup-restore-runbook.md" 0xE67E22; }

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
    [ -r "$ENV_FILE" ] || { log "env introuvable ($ENV_FILE) — watchdog réduit au marker local"; return 1; }
    local key val
    while IFS= read -r raw || [ -n "$raw" ]; do
        case "$raw" in ''|'#'*) continue ;; esac
        key="${raw%%=*}"; val="${raw#*=}"
        case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
        # shellcheck disable=SC2163
        export "$key" && printf -v "$key" '%s' "$val"
    done < "$ENV_FILE"
    return 0
}

# ───────────────────────── self-test (CI) ─────────────────────────
self_test() {
    local rc=0
    bash -n "$0" || rc=1
    # âge_hours : parsing ISO → heures
    age_hours() {
        local iso="$1"
        local epoch
        epoch=$(date -u -d "$iso" +%s 2>/dev/null) || { echo -1; return; }
        echo $(( ( $(date -u +%s) - epoch ) / 3600 ))
    }
    local h
    h=$(age_hours "$(date -u -d '2 hours ago' +%FT%TZ)")
    [ "$h" = "1" ] || [ "$h" = "2" ] || { echo "self-test: age_hours incorrect ($h)"; rc=1; }
    if [ $rc -eq 0 ]; then echo "self-test: OK"; else echo "self-test: ÉCHEC"; fi
    exit $rc
}
[ "${1:-}" = "--self-test" ] && self_test

# ───────────────────────── contrôles ─────────────────────────
ENV_LOADED=false
load_env && ENV_LOADED=true
RCLONE_REMOTE="${RCLONE_REMOTE:-oci}"

# 1. Silence — marker last_success
MARKER="$STAGING_DIR/last_success"
if [ ! -f "$MARKER" ]; then
    warn "aucun backup n'a JAMAIS réussi (marker $MARKER absent). Si c'est le premier déploiement : exécuter sect_backup.sh --announce (runbook §5)."
else
    LAST="$(cat "$MARKER" | tr -d '\r\n')"
    EPOCH_LAST="$(date -u -d "$LAST" +%s 2>/dev/null || echo 0)"
    AGE_H=$(( ( $(date -u +%s) - EPOCH_LAST ) / 3600 ))
    if [ "$AGE_H" -ge "$SILENCE_HOURS" ]; then
        warn "silence backup détecté : dernier succès il y a ${AGE_H} h (> ${SILENCE_HOURS} h). Vérifier : systemctl status sect-backup.timer / journalctl -u sect-backup.service (runbook §5)."
    else
        log "OK — dernier succès il y a ${AGE_H} h (< ${SILENCE_HOURS} h)"
    fi
fi

# 2. Bucket joignable + rétention vivante (dégradation visible)
if $ENV_LOADED && command -v rclone >/dev/null 2>&1; then
    RECENT="$(rclone lsf --dirs-only "${RCLONE_REMOTE}:${BACKUP_BUCKET:-sect-backups}/daily/" 2>/dev/null | sort | tail -1 || true)"
    if [ -z "$RECENT" ]; then
        warn "bucket ${RCLONE_REMOTE}:${BACKUP_BUCKET:-sect-backups} illisible ou vide — endpoint/CSK/policy ? (runbook §3)"
    else
        log "OK — bucket lisible, dernier dossier daily : $RECENT"
    fi
fi

# 3. Rappel mensuel test de restauration (jours 1-3, une fois par mois)
DOM="$(date -u +%d)"
MON="$(date -u +%Y-%m)"
if [ "$DOM" -le "03" ] && [ ! -f "$STAGING_DIR/restore-ok-$MON" ]; then
    log "rappel : test de restauration mensuel non confirmé pour $MON"
    notify_discord "🧪 Test de restauration mensuel dû ($MON)" "Le dernier backup n'est pas encore prouvé restaurable. Procédure ~15 min : runbook backup-restore §6 (clé escrow requise). À la réussite, le script pose restore-ok-$MON et ce rappel cesse." 0xF1C40F
fi

log "watchdog terminé"
exit 0
