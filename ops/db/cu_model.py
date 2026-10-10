#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Modèle de consommation CU-heures Neon pour SECT (SECT-DB-HYBRID-2 / ADR-0013).

CODE PREUVE — les paramètres ci-dessous sont MESURÉS ou SOURCÉS :

Sources mesurées (2026-10-10, ops/db/neon_audit + lecture du code backend) :
  - Worker `promotion`      : time.NewTicker(10 * time.Second)  → 1 tx DB / 10 s, 24/7
  - Worker `auto_close`     : time.NewTicker(60 * time.Second)  → 1 tx DB / 60 s
  - Worker `alerting`       : 2 * time.Minute (constante alertingCheckInterval)
  - Worker `similarity`     : 5 * time.Minute
  - Worker `expire`         : 1 * time.Hour ; `relance` : 6 h ; `cleanup` : 24 h ;
    `bibliotheque_purge` : 1 h
  - Workers IA/practice/homework/audio/doc_analyzer : pilotés par GeneratorQueue
    (pas de ticker → pas de polling continu)
  - Pool pgx (internal/db/db.go) : MinConns ≥ 2 + HealthCheckPeriod = 30 s
    → ping toutes les 30 s même sans trafic
  - pg_postmaster_start_time mesuré : compute réveillé le 2026-10-09 22:20 UTC,
    14,45 tx/s en moyenne depuis, aucune fenêtre ≥ 5 min sans requête.
  → CONCLUSION : le compute Neon ne peut PAS se suspendre par idle (5 min sans
    requête) tant que le primaire OCI tourne : activité 24/7 garantie par code.

Sources Neon (docs officielles lues le 2026-10-10, cf. worklog SECT-DB-HYBRID-2/a) :
  - Formule : CU-h mensuelles = CU moyen × heures actives
  - Plan Free : 100 CU-h/mois inclus ; dépassement → compute SUSPENDU jusqu'au
    cycle suivant (aucune grâce, pas de facturation auto, données intactes)
  - 1 CU ≈ 1 vCPU + 4 Go RAM ; Free : défaut 0,25 CU, autoscale ≤ 2 CU
  - Idle → suspension : 5 min sans requête (fixe sur Free) ; une connexion TCP
    ouverte mais inactive N'EMPÊCHE PAS la suspension
  - Plan Launch (usage-based, sans minimum) : $0,106/CU-h ; stockage $0,35/Go-mois

Usage : python3 ops/db/cu_model.py [--budget 100] [--price 0.106]
"""

import argparse
import sys

HOURS_PER_MONTH = 730.0  # ~30,4 j × 24 h
DAYS_PER_MONTH = 30.4

# ── Paramètres mesurés / sourcés ────────────────────────────────────────────
TICKERS_DB = [
    # (worker, intervalle, note)
    ("promotion", 10, "promotionTickInterval = 10 * time.Second (la garde la plus courte)"),
    ("pool pgx health-check", 30, "HealthCheckPeriod 30 s × MinConns ≥ 2 (db.go)"),
    ("auto_close", 60, "time.NewTicker(60 * time.Second)"),
    ("alerting", 120, "alertingCheckInterval = 2 * time.Minute"),
    ("similarity", 300, "time.NewTicker(5 * time.Minute)"),
    ("expire", 3600, "1 h"),
    ("bibliotheque_purge", 3600, "bibliothequePurgeInterval = 1 h"),
    ("relance", 21600, "6 h"),
    ("cleanup", 86400, "24 h"),
]


def fmt_day(x: float) -> str:
    return f"jour {x:.1f}" if x <= DAYS_PER_MONTH else "jamais (sous budget)"


def scenario(name, cuh_day, budget, price):
    """Un scénario = CU-heures consommées par journée moyenne (cuh_day).

    cuh_day = Σ (CU moyens × heures actives à ce niveau) sur 24 h ; les heures
    INACTIVES (aucune requête depuis ≥ 5 min) valent 0 : compute suspendu.
    """
    cuh_month = cuh_day * DAYS_PER_MONTH
    days_to_wall = budget / cuh_day if cuh_day > 0 else float("inf")
    cost = cuh_month * price
    verdict = "❌ SUSPENSION avant fin de mois" if cuh_month > budget else "✅ sous budget"
    return {
        "name": name,
        "cuh_month": cuh_month,
        "days_to_wall": days_to_wall,
        "cost": cost,
        "verdict": verdict,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Modèle CU-heures Neon — SECT-DB-HYBRID-2")
    ap.add_argument("--budget", type=float, default=100.0, help="CU-h incluses/mois (Free: 100)")
    ap.add_argument("--price", type=float, default=0.106, help="$ par CU-h (Launch: 0.106)")
    ap.add_argument("--json", action="store_true", help="sortie JSON")
    args = ap.parse_args()

    print("── Garde-fous mesurés (la requête la plus fréquente décide de tout) ──")
    for name, interval, note in sorted(TICKERS_DB, key=lambda t: t[1]):
        keeps = "GARDE LE COMPUTE ÉVEILLÉ 24/7" if interval < 300 else "(seule, laisserait dormir)"
        print(f"  {name:<24} toutes les {interval:>4}s  {keeps:<38} [{note}]")
    print("  → intervalle MINIMUM = 10 s < 5 min de seuil idle : le compute ne dort")
    print("    JAMAIS tant que le primaire OCI (ou Render) tourne avec ses workers.\n")

    scenarios = [
        scenario("S0  statu quo — 0,25 CU 24/7 (plan Free, défaut)", 0.25 * 24, args.budget, args.price),
        scenario("S0b si compute 0,5 CU 24/7 (à vérifier console)", 0.5 * 24, args.budget, args.price),
        scenario("S0c si compute 1 CU 24/7", 1.0 * 24, args.budget, args.price),
        scenario("S1  aminci — 0,25 CU, 16 h/j actives (nuit dormante)", 0.25 * 16, args.budget, args.price),
        scenario("S2  aminci — 0,25 CU, 13 h/j actives (limite exacte)", 0.25 * 13.3, args.budget, args.price),
        scenario("S3  examen — 12 h à 0,25 CU + 4 h à 2 CU (autoscale)", 12 * 0.25 + 4 * 2.0, args.budget, args.price),
    ]

    print(f"── Scénarios mensuels (budget {args.budget:.0f} CU-h ; Launch ${args.price}/CU-h) ──")
    print(f"  {'scénario':<58} {'CU-h/mois':>10} {'mur':>12} {'si Launch':>10}")
    for s in scenarios:
        print(f"  {s['name']:<58} {s['cuh_month']:>10.1f} {fmt_day(s['days_to_wall']):>12} "
              f"{'$%.0f' % s['cost'] if s['cost'] >= 1 else '$%.2f' % s['cost']:>10}  {s['verdict']}")
    print()
    print("── Lectures ──")
    print("  • S0 (réalité mesurée dès aujourd'hui) : le mur tombe vers le 17ᵉ jour")
    print("    du cycle de facturation → ~10-13 jours/mois de base SUSPENDUE.")
    print("  • S3 : pendant une période d'examens, l'autoscale (≤ 2 CU sur Free)")
    print("    accélère le burn ×8 → suspension possible EN PLEIN EXAMEN (pire cas métier).")
    print("  • L'équivalent Launch du statu quo : 182,5 CU-h × $0,106 ≈ $19,35/mois.")
    print("  • Toute réplication logique continue depuis/vers Neon maintient le compute")
    print("    éveillé 24/7 → coût marginal nul sur le statu quo, mais PAS compatible")
    print("    avec un objectif de retour sous 100 CU-h.")
    print("  • Le seul moyen de laisser dormir le compute la nuit : AUCUNE requête")
    print("    pendant ≥ 5 min → exigerait un intervalle de polling ≥ 5 min pour TOUS")
    print("    les workers + MinConns=0 + health-check désactivé la nuit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
