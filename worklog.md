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
