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

    // Store a compressed thumbnail alongside the capture event
    // We keep the full image as a data URL so the teacher can view it later
    // For production, upload to S3/cloud storage and store only the URL
    const thumbnail = image // Store full capture for teacher review

    // Log the capture event in logEvents with the thumbnail embedded
    const currentLogs = session.logEvents ? JSON.parse(session.logEvents) : []
    currentLogs.push({
      type: 'SCREEN_CAPTURE',
      timestamp: new Date().toISOString(),
      details: 'Capture d\'écran périodique effectuée',
      imageLength: image.length,
      thumbnail, // Store the actual image data for teacher review
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
