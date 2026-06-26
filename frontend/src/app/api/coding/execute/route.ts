import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { withAuth } from '@/lib/auth-session'
import { EXECUTION_CONFIG, type CodingLanguage, type TestCase, type TestResult, type CodeExecutionResult, parseFunctionSignature } from '@/lib/coding-types'
import { validateCode } from '@/lib/code-sandbox-validator'

// ─── In-memory Rate Limiter ───

const executionTimestamps = new Map<string, number[]>()

function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const windowMs = 60_000 // 1 minute
  const maxExecutions = EXECUTION_CONFIG.maxExecutionsPerMinute

  const timestamps = executionTimestamps.get(userId) || []
  const recentTimestamps = timestamps.filter(t => now - t < windowMs)

  if (recentTimestamps.length >= maxExecutions) {
    const oldestInWindow = recentTimestamps[0]
    const retryAfterMs = oldestInWindow + windowMs - now
    return { allowed: false, retryAfterMs }
  }

  recentTimestamps.push(now)
  executionTimestamps.set(userId, recentTimestamps)

  // Clean up old entries periodically (prevent memory leak)
  if (Math.random() < 0.05) {
    for (const [key, ts] of executionTimestamps.entries()) {
      const filtered = ts.filter(t => now - t < windowMs)
      if (filtered.length === 0) {
        executionTimestamps.delete(key)
      } else {
        executionTimestamps.set(key, filtered)
      }
    }
  }

  return { allowed: true }
}

// ─── Handler ───

async function handler(
  request: NextRequest,
  context: { params: any; user: { id: string; email: string; name: string | null; role: string; actif: boolean; etablissementId: string | null; filiereId: string | null } }
) {
  const userId = context.user.id

  try {
    // ─── Rate limiting ───
    const rateCheck = checkRateLimit(userId)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Limite d'exécution atteinte. Réessayez dans ${Math.ceil((rateCheck.retryAfterMs || 5000) / 1000)}s.` },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateCheck.retryAfterMs || 5000) / 1000)) } }
      )
    }

    const body = await request.json()
    const { code, language, testCases, functionSignature } = body as {
      code: string
      language: CodingLanguage
      testCases: TestCase[]
      functionSignature?: string
    }

    // ─── Input validation ───
    if (!code || !language) {
      return NextResponse.json({ error: 'Code et langage requis' }, { status: 400 })
    }

    if (!testCases || !Array.isArray(testCases)) {
      return NextResponse.json({ error: 'Tests requis' }, { status: 400 })
    }

    // Validate code length
    if (code.length > EXECUTION_CONFIG.maxCodeLength) {
      return NextResponse.json(
        { error: `Code trop long (max ${EXECUTION_CONFIG.maxCodeLength} caractères)` },
        { status: 400 }
      )
    }

    // Validate test cases count
    if (testCases.length > EXECUTION_CONFIG.maxTestsPerExecution) {
      return NextResponse.json(
        { error: `Trop de tests (max ${EXECUTION_CONFIG.maxTestsPerExecution})` },
        { status: 400 }
      )
    }

    // ─── Pre-execution code validation (security layer 1) ───
    const validation = validateCode(code, language)
    if (!validation.safe) {
      return NextResponse.json({
        success: false,
        output: '',
        error: 'Code non autorisé pour des raisons de sécurité.',
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        testResults: testCases.map(tc => ({
          nom: tc.nom,
          passed: false,
          output: '',
          expected: tc.sortieAttendue,
          error: validation.errors.join('; '),
        })),
        totalTests: testCases.length,
        passedTests: 0,
      } as CodeExecutionResult & { validationErrors: string[]; validationWarnings: string[] })
    }

    // ─── Execute based on language ───
    let result: CodeExecutionResult

    switch (language) {
      case 'javascript':
      case 'typescript':
        result = executeJavaScriptSecure(code, testCases, functionSignature)
        break
      case 'python':
        result = await executePythonSandboxed(code, testCases, functionSignature)
        break
      case 'c':
      case 'java':
        result = {
          success: false,
          output: '',
          error: `L'exécution ${language.toUpperCase()} nécessite un environnement externe. Veuillez tester votre code localement.`,
          testResults: testCases.map(tc => ({
            nom: tc.nom,
            passed: false,
            output: '',
            expected: tc.sortieAttendue,
            error: 'Environnement d\'exécution non disponible côté serveur',
          })),
          totalTests: testCases.length,
          passedTests: 0,
        }
        break
      default:
        return NextResponse.json({ error: 'Langage non supporté' }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[coding/execute] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'exécution du code' },
      { status: 500 }
    )
  }
}

// ─── Secure JavaScript/TypeScript Execution ───
// Server-side execution with frozen context and blocked prototype chain

function executeJavaScriptSecure(
  code: string,
  testCases: TestCase[],
  functionSignature?: string
): CodeExecutionResult {
  const results: TestResult[] = []
  let allOutput = ''

  for (const tc of testCases) {
    const startTime = Date.now()
    try {
      const sigParsed = parseFunctionSignature(functionSignature || '')
      const funcNameFromSig = sigParsed?.funcName || null
      const funcNameRegex = new RegExp('(?:function\\s+(\\w+)|(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:function|\\())', 'm')
      const funcMatch = code.match(funcNameRegex)
      const funcNameFromCode = funcMatch ? (funcMatch[1] || funcMatch[2]) : null
      const funcName = funcNameFromSig || funcNameFromCode

      let fullCode: string
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

        fullCode = `
          ${code}
          ;// Test execution
          try {
            const _input = ${inputSerialized};
            const _result = ${funcName}(Array.isArray(_input) ? ..._input : _input);
            console.log(typeof _result === 'object' ? JSON.stringify(_result) : String(_result));
          } catch(e) {
            console.error('ERROR:', e.message);
          }
        `
      } else {
        fullCode = code
      }

      // ─── Secure sandbox: frozen context ───
      const output: string[] = []
      const mockConsole = {
        log: (...args: unknown[]) => { output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')) },
        error: (...args: unknown[]) => { output.push('ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')) },
        warn: (...args: unknown[]) => {},
      }

      // Create a deeply frozen null-prototype sandbox context
      // This prevents prototype chain escapes like: this.constructor.constructor('return process')()
      const nullProto = Object.create(null)
      const sandboxContext = Object.freeze({
        console: Object.freeze(mockConsole),
        require: undefined,
        process: undefined,
        global: undefined,
        globalThis: undefined,
        fetch: undefined,
        XMLHttpRequest: undefined,
        WebSocket: undefined,
        eval: undefined,
        Function: undefined,
        setTimeout: undefined,
        setInterval: undefined,
        __dirname: undefined,
        __filename: undefined,
        module: undefined,
        exports: undefined,
        Buffer: undefined,
      })

      // Use Function with Object.create(null) as this context
      // Pass all dangerous globals as parameters (set to undefined)
      const sandboxedFn = new Function(
        'console', 'require', 'process', 'global', 'globalThis',
        'fetch', 'XMLHttpRequest', 'WebSocket', 'eval', 'Function',
        'setTimeout', 'setInterval', '__dirname', '__filename',
        'module', 'exports', 'Buffer',
        `"use strict"; ${fullCode}`
      )

      // Call with null thisArg to prevent this.constructor escapes
      sandboxedFn.call(
        nullProto,
        sandboxContext.console,
        undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined,
        undefined, undefined, undefined,
      )

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
      const errMsg = error instanceof Error ? error.message : String(error)
      results.push({
        nom: tc.nom,
        passed: false,
        output: '',
        expected: tc.sortieAttendue,
        error: errMsg,
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

// ─── Secure Python Execution ───
// Uses subprocess with strict isolation, AST validation, and restricted builtins

async function executePythonSandboxed(
  code: string,
  testCases: TestCase[],
  functionSignature?: string
): Promise<CodeExecutionResult> {
  const results: TestResult[] = []
  let allOutput = ''

  const sigParsed = parseFunctionSignature(functionSignature || '')
  const funcName = sigParsed?.funcName || null

  // Create a temporary directory for execution
  const tmpDir = join(tmpdir(), `sect_python_${Date.now()}_${Math.random().toString(36).slice(2)}`)

  try {
    mkdirSync(tmpDir, { recursive: true })

    for (const tc of testCases) {
      const startTime = Date.now()
      const scriptFile = join(tmpDir, `test_${tc.nom.replace(/[^a-zA-Z0-9]/g, '_')}.py`)

      try {
        // ─── Build sandboxed Python script ───
        const sandboxedScript = buildSecurePythonScript(code, tc, funcName)

        // Write the sandboxed script
        writeFileSync(scriptFile, sandboxedScript, { encoding: 'utf-8' })

        // Execute with strict resource limits
        const timeout = Math.min(EXECUTION_CONFIG.timeout, 10000)
        const result = await executePythonProcess(scriptFile, tmpDir, timeout)

        if (result.timedOut) {
          results.push({
            nom: tc.nom,
            passed: false,
            output: '',
            expected: tc.sortieAttendue,
            error: `Timeout : l'exécution a dépassé ${timeout / 1000}s`,
            duration: timeout,
          })
          continue
        }

        const outputStr = result.stdout.trim()
        const errorStr = result.stderr.trim()
        const expectedStr = tc.sortieAttendue.trim()

        // Check for blocked operation errors
        if (errorStr.includes('BLOCKED:') || errorStr.includes('ImportError:') || errorStr.includes('is not allowed')) {
          results.push({
            nom: tc.nom,
            passed: false,
            output: '',
            expected: expectedStr,
            error: 'Opération non autorisée : ' + errorStr.split('\n').pop(),
            duration: Date.now() - startTime,
          })
          continue
        }

        // Check for other errors
        if (errorStr && !outputStr) {
          results.push({
            nom: tc.nom,
            passed: false,
            output: '',
            expected: expectedStr,
            error: errorStr.split('\n').pop() || errorStr,
            duration: Date.now() - startTime,
          })
          continue
        }

        const passed = normalizeOutput(outputStr) === normalizeOutput(expectedStr)

        results.push({
          nom: tc.nom,
          passed,
          output: outputStr,
          expected: expectedStr,
          error: passed ? undefined : (errorStr ? errorStr.split('\n').pop() : undefined),
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
  } finally {
    // Clean up temp directory
    try {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    } catch {
      // Ignore cleanup errors
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

// ─── Build a Secure Python Script ───
// Wraps student code with restricted builtins, blocked imports, and output capture

function buildSecurePythonScript(studentCode: string, tc: TestCase, funcName: string | null): string {
  const testCode = funcName
    ? `
import json as _json
_test_input = ${tc.entree}
try:
    if isinstance(_test_input, list):
        _test_result = ${funcName}(*_test_input)
    elif isinstance(_test_input, dict):
        _test_result = ${funcName}(**_test_input)
    else:
        _test_result = ${funcName}(_test_input)
    if isinstance(_test_result, (list, dict)):
        print(_json.dumps(_test_result, ensure_ascii=False))
    else:
        print(_test_result)
except Exception as _e:
    print(f"ERROR: {_e}", file=sys.stderr)
    sys.exit(1)
`
    : ''

  return `# ─── SECT Python Sandbox v2 ───
# Auto-generated secure execution wrapper

import sys as _sys
import json as _json

# ─── Block dangerous builtins ───
_BLOCKED_BUILTINS = frozenset({
    'eval', 'exec', 'compile', '__import__', 'open', 'input',
    'globals', 'locals', 'vars', 'dir', 'getattr', 'setattr', 'delattr',
    'breakpoint', 'exit', 'quit', 'memoryview',
})

# Create restricted builtins dict
_restricted_builtins = {}
for _name in dir(_sys.modules['builtins']):
    _value = getattr(_sys.modules['builtins'], _name)
    if _name in _BLOCKED_BUILTINS:
        def _blocked_func(*a, _n=_name, **kw):
            _sys.stderr.write(f"BLOCKED: {_n}() is not allowed in this environment\\n")
            raise RuntimeError(f"BLOCKED: {_n}() is not allowed")
        _restricted_builtins[_name] = _blocked_func
    else:
        _restricted_builtins[_name] = _value

# ─── Restrict imports to safe modules only ───
_ALLOWED_MODULES = frozenset({
    'math', 'random', 'string', 'collections', 'itertools', 'functools',
    'operator', 'decimal', 'fractions', 'statistics', 'datetime', 're',
    'json', 'copy', 'enum', 'typing', 'dataclasses', 'abc',
    'array', 'heapq', 'bisect', 'pprint', 'textwrap', 'unicodedata',
    'cmath', 'numbers', 'uuid',
})

_original_import = _sys.modules['builtins'].__import__

def _restricted_import(name, *args, **kwargs):
    _top_level = name.split('.')[0]
    if _top_level not in _ALLOWED_MODULES:
        raise ImportError(f"Module '{_top_level}' is not allowed for security reasons.")
    return _original_import(name, *args, **kwargs)

_restricted_builtins['__import__'] = _restricted_import

# ─── Apply restricted builtins ───
_sys.modules['builtins'].__dict__.update(_restricted_builtins)

# ─── Resource limits ───
_sys.setrecursionlimit(500)

# ─── Execute student code in restricted environment ───
_execution_error = None
try:
    exec(${JSON.stringify(studentCode)}, {'__builtins__': _restricted_builtins})
except Exception as _e:
    _execution_error = str(_e)

# ─── Execute test code if no error ───
if _execution_error is None:
    try:
        exec(${JSON.stringify(testCode)}, {'__builtins__': _restricted_builtins})
    except Exception as _e:
        _execution_error = str(_e)
`
}

// ─── Execute Python in a subprocess ───
// Uses execFile (not execSync) for better process control

function executePythonProcess(
  scriptFile: string,
  cwd: string,
  timeout: number
): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    // Build a minimal, secure environment
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH || '',
      HOME: cwd,
      NODE_ENV: process.env.NODE_ENV || 'production',
      PYTHONPATH: '',          // No extra Python paths
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONNOUSERSITE: '1',   // Don't add user site to path
      PYTHONDISABLEPYPREFIX: '1',
      // Explicitly remove access to env vars that contain secrets
    }

    // Do NOT pass DATABASE_URL, NEXTAUTH_SECRET, etc.
    // Only pass the minimal PATH needed for python3 to work

    const child = execFile(
      'python3',
      ['-S', '-E', scriptFile],  // -S = don't import site, -E = ignore PYTHON* env vars
      {
        timeout: timeout + 2000,
        maxBuffer: 1024 * 1024, // 1MB max output
        cwd,
        env,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error && error.killed) {
          resolve({ stdout: '', stderr: '', timedOut: true })
          return
        }
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          timedOut: false,
        })
      }
    )

    // Kill the process if it takes too long (belt and suspenders)
    setTimeout(() => {
      try {
        if (child.pid) {
          process.kill(child.pid, 'SIGKILL')
        }
      } catch {
        // Process may have already exited
      }
    }, timeout + 3000)
  })
}

// ─── Normalize output for comparison ───

function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, '\n').replace(/\n+/g, '\n').trim()
}

export const POST = withAuth(handler, ['ENSEIGNANT', 'ADMIN', 'RESPONSABLE', 'ETUDIANT'])
