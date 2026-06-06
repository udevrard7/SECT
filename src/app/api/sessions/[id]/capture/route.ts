import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/sessions/[id]/capture — Save a periodic screenshot capture
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { image } = body // base64 data URL of the screenshot

    if (!image) {
      return NextResponse.json({ error: 'Image manquante' }, { status: 400 })
    }

    // Check session is still active
    const session = await db.sessionPassation.findUnique({
      where: { id },
    })

    if (!session || session.statut !== 'EN_COURS') {
      return NextResponse.json({ error: 'Session non active' }, { status: 400 })
    }

    // Log the capture event in logEvents (we store a reference, not the full image)
    const currentLogs = session.logEvents ? JSON.parse(session.logEvents) : []
    currentLogs.push({
      type: 'SCREEN_CAPTURE',
      timestamp: new Date().toISOString(),
      details: 'Capture d\'écran périodique effectuée',
      imageLength: image.length, // Track size for reference
      // Note: For production, upload the image to cloud storage (S3, etc.)
      // and store only the URL here. For now, we store a small thumbnail reference.
    })

    await db.sessionPassation.update({
      where: { id },
      data: {
        logEvents: JSON.stringify(currentLogs),
      },
    })

    return NextResponse.json({ saved: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Save capture error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la sauvegarde de la capture' },
      { status: 500 }
    )
  }
}
