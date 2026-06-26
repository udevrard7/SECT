import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { verifySelfAccess, requireAdminEtablissementAccess } from '@/lib/tenant-access'

// ─── Helpers ───

/**
 * Compute the true median of an ALREADY sorted array of scores.
 * - For odd n: returns the middle element.
 * - For even n: returns the average of the two middle elements.
 * - For empty input: returns 0.
 *
 * IMPORTANT: callers MUST pass a sorted copy — `Array.prototype.sort` mutates
 * in place, so we never sort the original Prisma result array.
 */
function calculateMedian(sortedScores: number[]): number {
  const n = sortedScores.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  return n % 2 !== 0
    ? sortedScores[mid]
    : (sortedScores[mid - 1] + sortedScores[mid]) / 2
}

async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const etudiantId = searchParams.get('etudiantId')
    const epreuveId = searchParams.get('epreuveId')

    // ─── Tenant scoping for etudiantId branch ───
    if (etudiantId) {
      // ETUDIANT: must be their own ID
      if (user.role === 'ETUDIANT') {
        const selfCheck = verifySelfAccess(user, etudiantId)
        if (selfCheck) return selfCheck
      }
      // ADMIN: must have EtablissementAccess for the student's establishment
      if (user.role === 'ADMIN') {
        const student = await db.user.findUnique({
          where: { id: etudiantId },
          select: { etablissementId: true },
        })
        if (student?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, student.etablissementId)
          if (accessError) return accessError
        }
      }
    }

    if (etudiantId) {
      // Student: get own results
      const sessions = await db.sessionPassation.findMany({
        where: {
          etudiantId,
          statut: { in: ['SOUMISE', 'CORRIGEE', 'RETOURNEE'] },
        },
        include: {
          epreuve: {
            select: {
              id: true,
              titre: true,
              description: true,
              duree: true,
              noteTotal: true,
              dateFin: true,
              contenu: true,
              enseignant: { select: { name: true } },
              questions: {
                include: {
                  question: {
                    select: { id: true, type: true, enonce: true, difficulte: true },
                  },
                },
                orderBy: { ordre: 'asc' },
              },
            },
          },
          reponses: true,
          resultat: true,
        },
        orderBy: { dateFin: 'desc' },
      })

      const parsedSessions = sessions.map((session) => {
        // Build unified questions from both formats
        type ContenuQuestion = { id?: unknown; type?: unknown; enonce?: unknown; difficulte?: unknown; bareme?: unknown }
        const manualQuestions = session.epreuve.questions.map((eq) => ({
          ...eq,
          question: {
            ...eq.question,
          },
        }))

        // Build unified questions list
        let unifiedQuestions: Array<typeof manualQuestions[number] | {
          id: string; questionId: string; bareme: number; ordre: number;
          question: { id: string; type: string; enonce: string; difficulte: string }
        }> = [...manualQuestions]

        // Add questions from contenu JSONB if no EpreuveQuestion relations
        if (unifiedQuestions.length === 0 && session.epreuve.contenu) {
          const contenuData = session.epreuve.contenu as Record<string, unknown> | null
          if (contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)) {
            const contenuQuestions = contenuData.questions as Array<ContenuQuestion>
            unifiedQuestions = contenuQuestions.map((q, idx) => ({
              id: String(q.id || `contenu-q${idx}`),
              questionId: String(q.id || `contenu-q${idx}`),
              bareme: typeof q.bareme === 'number' ? q.bareme : 1,
              ordre: idx,
              question: {
                id: String(q.id || `contenu-q${idx}`),
                type: String(q.type || 'QRC') as 'QCU' | 'QCM' | 'QRC' | 'TRS' | 'REFLEXION' | 'CODE',
                enonce: String(q.enonce || ''),
                difficulte: String(q.difficulte || 'MOYEN') as 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT',
              },
            }))
          }
        }

        return {
          ...session,
          logEvents: null,
          epreuve: {
            ...session.epreuve,
            questions: unifiedQuestions,
          },
          resultat: session.resultat ? {
            ...session.resultat,
            detailParQuestion: session.resultat.detailParQuestion
              ? JSON.parse(session.resultat.detailParQuestion)
              : null,
          } : null,
        }
      })

      return NextResponse.json({ resultats: parsedSessions })
    }

    if (epreuveId) {
      // ─── Teacher: get all results for an exam ───

      // Single query for ownership check + noteTotal (default 20 if missing/legacy).
      const epreuve = await db.epreuve.findUnique({
        where: { id: epreuveId },
        select: {
          enseignantId: true,
          noteTotal: true,
          enseignant: { select: { etablissementId: true } },
        },
      })

      // ENSEIGNANT: 404 if not found, 403 if not owner.
      if (user.role === 'ENSEIGNANT') {
        if (!epreuve) {
          return NextResponse.json(
            { error: 'Épreuve non trouvée.' },
            { status: 404 }
          )
        }
        if (epreuve.enseignantId !== user.id) {
          return NextResponse.json(
            { error: 'Accès refusé. Vous ne pouvez voir les résultats que de vos propres épreuves.' },
            { status: 403 }
          )
        }
      }

      // RESPONSABLE: must be in their establishment (skip silently if epreuve is null
      // for backward compat — the queries below will simply return empty results).
      if (user.role === 'RESPONSABLE' && epreuve) {
        const eTab = epreuve.enseignant?.etablissementId
        if (eTab && eTab !== user.etablissementId) {
          return NextResponse.json(
            { error: 'Accès refusé. Vous ne pouvez voir les résultats que dans votre établissement.' },
            { status: 403 }
          )
        }
      }

      // ADMIN: must have EtablissementAccess for the epreuve's establishment.
      if (user.role === 'ADMIN' && epreuve?.enseignant?.etablissementId) {
        const accessError = await requireAdminEtablissementAccess(
          user,
          epreuve.enseignant.etablissementId
        )
        if (accessError) return accessError
      }

      const noteTotal: number = epreuve?.noteTotal ?? 20

      // ─── Pagination params ───
      // Default behaviour: no pagination (return all) for backward compatibility.
      // If either ?page or ?limit is present, paginated mode kicks in.
      const pageParam = searchParams.get('page')
      const limitParam = searchParams.get('limit')
      const hasPagination = pageParam !== null || limitParam !== null
      const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
      const limit = Math.max(1, parseInt(limitParam || '50', 10) || 50)
      const skip = (page - 1) * limit

      const scoreWhere = { epreuveId, score: { not: null } }

      // ─── Stats: aggregate + count + groupBy + score rows for median ───
      // Run all independent queries in parallel.
      const [agg, scoreRows, totalSessions, statusGroups] = await Promise.all([
        db.sessionPassation.aggregate({
          where: scoreWhere,
          _avg: { score: true },
          _min: { score: true },
          _max: { score: true },
          _count: { score: true },
        }),
        // Prisma has no native median — fetch only the `score` column (already sorted asc).
        db.sessionPassation.findMany({
          where: scoreWhere,
          select: { score: true },
          orderBy: { score: 'asc' },
        }),
        db.sessionPassation.count({ where: { epreuveId } }),
        db.sessionPassation.groupBy({
          by: ['statut'],
          where: { epreuveId },
          _count: { statut: true },
        }),
      ])

      const sortedScores: number[] = scoreRows
        .map((r) => r.score)
        .filter((s): s is number => s !== null)

      const scoredCount = agg._count.score ?? 0
      const moyenne = agg._avg.score ?? 0
      const min = agg._min.score ?? 0
      const max = agg._max.score ?? 0
      const mediane = calculateMedian(sortedScores)
      const passThreshold = noteTotal / 2 // e.g. 10/20, 50/100
      const reussite = sortedScores.filter((s) => s >= passThreshold).length
      const tauxReussite = sortedScores.length > 0
        ? Math.round((reussite / sortedScores.length) * 100)
        : 0
      const soumis = statusGroups.find((g) => g.statut === 'SOUMISE')?._count.statut ?? 0
      // RETOURNEE = fully corrected copies too (teacher finalized → direct SOUMISE→RETOURNEE)
      const corrigeesGroup = statusGroups.find((g) => g.statut === 'CORRIGEE')?._count.statut ?? 0
      const retourneesGroup = statusGroups.find((g) => g.statut === 'RETOURNEE')?._count.statut ?? 0
      const corriges = corrigeesGroup + retourneesGroup

      const moyennePct = noteTotal > 0
        ? Math.round((moyenne / noteTotal) * 1000) / 10
        : 0
      const medianePct = noteTotal > 0
        ? Math.round((mediane / noteTotal) * 1000) / 10
        : 0

      const stats = {
        totalSessions,
        soumis,
        corriges,
        moyenne: Math.round(moyenne * 100) / 100,
        mediane: Math.round(mediane * 100) / 100,
        min,
        max,
        tauxReussite,
        // ─── New normalized fields ───
        noteTotal,
        moyennePct,
        medianePct,
      }

      // ─── Paginated sessions list ───
      // Keep `resultat` (needed for detail dialog), drop `reponses` (heavy, unused in table).
      // The detail dialog can fetch reponses separately if needed.
      const sessions = await db.sessionPassation.findMany({
        where: { epreuveId },
        include: {
          etudiant: { select: { id: true, name: true, email: true, filiere: true } },
          resultat: true,
        },
        orderBy: { score: 'desc' },
        ...(hasPagination ? { take: limit, skip } : {}),
      })

      const totalPages = hasPagination
        ? Math.max(1, Math.ceil(totalSessions / limit))
        : 1

      return NextResponse.json({
        sessions: sessions.map((s) => ({
          ...s,
          resultat: s.resultat ? {
            ...s.resultat,
            detailParQuestion: s.resultat.detailParQuestion
              ? JSON.parse(s.resultat.detailParQuestion)
              : null,
          } : null,
        })),
        stats,
        noteTotal,
        pagination: {
          page: hasPagination ? page : 1,
          limit: hasPagination ? limit : totalSessions,
          total: totalSessions,
          totalPages,
        },
      })
    }

    return NextResponse.json({ error: 'etudiantId ou epreuveId requis' }, { status: 400 })
  } catch (error) {
    console.error('Get resultats error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des résultats' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
