import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET /api/corbeille — List all soft-deleted items for a user ───
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur non identifié' }, { status: 401 })
    }

    // Fetch soft-deleted items belonging to this user
    const [documents, questions, epreuves, devoirs] = await Promise.all([
      // Documents deleted by this user
      db.document.findMany({
        where: {
          ownerId: userId,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          nomFichier: true,
          tailleFichier: true,
          typeMime: true,
          dateUpload: true,
          deletedAt: true,
        },
        orderBy: { deletedAt: 'desc' },
      }),

      // Questions created by this user
      db.question.findMany({
        where: {
          auteurId: userId,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          type: true,
          enonce: true,
          difficulte: true,
          validee: true,
          deletedAt: true,
          document: {
            select: { id: true, nomFichier: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),

      // Epreuves created by this user
      db.epreuve.findMany({
        where: {
          enseignantId: userId,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          titre: true,
          duree: true,
          statut: true,
          dateDebut: true,
          dateFin: true,
          deletedAt: true,
          uniteEnseignement: {
            select: { id: true, code: true, nom: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),

      // Devoirs created by this user
      db.devoir.findMany({
        where: {
          enseignantId: userId,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          titre: true,
          dateLimite: true,
          statut: true,
          noteMax: true,
          deletedAt: true,
          UniteEnseignement: {
            select: { id: true, code: true, nom: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),
    ])

    // Serialize dates for JSON transport
    const serialized = {
      documents: documents.map((d) => ({
        ...d,
        dateUpload: d.dateUpload.toISOString(),
        deletedAt: d.deletedAt!.toISOString(),
      })),
      questions: questions.map((q) => ({
        ...q,
        deletedAt: q.deletedAt!.toISOString(),
      })),
      epreuves: epreuves.map((e) => ({
        ...e,
        dateDebut: e.dateDebut.toISOString(),
        dateFin: e.dateFin.toISOString(),
        deletedAt: e.deletedAt!.toISOString(),
      })),
      devoirs: devoirs.map((d) => ({
        ...d,
        dateLimite: d.dateLimite.toISOString(),
        deletedAt: d.deletedAt!.toISOString(),
      })),
      totalCount: documents.length + questions.length + epreuves.length + devoirs.length,
    }

    return NextResponse.json(serialized)
  } catch (error) {
    console.error('List corbeille error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la corbeille' },
      { status: 500 }
    )
  }
}
