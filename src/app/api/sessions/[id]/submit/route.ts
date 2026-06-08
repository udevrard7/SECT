import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { db } from '@/lib/db'
import {
  parsePropositionMappings,
  parseCorrectAnswer,
  gradeQCU,
  gradeQCM,
  gradeCODE,
  detectGradingScenario,
  AUTO_GRADABLE_TYPES,
  SEMI_AUTO_GRADABLE_TYPES,
  MANUAL_CORRECTION_TYPES,
} from '@/lib/grading'
import { withAuth } from '@/lib/auth-session'
import { type CodingLanguage, type TestCase, type TestResult, type CodeExecutionResult, EXECUTION_CONFIG, parseCodingAnswer, parseFunctionSignature } from '@/lib/coding-types'

async function _POST(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const { autoSubmit, reponses } = body

    const session = await db.sessionPassation.findUnique({
      where: { id },
      include: {
        epreuve: {
          include: {
            questions: {
              include: {
                question: true,
              },
            },
          },
        },
        reponses: true,
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
    }

    if (session.statut !== 'EN_COURS') {
      return NextResponse.json({ error: 'Session déjà soumise' }, { status: 400 })
    }

    if (session.epreuve.statut === 'CLOTUREE') {
      return NextResponse.json(
        { error: 'Cette épreuve est clôturée, les soumissions ne sont plus acceptées', code: 'EPREUVE_CLOTUREE' },
        { status: 403 }
      )
    }

    const currentTime = new Date()
    const gracePeriodEnd = new Date(session.epreuve.dateFin.getTime() + (session.epreuve.delaiGrace || 3) * 60 * 1000)
    if (currentTime >= gracePeriodEnd && !autoSubmit) {
      return NextResponse.json(
        { error: 'Le délai de grâce est expiré, les soumissions ne sont plus acceptées', code: 'GRACE_PERIOD_EXPIRED' },
        { status: 403 }
      )
    }

    if (reponses && typeof reponses === 'object') {
      for (const [questionId, contenu] of Object.entries(reponses as Record<string, string>)) {
        if (contenu !== undefined && contenu !== null && contenu !== '') {
          await db.reponse.upsert({
            where: {
              sessionId_questionId: { sessionId: id, questionId },
            },
            create: {
              sessionId: id,
              questionId,
              contenu: String(contenu),
            },
            update: {
              contenu: String(contenu),
            },
          })
        }
      }
      const updatedReponses = await db.reponse.findMany({ where: { sessionId: id } })
      session.reponses = updatedReponses
    }

    const propositionMappings = parsePropositionMappings(session.propositionMappings)

    type QuestionForGrading = {
      id: string
      questionId: string
      bareme: number
      type: string
      reponseCorrecte: string | null
      propositions: string | null
      langage?: string
      fonctionSignature?: string
      testsPublics?: TestCase[]
      testsPrives?: TestCase[]
    }

    const questionsForGrading: QuestionForGrading[] = []

    for (const eq of session.epreuve.questions) {
      const qg: QuestionForGrading = {
        id: eq.id,
        questionId: eq.questionId,
        bareme: eq.bareme,
        type: eq.question.type,
        reponseCorrecte: eq.question.reponseCorrecte,
        propositions: eq.question.propositions,
      }

      // For CODE questions, extract CODE-specific fields from reponseCorrecte
      if (eq.question.type === 'CODE' && eq.question.reponseCorrecte) {
        try {
          const parsed = JSON.parse(eq.question.reponseCorrecte)
          if (parsed && typeof parsed === 'object') {
            if (parsed.langage) qg.langage = String(parsed.langage)
            if (parsed.fonctionSignature) qg.fonctionSignature = String(parsed.fonctionSignature)
            if (Array.isArray(parsed.testsPublics)) qg.testsPublics = parsed.testsPublics
            if (Array.isArray(parsed.testsPrives)) qg.testsPrives = parsed.testsPrives
          }
        } catch {
          // Not valid JSON — ignore
        }
      }

      questionsForGrading.push(qg)
    }

    if (questionsForGrading.length === 0 && session.epreuve.contenu) {
      const contenuData = session.epreuve.contenu as Record<string, unknown> | null
      if (contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)) {
        const contenuQuestions = contenuData.questions as Array<Record<string, unknown>>
        for (let idx = 0; idx < contenuQuestions.length; idx++) {
          const q = contenuQuestions[idx]
          const qg: QuestionForGrading = {
            id: String(q.id || `contenu-q${idx}`),
            questionId: String(q.id || `contenu-q${idx}`),
            bareme: typeof q.bareme === 'number' ? q.bareme : 1,
            type: String(q.type || 'QRC'),
            reponseCorrecte: q.reponseCorrecte ? JSON.stringify(q.reponseCorrecte) : null,
            propositions: null,
          }

          // Extract CODE fields from contenu questions
          if (qg.type === 'CODE') {
            if (q.langage) qg.langage = String(q.langage)
            if (q.fonctionSignature) qg.fonctionSignature = String(q.fonctionSignature)
            if (Array.isArray(q.testsPublics)) qg.testsPublics = q.testsPublics as TestCase[]
            if (Array.isArray(q.testsPrives)) qg.testsPrives = q.testsPrives as TestCase[]
          }

          questionsForGrading.push(qg)
        }
      }
    }

    const scenario = detectGradingScenario(questionsForGrading)

    let autoGradedScore = 0
    const detailParQuestion: Record<string, unknown>[] = []

    for (const qg of questionsForGrading) {
      const reponse = session.reponses.find((r) => r.questionId === qg.questionId || r.questionId === qg.id)

      let questionScore: number | null = null
      let isAutoGraded = false
      const correctAnswer = parseCorrectAnswer(qg.reponseCorrecte)
      const mapping = propositionMappings[qg.questionId] || null

      if (qg.type === 'QCU') {
        const result = gradeQCU(reponse?.contenu || null, correctAnswer, qg.bareme, mapping)
        questionScore = result.score
        isAutoGraded = true
      } else if (qg.type === 'QCM') {
        const result = gradeQCM(reponse?.contenu || null, correctAnswer, qg.bareme, mapping)
        questionScore = result.score
        isAutoGraded = true
      } else if (qg.type === 'CODE') {
        // Grade CODE question: run all tests (public + private) server-side
        const codeResult = gradeCODEQuestion(
          reponse?.contenu || null,
          qg.testsPublics || [],
          qg.testsPrives || [],
          qg.bareme,
          qg.langage as CodingLanguage | undefined,
          qg.fonctionSignature
        )
        questionScore = codeResult.score
        isAutoGraded = codeResult.isAutoGraded

        // If student has no code answer but there are tests, score 0
        if (!reponse?.contenu) {
          questionScore = 0
          isAutoGraded = true
        }
      }

      if (reponse && (isAutoGraded || qg.type === 'CODE')) {
        await db.reponse.upsert({
          where: { sessionId_questionId: { sessionId: id, questionId: qg.questionId } },
          create: {
            sessionId: id,
            questionId: qg.questionId,
            contenu: reponse.contenu,
            score: questionScore,
          },
          update: {
            score: questionScore,
          },
        })
      } else if (!reponse && isAutoGraded) {
        await db.reponse.create({
          data: {
            sessionId: id,
            questionId: qg.questionId,
            contenu: null,
            score: questionScore,
          },
        })
      }

      if (isAutoGraded && questionScore !== null) {
        autoGradedScore += questionScore
      }

      detailParQuestion.push({
        questionId: qg.questionId,
        type: qg.type,
        bareme: qg.bareme,
        score: isAutoGraded ? questionScore : null,
        isAutoGraded,
        repondu: !!reponse,
      })
    }

    const penalite = session.penalite || 0
    const scoreAfterPenalty = Math.max(0, autoGradedScore - penalite)

    let newStatut: string
    let correctionMessage: string | null = null

    if (scenario.type === 'A') {
      newStatut = 'CORRIGEE'
    } else {
      newStatut = 'SOUMISE'
      correctionMessage = 'En attente de la correction manuelle de l\'enseignant pour les questions ouvertes'
    }

    const totalPossible = questionsForGrading.reduce((sum, q) => sum + q.bareme, 0)
    const autoGradableTotal = questionsForGrading
      .filter((q) => AUTO_GRADABLE_TYPES.includes(q.type) || SEMI_AUTO_GRADABLE_TYPES.includes(q.type))
      .reduce((sum, q) => sum + q.bareme, 0)

    const existingResult = await db.resultat.findUnique({ where: { sessionId: id } })

    const resultData = {
      scoreFinal: scoreAfterPenalty,
      detailParQuestion: JSON.stringify(detailParQuestion),
      totalPossible,
      commentaires: [
        penalite > 0 ? `Pénalité appliquée: -${penalite} point${penalite > 1 ? 's' : ''} (sorties plein écran)` : null,
        correctionMessage,
      ].filter(Boolean).join(' | ') || null,
      ...(scenario.type === 'A' ? { dateCorrection: new Date() } : {}),
    }

    let resultat
    if (existingResult) {
      resultat = await db.resultat.update({
        where: { id: existingResult.id },
        data: resultData,
      })
    } else {
      resultat = await db.resultat.create({
        data: {
          sessionId: id,
          ...resultData,
        },
      })
    }

    const now = new Date()
    const updatedSession = await db.sessionPassation.update({
      where: { id },
      data: {
        statut: newStatut,
        dateFin: now,
        score: scoreAfterPenalty,
        logEvents: session.logEvents
          ? JSON.stringify([
              ...JSON.parse(session.logEvents),
              { type: autoSubmit ? 'AUTO_SUBMIT' : 'MANUAL_SUBMIT', timestamp: now.toISOString() },
            ])
          : JSON.stringify([{ type: autoSubmit ? 'AUTO_SUBMIT' : 'MANUAL_SUBMIT', timestamp: now.toISOString() }]),
      },
    })

    const response: Record<string, unknown> = {
      session: updatedSession,
      resultat: {
        ...resultat,
        detailParQuestion: JSON.parse(resultat.detailParQuestion || '[]'),
      },
      score: scoreAfterPenalty,
      rawScore: autoGradedScore,
      penalite,
      totalPossible,
      autoGradableTotal,
      percentage: totalPossible > 0 ? Math.round((scoreAfterPenalty / totalPossible) * 100) : 0,
      autoGraded: scenario.autoGradableCount,
      pendingCorrection: scenario.manualCorrectionCount,
      scenario: scenario.type,
      message: autoSubmit
        ? 'Épreuve soumise automatiquement (temps écoulé)'
        : 'Épreuve soumise avec succès',
      epreuveAutoClosed: false,
      autoCloseRaison: null,
    }

    if (scenario.type === 'A') {
      response.scenarioMessage = 'Toutes les questions ont été corrigées automatiquement. Votre note finale est disponible.'
    } else {
      response.scenarioMessage = `Note partielle: ${scoreAfterPenalty.toFixed(1)}/${autoGradableTotal} (questions auto-corrigées). En attente de la correction manuelle de l'enseignant pour ${scenario.manualCorrectionCount} question(s) ouverte(s).`
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Submit session error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la soumission' },
      { status: 500 }
    )
  }
}

/**
 * Grade a CODE question by executing the student's code against all test cases.
 * Runs public + private tests server-side and uses gradeCODE() for scoring.
 */
function gradeCODEQuestion(
  studentAnswerContenu: string | null,
  testsPublics: TestCase[],
  testsPrives: TestCase[],
  bareme: number,
  language?: CodingLanguage,
  functionSignature?: string
): { score: number; isAutoGraded: boolean } {
  // If no tests at all, can't auto-grade
  if (testsPublics.length === 0 && testsPrives.length === 0) {
    return { score: 0, isAutoGraded: false }
  }

  // Parse student's code answer
  const codingAnswer = parseCodingAnswer(studentAnswerContenu)
  if (!codingAnswer || !codingAnswer.code.trim()) {
    // No code submitted — score 0
    return { score: 0, isAutoGraded: true }
  }

  const lang = (codingAnswer.language || language || 'python') as CodingLanguage
  const allTests = [...testsPublics, ...testsPrives]

  // Execute the code server-side
  let testResultsAll: Array<{ passed: boolean }>

  try {
    const executionResult = executeCodeServerSide(
      codingAnswer.code,
      lang,
      allTests,
      functionSignature
    )

    testResultsAll = executionResult.testResults || allTests.map(() => ({ passed: false }))
  } catch (error) {
    console.error('[gradeCODE] Execution error:', error)
    // If execution fails entirely, all tests fail
    testResultsAll = allTests.map(() => ({ passed: false }))
  }

  // Also include public test results from the student's saved answer (from when they ran "Execute")
  const testResultsPublics = codingAnswer.testResultsPublics || []

  return gradeCODE(testResultsPublics, testResultsAll, bareme)
}

/**
 * Execute code server-side for grading purposes.
 * Supports JavaScript (via Function constructor) and Python (via subprocess).
 */
function executeCodeServerSide(
  code: string,
  language: CodingLanguage,
  testCases: TestCase[],
  functionSignature?: string
): CodeExecutionResult {
  switch (language) {
    case 'javascript':
    case 'typescript':
      return executeJavaScriptServer(code, testCases, functionSignature)
    case 'python':
      return executePythonServer(code, testCases, functionSignature)
    default:
      // C/Java — can't execute, mark all tests as failed
      return {
        success: false,
        output: '',
        error: `L'exécution ${language.toUpperCase()} n'est pas disponible côté serveur`,
        testResults: testCases.map(tc => ({
          nom: tc.nom,
          passed: false,
          output: '',
          expected: tc.sortieAttendue,
          error: 'Environnement d\'exécution non disponible',
        })),
        totalTests: testCases.length,
        passedTests: 0,
      }
  }
}

/**
 * Execute JavaScript server-side (sandboxed Function constructor).
 */
function executeJavaScriptServer(
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
        let inputArg: unknown
        try {
          inputArg = JSON.parse(tc.entree)
        } catch {
          inputArg = tc.entree
        }

        const inputSerialized = typeof inputArg === 'string' ? `"${inputArg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"` : JSON.stringify(inputArg)

        fullCode = `
          ${code}
          ;try {
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

      const output: string[] = []
      const mockConsole = {
        log: (...args: unknown[]) => { output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')) },
        error: (...args: unknown[]) => { output.push('ERROR: ' + args.map(a => String(a)).join(' ')) },
        warn: (...args: unknown[]) => {},
      }

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

/**
 * Execute Python server-side in a sandboxed subprocess.
 */
function executePythonServer(
  code: string,
  testCases: TestCase[],
  functionSignature?: string
): CodeExecutionResult {
  const results: TestResult[] = []
  let allOutput = ''

  // Extract function name from signature using cross-language parser
  const sigParsed = parseFunctionSignature(functionSignature || '')
  const funcName = sigParsed?.funcName || null

  const tmpDir = join(tmpdir(), `sect_grade_${Date.now()}_${Math.random().toString(36).slice(2)}`)

  try {
    mkdirSync(tmpDir, { recursive: true })

    for (const tc of testCases) {
      const startTime = Date.now()
      const scriptFile = join(tmpDir, `test_${tc.nom.replace(/[^a-zA-Z0-9]/g, '_')}.py`)

      try {
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

        writeFileSync(scriptFile, testScript, { encoding: 'utf-8' })

        const timeout = Math.min(EXECUTION_CONFIG.timeout, 10000)
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
              timeout: timeout + 2000,
              maxBuffer: 1024 * 1024,
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

function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, '\n').replace(/\n+/g, '\n').trim()
}

export const POST = withAuth(_POST)
