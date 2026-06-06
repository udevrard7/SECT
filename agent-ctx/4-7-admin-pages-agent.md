---
Task ID: 4-7
Agent: Admin Pages Agent
Task: Create admin frontend pages for SECT application (Utilisateurs, Etablissements, Configuration, Logs)

Work Log:

- Updated Prisma schema: confirmed Etablissement, Filiere, AuditLog models already exist with proper named relations
- Ran `db:push` successfully — database already in sync
- Updated seed route (`/api/seed/route.ts`) to create demo etablissements, filieres, and audit logs with proper relation IDs
- Created 4 backend API routes:
  - `/api/users/route.ts` — GET (list with search/role/actif filters, pagination) + POST (create with bcrypt, audit log)
  - `/api/users/[id]/route.ts` — GET + PATCH (update with optional password, audit log) + DELETE (with audit log)
  - `/api/etablissements/route.ts` — GET (list with search/type/actif filters, _count for filieres/users) + POST (unique name check, audit log)
  - `/api/etablissements/[id]/route.ts` — GET (detail with filieres + users) + PATCH + DELETE
  - `/api/filieres/route.ts` — GET (list with etablissementId filter, include etablissement/responsable/_count)
  - `/api/logs/route.ts` — GET (list with action/entite/search/date filters, pagination)

- Created `/src/components/utilisateurs/utilisateurs-page.tsx` — full-featured user management (~430 lines):
  - Stats bar: Total utilisateurs, Actifs, Inactifs, Par rôle (4 cards with border-l accents)
  - Toolbar: search input, role filter Select, status filter Select, "Nouvel utilisateur" button
  - Data table with columns: Avatar (colored initials circle), Nom complet, Email, Rôle (colored Badge), Établissement, Filière, Statut (Actif/Inactif badge), Dernière connexion (relative date), Actions (DropdownMenu: Modifier, Désactiver/Activer, Supprimer)
  - Create/Edit User Dialog: name, email, password (only for create), role Select, etablissement Select (from API), filiere Select (filtered by etablissement, from API), actif Checkbox
  - Delete Confirmation AlertDialog with warning
  - Pagination controls at bottom
  - Loading skeletons, empty states, toast notifications
  - Responsive design (horizontal scroll on mobile for table)

- Created `/src/components/etablissements/etablissements-page.tsx` — etablissement management (~450 lines):
  - Stats bar: Total établissements, Actifs, Par type
  - Toolbar: search input, type filter Select
  - Card grid layout (1-3 columns): each card shows name, type badge, city/country, email, telephone, filiere count, user count, action buttons (Modifier, Désactiver/Activer, Détails)
  - Create/Edit Etablissement Dialog: nom, type Select, ville, pays (default France), telephone, email, siteWeb, adresse textarea
  - Detail View Dialog: full info, filieres list with cards, users list with roles
  - Delete Confirmation AlertDialog
  - Loading skeletons, empty states, toast notifications

- Created `/src/components/configuration/configuration-page.tsx` — system configuration (~350 lines):
  - Tab 1 Général: platform name (read-only "SECT"), description textarea, default language Select, academic year input
  - Tab 2 Sécurité: min password length, session timeout, max login attempts, password policy description, security summary card
  - Tab 3 Notifications: email notifications Switch, alert threshold, notification recipients
  - Tab 4 IA: default model Select, temperature Slider (0-2), max questions per doc, quality score threshold, IA summary card
  - Each tab has "Sauvegarder" button with loading state
  - Config stored in localStorage via zustand-compatible pattern
  - All text in French, emerald/teal color scheme

- Created `/src/components/logs/logs-page.tsx` — audit logs page (~310 lines):
  - Toolbar: date range filters (from/to date inputs), action filter Select, entity filter Select, search email input
  - Timeline-style list (NOT plain table): each entry is a card with action icon, action badge (color-coded: emerald CREATE, sky UPDATE, red DELETE, amber LOGIN, gray LOGOUT), entity + entity ID, user avatar + email, relative timestamp, details preview, expandable JSON section with Collapsible
  - Pagination at bottom
  - Stats summary badges
  - Loading skeletons, empty states

- Wired all 4 pages into AppLayout page router:
  - utilisateurs → UtilisateursPage
  - etablissements → EtablissementsPage
  - configuration → ConfigurationPage
  - logs → LogsPage

- ESLint passes clean (0 errors)
- All text in French, emerald/teal color scheme (no indigo/blue)
- Toast notifications for all CRUD actions and errors
- Responsive design with Tailwind responsive prefixes
