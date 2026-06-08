'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Play,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  Loader2,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Code2,
} from 'lucide-react'
import {
  type CodingLanguage,
  type TestCase,
  type TestResult,
  type CodeExecutionResult,
  getCodingLanguageConfig,
  EXECUTION_CONFIG,
} from '@/lib/coding-types'

// Dynamic import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] bg-slate-950 rounded-lg border border-slate-800">
      <div className="flex flex-col items-center gap-2 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Chargement de l'éditeur...</span>
      </div>
    </div>
  ),
})

interface CodeEditorProps {
  language: CodingLanguage
  initialCode: string
  onChange: (code: string) => void
  readOnly?: boolean
  height?: string
  onSave?: () => void
}

export function CodeEditor({
  language,
  initialCode,
  onChange,
  readOnly = false,
  height = '400px',
  onSave,
}: CodeEditorProps) {
  const langConfig = getCodingLanguageConfig(language)
  const editorRef = useRef<any>(null)

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor
    // Add Ctrl+S save shortcut
    editor.addCommand(
      // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
      2048 | 49, // CtrlCmd + S
      () => {
        onSave?.()
      }
    )
  }

  return (
    <div className="rounded-lg overflow-hidden border border-slate-700 shadow-lg">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">{langConfig.icon}</span>
          <span className="text-xs font-medium text-slate-300">{langConfig.label}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-slate-600 text-slate-400">
            {langConfig.fileExtension}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        </div>
      </div>
      {/* Monaco Editor */}
      <MonacoEditor
        height={height}
        language={langConfig.monacoLang}
        value={initialCode}
        onChange={(value) => onChange(value || '')}
        onMount={handleEditorMount}
        theme="vs-dark"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: language === 'python' ? 4 : 2,
          wordWrap: 'on',
          padding: { top: 8, bottom: 8 },
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          folding: true,
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  )
}

// ─── Test Results Display ───

interface TestResultsDisplayProps {
  testResults: TestResult[]
  isPublic?: boolean
  showDetails?: boolean
}

export function TestResultsDisplay({ testResults, isPublic = true, showDetails = true }: TestResultsDisplayProps) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set())
  const passedCount = testResults.filter(t => t.passed).length

  const toggleTest = (nom: string) => {
    setExpandedTests(prev => {
      const next = new Set(prev)
      if (next.has(nom)) next.delete(nom)
      else next.add(nom)
      return next
    })
  }

  if (testResults.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        Aucun résultat de test
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Summary bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {isPublic ? 'Tests publics' : 'Tests complets'}
          </span>
          <Badge
            variant={passedCount === testResults.length ? 'default' : 'destructive'}
            className="text-[10px] h-5"
          >
            {passedCount}/{testResults.length} réussis
          </Badge>
        </div>
        <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              passedCount === testResults.length
                ? 'bg-emerald-500'
                : passedCount > 0
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${(passedCount / testResults.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Individual test results */}
      <ScrollArea className="max-h-64">
        <div className="space-y-1">
          {testResults.map((test, idx) => (
            <div key={test.nom + idx} className="rounded-md border overflow-hidden">
              <button
                onClick={() => showDetails && toggleTest(test.nom + idx)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                {test.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className="text-xs font-medium flex-1 truncate">{test.nom}</span>
                {test.duration != null && (
                  <span className="text-[10px] text-muted-foreground">{test.duration}ms</span>
                )}
                {showDetails && (
                  expandedTests.has(test.nom + idx) ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  )
                )}
              </button>
              {showDetails && expandedTests.has(test.nom + idx) && (
                <div className="px-3 pb-2 space-y-1 border-t bg-muted/20">
                  {test.description && (
                    <p className="text-[10px] text-muted-foreground pt-1">{test.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="font-medium text-muted-foreground">Attendu :</span>
                      <pre className="mt-0.5 p-1.5 bg-background rounded text-xs font-mono overflow-x-auto">
                        {test.expected}
                      </pre>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Obtenu :</span>
                      <pre className={`mt-0.5 p-1.5 bg-background rounded text-xs font-mono overflow-x-auto ${test.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                        {test.output || '(vide)'}
                      </pre>
                    </div>
                  </div>
                  {test.error && (
                    <div className="text-[10px] text-red-500 flex items-start gap-1 pt-1">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="font-mono">{test.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Full Coding Question Component (for Passation) ───

interface CodingQuestionStudentProps {
  questionId: string
  enonce: string
  langage: CodingLanguage
  codeInitial: string
  fonctionSignature: string
  testsPublics: TestCase[]
  bareme: number
  currentCode: string
  onCodeChange: (code: string) => void
  onSubmit: () => void
  isSubmitting?: boolean
  readOnly?: boolean
  securityConfig?: { blocageCopie?: boolean }
}

export function CodingQuestionStudent({
  questionId,
  enonce,
  langage,
  codeInitial,
  fonctionSignature,
  testsPublics,
  bareme,
  currentCode,
  onCodeChange,
  onSubmit,
  isSubmitting = false,
  readOnly = false,
  securityConfig,
}: CodingQuestionStudentProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [executionOutput, setExecutionOutput] = useState<string>('')
  const [executionError, setExecutionError] = useState<string>('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showOutput, setShowOutput] = useState(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSavedCodeRef = useRef<string>(currentCode)

  // Auto-save every 10 seconds
  useEffect(() => {
    if (readOnly) return

    autoSaveTimerRef.current = setInterval(() => {
      if (currentCode !== lastSavedCodeRef.current) {
        // Trigger auto-save by calling onCodeChange (parent handles the actual save)
        onCodeChange(currentCode)
        lastSavedCodeRef.current = currentCode
        setLastSaved(new Date())
      }
    }, EXECUTION_CONFIG.autoSaveInterval)

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
    }
  }, [currentCode, readOnly, onCodeChange])

  // Handle "Run" button - execute code with public tests
  const handleRun = useCallback(async () => {
    setIsRunning(true)
    setExecutionError('')
    setExecutionOutput('')

    try {
      // For JS/TS: use client-side execution
      if (langage === 'javascript' || langage === 'typescript') {
        const results = executeClientSideJS(currentCode, testsPublics, fonctionSignature)
        setTestResults(results.testResults)
        setExecutionOutput(results.output)
        if (results.error) setExecutionError(results.error)
      } else if (langage === 'python') {
        // For Python: attempt to use Pyodide if available, otherwise server-side
        const results = await executePythonClient(currentCode, testsPublics, fonctionSignature)
        setTestResults(results.testResults)
        setExecutionOutput(results.output)
        if (results.error) setExecutionError(results.error)
      } else {
        // For C/Java: use server-side API
        const response = await fetch('/api/coding/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: currentCode,
            language: langage,
            testCases: testsPublics,
            functionSignature: fonctionSignature,
          }),
        })
        const data: CodeExecutionResult = await response.json()
        setTestResults(data.testResults || [])
        setExecutionOutput(data.output || '')
        if (data.error) setExecutionError(data.error)
      }
      setShowOutput(true)
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : 'Erreur d\'exécution')
    } finally {
      setIsRunning(false)
    }
  }, [currentCode, langage, testsPublics, fonctionSignature])

  // Handle reset code to initial template
  const handleReset = useCallback(() => {
    onCodeChange(codeInitial)
    setTestResults([])
    setExecutionOutput('')
    setExecutionError('')
    setShowOutput(false)
  }, [codeInitial, onCodeChange])

  const langConfig = getCodingLanguageConfig(langage)

  return (
    <div className="space-y-4">
      {/* Problem description */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-violet-600" />
              <CardTitle className="text-sm font-semibold">Exercice de programmation</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                {langConfig.icon} {langConfig.label}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {bareme} pt{bareme > 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap">{enonce}</div>

          {/* Function signature */}
          <div className="mt-3 rounded-md bg-slate-100 dark:bg-slate-900 p-3 font-mono text-xs border border-slate-200 dark:border-slate-800">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Signature attendue</span>
            <pre className="mt-1 text-violet-700 dark:text-violet-300">{fonctionSignature}</pre>
          </div>
        </CardContent>
      </Card>

      {/* Code Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Éditeur de code</span>
            {lastSaved && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Save className="h-2.5 w-2.5" />
                Sauvegardé à {lastSaved.toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            disabled={readOnly}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Réinitialiser
          </Button>
        </div>

        <CodeEditor
          language={langage}
          initialCode={currentCode}
          onChange={onCodeChange}
          readOnly={readOnly}
          height="350px"
          onSave={() => {
            lastSavedCodeRef.current = currentCode
            setLastSaved(new Date())
          }}
        />
      </div>

      {/* Action buttons */}
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRun}
            disabled={isRunning || isSubmitting || !currentCode.trim()}
            className="gap-2"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isRunning ? 'Exécution...' : 'Exécuter'}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isRunning || isSubmitting || !currentCode.trim()}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isSubmitting ? 'Soumission...' : 'Soumettre'}
          </Button>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            Sauvegarde auto toutes les 10s
          </span>
        </div>
      )}

      {/* Execution output and test results */}
      {showOutput && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Play className="h-3.5 w-3.5" />
              Résultats d'exécution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Error display */}
            {executionError && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-xs font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Erreur d'exécution
                </div>
                <pre className="mt-1 text-xs font-mono text-red-600 dark:text-red-300 overflow-x-auto">
                  {executionError}
                </pre>
              </div>
            )}

            {/* Raw output */}
            {executionOutput && !executionError && (
              <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sortie console</span>
                <pre className="mt-1 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{executionOutput}</pre>
              </div>
            )}

            {/* Test results */}
            {testResults.length > 0 && (
              <TestResultsDisplay testResults={testResults} isPublic={true} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Client-side JavaScript Execution ───

function executeClientSideJS(
  code: string,
  testCases: TestCase[],
  functionSignature?: string
): CodeExecutionResult {
  const results: TestResult[] = []
  let allOutput = ''

  for (const tc of testCases) {
    const startTime = Date.now()
    try {
      const funcMatch = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\())/m)
      const funcName = funcMatch ? (funcMatch[1] || funcMatch[2]) : null

      let fullCode = code

      if (funcName) {
        let inputArg: unknown
        try {
          inputArg = JSON.parse(tc.entree)
        } catch {
          inputArg = tc.entree
        }
        const inputSerialized = typeof inputArg === 'string'
          ? `"${inputArg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
          : JSON.stringify(inputArg)

        fullCode = `${code}
        ;try {
          const _input = ${inputSerialized};
          const _result = ${funcName}(Array.isArray(_input) ? ..._input : _input);
          console.log(typeof _result === 'object' ? JSON.stringify(_result) : String(_result));
        } catch(e) {
          console.error('ERROR:', e.message);
        }`
      }

      const output: string[] = []
      const mockConsole = {
        log: (...args: unknown[]) => output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        error: (...args: unknown[]) => output.push('ERROR: ' + args.map(a => String(a)).join(' ')),
        warn: (...args: unknown[]) => {},
        info: (...args: unknown[]) => {},
      }

      const sandboxedFn = new Function('console', `"use strict"; ${fullCode}`)

      // Simple timeout simulation using Promise.race
      let timedOut = false
      const timeoutId = setTimeout(() => { timedOut = true }, EXECUTION_CONFIG.timeout)

      sandboxedFn(mockConsole)
      clearTimeout(timeoutId)

      if (timedOut) {
        results.push({
          nom: tc.nom,
          passed: false,
          output: '',
          expected: tc.sortieAttendue,
          error: `Timeout : l'exécution a dépassé ${EXECUTION_CONFIG.timeout / 1000}s`,
          duration: EXECUTION_CONFIG.timeout,
        })
        continue
      }

      const outputStr = output.join('\n').trim()
      const expectedStr = tc.sortieAttendue.trim()
      const passed = normalizeOutput(outputStr) === normalizeOutput(expectedStr)

      results.push({
        nom: tc.nom,
        passed,
        output: outputStr,
        expected: expectedStr,
        duration: Date.now() - startTime,
      })
      allOutput += (allOutput ? '\n' : '') + outputStr
    } catch (error) {
      results.push({
        nom: tc.nom,
        passed: false,
        output: '',
        expected: tc.sortieAttendue,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      })
    }
  }

  const passedTests = results.filter(r => r.passed).length
  return {
    success: passedTests === testCases.length,
    output: allOutput,
    testResults: results,
    totalTests: testCases.length,
    passedTests,
  }
}

// ─── Client-side Python Execution (Pyodide) ───

async function executePythonClient(
  code: string,
  testCases: TestCase[],
  functionSignature?: string
): Promise<CodeExecutionResult> {
  // Try to use Pyodide if available in the browser
  if (typeof window !== 'undefined' && (window as any).loadPyodide) {
    try {
      const pyodide = await (window as any).loadPyodide()
      const results: TestResult[] = []

      // Extract function name from signature
      const funcMatch = functionSignature?.match(/def\s+(\w+)/)
      const funcName = funcMatch?.[1]

      for (const tc of testCases) {
        const startTime = Date.now()
        try {
          let testCode = code
          if (funcName) {
            const inputArg = tc.entree
            testCode = `${code}\nimport json\n_input = ${inputArg}\ntry:\n    _result = ${funcName}(_input)\n    print(_result if not isinstance(_result, (list, dict)) else json.dumps(_result))\nexcept Exception as e:\n    print(f"ERROR: {e}")`
          }

          const output = pyodide.runPython(testCode)
          const outputStr = String(output || '').trim()
          const expectedStr = tc.sortieAttendue.trim()
          const passed = normalizeOutput(outputStr) === normalizeOutput(expectedStr)

          results.push({
            nom: tc.nom,
            passed,
            output: outputStr,
            expected: expectedStr,
            duration: Date.now() - startTime,
          })
        } catch (error) {
          results.push({
            nom: tc.nom,
            passed: false,
            output: '',
            expected: tc.sortieAttendue,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
          })
        }
      }

      const passedTests = results.filter(r => r.passed).length
      return {
        success: passedTests === testCases.length,
        output: results.map(r => r.output).join('\n'),
        testResults: results,
        totalTests: testCases.length,
        passedTests,
      }
    } catch (error) {
      // Pyodide failed, fall through to server-side
    }
  }

  // Fallback: use server-side execution API
  try {
    const response = await fetch('/api/coding/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: 'python', testCases, functionSignature }),
    })
    return await response.json()
  } catch (error) {
    return {
      success: false,
      output: '',
      error: 'Impossible d\'exécuter le code Python. Veuillez réessayer.',
      testResults: testCases.map(tc => ({
        nom: tc.nom,
        passed: false,
        output: '',
        expected: tc.sortieAttendue,
        error: 'Exécution non disponible',
      })),
      totalTests: testCases.length,
      passedTests: 0,
    }
  }
}

function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, '\n').replace(/\n+/g, '\n').trim()
}
