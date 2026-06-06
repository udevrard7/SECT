import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAndAutoCloseEpreuve } from '@/lib/auto-closure'
import {
  parsePropositionMappings,
  parseCorrectAnswer,
  gradeQCU,
  gradeQCM,
  detectGradingScenario,
  areAllAnswersGraded,
  AUTO_GRADABLE_TYPES,
  MANUAL_CORRECTION_TYPES,
} from '@/lib/grading'

// Submit exam — mark session as SOUMISE and auto-grade QCU/QCM
// Implements hybrid grading:
//   Scenario A: 100% QCM/QCU → auto-grade all, move to CORRIGEE, show final result
//   Scenario B: Mixed → auto-grade QCU/QCM only, keep SOUMISE, show partial result
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { autoSubmit, reponses } = body

    // Get session with epreuve and answers
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

    // Check if epreuve is already closed
    if (session.epreuve.statut === 'CLOTUREE') {
      return NextResponse.json(
        { error: 'Cette épreuve est clôturée, les soumissions ne sont plus acceptées', code: 'EPREUVE_CLOTUREE' },
        { status: 403 }
      )
    }

    // Check if grace period has expired
    const currentTime = new Date()
    const gracePeriodEnd = new Date(session.epreuve.dateFin.getTime() + (session.epreuve.delaiGrace || 3) * 60 * 1000)
    if (currentTime >= gracePeriodEnd && !autoSubmit) {
      return NextResponse.json(
        { error: 'Le délai de grâce est expiré, les soumissions ne sont plus acceptées', code: 'GRACE_PERIOD_EXPIRED' },
        { status: 403 }
      )
    }

    // Save any remaining answers before submitting
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
      // Refresh reponses after saving
      const updatedReponses = await db.reponse.findMany({ where: { sessionId: id } })
      session.reponses = updatedReponses
    }

    // ─── Load proposition mappings for this session ──────────────────────────
    const propositionMappings = parsePropositionMappings(session.propositionMappings)

    // ─── Build unified question list from both formats ───────────────────────
    type QuestionForGrading = {
      id: string
      questionId: string
      bareme: number
      type: string
      reponseCorrecte: string | null
      propositions: string | null // Original propositions (for mapping)
    }

    const questionsForGrading: QuestionForGrading[] = []

    // From EpreuveQuestion relations
    for (const eq of session.epreuve.questions) {
      questionsForGrading.push({
        id: eq.id,
        questionId: eq.questionId,
        bareme: eq.bareme,
        type: eq.question.type,
        reponseCorrecte: eq.question.reponseCorrecte,
        propositions: eq.question.propositions,
      })
    }

    // From contenu JSONB if no EpreuveQuestion relations
    if (questionsForGrading.length === 0 && session.epreuve.contenu) {
      const contenuData = session.epreuve.contenu as Record<string, unknown> | null
      if (contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)) {
        const contenuQuestions = contenuData.questions as Array<Record<string, unknown>>
        for (let idx = 0; idx < contenuQuestions.length; idx++) {
          const q = contenuQuestions[idx]
          questionsForGrading.push({
            id: String(q.id || `contenu-q${idx}`),
            questionId: String(q.id || `contenu-q${idx}`),
            bareme: typeof q.bareme === 'number' ? q.bareme : 1,
            type: String(q.type || 'QRC'),
            reponseCorrecte: q.reponseCorrecte ? JSON.stringify(q.reponseCorrecte) : null,
            propositions: null, // contenu format stores propositions differently
          })
        }
      }
    }

    // ─── Detect grading scenario ─────────────────────────────────────────────
    const scenario = detectGradingScenario(questionsForGrading)

    // ─── Grade each question ─────────────────────────────────────────────────
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
      }
      // QRC, TRS, REFLEXION: score stays null (pending manual correction)

      // Update the response with score (only for auto-graded questions)
      if (reponse && isAutoGraded) {
        await db.reponse.update({
          where: { id: reponse.id },
          data: { score: questionScore },
        })
      }
      // For manual correction questions, leave score as null (not 0!)

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

    // ─── Apply penalty ───────────────────────────────────────────────────────
    const penalite = session.penalite || 0
    const scoreAfterPenalty = Math.max(0, autoGradedScore - penalite)

    // ─── Determine session status ────────────────────────────────────────────
    // Scenario A: All questions are auto-gradable → move to CORRIGEE immediately
    // Scenario B: Some questions need manual correction → stay SOUMISE
    let newStatut: string
    let correctionMessage: string | null = null

    if (scenario.type === 'A') {
      // All questions auto-graded
      newStatut = 'CORRIGEE'
    } else {
      // Mixed: some questions still need manual correction
      newStatut = 'SOUMISE'
      correctionMessage = 'En attente de la correction manuelle de l\'enseignant pour les questions ouvertes'
    }

    // ─── Create or update result ─────────────────────────────────────────────
    const totalPossible = questionsForGrading.reduce((sum, q) => sum + q.bareme, 0)
    const autoGradableTotal = questionsForGrading
      .filter((q) => AUTO_GRADABLE_TYPES.includes(q.type))
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

    // ─── Update session ──────────────────────────────────────────────────────
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

    // ─── Check if all students have submitted → auto-close ───────────────────
    let autoCloseResult = null
    try {
      autoCloseResult = await checkAndAutoCloseEpreuve(session.epreuveId)
    } catch (e) {
      console.error('Auto-close check failed after submission:', e)
    }

    // ─── Build response ──────────────────────────────────────────────────────
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
      epreuveAutoClosed: autoCloseResult?.closed || false,
      autoCloseRaison: autoCloseResult?.raison || null,
    }

    // Add scenario-specific information
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
