import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { requireAdminEtablissementAccess } from '@/lib/tenant-access'

// GET — Récupérer la config filigrane certificat de l'établissement
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context

    if (!user.etablissementId) {
      return NextResponse.json(
        { error: 'Aucun établissement associé à votre compte.' },
        { status: 400 }
      )
    }

    const etab = await db.etablissement.findUnique({
      where: { id: user.etablissementId },
      select: {
        certWatermarkText: true,
        certWatermarkEnabled: true,
        certWatermarkOpacity: true,
        certWatermarkColor: true,
        certWatermarkPattern: true,
      },
    })

    if (!etab) {
      return NextResponse.json({ error: 'Établissement non trouvé.' }, { status: 404 })
    }

    return NextResponse.json({ config: etab })
  } catch (error) {
    console.error('Get cert watermark config:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH — Mettre à jour la config filigrane (RESPONSABLE ou ADMIN)
async function _PATCH(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context

    if (!user.etablissementId) {
      return NextResponse.json(
        { error: 'Aucun établissement associé à votre compte.' },
        { status: 400 }
      )
    }

    // ADMIN: verify access
    if (user.role === 'ADMIN') {
      const accessError = await requireAdminEtablissementAccess(user, user.etablissementId)
      if (accessError) return accessError
    }

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.certWatermarkText !== undefined) {
      const text = String(body.certWatermarkText).trim()
      updateData.certWatermarkText = text || null
    }
    if (body.certWatermarkEnabled !== undefined) {
      updateData.certWatermarkEnabled = Boolean(body.certWatermarkEnabled)
    }
    if (body.certWatermarkOpacity !== undefined) {
      const opacity = parseFloat(body.certWatermarkOpacity)
      if (isNaN(opacity) || opacity < 0 || opacity > 0.5) {
        return NextResponse.json(
          { error: 'L\'opacité doit être entre 0 et 0.5' },
          { status: 400 }
        )
      }
      updateData.certWatermarkOpacity = opacity
    }
    if (body.certWatermarkColor !== undefined) {
      const color = String(body.certWatermarkColor).trim()
      // Accept hex colors (#RRGGBB) or named colors
      updateData.certWatermarkColor = color || null
    }
    if (body.certWatermarkPattern !== undefined) {
      const pattern = String(body.certWatermarkPattern).trim()
      const validPatterns = ['diamond', 'circle', 'text', 'none']
      if (!validPatterns.includes(pattern)) {
        return NextResponse.json(
          { error: `Motif invalide. Valeurs acceptées: ${validPatterns.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.certWatermarkPattern = pattern
    }

    const updated = await db.etablissement.update({
      where: { id: user.etablissementId },
      data: updateData,
      select: {
        certWatermarkText: true,
        certWatermarkEnabled: true,
        certWatermarkOpacity: true,
        certWatermarkColor: true,
        certWatermarkPattern: true,
      },
    })

    return NextResponse.json({ config: updated, message: 'Configuration mise à jour' })
  } catch (error) {
    console.error('Update cert watermark config:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export const GET = withAuth(_GET, ['RESPONSABLE', 'ADMIN'])
export const PATCH = withAuth(_PATCH, ['RESPONSABLE', 'ADMIN'])
