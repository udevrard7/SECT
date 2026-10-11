#!/usr/bin/env bash
# ============================================================
# SECT-BACKUP-0 — Audit VM OCI (lecture seule) — ADR-0013 §15/§12.4
#
# Phase 0 résiduelle : 15 minutes de vérifications SANS AUCUNE
# écriture (aucun service modifié, aucun conteneur touché, aucune
# table écrite). Rapport imprimé sur stdout — à conserver dans
# l'ADR-0013 §15 (résultats) et le runbook backup-restore.
#
# Couvre :
#   1. Host      : OS, uptime, charge, RAM (free), disque (df/du)
#   2. PostgreSQL : pg_lsclusters (18-main=mikcloud — NE PAS TOUCHER),
#                  version, bases+tailles, listen_addresses, port,
#                  pg_hba (résumé), connexions actives par état
#   3. Docker    : conteneurs + stats instantanées
#   4. Réseau    : ports en écoute (80/443 caddy système, 8090 API,
#                  5432 mikcloud, 5433 futur cluster dédié SECT)
#   5. Reclaim Oracle (§15) : échantillons locaux charge CPU/RAM/réseau
#                  + checklist console OCI (95e percentile 7 j — les
#                  métriques fines ne vivent QUE dans la console)
#   6. Prérequis phase 1 : rclone/age/git présents ?
#
# Usage :
#   vm_audit.sh              — audit complet
#   vm_audit.sh --self-test  — contrôles internes (CI)
#
# L'audit ne FAIL JAMAIS sur une vérification indisponible (il
# dégrade et le signale) — il collecte. Exit 0 sauf --self-test cassé.
# ============================================================
set -uo pipefail   # PAS de -e : une vérification indisponible ne
                   # doit pas avorter le rapport.

PROG="$(basename "$0")"

section() { printf '\n════ %s ════\n' "$*"; }
line()    { printf '%s\n' "  $*"; }

# Sudo non-interactif ? (Oracle Ubuntu = passwordless par défaut ;
# si absent, les vérifications PG/Docker dégradent proprement)
SUDO_OK=false
if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    SUDO_OK=true
fi

# ───────────────────────── 1. Host ─────────────────────────
host_info() {
    section "1. HOST"
    line "hostname : $(hostname 2>/dev/null || echo '?')"
    line "os       : $(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-?}" || uname -s -r)"
    line "kernel   : $(uname -r)"
    line "uptime   : $(uptime -p 2>/dev/null || uptime)"
    line "loadavg  : $(cut -d' ' -f1-3 /proc/loadavg)"
    line "date/UTC : $(date -u +%FT%TZ)"

    printf '\n  ── RAM (free -h) ──\n'
    free -h 2>/dev/null || line "(free indisponible)"

    printf '\n  ── Disque (df -h) ──\n'
    df -h / /var/lib/postgresql /var/lib/docker /opt 2>/dev/null || df -h / || true

    printf '\n  ── Empreintes disque ──\n'
    if $SUDO_OK; then
        du -sh /var/lib/postgresql /var/lib/docker /opt/sect 2>/dev/null || true
    else
        line "(du PG/docker : sudo indisponible — cf. sortie df)"
    fi
}

# ───────────────────────── 2. PostgreSQL ─────────────────────────
pg_info() {
    section "2. POSTGRESQL (⚠ 18-main = mikcloud — NE JAMAIS TOUCHER)"

    printf '\n  ── pg_lsclusters ──\n'
    if $SUDO_OK; then
        sudo -n pg_lsclusters 2>/dev/null || line "(pg_lsclusters indisponible)"
    else
        line "(sudo indisponible — depuis le shell postgres : pg_lsclusters)"
    fi

    local PGB
    PGB=""
    for v in 18 17 16; do
        [ -d "/usr/lib/postgresql/$v/bin" ] && { PGB="/usr/lib/postgresql/$v/bin"; break; }
    done
    if [ -z "$PGB" ]; then
        line "(aucun /usr/lib/postgresql/*/bin — client PG introuvable)"
        return
    fi
    line "client bin : $PGB"

    if $SUDO_OK; then
        # psql SYSTEM (cluster local mikcloud, port 5432) — lecture seule.
        psql_sys() {
            sudo -n -u postgres "$PGB/psql" -p 5432 -tA -c "$1" 2>/dev/null
        }
        printf '\n  ── Version & écoute ──\n'
        line "version      : $(psql_sys 'SELECT version()' | head -1)"
        line "listen_addrs : $(psql_sys 'SHOW listen_addresses')"
        line "port         : $(psql_sys 'SHOW port')"
        line "max_conn     : $(psql_sys 'SHOW max_connections')"

        printf '\n  ── Bases (nom | taille) ──\n'
        psql_sys "SELECT datname || ' | ' || pg_size_pretty(pg_database_size(datname))
                   FROM pg_database WHERE NOT datistemplate ORDER BY 1" || true

        printf '\n  ── Connexions par état ──\n'
        psql_sys "SELECT state || ' : ' || count(*) FROM pg_stat_activity
                   GROUP BY state ORDER BY 2 DESC" || true

        printf '\n  ── Cluster dédié SECT (5433, décision D6) ──\n'
        if sudo -n pg_lsclusters 2>/dev/null | awk '$2=="sect"{found=1} END{exit !found}'; then
            line "PRÉSENT — état :"
            sudo -n pg_lsclusters 2>/dev/null | awk '$2=="sect"' | sed 's/^/    /'
            line "écoute 5433 : $(sudo -n ss -tln 2>/dev/null | grep -c ':5433 ' || true) socket(s)"
        else
            line "ABSENT — sera créé par ops/backup/install.sh (pg_createcluster 18 sect, port 5433, 127.0.0.1)"
        fi

        printf '\n  ── pg_hba (résumé : type+base, dédupliqué) ──\n'
        sudo -n -u postgres "$PGB/psql" -p 5432 -tA -c \
            "SELECT type || ' ' || databases FROM pg_hba_file_rules" 2>/dev/null \
            | sort | uniq -c | sed 's/^/    /' || line "(lecture pg_hba indisponible)"
    else
        line "(sudo indisponible — relancer en SSH interactif pour la section PG)"
    fi
}

# ───────────────────────── 3. Docker ─────────────────────────
docker_info() {
    section "3. DOCKER (conteneurs + charge instantanée)"
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        docker ps --format '    {{.Names}} | {{.Status}} | {{.Image}}' || true
        printf '\n  ── stats (instantané) ──\n'
        docker stats --no-stream --format \
            '    {{.Name}} | CPU {{.CPUPerc}} | RAM {{.MemUsage}}' || true
    else
        line "(docker indisponible pour cet utilisateur)"
    fi
}

# ───────────────────────── 4. Réseau ─────────────────────────
net_info() {
    section "4. RÉSEAU — ports en écoute"
    printf '    %-22s %s\n' "PORT" "PROCESSUS"
    if $SUDO_OK; then
        sudo -n ss -tlnp 2>/dev/null | awk 'NR>1 {
            n=split($4,a,":"); port=a[n];
            match($0, /users:\(\(\"[^\"]+\"/); proc=substr($0, RSTART+10, RLENGTH-11);
            print port, proc
        }' | sort -un -k1 | sed 's/^/    /' || true
    else
        ss -tln 2>/dev/null | awk 'NR>1 {print $4}' | sed 's/.*://' | sort -un | sed 's/^/    /'
    fi
    line ""
    line "attendu : 80/443 (caddy système mikcloud), 4000 (api.mikcloud),"
    line "         8090 (sect-api, 127.0.0.1), 5432 (PG 18-main, localhost)"
    line "         5433 = cluster dédié SECT (post-install) — 127.0.0.1 UNIQUEMENT"
}

# ───────────────────────── 5. Reclaim Oracle ─────────────────────────
reclaim_info() {
    section "5. RECLAIM ORACLE — politique Always Free « idle » (ADR-0013 §15)"

    printf '\n  ── Charge locale (échantillons instantanés — indicatifs) ──\n'
    line "loadavg (1/5/15 min) : $(cut -d' ' -f1-3 /proc/loadavg)"
    if command -v vmstat >/dev/null 2>&1; then
        local idle
        idle=$(vmstat 1 5 2>/dev/null | tail -1 | awk '{print $15}')
        [ -n "${idle:-}" ] && line "CPU idle moyen (5 s)   : ${idle}% (reclaim si 95e pct < 20% sur 7 j)"
    fi
    if command -v sar >/dev/null 2>&1; then
        printf '\n  ── sar (historique sysstat si activé) ──\n'
        sar -u 2>/dev/null | tail -3 | sed 's/^/    /' || line "(sar sans données)"
    else
        line "(sysstat absent — pas d'historique CPU local)"
    fi

    printf '\n  ── Réseau cumulé depuis boot ──\n'
    awk 'NR>2 {rx+=$2; tx+=$10} END {printf "    rx=%.1f GiB  tx=%.1f GiB\n", rx/1073741824, tx/1073741824}' /proc/net/dev 2>/dev/null || true

    printf '\n  ── À vérifier DANS LA CONSOLE OCI (les 95e percentiles 7 j n''existent que là) ──\n'
    line "1. Compute → Instances → <VM> → Metrics : CPU (95th, 7 j)"
    line "   → RECLAIM si < 20 % pendant 7 j consécutifs (politique A1 Always Free)"
    line "   → la charge mikcloud compte dans ces métriques (effet inconnu — LE point à trancher)"
    line "2. Network : I/O (95th, 7 j) → reclaim si < 20 %"
    line "3. Memory : (95th, 7 j) → reclaim si < 20 % (actuellement ~2/24 Go…)"
    line "4. Volume Backups : les 5 slots Always Free utilisés ? (place pour un backup"
    line "   de volume de boot — optionnel, complémentaire aux backups applicatifs)"
    line "VERDICT à reporter dans l'ADR-0013 §15 : reclaim = risque réel / théorique / écarté"
}

# ───────────────────────── 6. Prérequis phase 1 ─────────────────────────
phase1_prereqs() {
    section "6. PRÉREQUIS PHASE 1 (backups chiffrés)"
    for b in rclone age git python3; do
        if command -v "$b" >/dev/null 2>&1; then
            line "$b : $(command -v $b) ($($b --version 2>/dev/null | head -1 | cut -c1-60))"
        else
            line "$b : ABSENT — sera installé par ops/backup/install.sh (rclone, age)"
        fi
    done
    line ""
    line "/opt/sect/backup/     : $([ -d /opt/sect/backup ] && echo PRÉSENT || echo 'absent (avant install)')"
    line "/opt/sect/backup.env : $([ -f /opt/sect/backup.env ] && echo PRÉSENT || echo 'absent (à configurer — runbook §3)')"
    line "/var/lib/sect-backup/ : $([ -d /var/lib/sect-backup ] && echo PRÉSENT || echo 'absent (créé par install.sh)')"
}

# ───────────────────────── self-test (CI — après les définitions) ─────────────────────────
self_test() {
    local rc=0
    bash -n "$0" || rc=1
    for fn in host_info pg_info docker_info net_info reclaim_info phase1_prereqs; do
        declare -f "$fn" >/dev/null || { echo "self-test: fonction $fn absente"; rc=1; }
    done
    if [ $rc -eq 0 ]; then echo "self-test: OK"; else echo "self-test: ÉCHEC"; fi
    exit $rc
}
[ "${1:-}" = "--self-test" ] && self_test

# ───────────────────────── main ─────────────────────────
printf '╔══════════════════════════════════════════════════════════════╗\n'
printf '║  SECT — AUDIT VM OCI (lecture seule) — %s\n' "$(date -u +%FT%TZ)"
printf '║  ADR-0013 §15 / phase 0 — sudo non-interactif : %s\n' "$($SUDO_OK && echo oui || echo NON)"
printf '╚══════════════════════════════════════════════════════════════╝\n'

host_info
pg_info
docker_info
net_info
reclaim_info
phase1_prereqs

printf '\n════ FIN DU RAPPORT — exit 0 (les lacunes ci-dessus sont listées, jamais fatales) ════\n'
exit 0
