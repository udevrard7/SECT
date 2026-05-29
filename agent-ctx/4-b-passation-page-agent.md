# Task 4-b: Passation Page Agent

## Task
Create the critical student exam-taking interface (`passation-page.tsx`) for the SECT platform.

## Work Completed

### File Created
- `/home/z/my-project/src/components/passation/passation-page.tsx` (~1200 lines)

### File Modified
- `/home/z/my-project/src/components/layout/app-layout.tsx` — Added PassationPage import and routing for 'passation' page

### Architecture
3-state component with `ExamPhase` type:
1. **pre-exam** — Consent screen with exam info, rules, checkbox, start button
2. **in-exam** — Full-screen exam interface with timer, question nav, anti-cheat
3. **post-exam** — Submission confirmation with stats

### Key Features
- **Timer**: Countdown from session.dateDebut + epreuve.duree, HH:MM:SS format, red+pulse when <10min, auto-submit on expiry
- **Auto-save**: Every 30s batch save, also on question navigation, PUT `/api/sessions/[id]`
- **Anti-cheat**: Fullscreen enforcement, tab switch detection, paste prevention on QRC/TRS, right-click block, keyboard shortcut block
- **Question types**: QCU (radio), QCM (checkbox), QRC (textarea+no-paste), TRS (large textarea+no-paste)
- **Navigation**: Collapsible sidebar with question grid, color-coded boxes (answered/current/flagged/unanswered)
- **Session resume**: On mount, checks for existing EN_COURS session, loads answers and resumes timer
- **Mobile**: Responsive with overlay sidebar

### API Endpoints Used (backend needed)
- GET `/api/epreuves/${epreuveId}` — Epreuve info
- GET `/api/epreuves/${epreuveId}/questions` — Questions list
- GET `/api/sessions?etudiantId=xxx&epreuveId=xxx` — Find existing session
- POST `/api/sessions` — Create new session
- PUT `/api/sessions/${id}` — Save answers / log alerts
- GET `/api/sessions/${id}/reponses` — Load existing answers
- POST `/api/sessions/${id}/submit` — Submit exam

### Verification
- ESLint passes clean
- Dev server compiles successfully
