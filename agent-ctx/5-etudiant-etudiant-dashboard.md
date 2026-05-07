# Task 5-etudiant: Refactor Etudiant Dashboard with Real API Data

## Agent: Etudiant Dashboard Agent

## Work Log:

- Completely rewrote `/src/components/dashboard/etudiant-dashboard.tsx` (~710 lines)
- Removed all hardcoded mock data; replaced with real API fetch
- Fetches from `GET /api/stats/etudiant?userId={userId}` on mount via useEffect
- Keeps named export `export function EtudiantDashboard()`
- 'use client' component

### Dashboard Sections Implemented:

**1. Welcome Section**
- User name from auth store + "Étudiant" badge (emerald)

**2. Session en cours Banner**
- Conditional emerald-bordered card at top (only shown if `sessionEnCours` exists)
- Shows: "Vous avez une épreuve en cours : {epreuveTitre}"
- Start date formatted in French
- "Reprendre" button → `setCurrentPage('passation', { epreuveId })`

**3. Stats Cards Row (4 cards)** with left border accent:
- Épreuves à venir (CalendarDays, emerald #10b981) — `nbEpreuvesAVenir`
- Épreuves terminées (ClipboardCheck, teal #14b8a6) — `nbEpreuvesTerminees`
- Ma moyenne (GraduationCap, emerald #059669) — `moyenne/20`
- Meilleure note (Trophy, amber #f59e0b) — `meilleureNote/20`
- NO fake change percentages — just real data with descriptive subtitles

**4. Two-column: Épreuves à venir + Résultats récents**

Left — Épreuves à venir:
- Each exam card: title, date (French format), duration (min), teacher name, nb questions, total points
- "Commencer" button → `setCurrentPage('passation', { epreuveId })`
- Empty state: "Aucune épreuve à venir" with CalendarDays icon
- Max height with scroll overflow

Right — Résultats récents:
- Each result: colored score circle (green ≥10, amber ≥8, red <8), title, date, teacher
- Score displayed as "X.X/20" badge format
- Statut badge: "Corrigé" or "En attente"
- "Voir détail" button → `setCurrentPage('mes-resultats')`
- Empty state: "Aucun résultat" with Trophy icon

**5. Two-column: Charts**

Left — Évolution des scores (AreaChart with Line):
- recharts AreaChart with emerald area fill and gradient
- X axis: exam titles (abbreviated), Y axis: score /20
- Reference line at y=10 (passing score) in dashed red with "Moyenne" label
- Custom tooltip showing exam title, date, score/20
- Empty state when < 2 data points

Right — Performance par type de question (BarChart):
- recharts BarChart with colored bars per type
- Colors: QCU=#10b981, QCM=#14b8a6, QRC=#059669, TRS=#0d9488
- X axis: question types, Y axis: average score /20
- Round corners on bars (radius [6,6,0,0])
- Custom tooltip showing type, moyenne/20, nb responses
- Empty state when no data

### Technical Details:
- Uses `useAuthStore` for user ID
- Uses `useNavigationStore` for navigation (setCurrentPage)
- Fetch data on mount with useEffect + fetch, with cancellation support
- Loading skeleton while data is loading (DashboardSkeleton component)
- Empty states for all sections
- Error handling with sonner toast
- French date formatting: `toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })`
- Score color helper: green ≥10, amber ≥8, red <8
- StatCard component defined locally with subtitle instead of fake change %
- Responsive design (mobile-first, grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-4)
- Emerald/teal color palette only — NO indigo or blue
- All text in French
- ESLint passes clean (0 errors)
