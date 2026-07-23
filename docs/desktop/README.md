# SECT Desktop — Documentation

> Documentation de référence pour l'application desktop SECT (Wails).

## 📁 Contenu

| Fichier | Description |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | **Document d'architecture complet** — à valider avant d'écrire le moindre code Wails |

## 📋 Statut

| Élément | Valeur |
|---|---|
| **Phase actuelle** | Phase 0 — Documentation (pre-Phase A) |
| **Validation comité technique** | ⏳ En attente |
| **Premier commit** | `SECT-DESKTOP-ARCH-1` (juillet 2026) |
| **Prochaine étape** | Phase A — Préparation (création dossier `desktop/`, install Wails v2, démo) |

## 🎯 Objectif

Valider l'architecture et les coûts **avant** d'investir dans le développement. Ce document répond aux questions :

- **Pourquoi** une app desktop ? (cas d'usage, métriques cibles)
- **Comment** ? (Wails v2 thin wrapper, pas de sectcore)
- **Combien** ? (290-650 €/an, 8 jours dev Phase A+B)
- **Quels risques** ? (techniques, produit, sécurité + mitigations)
- **Comment rollback** ? (force_rollback, abandon desktop sans impact web/PWA)

## 📐 Décisions clés

1. **Wails v2** (stable), pas v3 (beta)
2. **Thin wrapper** : aucune logique métier dupliquée (pas de sectcore dans un premier temps)
3. **Backend cloud inchangé** : le desktop consomme les mêmes API REST que le web
4. **GitHub Releases** comme serveur d'auto-update (gratuit, CDN global)
5. **Code signing OV** (début) → EV (si adoption justifie)
6. **Observation 6 mois** avant de décider sectcore (critères mesurables)

## 🔗 Liens utiles

- [Wails v2 documentation](https://wails.io/)
- [Document d'architecture complet](./ARCHITECTURE.md)
- [Worklog SECT](../../worklog.md) — historique des évolutions

---

*Documentation maintenue par Ulrich EVRARD (udevrard7).*
*Toute modification du document d'architecture doit faire l'objet d'un commit avec bump de version.*
