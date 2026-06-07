import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

async function _GET(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    const { searchParams } = new URL(request.url)
    const responsableId = searchParams.get('responsableId')
    const etablissementId = searchParams.get('etablissementId')

    if (!etablissementId && !responsableId) {
      return NextResponse.json({ error: 'etablissementId ou responsableId requis' }, { status: 400 })
    }

    // Get filières — either by establishment or by filière-level responsable
    let filiereIds: string[] = []

    if (etablissementId) {
      const filieres = await db.filiere.findMany({
        where: { etablissementId },
        select: { id: true }
      });
      filiereIds = filieres.map(f => f.id);
    } else if (responsableId) {
      const filieres = await db.filiere.findMany({
        where: { responsableId },
        select: { id: true }
      });
      filiereIds = filieres.map(f => f.id);
    }

    // Get enseignant IDs in those filières
    const enseignants = await db.user.findMany({
      where: {
        role: 'ENSEIGNANT',
        filiereId: { in: filiereIds }
      },
      select: { id: true }
    });

    const enseignantIds = enseignants.map(e => e.id);

    // Get epreuve IDs created by those enseignants
    const epreuves = await db.epreuve.findMany({
      where: { enseignantId: { in: enseignantIds }, deletedAt: null },
      select: { id: true }
    });

    const epreuveIds = epreuves.map(e => e.id);

    // Simplified KPIs for the new dashboard
    const [nbEnseignants, nbEpreuves, nbAlertes] = await Promise.all([
      db.user.count({ where: { role: 'ENSEIGNANT', filiereId: { in: filiereIds } } }),
      db.epreuve.count({ where: { enseignantId: { in: enseignantIds } } }),
      db.alerte.count({ where: { resolu: false, epreuveId: { in: epreuveIds } } })
    ]);

    // Aggregate stats for filieres
    const filieresWithCounts = await db.filiere.findMany({
      where: { id: { in: filiereIds } },
      include: {
        _count: {
          select: { etudiants: true, unitesEnseignement: true }
        }
      }
    })

    const nbEtudiants = filieresWithCounts.reduce((acc, f) => acc + f._count.etudiants, 0);
    const nbUes = filieresWithCounts.reduce((acc, f) => acc + f._count.unitesEnseignement, 0);

    return NextResponse.json({
      nbEnseignants,
      nbEpreuves,
      nbAlertes,
      nbEtudiants,
      nbUes
    });

  } catch (error) {
    console.error('Responsable stats error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques du responsable' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['RESPONSABLE', 'ADMIN'])
