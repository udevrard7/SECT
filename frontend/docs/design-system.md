# SECT — Design System & Spécification UI/UX

> **Plateforme EdTech premium** — Système d'Évaluation Casse-Tête
> Document de spécification complet — Senior Product Designer EdTech/SaaS
> Version 2.0 — Style hybride Modern + Card + Glass + Gamification + Cyan (tech/IA)

---

## Table des matières

1. [Vision & principes UX](#1-vision--principes-ux)
2. [Design System complet](#2-design-system-complet)
3. [Palette de couleurs](#3-palette-de-couleurs)
4. [Règles typographiques](#4-règles-typographiques)
5. [Composants UI](#5-composants-ui)
6. [Patterns UX](#6-patterns-ux)
7. [Wireframes des principales pages](#7-wireframes-des-principales-pages)
8. [Animations & micro-interactions](#8-animations--micro-interactions)
9. [Bonnes pratiques PWA](#9-bonnes-pratiques-pwa)
10. [Guidelines responsive](#10-guidelines-responsive)

---

## 1. Vision & principes UX

### Expérience émotionnelle recherchée

L'utilisateur doit ressentir :

| Émotion | Levier design |
|---------|---------------|
| **Motivation** | Gamification légère (XP, streaks, badges, ProgressRing animés) |
| **Clarté** | Modern Clean Dashboard, hiérarchie visuelle, whitespace généreux |
| **Contrôle** | Feedback immédiat, états clairs (loading/empty/error/success) |
| **Progression** | Barres de progression, niveaux, objectifs hebdomadaires visibles |
| **Satisfaction** | Micro-animations de réussite (RewardToast, confetti discret) |
| **Confiance** | Palette indigo (sérieux), glassmorphism premium, accessibilité WCAG |

### Principes UX directeurs

- **Mobile First** — conception à partir du mobile (Android prioritaire, Côte d'Ivoire), puis enhancement desktop
- **PWA Ready** — installable, offline-capable, notifications push
- **Accessibilité WCAG AA** — contraste ≥ 4.5:1, navigation clavier, screen readers
- **Navigation intuitive** — sidebar fixe (desktop) + bottom nav (mobile), max 3 clics vers une action
- **Réduction de la charge cognitive** — un écran = un objectif, whitespace, hiérarchie claire
- **Temps d'apprentissage minimal** — patterns familiers (Notion/Linear/Duolingo), pas de chrome inutile
- **Performances optimisées** — CLS = 0, LCP < 2.5s, lazy loading, next/image
- **Expérience fluide** — transitions 200-300ms, respect prefers-reduced-motion

### Inspirations fusionnées

| Inspiration | Ce qu'on en retient |
|-------------|---------------------|
| **Notion** | Clarté éditoriale, blocks, whitespace |
| **Google Classroom** | Organisation cours/évaluations, simplicité |
| **Duolingo** | Gamification (XP, streaks, badges), feedback positif |
| **Coursera** | Structure pédagogique, progression visible |
| **Linear** | Densité d'info, raccourcis clavier, polissage |
| **Stripe Dashboard** | Premium, data-viz élégante, micro-interactions |

---

## 2. Design System complet

### Architecture

```
src/
├── app/
│   ├── globals.css          ← Tokens (couleurs, radius, fonts) + utilitaires
│   └── layout.tsx           ← Fonts Inter + JetBrains Mono + meta PWA
├── components/
│   ├── ds/                  ← Design System (14 composants)
│   │   ├── app-shell.tsx        ← Shell applicatif (sidebar + topbar + bottom nav)
│   │   ├── stat-card.tsx        ← Carte métrique (KPI)
│   │   ├── entity-card.tsx      ← Carte entité (épreuve, cours…)
│   │   ├── user-stats.tsx       ← Gamification (XP, streak, tier)
│   │   ├── glass-modal.tsx      ← Modale glassmorphism
│   │   ├── progress-ring.tsx    ← Anneau de progression SVG animé
│   │   ├── progress-bar.tsx     ← Barre de progression animée
│   │   ├── reward-toast.tsx     ← Notification de récompense
│   │   ├── pulse-skeleton.tsx   ← État de chargement
│   │   ├── badge-card.tsx       ← Carte de badge (gamification)
│   │   ├── reward-center.tsx    ← Centre de récompenses (grille de badges)
│   │   ├── academic-calendar.tsx← Calendrier académique mensuel
│   │   ├── grade-table.tsx      ← Tableau des notes premium
│   │   ├── ai-assistant.tsx     ← Assistant IA pédagogique (chat flottant)
│   │   ├── showcase.tsx         ← Démonstration vivante
│   │   └── index.ts             ← Barrel export
│   ├── ui/                  ← shadcn/ui (composants de base)
│   └── ...                  ← Pages métier (39 pages migrées)
└── docs/
    └── design-system.md     ← Ce document
```

### Stratégie d'intégration

Les variables shadcn existantes (`--primary`, `--secondary`, `--destructive`…) sont **remappées** vers la palette DS. Les 39 pages existantes héritent automatiquement de l'identité indigo/violet sans modification de code.

### Tokens

Définis dans `globals.css` via `@theme inline` (Tailwind v4). Utilisables en classes Tailwind :
- `bg-primary`, `text-success`, `border-warning`, `bg-tech/10`…
- `font-display`, `font-sans`, `font-mono`
- `rounded-sm/md/lg/xl/full` (6/10/16/24px/9999)
- `.ds-glass`, `.ds-lift`, `.ds-glow-{bronze|silver|gold|platinum}`

---

## 3. Palette de couleurs

### Palette sémantique complète — "Savane EdTech"

| Token | Light | Dark | Hex | Usage |
|-------|-------|------|-----|-------|
| `--primary` | oklch(0.78 0.19 125) | oklch(0.82 0.2 125) | **#84CC16** | Vert lime — BOUTONS et FONDS uniquement (texte bleu nuit dessus = 8:1 ✅) |
| `--primary-text` | oklch(0.38 0.12 125) | oklch(0.82 0.2 125) | **#3F6212** / #84CC16 | Vert foncé — TEXTE sur fond clair (7:1 ✅ AA). En dark = vert lime vif. |
| `--secondary` | oklch(0.55 0.15 35) | oklch(0.62 0.17 35) | **#C2410C** | Terre cuite — accents, badges secondaires |
| `--success` | oklch(0.78 0.19 125) | oklch(0.82 0.2 125) | **#84CC16** | Vert lime — FONDS success (texte sombre dessus) |
| `--success-text` | oklch(0.38 0.12 125) | oklch(0.82 0.2 125) | **#3F6212** / #84CC16 | Vert foncé — TEXTE success sur fond clair (7:1 ✅ AA) |
| `--warning` | oklch(0.76 0.16 70) | oklch(0.8 0.16 70) | **#F5A623** | Orange soleil — alertes, délais, streaks |
| `--destructive` | oklch(0.55 0.22 27) | oklch(0.65 0.22 27) | **#D0021B** | Red — erreurs, score faible |
| `--info` | oklch(0.55 0.12 250) | oklch(0.6 0.12 250) | **#1E1B4B** | Bleu nuit — information |
| `--tech` | oklch(0.715 0.143 194.7) | oklch(0.78 0.13 194.7) | **#06B6D4** | Cyan — technologie, IA, assistant |
| `--xp` | oklch(0.78 0.19 125) | oklch(0.82 0.2 125) | **#84CC16** | Vert lime — FONDS XP |
| `--xp-text` | oklch(0.38 0.12 125) | oklch(0.82 0.2 125) | **#3F6212** / #84CC16 | Vert foncé — TEXTE XP sur fond clair |

> **⚠️ RÈGLE CRITIQUE** : Ne JAMAIS utiliser `text-primary` (vert lime #84CC16) pour du texte sur fond clair — contraste 2:1 (illisible). Utiliser `text-primary-text` (vert foncé #3F6212, contraste 7:1 ✅). En mode sombre, `primary-text = primary` (vert lime vif lisible sur fond sombre).

### Tiers de gamification

| Token | Light | Hex | Usage |
|-------|-------|-----|-------|
| `--bronze` | oklch(0.665 0.151 54.5) | #CD7F32 | Niveau 1 — débutant |
| `--silver` | oklch(0.72 0.015 250) | #C0C0C0 | Niveau 2 — intermédiaire |
| `--gold` | oklch(0.745 0.151 84.5) | #FFD700 | Niveau 3 — avancé |
| `--platinum` | oklch(0.84 0.02 250) | #E5E4E2 | Niveau 4 — expert |
| `--xp` | oklch(0.541 0.24 293.5) | #7C3AED | Points d'expérience (violet) |

### Fonds & surfaces

| Token | Light | Dark | Hex |
|-------|-------|------|-----|
| `--background` | oklch(0.984 0.003 247.9) | oklch(0.208 0.042 265.1) | **#F8FAFC** / #0F172A |
| `--card` | oklch(1 0 0) | oklch(0.279 0.041 260) | **#FFFFFF** / #1E293B |
| `--muted` | oklch(0.967 0.001 286.4) | oklch(0.279 0.041 260) | gray-100 / slate-800 |
| `--muted-foreground` | oklch(0.551 0.027 264.4) | oklch(0.708 0 0) | gray-500 / slate-300 |
| `--border` | oklch(0.929 0.013 255.5) | oklch(1 0 0 / 0.1) | gray-200 / white-10% |

### Glassmorphism

| Token | Light | Dark |
|-------|-------|------|
| `--glass-bg` | oklch(1 0 0 / 0.7) | oklch(0.279 0.041 260 / 0.6) |
| `--glass-border` | oklch(1 0 0 / 0.2) | oklch(1 0 0 / 0.12) |
| `--glass-blur` | 12px | 12px |

**Règle** : le glassmorphism (`.ds-glass`) est **réservé aux éléments positionnés** (sticky/fixed/absolute) : topbar, bottom nav mobile, modales, toasts, drawer. **Jamais** sur les cartes de contenu principal.

### Contraste & accessibilité

Tous les couples texte/fond respectent **WCAG AA** (ratio ≥ 4.5:1 pour le texte normal, ≥ 3:1 pour le grand texte). Vérifié avec les tokens oklch qui s'adaptent automatiquement en dark mode.

---

## 4. Règles typographiques

### Familles

| Usage | Famille | Variable | Weights |
|-------|---------|----------|---------|
| **Display** (titres H1-H2) | Inter | `--font-display` / `font-display` | 600, 700 |
| **Body** (corps de texte) | Inter | `--font-sans` / `font-sans` | 400, 500 |
| **Code & Stats** | JetBrains Mono | `--font-mono` / `font-mono` | 400, 500 |

Chargées via `next/font/google` (subset automatique, `display: swap`, pas de CLS).

### Échelle typographique

| Niveau | Taille | Weight | Line-height | Tracking | Classe |
|--------|--------|--------|-------------|----------|--------|
| H1 (page) | 24px / 1.5rem | 700 | 1.2 | -0.02em | `font-display tracking-tight` |
| H2 (section) | 20px / 1.25rem | 600 | 1.3 | -0.01em | `font-display tracking-tight` |
| H3 (card) | 16px / 1rem | 600 | 1.4 | 0 | `font-semibold` |
| Body | 14px / 0.875rem | 400 | 1.7 | 0 | `text-sm` |
| Body large | 16px / 1rem | 400 | 1.7 | 0 | `text-base` |
| Caption | 12px / 0.75rem | 500 | 1.5 | 0 | `text-xs` |
| Overline | 11px / 0.6875rem | 600 | 1.4 | 0.05em uppercase | `text-[11px] font-semibold uppercase tracking-wider` |
| Code/Stat | 14px / 0.875rem | 500 | 1.4 | 0 | `font-mono tabular-nums` |
| Stat XL | 24px / 1.5rem | 600 | 1.2 | -0.01em | `font-mono text-2xl font-semibold tabular-nums tracking-tight` |

### Règles

- **Taille minimale** : 14px (mobile), 16px (desktop) pour le body
- **Line-height body** : 1.7 (lecture confortable)
- **Tabular-nums** : systématique sur les chiffres (scores, counts, %, montants) pour alignement vertical
- **Tracking** : -0.02em sur les grands titres (élégance), 0 sur le body, +0.05em uppercase sur les overlines
- **Maximum characters per line** : 65-75 caractères pour la lisibilité

---

## 5. Composants UI

### Catalogue (14 composants DS + shadcn/ui)

#### Composants DS (src/components/ds/)

| # | Composant | Rôle | Props clés |
|---|-----------|------|------------|
| 1 | **AppShell** | Shell applicatif : sidebar desktop + bottom nav mobile + topbar glass | `brand`, `sections`, `activeId`, `userStats`, `user`, `topbarActions`, `children` |
| 2 | **StatCard** | Carte métrique : icône + label + valeur + tendance + hint | `label`, `value`, `icon`, `accent`, `trend`, `loading`, `onClick` |
| 3 | **EntityCard** | Carte entité (épreuve/cours) : thumbnail + badge tier + barre progression | `title`, `subtitle`, `thumbnailUrl`, `progress`, `tier`, `badge`, `meta`, `onClick` |
| 4 | **UserStats** | Gamification : XP (éclair) + streak (flamme) + niveau/tier | `stats`, `compact`, `avatarUrl`, `userName` |
| 5 | **GlassModal** | Modale glassmorphism + animation spring | `open`, `onClose`, `title`, `description`, `size`, `footer` |
| 6 | **ProgressRing** | Anneau SVG animé (stroke-dashoffset) | `value`, `size`, `accent`, `label`, `sublabel` |
| 7 | **ProgressBar** | Barre de progression animée (spring) | `value`, `accent`, `size`, `showLabel`, `showGlow` |
| 8 | **RewardToast** | Notification récompense (top-center glass) + XP + tier | `open`, `onClose`, `title`, `description`, `xpGained`, `tier` |
| 9 | **PulseSkeleton** | État de chargement pulse + StatCardSkeletonGrid | `className`, `variant` |
| 10 | **BadgeCard** | Carte de badge (gamification) : icon + tier + statut | `badge`, `index` |
| 11 | **RewardCenter** | Centre de récompenses : grille de badges + progression XP | `rewards`, `userProgress` |
| 12 | **AcademicCalendar** | Calendrier mensuel : événements académiques + nav clavier | `events`, `month`, `onDateClick` |
| 13 | **GradeTable** | Tableau des notes premium : scores colorés + moyenne pondérée | `grades`, `showAverage`, `onRowClick` |
| 14 | **AIAssistant** | Assistant IA flottant (chat) : focus trap + suggestions | `onSend`, `suggestions`, `title` |

#### Composants shadcn/ui (src/components/ui/)

Composants de base hérités : Button, Card, Input, Select, Dialog, Sheet, Table, Badge, Avatar, Tabs, Dropdown, Tooltip, Toast, Skeleton, ScrollArea, etc. Tous héritent automatiquement de la palette DS via le remap des variables.

### États des composants

Chaque composant interactif gère :
- **Default** — repos
- **Hover** — `ds-lift` (translateY -2px) + shadow
- **Focus** — `focus-visible:ring-2 focus-visible:ring-ring` (accessible)
- **Active** — `scale-0.98` (feedback tactile)
- **Disabled** — `opacity-50 cursor-not-allowed`
- **Loading** — `PulseSkeleton` (pas de spinner)
- **Empty** — illustration + message + CTA
- **Error** — `ErrorState` (border-l-4 rouge + retry)

---

## 6. Patterns UX

### Navigation

| Pattern | Desktop | Mobile |
|---------|---------|--------|
| Navigation principale | Sidebar fixe 260px (gauche) | Bottom nav glass (5 items max) |
| Navigation secondaire | Sections collapsibles dans sidebar | Drawer (Sheet gauche) via bouton menu |
| Breadcrumb | Topbar : Catégorie › Page | Topbar : Page uniquement |
| Retour | Bouton navigateur + breadcrumb | Bouton physique + swipe gesture (PWA) |

### Layouts

| Layout | Usage | Structure |
|--------|-------|-----------|
| **Dashboard** | Tableaux de bord | Grid KPI cards (4 cols) + 2 colonnes (chart + activité) |
| **Liste** | Épreuves, étudiants, devoirs | Toolbar (filtres + recherche) + grille cartes (3-4 cols) |
| **Détail** | Fiche épreuve, profil | 2 colonnes (main 2/3 + sidebar 1/3) |
| **Tableau** | Notes, logs, utilisateurs | Toolbar + Table (desktop) / Cards (mobile) |
| **Form** | Création, édition | 1 colonne centrée (max-w-2xl) + sections |
| **Split** | Correction, comparaison | 2 panneaux resizable |

### Feedback

| Action | Feedback |
|--------|----------|
| Sauvegarde | Toast success (sonner) + bouton "Enregistré" |
| Erreur | Toast error + message contextuel |
| Chargement | PulseSkeleton (structure) ou ProgressRing (action) |
| Récompense | RewardToast (top-center, glass, XP + tier) |
| Suppression | Confirmation GlassModal + toast |
| Temps réel | Indicateur live (dot pulsant) |

### Gamification

| Élément | Emplacement | Déclenchement |
|---------|-------------|---------------|
| **XP** | Topbar (UserStats compact) | Action réussie (examen, exercice) |
| **Streak** | Topbar (flamme pulsante) | Connexion quotidienne |
| **Niveau** | Topbar + profil | Seuil d'XP atteint |
| **Badges** | RewardCenter + profil | Accomplissement (50 copies, 7 jours…) |
| **ProgressRing** | Dashboards, fiches | Progression visible (cours, module) |
| **RewardToast** | Top-center (transient) | Déblocage badge / niveau |

**Règle** : la gamification est **légère et non intrusive**. Pas de confetti agressif, pas de sons intempestifs. Les animations sont discrètes (spring 300ms max) et respectent `prefers-reduced-motion`.

---

## 7. Wireframes des principales pages

### 7.1 Dashboard étudiant (mobile-first)

```
┌─────────────────────────────┐
│ [≡] SECT     [⚡2840][🔥7] [👤] │ ← Topbar glass sticky
├─────────────────────────────┤
│ Bonjour, Ulrich 👋          │
│ Niveau 12 · Tier Or        │
│ ┌─────────────────────────┐ │
│ │ Progression sem.  ▓▓▓░░ │ │ ← ProgressBar
│ │ 3/5 objectifs           │ │
│ └─────────────────────────┘ │
│                             │
│ KPIs (grid 2 cols)          │
│ ┌────────┐ ┌────────┐       │
│ │  14.5  │ │  87%   │       │
│ │ Moyenne│ │ Réussite│      │
│ └────────┘ └────────┘       │
│ ┌────────┐ ┌────────┐       │
│ │   5    │ │   3    │       │
│ │ Épr.   │ │ À faire│       │
│ └────────┘ └────────┘       │
│                             │
│ Évaluations à venir         │
│ ┌─────────────────────────┐ │
│ │ [📝] Examen final       │ │ ← EntityCard
│ │ Algorithmique · 45 min  │ │
│ │ ▓▓▓▓▓░░░░ 50%           │ │
│ │ [Or] EN_COURS           │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [📝] QCM Bases de don.  │ │
│ │ ...                     │ │
│ └─────────────────────────┘ │
│                             │
│ Centre de récompenses       │
│ [🏆][🔥][⭐][🔒] (4 badges)  │ ← RewardCenter (horizontal scroll)
│                             │
├─────────────────────────────┤
│ [🏠][📚][✅][🏆][👤]         │ ← Bottom nav glass
└─────────────────────────────┘
```

### 7.2 Dashboard enseignant (desktop)

```
┌──────────┬──────────────────────────────────────────┐
│ SIDEBAR  │ TOPBAR (glass sticky)                     │
│ 260px    │ [Breadcrumb] [⚡XP][🔥Streak] [🔔][👤]    │
│          ├──────────────────────────────────────────┤
│ SECT     │ Tableau de bord enseignant                │
│          │                                            │
│ ▸ Pédago │ ┌──────┐┌──────┐┌──────┐┌──────┐         │
│  Dashboard│ │ 14.5 ││  87% ││  5   ││  3   │  KPIs   │
│  Épreuves │ │/20   ││Réuss.││Épr.  ││À corr│  4 cols │
│  Correct. │ └──────┘└──────┘└──────┘└──────┘         │
│  Résultat │                                            │
│          │ ┌────────────────────┐┌─────────────────┐ │
│ ▸ Admin  │ │ Évolution moyennes ││ Perf. par épreuve│ │
│  Étudiants│ │  (AreaChart)       ││  (BarChart)     │ │
│  Quest.  │ │                    ││                 │ │
│          │ └────────────────────┘└─────────────────┘ │
│ ▸ Outils │                                            │
│  Docum.  │ ┌──────────────────────────────────────┐ │
│  Badge   │ │ Corrections en attente (5)           │ │
│  ──────  │ │ • Examen algo — 3 copies    [Corriger]│ │
│ [Profil] │ │ • QCM BDD — 2 copies        [Corriger]│ │
│          │ └──────────────────────────────────────┘ │
│          │                                            │
│          │ ┌──────────────────────────────────────┐ │
│          │ │ Assistant IA pédagogique   [Sparkles] │ │ ← AIAssistant
│          │ │ "Posez une question…"                 │ │    (floating)
│          │ └──────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────┘
```

### 7.3 Liste d'épreuves

```
┌──────────────────────────────────────────────────────┐
│ Épreuves                          [+ Nouvelle épreuve]│
│                                                      │
│ [🔍 Rechercher…] [Statut▾] [Filière▾]    [Vue: grille]│ ← Toolbar
├──────────────────────────────────────────────────────┤
│ ┌─────────┐┌─────────┐┌─────────┐┌─────────┐         │
│ │[📝]     ││[📝]     ││[📝]     ││[📝]     │         │ ← EntityCard grid
│ │Examen   ││QCM BDD  ││Devoir   ││Projet   │         │   (4 cols)
│ │final    ││         ││struct.  ││API REST │         │
│ │L3 · 45m ││L2 · 30m ││L1       ││M1 · 2sem│         │
│ │▓▓▓▓▓░░  ││▓▓▓▓▓▓▓▓││▓▓░░░░░  ││░░░░░░░░ │         │
│ │[Or]     ││[Plat.]  ││[Bronze] ││[Silver] │         │
│ │EN_COURS ││TERMINÉ  ││À_FAIRE  ││         │         │
│ │12q·20pt ││20q·20pt ││5q·20pt  ││Rendu ind│         │
│ └─────────┘└─────────┘└─────────┘└─────────┘         │
└──────────────────────────────────────────────────────┘
```

### 7.4 Tableau des notes

```
┌──────────────────────────────────────────────────────┐
│ Mes notes                          [Export PDF]       │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Matière      │ Épreuve     │ Note  │ Coef │ Date │ │
│ ├──────────────┼─────────────┼───────┼──────┼──────┤ │
│ │ Algorithmique│ Examen final│[16/20]│  3   │23/06 │ │ ← GradeTable
│ │ BDD          │ QCM         │[18/20]│  2   │20/06 │ │   (desktop table)
│ │ Structures   │ Devoir      │[14/20]│  2   │18/06 │ │
│ │ API REST     │ Projet      │[19/20]│  4   │15/06 │ │
│ ├──────────────┴─────────────┴───────┴──────┴──────┤ │
│ │ Moyenne pondérée           ◯ 16.4/20             │ │ ← Footer + ProgressRing
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 7.5 Centre de récompenses

```
┌──────────────────────────────────────────────────────┐
│ Centre de récompenses                                │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │  ◯ Niveau 12          2 840 / 3 500 XP           │ │ ← ProgressRing + bar
│ │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  81% — 660 XP vers niv. 13  │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ Badges (12/24 débloqués)                             │
│ ┌──────┐┌──────┐┌──────┐┌──────┐                    │
│ │ [🏆] ││ [🔥] ││ [⭐] ││ [🔒] │                    │ ← BadgeCard grid
│ │ Or   ││ 7j   ││ 50   ││ 100  │                    │   (4 cols)
│ │ streak││connex││copies││copies│                    │
│ │Déblo.││Déblo.││Déblo.││ 45%  │                    │
│ └──────┘└──────┘└──────┘└──────┘                    │
└──────────────────────────────────────────────────────┘
```

### 7.6 Calendrier académique

```
┌──────────────────────────────────────┐
│ ◄ Juin 2025 ►                        │
├──────────────────────────────────────┤
│ Lun Mar Mer Jeu Ven Sam Dim          │
│  01  02  03  04  05  06  07          │
│  08  09  10  11  12  13  14          │
│  15  16  17  18  19  20  21          │
│  22 [23] 24  25  26  27  28          │ ← today highlighted
│  29  30                              │
├──────────────────────────────────────┤
│ Événements du 23/06                  │
│ • [🔴] Examen final algorithmique    │ ← event type colors
│ • [🟡] Rendu projet API REST         │
└──────────────────────────────────────┘
```

### 7.7 Assistant IA pédagogique

```
                                    ┌─────────────────┐
                                    │ Assistant IA  ✕ │
                                    ├─────────────────┤
                                    │ 🤖 Bonjour !    │
                                    │ Comment puis-je │
                                    │ vous aider ?    │
                                    │                 │
                                    │              📝 │
                                    │      Explique  │
                                    │  les arbres AVL│
                                    │                 │
                                    │ [💡 Donne un   │
                                    │  exemple]       │
                                    │ [📊 Schématise] │
                                    ├─────────────────┤
                                    │ [Tapez…]   [➤] │
                                    └─────────────────┘
                                              [✨] ← floating btn (bg-tech)
```

---

## 8. Animations & micro-interactions

### Principes

- **Durée** : 200-300ms max (au-delà = sensation de lenteur)
- **Easing** : `easeOut` pour entrées, `spring` (damping 26, stiffness 300) pour les modales
- **Respect** : `prefers-reduced-motion` désactive toutes les animations (CSS global)
- **Performance** : animer uniquement `transform` et `opacity` (GPU-friendly), jamais `width`/`height`/`top`/`left`

### Catalogue d'animations

| Élément | Animation | Déclenchement | Durée |
|---------|-----------|---------------|-------|
| **Carte interactive** | `translateY(-2px)` + shadow | hover | 200ms ease |
| **KPI / StatCard** | `opacity 0→1, y 8→0` | mount | 250ms easeOut + stagger 50ms |
| **EntityCard** | scale thumbnail `1.05` | hover | 300ms |
| **ProgressRing** | `stroke-dashoffset` circonférence→0 | mount | 800ms easeOut |
| **ProgressBar** | `width 0→value%` | mount/update | 600ms spring |
| **Modale** | `scale 0.95→1, opacity 0→1` | open | 250ms spring (damping 26) |
| **Toast** | `y -60→0, scale 0.9→1` | show | spring (damping 20) |
| **Drawer mobile** | `x -100%→0` | open | spring (damping 28) |
| **Listes** | stagger children 50-80ms | mount | 250ms par item |
| **Streak flame** | `scale 1→1.08→1` pulse | si streak > 0 | 1.5s infinite |
| **Badge débloqué** | `scale + rotate` pulse | RewardToast show | 600ms |
| **AI Assistant** | pulse ring bouton | si fermé + messages non lus | 2s infinite |
| **Live dot** | `opacity 1→0.4, scale 1→0.85` | surveillance active | 1.6s |

### Micro-interactions

| Action | Feedback |
|--------|----------|
| Bouton click | `scale-0.98` actif |
| Toggle | slide + color transition 200ms |
| Input focus | `ring-2 ring-ring ring-offset-2` |
| Tab switch | underline slide 200ms |
| Drag & drop | ghost opacity-60 + drop zone highlight |
| Copy to clipboard | toast "Copié !" + checkmark 1s |
| Search | debounce 300ms + loading indicator |

### Patterns Framer Motion

```tsx
// Stagger d'entrée pour les listes
const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } }
}
const item = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } }
}

// AnimatePresence pour mount/unmount propre
<AnimatePresence>
  {open && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} />}
</AnimatePresence>
```

---

## 9. Bonnes pratiques PWA

### Configuration en place

- **`public/manifest.json`** — nom, icônes, start_url, display standalone, theme_color (#4F46E5), background_color (#0F172A), shortcuts (Dashboard, Épreuves, Correction)
- **Meta tags** dans `layout.tsx` :
  - `theme-color` adaptatif (light/dark)
  - `apple-mobile-web-app-capable` + `status-bar-style black-translucent`
  - `viewport: viewport-fit=cover` (safe areas iOS)
  - `apple-touch-icon`
  - `format-detection: telephone=no` (pas d'autolink téléphone)

### Installabilité

L'app est **installable** sur :
- **Android** (Chrome) — "Ajouter à l'écran d'accueil" → standalone
- **iOS** (Safari) — "Sur l'écran d'accueil" → standalone avec status bar translucent
- **Desktop** (Chrome/Edge) — "Installer cette app" → fenêtre standalone

### Safe areas (iOS notch)

```css
/* padding-bottom pour respecter la safe area */
.bottom-nav { padding-bottom: env(safe-area-inset-bottom); }
.topbar { padding-top: env(safe-area-inset-top); }
```

### Recommandations complémentaires (à implémenter)

| Feature | Priorité | Description |
|---------|----------|-------------|
| **Service Worker** | Moyenne | Cache-first pour les assets statiques, network-first pour l'API. Via `next-pwa` ou manuel. |
| **Offline fallback** | Moyenne | Page "Hors ligne" avec retry auto quand réseau revient |
| **Push notifications** | Basse | Notifications push pour : nouvel examen, résultat disponible, badge débloqué |
| **Background sync** | Basse | Soumettre un examen en différé si réseau perdu pendant la passation |
| **App shortcuts** | ✅ Fait | 3 shortcuts définis dans le manifest (Dashboard, Épreuves, Correction) |
| **Splash screen** | ✅ Auto | Géré par le navigateur via manifest (background_color + icons) |

### Performance PWA

- **LCP < 2.5s** — fonts `display: swap`, images `next/image` (lazy + responsive)
- **CLS = 0** — dimensions fixes sur images/cards, skeletons même taille que contenu
- **FID < 100ms** — code splitting, pas de JS lourd sur les pages critiques
- **Bundle** — tree-shaking, dynamic import pour les composants lourds (Monaco editor, Recharts)

---

## 10. Guidelines responsive

### Breakpoints (mobile-first)

| Breakpoint | Largeur | Usage |
|------------|---------|-------|
| `default` | < 640px | Mobile portrait (1 col) |
| `sm:` | ≥ 640px | Mobile landscape / petite tablette (2 cols) |
| `md:` | ≥ 768px | Tablette (sidebar visible, 2-3 cols) |
| `lg:` | ≥ 1024px | Desktop (sidebar fixe, 3-4 cols) |
| `xl:` | ≥ 1280px | Grand desktop (4+ cols) |

### Patterns responsive par composant

#### Sidebar / Navigation
- **Mobile (<md)** : cachée, drawer via bouton menu + bottom nav glass (5 items max)
- **Desktop (≥md)** : sidebar fixe 260px, collapsible (48px avec icônes + tooltips)

#### Grilles de cartes
```css
grid-cols-1        /* mobile */
sm:grid-cols-2     /* petite tablette */
lg:grid-cols-3     /* desktop */
xl:grid-cols-4     /* grand desktop */
```

#### Tableaux
- **Desktop** : `<table>` complète avec colonnes
- **Mobile** : transformation en cartes (chaque ligne = une carte) — pattern "card list"

#### Formulaires
- **Mobile** : 1 colonne, inputs pleine largeur, labels au-dessus
- **Desktop** : 2 colonnes pour les champs courts, 1 colonne pour les longs (max-w-2xl)

#### Modales
- **Mobile** : `calc(100vw - 2rem)`, plein écran presque
- **Desktop** : `max-w-md` / `max-w-lg` / `max-w-2xl` selon `size`

#### Topbar
- **Mobile** : brand + menu trigger, UserStats caché (affiché dans le drawer)
- **Desktop** : breadcrumb + UserStats compact + actions

### Touch targets

- **Minimum 44×44px** pour tous les éléments interactifs (WCAG 2.5.5)
- **Espacement 8px** minimum entre cibles tactiles adjacentes
- **Pas de hover-only interactions** sur mobile (toujours un équivalent tap)

### Images

- **`next/image`** systématique (lazy loading, responsive srcset, placeholder blur)
- **Aspect ratios** fixes (16:9 thumbnails, 1:1 avatars) pour CLS = 0
- **Formats modernes** : WebP/AVIF automatiques via Next.js

### Typography responsive

| Élément | Mobile | Desktop |
|---------|--------|---------|
| H1 page | 20px | 24px |
| H2 section | 18px | 20px |
| Body | 14px | 16px |
| KPI value | 20px | 24px |

### Tests à effectuer

- [ ] Chrome DevTools device toolbar : iPhone SE, iPad, Desktop
- [ ] Vrai device Android (Chrome) : scroll, tap, install
- [ ] Vrai device iOS (Safari) : safe areas, install, status bar
- [ ] Lighthouse PWA audit : score ≥ 90
- [ ] Lighthouse Accessibility : score ≥ 95

---

## Annexe : Checklist qualité

### Avant chaque mise en production

- [ ] `bun run lint` → 0 erreur
- [ ] `bunx tsc --noEmit` → 0 erreur
- [ ] Test mobile (DevTools + vrai device)
- [ ] Test dark mode
- [ ] Test lecteur d'écran (NVDA/VoiceOver) sur les flows critiques
- [ ] Lighthouse : Performance ≥ 90, Accessibility ≥ 95, PWA ≥ 90
- [ ] Aucun `as any` / `@ts-ignore` ajouté
- [ ] Aucune classe Tailwind dynamique (`bg-${var}`)
- [ ] Respect `prefers-reduced-motion`
- [ ] Images avec `alt` ou `aria-hidden`

---

**SECT Design System v2.0** — Document vivant, à maintenir à jour.
Dernière mise à jour : voir `worklog.md`.
