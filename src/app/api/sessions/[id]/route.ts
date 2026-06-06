import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAndAutoCloseEpreuve } from '@/lib/auto-closure'
import {
  parsePropositionMappings,
  parseCorrectAnswer,
  gradeQCU,
  gradeQCM,
  detectGradingScenario,
  AUTO_GRADABLE_TYPES,
  MANUAL_CORRECTION_TYPES,
} from '@/lib/grading'

// Submit exam (duplicate route — delegates to /api/sessions/[id]/submit for the main flow)
// This POST handler exists for backward compatibility
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { autoSubmit } = body

    // Get session
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

    // Load proposition mappings
    const propositionMappings = parsePropositionMappings(session.propositionMappings)

    // Mark session as submitted
    const now = new Date()
    const updatedSession = await db.sessionPassation.update({
      where: { id },
      data: {
        statut: 'SOUMISE',
        dateFin: now,
        logEvents: session.logEvents
          ? JSON.stringify([
              ...JSON.parse(session.logEvents),
              { type: autoSubmit ? 'AUTO_SUBMIT' : 'MANUAL_SUBMIT', timestamp: now.toISOString() },
            ])
          : JSON.stringify([{ type: autoSubmit ? 'AUTO_SUBMIT' : 'MANUAL_SUBMIT', timestamp: now.toISOString() }]),
      },
    })

    // Build unified question list
    type QuestionForGrading = {
      id: string
      questionId: string
      bareme: number
      type: string
      reponseCorrecte: string | null
    }

    const questionsForGrading: QuestionForGrading[] = []

    for (const eq of session.epreuve.questions) {
      questionsForGrading.push({
        id: eq.id,
        questionId: eq.questionId,
        bareme: eq.bareme,
        type: eq.question.type,
        reponseCorrecte: eq.question.reponseCorrecte,
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
          })
        }
      }
    }

    // Detect grading scenario
    const scenario = detectGradingScenario(questionsForGrading)

    // Grade each question using shared grading utilities
    let autoGradedScore = 0
    const detailParQuestion: Record<string, unknown>[] = []

    for (const qg of questionsForGrading) {
      const reponse = session.reponses.find((r) => r.questionId === qg.questionId || r.questionId === qg.id)
      const correctAnswer = parseCorrectAnswer(qg.reponseCorrecte)
      const mapping = propositionMappings[qg.questionId] || null

      let questionScore: number | null = null
      let isAutoGraded = false

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

      if (reponse && isAutoGraded) {
        await db.reponse.update({
          where: { id: reponse.id },
          data: { score: questionScore },
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

    // Apply penalty
    const penalite = session.penalite || 0
    const finalScore = Math.max(0, autoGradedScore - penalite)

    // Determine session status based on scenario
    let newStatut: string
    if (scenario.type === 'A') {
      newStatut = 'CORRIGEE' // All auto-graded
    } else {
      newStatut = 'SOUMISE' // Needs manual correction
    }

    // Update session status
    await db.sessionPassation.update({
      where: { id },
      data: { statut: newStatut, score: finalScore },
    })

    // Create or update result
    const totalPossible = questionsForGrading.reduce((sum, q) => sum + q.bareme, 0)
    const autoGradableTotal = questionsForGrading
      .filter((q) => AUTO_GRADABLE_TYPES.includes(q.type))
      .reduce((sum, q) => sum + q.bareme, 0)

    const existingResult = await db.resultat.findUnique({ where: { sessionId: id } })

    const resultData = {
      scoreFinal: finalScore,
      detailParQuestion: JSON.stringify(detailParQuestion),
      totalPossible,
      commentaires: penalite > 0 ? `Pénalité appliquée: -${penalite} point${penalite > 1 ? 's' : ''} (sorties plein écran)` : null,
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

    return NextResponse.json({
      session: updatedSession,
      resultat: {
        ...resultat,
        detailParQuestion: JSON.parse(resultat.detailParQuestion || '[]'),
      },
      score: finalScore,
      totalPossible,
      percentage: totalPossible > 0 ? Math.round((finalScore / totalPossible) * 100) : 0,
      autoGraded: scenario.autoGradableCount,
      pendingCorrection: scenario.manualCorrectionCount,
      scenario: scenario.type,
      message: autoSubmit ? 'Épreuve soumise automatiquement (temps écoulé)' : 'Épreuve soumise avec succès',
    })
  } catch (error) {
    console.error('Submit session error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la soumission' },
      { status: 500 }
    )
  }
}

// Save answers / Log alerts (auto-save during exam)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { reponses, alerte } = body

    // Check session is still active
    const session = await db.sessionPassation.findUnique({
      where: { id },
      include: { epreuve: { select: { statut: true, dateFin: true, delaiGrace: true } } },
    })

    if (!session || session.statut !== 'EN_COURS') {
      return NextResponse.json(
        { error: 'Session non active' },
        { status: 400 }
      )
    }

    // Check if epreuve is closed
    if (session.epreuve.statut === 'CLOTUREE') {
      return NextResponse.json(
        { error: 'Cette épreuve est clôturée', code: 'EPREUVE_CLOTUREE' },
        { status: 403 }
      )
    }

    // Check if grace period has expired
    const now = new Date()
    const gracePeriodEnd = new Date(session.epreuve.dateFin.getTime() + (session.epreuve.delaiGrace || 3) * 60 * 1000)
    if (now >= gracePeriodEnd) {
      return NextResponse.json(
        { error: 'Le délai de grâce est expiré', code: 'GRACE_PERIOD_EXPIRED' },
        { status: 403 }
      )
    }

    // Handle batch answer save
    if (reponses && typeof reponses === 'object') {
      const entries = Object.entries(reponses as Record<string, string>)
      for (const [questionId, contenu] of entries) {
        if (contenu !== undefined && contenu !== null) {
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
    }

    // Handle alert (anti-cheat event)
    if (alerte) {
      const currentLogs = session.logEvents ? JSON.parse(session.logEvents) : []
      currentLogs.push({
        type: alerte.type,
        timestamp: new Date().toISOString(),
        details: alerte.details || '',
        penalite: alerte.penalite || 0,
      })

      const updateData: Record<string, unknown> = {
        logEvents: JSON.stringify(currentLogs),
        alertes: { increment: 1 },
      }

      // If the alert includes a penalty, accumulate it
      if (alerte.penalite && alerte.penalite > 0) {
        updateData.penalite = { increment: alerte.penalite }
      }

      await db.sessionPassation.update({
        where: { id },
        data: updateData,
      })
    }

    return NextResponse.json({ saved: true })
  } catch (error) {
    console.error('Save answers error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la sauvegarde' },
      { status: 500 }
    )
  }
}

// PATCH: Force submit / Force grade / Update session status (admin/teacher actions)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body

    // ─── Action: Force submit a stuck session (EN_COURS → SOUMISE/CORRIGEE) ───
    if (action === 'soumettre') {
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
          resultat: true,
        },
      })

      if (!session) {
        return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
      }

      if (session.statut !== 'EN_COURS') {
        return NextResponse.json({ error: 'Seules les sessions en cours peuvent être forcées' }, { status: 400 })
      }

      // Load proposition mappings
      const propositionMappings = parsePropositionMappings(session.propositionMappings)

      // Mark session as submitted
      const now = new Date()
      const updatedSession = await db.sessionPassation.update({
        where: { id },
        data: {
          statut: 'SOUMISE',
          dateFin: now,
          logEvents: session.logEvents
            ? JSON.stringify([
                ...JSON.parse(session.logEvents),
                { type: 'FORCE_SUBMIT', timestamp: now.toISOString() },
              ])
            : JSON.stringify([{ type: 'FORCE_SUBMIT', timestamp: now.toISOString() }]),
        },
      })

      // Build question list
      type QuestionForGrading = {
        id: string
        questionId: string
        bareme: number
        type: string
        reponseCorrecte: string | null
      }

      const questionsForGrading: QuestionForGrading[] = []

      for (const eq of session.epreuve.questions) {
        questionsForGrading.push({
          id: eq.id,
          questionId: eq.questionId,
          bareme: eq.bareme,
          type: eq.question.type,
          reponseCorrecte: eq.question.reponseCorrecte,
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
            })
          }
        }
      }

      // Detect grading scenario
      const scenario = detectGradingScenario(questionsForGrading)

      // Grade using shared utilities with mapping support
      let autoGradedScore = 0
      const detailParQuestion: Record<string, unknown>[] = []

      for (const qg of questionsForGrading) {
        const reponse = session.reponses.find((r) => r.questionId === qg.questionId || r.questionId === qg.id)
        const correctAnswer = parseCorrectAnswer(qg.reponseCorrecte)
        const mapping = propositionMappings[qg.questionId] || null

        let questionScore: number | null = null
        let isAutoGraded = false

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

      // Determine final status
      const newStatut = scenario.type === 'A' ? 'CORRIGEE' : 'SOUMISE'
      const totalPossible = questionsForGrading.reduce((sum, q) => sum + q.bareme, 0)

      // Update session status
      await db.sessionPassation.update({
        where: { id },
        data: { statut: newStatut, score: autoGradedScore },
      })

      // Create or update result
      if (session.resultat) {
        await db.resultat.update({
          where: { id: session.resultat.id },
          data: {
            scoreFinal: autoGradedScore,
            detailParQuestion: JSON.stringify(detailParQuestion),
            totalPossible,
            ...(scenario.type === 'A' ? { dateCorrection: new Date() } : {}),
          },
        })
      } else {
        await db.resultat.create({
          data: {
            sessionId: id,
            scoreFinal: autoGradedScore,
            detailParQuestion: JSON.stringify(detailParQuestion),
            commentaires: null,
            totalPossible,
            ...(scenario.type === 'A' ? { dateCorrection: new Date() } : {}),
          },
        })
      }

      // Audit log
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'FORCE_SUBMIT_SESSION',
          entite: 'SessionPassation',
          entiteId: id,
          details: `Soumission forcée par l'enseignant — score ${autoGradedScore}/${totalPossible}`,
        },
      })

      // Check if all students have submitted → auto-close
      let autoCloseResult = null
      try {
        autoCloseResult = await checkAndAutoCloseEpreuve(session.epreuveId)
      } catch (e) {
        console.error('Auto-close check failed after force submit:', e)
      }

      return NextResponse.json({
        session: updatedSession,
        score: autoGradedScore,
        totalPossible,
        percentage: totalPossible > 0 ? Math.round((autoGradedScore / totalPossible) * 100) : 0,
        autoGraded: scenario.autoGradableCount,
        pendingCorrection: scenario.manualCorrectionCount,
        scenario: scenario.type,
        message: 'Soumission forcée avec succès',
        epreuveAutoClosed: autoCloseResult?.closed || false,
        autoCloseRaison: autoCloseResult?.raison || null,
      })
    }

    // ─── Action: Force grade all answers and mark as CORRIGEE ───
    if (action === 'corriger') {
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
          resultat: true,
        },
      })

      if (!session) {
        return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
      }

      if (!['SOUMISE', 'EN_COURS'].includes(session.statut)) {
        return NextResponse.json({ error: 'La session doit être soumise ou en cours pour être corrigée' }, { status: 400 })
      }

      // Load proposition mappings
      const propositionMappings = parsePropositionMappings(session.propositionMappings)

      // Build unified questions list
      type UnifiedQ = {
        questionId: string
        bareme: number
        type: string
        reponseCorrecte: string | null
      }
      const allQuestions: UnifiedQ[] = []

      for (const eq of session.epreuve.questions) {
        allQuestions.push({
          questionId: eq.questionId,
          bareme: eq.bareme,
          type: eq.question.type,
          reponseCorrecte: eq.question.reponseCorrecte,
        })
      }

      if (allQuestions.length === 0 && session.epreuve.contenu) {
        const contenuData = session.epreuve.contenu as Record<string, unknown> | null
        if (contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)) {
          const contenuQuestions = contenuData.questions as Array<Record<string, unknown>>
          for (let idx = 0; idx < contenuQuestions.length; idx++) {
            const q = contenuQuestions[idx]
            allQuestions.push({
              questionId: String(q.id || `contenu-q${idx}`),
              bareme: typeof q.bareme === 'number' ? q.bareme : 1,
              type: String(q.type || 'QRC'),
              reponseCorrecte: q.reponseCorrecte ? JSON.stringify(q.reponseCorrecte) : null,
            })
          }
        }
      }

      // Auto-grade QCU/QCM if not already done (using mapping-aware grading)
      for (const q of allQuestions) {
        const reponse = session.reponses.find((r) => r.questionId === q.questionId)
        if (reponse && reponse.score === null && AUTO_GRADABLE_TYPES.includes(q.type)) {
          const correctAnswer = parseCorrectAnswer(q.reponseCorrecte)
          const mapping = propositionMappings[q.questionId] || null

          let questionScore = 0
          if (q.type === 'QCU') {
            const result = gradeQCU(reponse.contenu, correctAnswer, q.bareme, mapping)
            questionScore = result.score
          } else if (q.type === 'QCM') {
            const result = gradeQCM(reponse.contenu, correctAnswer, q.bareme, mapping)
            questionScore = result.score
          }

          await db.reponse.update({
            where: { id: reponse.id },
            data: { score: questionScore },
          })
        }
      }

      // Recalculate total score from all graded answers
      const updatedReponses = await db.reponse.findMany({ where: { sessionId: id } })
      const totalScore = updatedReponses.reduce((sum, r) => sum + (r.score || 0), 0)
      const totalPossible = allQuestions.reduce((sum, q) => sum + q.bareme, 0)

      const detailParQuestion = allQuestions.map((q) => {
        const rep = updatedReponses.find((r) => r.questionId === q.questionId)
        return {
          questionId: q.questionId,
          type: q.type,
          bareme: q.bareme,
          score: rep?.score ?? null,
          isAutoGraded: AUTO_GRADABLE_TYPES.includes(q.type),
          noteIA: rep?.noteIA || null,
          repondu: !!rep?.contenu,
        }
      })

      // Create or update resultat
      if (session.resultat) {
        await db.resultat.update({
          where: { id: session.resultat.id },
          data: {
            scoreFinal: totalScore,
            totalPossible,
            detailParQuestion: JSON.stringify(detailParQuestion),
            dateCorrection: new Date(),
          },
        })
      } else {
        await db.resultat.create({
          data: {
            sessionId: id,
            scoreFinal: totalScore,
            totalPossible,
            detailParQuestion: JSON.stringify(detailParQuestion),
            commentaires: null,
            dateCorrection: new Date(),
          },
        })
      }

      // Update session status to CORRIGEE
      const now = new Date()
      await db.sessionPassation.update({
        where: { id },
        data: {
          statut: 'CORRIGEE',
          score: totalScore,
          dateFin: session.dateFin || now,
        },
      })

      // Audit log
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'FORCE_CORRECT_SESSION',
          entite: 'SessionPassation',
          entiteId: id,
          details: `Correction forcée — score ${totalScore}/${totalPossible}`,
        },
      })

      return NextResponse.json({
        score: totalScore,
        totalPossible,
        percentage: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0,
        message: 'Session corrigée avec succès',
      })
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 })
  } catch (error) {
    console.error('PATCH session error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la session' },
      { status: 500 }
    )
  }
}

// Get session details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const session = await db.sessionPassation.findUnique({
      where: { id },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
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
        resultat: true,
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
    }

    return NextResponse.json({
      session: {
        ...session,
        logEvents: session.logEvents ? JSON.parse(session.logEvents) : null,
      },
    })
  } catch (error) {
    console.error('Get session error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la session' },
      { status: 500 }
    )
  }
}
