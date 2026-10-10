#!/usr/bin/env bash
# ============================================================================
# SECT-FAILOVER-1 (chantier P2) — Pilote WORKERS_ENABLED sur Render sect-api
#
#   on     : Render devient PRIMAIRE (workers actifs) — bascule urgence §3.7.
#   off    : Render devient STANDBY API-only — retour à la normale §3.6.3.
#   status : lecture seule (affiche la valeur live, aucune écriture).
#
# RÈGLES D'OR (docs/ops/render-env-vars-runbook.md §4 — nées de l'incident
# 2026-10-05 où un PUT partiel a SUPPRIMÉ RESEND_API_KEY en prod) :
#   1. JAMAIS de PUT sans GET préalable ; le PUT envoie la liste COMPLÈTE
#      des vars live (toute var omise est SUPPRIMÉE).
#   2. Les valeurs du GET sont renvoyées byte-à-byte (aucun secret retapé,
#      aucun secret affiché — seules les CLÉS sont listées dans les logs).
#   3. Les vars ne prennent effet qu'au REDEPLOY : déclenché puis attendu
#      ici jusqu'au statut live.
#   4. Render NE NORMALISE PAS les clés (leçon cutover SECT-OCI-CUTOVER-1) :
#      « workers-enabled » (kebab, no-op historique) et WORKERS_ENABLED
#      (snake, la seule que lit le Go) sont DEUX clés distinctes — on
#      préserve la première telle quelle, on pilote la seconde.
#
# Usage : RENDER_API_KEY=rnd_… ops/render_workers.sh <on|off|status> [--dry-run]
#         --dry-run : GET réel (lecture seule) + affichage du PUT/deploy qui
#                     SERAIENT exécutés — AUCUNE écriture (test sans risque).
# Environnement :
#   RENDER_API_KEY         requis (secret d'environnement production-failover)
#   RENDER_SERVICE_ID      défaut srv-d9ed5bdaeets73auosj0 (sect-api)
#   RENDER_DEPLOY_TIMEOUT  secondes max d'attente du deploy (défaut 600)
# Exit : 0 = opéré (ou déjà en cible, ou dry-run) · 1 = échec · 2 = usage
# ============================================================================
set -euo pipefail

MODE="${1:-}"
DRY=0
[ "${2:-}" = "--dry-run" ] && DRY=1
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d9ed5bdaeets73auosj0}"
API="https://api.render.com/v1/services/${SERVICE_ID}"
TIMEOUT="${RENDER_DEPLOY_TIMEOUT:-600}"

say() { printf '[render-workers] %s\n' "$*"; }

case "$MODE" in
  on)     TARGET="true"  ;;
  off)    TARGET="false" ;;
  status) TARGET=""      ;;
  *) printf 'Usage : ops/render_workers.sh <on|off|status> [--dry-run]\n' >&2; exit 2 ;;
esac

: "${RENDER_API_KEY:?RENDER_API_KEY requis (secret GitHub — environnement production-failover)}"
AUTH=(-H "Authorization: Bearer ${RENDER_API_KEY}" -H "Content-Type: application/json" -H "Accept: application/json")

# ── 1. GET — état live complet (règle d'or 1 : jamais de PUT sans GET) ─────
live="$(curl -sS --max-time 30 "${AUTH[@]}" "${API}/env-vars")" || { say "ERREUR : API Render injoignable"; exit 1; }
if ! printf '%s' "$live" | jq -e 'type == "array"' >/dev/null 2>&1; then
  say "ERREUR : réponse inattendue de l'API Render (clé invalide/permissions ?) :"
  printf '%s\n' "$live" | head -c 300 >&2; echo >&2
  exit 1
fi
n_vars="$(printf '%s' "$live" | jq 'length')"
cur="$(printf '%s' "$live" | jq -r '[.[] | select(.envVar.key == "WORKERS_ENABLED")][0].envVar.value // "absente"')"
kebab="$(printf '%s' "$live" | jq -r '[.[] | select(.envVar.key == "workers-enabled")][0].envVar.value // "absente"')"
extra=""
[ "$kebab" != "absente" ] && extra=" (relique kebab « workers-enabled »=${kebab} — no-op, préservée telle quelle)"
say "Service ${SERVICE_ID} — ${n_vars} vars live ; WORKERS_ENABLED=${cur}${extra}"

[ "$MODE" = "status" ] && exit 0

# Idempotence : rien à écrire si déjà en cible.
if [ "$cur" = "$TARGET" ]; then
  say "WORKERS_ENABLED déjà à ${TARGET} — aucun PUT, aucun deploy."
  exit 0
fi

# ── 2. Corps du PUT = la liste COMPLÈTE du GET, seule WORKERS_ENABLED
#       modifiée (ou ajoutée si absente) — règles d'or 1 et 2. ──────────────
body="$(printf '%s' "$live" | jq --arg v "$TARGET" '
  [.[] | .envVar | {key, value}]
  | map(if .key == "WORKERS_ENABLED" then .value = $v else . end)
  | (if any(.key == "WORKERS_ENABLED") then . else . + [{key: "WORKERS_ENABLED", value: $v}] end)')"

say "PUT prévu : ${n_vars} vars préservées + WORKERS_ENABLED=${TARGET} — clés :"
printf '%s\n' "$body" | jq -r 'map(.key) | join(", ")' | fold -s -w 100 | sed 's/^/    /'

if [ "$DRY" = "1" ]; then
  say "DRY-RUN : aucune écriture. Seraient exécutés :"
  say "  PUT  ${API}/env-vars (corps ci-dessus — liste complète, aucune var supprimée)"
  say "  POST ${API}/deploys  {\"clearCache\":\"do_not_clear\"} puis attente status=live (≤ ${TIMEOUT}s)"
  exit 0
fi

# ── 3. PUT de la liste complète ─────────────────────────────────────────────
code="$(printf '%s' "$body" | curl -sS --max-time 30 -o /tmp/rw_put.json -w '%{http_code}' \
        -X PUT "${AUTH[@]}" "${API}/env-vars" --data-binary @-)" || { say "ERREUR réseau pendant le PUT"; exit 1; }
if [ "$code" != "200" ]; then
  say "ERREUR : PUT env-vars HTTP ${code} — l'état live N'A PAS été modifié :"
  head -c 400 /tmp/rw_put.json >&2; echo >&2
  exit 1
fi
say "PUT ok — ${n_vars} vars renvoyées byte-à-byte, WORKERS_ENABLED=${TARGET}"

# ── 4. Redeploy (règle d'or 3 : effet au redeploy uniquement) ──────────────
dep="$(curl -sS --max-time 30 "${AUTH[@]}" -X POST "${API}/deploys" \
       -d '{"clearCache":"do_not_clear"}')" || { say "ERREUR réseau pendant le POST deploy"; exit 1; }
dep_id="$(printf '%s' "$dep" | jq -r '.id // empty')"
if [ -z "$dep_id" ]; then
  say "ERREUR : deploy non déclenché — réponse :"
  printf '%s\n' "$dep" | head -c 400 >&2; echo >&2
  exit 1
fi
say "Deploy ${dep_id} déclenché — attente du statut live (≤ $((TIMEOUT / 60)) min, rebuild Docker plan free)…"

t0=$SECONDS
while :; do
  st="$(curl -sS --max-time 20 "${AUTH[@]}" "${API}/deploys/${dep_id}" | jq -r '.status // "?"' || echo "?")"
  case "$st" in
    live)
      say "Deploy ${dep_id} LIVE ($((SECONDS - t0)) s)"
      break
      ;;
    build_failed|update_failed|deactivated|canceled)
      say "ERREUR : deploy terminé en « ${st} » — WORKERS_ENABLED=${TARGET} est posé mais NON actif."
      say "Vérifier le dashboard Render (logs du deploy ${dep_id}) puis relancer on/off."
      exit 1
      ;;
    *)
      sleep 10
      ;;
  esac
  if [ $((SECONDS - t0)) -ge "$TIMEOUT" ]; then
    say "ERREUR : timeout ${TIMEOUT}s — deploy toujours « ${st} » (dashboard Render : service ${SERVICE_ID})."
    exit 1
  fi
done

# ── 5. Vérification finale (re-GET — défense en profondeur) ────────────────
now="$(curl -sS --max-time 30 "${AUTH[@]}" "${API}/env-vars" \
       | jq -r '[.[] | select(.envVar.key == "WORKERS_ENABLED")][0].envVar.value // "absente"')"
if [ "$now" != "$TARGET" ]; then
  say "ERREUR : WORKERS_ENABLED live = ${now} (attendu ${TARGET}) après deploy live — divergence anormale, vérifier le dashboard."
  exit 1
fi
say "OK — WORKERS_ENABLED=${TARGET} en prod, deploy live."
