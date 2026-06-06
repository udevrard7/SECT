import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  shuffleArrayWithMapping,
  applyMapping,
  parsePropositionMappings,
  AUTO_GRADABLE_TYPES,
} from '@/lib/grading'

// Helper: shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Helper: convert contenu propositions to string array
function normalizePropositions(propositions: unknown): string[] | null {
  if (!propositions) return null
  if (Array.isArray(propositions)) {
    // If propositions are objects [{id, text}], extract text values
    if (propositions.length > 0 && typeof propositions[0] === 'object' && propositions[0] !== null) {
      return propositions.map((p: Record<string, unknown>) => String(p.text || p.id || ''))
    }
    // If propositions are already strings
    return propositions.map((p: unknown) => String(p))
  }
  return null
}

// GET /api/epreuves/[id]/questions
// Returns questions for an epreuve in the ExamQuestion format expected by the passation page.
// Handles BOTH formats: contenu JSONB and EpreuveQuestion relation.
// NEVER sends reponseCorrecte or explication to the student client.
// Accepts optional ?sessionId= parameter to use stored proposition mappings for consistent display.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Load stored proposition mappings if sessionId is provided
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

    // Check if epreuve uses contenu JSONB format
    const contenu = epreuve.contenu as Record<string, unknown> | null
    const hasContenuQuestions = contenu &&
      typeof contenu === 'object' &&
      Array.isArray(contenu.questions) &&
      contenu.questions.length > 0

    if (hasContenuQuestions) {
      // ── New format: contenu JSONB ──
      const contenuQuestions = contenu.questions as Array<Record<string, unknown>>

      let questionsForStudent = contenuQuestions.map((q, idx) => {
        const qId = String(q.id || `contenu-q${idx}`)
        const qType = String(q.type || 'QRC')
        const propositions = normalizePropositions(q.propositions)

        // Determine proposition order using stored mappings if available
        let displayPropositions = propositions
        if (propositions && AUTO_GRADABLE_TYPES.includes(qType)) {
          const mapping = storedMappings[qId]
          if (mapping && mapping.length === propositions.length) {
            // Use stored mapping to reproduce the same shuffle order
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
          },
        }
      })

      // Shuffle questions if enabled
      if (epreuve.melangeQuestions) {
        questionsForStudent = shuffleArray(questionsForStudent)
      }

      // Re-assign ordre after shuffle
      questionsForStudent = questionsForStudent.map((q, idx) => ({
        ...q,
        ordre: idx,
      }))

      return NextResponse.json(questionsForStudent)
    }

    // ── Old format: EpreuveQuestion relation ──
    let questionsForStudent = epreuve.questions.map((eq) => {
      const questionObj: Record<string, unknown> = {
        ...eq.question,
        propositions: eq.question.propositions ? JSON.parse(eq.question.propositions as string) : null,
        reponseCorrecte: undefined, // Never send correct answers to client!
        explication: undefined, // Never send explanations to client!
        themes: eq.question.themes ? JSON.parse(eq.question.themes as string) : null,
      }

      // Determine proposition order for QCU/QCM using stored mappings
      if (
        AUTO_GRADABLE_TYPES.includes(eq.question.type) &&
        eq.question.propositions
      ) {
        const originalProps = JSON.parse(eq.question.propositions) as string[]
        const mapping = storedMappings[eq.questionId]
        if (mapping && mapping.length === originalProps.length) {
          // Use stored mapping to reproduce the same shuffle order
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

    // Shuffle questions if enabled
    if (epreuve.melangeQuestions) {
      questionsForStudent = shuffleArray(questionsForStudent)
      // Re-assign ordre after shuffle
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
