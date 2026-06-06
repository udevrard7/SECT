# Task 9: Seed Route Update for UniteEnseignement, Affectation, and EnseignantFiliere

## Summary
Updated the seed route (`/src/app/api/seed/route.ts`) with demo data for the new Prisma models: UniteEnseignement, Affectation, and EnseignantFiliere.

## Changes Made

### Early Return Condition
- Added `existingUEs` and `existingAffectations` count checks to prevent premature early return when UE/affectation data doesn't exist yet
- Added both counts to the early return response JSON

### Section 11: Additional Enseignant Users
- Created 4 new ENSEIGNANT users at etablissement 1:
  - prof.gondo@sect.fr / Prof M Gondo
  - prof.dubois@sect.fr / Isabelle Dubois
  - prof.konate@sect.fr / Amadou Konaté
  - prof.petit@sect.fr / Claire Petit
- Created `enseignantUsers` array with `findEnseignant` helper for easy reference in later sections

### Section 12: UniteEnseignement Demo Data
- 11 UEs across 3 filieres with proper ECTS, volume horaire, semestre, niveau
- Idempotent via `findFirst({ where: { code, filiereId } })`
- `ueByCode` map stored for affectation seeding

### Section 13: Affectation Demo Data
- 17 affectations linking teachers to UEs with realistic typeSeance/volumeHeures/statut distribution
- Idempotent via `findFirst` with unique constraint fields

### Section 14: EnseignantFiliere Demo Data
- 11 entries linking teachers to filieres at specific niveaux
- Idempotent via `findFirst` with unique constraint (enseignantId + filiereId + niveau)

### Filiere Responsable Update
- respUser (Marie Laurent) now set as responsable of both filiere1 AND filiere2

## Files Modified
- `src/app/api/seed/route.ts`

## Lint Status
- Passes cleanly with no errors
