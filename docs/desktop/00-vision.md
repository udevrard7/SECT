# 00 — Vision et objectifs

> **Document vivant** — Modifier ce fichier si la vision produit du desktop évolue.

## 1. Pourquoi une app desktop SECT ?

SECT est aujourd'hui une **PWA** installable sur desktop Chrome/Edge. Cette PWA couvre ~85% des besoins desktop. L'app desktop native vise les **15% restants** qui justifient un investissement supplémentaire.

### Cas d'usage justifiant le desktop

| Cas d'usage | PWA | Desktop | Justification Desktop |
|---|---|---|---|
| Correction de copies (drag-drop fichiers) | ⚠️ Partiel | ✅ Natif | Drag-drop multi-fichiers + accès FS complet |
| Impression en lot (certificats, relevés) | ⚠️ 1 par 1 | ✅ Batch | File d'attente impression native |
| Téléchargement massif de documents | ⚠️ Limité | ✅ Natif | Sélection dossier, progress, retry |
| Notifications natives persistantes | ⚠️ Web Push | ✅ OS-level | Action Center Windows, Notification Center macOS |
| Mises à jour automatiques | ⚠️ Manuelles | ✅ Silent | Background updater |
| Déploiement B2B institutionnel | ⚠️ "Site web" | ✅ ".exe" | GPO, SCCM, perception "logiciel" |

### Cas d'usage NON justifiés (le web suffit)

| Cas d'usage | Pourquoi pas desktop ? |
|---|---|
| Passation d'examen | PWA + kiosk mode couvre déjà (Chrome `--kiosk --app=URL`) |
| Création d'épreuves | Web parfaitement adapté |
| Surveillance temps réel | WebSocket fonctionne en web/PWA |
| Correction QCU/QCM | Auto-grading cloud, pas besoin desktop |
| Messagerie | Web/PWA couvre |

## 2. Objectifs mesurables (6 mois)

| Objectif | Métrique | Cible |
|---|---|---|
| Adoption desktop | % établissements B2B avec ≥1 install desktop | 30% |
| Stabilité | Crash-free sessions | ≥ 99.5% |
| Satisfaction | NPS desktop | ≥ 40 |
| Réduction support | Tickets "impossible d'installer" | -60% vs PWA |
| Auto-update | % users sur dernière version après 7j | ≥ 80% |

## 3. Non-objectifs (ce qu'on ne fait PAS)

- ❌ Pas de duplication de la logique métier (pas de `sectcore` dans un premier temps — voir ADR-0003)
- ❌ Pas d'accès direct à PostgreSQL depuis le desktop (voir ADR-0002)
- ❌ Pas de mode hors ligne complet (le desktop reste un client riche en ligne)
- ❌ Pas de support mobile (la PWA couvre déjà Android/iOS)
- ❌ Pas de rewrite du frontend (le Next.js existant est réutilisé tel quel)

## 4. Argument produit (distribution B2B)

> Un établissement préfère souvent : télécharger un `.exe`, cliquer sur "Suivant", avoir une icône sur le bureau.

Même si techniquement la PWA couvre 80-90% des besoins, une app de bureau apporte un **bénéfice psychologique et organisationnel** majeur :
- Perçue comme "logiciel institutionnel" (vs "site web")
- Déployable via GPO/SCCM par les DSI
- Apparaît dans "Programmes et fonctionnalités" (désinstallation propre)
- Exigée dans certains appels d'offres B2B

**Ce n'est pas un argument technique, c'est un argument produit.**

## 5. Référence

- [ADR-0001 : Utiliser Wails](./ADR/0001-use-wails.md)
- [ADR-0003 : Backend cloud unique](./ADR/0003-single-cloud-backend.md)
- [12 — Matrice de décisions fonctionnelles](./12-decision-matrix.md)
