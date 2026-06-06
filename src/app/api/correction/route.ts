import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Safe JSON.parse that returns fallback instead of throwing */
function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    console.warn('[correction] Failed to parse JSON:', value?.slice(0, 80))
    return fallback
  }
}

// Get sessions needing correction for a teacher
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const epreuveId = searchParams.get('epreuveId')

    if (!enseignantId) {
      return NextResponse.json({ error: 'Enseignant requis' }, { status: 400 })
    }

    // Find all submitted sessions for this teacher's exams
    // IMPORTANT: Must include deletedAt: null on epreuve relation to match
    // the epreuves list filter (which uses deletedAt: null). Without this,
    // sessions for soft-deleted epreuves could appear.
    const where: Record<string, unknown> = {
      epreuve: { enseignantId, deletedAt: null },
      statut: { in: ['SOUMISE', 'CORRIGEE', 'RETOURNEE', 'NON_SOUMIS'] },
    }
    if (epreuveId) where.epreuveId = epreuveId

    const sessions = await db.sessionPassation.findMany({
      where,
      orderBy: { dateFin: 'asc' },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
        epreuve: {
          select: {
            id: true,
            titre: true,
            duree: true,
            statut: true,
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
                    explication: true,
                    difficulte: true,
                  },
                },
              },
              orderBy: { ordre: 'asc' },
            },
          },
        },
        reponses: true,
        resultat: true,
      },
    })

    // Parse JSON fields and identify which need manual correction
    const parsedSessions = sessions.map((session) => {
      const reponses = session.reponses.map((r) => ({
        ...r,
      }))

      // Build unified questions list from EpreuveQuestion + contenu JSONB
      type UnifiedQuestion = {
        id: string
        questionId: string
        bareme: number
        ordre: number
        question: {
          id: string
          type: string
          enonce: string
          propositions: string[] | null
          reponseCorrecte: string | string[] | null
          explication: string | null
          difficulte: string
        }
      }

      const unifiedQuestions: UnifiedQuestion[] = []

      // From EpreuveQuestion relations
      for (const eq of session.epreuve.questions) {
        unifiedQuestions.push({
          id: eq.id,
          questionId: eq.questionId,
          bareme: eq.bareme,
          ordre: eq.ordre,
          question: {
            id: eq.question.id,
            type: eq.question.type,
            enonce: eq.question.enonce,
            propositions: safeJsonParse<string[] | null>(eq.question.propositions, null),
            reponseCorrecte: safeJsonParse<string | string[] | null>(eq.question.reponseCorrecte, null),
            explication: eq.question.explication || null,
            difficulte: eq.question.difficulte || 'MOYEN',
          },
        })
      }

      // From contenu JSONB if no EpreuveQuestion relations
      if (unifiedQuestions.length === 0 && session.epreuve.contenu) {
        const contenuData = session.epreuve.contenu as Record<string, unknown> | null
        if (contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)) {
          const contenuQuestions = contenuData.questions as Array<Record<string, unknown>>
          for (let idx = 0; idx < contenuQuestions.length; idx++) {
            const q = contenuQuestions[idx]
            const propositions = q.propositions
              ? (Array.isArray(q.propositions)
                ? q.propositions.map((p: unknown) => typeof p === 'object' && p !== null ? String((p as Record<string, unknown>).text || (p as Record<string, unknown>).id || '') : String(p))
                : null)
              : null
            let reponseCorrecte: string | string[] | null = null
            if (q.reponseCorrecte) {
              reponseCorrecte = q.reponseCorrecte
              // Normalize: if it's a string like "A", keep as-is; if array, keep as array
            }

            unifiedQuestions.push({
              id: String(q.id || `contenu-q${idx}`),
              questionId: String(q.id || `contenu-q${idx}`),
              bareme: typeof q.bareme === 'number' ? q.bareme : 1,
              ordre: idx,
              question: {
                id: String(q.id || `contenu-q${idx}`),
                type: String(q.type || 'QRC'),
                enonce: String(q.enonce || ''),
                propositions,
                reponseCorrecte,
                explication: q.explication ? String(q.explication) : null,
                difficulte: String(q.difficulte || 'MOYEN'),
              },
            })
          }
        }
      }

      // Find QRC/TRS/REFLEXION answers that need manual correction
      const needsCorrection = unifiedQuestions.filter((q) => {
        if (!['QRC', 'TRS', 'REFLEXION'].includes(q.question.type)) return false
        const reponse = reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
        return !reponse || reponse.score === null
      })

      const allCorrected = unifiedQuestions.length > 0 && needsCorrection.length === 0

      return {
        ...session,
        logEvents: safeJsonParse(session.logEvents, null),
        reponses,
        epreuve: {
          ...session.epreuve,
          questions: unifiedQuestions,
        },
        resultat: session.resultat ? {
          ...session.resultat,
          detailParQuestion: safeJsonParse(session.resultat.detailParQuestion, null),
          commentaires: safeJsonParse(session.resultat.commentaires, null),
        } : null,
        needsCorrectionCount: needsCorrection.length,
        allCorrected,
      }
    })

    return NextResponse.json({ sessions: parsedSessions })
  } catch (error) {
    console.error('List corrections error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des corrections' },
      { status: 500 }
    )
  }
}
