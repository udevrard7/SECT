import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Save all answers at once (batch save)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { reponses, alerte } = body

    // Check session is still active
    const session = await db.sessionPassation.findUnique({
      where: { id },
    })

    if (!session || session.statut !== 'EN_COURS') {
      return NextResponse.json(
        { error: 'Session non active' },
        { status: 400 }
      )
    }

    // Save all answers
    if (reponses && typeof reponses === 'object') {
      for (const [questionId, contenu] of Object.entries(reponses)) {
        if (contenu !== undefined && contenu !== null && contenu !== '') {
          await db.reponse.upsert({
            where: {
              sessionId_questionId: { sessionId: id, questionId },
            },
            create: {
              sessionId: id,
              questionId,
              contenu: String(contenu),
            },
            update: {
              contenu: String(contenu),
            },
          })
        }
      }
    }

    // Handle alert
    if (alerte) {
      const currentLogs = session.logEvents ? JSON.parse(session.logEvents) : []
      currentLogs.push({
        type: alerte.type,
        timestamp: new Date().toISOString(),
        details: alerte.details || '',
      })

      await db.sessionPassation.update({
        where: { id },
        data: {
          logEvents: JSON.stringify(currentLogs),
          alertes: { increment: 1 },
        },
      })
    }

    return NextResponse.json({ saved: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Batch save error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la sauvegarde' },
      { status: 500 }
    )
  }
}
