# SECT — Système d'Évaluation Casse-Tête

[![Next.js](https://img.shields.io/badge/Next.js-16.1.1-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.0.0-blue?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6.11.1-green?logo=prisma)](https://www.prisma.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwind-css)](https://tailwindcss.com)
[![Bun](https://img.shields.io/badge/Bun-runtime-white?logo=bun)](https://bun.sh)

Plateforme d'évaluation en ligne propulsée par l'**Intelligence Artificielle** pour l'enseignement supérieur.

## 🎯 Fonctionnalités

### Multi-rôles & Permissions
- **ADMIN** : Gestion PaaS/SaaS des établissements, abonnements et paramètres de sécurité
- **RESPONSABLE** : Management des étudiants et enseignants, affectations, statistiques
- **ENSEIGNANT** : Création d'épreuves, questions, sessions d'évaluation
- **ÉTUDIANT** : Passation d'évaluations, consultation des résultats

### Gestion Académique
- 📚 Gestion des filières et niveaux d'étude (L1, L2, L3, M1, M2, Doctorat)
- 👥 Import massif d'utilisateurs via CSV
- 📊 Affectation des enseignants aux filières et niveaux
- 📈 Tableaux de bord statistiques par rôle

### Évaluations & Questions
- ✅ Types de questions variés : QCU, QCM, QRC, TRS
- 🎯 Niveaux de difficulté : Facile, Moyen, Difficile, Expert
- 📝 Création et gestion d'épreuves complètes
- ⏱️ Sessions de passation avec suivi en temps réel
- 🤖 Correction automatique assistée par IA

### Documents & Analyse
- 📄 Upload de documents (PDF, DOCX)
- 🔍 Analyse de documents avec extraction de contenu
- 📊 Génération automatique de questions à partir de documents

### PaaS/SaaS
- 🏢 Gestion multi-établissements
- 💳 Système d'abonnement (Gratuit, Essentiel, Professionnel, Entreprise)
- 🔒 Paramètres de sécurité configurables par établissement
- 📊 Monitoring et rapports d'activité

## 🛠️ Stack Technique

### Frontend
- **Next.js 16** avec App Router
- **React 19** avec hooks modernes
- **TypeScript** pour la typage statique
- **Tailwind CSS 4** pour le styling
- **Shadcn/ui** & **Radix UI** pour les composants
- **Framer Motion** pour les animations
- **Zustand** pour la gestion d'état
- **TanStack Query** pour le fetching de données
- **React Hook Form** + **Zod** pour les formulaires

### Backend
- **Next.js API Routes**
- **Prisma** comme ORM
- **PostgreSQL** (Supabase) comme base de données
- **bcryptjs** pour le hachage des mots de passe
- **NextAuth.js** pour l'authentification

### Outils & Bibliothèques
- **Bun** comme runtime JavaScript
- **date-fns** pour la manipulation de dates
- **Lucide React** pour les icônes
- **Recharts** pour les graphiques
- **@dnd-kit** pour le drag & drop
- **JSZip** pour la compression de fichiers
- **pdf-parse**, **mammoth** pour l'extraction de documents

## 📋 Prérequis

- [Bun](https://bun.sh/) (recommandé) ou Node.js 18+
- PostgreSQL (local ou Supabase)
- Git

## 🚀 Installation

### 1. Cloner le repository

```bash
git clone <repository-url>
cd <project-directory>
```

### 2. Installer les dépendances

```bash
bun install
```

### 3. Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet :

```env
# Supabase PostgreSQL
DATABASE_URL="postgresql://user:password@host:port/database"
DIRECT_URL="postgresql://user:password@host:port/database"
SUPABASE_URL="postgresql://user:password@host:port/database"

# NextAuth (optionnel pour authentification avancée)
NEXTAUTH_SECRET="votre-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Initialiser la base de données

```bash
# Générer le client Prisma
bun run db:generate

# Appliquer les migrations
bun run db:migrate

# Ou pousser le schema directement (développement)
bun run db:push
```

### 5. Lancer le serveur de développement

```bash
bun run dev
```

L'application sera disponible sur [http://localhost:3000](http://localhost:3000)

## 📁 Structure du Projet

```
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # API Routes
│   │   │   ├── auth/         # Authentification
│   │   │   ├── users/        # Gestion utilisateurs
│   │   │   ├── etablissements/
│   │   │   ├── filieres/
│   │   │   ├── epreuves/
│   │   │   ├── questions/
│   │   │   ├── sessions/
│   │   │   ├── resultats/
│   │   │   ├── abonnements/
│   │   │   └── security-settings/
│   │   ├── layout.tsx        # Layout principal
│   │   └── page.tsx          # Page d'accueil
│   ├── components/           # Composants React
│   │   ├── ui/               # Composants Shadcn/ui
│   │   ├── auth/             # Composants d'authentification
│   │   ├── layout/           # Layout (Sidebar, Header)
│   │   ├── dashboard/        # Tableaux de bord
│   │   └── ...               # Autres composants
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utilitaires et configurations
│   └── stores/               # Stores Zustand
├── prisma/
│   └── schema.prisma         # Schema de base de données
├── public/                   # Assets statiques
├── skills/                   # Modules AI/Skills
└── .env                      # Variables d'environnement
```

## 📖 Commandes Disponibles

```bash
# Développement
bun run dev              # Lancer le serveur de développement

# Build & Production
bun run build            # Compiler pour la production
bun run start            # Démarrer le serveur de production

# Base de données
bun run db:push          # Pousser le schema Prisma
bun run db:generate      # Générer le client Prisma
bun run db:migrate       # Exécuter les migrations
bun run db:migrate:deploy # Déployer les migrations en prod
bun run db:reset         # Réinitialiser la base de données

# Qualité de code
bun run lint             # Linter le code
```

## 🔐 Comptes de Démonstration

Après le premier lancement, la route `/api/seed` initialise automatiquement des données de démonstration.

Comptes disponibles (voir `/api/seed` pour les mots de passe) :
- Admin
- Responsable de filière
- Enseignant
- Étudiant

## 🌐 Déploiement

### Vercel (Recommandé)

Le projet est optimisé pour Vercel :

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel
```

### Docker

```bash
# Build de l'image
docker build -t sect-app .

# Lancer le conteneur
docker run -p 3000:3000 --env-file .env sect-app
```

## 📊 Modèle de Données

Le schema Prisma inclut les modèles principaux :

- **User** : Utilisateurs avec rôles (Admin, Responsable, Enseignant, Étudiant)
- **Etablissement** : Établissements scolaires
- **Filiere** : Filières de formation
- **NiveauEtude** : Niveaux L1-M2
- **Question** : Questions d'évaluation (QCU, QCM, QRC, TRS)
- **Epreuve** : Épreuves/examens
- **SessionPassation** : Sessions de passation
- **Resultat** : Résultats des évaluations
- **Abonnement** : Abonnements SaaS
- **Plan** : Plans tarifaires
- **SecuritySettings** : Paramètres de sécurité

## 🤝 Contribution

1. Fork le projet
2. Créez une branche (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Committez vos changements (`git commit -m 'Ajout nouvelle fonctionnalité'`)
4. Push vers la branche (`git push origin feature/nouvelle-fonctionnalite`)
5. Ouvrez une Pull Request

## 📝 License

Ce projet est sous license MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

Pour toute question ou problème :
- Ouvrez une issue GitHub
- Consultez la documentation dans le dossier `/docs`
- Contactez l'équipe de développement

## 🎨 Captures d'écran

_(À ajouter)_

---

**SECT** — Propulsé par l'IA pour révolutionner l'évaluation dans l'enseignement supérieur.
