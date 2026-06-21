import { NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

/**
 * GET /api/epreuves/orphelines
 * Lists epreuves that are NOT attached to any UE (uniteEnseignementId = null).
 * These epreuves cannot produce certificates for their students.
 *
 * Scoping:
 *  - ENSEIGNANT: only their own epreuves
 *  - RESPONSABLE: epreuves of teachers in their establishment
 *  - ADMIN: epreuves of establishments they have access to
 *
 * Used by the alert banner on the Épreuves page so admins/teachers can
 * spot and fix orphan epreuves (assign them a UE).
 */
async function _GET(_request: Request, context: { params: unknown; user: { id: string; role: string; etablissementId: string | null } }) {
  try {
    const { user } = context

    const where: Record<string, unknown> = {
      uniteEnseignementId: null,
      deletedAt: null,
    }

    if (user.role === 'ENSEIGNANT') {
      where.enseignantId = user.id
    } else if (user.role === 'RESPONSABLE') {
      if (user.etablissementId) {
        // All epreuves whose teacher is in this establishment
        where.enseignant = { etablissementId: user.etablissementId }
      } else {
        // No establishment -> nothing to show
        return NextResponse.json({ orphelines: [], count: 0 })
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: rely on EtablissementAccess via a join if etablissementId is set,
      // otherwise show all (super-admin fallback)
      if (user.etablissementId) {
        where.enseignant = { etablissementId: user.etablissementId }
      }
    }
    // (no extra filter for other roles)

    const orphelines = await withRetry(() =>
      db.epreuve.findMany({
        where,
        select: {
          id: true,
          titre: true,
          filiereId: true,
          niveau: true,
          noteTotal: true,
          createdAt: true,
          filiere: { select: { id: true, nom: true, code: true } },
          enseignant: { select: { id: true, name: true } },
          _count: { select: { sessions: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    )

    return NextResponse.json({
      count: orphelines.length,
      orphelines: orphelines.map((e) => ({
        id: e.id,
        titre: e.titre,
        niveau: e.niveau,
        noteTotal: e.noteTotal,
        createdAt: e.createdAt,
        filiere: e.filiere
          ? { id: e.filiere.id, nom: e.filiere.nom, code: e.filiere.code }
          : null,
        enseignant: e.enseignant
          ? { id: e.enseignant.id, name: e.enseignant.name }
          : null,
        sessionsCount: e._count.sessions,
      })),
    })
  } catch (error) {
    console.error('Get orphelines error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des épreuves orphelines' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
