import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

/**
 * POST /api/exam-prep/help/[id]/close
 *
 * Clôture un thread d'aide (statut → CLOS). Seul l'enseignant assigné
 * au thread (ou un admin/responsable) peut le clôturer.
 */
async function _POST(
  _request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id: threadId } = await context.params

    const thread = await withRetry(() =>
      db.helpThread.findUnique({
        where: { id: threadId },
        select: { id: true, enseignantId: true, etudiantId: true },
      })
    )

    if (!thread) {
      return NextResponse.json({ error: 'Thread introuvable' }, { status: 404 })
    }

    // Seul l'enseignant assigné (ou admin/resp) peut clore
    const canClose =
      user.role === 'ADMIN' ||
      user.role === 'RESPONSABLE' ||
      (user.role === 'ENSEIGNANT' && thread.enseignantId === user.id)
    if (!canClose) {
      return NextResponse.json({ error: 'Non autorisé à clôturer ce thread' }, { status: 403 })
    }

    await withRetry(() =>
      db.helpThread.update({
        where: { id: threadId },
        data: { statut: 'CLOS', updatedAt: new Date() },
      })
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[exam-prep/help/close] error:', error)
    return NextResponse.json({ error: 'Erreur lors de la clôture' }, { status: 500 })
  }
}

export const POST = withAuth(_POST, ['ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
