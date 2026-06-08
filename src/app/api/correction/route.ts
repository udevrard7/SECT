import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { requireAdminEtablissementAccess } from '@/lib/tenant-access'

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    console.warn('[correction] Failed to parse JSON:', value?.slice(0, 80))
    return fallback
  }
}

async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const epreuveId = searchParams.get('epreuveId')

    if (!enseignantId) {
      return NextResponse.json({ error: 'Enseignant requis' }, { status: 400 })
    }

    // ─── Tenant isolation ───
    if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: enseignantId must be their own ID
      if (enseignantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez accéder qu\'à vos propres corrections.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: can see corrections for teachers in their establishment
      const teacher = await db.user.findUnique({
        where: { id: enseignantId },
        select: { etablissementId: true },
      })
      if (teacher?.etablissementId && teacher.etablissementId !== user.etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez voir les corrections que des enseignants de votre établissement.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the enseignant's establishment
      const teacher = await db.user.findUnique({
        where: { id: enseignantId },
        select: { etablissementId: true },
      })
      if (teacher?.etablissementId) {
        const accessError = await requireAdminEtablissementAccess(user, teacher.etablissementId)
        if (accessError) return accessError
      }
    }

    const where: Record<string, unknown> = {
      epreuve: { enseignantId, deletedAt: null },
      statut: { in: ['SOUMISE', 'CORRIGEE', 'RETOURNEE'] },
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

    const parsedSessions = sessions.map((session) => {
      const reponses = session.reponses.map((r) => ({
        ...r,
      }))

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
          langage?: string
          codeInitial?: string
          fonctionSignature?: string
          testsPublics?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
          testsPrives?: Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }>
        }
      }

      const unifiedQuestions: UnifiedQuestion[] = []

      for (const eq of session.epreuve.questions) {
        const questionData: UnifiedQuestion['question'] = {
          id: eq.question.id,
          type: eq.question.type,
          enonce: eq.question.enonce,
          propositions: safeJsonParse<string[] | null>(eq.question.propositions, null),
          reponseCorrecte: safeJsonParse<string | string[] | null>(eq.question.reponseCorrecte, null),
          explication: eq.question.explication || null,
          difficulte: eq.question.difficulte || 'MOYEN',
        }

        // Extract CODE-specific fields from reponseCorrecte JSON
        if (eq.question.type === 'CODE' && eq.question.reponseCorrecte) {
          try {
            const parsed = JSON.parse(eq.question.reponseCorrecte)
            if (parsed && typeof parsed === 'object') {
              if (parsed.langage) questionData.langage = String(parsed.langage)
              if (parsed.codeInitial) questionData.codeInitial = String(parsed.codeInitial)
              if (parsed.fonctionSignature) questionData.fonctionSignature = String(parsed.fonctionSignature)
              if (Array.isArray(parsed.testsPublics)) questionData.testsPublics = parsed.testsPublics
              if (Array.isArray(parsed.testsPrives)) questionData.testsPrives = parsed.testsPrives
              // Also extract the model solution if it's a string in reponseCorrecte
              if (typeof parsed.reponseCorrecte === 'string') {
                questionData.reponseCorrecte = parsed.reponseCorrecte
              }
            }
          } catch {
            // Not valid JSON — ignore
          }
        }

        unifiedQuestions.push({
          id: eq.id,
          questionId: eq.questionId,
          bareme: eq.bareme,
          ordre: eq.ordre,
          question: questionData,
        })
      }

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
              reponseCorrecte = q.reponseCorrecte as string | string[]
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
                // CODE-specific fields from contenu
                ...(String(q.type) === 'CODE' ? {
                  langage: q.langage ? String(q.langage) : undefined,
                  codeInitial: q.codeInitial ? String(q.codeInitial) : undefined,
                  fonctionSignature: q.fonctionSignature ? String(q.fonctionSignature) : undefined,
                  testsPublics: Array.isArray(q.testsPublics) ? q.testsPublics as Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }> : undefined,
                  testsPrives: Array.isArray(q.testsPrives) ? q.testsPrives as Array<{ nom: string; entree: string; sortieAttendue: string; description?: string }> : undefined,
                } : {}),
              },
            })
          }
        }
      }

      const autoTypes = ['QCU', 'QCM', 'CODE']
      const autoGradedQuestions = unifiedQuestions.filter((q) => autoTypes.includes(q.question.type))
      const autoGradedScore = autoGradedQuestions.reduce((sum, q) => {
        const rep = reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
        return sum + (rep?.score ?? 0)
      }, 0)
      const autoGradedTotal = autoGradedQuestions.reduce((sum, q) => sum + q.bareme, 0)

      const manualQuestions = unifiedQuestions.filter((q) =>
        ['QRC', 'TRS', 'REFLEXION'].includes(q.question.type) ||
        (q.question.type === 'CODE' && (() => {
          const rep = reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
          return !rep || rep.score === null
        })())
      )

      const needsCorrection = manualQuestions.filter((q) => {
        const reponse = reponses.find((r) => r.questionId === q.questionId || r.questionId === q.id)
        return !reponse || reponse.score === null
      })

      const allCorrected = needsCorrection.length === 0

      return {
        ...session,
        logEvents: safeJsonParse(session.logEvents, null),
        reponses,
        epreuve: {
          ...session.epreuve,
          questions: manualQuestions,
        },
        resultat: session.resultat ? {
          ...session.resultat,
          detailParQuestion: safeJsonParse(session.resultat.detailParQuestion, null),
          commentaires: safeJsonParse(session.resultat.commentaires, null),
        } : null,
        needsCorrectionCount: needsCorrection.length,
        allCorrected,
        autoGradedScore,
        autoGradedTotal,
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

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
