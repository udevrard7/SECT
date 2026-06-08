import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  shuffleArrayWithMapping,
  applyMapping,
  parsePropositionMappings,
  AUTO_GRADABLE_TYPES,
} from '@/lib/grading'
import { withAuth } from '@/lib/auth-session'

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

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

async function _GET(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    const epreuve = await db.epreuve.findUnique({
      where: { id },
      select: {
        id: true,
        melangeQuestions: true,
        melangePropositions: true,
        contenu: true,
        questions: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                enonce: true,
                propositions: true,
                reponseCorrecte: true,
                difficulte: true,
                themes: true,
              },
            },
          },
          orderBy: { ordre: 'asc' },
        },
      },
    })

    if (!epreuve || epreuve.deletedAt) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    let storedMappings: Record<string, number[]> = {}
    if (sessionId) {
      const session = await db.sessionPassation.findUnique({
        where: { id: sessionId },
        select: { propositionMappings: true },
      })
      if (session?.propositionMappings) {
        storedMappings = parsePropositionMappings(session.propositionMappings)
      }
    }

    const contenu = epreuve.contenu as Record<string, unknown> | null
    const hasContenuQuestions = contenu &&
      typeof contenu === 'object' &&
      Array.isArray(contenu.questions) &&
      contenu.questions.length > 0

    if (hasContenuQuestions) {
      const contenuQuestions = contenu.questions as Array<Record<string, unknown>>

      let questionsForStudent = contenuQuestions.map((q, idx) => {
        const qId = String(q.id || `contenu-q${idx}`)
        const qType = String(q.type || 'QRC')
        const propositions = normalizePropositions(q.propositions)

        let displayPropositions = propositions
        if (propositions && AUTO_GRADABLE_TYPES.includes(qType)) {
          const mapping = storedMappings[qId]
          if (mapping && mapping.length === propositions.length) {
            displayPropositions = applyMapping(propositions, mapping)
          } else if (epreuve.melangePropositions && propositions.length > 1) {
            displayPropositions = shuffleArray([...propositions])
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
            // CODE-specific fields
            ...(qType === 'CODE' ? {
              langage: String(q.langage || 'javascript'),
              codeInitial: String(q.codeInitial || ''),
              fonctionSignature: String(q.fonctionSignature || ''),
              testsPublics: Array.isArray(q.testsPublics) ? q.testsPublics : [],
            } : {}),
          },
        }
      })

      if (epreuve.melangeQuestions) {
        questionsForStudent = shuffleArray(questionsForStudent)
      }

      questionsForStudent = questionsForStudent.map((q, idx) => ({
        ...q,
        ordre: idx,
      }))

      return NextResponse.json(questionsForStudent)
    }

    let questionsForStudent = epreuve.questions.map((eq) => {
      // For CODE questions, extract CODE-specific fields from reponseCorrecte JSON before stripping it
      let codeFields: Record<string, unknown> = {}
      if (eq.question.type === 'CODE' && eq.question.reponseCorrecte) {
        try {
          const parsed = JSON.parse(eq.question.reponseCorrecte as string)
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
        propositions: eq.question.propositions ? JSON.parse(eq.question.propositions as string) : null,
        reponseCorrecte: undefined,
        explication: undefined,
        themes: eq.question.themes ? JSON.parse(eq.question.themes as string) : null,
        // Inject CODE-specific fields extracted from reponseCorrecte
        ...codeFields,
      }

      if (
        AUTO_GRADABLE_TYPES.includes(eq.question.type) &&
        eq.question.propositions
      ) {
        const originalProps = JSON.parse(eq.question.propositions) as string[]
        const mapping = storedMappings[eq.questionId]
        if (mapping && mapping.length === originalProps.length) {
          questionObj.propositions = applyMapping(originalProps, mapping)
        } else if (epreuve.melangePropositions && originalProps.length > 1) {
          questionObj.propositions = shuffleArray([...originalProps])
        }
      }

      return {
        id: eq.id,
        questionId: eq.questionId,
        bareme: eq.bareme,
        ordre: eq.ordre,
        question: questionObj,
      }
    })

    if (epreuve.melangeQuestions) {
      questionsForStudent = shuffleArray(questionsForStudent)
      questionsForStudent = questionsForStudent.map((q, idx) => ({
        ...q,
        ordre: idx,
      }))
    }

    return NextResponse.json(questionsForStudent)
  } catch (error) {
    console.error('Get epreuve questions error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des questions' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
