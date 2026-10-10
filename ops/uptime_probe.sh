#!/usr/bin/env bash
# ============================================================================
# SECT-UPTIME-PROBE-1 — Sonde de disponibilité externe (chantier P1)
#
# TROU FERMÉ : l'alerting SECT (worker alerting, Discord) tourne SUR la VM
# primaire OCI — si la VM meurt, personne n'alerte. Cette sonde vit sur
# l'infrastructure GitHub Actions : elle survit à la VM et prévient Discord.
#
# Machine à états STATELESS (aucun credential d'écriture, aucun fichier
# d'état) : l'état UP/DOWN est dérivé de l'historique des conclusions des
# runs de CE workflow (un run en échec = sonde vue DOWN). L'API Actions
# (lecture seule, `actions: read`) fournit la série.
#
# Règles d'alerte :
#   - transition UP→DOWN (0 échec consécutif avant) → alerte 🔴 immédiate
#   - DOWN persistant    → rappel 🟠 tous les 6 échecs (≈ 30 min au cron /5)
#   - transition DOWN→UP → alerte 🟢 rétablissement (avec durée de l'incident)
#   - standby (Render)   : sondé pour rester CHAUD (plan free : endormissement
#     après 15 min d'inactivité → bascule P2 sans cold start) ; état rapporté
#     dans les alertes, SANS machine à états propre (périmètre volontaire).
#
# Codes retour : 0 = primaire UP · 1 = primaire DOWN (le run GitHub échoue
# volontairement → historique vert/rouge = historique de disponibilité).
#
# Environnement :
#   PRIMARY_URL          défaut https://api.sect.ftci.fr/health
#   STANDBY_URL          défaut https://sect-zead.onrender.com/health
#   DISCORD_WEBHOOK_URL  vide → mode dry-run (aucun envoi)
#   ALERT_TEST=1         envoi une alerte 🧪 TEST étiquetée (preuve E2E webhook)
#   GITHUB_TOKEN         lecture historique runs (optionnel : sans → chaque
#                        DOWN alerte, pas de détection de transition)
#   GITHUB_REPOSITORY    ex. udevrard7/SECT
#   GITHUB_RUN_ID        pour exclure le run courant de l'historique
#   GITHUB_SERVER_URL    défaut https://github.com
#
# Aucune dépendance hors bash + curl + jq + GNU date (nativement sur les
# runners ubuntu-latest — zéro action tierce = zéro risque supply-chain).
# ============================================================================
set -u -o pipefail

WORKFLOW_FILE="${WORKFLOW_FILE:-uptime-probe.yml}"
PRIMARY_URL="${PRIMARY_URL:-https://api.sect.ftci.fr/health}"
STANDBY_URL="${STANDBY_URL:-https://sect-zead.onrender.com/health}"
GITHUB_SERVER_URL="${GITHUB_SERVER_URL:-https://github.com}"
TMP_BODY="$(mktemp)"
TMP_ERR="$(mktemp)"
trap 'rm -f "$TMP_BODY" "$TMP_ERR"' EXIT

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# ── Sonde HTTP générique ────────────────────────────────────────────────────
# $1=url  $2=max_time  $3=tentatives  $4=délai_entre_tentatives
# Renseigne PROBE_CODE (code HTTP ou 000), PROBE_ERR, et retourne 0 si
# HTTP 200 + corps contenant "status":"ok".
http_probe() {
  local url="$1" mt="$2" att="$3" delay="$4" i code rc
  PROBE_OK=0 ; PROBE_CODE="000" ; PROBE_ERR=""
  for ((i = 1; i <= att; i++)); do
    code="$(curl -sS --max-time "$mt" -o "$TMP_BODY" -w '%{http_code}' "$url" 2>"$TMP_ERR")"
    rc=$?
    PROBE_CODE="${code:-000}"
    if [ "$rc" -eq 0 ] && [ "$PROBE_CODE" = "200" ]; then
      if grep -q '"status":"ok"' "$TMP_BODY" 2>/dev/null; then
        PROBE_OK=1 ; PROBE_ERR=""
        return 0
      fi
      PROBE_ERR="corps inattendu : $(head -c 120 "$TMP_BODY" 2>/dev/null)"
    else
      PROBE_ERR="$(head -c 200 "$TMP_ERR" 2>/dev/null)"
      [ -z "$PROBE_ERR" ] && PROBE_ERR="curl exit $rc (code $PROBE_CODE)"
    fi
    [ "$i" -lt "$att" ] && sleep "$delay"
  done
  return 1
}

# ── Historique des runs (machine à états stateless) ─────────────────────────
# Renseigne PREV_FAILURES (échecs consécutifs COMPLÉTÉS avant ce run) et
# OUTAGE_START (créé_at du plus ancien échec de la série). HISTORY_OK=0 si
# l'API est injoignable → repli : chaque DOWN alerte (pas de transitions).
fetch_history() {
  PREV_FAILURES=0 ; OUTAGE_START="" ; HISTORY_OK=0
  if [ -z "${GITHUB_TOKEN:-}" ] || [ -z "${GITHUB_REPOSITORY:-}" ]; then
    log "état : pas de token GitHub → mode stateless (chaque DOWN alerte)"
    return 0
  fi
  local json runs id concl created
  json="$(curl -sS --max-time 15 \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=30")" || {
    log "état : API GitHub injoignable → mode stateless"
    return 0
  }
  runs="$(printf '%s' "$json" | jq -r --arg cur "${GITHUB_RUN_ID:-}" '
    [ .workflow_runs[]
      | select(.status == "completed")
      | select(.conclusion == "success" or .conclusion == "failure")
      | select((.id | tostring) != $cur)
    ] | sort_by(.created_at) | reverse
    | .[] | [(.id | tostring), .conclusion, .created_at] | @tsv' 2>/dev/null)" || runs=""
  if [ -z "$runs" ]; then
    log "état : historique vide ou illisible → premier run (aucune transition)"
    return 0
  fi
  while IFS=$'\t' read -r id concl created; do
    [ -z "$id" ] && continue
    if [ "$concl" = "failure" ]; then
      PREV_FAILURES=$((PREV_FAILURES + 1))
      OUTAGE_START="$created"          # itération récent→ancien : le dernier vu = le plus ancien
    else
      break                            # premier succès = début de la fenêtre saine
    fi
  done <<< "$runs"
  HISTORY_OK=1
}

# ── Envoi Discord (webhook, 204 attendu, 2 tentatives) ──────────────────────
send_discord() {
  local payload="$1" i rc="000"
  if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
    log "dry-run : pas de DISCORD_WEBHOOK_URL — payload non envoyé :"
    printf '%s\n' "$payload" | jq .
    return 0
  fi
  for ((i = 1; i <= 2; i++)); do
    rc="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -X POST \
        -H 'Content-Type: application/json' -d "$payload" \
        "$DISCORD_WEBHOOK_URL" 2>/dev/null)" || rc="000"
    [ "$rc" = "204" ] && { log "Discord : alerte envoyée (204)"; return 0; }
    sleep 2
  done
  log "ERREUR : envoi Discord échoué (dernier code $rc)"
  return 1
}

# ── Construction des embeds ─────────────────────────────────────────────────
now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY:-udevrard7/SECT}/actions/runs/${GITHUB_RUN_ID:-local}"

duration_since() {  # $1 = ISO ; sortie "N min" ou "?"
  [ -z "$1" ] && { echo "?"; return; }
  local d
  d=$(( ($(date -u +%s) - $(date -ud "$1" +%s)) / 60 ))
  if [ "$d" -ge 60 ]; then echo "$((d / 60)) h $((d % 60)) min"; else echo "$d min"; fi
}

embed_payload() {  # $1=couleur $2=titre $3=description $4=fiches jq (array)
  jq -n --arg ts "$now_iso" --arg color "$1" --arg title "$2" --arg desc "$3" \
     --argjson fields "$4" '{embeds: [{title: $title, description: $desc,
       color: ($color | tonumber), fields: $fields, timestamp: $ts}]}'
}

# ── 1. Sondes ───────────────────────────────────────────────────────────────
log "sonde PRIMAIRE  : $PRIMARY_URL"
http_probe "$PRIMARY_URL" 20 2 5 ; PRIMARY_OK=$PROBE_OK ; PRIMARY_CODE=$PROBE_CODE ; PRIMARY_ERR=$PROBE_ERR

log "sonde STANDBY   : $STANDBY_URL (keep-warm)"
http_probe "$STANDBY_URL" 60 1 0 ; STANDBY_OK=$PROBE_OK ; STANDBY_CODE=$PROBE_CODE ; STANDBY_ERR=$PROBE_ERR

log "primaire : code $PRIMARY_CODE $([ "$PRIMARY_OK" -eq 1 ] && echo UP || echo DOWN) ; standby : code $STANDBY_CODE $([ "$STANDBY_OK" -eq 1 ] && echo UP || echo DOWN)"

# ── 2. État (historique runs) ───────────────────────────────────────────────
fetch_history
[ "$HISTORY_OK" -eq 1 ] && log "état : $PREV_FAILURES échec(s) consécutif(s) avant ce run"

# ── 3. Mode TEST (preuve E2E webhook — n'écrit aucun état, exit 0) ─────────
if [ "${ALERT_TEST:-0}" = "1" ]; then
  embed_payload "5814783" "🧪 TEST sonde SECT — webhook fonctionnel" \
    "Sonde exécutée manuellement : vérification bout-en-bout du canal d'alerte (P1). Aucune action requise." \
    "[
      {\"name\":\"Primaire (OCI)\",\"value\":\"$PRIMARY_URL → $PRIMARY_CODE ($([ "$PRIMARY_OK" -eq 1 ] && echo UP || echo DOWN))\",\"inline\":false},
      {\"name\":\"Standby (Render)\",\"value\":\"$STANDBY_CODE ($([ "$STANDBY_OK" -eq 1 ] && echo UP || echo DOWN))\",\"inline\":false},
      {\"name\":\"Run\",\"value\":\"$run_url\",\"inline\":false}
    ]" > /tmp/payload_test.json
  send_discord "$(cat /tmp/payload_test.json)"
  [ "$PRIMARY_OK" -eq 1 ] && exit 0 || exit 1
fi

# ── 4. Décision d'alerte + verdict ─────────────────────────────────────────
standby_field="\"name\":\"Standby (Render)\",\"value\":\"$STANDBY_CODE — $([ "$STANDBY_OK" -eq 1 ] && echo "UP, bascule possible (runbook §3.7)" || echo "DOWN ⚠️ plan de bascule compromis")\",\"inline\":false"

if [ "$PRIMARY_OK" -eq 1 ]; then
  if [ "$HISTORY_OK" -eq 1 ] && [ "$PREV_FAILURES" -ge 1 ]; then
    log "transition DOWN→UP : alerte rétablissement"
    embed_payload "52224" "🟢 SECT API rétablie (primaire OCI)" \
      "Le primaire répond à nouveau. Incident détecté pendant : $(duration_since "$OUTAGE_START")." \
      "[{\"name\":\"Primaire (OCI)\",\"value\":\"$PRIMARY_URL → $PRIMARY_CODE UP\",\"inline\":false},{$standby_field},{\"name\":\"Run\",\"value\":\"$run_url\",\"inline\":false}]" \
      > "$TMP_BODY.p" ; send_discord "$(cat "$TMP_BODY.p")" || true
  else
    log "primaire UP, rien à signaler"
  fi
  exit 0
fi

# Primaire DOWN
if [ "$PREV_FAILURES" -eq 0 ]; then
  log "transition UP→DOWN (ou premier run) : alerte immédiate"
  embed_payload "15158332" "🔴 SECT API DOWN (primaire OCI)" \
    "Le backend primaire ne répond plus. Vérification puis bascule : runbook §3.7 (procédure P2 failover.yml à venir)." \
    "[{\"name\":\"Primaire (OCI)\",\"value\":\"$PRIMARY_URL → code $PRIMARY_CODE — $PRIMARY_ERR\",\"inline\":false},{$standby_field},{\"name\":\"Occurrence\",\"value\":\"1er signalement ($now_iso)\",\"inline\":false},{\"name\":\"Run\",\"value\":\"$run_url\",\"inline\":false}]" \
    > "$TMP_BODY.p" ; send_discord "$(cat "$TMP_BODY.p")" || true
elif [ "$HISTORY_OK" -eq 1 ] && [ $((PREV_FAILURES % 6)) -eq 0 ]; then
  log "DOWN persistant ($PREV_FAILURES échecs) : rappel ~30 min"
  embed_payload "15105570" "🟠 SECT API toujours DOWN (rappel ~30 min)" \
    "Incident en cours depuis $(duration_since "$OUTAGE_START") ($PREV_FAILURES sondes consécutives). Rappel périodique tant que le primaire est indisponible." \
    "[{\"name\":\"Primaire (OCI)\",\"value\":\"$PRIMARY_URL → code $PRIMARY_CODE — $PRIMARY_ERR\",\"inline\":false},{$standby_field},{\"name\":\"Run\",\"value\":\"$run_url\",\"inline\":false}]" \
    > "$TMP_BODY.p" ; send_discord "$(cat "$TMP_BODY.p")" || true
else
  log "DOWN confirmé (échec n°$((PREV_FAILURES + 1))) — pas d'alerte cette fois (anti-spam)"
fi
exit 1
