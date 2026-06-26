import { NextRequest, NextResponse } from 'next/server'
import { getFailoverProvider } from '@/lib/ai-providers/failover-provider'

// POST /api/ai-providers/failover/health/reset — Reset health for a specific provider
export async function POST(request: NextRequest) {
  try {
    const { providerId, resetAll } = await request.json()

    const failover = getFailoverProvider()

    if (resetAll) {
      failover.resetAllHealth()
      return NextResponse.json({
        message: 'Santé de tous les fournisseurs réinitialisée',
      })
    }

    if (providerId) {
      failover.resetProviderHealth(providerId)
      return NextResponse.json({
        message: `Santé du fournisseur réinitialisée`,
      })
    }

    return NextResponse.json(
      { error: 'providerId ou resetAll requis' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[AI Failover] Error resetting health:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la réinitialisation' },
      { status: 500 }
    )
  }
}
