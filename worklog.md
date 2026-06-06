---
Task ID: 1
Agent: Main Agent
Task: Fix premature session closure bug + Audit and improve Épreuves page

Work Log:
- Investigated the premature closure bug across 3 code locations
- Root cause: `checkAndAutoCloseEpreuve()` compared `submittedSessions === totalSessions`, but `totalSessions` only counts existing SessionPassation records. Since sessions are created on-demand when students start, the first student to submit triggers `1 === 1` → premature closure.
- Added `getEligibleStudentCount()` function that counts eligible students from User table based on epreuve's filiereId and groupesCibles (niveau)
- Fixed auto-closure logic in 3 places:
  1. `src/lib/auto-closure.ts` — Condition A now uses eligible student count
  2. `src/app/api/epreuves/auto-close/route.ts` — GET endpoint allSubmitted calculation fixed
  3. `mini-services/closure-watcher/index.ts` — Same fix for background watcher service
- Pushed fix to GitHub (auto-deploys to Vercel)

- Conducted full audit of epreuves-page.tsx (1788 lines)
- Applied 10 improvements:
  1. Fix hard-coded /20 score → now uses noteTotal/bareme sum
  2. Fix date validation in planifier form (dateDebut < dateFin, dates in future)
  3. Fix unsafe type casts (epreuve as Record<string, unknown>) → use interface fields directly
  4. Fix duplicate formatDate/formatDateTime → properly differentiated
  5. Add confirmation dialogs for Lancer, Terminer, Clôturer actions
  6. Fix silent error handling → show toast errors
  7. Replace native checkboxes with shadcn Checkbox component
  8. Add auto-refresh for EN_COURS monitoring (every 10s)
  9. Fix completion rate display clarity
  10. Remove unused imports
- Pushed improvements to GitHub

Stage Summary:
- Critical premature closure bug FIXED - now compares against eligible student count
- Épreuves page audited and improved with 10 fixes
- All changes lint cleanly and server compiles successfully
- Two commits pushed: b193c9d (closure fix) and 3ce4d21 (epreuves page improvements)

---
Task ID: 2-b
Agent: Main Agent
Task: Fix AI Generation — Enforce Teacher Parameters

Work Log:
- Identified 4 root causes for AI ignoring teacher parameters:
  1. Frontend defaults too high (5/3/2/1 = 11 total)
  2. Backend fallback defaults too high (3/2/2/1 = 8 total)
  3. AI prompt not forceful enough for exact counts
  4. Post-generation validation doesn't truncate to requested counts

- Fixed frontend defaults in `generation-ia-page.tsx`:
  - Changed qcuCount: 5→3, qcmCount: 3→2, qrcCount: 2→1, reflexionCount: 1→0
  - Total: 11→6 (more reasonable starting point)
  - Verified all inputs already allow min=0

- Fixed backend API in `route.ts` (4 changes):
  1. Changed fallback defaults: finalQRC 2→1, finalREFLEXION 1→0 (total 8→6)
  2. Added count enforcement logic after sanitization — truncates excess questions per type
  3. Added STRONG enforcement language in single-shot prompt after CRITIQUE line
  4. Added STRICT quantity enforcement language in batch prompt after CRITIQUE line
  5. Replaced all downstream `sanitizedQuestions` references with `finalQuestions`

- Lint passed cleanly
- Commit: 1e920ac — pushed to GitHub

Stage Summary:
- Frontend defaults reduced from 11 to 6 questions
- Backend defaults reduced from 8 to 6 questions
- Post-generation count enforcement ensures AI can't generate more than requested
- AI prompts strengthened with STRICT/EXACTEMENT language
- All changes lint cleanly

---
Task ID: 2-a
Agent: Main Agent
Task: Fix Dashboard Étudiant + Mes Résultats Page

Work Log:
- Analyzed 5 bugs in student dashboard and Mes Résultats page related to contenu-based (IA-generated) epreuves
- Root cause: IA-generated epreuves store questions in JSONB `contenu` field, not in `EpreuveQuestion` join table. All 3 files only queried the join table, causing empty data for IA exams.

- Fixed Bug 1: Stats API `/api/stats/etudiant/route.ts` — epreuvesAVenir query now includes `contenu: true`
- Fixed Bug 2: Stats API — sessionsCompletees now requires `resultat: { isNot: null }` to exclude sessions without proper correction
- Fixed Bug 3: Stats API — sessionsCompletees epreuve select now includes `contenu: true` for totalPossible computation
- Fixed Bug 4: Stats API — normalizedScores, evolutionScores, and badge calculations now use `contenu.baremeTotal` as fallback for totalPossible (before falling back to 20)
- Fixed Bug 5: Resultats API `/api/resultats/route.ts` — epreuve select now includes `contenu: true`
- Fixed Bug 6: Resultats API — response mapping extracts questions from contenu when epreuve.questions is empty, building proper EpreuveQuestion-like objects
- Fixed Bug 7: Mes-resultats-page `mes-resultats-page.tsx` — added `EpreuveContenu` interface and `contenu` field to StudentSession type
- Fixed Bug 8: Mes-resultats-page — dialogQuestionDetails now has 3 paths: epreuve.questions → contenu.questions → detailParQuestion
- Fixed Bug 9: Mes-resultats-page — hasManualQuestions detection now checks both epreuve.questions and contenu.questions (in result list and dialog)

Stage Summary:
- All 5 bugs fixed across 3 files
- Lint passes cleanly
- Commit: 6eaf0b3 — pushed to GitHub
