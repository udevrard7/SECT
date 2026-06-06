import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/etablissement-access/check — Check if an admin has active access to a specific establishment
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId') || ''
    const etablissementId = searchParams.get('etablissementId') || ''

    if (!adminId || !etablissementId) {
      return NextResponse.json(
        { error: 'Les paramètres adminId et etablissementId sont obligatoires' },
        { status: 400 }
      )
    }

    const now = new Date()

    // An admin has access if there's an EtablissementAccess record with:
    // - statut = "APPROUVE"
    // - dateDebut is null OR dateDebut <= now
    // - dateFin is null OR dateFin >= now
    const accessRecord = await db.etablissementAccess.findFirst({
      where: {
        adminId,
        etablissementId,
        statut: 'APPROUVE',
        OR: [
          { dateDebut: null },
          { dateDebut: { lte: now } },
        ],
      },
      include: {
        admin: {
          select: { id: true, name: true, email: true },
        },
        etablissement: {
          select: { id: true, nom: true, ville: true, actif: true },
        },
      },
    })

    // Additional check: if a record was found, verify dateFin is not expired
    // (We need to check this separately because Prisma doesn't easily support
    //  (dateFin IS NULL OR dateFin >= now) in combination with other OR clauses)
    if (accessRecord && accessRecord.dateFin && accessRecord.dateFin < now) {
      return NextResponse.json({ hasAccess: false, accessRecord: null })
    }

    return NextResponse.json({
      hasAccess: !!accessRecord,
      accessRecord: accessRecord || null,
    })
  } catch (error) {
    console.error('Error checking etablissement access:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la vérification de l\'autorisation d\'accès' },
      { status: 500 }
    )
  }
}
