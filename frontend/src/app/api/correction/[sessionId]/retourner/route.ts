import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { verifyCorrectionOwnership } from '@/lib/correction-access'

// Return graded copies to students (CORRIGEE → RETOURNEE)
export const POST = withAuth(
  async (
    request: NextRequest,
    { params, user }: { params: Promise<{ sessionId: string }>; user: AuthenticatedUser }
  ) => {
    try {
    const { sessionId } = await params

    const session = await db.sessionPassation.findUnique({
      where: { id: sessionId },
      include: {
        resultat: true,
        epreuve: { select: { enseignantId: true } },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
    }

    // ─── Ownership check ───
    const ownershipError = await verifyCorrectionOwnership(user, session.epreuve.enseignantId)
    if (ownershipError) return ownershipError

    if (session.statut !== 'CORRIGEE') {
      return NextResponse.json(
        { error: 'Seules les sessions corrigées peuvent être retournées' },
        { status: 400 }
      )
    }

    // Update session status
    await db.sessionPassation.update({
      where: { id: sessionId },
      data: { statut: 'RETOURNEE' },
    })

    // Update resultat with return date
    if (session.resultat) {
      await db.resultat.update({
        where: { id: session.resultat.id },
        data: { dateRetour: new Date() },
      })
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'RETURN_COPIES',
        entite: 'SessionPassation',
        entiteId: sessionId,
        details: `Copie retournée à l'étudiant`,
      },
    })

    return NextResponse.json({
      message: 'Copie retournée à l\'étudiant',
      statut: 'RETOURNEE',
    })
  } catch (error) {
    console.error('Return copies error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du retour des copies' },
      { status: 500 }
    )
  }
  },
  ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT']
)
