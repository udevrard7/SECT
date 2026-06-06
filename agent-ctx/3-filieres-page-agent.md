---
Task ID: 3
Agent: Filieres Page Agent
Task: Create comprehensive Filières management page for the Responsable role

Work Log:
- Updated `/src/app/api/filieres/route.ts` — Added `responsableId`, `niveau`, `actif` query parameter filters to GET endpoint
- Updated `/src/app/api/filieres/[id]/route.ts` — Added `etudiants` include with select (id, name, email, actif, createdAt) to GET detail endpoint for the detail dialog student list
- Created `/src/components/filieres/filieres-page.tsx` — Full-featured Filières management component (~932 lines)
- Implemented header with "Gestion des Filières" title + GraduationCap icon + subtitle (role-aware: different text for RESPONSABLE vs Admin)
- Implemented "Nouvelle filière" button (emerald)
- Implemented statistics cards (grid 2-4 cols): Total filières, Total étudiants, Filieres actives, With responsable assigned
- Implemented search/filter toolbar: Search input, Etablissement filter select (from API), Niveau filter select (L1-L3, M1, M2), Status filter (actif/inactif)
- Implemented filiere card grid (responsive 1-3 cols), each card showing:
  - Name, code badge (monospace), niveau badge (emerald for L*, teal for M*)
  - Etablissement name with Building2 icon
  - Responsable name (or "Non assigné" in amber italic)
  - Student count badge + nbEtudiants prévus
  - Description (truncated with line-clamp-2)
  - Active/inactive badge
  - Action buttons: Modifier (emerald), Toggle active (Power/PowerOff), Détails (teal)
- Implemented Create/Edit Dialog with fields:
  - Nom* (input), Code (input), Niveau (select: L1-L3, M1, M2), Etablissement* (select from API), Responsable (select from API users with RESPONSABLE role), Description (textarea), Nb étudiants (number), Actif checkbox
- Implemented Detail Dialog: Full filiere info (code, niveau, etablissement, statut, responsable, nb étudiants, date) + description + enrolled students list with initials avatar, name, email, actif badge
- Implemented Delete confirmation dialog (AlertDialog with soft delete notice)
- Implemented Loading skeleton (6 cards) and Empty state with GraduationCap icon
- Role-aware filtering: When logged-in user is RESPONSABLE, automatically adds `responsableId` filter to API calls so only their filières are shown. Admin can see all.
- Wired FilieresPage into AppLayout page router (filieres route)
- All text in French, emerald/teal color scheme (no indigo/blue)
- Toast notifications for all actions (create, update, toggle active, delete, errors)
- ESLint passes clean (0 errors)
