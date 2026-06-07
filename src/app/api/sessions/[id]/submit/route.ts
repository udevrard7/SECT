import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  parsePropositionMappings,
  parseCorrectAnswer,
  gradeQCU,
  gradeQCM,
  detectGradingScenario,
  AUTO_GRADABLE_TYPES,
  MANUAL_CORRECTION_TYPES,
} from '@/lib/grading'
import { withAuth } from '@/lib/auth-session'

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
    }

    const questionsForGrading: QuestionForGrading[] = []

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
            propositions: null,
          })
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
      }

      if (reponse && isAutoGraded) {
        await db.reponse.update({
          where: { id: reponse.id },
          data: { score: questionScore },
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

export const POST = withAuth(_POST)
