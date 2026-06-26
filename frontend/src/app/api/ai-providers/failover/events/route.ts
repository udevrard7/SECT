import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/ai-providers/failover/events — Get failover event history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const eventType = searchParams.get('type') || undefined
    const days = Math.min(parseInt(searchParams.get('days') || '7'), 30)

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const where: Record<string, unknown> = {
      createdAt: { gte: since },
    }
    if (eventType) {
      where.eventType = eventType
    }

    const events = await db.aIFailoverEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Get event counts for summary
    const eventCounts = await db.aIFailoverEvent.groupBy({
      by: ['eventType'],
      where: { createdAt: { gte: since } },
      _count: true,
    })

    return NextResponse.json({
      events,
      summary: {
        period: `Derniers ${days} jours`,
        counts: eventCounts.map(e => ({
          type: e.eventType,
          count: e._count,
        })),
      },
    })
  } catch (error) {
    console.error('[AI Failover] Error getting events:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des événements failover' },
      { status: 500 }
    )
  }
}
