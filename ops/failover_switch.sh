#!/usr/bin/env bash
# ============================================================================
# SECT-FAILOVER-1 (chantier P2) — Bascule du trafic API par édition du dépôt
#
#   cible render : bascule urgence §3.7 du runbook OCI — Render redevient
#                  PRIMAIRE (le workflow pose alors WORKERS_ENABLED=true).
#   cible oci    : retour à la normale §3.6 — OCI redevient PRIMAIRE.
#
# PRINCIPE (prouvé au cutover SECT-OCI-CUTOVER-1, commit 02de6dd) : la
# bascule de trafic est un COMMIT VERSIONNÉ — le rewrite CDN de vercel.json
# (/api/*), les 12 routes serveur (défaut API_BASE_URL des 6 go-auth et
# 6 PDF), le manifest PWA, le setup E2E et render.yaml (WORKERS_ENABLED,
# règle d'or 6 du runbook env vars : le yaml AVANT le PUT API Render).
# Le push → Vercel redéploie automatiquement : ZÉRO token Vercel requis.
#
# Ce script n'effectue AUCUNE opération git (commit/push = responsabilité de
# l'appelant : workflows failover.yml / failback.yml) et AUCUN appel réseau.
# Idempotent : sur un dépôt déjà en état cible → « rien à faire » (exit 0).
#
# Usage : ops/failover_switch.sh <render|oci>
# Exit   : 0 = basculé (ou déjà en cible) · 1 = échec/validation · 2 = usage
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

OCI_URL="https://api.sect.ftci.fr"
RENDER_URL="https://sect-zead.onrender.com"

TARGET="${1:-}"
case "$TARGET" in
  render) NEW="$RENDER_URL"; OLD="$OCI_URL";    WORKERS="true"  ;;
  oci)    NEW="$OCI_URL";    OLD="$RENDER_URL"; WORKERS="false" ;;
  *) printf 'Usage : ops/failover_switch.sh <render|oci>\n' >&2; exit 2 ;;
esac

say() { printf '[switch] %s\n' "$*"; }
say "Cible : ${TARGET} — trafic API → ${NEW} (render.yaml WORKERS_ENABLED=${WORKERS})"

# ── 0. Pré-requis : render.yaml doit porter WORKERS_ENABLED (règle d'or 6) ──
if ! grep -q '^ *- key: WORKERS_ENABLED$' render.yaml; then
  say "ERREUR : render.yaml ne contient pas WORKERS_ENABLED — le commit SECT-FAILOVER-1 (P2) est-il bien fusionné ?"
  exit 1
fi

# ── 1. État courant (comptes des occurrences de l'ANCIENNE cible) ──────────
# NB : délimiteur sed « # » — les patterns contiennent « || » et des « / ».
vc_old=$(grep -c -F "\"destination\": \"${OLD}/api/:path*\"" frontend/vercel.json || true)
mf_old=$(grep -c -F "\"origin\": \"${OLD}\"" frontend/public/manifest.json || true)
e2e_old=$(grep -c -F "process.env.BACKEND_URL || '${OLD}'" frontend/e2e/auth.setup.ts || true)
mapfile -t rt_files < <(grep -rl -F "process.env.API_BASE_URL || '${OLD}'" frontend/src/app/api || true)
rt_old=${#rt_files[@]}
ry_at_target=$(grep -A1 -- '- key: WORKERS_ENABLED' render.yaml | grep -c -F "value: \"${WORKERS}\"" || true)

if [ "$vc_old" -eq 0 ] && [ "$mf_old" -eq 0 ] && [ "$e2e_old" -eq 0 ] && [ "$rt_old" -eq 0 ] && [ "$ry_at_target" -eq 1 ]; then
  say "Déjà en état cible (${NEW}) — rien à faire."
  exit 0
fi
say "À basculer : vercel.json=${vc_old}, routes serveur=${rt_old}, manifest=${mf_old}, e2e=${e2e_old}, render.yaml workers=$([ "$ry_at_target" -eq 1 ] && echo conforme || echo à basculer)"

# ── 2. Éditions (uniquement les occurrences de l'ancienne cible) ───────────
# vercel.json — SEULE la règle catch-all porte une URL (les 4 self-rewrites
# des routes PDF sont relatives, donc insensibles à la bascule).
sed -i "s#\"destination\": \"${OLD}/api/:path\*\"#\"destination\": \"${NEW}/api/:path*\"#" frontend/vercel.json

# 12 routes serveur : 6 go-auth (API_URL) + 6 PDF (BACKEND_URL) — même
# pattern de surcharge server-only API_BASE_URL (SECT-OCI-CUTOVER-1).
for f in "${rt_files[@]}"; do
  sed -i "s#process.env.API_BASE_URL || '${OLD}'#process.env.API_BASE_URL || '${NEW}'#g" "$f"
done

# Manifest PWA (origin) + setup Playwright E2E (BACKEND_URL de test).
sed -i "s#\"origin\": \"${OLD}\"#\"origin\": \"${NEW}\"#" frontend/public/manifest.json
sed -i "s#process.env.BACKEND_URL || '${OLD}'#process.env.BACKEND_URL || '${NEW}'#" frontend/e2e/auth.setup.ts

# render.yaml — WORKERS_ENABLED : true côté Render (failover), false côté
# OCI (retour normal). La ligne « value: » suit immédiatement la clé.
sed -i "/- key: WORKERS_ENABLED/{n;s#value: \".*\"#value: \"${WORKERS}\"#}" render.yaml

# ── 3. Validations ──────────────────────────────────────────────────────────
fail=0
[ "$(grep -c -F "\"destination\": \"${NEW}/api/:path*\"" frontend/vercel.json || true)" -eq 1 ] || { say "ERREUR : rewrite vercel.json non basculé"; fail=1; }
if grep -q -F "\"destination\": \"${OLD}/api/:path*\"" frontend/vercel.json; then say "ERREUR : ancienne destination résiduelle dans vercel.json"; fail=1; fi
if grep -rq -F "process.env.API_BASE_URL || '${OLD}'" frontend/src/app/api; then say "ERREUR : routes serveur non basculées (API_BASE_URL)"; fail=1; fi
if grep -rq -F "process.env.API_BASE_URL || '${NEW}'" frontend/src/app/api; then :; else say "ERREUR : aucune route serveur sur la nouvelle cible"; fail=1; fi
[ "$(grep -c -F "\"origin\": \"${NEW}\"" frontend/public/manifest.json || true)" -ge 1 ] || { say "ERREUR : origin manifest non basculée"; fail=1; }
grep -q -F "process.env.BACKEND_URL || '${NEW}'" frontend/e2e/auth.setup.ts || { [ "$e2e_old" -eq 0 ] || { say "ERREUR : setup E2E non basculé"; fail=1; }; }
if ! grep -A1 -- '- key: WORKERS_ENABLED' render.yaml | grep -q -F "value: \"${WORKERS}\""; then say "ERREUR : render.yaml WORKERS_ENABLED != ${WORKERS}"; fail=1; fi
jq empty frontend/vercel.json 2>/dev/null || { say "ERREUR : vercel.json n'est plus un JSON valide"; fail=1; }
jq empty frontend/public/manifest.json 2>/dev/null || { say "ERREUR : manifest.json n'est plus un JSON valide"; fail=1; }
if [ "$fail" -ne 0 ]; then say "VALIDATION ÉCHOUÉE — vérifier le diff (git diff) et réessayer."; exit 1; fi

# ── 4. Résumé (informatif — le commit reste à la charge de l'appelant) ─────
say "OK — dépôt en état cible ${NEW} (render.yaml WORKERS_ENABLED=${WORKERS})."
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git --no-pager diff --stat || true
fi
