---
Task ID: 0
Agent: Main Orchestrator
Task: Phase 0 — Cadrage : Setup DB schema, architecture projet, layout principal

Work Log:
- Wrote complete Prisma schema with all entities: User, Document, Question, Epreuve, EpreuveQuestion, SessionPassation, Reponse, Resultat
- Added enums: Role, TypeQuestion, Difficulte, StatutAnalyse, StatutEpreuve, StatutSession
- Pushed schema to SQLite database with `bun run db:push`
- Created Zustand stores: auth-store.ts (auth state with login/logout) and navigation-store.ts (SPA navigation with role-based nav items)
- Created Providers component wrapping ThemeProvider + QueryClientProvider
- Updated root layout.tsx with providers, French locale, SECT metadata
- Created 4 dashboard components: AdminDashboard, ResponsableDashboard, EnseignantDashboard, EtudiantDashboard
- Created sidebar component with role-based navigation, user info footer, SECT branding
- Created header component with theme toggle, notifications, user dropdown
- Created AppLayout component with sidebar + header + content area
- Created LoginForm with validation, demo accounts, gradient background
- Created API routes: /api/auth/login, /api/auth/logout, /api/seed
- Updated page.tsx as SPA entry point (auto-seed → login → app)
- Installed bcryptjs for password hashing
- All dashboards use named exports and auth store for user info
- ESLint passes clean, dev server compiles successfully

Stage Summary:
- Complete database schema with 8 models and 6 enums
- 4 role-based dashboards with mock data and charts (recharts)
- Full SPA architecture with Zustand navigation
- Auth flow: login API → bcrypt verification → Zustand persist
- Demo accounts auto-seeded on first load
- All text in French, emerald/teal color scheme
