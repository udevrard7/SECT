import { NextRequest, NextResponse } from 'next/server'
import { getFailoverProvider } from '@/lib/ai-providers/failover-provider'

// GET /api/ai-providers/failover/config — Get current failover configuration
export async function GET() {
  try {
    const failover = getFailoverProvider()
    const config = failover.getConfig()

    return NextResponse.json({ config })
  } catch (error) {
    console.error('[AI Failover] Error getting config:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la configuration failover' },
      { status: 500 }
    )
  }
}

// POST /api/ai-providers/failover/config — Update failover configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const failover = getFailoverProvider()
    const updatedConfig = failover.updateConfig(body)

    // Audit log
    try {
      const { db } = await import('@/lib/db')
      await db.auditLog.create({
        data: {
          action: 'UPDATE_FAILOVER_CONFIG',
          entite: 'AIFailover',
          details: `Configuration failover mise à jour: ${JSON.stringify(body)}`,
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      config: updatedConfig,
      message: 'Configuration failover mise à jour avec succès',
    })
  } catch (error) {
    console.error('[AI Failover] Error updating config:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la configuration failover' },
      { status: 500 }
    )
  }
}
