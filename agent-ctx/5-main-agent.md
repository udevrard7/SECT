# Task 5 - Adapt Utilisateurs Page for ADMIN SaaS Model

## Summary
Modified `/home/z/my-project/src/components/utilisateurs/utilisateurs-page.tsx` to adapt the utilisateurs page for the ADMIN SaaS model where ADMIN only manages RESPONSABLE users.

## Changes Made (all conditional on `isAdmin`)
1. Header title: "Gestion des Utilisateurs" → "Gestion des Responsables" for admin
2. Header subtitle: adapted for admin context
3. Action buttons: text changed for admin, "Importer" hidden for admin
4. Stats bar 4th card: "Par rôle" → "Avec établissement" count for admin
5. Role filter: "Tous les rôles" → "Tous" for admin
6. Table: "Filière" column hidden for admin
7. Empty state: text adapted, Importer hidden for admin
8. Create/Edit dialog: titles adapted, Filiere field hidden in all 3 modes for admin
9. Added `avecEtablissementCount` computed stat

## Preserved
- RESPONSABLE behavior unchanged (manages ENSEIGNANT/ETUDIANT)
- `allowedCreateRoles` logic preserved (Admin → RESPONSABLE only)
- All existing role restriction logic intact

## Verification
- Lint passes on edited file
- Dev server compiles successfully
