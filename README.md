# SECT — Système d'Évaluation Casse-Tête

Plateforme d'évaluation en ligne propulsée par l'Intelligence Artificielle pour l'enseignement supérieur.

## 🎯 Fonctionnalités Principales

### Multi-Rôles
- **ADMIN** : Gestion PaaS/SaaS de la plateforme (établissements, abonnements, sécurité)
- **RESPONSABLE** : Gestion des étudiants, enseignants, filières et évaluations
- **ENSEIGNANT** : Création et gestion des épreuves, questions et corrections
- **ÉTUDIANT** : Passation des évaluations et consultation des résultats

### Modules Clés

#### 📊 Administration (PaaS/SaaS)
- Gestion multi-établissements
- Système d'abonnement (Gratuit, Essentiel, Professionnel, Entreprise)
- Paramètres de sécurité par établissement
- Tableau de bord analytique (revenus, conversions, métriques)

#### 👥 Gestion Responsable
- Import/export CSV des étudiants et enseignants
- Assignation des niveaux et filières
- Suivi des performances par promotion
- Gestion des accès cross-établissements

#### 📝 Évaluations
- Types de questions variés : QCU, QCM, QRC, TRS
- Niveaux de difficulté : Facile, Moyen, Difficile, Expert
- Sessions de passation sécurisées
- Correction automatique et manuelle
- Proctoring et vérification d'identité

#### 📈 Analytics & Rapports
- Statistiques détaillées par rôle
- Résultats par question et par session
- Export des données
- Alertes et notifications

## 🛠️ Stack Technique

### Frontend
- **Next.js 16** avec App Router
- **React 19** et React Server Components
- **TypeScript** pour le typage statique
- **Tailwind CSS 4** pour le styling
- **shadcn/ui** pour les composants UI
- **Framer Motion** pour les animations
- **Recharts** pour les visualisations
- **TanStack Query** pour la gestion des données
- **Zustand** pour le state management

### Backend
- **Node.js** runtime avec **Bun**
- **Prisma ORM** pour la base de données
- **PostgreSQL** (Supabase)
- **NextAuth.js** pour l'authentification
- **bcryptjs** pour le hachage des mots de passe
- API Routes Next.js

### Base de Données
- PostgreSQL hébergé sur Supabase
- Schéma Prisma avec 20+ modèles
- Migrations gérées via Prisma Migrate

## 🚀 Démarrage Rapide

### Prérequis
- Node.js 18+ ou Bun 1.0+
- PostgreSQL (local ou Supabase)
- Clés d'environnement configurées

### Installation

```bash
# Cloner le repository
git clone <repository-url>
cd sect-app

# Installer les dépendances
bun install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos credentials Supabase

# Générer le client Prisma
bun run db:generate

# Appliquer les migrations
bun run db:migrate

# Seeder la base de données (optionnel)
curl -X POST http://localhost:3000/api/seed
```

### Développement

```bash
# Lancer le serveur de développement
bun run dev

# Accéder à l'application
http://localhost:3000
```

### Build & Production

```bash
# Build de production
bun run build

# Démarrer le serveur de production
bun run start
```

## 📁 Structure du Projet

```
sect-app/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # API Routes
│   │   │   ├── auth/         # Authentification
│   │   │   ├── users/        # Gestion utilisateurs
│   │   │   ├── epreuves/     # Évaluations
│   │   │   ├── questions/    # Questions
│   │   │   ├── sessions/     # Sessions de passation
│   │   │   ├── stats/        # Statistiques
│   │   │   ├── abonnements/  # Abonnements SaaS
│   │   │   └── ...
│   │   ├── layout.tsx        # Layout racine
│   │   └── page.tsx          # Page d'accueil
│   ├── components/           # Composants React
│   │   ├── admin/            # Composants Admin
│   │   ├── responsable/      # Composants Responsable
│   │   ├── enseignant/       # Composants Enseignant
│   │   ├── etudiant/         # Composants Étudiant
│   │   ├── layout/           # Layout components
│   │   ├── ui/               # UI components (shadcn)
│   │   └── ...
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utilitaires
│   └── stores/               # Zustand stores
├── prisma/
│   └── schema.prisma         # Schéma de base de données
├── public/                   # Assets statiques
├── .env                      # Variables d'environnement
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 🔐 Authentification

Le système utilise NextAuth.js avec une stratégie personnalisée :
- Login par email/mot de passe
- Rôles utilisateur (ADMIN, RESPONSABLE, ENSEIGNANT, ÉTUDIANT)
- Sessions persistantes
- Protection des routes par rôle

## 📊 Modèles de Données Principaux

- **User** : Utilisateurs avec rôles et relations
- **Etablissement** : Institutions éducatives
- **Filiere** : Programmes académiques
- **Epreuve** : Évaluations/examens
- **Question** : Questions avec types et difficultés
- **SessionPassation** : Tentatives d'évaluation
- **Reponse** : Réponses des étudiants
- **Resultat** : Résultats et feedbacks
- **Abonnement** : Abonnements SaaS
- **SecuritySettings** : Paramètres de sécurité

## 🔧 Scripts Disponibles

```bash
bun run dev                    # Serveur de développement
bun run build                  # Build de production
bun run start                  # Serveur de production
bun run lint                   # Linting
bun run db:push               # Push du schema Prisma
bun run db:generate           # Générer le client Prisma
bun run db:migrate            # Migrations de développement
bun run db:migrate:deploy     # Migrations de production
bun run db:reset              # Reset de la base de données
```

## 🌐 Déploiement

### Vercel (Recommandé)
```bash
# Déployer sur Vercel
vercel deploy
```

La configuration de production inclut :
- Build standalone avec Next.js
- Serverless functions pour les API routes
- Base de données PostgreSQL distante (Supabase)

## 📝 License

Propriétaire - Tous droits réservés

## 👥 Contributeurs

Développé par l'équipe SECT

---

**SECT** — Révolutionner l'évaluation dans l'enseignement supérieur grâce à l'IA.
