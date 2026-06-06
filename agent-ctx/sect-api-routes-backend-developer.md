# Task: Create SECT Backend API Routes

## Agent: backend-developer

## Summary
Created all 6 API route files for the SECT project, plus 2 supporting library modules. All endpoints are tested and working.

## Files Created

### API Route Files
1. `/home/z/my-project/src/app/api/documents/upload/route.ts` — Multi-file upload (POST)
2. `/home/z/my-project/src/app/api/documents/route.ts` — List all documents (GET)
3. `/home/z/my-project/src/app/api/documents/[id]/route.ts` — Get/Delete single document (GET, DELETE)
4. `/home/z/my-project/src/app/api/documents/[id]/analyze/route.ts` — Re-analyze document (POST)
5. `/home/z/my-project/src/app/api/questions/generate/route.ts` — Generate questions (POST)
6. `/home/z/my-project/src/app/api/questions/route.ts` — List questions (GET)

### Supporting Library Modules
7. `/home/z/my-project/src/lib/text-extraction.ts` — Text extraction from PDF, DOCX, TXT, PPTX, XLSX
8. `/home/z/my-project/src/lib/ai-analyzer.ts` — AI document analysis and question generation using z-ai-web-dev-sdk

## Key Decisions
- Fixed `z-ai-web-dev-sdk` import: uses `ZAI.create()` with `client.chat.completions.create()` (not a named `chatCompletion` export)
- PPTX/XLSX extraction uses Python's zipfile module via child_process instead of adm-zip (which wasn't installed)
- Default user created in DB: `cmprenpi00000oqfy52ncb10e` (email: default@sect.edu) for enseignantId fallback
- Upload route supports multiple files via `formData.getAll('files')`
- Async document processing: upload triggers background text extraction + AI analysis
- All error messages are in French
- Route params use Next.js 16 Promise pattern: `{ params }: { params: Promise<{ id: string }> }`

## Test Results
- ✅ Multi-file upload: uploaded 2 files simultaneously
- ✅ Invalid file type: proper error response
- ✅ Document list: returns documents with question counts
- ✅ Single document GET: includes questions relation
- ✅ Document DELETE: removes file from disk and DB
- ✅ 404 handling: correct error for non-existent documents
- ✅ Re-analyze: successfully re-analyzes documents
- ✅ Question generation: generates QCM and QROC questions with AI
- ✅ Questions list: supports filtering by documentId
- ✅ Lint: 0 errors
