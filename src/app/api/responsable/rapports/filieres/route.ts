import { NextRequest, NextResponse } from '''next/server'''
import { db } from '''@/lib/db'''
import { getAuth } from '''@/lib/session'''

interface RapportFiliere {
  id: string;
  nom: string;
  nbEtudiants: number;
  nbEpreuves: number;
  tauxReussiteMoyen: number;
  nbUes: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuth()
    if (session?.user?.role !== '''RESPONSABLE''') {
      return NextResponse.json({ error: '''Non autorisé''' }, { status: 403 })
    }

    const responsableId = session.user.id;

    const filieres = await db.filiere.findMany({
      where: { responsables: { some: { id: responsableId } } },
      include: {
        _count: { select: { etudiants: true, ues: true } },
        ues: {
          select: {
            epreuves: {
              include: {
                _count: { select: { resultats: true } },
                resultats: {
                  select: { score: true }
                }
              }
            }
          }
        }
      }
    });

    const rapports: RapportFiliere[] = filieres.map(filiere => {
      let nbEpreuves = 0;
      let totalResultats = 0;
      let sommeScores = 0;

      filiere.ues.forEach(ue => {
          ue.epreuves.forEach(epreuve => {
              if (epreuve._count.resultats > 0) {
                  nbEpreuves++;
                  totalResultats += epreuve._count.resultats;
                  sommeScores += epreuve.resultats.reduce((acc, res) => acc + res.score, 0);
              }
          });
      });

      const tauxReussiteMoyen = totalResultats > 0 ? (sommeScores / totalResultats) : 0;

      return {
        id: filiere.id,
        nom: filiere.nom,
        nbEtudiants: filiere._count.etudiants,
        nbEpreuves: nbEpreuves,
        tauxReussiteMoyen: tauxReussiteMoyen,
        nbUes: filiere._count.ues
      };
    });

    return NextResponse.json(rapports);

  } catch (error) {
    console.error('''[API_RESPONSABLE_RAPPORTS_FILIERES]''', error)
    return NextResponse.json(
      { error: '''Erreur lors de la génération du rapport.''' },
      { status: 500 }
    )
  }
}
