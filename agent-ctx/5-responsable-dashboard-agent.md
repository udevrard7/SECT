# Task 5-responsable: Refactor Responsable Dashboard

## Summary
Completely rewrote `/src/components/dashboard/responsable-dashboard.tsx` from hardcoded mock data to a real-data-driven dashboard with advanced charts.

## Changes Made

### File: `/src/components/dashboard/responsable-dashboard.tsx`
- **Complete rewrite** (~400 lines) replacing all hardcoded mock data with API-fetched real data
- Export remains: `export function ResponsableDashboard()` (named export)
- `'use client'` component as required

### Dashboard Sections Implemented:

1. **Welcome Section** — User name from `useAuthStore` + amber (#d97706) "Responsable de filière" badge

2. **Stats Cards Row (4 cards)** with left border accent colors:
   - Étudiants inscrits (GraduationCap, emerald #10b981) — nbEtudiants
   - Évaluations réalisées (ClipboardCheck, teal #14b8a6) — nbEvaluations
   - Taux de réussite (TrendingUp, amber #f59e0b) — tauxReussiteGlobal%
   - Moyenne générale (BarChart3, emerald #059669) — moyenneGenerale/20
   - No fake change % — real data with descriptive sub-text

3. **Résultats par matière (60%) + Alertes (40%)**:
   - Bar Chart with two bars: Moyenne (emerald), Taux réussite % (teal)
   - Abbreviated X-axis labels, custom tooltip showing enseignant name
   - Alertes list with severity-based styling (critical=red, warning=amber, info=sky)
   - Empty states for both sections

4. **Répartition des notes (50%) + Étudiants par filière (50%)**:
   - Histogram with color-coded bars per note range (red/amber/emerald/teal)
   - Custom tooltip showing student count per range
   - Donut/Pie chart with emerald/teal/amber tones
   - Labels with count, legend below

5. **Évolution des moyennes (50%) + Top enseignants (50%)**:
   - Line chart with emerald line, dots, area fill gradient
   - French month formatting (Jan 2026, Fév 2026, etc.)
   - Y-axis domain [0, 20]
   - Top enseignants ranked list (max 5)
   - Rank badges (gold 1/2/3), color-coded taux badges (>=70% emerald, >=50% amber, <50% red)
   - Color-coded moyenne badges

### Technical Details:
- Fetches from `GET /api/stats/responsable?filiere={optional}` using user's filiere
- Loading skeleton state (DashboardSkeleton component)
- Empty states for all chart sections
- Error toast via sonner
- All text in French
- Emerald/teal/amber color palette only (no indigo/blue)
- Responsive design (mobile-first grid layouts)
- Custom tooltips for all charts (SubjectTooltip, NotesTooltip, EvolutionTooltip)
- API endpoint already existed and was unchanged

### Verification:
- ESLint passes clean (0 errors)
- Dev server compiles successfully
