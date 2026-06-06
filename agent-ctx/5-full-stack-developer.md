# Task 5 - Niveaux d'étude Page

## Summary
Created the Niveaux d'étude page for the Responsable des études role at `/home/z/my-project/src/components/responsable/niveaux-page.tsx`.

## What was done
1. Created `niveaux-page.tsx` (~640 lines) with all required sections:
   - Header with Layers icon, title, description, and "Ajouter un niveau" button
   - Overview grid of 6 Niveau cards (L1, L2, L3, M1, M2, Doctorat) with responsive layout (2→3→6 cols)
   - Each card shows: label, # filières, # UEs, # enseignants, coverage progress bar with color coding
   - Filière-Niveau matrix table with sticky left column, color-coded cells
   - Summary stats row (4 cards)
   - Add Niveau dialog (creates UEs to associate niveaux with filières)
   - Niveau detail dialog showing UEs grouped by filière with affectation info

2. Wired component into `app-layout.tsx`:
   - Added import for NiveauxPage
   - Replaced PlaceholderPage route for 'niveaux' with `<NiveauxPage />`

3. Lint passes cleanly. No new API routes needed.

## Key files
- `src/components/responsable/niveaux-page.tsx` (new)
- `src/components/layout/app-layout.tsx` (modified)

## Data flow
- Fetches from `/api/filieres?responsableId={userId}`
- Fetches from `/api/unites-enseignement?responsableId={userId}`
- Fetches from `/api/affectations?responsableId={userId}`
- All statistics computed client-side with useMemo
