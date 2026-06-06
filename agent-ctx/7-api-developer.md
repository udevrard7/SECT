# Task 7 - API Developer Work Record

## Task: Create API routes for UniteEnseignement, Affectation, and updated stats

## Files Created:
1. `/src/app/api/unites-enseignement/route.ts` - GET (list with filters) + POST (create with validation)
2. `/src/app/api/unites-enseignement/[id]/route.ts` - GET (single with relations) + PATCH (update) + DELETE (soft delete)
3. `/src/app/api/affectations/route.ts` - GET (list with filters through UE relation) + POST (create with role + uniqueness validation)
4. `/src/app/api/affectations/[id]/route.ts` - PATCH (update with statut transition validation) + DELETE (PROVISOIRE only)

## Files Modified:
5. `/src/app/api/stats/responsable/route.ts` - Added 7 new metrics (nbUnitesEnseignement, nbAffectations, nbAffectationsValidees, tauxCouvertureAffectations, chargeEnseignants, affectationsParNiveau, affectationsParFiliere)

## Key Decisions:
- Used same patterns as existing routes (enseignant-filieres, filieres) for consistency
- Soft delete on UE (set actif=false) instead of hard delete
- Affectation statut transitions strictly enforced: PROVISOIRE → VALIDEE → PUBLIEE
- Only PROVISOIRE affectations can be deleted
- Filtration through UniteEnseignement for affectations by filiereId/niveau
- Stats use in-memory aggregation for teacher workload, coverage by niveau/filiere
- Lint passes cleanly
