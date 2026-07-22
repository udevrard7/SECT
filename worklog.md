---
Task ID: SECU-SYNC-FIX
Agent: Main Agent
Task: Fix Admin /securite ↔ Responsable /parametres Sécurité synchronization and save error (403)

Work Log:
- Investigated Admin /securite page (securite-page.tsx) and Responsable /parametres Sécurité tab (responsable-parametres-page.tsx)
- Investigated backend endpoints: GET /api/security-settings, GET /api/security-settings/etablissement/{id}, PATCH /api/security-settings/etablissement/{id}
- Identified 3 root causes: RLS blocking ADMIN, GET returning single object instead of array, TanStack Query cache not synchronized
- Created DB migration 000102: SecuritySettings RLS policies aligned with Etablissement model (ADMIN = full access without etablissement_access condition)
- Fixed backend PATCH handler: removed admin_has_etablissement_access check for ADMIN (SECU-SYNC-FIX)
- Fixed backend GET /api/security-settings: now returns ALL settings as array with JOINed establishment info
- Fixed frontend securite-page.tsx: cross-invalidate ['responsable-security-settings', etabId] after save
- Fixed frontend responsable-parametres-page.tsx: cross-invalidate ['security-settings'] after save
- Applied DB migration 000102 to Neon database (version 101 → 102)
- Rebuilt backend binary and restarted
- Verified with Agent Browser: PATCH now returns 200 (was 403 before), overview table populated with data
- Pushed commit ae29688 to GitHub (main branch)

Stage Summary:
- Admin /securite page now works: can select establishment, load settings, toggle options, and save successfully
- Overview table shows all establishments' security settings with correct data
- Both pages (admin and responsable) will invalidate each other's cache on save → synchronization
- RLS policies aligned: ADMIN has full access to all SecuritySettings (like Etablissement_select)
