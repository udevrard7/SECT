import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  shuffleArrayWithMapping,
  applyMapping,
  parsePropositionMappings,
  serializePropositionMappings,
  AUTO_GRADABLE_TYPES,
} from '@/lib/grading'

// Get sessions (for resume/check existing)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const etudiantId = searchParams.get('etudiantId')
    const epreuveId = searchParams.get('epreuveId')

    const where: Record<string, unknown> = {}
    if (etudiantId) where.etudiantId = etudiantId
    if (epreuveId) where.epreuveId = epreuveId

    const sessions = await db.sessionPassation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        etudiantId: true,
        epreuveId: true,
        statut: true,
        dateDebut: true,
        dateFin: true,
        score: true,
        alertes: true,
        penalite: true,
        logEvents: true,
        createdAt: true,
        propositionMappings: true,
      },
    })

    return NextResponse.json(sessions)
  } catch (error) {
    console.error('Get sessions error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des sessions' },
      { status: 500 }
    )
  }
}

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

    if (!epreuve || epreuve.deletedAt) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    if (!['PLANIFIEE', 'EN_COURS'].includes(epreuve.statut)) {
      return NextResponse.json(
        { error: 'Cette épreuve n\'est plus disponible' },
        { status: 400 }
      )
    }

    // Check if epreuve is closed (auto-closure)
    if (epreuve.statut === 'CLOTUREE') {
      return NextResponse.json(
        { error: 'Cette épreuve est clôturée, les soumissions ne sont plus acceptées', code: 'EPREUVE_CLOTUREE' },
        { status: 403 }
      )
    }

    // Check student eligibility (filiere and niveau)
    const etudiant = await db.user.findUnique({
      where: { id: etudiantId },
      select: { filiereId: true, niveau: true, role: true },
    })
    if (!etudiant) {
      return NextResponse.json({ error: 'Étudiant non trouvé' }, { status: 404 })
    }

    // Check filiere match
    if (epreuve.filiereId && etudiant.filiereId && epreuve.filiereId !== etudiant.filiereId) {
      return NextResponse.json(
        { error: 'Vous n\'êtes pas autorisé à passer cette épreuve (filière non correspondante)', code: 'NOT_AUTHORIZED' },
        { status: 403 }
      )
    }

    // Check niveau match (stored in groupesCibles JSON)
    if (etudiant.niveau && epreuve.groupesCibles) {
      try {
        const parsed = JSON.parse(epreuve.groupesCibles as string)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'niveau' in parsed && parsed.niveau) {
          if (parsed.niveau !== etudiant.niveau) {
            return NextResponse.json(
              { error: 'Vous n\'êtes pas autorisé à passer cette épreuve (niveau non correspondant)', code: 'NOT_AUTHORIZED' },
              { status: 403 }
            )
          }
        }
      } catch {
        // Ignore parse errors — allow access
      }
    }

    // Check if the exam period has ended (including grace period)
    const currentTime = new Date()
    const gracePeriodEnd = new Date(epreuve.dateFin.getTime() + (epreuve.delaiGrace || 3) * 60 * 1000)
    if (currentTime >= gracePeriodEnd) {
      return NextResponse.json(
        { error: 'Le délai de grâce est expiré, les soumissions ne sont plus acceptées', code: 'GRACE_PERIOD_EXPIRED' },
        { status: 403 }
      )
    }

    // Check if student already has a session for this exam
    const existingSession = await db.sessionPassation.findFirst({
      where: { etudiantId, epreuveId },
    })

    if (existingSession) {
      if (existingSession.statut === 'SOUMISE' || existingSession.statut === 'CORRIGEE' || existingSession.statut === 'RETOURNEE') {
        return NextResponse.json(
          { error: 'Vous avez déjà soumis cette épreuve' },
          { status: 400 }
        )
      }

      // Resume existing session — use stored proposition mappings for consistent display
      const storedMappings = parsePropositionMappings(existingSession.propositionMappings)

      let epreuveQuestions: Record<string, unknown>[]
      const contenuQuestions = buildQuestionsFromContenu(
        epreuve.contenu,
        epreuve.melangeQuestions,
        epreuve.melangePropositions,
        storedMappings
      )
      if (contenuQuestions && epreuve.questions.length === 0) {
        epreuveQuestions = contenuQuestions
      } else {
        epreuveQuestions = buildQuestionsFromRelations(
          epreuve.questions,
          epreuve.melangeQuestions,
          epreuve.melangePropositions,
          storedMappings
        )
      }

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

    // ─── Create new session ──────────────────────────────────────────────────
    const now = new Date()

    // Build proposition mappings for this session
    const { mappings, shuffledPropositions } = buildMappingsForNewSession(
      epreuve.questions,
      epreuve.contenu,
      epreuve.melangeQuestions,
      epreuve.melangePropositions
    )

    const session = await db.sessionPassation.create({
      data: {
        etudiantId,
        epreuveId,
        statut: 'EN_COURS',
        dateDebut: now,
        logEvents: JSON.stringify([{ type: 'SESSION_START', timestamp: now.toISOString() }]),
        propositionMappings: serializePropositionMappings(mappings),
      },
    })

    // Prepare questions for student using the stored mappings
    let epreuveQuestions: Record<string, unknown>[]

    const contenuQuestions = buildQuestionsFromContenu(
      epreuve.contenu,
      epreuve.melangeQuestions,
      epreuve.melangePropositions,
      mappings
    )
    if (contenuQuestions && epreuve.questions.length === 0) {
      epreuveQuestions = contenuQuestions
    } else {
      epreuveQuestions = buildQuestionsFromRelations(
        epreuve.questions,
        epreuve.melangeQuestions,
        epreuve.melangePropositions,
        mappings
      )
    }

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

// ─── Helper Functions ─────────────────────────────────────────────────────────

function normalizePropositions(propositions: unknown): string[] | null {
  if (!propositions) return null
  if (Array.isArray(propositions)) {
    if (propositions.length > 0 && typeof propositions[0] === 'object' && propositions[0] !== null) {
      return propositions.map((p: Record<string, unknown>) => String(p.text || p.id || ''))
    }
    return propositions.map((p: unknown) => String(p))
  }
  return null
}

/**
 * Build proposition mappings for a new session.
 * Returns the mappings (questionId → shuffledIndex→originalIndex array) and the shuffled propositions.
 */
function buildMappingsForNewSession(
  epreuveQuestions: Array<{
    questionId: string
    question: { type: string; propositions: string | null }
    bareme: number
    ordre: number
  }>,
  contenu: unknown,
  melangeQuestions: boolean,
  melangePropositions: boolean
): { mappings: Record<string, number[]>; shuffledPropositions: Record<string, string[]> } {
  const mappings: Record<string, number[]> = {}
  const shuffledProps: Record<string, string[]> = {}

  // Process EpreuveQuestion relations
  for (const eq of epreuveQuestions) {
    if (AUTO_GRADABLE_TYPES.includes(eq.question.type) && eq.question.propositions) {
      const originalProps = JSON.parse(eq.question.propositions) as string[]
      if (melangePropositions && originalProps.length > 1) {
        const result = shuffleArrayWithMapping(originalProps)
        mappings[eq.questionId] = result.mapping
        shuffledProps[eq.questionId] = result.shuffled
      } else {
        mappings[eq.questionId] = originalProps.map((_, i) => i)
        shuffledProps[eq.questionId] = [...originalProps]
      }
    }
  }

  // Process contenu JSONB if no EpreuveQuestion relations
  if (epreuveQuestions.length === 0 && contenu) {
    const contenuData = contenu as Record<string, unknown> | null
    if (contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)) {
      const contenuQuestions = contenuData.questions as Array<Record<string, unknown>>
      for (let idx = 0; idx < contenuQuestions.length; idx++) {
        const q = contenuQuestions[idx]
        const qId = String(q.id || `contenu-q${idx}`)
        const qType = String(q.type || 'QRC')
        const propositions = normalizePropositions(q.propositions)

        if (AUTO_GRADABLE_TYPES.includes(qType) && propositions && propositions.length > 1) {
          if (melangePropositions) {
            const result = shuffleArrayWithMapping(propositions)
            mappings[qId] = result.mapping
            shuffledProps[qId] = result.shuffled
          } else {
            mappings[qId] = propositions.map((_, i) => i)
            shuffledProps[qId] = [...propositions]
          }
        }
      }
    }
  }

  return { mappings, shuffledPropositions: shuffledProps }
}

/**
 * Build exam questions from contenu JSONB format.
 * If storedMappings is provided, use them to reproduce the same shuffle order.
 * Otherwise, shuffle randomly (for new sessions, the mapping will be stored separately).
 */
function buildQuestionsFromContenu(
  contenu: unknown,
  melangeQuestions: boolean,
  melangePropositions: boolean,
  storedMappings?: Record<string, number[]>
): Record<string, unknown>[] | null {
  const contenuData = contenu as Record<string, unknown> | null
  if (!contenuData || typeof contenuData !== 'object' || !Array.isArray(contenuData.questions)) return null
  const contenuQuestions = contenuData.questions as Array<Record<string, unknown>>
  if (contenuQuestions.length === 0) return null

  let questions = contenuQuestions.map((q, idx) => {
    const qId = String(q.id || `contenu-q${idx}`)
    const qType = String(q.type || 'QRC')
    const propositions = normalizePropositions(q.propositions)

    // Determine the proposition order
    let displayPropositions = propositions
    if (propositions && AUTO_GRADABLE_TYPES.includes(qType)) {
      const mapping = storedMappings?.[qId]
      if (mapping && mapping.length === propositions.length) {
        // Resume: use stored mapping to reproduce the same shuffle order
        displayPropositions = applyMapping(propositions, mapping)
      } else if (melangePropositions && propositions.length > 1) {
        // New session: shuffle randomly (mapping will be stored by the caller)
        const result = shuffleArrayWithMapping(propositions)
        displayPropositions = result.shuffled
      }
    }

    return {
      id: qId,
      questionId: qId,
      bareme: typeof q.bareme === 'number' ? q.bareme : 1,
      ordre: idx,
      question: {
        id: qId,
        type: qType,
        enonce: String(q.enonce || ''),
        propositions: displayPropositions,
        difficulte: String(q.difficulte || 'MOYEN'),
        themes: null,
        // NEVER send reponseCorrecte or explication to client!
        reponseCorrecte: undefined,
        explication: undefined,
      },
    }
  })

  if (melangeQuestions) {
    questions = shuffleArrayWithMapping(questions).shuffled
    questions = questions.map((q, idx) => ({ ...q, ordre: idx }))
  }

  return questions
}

/**
 * Build exam questions from EpreuveQuestion relations.
 * If storedMappings is provided, use them to reproduce the same shuffle order.
 */
function buildQuestionsFromRelations(
  epreuveQuestions: Array<{
    id: string
    questionId: string
    bareme: number
    ordre: number
    question: {
      id: string
      type: string
      enonce: string
      propositions: string | null
      reponseCorrecte: string | null
      explication: string | null
      themes: string | null
      difficulte: string
    }
  }>,
  melangeQuestions: boolean,
  melangePropositions: boolean,
  storedMappings?: Record<string, number[]>
): Record<string, unknown>[] {
  let questionsForStudent = [...epreuveQuestions]
  if (melangeQuestions) {
    questionsForStudent = shuffleArrayWithMapping(questionsForStudent).shuffled
  }

  return questionsForStudent.map((eq, idx) => {
    const questionObj: Record<string, unknown> = {
      ...eq.question,
      propositions: eq.question.propositions ? JSON.parse(eq.question.propositions) : null,
      reponseCorrecte: undefined, // Never send correct answers to client!
      explication: undefined,
      themes: eq.question.themes ? JSON.parse(eq.question.themes) : null,
    }

    // Determine proposition order for QCU/QCM questions
    if (AUTO_GRADABLE_TYPES.includes(eq.question.type) && eq.question.propositions) {
      const originalProps = JSON.parse(eq.question.propositions) as string[]
      const mapping = storedMappings?.[eq.questionId]
      if (mapping && mapping.length === originalProps.length) {
        // Resume: use stored mapping to reproduce the same shuffle order
        questionObj.propositions = applyMapping(originalProps, mapping)
      } else if (melangePropositions && originalProps.length > 1) {
        // New session: shuffle randomly (mapping will be stored by the caller)
        questionObj.propositions = shuffleArrayWithMapping(originalProps).shuffled
      }
    }

    return { ...eq, ordre: idx, question: questionObj }
  })
}
