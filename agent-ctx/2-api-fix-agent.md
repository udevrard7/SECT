# Task 2 - API Fix Agent

## Summary
Fixed broken API routes and added auth middleware to the SECT project.

## Changes Made

### 1. Fixed `/src/app/api/documents/analyze/route.ts`
- Removed `@/lib/ai-analyzer` import (inconsistent JSON structure)
- Removed `@/lib/text-extraction` import and `extractTextFromFile()` filesystem call
- Replaced with `z-ai-web-dev-sdk` direct usage (same pattern as single-doc `[id]/analyze` route)
- Uses `contenuTexte` from database instead of reading from filesystem (Vercel-compatible)
- Batch processing loop logic preserved

### 2. Fixed `/src/app/api/auth/logout/route.ts`
- Implemented proper server-side logout (was a STUB)
- Accepts `userId` in request body
- Updates user's `derniereConnexion` timestamp
- Creates AuditLog entry with action 'LOGOUT', IP address, and user details
- Graceful error handling

### 3. Created `/src/lib/auth-helpers.ts`
- Exports `getUserFromRequest(request: NextRequest)` function
- Reads `x-user-id` and `x-user-role` headers from request
- Returns `{ userId, role }` or `null` if missing

### 4. Added auth checks to critical routes
- `/src/app/api/seed/route.ts` — ADMIN-only check
- `/src/app/api/db/push/route.ts` — ADMIN-only check
- Both return 403 for non-ADMIN users

### 5. Updated `/src/stores/auth-store.ts`
- Added `getAuthHeaders()` function (reads from localStorage/Zustand persist)
- Returns `{ 'x-user-id': userId, 'x-user-role': role }` headers
- Updated `logout` action to send userId in body and auth headers

## Verification
- `bun run lint` passes with zero errors
- Dev server running on port 3000
