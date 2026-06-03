import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Start a session (student begins an exam)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { etudiantId, epreuveId } = body

    if (!etudiantId || !epreuveId) {
      return NextResponse.json(
        { error: 'Étudiant et épreuve requis' },
        { status: 400 }
      )
    }

    // Check epreuve exists and is active
    const epreuve = await db.epreuve.findUnique({
      where: { id: epreuveId },
      include: {
        questions: {
          include: {
            question: true,
          },
          orderBy: { ordre: 'asc' },
        },
      },
    })

    if (!epreuve) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    if (!['PLANIFIEE', 'EN_COURS'].includes(epreuve.statut)) {
      return NextResponse.json(
        { error: 'Cette épreuve n\'est plus disponible' },
        { status: 400 }
      )
    }

    // Check if student already has a session for this exam
    const existingSession = await db.sessionPassation.findFirst({
      where: { etudiantId, epreuveId },
    })

    if (existingSession) {
      if (existingSession.statut === 'SOUMISE' || existingSession.statut === 'CORRIGEE') {
        return NextResponse.json(
          { error: 'Vous avez déjà soumis cette épreuve' },
          { status: 400 }
        )
      }

      // Resume existing session
      const epreuveQuestions = epreuve.questions.map((eq) => ({
        ...eq,
        question: {
          ...eq.question,
          propositions: eq.question.propositions ? JSON.parse(eq.question.propositions) : null,
          reponseCorrecte: undefined, // Never send correct answers to client!
          explication: undefined,
          themes: eq.question.themes ? JSON.parse(eq.question.themes) : null,
        },
      }))

      // Get existing answers
      const reponses = await db.reponse.findMany({
        where: { sessionId: existingSession.id },
        select: { questionId: true, contenu: true },
      })

      return NextResponse.json({
        session: existingSession,
        epreuve: {
          ...epreuve,
          questions: epreuveQuestions,
          groupesCibles: epreuve.groupesCibles ? JSON.parse(epreuve.groupesCibles) : null,
        },
        reponses: Object.fromEntries(reponses.map((r) => [r.questionId, r.contenu])),
        resumed: true,
      })
    }

    // Create new session
    const now = new Date()
    const session = await db.sessionPassation.create({
      data: {
        etudiantId,
        epreuveId,
        statut: 'EN_COURS',
        dateDebut: now,
        logEvents: JSON.stringify([{ type: 'SESSION_START', timestamp: now.toISOString() }]),
      },
    })

    // Prepare questions for student (shuffle if enabled)
    let questionsForStudent = [...epreuve.questions]

    if (epreuve.melangeQuestions) {
      questionsForStudent = shuffleArray(questionsForStudent)
    }

    // For each question, shuffle propositions if QCU/QCM and melangePropositions is enabled
    const epreuveQuestions = questionsForStudent.map((eq) => {
      const questionObj: Record<string, unknown> = {
        ...eq.question,
        propositions: eq.question.propositions ? JSON.parse(eq.question.propositions) : null,
        reponseCorrecte: undefined, // Never send correct answers to client!
        explication: undefined, // Never send explanations to client!
        themes: eq.question.themes ? JSON.parse(eq.question.themes) : null,
      }

      // Shuffle propositions if needed
      if (epreuve.melangePropositions && eq.question.propositions && (eq.question.type === 'QCU' || eq.question.type === 'QCM')) {
        const props = JSON.parse(eq.question.propositions) as string[]
        questionObj.propositions = shuffleArray([...props])
      }

      const questionData: Record<string, unknown> = {
        ...eq,
        question: questionObj,
      }

      return questionData
    })

    // Update epreuve status to EN_COURS if it was PLANIFIEE
    if (epreuve.statut === 'PLANIFIEE') {
      await db.epreuve.update({
        where: { id: epreuveId },
        data: { statut: 'EN_COURS' },
      })
    }

    return NextResponse.json({
      session,
      epreuve: {
        ...epreuve,
        questions: epreuveQuestions,
        groupesCibles: epreuve.groupesCibles ? JSON.parse(epreuve.groupesCibles) : null,
      },
      reponses: {},
      resumed: false,
    })
  } catch (error) {
    console.error('Start session error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du démarrage de la session' },
      { status: 500 }
    )
  }
}

// Save answer (auto-save during exam)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, questionId, contenu, alerte } = body

    if (!sessionId || !questionId) {
      return NextResponse.json(
        { error: 'Session et question requises' },
        { status: 400 }
      )
    }

    // Check session is still active
    const session = await db.sessionPassation.findUnique({
      where: { id: sessionId },
    })

    if (!session || session.statut !== 'EN_COURS') {
      return NextResponse.json(
        { error: 'Session non active' },
        { status: 400 }
      )
    }

    // Upsert the answer
    if (contenu !== undefined) {
      await db.reponse.upsert({
        where: {
          sessionId_questionId: { sessionId, questionId },
        },
        create: {
          sessionId,
          questionId,
          contenu: String(contenu),
        },
        update: {
          contenu: String(contenu),
        },
      })
    }

    // Handle alert (anti-cheat event)
    if (alerte) {
      const currentLogs = session.logEvents ? JSON.parse(session.logEvents) : []
      currentLogs.push({
        type: alerte.type, // 'TAB_SWITCH', 'FULLSCREEN_EXIT', 'PASTE_ATTEMPT'
        timestamp: new Date().toISOString(),
        details: alerte.details || '',
      })

      await db.sessionPassation.update({
        where: { id: sessionId },
        data: {
          logEvents: JSON.stringify(currentLogs),
          alertes: { increment: 1 },
        },
      })
    }

    return NextResponse.json({ saved: true })
  } catch (error) {
    console.error('Save answer error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la sauvegarde' },
      { status: 500 }
    )
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
