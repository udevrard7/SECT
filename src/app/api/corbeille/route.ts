import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET /api/corbeille — List all soft-deleted items for a user ───
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const type = searchParams.get('type') // 'document', 'question', 'epreuve', 'devoir', or 'all'

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur non identifié' }, { status: 401 })
    }

    const result: Record<string, unknown[]> = {}

    const fetchType = type || 'all'

    // Fetch soft-deleted documents
    if (fetchType === 'all' || fetchType === 'document') {
      const documents = await db.document.findMany({
        where: { ownerId: userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          nomFichier: true,
          tailleFichier: true,
          typeMime: true,
          dateUpload: true,
          deletedAt: true,
        },
      })
      result.documents = documents
    }

    // Fetch soft-deleted questions
    if (fetchType === 'all' || fetchType === 'question') {
      const questions = await db.question.findMany({
        where: {
          deletedAt: { not: null },
          OR: [
            { auteurId: userId },
            { document: { ownerId: userId } },
          ],
        },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          type: true,
          enonce: true,
          difficulte: true,
          validee: true,
          deletedAt: true,
          document: { select: { id: true, nomFichier: true } },
        },
      })
      result.questions = questions.map((q) => ({
        ...q,
        enonce: q.enonce.length > 100 ? q.enonce.slice(0, 100) + '...' : q.enonce,
      }))
    }

    // Fetch soft-deleted epreuves
    if (fetchType === 'all' || fetchType === 'epreuve') {
      const epreuves = await db.epreuve.findMany({
        where: { enseignantId: userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          titre: true,
          duree: true,
          statut: true,
          dateDebut: true,
          dateFin: true,
          deletedAt: true,
        },
      })
      result.epreuves = epreuves
    }

    // Fetch soft-deleted devoirs
    if (fetchType === 'all' || fetchType === 'devoir') {
      const devoirs = await db.devoir.findMany({
        where: { enseignantId: userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          titre: true,
          dateLimite: true,
          statut: true,
          noteMax: true,
          deletedAt: true,
        },
      })
      result.devoirs = devoirs
    }

    // Calculate total count
    const totalCount = Object.values(result).reduce((sum, items) => sum + items.length, 0)

    return NextResponse.json({
      ...result,
      totalCount,
    })
  } catch (error) {
    console.error('List corbeille error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la corbeille' },
      { status: 500 }
    )
  }
}
