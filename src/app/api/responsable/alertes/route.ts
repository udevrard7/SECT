import { NextRequest, NextResponse } from '''next/server'''
import { db } from '''@/lib/db'''
import { getAuth } from '''@/lib/session'''

export async function GET(request: NextRequest) {
  try {
    const session = await getAuth()
    if (session?.user?.role !== '''RESPONSABLE''') {
      return NextResponse.json({ error: '''Non autorisé''' }, { status: 403 })
    }

    const responsableId = session.user.id;

    const alertes = await db.alerte.findMany({
      where: {
        resolue: false,
        epreuve: {
          enseignant: {
            etablissement: {
              responsables: {
                some: { id: responsableId }
              }
            }
          }
        }
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
        createdAt: '''desc'''
      }
    })

    return NextResponse.json(alertes);

  } catch (error) {
    console.error('''[API_RESPONSABLE_ALERTES] ''', error)
    return NextResponse.json(
      { error: '''Erreur lors de la récupération des alertes.''' },
      { status: 500 }
    )
  }
}
