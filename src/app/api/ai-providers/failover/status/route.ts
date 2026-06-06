import { NextResponse } from 'next/server'
import { getFailoverProvider } from '@/lib/ai-providers/failover-provider'
import { db } from '@/lib/db'

// GET /api/ai-providers/failover/status — Get comprehensive failover status
export async function GET() {
  try {
    const failover = getFailoverProvider()
    const config = failover.getConfig()
    const healthStatus = failover.getHealthStatus()

    // Get providers from DB with priority info
    const providers = await db.aIProviderConfig.findMany({
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        provider: true,
        model: true,
        isActive: true,
        priority: true,
        lastTestAt: true,
        lastTestOk: true,
      },
    })

    // Get recent failover events (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentEvents = await db.aIFailoverEvent.findMany({
      where: {
        createdAt: { gte: oneDayAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Merge health data with provider data
    const providersWithHealth = providers.map(p => {
      const health = healthStatus.find(h => h.id === p.id)
      return {
        id: p.id,
        name: p.name,
        provider: p.provider,
        model: p.model,
        isActive: p.isActive,
        priority: p.priority ?? 99,
        lastTestAt: p.lastTestAt?.toISOString() || null,
        lastTestOk: p.lastTestOk,
        health: health?.health || null,
        status: health?.health?.isCoolingDown
          ? 'COOLING_DOWN'
          : (health?.health?.consecutiveFailures ?? 0) > 0
            ? 'DEGRADED'
            : 'HEALTHY',
      }
    })

    // Summary stats
    const healthyCount = providersWithHealth.filter(p => p.status === 'HEALTHY').length
    const degradedCount = providersWithHealth.filter(p => p.status === 'DEGRADED').length
    const coolingCount = providersWithHealth.filter(p => p.status === 'COOLING_DOWN').length

    const totalCalls = healthStatus.reduce((sum, h) => sum + (h.health?.totalCalls ?? 0), 0)
    const totalFailovers = healthStatus.reduce((sum, h) => sum + (h.health?.totalFailovers ?? 0), 0)

    return NextResponse.json({
      config,
      summary: {
        totalProviders: providers.length,
        healthy: healthyCount,
        degraded: degradedCount,
        coolingDown: coolingCount,
        failoverEnabled: config.enabled,
        totalCalls,
        totalFailovers,
        last24hEvents: recentEvents.length,
      },
      providers: providersWithHealth,
      recentEvents,
    })
  } catch (error) {
    console.error('[AI Failover] Error getting status:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du statut failover' },
      { status: 500 }
    )
  }
}
