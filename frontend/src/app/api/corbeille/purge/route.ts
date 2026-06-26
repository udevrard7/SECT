import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── DELETE /api/corbeille/purge — Permanently delete items from database ───
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { items } = body as {
      items?: Array<{ id: string; type: string }>
    }

    // If specific items are provided, permanently delete them
    if (items && Array.isArray(items) && items.length > 0) {
      const byType: Record<string, string[]> = {}
      for (const item of items) {
        if (!byType[item.type]) byType[item.type] = []
        byType[item.type].push(item.id)
      }

      let purgedCount = 0

      // Permanently delete documents (only soft-deleted ones)
      if (byType.document?.length) {
        // First, detach questions that reference these documents (set documentId to null)
        await db.question.updateMany({
          where: { documentId: { in: byType.document } },
          data: { documentId: null },
        })

        // EpreuveDocument has onDelete: Cascade from Document side, so they auto-delete
        const result = await db.document.deleteMany({
          where: { id: { in: byType.document }, deletedAt: { not: null } },
        })
        purgedCount += result.count
      }

      // Permanently delete questions (only soft-deleted ones, safe to remove)
      if (byType.question?.length) {
        // Only delete questions that are not linked to any active epreuve
        const safeQuestions = await db.question.findMany({
          where: {
            id: { in: byType.question },
            deletedAt: { not: null },
            epreuveQuestions: { none: {} },
          },
          select: { id: true },
        })
        if (safeQuestions.length > 0) {
          const result = await db.question.deleteMany({
            where: { id: { in: safeQuestions.map((q) => q.id) } },
          })
          purgedCount += result.count
        }
      }

      // Permanently delete epreuves (only soft-deleted ones)
      if (byType.epreuve?.length) {
        // First delete related SessionPassation records and their children
        // 1. Delete Resultat records linked to sessions of these epreuves
        await db.resultat.deleteMany({
          where: {
            session: { epreuveId: { in: byType.epreuve } },
          },
        })

        // 2. Delete Reponse records linked to sessions of these epreuves
        //    (Reponse has onDelete: Cascade on SessionPassation, but we delete sessions below so this is a safety net)
        await db.reponse.deleteMany({
          where: {
            session: { epreuveId: { in: byType.epreuve } },
          },
        })

        // 3. Delete SessionPassation records
        await db.sessionPassation.deleteMany({
          where: { epreuveId: { in: byType.epreuve } },
        })

        // 4. Delete EpreuveQuestion and EpreuveDocument records
        await db.epreuveQuestion.deleteMany({
          where: { epreuveId: { in: byType.epreuve } },
        })
        await db.epreuveDocument.deleteMany({
          where: { epreuveId: { in: byType.epreuve } },
        })

        // 5. Then delete the epreuves themselves
        const result = await db.epreuve.deleteMany({
          where: { id: { in: byType.epreuve }, deletedAt: { not: null } },
        })
        purgedCount += result.count
      }

      // Permanently delete devoirs (only soft-deleted ones)
      if (byType.devoir?.length) {
        // First delete related GrilleEvaluation and Soumission records
        await db.grilleEvaluation.deleteMany({
          where: { devoirId: { in: byType.devoir } },
        })
        await db.soumission.deleteMany({
          where: { devoirId: { in: byType.devoir } },
        })
        const result = await db.devoir.deleteMany({
          where: { id: { in: byType.devoir }, deletedAt: { not: null } },
        })
        purgedCount += result.count
      }

      // Audit log
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'PURGE_CORBEILLE',
          entite: 'Corbeille',
          entiteId: items.map((i) => i.id).join(','),
          details: `${purgedCount} élément(s) supprimé(s) définitivement`,
        },
      })

      return NextResponse.json({
        message: `${purgedCount} élément(s) supprimé(s) définitivement`,
        purgedCount,
      })
    }

    return NextResponse.json(
      { error: 'Liste d\'éléments requise' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Purge corbeille error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression définitive' },
      { status: 500 }
    )
  }
}
