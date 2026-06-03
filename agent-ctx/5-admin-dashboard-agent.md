---
Task ID: 5-admin
Agent: Admin Dashboard Agent
Task: Refactor the Admin Dashboard with real data from API and advanced statistics

Work Log:
- Rewrote `/src/components/dashboard/admin-dashboard.tsx` — full admin dashboard with real API data (~460 lines)
- Replaced all hardcoded mock data with fetch from `GET /api/stats/admin`
- Added loading skeleton states for all sections
- Added error handling with sonner toast

- Section 1 — Welcome: User name + "Administrateur" badge (red #dc2626)
- Section 2 — 5 Stats Cards with left border accent:
  - Total utilisateurs (Users, #10b981)
  - Établissements (Building2, #f59e0b)
  - Évaluations (ClipboardCheck, #14b8a6)
  - Questions en banque (Library, #059669)
  - Documents (FileText, #0d9488)
  - NO fake change % — real data only
- Section 3 — Two Pie/Donut Charts:
  - Utilisateurs par rôle: recharts PieChart, colors ADMIN=#ef4444, RESPONSABLE=#f59e0b, ENSEIGNANT=#10b981, ETUDIANT=#14b8a6
  - Questions par type: recharts PieChart, colors QCU=#10b981, QCM=#14b8a6, QRC=#059669, TRS=#0d9488
  - Custom label with count + percentage, legend below
- Section 4 — Tendances de création (Area Chart):
  - recharts AreaChart with 3 overlaid areas
  - Colors: utilisateurs=#10b981, questions=#14b8a6, epreuves=#f59e0b
  - French month formatting ("Jan 2026", "Fév 2026" etc.)
  - Custom tooltip, legend
- Section 5 — Two-column layout:
  - Left (60%) — Activité récente: timeline with icon by type (UserPlus/ClipboardCheck/FileText), color-coded, separator, max 8 items with scroll
  - Right (40%) — Épreuves par statut: horizontal BarChart, colors BROUILLON=#6b7280, PLANIFIEE=#f59e0b, EN_COURS=#10b981, TERMINEE=#0ea5e9, CLOTUREE=#64748b
- Section 6 — Global Stats Card: Taux de réussite global (tauxReussiteGlobal%) with large emerald number, gradient card background

- All text in French, emerald/teal color palette (NO indigo/blue)
- Uses useAuthStore for user info
- Responsive design (mobile-first)
- Named export: `export function AdminDashboard()`
- StatCard component defined locally
- French month helper array included
- ESLint passes clean, dev server compiles successfully
