import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/auth-session'

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
    const user = await requireRole(request, ['RESPONSABLE'])
    if (isAuthError(user)) return user

    const etablissementId = user.etablissementId;

    if (!etablissementId) {
      return NextResponse.json({ error: "Le responsable n'est associé à aucun établissement." }, { status: 404 })
    }

    // Get filières belonging to this establishment
    const filieres = await db.filiere.findMany({
      where: { etablissementId },
      include: {
        _count: { select: { etudiants: true, unitesEnseignement: true } },
        unitesEnseignement: {
          select: {
            id: true
          }
        }
      }
    });

    // For each filière, count epreuves via enseignants and compute stats
    const rapports: RapportFiliere[] = await Promise.all(filieres.map(async (filiere) => {
      // Get enseignants in this filière
      const enseignants = await db.user.findMany({
        where: { filiereId: filiere.id, role: 'ENSEIGNANT' },
        select: { id: true }
      });
      const enseignantIds = enseignants.map(e => e.id);

      // Get epreuves by those enseignants with their session scores
      const epreuves = await db.epreuve.findMany({
        where: { enseignantId: { in: enseignantIds }, deletedAt: null },
        select: {
          id: true,
          sessions: {
            select: { score: true }
          }
        }
      });

      let nbEpreuves = 0;
      let totalResultats = 0;
      let sommeScores = 0;

      epreuves.forEach(epreuve => {
        const sessions = epreuve.sessions.filter(s => s.score !== null);
        if (sessions.length > 0) {
          nbEpreuves++;
          totalResultats += sessions.length;
          sommeScores += sessions.reduce((acc, s) => acc + (s.score || 0), 0);
        }
      });

      const tauxReussiteMoyen = totalResultats > 0 ? (sommeScores / totalResultats) : 0;

      return {
        id: filiere.id,
        nom: filiere.nom,
        nbEtudiants: filiere._count.etudiants,
        nbEpreuves: nbEpreuves,
        tauxReussiteMoyen: tauxReussiteMoyen,
        nbUes: filiere._count.unitesEnseignement
      };
    }));

    return NextResponse.json(rapports);

  } catch (error) {
    console.error('[API_RESPONSABLE_RAPPORTS_FILIERES]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la génération du rapport.' },
      { status: 500 }
    )
  }
}
