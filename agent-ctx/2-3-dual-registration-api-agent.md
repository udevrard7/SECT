# Task 2-3: Dual Registration API System

## Summary
Implemented the complete dual user registration API system for the SECT platform.

## Files Modified
1. `/src/app/api/users/route.ts` - Added `mode: 'direct'` with auto-generated temp password, `mustChangePwd`, `matricule` support
2. `/src/app/api/invitations/route.ts` - Changed expiry from 7 days to 48 hours
3. `/src/app/api/auth/login/route.ts` - Added `mustChangePassword: true` flag when `user.mustChangePwd === true`

## Files Created
1. `/src/app/api/invitations/[id]/renvoyer/route.ts` - PATCH to resend/refresh expired invitation
2. `/src/app/api/auth/change-password/route.ts` - POST to change password with mustChangePwd auto-reset
3. `/src/app/api/invitations/verify/route.ts` - GET to verify invitation token and return details

## Key Patterns Used
- `db` from `@/lib/db`
- `bcrypt` from `bcryptjs`
- `NextRequest`/`NextResponse` from `next/server`
- `crypto.randomInt()` for secure password generation
- `params: Promise<{ id: string }>` for dynamic routes
- French error messages throughout
- AuditLog entries on all mutations
- `crypto.randomUUID()` for token generation

## Lint Status
✅ Zero errors
