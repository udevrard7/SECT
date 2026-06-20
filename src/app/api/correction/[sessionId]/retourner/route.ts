import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Return graded copies to students (CORRIGEE → RETOURNEE)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params

    const session = await db.sessionPassation.findUnique({
      where: { id: sessionId },
      include: { resultat: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
    }

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
        userId: 'system',
        userEmail: 'system',
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
}
