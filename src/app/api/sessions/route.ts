import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  shuffleArrayWithMapping,
  applyMapping,
  parsePropositionMappings,
  serializePropositionMappings,
  AUTO_GRADABLE_TYPES,
} from '@/lib/grading'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { verifySelfAccess, resolveTenantFilter, requireAdminEtablissementAccess } from '@/lib/tenant-access'

// Get sessions (for resume/check existing)
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const etudiantId = searchParams.get('etudiantId')
    const epreuveId = searchParams.get('epreuveId')

    const where: Record<string, unknown> = {}

    // ─── Tenant isolation ───
    if (user.role === 'ETUDIANT') {
      // ETUDIANT: must query with their own etudiantId
      if (etudiantId) {
        const selfCheck = verifySelfAccess(user, etudiantId)
        if (selfCheck) return selfCheck
      }
      where.etudiantId = user.id
    } else if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: can only see sessions for epreuves they own or in their establishment
      where.epreuve = { enseignant: { etablissementId: user.etablissementId } }
      if (etudiantId) where.etudiantId = etudiantId
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: can see sessions in their establishment
      where.epreuve = { enseignant: { etablissementId: user.etablissementId } }
      if (etudiantId) where.etudiantId = etudiantId
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the relevant establishment
      // If epreuveId is provided, look up the epreuve's establishment
      if (epreuveId) {
        const epreuve = await db.epreuve.findUnique({
          where: { id: epreuveId },
          select: { enseignant: { select: { etablissementId: true } } },
        })
        if (epreuve?.enseignant?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, epreuve.enseignant.etablissementId)
          if (accessError) return accessError
        }
      } else if (etudiantId) {
        // Look up the student's establishment
        const student = await db.user.findUnique({
          where: { id: etudiantId },
          select: { etablissementId: true },
        })
        if (student?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, student.etablissementId)
          if (accessError) return accessError
        }
      }
      if (etudiantId) where.etudiantId = etudiantId
    }

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
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const { etudiantId, epreuveId } = body

    if (!etudiantId || !epreuveId) {
      return NextResponse.json(
        { error: 'Étudiant et épreuve requis' },
        { status: 400 }
      )
    }

    // ─── Tenant isolation for POST ───
    if (user.role === 'ETUDIANT') {
      // ETUDIANT: etudiantId must be their own ID
      const selfCheck = verifySelfAccess(user, etudiantId)
      if (selfCheck) return selfCheck
    } else if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: can start sessions for students in their establishment
      const student = await db.user.findUnique({
        where: { id: etudiantId },
        select: { etablissementId: true },
      })
      if (student?.etablissementId && student.etablissementId !== user.etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez démarrer une session que pour les étudiants de votre établissement.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: can start sessions for students in their establishment
      const student = await db.user.findUnique({
        where: { id: etudiantId },
        select: { etablissementId: true },
      })
      if (student?.etablissementId && student.etablissementId !== user.etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez démarrer une session que pour les étudiants de votre établissement.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the student's establishment
      const student = await db.user.findUnique({
        where: { id: etudiantId },
        select: { etablissementId: true },
      })
      if (student?.etablissementId) {
        const accessError = await requireAdminEtablissementAccess(user, student.etablissementId)
        if (accessError) return accessError
      }
    }

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

    if (epreuve.statut === 'CLOTUREE') {
      return NextResponse.json(
        { error: 'Cette épreuve est clôturée, les soumissions ne sont plus acceptées', code: 'EPREUVE_CLOTUREE' },
        { status: 403 }
      )
    }

    const etudiant = await db.user.findUnique({
      where: { id: etudiantId },
      select: { filiereId: true, niveau: true, role: true },
    })
    if (!etudiant) {
      return NextResponse.json({ error: 'Étudiant non trouvé' }, { status: 404 })
    }

    if (epreuve.filiereId && etudiant.filiereId && epreuve.filiereId !== etudiant.filiereId) {
      return NextResponse.json(
        { error: 'Vous n\'êtes pas autorisé à passer cette épreuve (filière non correspondante)', code: 'NOT_AUTHORIZED' },
        { status: 403 }
      )
    }

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
        // Ignore parse errors
      }
    }

    const currentTime = new Date()
    const gracePeriodEnd = new Date(epreuve.dateFin.getTime() + (epreuve.delaiGrace || 3) * 60 * 1000)
    if (currentTime >= gracePeriodEnd) {
      return NextResponse.json(
        { error: 'Le délai de grâce est expiré, les soumissions ne sont plus acceptées', code: 'GRACE_PERIOD_EXPIRED' },
        { status: 403 }
      )
    }

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

    const now = new Date()

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
async function _PUT(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const { sessionId, questionId, contenu, alerte } = body

    if (!sessionId || !questionId) {
      return NextResponse.json(
        { error: 'Session et question requises' },
        { status: 400 }
      )
    }

    const session = await db.sessionPassation.findUnique({
      where: { id: sessionId },
      include: { epreuve: { select: { enseignantId: true, enseignant: { select: { etablissementId: true } } } } },
    })

    if (!session || session.statut !== 'EN_COURS') {
      return NextResponse.json(
        { error: 'Session non active' },
        { status: 400 }
      )
    }

    // ─── Tenant isolation for PUT ───
    if (user.role === 'ETUDIANT') {
      // ETUDIANT: can only save answers for their own sessions
      if (session.etudiantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez sauvegarder que vos propres sessions.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: can only save for sessions on their own epreuves
      if (session.epreuve.enseignantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez intervenir que sur les sessions de vos épreuves.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess
      const epreuveEtabId = session.epreuve.enseignant?.etablissementId
      if (epreuveEtabId) {
        const accessError = await requireAdminEtablissementAccess(user, epreuveEtabId)
        if (accessError) return accessError
      }
    }

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

    if (alerte) {
      const currentLogs = session.logEvents ? JSON.parse(session.logEvents) : []
      currentLogs.push({
        type: alerte.type,
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

    let displayPropositions = propositions
    if (propositions && AUTO_GRADABLE_TYPES.includes(qType)) {
      const mapping = storedMappings?.[qId]
      if (mapping && mapping.length === propositions.length) {
        displayPropositions = applyMapping(propositions, mapping)
      } else if (melangePropositions && propositions.length > 1) {
        const result = shuffleArrayWithMapping(propositions)
        displayPropositions = result.shuffled
      }
    }

    // For CODE questions, extract CODE-specific fields before stripping reponseCorrecte
    const codeFields: Record<string, unknown> = {}
    if (qType === 'CODE') {
      if (q.langage) codeFields.langage = String(q.langage)
      if (q.codeInitial) codeFields.codeInitial = String(q.codeInitial)
      if (q.fonctionSignature) codeFields.fonctionSignature = String(q.fonctionSignature)
      if (Array.isArray(q.testsPublics)) codeFields.testsPublics = q.testsPublics
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
        reponseCorrecte: undefined,
        explication: undefined,
        ...codeFields,
      },
    }
  })

  if (melangeQuestions) {
    questions = shuffleArrayWithMapping(questions).shuffled
    questions = questions.map((q, idx) => ({ ...q, ordre: idx }))
  }

  return questions
}

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
    // For CODE questions, extract CODE-specific fields from reponseCorrecte JSON before stripping it
    let codeFields: Record<string, unknown> = {}
    if (eq.question.type === 'CODE' && eq.question.reponseCorrecte) {
      try {
        const parsed = JSON.parse(eq.question.reponseCorrecte)
        if (parsed && typeof parsed === 'object') {
          if (parsed.langage) codeFields.langage = String(parsed.langage)
          if (parsed.codeInitial) codeFields.codeInitial = String(parsed.codeInitial)
          if (parsed.fonctionSignature) codeFields.fonctionSignature = String(parsed.fonctionSignature)
          if (Array.isArray(parsed.testsPublics)) codeFields.testsPublics = parsed.testsPublics
        }
      } catch {
        // reponseCorrecte is not valid JSON — ignore
      }
    }

    const questionObj: Record<string, unknown> = {
      ...eq.question,
      propositions: eq.question.propositions ? JSON.parse(eq.question.propositions) : null,
      reponseCorrecte: undefined,
      explication: undefined,
      themes: eq.question.themes ? JSON.parse(eq.question.themes) : null,
      // Inject CODE-specific fields extracted from reponseCorrecte
      ...codeFields,
    }

    if (AUTO_GRADABLE_TYPES.includes(eq.question.type) && eq.question.propositions) {
      const originalProps = JSON.parse(eq.question.propositions) as string[]
      const mapping = storedMappings?.[eq.questionId]
      if (mapping && mapping.length === originalProps.length) {
        questionObj.propositions = applyMapping(originalProps, mapping)
      } else if (melangePropositions && originalProps.length > 1) {
        questionObj.propositions = shuffleArrayWithMapping(originalProps).shuffled
      }
    }

    return { ...eq, ordre: idx, question: questionObj }
  })
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
export const POST = withAuth(_POST, ['ETUDIANT', 'RESPONSABLE', 'ENSEIGNANT', 'ADMIN'])
export const PUT = withAuth(_PUT, ['ETUDIANT', 'ENSEIGNANT', 'ADMIN'])
