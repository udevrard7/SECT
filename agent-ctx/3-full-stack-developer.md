# Task 3 - Update Admin Utilisateurs Page

## Summary
Updated `/src/components/utilisateurs/utilisateurs-page.tsx` to enforce role-based creation restrictions and add auth headers.

## Key Changes
1. **Role restriction**: ADMIN → RESPONSABLE only; RESPONSABLE → ENSEIGNANT/ETUDIANT only
2. **Etablissement required**: When creating RESPONSABLE, etablissement field is mandatory
3. **Auth headers**: All API calls now include `getAuthHeaders()` for server-side permission enforcement
4. **Enhanced toast**: Invitation toast includes establishment name for RESPONSABLE
5. **UI indicators**: Warning message shown when RESPONSABLE selected without etablissement

## Files Changed
- `/src/components/utilisateurs/utilisateurs-page.tsx`

## Lint Status
- Passes with zero errors
