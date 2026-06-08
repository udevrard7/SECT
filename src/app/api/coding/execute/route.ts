import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { withAuth, AuthenticatedHandler } from '@/lib/auth-session'
import { EXECUTION_CONFIG, type CodingLanguage, type TestCase, type TestResult, type CodeExecutionResult, parseFunctionSignature } from '@/lib/coding-types'

/**
 * POST /api/coding/execute
 * Execute student code server-side in a sandboxed environment.
 *
 * Body: {
 *   code: string,
 *   language: CodingLanguage,
 *   testCases: TestCase[],
 *   functionSignature?: string
 * }
 */
async function handler(
  request: NextRequest,
  context: { params: any; user: { id: string; email: string; name: string | null; role: string; actif: boolean; etablissementId: string | null; filiereId: string | null } }
) {
  try {
    const body = await request.json()
    const { code, language, testCases, functionSignature } = body as {
      code: string
      language: CodingLanguage
      testCases: TestCase[]
      functionSignature?: string
    }

    if (!code || !language) {
      return NextResponse.json({ error: 'Code et langage requis' }, { status: 400 })
    }

    if (!testCases || !Array.isArray(testCases)) {
      return NextResponse.json({ error: 'Tests requis' }, { status: 400 })
    }

    // Validate code length (prevent abuse)
    if (code.length > 50000) {
      return NextResponse.json({ error: 'Code trop long (max 50 000 caractères)' }, { status: 400 })
    }

    // Execute based on language
    let result: CodeExecutionResult

    switch (language) {
      case 'javascript':
      case 'typescript':
        result = executeJavaScript(code, testCases, functionSignature)
        break
      case 'python':
        result = executePythonSandboxed(code, testCases, functionSignature)
        break
      case 'c':
      case 'java':
        // C/Java require external compiler — not available in this environment
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

/**
 * Execute JavaScript/TypeScript code server-side using a sandboxed approach.
 */
function executeJavaScript(
  code: string,
  testCases: TestCase[],
  functionSignature?: string
): CodeExecutionResult {
  const results: TestResult[] = []
  let allOutput = ''

  for (const tc of testCases) {
    const startTime = Date.now()
    try {
      // Try to extract function name from signature first, then from code
      const sigParsed = parseFunctionSignature(functionSignature || '')
      const funcNameFromSig = sigParsed?.funcName || null
      const funcNameRegex = new RegExp('(?:function\\s+(\\w+)|(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:function|\\())', 'm')
      const funcMatch = code.match(funcNameRegex)
      const funcNameFromCode = funcMatch ? (funcMatch[1] || funcMatch[2]) : null
      const funcName = funcNameFromSig || funcNameFromCode

      let fullCode: string
      if (funcName) {
        // Parse the input
        let inputArg: unknown
        try {
          inputArg = JSON.parse(tc.entree)
        } catch {
          inputArg = tc.entree
        }

        const inputSerialized = typeof inputArg === 'string' ? `"${inputArg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"` : JSON.stringify(inputArg)

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

      // Execute in a sandboxed way using Function constructor
      const output: string[] = []
      const mockConsole = {
        log: (...args: unknown[]) => { output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')) },
        error: (...args: unknown[]) => { output.push('ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')) },
        warn: (...args: unknown[]) => { output.push('WARN: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')) },
      }

      // Create a sandboxed function with blocked globals
      const sandboxedFn = new Function('console', 'require', 'process', 'global', 'fetch', 'XMLHttpRequest', 'eval', `"use strict"; ${fullCode}`)
      sandboxedFn(mockConsole, undefined, undefined, undefined, undefined, undefined, undefined)

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

/**
 * Execute Python code server-side in a sandboxed subprocess.
 * Uses python3 with resource limits and a temporary file.
 */
function executePythonSandboxed(
  code: string,
  testCases: TestCase[],
  functionSignature?: string
): CodeExecutionResult {
  const results: TestResult[] = []
  let allOutput = ''

  // Extract function name from signature using cross-language parser
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
        // Build test script
        let testScript: string

        if (funcName) {
          testScript = `${code}

import json
import sys

_test_input = ${tc.entree}
try:
    if isinstance(_test_input, list):
        _test_result = ${funcName}(*_test_input)
    elif isinstance(_test_input, dict):
        _test_result = ${funcName}(**_test_input)
    else:
        _test_result = ${funcName}(_test_input)
    if isinstance(_test_result, (list, dict)):
        print(json.dumps(_test_result, ensure_ascii=False))
    else:
        print(_test_result)
except Exception as _e:
    print(f"ERROR: {_e}", file=sys.stderr)
    sys.exit(1)
`
        } else {
          testScript = code
        }

        // Write the test script to a temp file
        writeFileSync(scriptFile, testScript, { encoding: 'utf-8' })

        // Execute with resource limits
        const timeout = Math.min(EXECUTION_CONFIG.timeout, 10000) // Max 10s per test
        let stdout: string
        let stderr: string

        try {
          stdout = execSync(
            `python3 -c "
import resource
resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024, 128 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_CPU, (${Math.ceil(timeout / 1000)}, ${Math.ceil(timeout / 1000) + 1}))
exec(open('${scriptFile}').read())
"`,
            {
              timeout: timeout + 2000, // Give 2s extra for process overhead
              maxBuffer: 1024 * 1024, // 1MB max output
              encoding: 'utf-8',
              cwd: tmpDir,
              env: {
                PATH: process.env.PATH || '',
                HOME: tmpDir,
                PYTHONPATH: '',
                PYTHONDONTWRITEBYTECODE: '1',
                PYTHONUNBUFFERED: '1',
              },
              stdio: ['pipe', 'pipe', 'pipe'],
            }
          )
          stderr = ''
        } catch (execError: any) {
          stdout = execError.stdout || ''
          stderr = execError.stderr || ''
          if (execError.killed) {
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
        }

        const outputStr = stdout.trim()
        const errorStr = stderr.trim()
        const expectedStr = tc.sortieAttendue.trim()

        // Check for ERROR in stderr
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

/**
 * Normalize output for comparison
 */
function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, '\n').replace(/\n+/g, '\n').trim()
}

export const POST = withAuth(handler, ['ENSEIGNANT', 'ADMIN', 'RESPONSABLE', 'ETUDIANT'])
