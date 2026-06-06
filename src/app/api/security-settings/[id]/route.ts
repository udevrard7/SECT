import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/security-settings/[id] — Get security settings by ID
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const securitySettings = await db.securitySettings.findUnique({
      where: { id },
      include: {
        etablissement: {
          select: { id: true, nom: true, type: true, ville: true, actif: true },
        },
      },
    })

    if (!securitySettings) {
      return NextResponse.json(
        { error: 'Paramètres de sécurité non trouvés' },
        { status: 404 }
      )
    }

    return NextResponse.json({ securitySettings })
  } catch (error) {
    console.error('Error fetching security settings:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération' },
      { status: 500 }
    )
  }
}

// PATCH /api/security-settings/[id] — Update security settings
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Verify existence
    const existing = await db.securitySettings.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Paramètres de sécurité non trouvés' },
        { status: 404 }
      )
    }

    const data: Record<string, unknown> = {}

    // Boolean toggles
    if (body.proctoringActif !== undefined) data.proctoringActif = body.proctoringActif
    if (body.detectionCopie !== undefined) data.detectionCopie = body.detectionCopie
    if (body.detectionOnglet !== undefined) data.detectionOnglet = body.detectionOnglet
    if (body.detectionFullscreen !== undefined) data.detectionFullscreen = body.detectionFullscreen
    if (body.blocageCopie !== undefined) data.blocageCopie = body.blocageCopie
    if (body.blocageClicDroit !== undefined) data.blocageClicDroit = body.blocageClicDroit
    if (body.blocageImpression !== undefined) data.blocageImpression = body.blocageImpression
    if (body.verificationIdentite !== undefined) data.verificationIdentite = body.verificationIdentite
    if (body.autoSubmitOnViolation !== undefined) data.autoSubmitOnViolation = body.autoSubmitOnViolation
    if (body.captureEcran !== undefined) data.captureEcran = body.captureEcran
    if (body.rapportFraude !== undefined) data.rapportFraude = body.rapportFraude
    if (body.fullscreenObligatoire !== undefined) data.fullscreenObligatoire = body.fullscreenObligatoire

    // Numeric thresholds
    if (body.tempsInactiviteMax !== undefined) data.tempsInactiviteMax = body.tempsInactiviteMax
    if (body.nbOngletsMax !== undefined) data.nbOngletsMax = body.nbOngletsMax
    if (body.nbAlertesMax !== undefined) data.nbAlertesMax = body.nbAlertesMax
    if (body.seuilSimilarite !== undefined) data.seuilSimilarite = body.seuilSimilarite
    if (body.penaliteFullscreenExit !== undefined) data.penaliteFullscreenExit = body.penaliteFullscreenExit
    if (body.intervalleCaptureEcran !== undefined) data.intervalleCaptureEcran = body.intervalleCaptureEcran

    const securitySettings = await db.securitySettings.update({
      where: { id },
      data,
      include: {
        etablissement: {
          select: { id: true, nom: true, type: true, ville: true, actif: true },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'SecuritySettings',
        entiteId: id,
        details: JSON.stringify(data),
      },
    })

    return NextResponse.json({ securitySettings })
  } catch (error) {
    console.error('Error updating security settings:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    )
  }
}

// DELETE /api/security-settings/[id] — Delete security settings
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const securitySettings = await db.securitySettings.delete({
      where: { id },
      select: { id: true, etablissementId: true },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'SecuritySettings',
        entiteId: id,
        details: JSON.stringify({ etablissementId: securitySettings.etablissementId }),
      },
    })

    return NextResponse.json({
      message: 'Paramètres de sécurité supprimés',
      securitySettings,
    })
  } catch (error) {
    console.error('Error deleting security settings:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression' },
      { status: 500 }
    )
  }
}
