---
Task ID: 1
Agent: Main
Task: Fix Python code execution and code submission during exam passation

Work Log:
- Explored entire code execution system: code-editor.tsx, execute API, submit route, grading
- Identified 6 critical issues: Pyodide never loaded, server Python is stub, gradeCODE never called, private tests never run, CODE not in grading scenario, C/Java non-functional
- Created `usePyodide` hook (src/hooks/use-pyodide.ts) that loads Pyodide from CDN lazily with singleton pattern
- Refactored `code-editor.tsx` to use Pyodide hook for Python execution in browser sandbox
- Rewrote `execute/route.ts` to execute Python via sandboxed subprocess (python3 with resource limits)
- Rewrote `submit/route.ts` to handle CODE grading: runs all tests (public+private) server-side, calls gradeCODE()
- Updated `detectGradingScenario` in grading.ts to include CODE as semi-auto-gradable
- Updated `onCodeChange` signature in code-editor.tsx to pass test results
- Updated passation-page.tsx to save test results with code answers
- Build compiles cleanly (npx next build succeeds)
- Lint passes with no errors
- Server runs and serves pages correctly

Stage Summary:
- Python code now executes in browser via Pyodide (loaded from CDN on demand)
- Python code also executes server-side via sandboxed subprocess for grading
- CODE questions are now auto-graded on exam submission using all tests
- "Submit" button in coding editor now runs tests before saving
- Grading scenario detection correctly identifies CODE as semi-auto-gradable
- Files modified: src/hooks/use-pyodide.ts (new), src/components/coding/code-editor.tsx, src/app/api/coding/execute/route.ts, src/app/api/sessions/[id]/submit/route.ts, src/lib/grading.ts, src/components/passation/passation-page.tsx

---
Task ID: 2
Agent: Main
Task: Fix correction page scroll issues, CODE question crashes, and redesign CODE question correction

Work Log:
- Fixed scroll issue: changed h-[calc(100vh-8rem)] to h-[calc(100vh-10rem)] and style attribute for proper height calculation
- Fixed ScrollArea scrollTo: now targets the Radix viewport via querySelector('[data-slot="scroll-area-viewport"]')
- Fixed parseAnswerContent: properly handles CodingAnswer JSON objects instead of crashing with JSON.stringify
- Added isCodingAnswer() helper to detect coding answers
- Integrated CodingCorrection component into "par copie" mode for CODE questions
- Added CODE-specific rendering in "par question" mode (code preview with language badge, test results, line count)
- Added semi-auto grading UI for CODE questions in "par question" mode (Auto+ badge, override score)
- Added semi-auto notice for CODE questions in "par copie" mode
- Updated correction API to include CODE fields (langage, fonctionSignature, testsPublics, testsPrives)
- Updated correction API to count CODE in auto-graded total
- Fixed CODE questions not requiring manual correction when auto-scored
- Added CODE to getQuestionTypeLabel()
- Separated isAutoGradedType() and isSemiAutoGradedType() in all conditional rendering
- Build compiles cleanly, lint passes

Stage Summary:
- Scroll fixed: proper viewport height calculation and ScrollArea viewport targeting
- CODE questions no longer crash: proper JSON parsing for CodingAnswer objects
- CodingCorrection component now integrated for rich CODE correction UI
- "Par question" mode shows compact code preview for CODE questions
- Correction API now provides CODE-specific fields
- CODE questions treated as semi-auto-gradable throughout
