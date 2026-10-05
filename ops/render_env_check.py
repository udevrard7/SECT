#!/usr/bin/env python3
"""render_env_check.py — garde anti-perte des variables d'environnement Render.

CONTEXTE (incident 2026-10-05, SECT-MONITORING-P5-1) : un « full-replace »
des env vars via l'API Render (PUT bulk) a silencieusement ÉCRASÉ
RESEND_API_KEY + RESEND_FROM_EMAIL — tous les emails transactionnels stoppés.
Cause racine : le PUT bulk REMPLACE l'ensemble entier (toute var non listée
est supprimée), et aucune vérification AVANT/APRÈS n'était faite.

CE SCRIPT est la garde : il compare l'état LIVE du service Render à
l'inventaire de référence `render.yaml` (source de vérité versionnée).

Usage :
    RENDER_API_KEY=rnd_… python3 ops/render_env_check.py
    # options : RENDER_SERVICE_ID (défaut srv-d9ed5bdaeets73auosj0),
    #           RENDER_YAML (défaut render.yaml à la racine du repo)

Règles vérifiées :
  1. Chaque var REQUIRED de render.yaml existe sur Render, non vide.
  2. Les vars REQUIRED avec `value:` littérale dans render.yaml ont
     EXACTEMENT cette valeur en prod (drift détecté).
  3. Les vars OPTIONNELLES (feature-gated : SMTP/Turnstile/VAPID/GeniusPay/
     Firebase/Slack) absentes = fonctionnalité désactivée (INFO, pas erreur) ;
     présentes mais vides = ERREUR.
  4. Toute var LIVE inattendue (absente de render.yaml) = WARNING (drift IaC).

Exit 0 = état conforme ; exit 1 = écart REQUIRED (à corriger avant de
considérer l'opération d'env vars comme terminée).
"""
import json
import os
import re
import sys
import urllib.request

SERVICE_ID = os.environ.get("RENDER_SERVICE_ID", "srv-d9ed5bdaeets73auosj0")
YAML_PATH = os.environ.get("RENDER_YAML", os.path.join(os.path.dirname(__file__), "..", "render.yaml"))

# Vars auto-injectées par Render (jamais listées par l'API env-vars).
RENDER_RESERVED = {"PORT"}

# Vars feature-gated : absence = fonctionnalité désactivée (pas une panne).
# Le backend les traite vides comme absentes (config.go getEnv).
OPTIONAL_KEYS = {
    "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
    "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY",
    "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
    "GENIUSPAY_API_KEY", "GENIUSPAY_API_SECRET",
    "GENIUSPAY_WEBHOOK_SECRET", "GENIUSPAY_BASE_URL",
    "FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_KEY",
    "SLACK_WEBHOOK_URL",
    # Migrations hors-ligne uniquement (aucun impact runtime) :
    "NEON_DIRECT_URL",
}


def parse_render_yaml(path):
    """Parse minimaliste des entrées envVars de render.yaml.

    Retourne {key: {"value": str|None}} — value None = `sync: false` ou
    `generateValue: true` (la valeur vit dans le dashboard Render, on ne
    compare que la présence).
    """
    entries, current = {}, None
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if line.lstrip().startswith("#"):
                continue
            m = re.match(r"\s*-\s*key:\s*(\S+)\s*$", line)
            if m:
                current = m.group(1)
                entries[current] = {"value": None}
                continue
            if current is None:
                continue
            mv = re.match(r'\s*value:\s*"(.*)"\s*$', line) or re.match(r"\s*value:\s*(\S+)\s*$", line)
            if mv:
                entries[current]["value"] = mv.group(1)
            elif re.match(r"\s*(sync|generateValue):\s*", line):
                entries[current]["value"] = None  # dashboard-managed
    return entries


def get_live_env_vars(token):
    url = f"https://api.render.com/v1/services/{SERVICE_ID}/env-vars"
    r = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return {x["envVar"]["key"]: x["envVar"].get("value", "") for x in json.load(resp)}


def mask(key, value):
    if key in {"ENVIRONMENT", "CORS_ORIGINS", "APP_BASE_URL", "R2_BUCKET_NAME",
               "R2_ENDPOINT", "ALERTING_EMAIL_TO", "RESEND_FROM_EMAIL", "SMTP_PORT",
               "VAPID_SUBJECT", "SMTP_HOST", "SMTP_FROM", "GENIUSPAY_BASE_URL"}:
        return value
    return f"<{len(value)} car.>" if value else "<vide>"


def main():
    token = os.environ.get("RENDER_API_KEY")
    if not token:
        print("ERREUR : RENDER_API_KEY absente de l'environnement.", file=sys.stderr)
        return 2
    expected = {k: v for k, v in parse_render_yaml(YAML_PATH).items() if k not in RENDER_RESERVED}
    live = get_live_env_vars(token)

    errors, warnings, infos = [], [], []
    print(f"=== render_env_check — service {SERVICE_ID} ===")
    print(f"Source de vérité : {os.path.normpath(YAML_PATH)} ({len(expected)} vars)\n")

    for key in sorted(expected):
        want = expected[key]["value"]
        optional = key in OPTIONAL_KEYS
        have = live.get(key)
        if have is None or have == "":
            if optional:
                infos.append(key)
                print(f"  [info] {key:26} absente (fonctionnalité désactivée — optionnelle)")
            else:
                errors.append(f"{key} absente/vide sur Render (REQUIRED)")
                print(f"  [FAIL] {key:26} ABSENTE/VIDE — REQUIRED")
        elif want is not None and have != want:
            errors.append(f"{key} diverge de render.yaml")
            print(f"  [FAIL] {key:26} drift — live={mask(key, have)} yaml={mask(key, want)}")
        else:
            print(f"  [ ok ] {key:26} présente{' (valeur yaml conforme)' if want is not None else ''}")

    for key in sorted(set(live) - set(expected) - RENDER_RESERVED):
        warnings.append(key)
        print(f"  [warn] {key:26} présente sur Render mais ABSENTE de render.yaml (drift IaC)")

    print(f"\nRésumé : {len(errors)} erreur(s) REQUIRED, {len(warnings)} warning(s) drift, {len(infos)} optionnelle(s) désactivée(s)")
    if errors:
        print("\n❌ ÉTAT NON CONFORME — restaurer AVANT tout déploiement (cf. docs/ops/render-env-vars-runbook.md)")
        return 1
    print("✅ ÉTAT CONFORME — inventaire live == render.yaml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
