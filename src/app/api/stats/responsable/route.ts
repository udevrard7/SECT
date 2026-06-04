import { NextRequest, NextResponse } from '''next/server'''
import { db } from '''@/lib/db'''

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const responsableId = searchParams.get('''responsableId''')

    if (!responsableId) {
      return NextResponse.json({ error: '''responsableId requis''' }, { status: 400 })
    }

    // Simplified KPIs for the new dashboard
    const [nbEnseignants, nbEpreuves, nbAlertes] = await Promise.all([
      db.user.count({ where: { role: '''ENSEIGNANT''', etablissement: { responsables: { some: { id: responsableId } } } } }),
      db.epreuve.count({ where: { enseignant: { etablissement: { responsables: { some: { id: responsableId } } } } } }),
      db.alerte.count({ where: { resolue: false, epreuve: { enseignant: { etablissement: { responsables: { some: { id: responsableId } } } } } } })
    ]);

    // Aggregate stats for filieres managed by the responsable
    const filieres = await db.filiere.findMany({
        where: { responsables: { some: { id: responsableId } } },
        include: {
            _count: {
                select: { etudiants: true, ues: true }
            }
        }
    })

    const nbEtudiants = filieres.reduce((acc, f) => acc + f._count.etudiants, 0);
    const nbUes = filieres.reduce((acc, f) => acc + f._count.ues, 0);

    return NextResponse.json({
      nbEnseignants,
      nbEpreuves,
      nbAlertes,
      nbEtudiants,
      nbUes
    });

  } catch (error) {
    console.error('''Responsable stats error:''', error)
    return NextResponse.json(
      { error: '''Erreur lors de la récupération des statistiques du responsable''' },
      { status: 500 }
    )
  }
}
