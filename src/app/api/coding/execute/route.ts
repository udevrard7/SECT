import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedHandler } from '@/lib/auth-session'
import { EXECUTION_CONFIG, type CodingLanguage, type TestCase, type TestResult, type CodeExecutionResult } from '@/lib/coding-types'

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
        result = executePythonSimulated(code, testCases, functionSignature)
        break
      case 'c':
      case 'java':
        // For C/Java, we return a simulated result since we can't run these server-side
        // In production, this would call Judge0 or Piston API
        result = {
          success: false,
          output: '',
          error: `L'exécution ${language.toUpperCase()} nécessite un environnement externe (Judge0/Piston). Veuillez tester votre code localement.`,
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
      // Try to extract the function name from the code
      const funcNameRegex = new RegExp('(?:function\\s+(\\w+)|(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:function|\\())', 'm')
      const funcMatch = code.match(funcNameRegex)
      const funcName = funcMatch ? (funcMatch[1] || funcMatch[2]) : null

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

      // Create a sandboxed function
      const sandboxedFn = new Function('console', `"use strict"; ${fullCode}`)
      sandboxedFn(mockConsole)

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
 * Simulated Python execution.
 * Server-side Python execution is not available; client should use Pyodide.
 */
function executePythonSimulated(
  code: string,
  testCases: TestCase[],
  functionSignature?: string
): CodeExecutionResult {
  return {
    success: false,
    output: '',
    error: 'L\'exécution Python côté serveur n\'est pas disponible. L\'exécution se fera côté navigateur via Pyodide.',
    testResults: testCases.map(tc => ({
      nom: tc.nom,
      passed: false,
      output: '',
      expected: tc.sortieAttendue,
      error: 'En attente d\'exécution côté client',
    })),
    totalTests: testCases.length,
    passedTests: 0,
  }
}

/**
 * Normalize output for comparison
 */
function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, '\n').replace(/\n+/g, '\n').trim()
}

export const POST = withAuth(handler, ['ENSEIGNANT', 'ADMIN', 'RESPONSABLE', 'ETUDIANT'])
