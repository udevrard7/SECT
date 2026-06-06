# Task 5: Student Devoirs/Soumissions Agent Work Record

## Work Completed

### 1. Navigation Store (`src/stores/navigation-store.ts`)
- Added `'mes-devoirs'` to `PageId` type union
- Added `{ id: 'mes-devoirs', label: 'Mes devoirs', icon: 'BookOpen' }` to ETUDIANT nav items (after 'mes-epreuves')

### 2. App Layout Router (`src/components/layout/app-layout.tsx`)
- Added import for `MesDevoirsPage` from `@/components/passation/mes-devoirs-page`
- Added `'mes-devoirs': 'Mes devoirs'` to PAGE_LABELS
- Added `'mes-devoirs': 'Consultez et soumettez vos devoirs'` to PAGE_DESCRIPTIONS
- Added routing: `if (currentPage === 'mes-devoirs') return <MesDevoirsPage />`

### 3. MesDevoirsPage Component (`src/components/passation/mes-devoirs-page.tsx`)
- Full student devoirs page with:
  - Stats cards (À faire, Brouillons, En retard, Soumis)
  - Tab navigation (À faire / Soumis)
  - Devoir cards showing: title, UE info, deadline, type badge, noteMax
  - Overdue devoirs highlighted in red with warning icon
  - Time remaining display
  - Draft indicator badge
  - Submit dialog with Textarea for contenuTexte and commentaireEtudiant
  - Save as draft (BROUILLON) and submit (SOUMIS) buttons
  - Detail dialog showing submission status, grade, teacher comments
  - Loading skeletons, empty states
  - Emerald/teal color scheme consistent with rest of app
  - Uses shadcn/ui components (Card, Badge, Button, Dialog, Textarea, Label, Tabs, etc.)

### 4. Devoirs API - etudiantId filter (`src/app/api/devoirs/route.ts`)
- Added `etudiantId` query parameter support to GET endpoint
- When etudiantId provided:
  - Finds student's filiereId
  - Finds UEs belonging to that filiere
  - Returns devoirs for those UEs with PUBLIE or FERME status
  - Includes student's existing soumission for each devoir
- Preserved all existing filter functionality (enseignantId, uniteEnseignementId, statut, anneeUniversitaire)

### Lint Results
- All changed files pass lint cleanly
- Pre-existing error in `src/app/api/questions/generate/route.ts` (unrelated to this task)
- Dev server running successfully on port 3000
