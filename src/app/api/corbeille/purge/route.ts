import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── DELETE /api/corbeille/purge — Permanently delete items from database ───
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { items, purgeOlderThanDays } = body as {
      items?: Array<{ id: string; type: string }>
      purgeOlderThanDays?: number
    }

    let purgedCount = 0

    // If purgeOlderThanDays is provided, permanently delete all items older than that
    if (purgeOlderThanDays) {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - purgeOlderThanDays)

      // Permanently delete old documents
      const deletedDocs = await db.document.deleteMany({
        where: { deletedAt: { not: null, lte: cutoffDate } },
      })
      purgedCount += deletedDocs.count

      // Permanently delete old questions (only those not linked to EpreuveQuestion)
      // First get IDs of questions that are safe to delete
      const oldQuestions = await db.question.findMany({
        where: {
          deletedAt: { not: null, lte: cutoffDate },
          epreuveQuestions: { none: {} },
        },
        select: { id: true },
      })
      if (oldQuestions.length > 0) {
        const deletedQs = await db.question.deleteMany({
          where: { id: { in: oldQuestions.map((q) => q.id) } },
        })
        purgedCount += deletedQs.count
      }

      // Permanently delete old epreuves
      const deletedEps = await db.epreuve.deleteMany({
        where: { deletedAt: { not: null, lte: cutoffDate } },
      })
      purgedCount += deletedEps.count

      // Permanently delete old devoirs
      const deletedDvs = await db.devoir.deleteMany({
        where: { deletedAt: { not: null, lte: cutoffDate } },
      })
      purgedCount += deletedDvs.count

      // Audit log
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'AUTO_PURGE_CORBEILLE',
          entite: 'Corbeille',
          details: `Suppression automatique de ${purgedCount} élément(s) de plus de ${purgeOlderThanDays} jour(s) dans la corbeille`,
        },
      })

      return NextResponse.json({
        message: `${purgedCount} élément(s) supprimé(s) définitivement (plus de ${purgeOlderThanDays} jours dans la corbeille)`,
        purgedCount,
      })
    }

    // If specific items are provided, permanently delete them
    if (items && Array.isArray(items) && items.length > 0) {
      const byType: Record<string, string[]> = {}
      for (const item of items) {
        if (!byType[item.type]) byType[item.type] = []
        byType[item.type].push(item.id)
      }

      // Permanently delete documents
      if (byType.document?.length) {
        const result = await db.document.deleteMany({
          where: { id: { in: byType.document }, deletedAt: { not: null } },
        })
        purgedCount += result.count
      }

      // Permanently delete questions (only those not linked to EpreuveQuestion)
      if (byType.question?.length) {
        // Check which questions are safe to delete (no EpreuveQuestion links)
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
        // Questions still linked to epreuves cannot be permanently deleted
        const skippedCount = byType.question.length - safeQuestions.length
        if (skippedCount > 0) {
          // Just remove the deletedAt to un-delete them since they're still referenced
          // Actually, we should keep them soft-deleted but not purge them
        }
      }

      // Permanently delete epreuves
      if (byType.epreuve?.length) {
        const result = await db.epreuve.deleteMany({
          where: { id: { in: byType.epreuve }, deletedAt: { not: null } },
        })
        purgedCount += result.count
      }

      // Permanently delete devoirs
      if (byType.devoir?.length) {
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
          details: `${purgedCount} élément(s) supprimé(s) définitivement de la corbeille`,
        },
      })

      return NextResponse.json({
        message: `${purgedCount} élément(s) supprimé(s) définitivement`,
        purgedCount,
      })
    }

    return NextResponse.json(
      { error: 'Liste d\'éléments ou délai de purge requis' },
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
