# Task 2-a: Fix Dashboard Étudiant + Mes Résultats Page

## Summary
Fixed 5 bugs in student dashboard and Mes Résultats page where IA-generated epreuves (which store questions in JSONB `contenu` field instead of `EpreuveQuestion` join table) were not displaying data correctly.

## Files Modified
1. `src/app/api/stats/etudiant/route.ts` — Stats API
2. `src/app/api/resultats/route.ts` — Resultats API  
3. `src/components/passation/mes-resultats-page.tsx` — Frontend Mes Résultats page

## Changes Made

### Stats API (`/api/stats/etudiant/route.ts`)
- Added `contenu: true` to epreuvesAVenir query include
- Added `contenu: true` to sessionsCompletees epreuve select
- Added `resultat: { isNot: null }` to sessionsCompletees where clause
- Updated normalizedScores, evolutionScores, goodScoreSession, highScoreSession to use `contenu.baremeTotal` as fallback for totalPossible

### Resultats API (`/api/resultats/route.ts`)
- Added `contenu: true` to epreuve select
- Added contenu-based question extraction in response mapping when epreuve.questions is empty
- Builds proper EpreuveQuestion-like objects from contenu data

### Mes-resultats-page (`mes-resultats-page.tsx`)
- Added `EpreuveContenu` interface
- Added `contenu?: EpreuveContenu | null` to StudentSession epreuve type
- Added Path 2 (contenu-based) in dialogQuestionDetails between epreuve.questions and detailParQuestion
- Updated hasManualQuestions detection to also check contenu.questions (in both result list and dialog)

## Commits
- `6eaf0b3` — fix: student dashboard + mes resultats - support contenu-based IA epreuves
- `68b7ecd` — docs: add worklog for task 2-a

## Lint Status
✅ All files pass lint cleanly
