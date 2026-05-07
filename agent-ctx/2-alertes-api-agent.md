# Task ID: 2 — Alerte API Routes

## Agent: Alerte API Agent

## Task: Create API routes for the Alerte system

## Work Log

### Created `/src/app/api/alertes/route.ts`
- **GET /api/alertes** — Liste des alertes avec filtrage et pagination
  - Filtres supportés : `filiereId`, `epreuveId`, `severity`, `type`, `lue`, `resolu`, `userId`
  - Pagination : `page` (défaut 1), `limit` (défaut 50)
  - Inclut les relations : `filiere` (id, nom, code), `epreuve` (id, titre, statut), `user` (id, name, email, role)
  - Retourne des statistiques résumées : total, nonLues, nonResolues
  - Tri par `createdAt` décroissant
  - Gestion d'erreurs avec try/catch

- **POST /api/alertes** — Créer une nouvelle alerte
  - Champs obligatoires : `titre`, `description`
  - Champs optionnels : `severity` (défaut INFO), `type` (défaut CUSTOM), `filiereId`, `epreuveId`, `userId`
  - Validation des enums severity (CRITICAL/WARNING/INFO) et type (PERFORMANCE/FRAUDE/SYSTEME/RAPPEL/CUSTOM)
  - Vérification de l'existence des entités liées (filiere, epreuve, user) avant création
  - Retourne l'alerte avec relations incluses, status 201
  - Journal d'audit : `db.auditLog.create` avec action CREATE, entite Alerte, détails JSON

### Created `/src/app/api/alertes/[id]/route.ts`
- **GET /api/alertes/[id]** — Détail d'une alerte
  - Inclut relations enrichies : filiere avec etablissement, epreuve avec enseignant, user avec filiere
  - Marque automatiquement l'alerte comme lue si elle ne l'est pas encore
  - Journal d'audit pour la lecture (action READ)
  - Retourne 404 si non trouvée

- **PATCH /api/alertes/[id]** — Mise à jour d'une alerte
  - Actions spécifiques via `action` :
    - `marquer_lue` — Marquer comme lue
    - `marquer_non_lue` — Marquer comme non lue
    - `resoudre` — Marquer comme résolue (et lue automatiquement)
    - `rouvrir` — Rouvrir une alerte résolue
  - Mise à jour générale des champs : titre, description, severity, type, lue, resolu, filiereId, epreuveId, userId
  - Validation des enums severity et type
  - Vérification de l'existence des entités liées si mises à jour
  - Journal d'audit avec anciennes et nouvelles valeurs

- **DELETE /api/alertes/[id]** — Supprimer une alerte
  - Confirmation requise via query param `?confirm=true`
  - Retourne un aperçu de l'alerte si confirmation manquante
  - Journal d'audit avant suppression avec détails complets
  - Retourne 404 si non trouvée

## Code Style
- Utilise `import { db } from '@/lib/db'` pour la base de données
- Utilise `NextResponse` de 'next/server'
- Tous les commentaires et messages d'erreur en français
- Gestion d'erreurs systématique avec try/catch
- Journal d'audit pour chaque opération (CREATE, READ, UPDATE, DELETE)
- Pattern `params: Promise<{ id: string }>` conforme à Next.js 16

## Lint
- ESLint passes clean (0 errors)
