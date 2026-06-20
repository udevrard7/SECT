import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── POST /api/corbeille/restore — Restore soft-deleted items ───
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items } = body as { items: Array<{ id: string; type: string }> }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Liste d\'éléments à restaurer requise' },
        { status: 400 }
      )
    }

    const byType: Record<string, string[]> = {}
    for (const item of items) {
      if (!byType[item.type]) byType[item.type] = []
      byType[item.type].push(item.id)
    }

    let restoredCount = 0

    // Restore documents
    if (byType.document?.length) {
      const result = await db.document.updateMany({
        where: { id: { in: byType.document }, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      restoredCount += result.count
    }

    // Restore questions
    if (byType.question?.length) {
      const result = await db.question.updateMany({
        where: { id: { in: byType.question }, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      restoredCount += result.count
    }

    // Restore epreuves
    if (byType.epreuve?.length) {
      const result = await db.epreuve.updateMany({
        where: { id: { in: byType.epreuve }, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      restoredCount += result.count
    }

    // Restore devoirs
    if (byType.devoir?.length) {
      const result = await db.devoir.updateMany({
        where: { id: { in: byType.devoir }, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      restoredCount += result.count
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'RESTORE_CORBEILLE',
        entite: 'Corbeille',
        entiteId: items.map((i) => i.id).join(','),
        details: `${restoredCount} élément(s) restauré(s) depuis la corbeille`,
      },
    })

    return NextResponse.json({
      message: `${restoredCount} élément(s) restauré(s) avec succès`,
      restoredCount,
    })
  } catch (error) {
    console.error('Restore from corbeille error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la restauration des éléments' },
      { status: 500 }
    )
  }
}
