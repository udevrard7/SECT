# SECT Desktop — Architecture Handbook

> Documentation officielle de l'application desktop SECT (Wails).
> Structurée en **documents vivants modulaires** + **ADR (Architecture Decision Records)**.

## 📚 Structure de la documentation

Cette documentation suit le principe des **documents vivants** : chaque fichier est ciblé, modifiable indépendamment, et ne devient pas obsolète quand une décision change.

### Documents principaux

| # | Document | Description |
|---|---|---|
| 00 | [Vision](./00-vision.md) | Pourquoi une app desktop, cas d'usage, métriques cibles, non-objectifs |
| 01 | [Architecture](./01-architecture.md) | Vue d'ensemble, diagrammes (composants, séquence, déploiement) |
| 02 | [Installation & Dev](./02-installation-dev.md) | Prérequis, dev local, build, tests, debug |
| 03 | [Communication Wails ↔ Next.js](./03-communication.md) | 2 canaux (API REST + bindings Wails), bridge TS, détection desktop |
| 04 | [Native API](./04-native-api.md) | Fonctions Go natives exposées au frontend (Phase B + C) |
| 05 | [Sécurité](./05-security.md) | Auth, stockage jetons, TLS, bindings sécurité, signing |
| 06 | [Auto-update](./06-auto-update.md) | GitHub Releases, latest.json, canaux, rollback |
| 07 | [Code signing](./07-code-signing.md) | OV vs EV, Apple notarization, stockage secrets, coûts |
| 08 | [Packaging](./08-packaging.md) | .exe NSIS, .dmg, .AppImage, .deb, .rpm, configs |
| 09 | [CI/CD](./09-ci-cd.md) | GitHub Actions, build 3 plateformes, signing automatisé |
| 10 | [Feuille de route](./10-roadmap.md) | Phase A-E avec pilote + critères passage |
| 11 | [Gouvernance technique](./11-governance.md) | 5 principes garde-fous, processus de décision |
| 12 | [Matrice de décisions](./12-decision-matrix.md) | Web vs Desktop par fonctionnalité |

### Architecture Decision Records (ADR)

Chaque ADR documente une décision technique majeure avec 4 sections : contexte, options, décision, conséquences.

| ADR | Titre | Statut |
|---|---|---|
| [0001](./ADR/0001-use-wails.md) | Utiliser Wails pour l'app desktop | Accepté |
| [0002](./ADR/0002-no-local-database.md) | Aucune DB locale dans le client desktop | Accepté |
| [0003](./ADR/0003-single-cloud-backend.md) | Backend cloud unique (pas de sectcore initialement) | Accepté |
| [0004](./ADR/0004-github-release.md) | GitHub Releases comme serveur d'auto-update | Accepté |
| [0005](./ADR/0005-code-signing.md) | Code signing obligatoire (Windows OV + macOS notarization) | Accepté |

## 📋 Statut

| Élément | Valeur |
|---|---|
| **Phase actuelle** | Phase 0 — Documentation (pre-Phase A) |
| **Validation comité technique** | ⏳ En attente |
| **Premier commit** | `SECT-DESKTOP-ARCH-1` (juillet 2026) |
| **Refonte modulaire** | `SECT-DESKTOP-HANDBOOK-1` (juillet 2026) |
| **Prochaine étape** | Phase A — Préparation (création dossier `desktop/`, install Wails, démo) |

## 🎯 Décisions clés

1. **Wails** (dernière version stable au moment Phase B) — voir [ADR-0001](./ADR/0001-use-wails.md)
2. **Thin wrapper** : aucune logique métier dupliquée (pas de sectcore initialement) — voir [ADR-0003](./ADR/0003-single-cloud-backend.md)
3. **Backend cloud inchangé** : le desktop consomme les mêmes API REST que le web
4. **GitHub Releases** comme serveur d'auto-update — voir [ADR-0004](./ADR/0004-github-release.md)
5. **Code signing OV** (début) → EV (si adoption justifie) — voir [ADR-0005](./ADR/0005-code-signing.md)
6. **Pilote 5 établissements** avant release publique (Phase B → C)
7. **Observation 6 mois** avant de décider sectcore (Phase D → E)

## 🛡️ Principes de gouvernance

1. Le backend cloud est l'unique source de vérité
2. Aucune logique métier ne doit être dupliquée sans ADR validé
3. Toute fonctionnalité desktop doit démontrer une valeur ajoutée vs Web
4. Les mises à jour desktop ne doivent jamais interrompre une session d'examen
5. Le Web reste la plateforme de référence

→ Voir [11 — Gouvernance technique](./11-governance.md) pour les détails.

## 🗺️ Feuille de route

```
PWA (actuelle)
     ↓
Prototype Desktop (Phase A — 1 semaine)
     ↓
Pilote 5 établissements (Phase B — 2-3 jours + 30j observation)
     ↓
Version 1.0 publique (Phase C — 2-4 semaines)
     ↓
Observation 6 mois (Phase D)
     ↓
SectCore si nécessaire (Phase E — conditionnel)
```

→ Voir [10 — Roadmap](./10-roadmap.md) pour les critères de passage.

## 💰 Budget

| Poste | Coût annuel | Phase |
|---|---|---|
| Certificat Windows OV | 200-300 € | B |
| Apple Developer Program | 99 $ (~90 €) | B |
| Migration Windows EV (optionnel) | +150 € | D (si adoption) |
| GitHub Releases + CI/CD | 0 € | Toutes |
| **Total Phase B** | **290-390 €/an** | |
| **Total Phase D (avec EV)** | **440-540 €/an** | |

→ Voir [07 — Code signing](./07-code-signing.md) pour le détail.

## 🔗 Navigation rapide

- **Nouveau sur le projet ?** Commencer par [00 — Vision](./00-vision.md)
- **Comprendre l'archi ?** [01 — Architecture](./01-architecture.md)
- **Démarrer le dev ?** [02 — Installation & Dev](./02-installation-dev.md)
- **Ajouter une fonction native ?** [12 — Matrice de décisions](./12-decision-matrix.md) + [04 — Native API](./04-native-api.md)
- **Changer une décision ?** Créer un ADR dans [ADR/](./ADR/)
- **Coûts et budget ?** [07 — Code signing](./07-code-signing.md)
- **Roadmap et phases ?** [10 — Roadmap](./10-roadmap.md)

## 📝 Maintenance

- **Documents vivants** : chaque fichier `.md` peut être modifié indépendamment
- **ADR immuables** : un ADR accepté n'est jamais modifié, il est "superseded by" un nouvel ADR
- **Conventional Commits** : `SECT-DESKTOP-<TASK>: description`
- **Worklog** : toute évolution est tracée dans [`worklog.md`](../../worklog.md)

---

*Documentation maintenue par Ulrich EVRARD (udevrard7) et l'équipe technique SECT.*
*Toute modification d'un document vivant doit faire l'objet d'un commit.*
*Toute modification d'une décision architecturale doit faire l'objet d'un nouvel ADR.*
