#!/usr/bin/env bash
# ============================================================
# SECT-BACKUP-1 — Installateur idempotent (ADR-0013 §15)
#
# Posé par .github/workflows/backup-install.yml (self-test d'abord,
# puis SSH + clone du dépôt + copie dans /opt/sect/backup/). Chaque
# exécution est SÛRE à répéter (déploiements suivants inclus) :
#
#   1. Dépendances apt : rclone + age (+ git au besoin) ;
#   2. Scripts/units copiés depuis le dépôt ;
#   3. Cluster PG DÉDIÉ « sect » (décision D6) : pg_createcluster 18
#      sect — port 5433, listen 127.0.0.1 UNIQUEMENT. Il ne touche
#      JAMAIS au cluster mikcloud 18-main/5432 (données séparées,
#      postgresql.conf séparé, arrêt/démarrage indépendants) ;
#   4. /opt/sect/backup.env seed-once depuis l'exemple (chmod 600) ;
#   5. Timers systemd installés — activés SEULEMENT si backup.env
#      paraît configuré (AGE_RECIPIENT=age1… + NEON_DIRECT_URL=…) :
#      l'exploitant reste maître de la mise en service (runbook §5).
#
# usage : install.sh [--self-test]
# ============================================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="/opt/sect/backup"
STAGING="/var/lib/sect-backup"
UNIT_DST="/etc/systemd/system"

log() { printf '%s [sect-install] %s\n' "$(date -u +%FT%TZ)" "$*"; }

self_test() {
    local rc=0
    bash -n "$0" || rc=1
    for f in sect_backup.sh sect_backup_watchdog.sh sect_restore_test.sh vm_audit.sh; do
        [ -f "$SRC_DIR/$f" ] || { echo "self-test: $f absent de $SRC_DIR"; rc=1; }
        bash -n "$SRC_DIR/$f" || { echo "self-test: syntaxe $f invalide"; rc=1; }
    done
    if command -v systemd-analyze >/dev/null 2>&1; then
        local verify_out
        for u in "$SRC_DIR"/systemd/*.timer "$SRC_DIR"/systemd/*.service; do
            [ -f "$u" ] || { echo "self-test: unit $u absent"; rc=1; continue; }
            # « Command /opt/sect/… not executable » est ATTENDU hors VM
            # (ExecStart pointe le chemin installé, inexistant sur le runner).
            verify_out=$(systemd-analyze verify "$u" 2>&1 | grep -v 'is not executable: No such file or directory' || true)
            if [ -n "$verify_out" ]; then
                echo "self-test: unit invalide $u — $verify_out"; rc=1
            fi
        done
    fi
    if [ $rc -eq 0 ]; then echo "self-test: OK"; else echo "self-test: ÉCHEC"; fi
    exit $rc
}
[ "${1:-}" = "--self-test" ] && self_test

[ "$(id -u)" = "0" ] || { echo "à exécuter en root (sudo)"; exit 1; }
sudo -n true 2>/dev/null || true   # root : sudo déjà implicite

# ── 1. Dépendances ──
need_install=""
for b in rclone age git; do
    command -v "$b" >/dev/null 2>&1 || need_install="$need_install $b"
done
if [ -n "$need_install" ]; then
    log "installation apt :$need_install"
    export DEBIAN_FRONTEND=noninteractive
    # Un dépôt TIERS cassé (constaté : caddy/cloudsmith → 402 Payment
    # Required) ne doit PAS bloquer l'install : update NON fatal, on
    # installe sur les listes déjà présentes (rclone/age sont en Ubuntu
    # universe, git partout). L'échec d'INSTALL seul est bloquant.
    apt-get update -qq \
        || log "AVERTISSEMENT : apt-get update partiel (dépôt tiers cassé ?) — tentative sur les listes existantes"
    apt-get install -y -qq $need_install \
        || { echo "ÉCHEC apt install — vérifier les dépôts pgdg/ubuntu (runbook §4)"; exit 1; }
fi
command -v rclone >/dev/null && log "rclone $(rclone version | head -1 | awk '{print $2}')"
command -v age    >/dev/null && log "age présent"

# ── 2. Fichiers en place ──
# NB : dans le chemin Actions, SRC_DIR == DEST (le workflow copie
# ops/backup/ → /opt/sect/backup/ PUIS exécute install.sh depuis là) :
# la boucle ne copie alors RIEN (chmod seul) — plus de « cp: same file ».
# STAGING : postgres doit pouvoir le TRAVERSER (pg_restore en auth peer
# lit les dumps du restore-test) — root reste insensible au chown.
mkdir -p "$DEST" "$STAGING" "$DEST/systemd"
chmod 0755 "$DEST"; chmod 0700 "$STAGING"
chown postgres:postgres "$STAGING" 2>/dev/null || true
for f in sect_backup.sh sect_backup_watchdog.sh sect_restore_test.sh vm_audit.sh install.sh sect_backup.env.example; do
    [ -f "$SRC_DIR/$f" ] || continue
    if [ "$SRC_DIR" != "$DEST" ]; then
        install -m 0755 "$SRC_DIR/$f" "$DEST/$f"
    fi
    chmod 0755 "$DEST/$f"
done
for u in "$SRC_DIR"/systemd/*.service "$SRC_DIR"/systemd/*.timer; do
    [ -f "$u" ] || continue
    install -m 0644 "$u" "$UNIT_DST/$(basename "$u")"
done

# ── 3. Cluster dédié SECT (D6 — 5433, localhost) ──
if command -v pg_lsclusters >/dev/null 2>&1; then
    PG_VER="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1)"
    [ -n "$PG_VER" ] || { echo "aucun /etc/postgresql — pgdg requis (ADR-0013 §12.4)"; exit 1; }
    if pg_lsclusters 2>/dev/null | awk '$2=="sect" && $4=="online"{found=1} END{exit !found}'; then
        log "cluster « sect » déjà en ligne (5433) — rien à faire"
    else
        # Reliquat d'une création AVORTÉE (initdb interrompu — p.ex. par
        # l'ancien bug « -- -p 5433 » passé à initdb) : cluster listé mais
        # SANS PG_VERSION = AUCUNE donnée → purge et recréation propres.
        if pg_lsclusters 2>/dev/null | awk '$2=="sect"{found=1} END{exit !found}' \
           && [ ! -s "/var/lib/postgresql/$PG_VER/sect/PG_VERSION" ]; then
            log "création avortée détectée (pas de PG_VERSION) — purge avant recréation"
            pg_dropcluster --stop "$PG_VER" sect >/dev/null 2>&1 || true
            rm -rf "/var/lib/postgresql/$PG_VER/sect" "/etc/postgresql/$PG_VER/sect"
        fi
        if pg_lsclusters 2>/dev/null | awk '$2=="sect"{found=1} END{exit !found}'; then
            log "cluster « sect » existe mais offline — démarrage"
        else
            log "création du cluster dédié « sect » (port 5433 — ne touche pas à 18-main/mikcloud)"
            # NOTE : le port passe par postgresql.conf (ci-dessous), PAS par
            # « -- -p » (options après « -- » = initdb, qui ne connaît pas -p).
            pg_createcluster "$PG_VER" sect || { echo "ÉCHEC pg_createcluster"; exit 1; }
        fi
        CONF="/etc/postgresql/$PG_VER/sect/postgresql.conf"
        [ -f "$CONF" ] || { echo "config cluster sect introuvable : $CONF"; exit 1; }
        # Écoute localhost UNIQUEMENT (anti-décision n°3 : jamais de port PG
        # exposé) + port 5433 EXPLICITE (la dernière valeur du conf gagne).
        grep -q "^listen_addresses = '127.0.0.1'" "$CONF" \
            || echo "listen_addresses = '127.0.0.1'" >> "$CONF"
        grep -q "^port = 5433" "$CONF" \
            || echo "port = 5433" >> "$CONF"
        pg_ctlcluster "$PG_VER" sect start \
            || { echo "ÉCHEC démarrage cluster sect (pg_ctlcluster)"; exit 1; }
        log "cluster « sect » prêt (127.0.0.1:5433)"
    fi
else
    log "AVERTISSEMENT : pg_lsclusters absent — cluster dédié NON créé (installer postgresql pgdg d'abord, relancer)"
fi

# ── 4. Seed-once de backup.env (jamais écrasé ensuite) ──
if [ ! -f "/opt/sect/backup.env" ]; then
    install -m 0600 "$DEST/sect_backup.env.example" /opt/sect/backup.env 2>/dev/null \
        || { cp "$DEST/sect_backup.env.example" /opt/sect/backup.env; chmod 0600 /opt/sect/backup.env; }
    log "/opt/sect/backup.env seedé depuis l'exemple — À CONFIGURER (runbook §3) — chmod 600"
else
    log "/opt/sect/backup.env déjà présent — inchangé (l'exploitant garde la main)"
fi

# ── 5. Timers : installés toujours, activés si env configuré ──
systemctl daemon-reload
# « Configuré » = valeurs réelles ET AUCUN marqueur de l'exemple
# (VOTRE_/LA_CSK/xxx/… : le seed-once copie l'exemple — ses
# placeholders matchaient les anciens greps et armaient les timers
# prématurément, runbook §2-2 violé — corrigé run #38101701353).
if ! grep -qE 'VOTRE_|LA_CSK|xxx|\.\.\.|…' /opt/sect/backup.env 2>/dev/null \
   && grep -q '^AGE_RECIPIENT=age1[a-z0-9]' /opt/sect/backup.env 2>/dev/null \
   && grep -q '^NEON_DIRECT_URL=postgres' /opt/sect/backup.env 2>/dev/null; then
    systemctl enable --now sect-backup.timer sect-backup-watchdog.timer >/dev/null 2>&1 || true
    log "backup.env configuré → timers ACTIVÉS (backup 03:32 UTC, watchdog 12:32 UTC)"
    log "PREMIER BACKUP + PREUVE DE RESTAURATION : runbook §5/§6 (obligatoire le jour même)"
else
    log "backup.env NON configuré → timers installés mais DÉSACTIVÉS (runbook §3 puis §5)"
    systemctl disable sect-backup.timer sect-backup-watchdog.timer >/dev/null 2>&1 || true
fi

log "installation terminée"
