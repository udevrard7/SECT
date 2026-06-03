---
Task ID: 5+6
Agent: Alertes & Rapports Pages Agent
Task: Create Alertes page and Rapports page for the Responsable role

Work Log:
- Created `/src/app/api/alertes/route.ts` — Alertes API (GET + POST)
  - GET: List alertes with filters (filiereId, severity, type, lue, search, limit, offset)
  - POST: Create new alerte with titre, description, severity, type, filiereId, epreuveId, userId
  - Includes relations: filiere, epreuve, user
- Created `/src/app/api/alertes/[id]/route.ts` — Single alerte API (PATCH + DELETE)
  - PATCH: Update alerte (mark lue, mark resolu)
  - DELETE: Delete alerte
- Created `/src/components/alertes/alertes-page.tsx` — Comprehensive Alertes & Notifications page (~480 lines)
  - Header with Bell icon + "Alertes et Notifications" title + subtitle
  - Stats cards (3 cols): Total alertes (emerald), Non lues (amber), Critiques (red)
  - Filter toolbar: Search, Severity filter (CRITICAL/WARNING/INFO), Type filter (PERFORMANCE/FRAUDE/SYSTEME/RAPPEL/CUSTOM), Lue filter (lue/non-lue)
  - Alert cards with: severity icon, severity badge, type badge, title, description, filiere name, epreuve name, relative timestamp, read/unread dot, resolved badge, action buttons (Mark as read, Resolve, View detail)
  - Bulk actions: "Tout marquer comme lu", "Tout résoudre"
  - Create Alert Dialog with: titre, description, severity select, type select, filiere select
  - Detail Sheet (side panel) with full alert info + actions
  - Fallback mechanism: if /api/alertes returns no data, generates dynamic alerts from /api/stats/responsable (low average = PERFORMANCE, stats alertes, upcoming exams = RAPPEL, system info = SYSTEME)
  - Loading skeleton and empty state
  - All text in French, emerald/teal color scheme (no indigo/blue)
- Created `/src/components/rapports/rapports-page.tsx` — Comprehensive Reports & Statistics page (~470 lines)
  - Header with BarChart3 icon + "Rapports et Statistiques" title + subtitle
  - Filière selector dropdown
  - Overview stats (4 cards): Moyenne générale, Taux de réussite, Nombre d'évaluations, Nombre d'étudiants
  - Charts section (2x2 grid using recharts):
    - Évolution des moyennes (AreaChart — monthly trend with emerald gradient)
    - Répartition des notes (BarChart — distribution by grade ranges with color-coded bars)
    - Résultats par matière (horizontal BarChart — average per epreuve)
    - Étudiants par filière (PieChart donut — student distribution)
  - Top 5 students section with rank badges, progress bars, score badges
  - Students needing attention section (below 10/20 average)
  - Top Enseignants section (5-card grid with initials, taux de réussite, trend icons)
  - Alertes summary section (from stats API)
  - Export CSV (functional — generates CSV blob and downloads)
  - Export PDF (placeholder with toast notification)
  - Loading skeleton and empty state
  - All text in French, emerald/teal color scheme (no indigo/blue)
- Wired both pages into AppLayout page router:
  - `alertes` → AlertesPage (Responsable route)
  - `rapports` → RapportsPage (Responsable route)
- ESLint passes clean (0 errors, 0 warnings)

Stage Summary:
- Complete Alertes page with CRUD operations, dynamic fallback generation, filtering, bulk actions
- Complete Rapports page with 4 chart types, student rankings, teacher performance, CSV export
- Both pages use existing /api/stats/responsable and /api/filieres APIs
- New /api/alertes and /api/alertes/[id] API routes created
- All text in French, emerald/teal color scheme, toast notifications
