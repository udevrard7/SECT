# Task 3 - Backend Agent: Create AI Exam Generation API

## Task Summary
Create the AI-assisted exam generation API route and update existing epreuve routes.

## Files Created
- `/home/z/my-project/src/app/api/epreuves/generate/route.ts` — Core AI exam generation endpoint

## Files Modified
- `/home/z/my-project/src/app/api/epreuves/route.ts` — Added documentIds, generationMode, sourceDocuments support
- `/home/z/my-project/src/app/api/epreuves/[id]/route.ts` — Added sourceDocuments include and reponseCorrecte parsing

## Key Implementation Details

### POST /api/epreuves/generate
- **Auth**: `requireRole(request, ['ENSEIGNANT'])` + ownership check (enseignantId must match auth user)
- **Validation**: documentIds required, documents must belong to teacher and have ANALYSE status
- **Content**: Concatenates all `contenuTexte` with proportional truncation (max 15000 chars)
- **AI**: Uses `getAIProvider().chatCompletion()` with French prompt requesting structured JSON
- **DB**: Prisma `$transaction` for atomic creation of Epreuve + Questions + EpreuveQuestions + EpreuveDocuments
- **Mode**: Sets `generationMode: IA_ASSISTEE`
- **Response**: Complete epreuve with questions and sourceDocuments, all JSON fields parsed

### POST /api/epreuves (updated)
- Added `documentIds` field → creates EpreuveDocument records
- Added `generationMode` field (MANUELLE or IA_ASSISTEE, defaults to MANUELLE)
- Response now includes `sourceDocuments` with document info
- Response now parses JSON string fields (propositions, themes)

### GET /api/epreuves (updated)
- When fetching by enseignantId: includes `sourceDocuments` with document details
- Parses JSON string fields in response

### GET /api/epreuves/[id] (updated)
- Includes `sourceDocuments` with document details (including contenuTexte)
- Added `reponseCorrecte` and `explication` to question select
- Parses `reponseCorrecte` as JSON in response

## Verification
- `bun run lint` passes with no errors
- Dev server running normally (no errors in dev.log)
- Route reachable: GET /api/epreuves/generate returns 405 (POST-only)
