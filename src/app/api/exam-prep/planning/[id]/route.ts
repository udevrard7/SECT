import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

/**
 * PATCH /api/exam-prep/planning/[id]
 *
 * Met à jour le statut d'une session de révision (TERMINEE / ANNULEE).
 * Seul le propriétaire de la session peut la modifier.
 *
 * Body : { statut: 'TERMINEE' | 'ANNULEE' }
 */
async function _PATCH(
  request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id } = await context.params
    const body = (await request.json()) as { statut?: string }
    const { statut } = body

    if (!statut || !['TERMINEE', 'ANNULEE'].includes(statut)) {
      return NextResponse.json({ error: 'statut invalide (TERMINEE ou ANNULEE)' }, { status: 400 })
    }

    // Vérifie que la session appartient à l'utilisateur
    const session = await withRetry(() =>
      db.studySession.findUnique({
        where: { id },
        select: { id: true, userId: true },
      })
    )

    if (!session) {
      return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
    }

    if (session.userId !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    await withRetry(() =>
      db.studySession.update({
        where: { id },
        data: { statut },
      })
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[exam-prep/planning/[id]] PATCH error:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
  }
}

export const PATCH = withAuth(_PATCH, ['ETUDIANT'])
