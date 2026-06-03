import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/security-settings/etablissement/[etablissementId]
// Get security settings by etablissement ID.
// If no settings exist yet, create default settings and return them.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ etablissementId: string }> }
) {
  try {
    const { etablissementId } = await params

    // Verify etablissement exists
    const etablissement = await db.etablissement.findUnique({
      where: { id: etablissementId },
    })
    if (!etablissement) {
      return NextResponse.json(
        { error: 'Établissement non trouvé' },
        { status: 404 }
      )
    }

    // Try to find existing settings
    let securitySettings = await db.securitySettings.findUnique({
      where: { etablissementId },
      include: {
        etablissement: {
          select: { id: true, nom: true, type: true, ville: true, actif: true },
        },
      },
    })

    // If no settings exist, create default ones
    if (!securitySettings) {
      securitySettings = await db.securitySettings.create({
        data: {
          etablissementId,
          proctoringActif: false,
          detectionCopie: true,
          detectionOnglet: true,
          detectionFullscreen: true,
          blocageCopie: true,
          blocageClicDroit: true,
          blocageImpression: true,
          verificationIdentite: false,
          tempsInactiviteMax: 120,
          nbOngletsMax: 3,
          nbAlertesMax: 5,
          autoSubmitOnViolation: false,
          captureEcran: false,
          rapportFraude: true,
          seuilSimilarite: 0.85,
        },
        include: {
          etablissement: {
            select: { id: true, nom: true, type: true, ville: true, actif: true },
          },
        },
      })

      // Log audit
      await db.auditLog.create({
        data: {
          action: 'CREATE',
          entite: 'SecuritySettings',
          entiteId: securitySettings.id,
          details: JSON.stringify({ etablissementId, autoCreated: true }),
        },
      })
    }

    return NextResponse.json({ securitySettings })
  } catch (error) {
    console.error('Error fetching security settings by etablissement:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des paramètres de sécurité' },
      { status: 500 }
    )
  }
}
