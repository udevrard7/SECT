import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Batch return all graded copies for an exam (CORRIGEE → RETOURNEE)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { epreuveId } = body

    if (!epreuveId) {
      return NextResponse.json({ error: 'epreuveId requis' }, { status: 400 })
    }

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
        userId: 'system',
        userEmail: 'system',
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
}
