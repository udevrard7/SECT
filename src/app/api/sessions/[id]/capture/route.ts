import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

// POST /api/sessions/[id]/capture — Save a periodic screenshot capture
// 🔒 ETUDIANT only (must be the student assigned to this session)
const _postHandler = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }>; user: AuthenticatedUser }
) => {
  try {
    const { id } = await context.params
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

    // Verify the authenticated user is the student assigned to this session
    if (session.etudiantId !== context.user.id) {
      return NextResponse.json(
        { error: 'Vous n\'êtes pas autorisé à capturer pour cette session' },
        { status: 403 }
      )
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

export const POST = withAuth(_postHandler, ['ETUDIANT'])
