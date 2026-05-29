# Task 3 - Merge Niveaux + UE pages into one unified page

## Agent: full-stack-developer

## Summary
Merged the "Niveaux" page and "Unités d'Enseignement" page into a single unified page with dual view modes.

## Files Modified
1. `/home/z/sect-project/src/components/responsable/unites-enseignement-page.tsx` — Complete rewrite as unified page
2. `/home/z/sect-project/src/stores/navigation-store.ts` — Removed 'niveaux' from PageId and NAV_ITEMS
3. `/home/z/sect-project/src/components/layout/app-layout.tsx` — Removed NiveauxPage import, PAGE_COMPONENTS mapping, PAGE_LABELS entry
4. `/home/z/sect-project/src/components/layout/command-palette.tsx` — Removed niveaux command palette entry

## Files Not Modified (kept as-is per instructions)
- `/home/z/sect-project/src/components/responsable/niveaux-page.tsx` — Preserved but no longer imported/used

## Key Decisions
- Default view mode is "Vue Niveaux" (visual dashboard)
- View toggle uses simple Button group with LayoutGrid/List icons
- handleOpenAdd supports prefillNiveau/prefillFiliereId for matrix quick-add
- After CRUD operations, both fetchUEs() and fetchNiveauAffectations() are refreshed to keep both views in sync
- Auto-generate UE code suggestion carried over from niveaux-page
- Add UE dialog has "Comment ça marche" info box from niveaux-page
- Form field order: Filière+Niveau first (from niveaux-page UX), then Code+Nom

## Lint
- All lint checks pass with 0 errors
