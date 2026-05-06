# Task 5-enseignant: Refactor Enseignant Dashboard

## Work Log

- Read worklog.md to understand full project context (SECT project, all prior tasks)
- Read existing `/src/components/dashboard/enseignant-dashboard.tsx` — had hardcoded mock data with fake change % indicators
- Read auth-store and navigation-store for integration
- Verified API endpoint `/api/stats/enseignant` already exists and returns the correct data structure
- Verified recharts is installed (^2.15.4) and all required shadcn/ui components exist
- Rewrote `enseignant-dashboard.tsx` completely with:

### Dashboard Sections Implemented:

1. **Welcome Section** — User name + "Enseignant" role badge (emerald)
2. **Stats Cards Row (4 cards)** — Left border accent, no fake % changes:
   - Mes documents (FileText, emerald #10b981) — nbDocuments
   - Questions générées (Sparkles, teal #14b8a6) — nbQuestionsTotal + sub-text "nbQuestionsValidees validées"
   - Épreuves actives (ClipboardPen, emerald #059669) — nbEpreuvesActives / nbEpreuves
   - En attente correction (Clock, amber #f59e0b) — nbCorrectionsEnAttente
3. **Quick Action Buttons** — Navigation wired:
   - "Nouveau document" → documents
   - "Générer des questions" → questions-ia
   - "Créer une épreuve" → epreuves
4. **Charts Row (60/40 split)**:
   - Performance par épreuve (BarChart, dual Y-axis: moyenne /20 + taux réussite %)
   - Questions par type (Donut/PieChart with custom legend showing count + percentage)
5. **Data Row (60/40 split)**:
   - Évaluations récentes (Table with status badges: BROUILLON/PLANIFIEE/EN_COURS/TERMINEE/CLOTUREE)
   - Corrections en attente (scrollable list with student name, subject badge, question preview, QRC/TRS type badge, "Corriger" button)
6. **Questions par difficulté** (Horizontal BarChart with color-coded bars: FACILE/MOYEN/DIFFICILE/EXPERT)

### Technical Details:
- Fetches from `GET /api/stats/enseignant?userId={userId}` on mount
- Loading skeleton (DashboardSkeleton) while data loads
- Toast errors via sonner on fetch failure
- All text in French
- Emerald/teal color palette ONLY — no indigo or blue
- Named export: `export function EnseignantDashboard()`
- 'use client' component
- Empty states for all sections with appropriate icons and CTAs
- Responsive design (mobile-first, grid breakpoints)
- ESLint passes clean (0 errors)
- Dev server compiles successfully
