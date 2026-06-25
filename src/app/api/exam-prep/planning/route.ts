import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { requireStudentScope, studentUeFilter } from '@/lib/exam-prep/scope'

/**
 * Planning de révision (StudySession).
 *
 * GET  /api/exam-prep/planning — liste les sessions de l'étudiant
 *      (filtres optionnels : ?statut=PLANIFIEE|EN_COURS|TERMINEE|ANNULEE,
 *       ?from=ISO&to=ISO pour plage de dates)
 * POST /api/exam-prep/planning — crée une session de révision planifiée.
 *
 * Body POST : { documentId?, chapterIds: string[], titre?, dateDebut: ISO, dureeMin?: number }
 */
async function _GET(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: Record<string, unknown> = { userId: user.id }
    if (statut) where.statut = statut
    if (from || to) {
      where.dateDebut = {}
      if (from) (where.dateDebut as Record<string, unknown>).gte = new Date(from)
      if (to) (where.dateDebut as Record<string, unknown>).lte = new Date(to)
    }

    const sessions = await withRetry(() =>
      db.studySession.findMany({
        where,
        orderBy: { dateDebut: 'asc' },
        include: {
          document: { select: { id: true, nomFichier: true } },
        },
      })
    )

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        ...s,
        chapterIds: s.chapterIds ? safeJsonParse<string[]>(s.chapterIds, []) : [],
      })),
    })
  } catch (error) {
    console.error('[exam-prep/planning] GET error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération du planning' }, { status: 500 })
  }
}

interface CreateBody {
  documentId?: string
  chapterIds?: string[]
  titre?: string
  dateDebut: string
  dureeMin?: number
}

async function _POST(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const body = (await request.json()) as CreateBody

    if (!body.dateDebut) {
      return NextResponse.json({ error: 'dateDebut est requis' }, { status: 400 })
    }

    const dateDebut = new Date(body.dateDebut)
    if (Number.isNaN(dateDebut.getTime())) {
      return NextResponse.json({ error: 'dateDebut invalide' }, { status: 400 })
    }

    const dureeMin = Math.min(Math.max(body.dureeMin ?? 30, 5), 480) // 5min..8h

    // Vérifie l'accès au document si fourni
    if (body.documentId) {
      const scope = requireStudentScope(user)
      if (scope.response) return scope.response
      const accessible = await withRetry(() =>
        db.document.findFirst({
          where: {
            id: body.documentId,
            deletedAt: null,
            uniteEnseignement: studentUeFilter(scope.filiereId, scope.niveau),
          },
          select: { id: true },
        })
      )
      if (!accessible) {
        return NextResponse.json({ error: 'Document non accessible' }, { status: 403 })
      }
    }

    const session = await withRetry(() =>
      db.studySession.create({
        data: {
          userId: user.id,
          documentId: body.documentId ?? null,
          chapterIds: Array.isArray(body.chapterIds) ? JSON.stringify(body.chapterIds) : null,
          titre: body.titre?.slice(0, 200) ?? null,
          dateDebut,
          dureeMin,
          statut: 'PLANIFIEE',
        },
      })
    )

    return NextResponse.json({ session: { ...session, chapterIds: body.chapterIds ?? [] } }, { status: 201 })
  } catch (error) {
    console.error('[exam-prep/planning] POST error:', error)
    return NextResponse.json({ error: 'Erreur lors de la création de la session' }, { status: 500 })
  }
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const GET = withAuth(_GET, ['ETUDIANT'])
export const POST = withAuth(_POST, ['ETUDIANT'])
