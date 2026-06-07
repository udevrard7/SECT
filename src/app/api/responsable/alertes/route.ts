import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/auth-session'

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['RESPONSABLE'])
    if (isAuthError(user)) return user

    const etablissementId = user.etablissementId;

    if (!etablissementId) {
      return NextResponse.json({ error: "Le responsable n'est associé à aucun établissement." }, { status: 404 })
    }

    // Get filières belonging to this establishment
    const filieres = await db.filiere.findMany({
      where: { etablissementId },
      select: { id: true }
    });

    const filiereIds = filieres.map(f => f.id);

    // Get epreuve IDs from enseignants in those filières
    const epreuves = await db.epreuve.findMany({
      where: {
        deletedAt: null,
        enseignant: {
          filiereId: { in: filiereIds }
        }
      },
      select: { id: true }
    });

    const epreuveIds = epreuves.map(e => e.id);

    const alertes = await db.alerte.findMany({
      where: {
        resolu: false,
        OR: [
          { epreuveId: { in: epreuveIds } },
          { filiereId: { in: filiereIds } }
        ]
      },
      include: {
        epreuve: {
          select: {
            id: true,
            titre: true,
            enseignant: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(alertes);

  } catch (error) {
    console.error('[API_RESPONSABLE_ALERTES] ', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des alertes.' },
      { status: 500 }
    )
  }
}
