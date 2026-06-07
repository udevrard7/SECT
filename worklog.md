# SECT Project - Technical Refactoring Worklog

---
Task ID: 3a
Agent: main
Task: Create src/middleware.ts for edge-level auth protection

Work Log:
- Created `/home/z/sect-project/src/middleware.ts` (90 lines)
- Uses `getToken()` from `next-auth/jwt` (edge-compatible, no DB access)
- Public path whitelist: /login, /invitation, /api/auth, /api/seed, /api/invitations/verify, /api/invitations/accept
- Unauthenticated API routes → 401 JSON response
- Unauthenticated page routes → redirect to /login with callbackUrl
- Inactive account check (token.actif === false) → 403 for API, redirect for pages
- Matcher excludes _next/static and _next/image
- Lint passes clean

Stage Summary:
- Edge-level auth protection now active for ALL routes
- No more unprotected API access without valid JWT

---
Task ID: 3b-3e
Agent: main
Task: Fix auth security vulnerabilities

Work Log:
- Fixed `/api/auth/change-password` - userId now derived from session via `getAuthenticatedUser()`, no longer from request body (IDOR vulnerability fixed)
- Fixed `/api/auth/logout` - userId now derived from session via `getAuthSession()`, no longer from request body
- Removed `loginPassword` from auth store - no more plaintext password stored in Zustand state
- Updated `ForceChangePasswordPage` - currentPassword field now starts empty, user must type it manually
- Updated `AuthenticatedLayout` - removed loginPassword from store destructuring and ForceChangePasswordPage props
- Deleted deprecated `src/lib/auth-middleware.ts` (vulnerable x-user-id/x-user-role header pattern)
- Deleted deprecated `src/lib/auth-helpers.ts` (vulnerable x-user-id/x-user-role header pattern)
- Deleted legacy `/api/auth/login/route.ts` (bypasses NextAuth session creation)
- Deleted legacy `/api/auth/login-student/route.ts` (bypasses NextAuth session creation)
- Lint passes clean

Stage Summary:
- IDOR vulnerability on password change fixed
- Plaintext password no longer stored in client-side state
- Vulnerable header-based auth code removed
- Legacy login routes removed

---
Task ID: 4a-4b
Agent: main
Task: Delete dead code and fix orphan routes

Work Log:
- Verified `app-layout.tsx` only imported by `page.tsx.bak` → deleted both
- Verified `navigation-store.ts` only imported by deleted `app-layout.tsx` → deleted
- Verified `responsable/rapports/page.tsx` duplicates `/rapports` route → deleted
- Verified `responsable/alertes/page.tsx` duplicates `/alertes` route → deleted
- Verified `responsable/habilitations/page.tsx` duplicates `/affectations` route → deleted
- Removed empty `responsable/` directory tree
- Lint passes clean

Stage Summary:
- 5 dead/orphan files removed
- All active routing uses URL-based App Router via catch-all `[...slug]` route
- No more standalone pages bypassing authenticated layout

---
Task ID: 5
Agent: main
Task: Setup Vitest + React Testing Library with basic unit tests

Work Log:
- Installed `@testing-library/user-event` (other test deps already present in package.json)
- Verified existing `vitest.config.ts` and `vitest.setup.ts` are correctly configured
- Verified `test` and `test:watch` scripts already exist in package.json
- Created `src/lib/__tests__/auth-session.test.ts` — 5 tests for `getAuthSession` and `isAuthError` helpers with mocks for next-auth, auth options, and db
- Created `src/lib/__tests__/routes.test.ts` — 9 tests for `getPageIdFromSlug`, `PAGE_ROUTES`, `ROUTE_TO_PAGE`, and `getDefaultRoute`
- Created `src/stores/__tests__/auth-store.test.ts` — 6 tests for auth store initial state, setUser, clearMustChangePassword, syncFromSession
- Fixed ROUTE_TO_PAGE inverse test: changed from asserting ROUTE_TO_PAGE is a perfect inverse of PAGE_ROUTES (which fails due to duplicate route mappings like niveaux/unites-enseignement → /programme-academique) to testing round-trip consistency (ROUTE_TO_PAGE[route] → pageId → PAGE_ROUTES[pageId] === route)
- All 37 tests pass across 6 test files (3 new + 3 pre-existing)

Stage Summary:
- Vitest + React Testing Library fully configured and operational
- 20 new unit tests added covering auth-session helpers, route utilities, and auth store
- Test command: `bun run test` (single run) or `bun run test:watch` (watch mode)
