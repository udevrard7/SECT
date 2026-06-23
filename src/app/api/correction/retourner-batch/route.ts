import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { verifyCorrectionOwnership } from '@/lib/correction-access'

// Batch return all graded copies for an exam (CORRIGEE → RETOURNEE)
export const POST = withAuth(
  async (
    request: NextRequest,
    { user }: { params: any; user: AuthenticatedUser }
  ) => {
    try {
    const body = await request.json()
    const { epreuveId } = body

    if (!epreuveId) {
      return NextResponse.json({ error: 'epreuveId requis' }, { status: 400 })
    }

    // ─── Ownership check : charger l'épreuve pour obtenir l'enseignantId ───
    const epreuve = await db.epreuve.findUnique({
      where: { id: epreuveId },
      select: { enseignantId: true },
    })
    if (!epreuve) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }
    const ownershipError = await verifyCorrectionOwnership(user, epreuve.enseignantId)
    if (ownershipError) return ownershipError

    // Find all CORRIGEE sessions for this exam
    const sessions = await db.sessionPassation.findMany({
      where: {
        epreuveId,
        statut: 'CORRIGEE',
      },
      include: { resultat: true },
    })

    if (sessions.length === 0) {
      return NextResponse.json({ returned: 0, message: 'Aucune copie corrigée à retourner' })
    }

    let returnedCount = 0

    for (const session of sessions) {
      try {
        await db.sessionPassation.update({
          where: { id: session.id },
          data: { statut: 'RETOURNEE' },
        })

        if (session.resultat) {
          await db.resultat.update({
            where: { id: session.resultat.id },
            data: { dateRetour: new Date() },
          })
        }

        returnedCount++
      } catch {
        // Skip on individual error
      }
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'BATCH_RETURN_COPIES',
        entite: 'Epreuve',
        entiteId: epreuveId,
        details: `${returnedCount}/${sessions.length} copies retournées`,
      },
    })

    return NextResponse.json({
      returned: returnedCount,
      total: sessions.length,
      message: `${returnedCount}/${sessions.length} copies retournées aux étudiants`,
    })
  } catch (error) {
    console.error('Batch return error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du retour des copies' },
      { status: 500 }
    )
  }
  },
  ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT']
)
