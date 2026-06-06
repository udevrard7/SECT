# Task 4 - frontend-fix-agent

## Task: Fix abonnements plan edit and add document delete

### Changes Made

1. **abonnements-page.tsx** - Fixed `handleSubmitPlan` function (lines 562-583):
   - When `editingPlan` is set: uses `PATCH /api/plans/${editingPlan.id}`
   - When `editingPlan` is null: uses `POST /api/plans`
   - Updated error message from "Erreur lors de la création du plan" to "Erreur lors de l'opération"
   - Updated toast: "Plan modifié" for edits, "Plan créé" for new plans

2. **documents-page.tsx** - Multiple changes:
   - Added AlertDialog component imports
   - Added `deleteTarget` and `isDeleting` state variables
   - Added `handleDeleteDocument` function (DELETE /api/documents/${id})
   - Updated `handleSelectDocument` to only block EN_COURS (previously blocked everything except ANALYSE/ERREUR)
   - Updated card cursor class logic for EN_ATTENTE support
   - Added EN_ATTENTE section in the detail sheet with Clock icon and pending message
   - Added destructive delete button in sheet actions area
   - Added AlertDialog confirmation dialog for delete

### Lint: Passes with zero errors
### Dev server: Running correctly on port 3000
