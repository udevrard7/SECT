import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

// ─── POST /api/certificats/[id]/revoquer ───
// Revoke a certificate (ENSEIGNANT/RESPONSABLE/ADMIN only)
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
    const { user } = context
    const body = await request.json()
    const { raison } = body

    if (!raison || typeof raison !== 'string' || raison.trim().length === 0) {
      return NextResponse.json(
        { error: 'La raison de la révocation est requise.' },
        { status: 400 }
      )
    }

    // Fetch the certificate
    const certificat = await withRetry(() =>
      db.certificat.findUnique({
        where: { id },
      })
    )

    if (!certificat) {
      return NextResponse.json(
        { error: 'Certificat non trouvé.' },
        { status: 404 }
      )
    }

    // Check if already revoked
    if (certificat.statut === 'REVOQUE') {
      return NextResponse.json(
        { error: 'Ce certificat est déjà révoqué.' },
        { status: 400 }
      )
    }

    // Revoke the certificate
    const updated = await withRetry(() =>
      db.certificat.update({
        where: { id },
        data: {
          statut: 'REVOQUE',
          dateRevocation: new Date(),
          raisonRevocation: raison.trim(),
        },
      })
    )

    // Log the revocation
    await withRetry(() =>
      db.auditLog.create({
        data: {
          userId: user.id,
          userEmail: user.email,
          action: 'REVOQUER_CERTIFICAT',
          entite: 'Certificat',
          entiteId: id,
          details: `Certificat ${certificat.codeVerification} révoqué par ${user.name} (${user.role}). Raison: ${raison.trim()}`,
        },
      })
    )

    return NextResponse.json({
      message: 'Certificat révoqué avec succès.',
      certificat: updated,
    })
  } catch (error) {
    console.error('Revoke certificat error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la révocation du certificat' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_POST, ['ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
