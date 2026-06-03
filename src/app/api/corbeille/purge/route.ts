import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── DELETE /api/corbeille/purge — Permanently delete items from database ───
// Note: Soft delete (deletedAt) is not supported in the current schema.
// This endpoint provides hard delete for items with ARCHIVE or similar status.
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

      // Permanently delete documents
      if (byType.document?.length) {
        const result = await db.document.deleteMany({
          where: { id: { in: byType.document } },
        })
        purgedCount += result.count
      }

      // Permanently delete questions (only those not linked to EpreuveQuestion)
      if (byType.question?.length) {
        // Check which questions are safe to delete (no EpreuveQuestion links)
        const safeQuestions = await db.question.findMany({
          where: {
            id: { in: byType.question },
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

      // Permanently delete epreuves
      if (byType.epreuve?.length) {
        const result = await db.epreuve.deleteMany({
          where: { id: { in: byType.epreuve } },
        })
        purgedCount += result.count
      }

      // Permanently delete devoirs
      if (byType.devoir?.length) {
        const result = await db.devoir.deleteMany({
          where: { id: { in: byType.devoir } },
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
