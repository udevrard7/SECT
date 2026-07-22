# Task 5: Fix 5 — seuilSimilarite Worker Post-Exam

## Summary
Implemented the similarity detection system between student exam copies. The `seuilSimilarite` setting now drives a post-exam worker that compares all student pairs after an exam closes.

## Files Created

### Backend (Go)
1. **`/home/z/SECT/backend/db/db/migrations/000100_create_similarity_report.up.sql`** — Migration creating `SimilarityReport` table with RLS policies
2. **`/home/z/SECT/backend/db/db/migrations/000100_create_similarity_report.down.sql`** — Rollback migration
3. **`/home/z/SECT/backend/internal/worker/similarity_worker.go`** — Worker that:
   - Runs every 5 minutes
   - Finds closed exams (CLOTUREE) with rapportFraude enabled
   - Compares all student pairs using:
     - QCU/QCM: Exact match (0.0 or 1.0)
     - QRC/TRS/REFLEXION: Trigram Jaccard similarity
     - CODE: Token-based Jaccard similarity
   - Computes weighted global similarity (by bareme)
   - Flags pairs above seuilSimilarite threshold
   - Inserts into SimilarityReport table

### Backend (Modified)
4. **`/home/z/SECT/backend/internal/transport/http/session_enhanced_handlers.go`** — Added:
   - Similarity reports in fraud report response (`similarities` key)
   - New `listSimilarityReports` handler for `/api/surveillance/{epreuveId}/similarities`
5. **`/home/z/SECT/backend/internal/transport/http/router.go`** — Added route `GET /api/surveillance/{epreuveId}/similarities`
6. **`/home/z/SECT/backend/cmd/api/main.go`** — Started SimilarityWorker

### Frontend (TypeScript/React)
7. **`/home/z/my-project/src/lib/surveillance-types.ts`** — Added types: `SimilarityReport`, `QuestionSimilarity`, `SimilarityResponse`, and `similarities` field to `FraudReport`
8. **`/home/z/my-project/src/components/surveillance/surveillance-page.tsx`** — Added:
   - "Similarité copies" tab (4th tab) with GitCompare icon
   - `SimilarityTab` component showing pair list with similarity scores
   - `SimilarityDetailDialog` with question-by-question breakdown
   - Similarity data fetching via TanStack Query
   - Red highlighting for flagged pairs

## Key Design Decisions
- Used `epreuve_etab_id()` function for RLS (Epreuve doesn't have direct etablissementId column)
- RLS follows existing patterns (EXISTS subqueries, same as EpreuveQuestion_select)
- Trigram similarity for text answers (QRC/TRS) — pure Go, no external NLP
- Token-based similarity for code answers
- Unique index on LEAST/GREATEST(sessionA, sessionB) prevents duplicate pairs

## Verification
- ✅ Go backend compiles (`go build ./cmd/api`)
- ✅ Frontend lints (`bun run lint` — 0 errors)
- ✅ Migration 000100 applied successfully
- ✅ Frontend synced to `/home/z/SECT/frontend/src/`
