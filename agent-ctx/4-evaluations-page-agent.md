---
Task ID: 4
Agent: Evaluations Page Agent
Task: Create Évaluations monitoring page for the Responsable role

Work Log:
- Updated `/src/app/api/epreuves/route.ts` — added `filiereId` parameter to GET endpoint
  - Fetches epreuves that have sessions from students in the given filiere OR epreuves by enseignants in the same etablissement
  - Includes full session details with etudiant info for responsable supervision view
  - Deduplicates results that match both OR conditions
  - Returns questionCount and totalPoints computed fields

- Created `/src/components/evaluations/evaluations-page.tsx` — comprehensive Responsable evaluation monitoring page (~966 lines)
- Implemented header "Suivi des Évaluations" with ClipboardCheck icon + subtitle "Supervisez les épreuves de vos filières"
- Implemented stats cards (grid 2x2 on mobile, 4 cols on desktop):
  - Total évaluations (emerald border-l, ClipboardCheck icon)
  - En cours (emerald border-l, Activity icon)
  - Planifiées (amber border-l, Calendar icon)
  - Terminées (teal border-l, Trophy icon)
- Implemented filter toolbar:
  - Search input (searches title, description, enseignant name)
  - Statut filter Select (BROUILLON, PLANIFIEE, EN_COURS, TERMINEE, CLOTUREE)
  - Refresh button with spinner animation
  - Advanced filters toggle (chevron up/down) with Filière filter
  - Reset filters button when filters active
- Implemented evaluation cards (responsive 1-2 column grid):
  - Title, description (truncated, line-clamp-2)
  - Status badge (BROUILLON=gray, PLANIFIEE=amber "Planifiée", EN_COURS=emerald "En cours", TERMINEE=sky "Terminée", CLOTUREE=muted "Clôturée")
  - Enseignant name with User icon (teal)
  - Duration + date range (formatted in French)
  - Question count badge + total points badge
  - Participants count + completion rate badge
  - Alert count with AlertTriangle icon (amber)
  - Average score display (if TERMINEE/CLOTUREE) with color-coded value + percentage badge
  - Actions: "Voir les détails" (emerald outline), "Voir les résultats" (teal outline, only if completed)
- Implemented Evaluation Detail Dialog (sm:max-w-3xl):
  - Full epreuve info with enseignant name/email
  - Info grid: Duration, Questions, Points total, Participants (4 mini cards with border-l accents)
  - Date range display with creation date
  - Options badges (mélangées, retour bloqué)
  - Score distribution mini chart (custom CSS bar chart, 7 bins from 0-4 to 16-20)
  - Average / Median / Pass rate stats (3 colored boxes, only for TERMINEE/CLOTUREE)
  - Participant list with:
    - Student initials avatar + name + email
    - Score badge (color-coded)
    - Session status badge (En cours/Soumise/Corrigée/Non commencée)
    - Alert count per student
    - Expand/collapse for >5 participants
  - Loading skeleton state while fetching detail
- Implemented empty state with ClipboardCheck icon + contextual message
- Implemented loading skeleton with 4 animated cards
- All data fetched from GET `/api/epreuves?filiereId=xxx` (new endpoint)
- Detail fetched from GET `/api/epreuves/[id]`
- Filieres fetched from GET `/api/filieres` for advanced filter
- Uses `useAuthStore` for user.filiereId
- Wired EvaluationsPage into AppLayout page router (evaluations route for RESPONSABLE role)
- All text in French, emerald/teal color scheme (no indigo/blue)
- Toast notifications for errors
- ESLint passes clean (0 errors)
