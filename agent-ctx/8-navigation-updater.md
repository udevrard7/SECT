# Task 8: Navigation Store Update & Responsable Rename

## Summary
Updated navigation store with 3 new page IDs for Responsable des études role and renamed all "Responsable" / "Responsable de filière" references to "Responsable des études".

## Changes Made

### 1. `src/stores/navigation-store.ts`
- Added `niveaux`, `affectations`, `unites-enseignement` to PageId union type
- Changed RESPONSABLE nav: "Filières" → "Filières & Niveaux"
- Added 3 new nav items: niveaux (Layers), unites-enseignement (BookMarked), affectations (UserCheck)
- Full nav order: dashboard, filieres, niveaux, unites-enseignement, affectations, etudiants, enseignants, evaluations, rapports, alertes

### 2. `src/components/layout/app-layout.tsx`
- Added PAGE_LABELS for niveaux, unites-enseignement, affectations
- Added PAGE_DESCRIPTIONS for niveaux, unites-enseignement, affectations
- Added placeholder route handlers rendering PlaceholderPage for all 3 new pages

### 3. `src/components/layout/sidebar.tsx`
- Added Layers, UserCheck, BookMarked to ICON_MAP
- Changed ROLE_LABELS RESPONSABLE: "Responsable" → "Responsable des études"

### 4. `src/components/dashboard/responsable-dashboard.tsx`
- Changed badge text "Responsable de filière" → "Responsable des études" (2 occurrences)

### 5. `src/components/layout/header.tsx`
- Changed ROLE_LABELS RESPONSABLE: "Responsable" → "Responsable des études"

### 6. `src/components/auth/login-form.tsx`
- Changed demo account role: "Responsable" → "Responsable des études"

### 7. `src/components/utilisateurs/utilisateurs-page.tsx`
- Changed getRoleLabel RESPONSABLE: "Responsable" → "Responsable des études"

## Verification
- Lint passes cleanly with no errors
- No remaining "Responsable de filière" references in codebase
- Dev server running successfully
