import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-session'
import { runFailoverTest } from '@/lib/ai-providers/failover-test'
import { db } from '@/lib/db'

/**
 * POST /api/ai-providers/failover/test — Test du système de failover IA.
 *
 * 🔒 ADMIN only.
 *
 * Simule une panne du fournisseur IA principal (corruption temporaire et
 * réversible de l'apiKey) et observe la bascule vers le fournisseur de
 * secours. L'apiKey est TOUJOURS restauré à la fin (try/finally).
 *
 * Le test effectue un vrai appel chatCompletion (prompt minimal "OK") pour
 * déclencher le mécanisme de failover. Les événements FAIL_OVER créés
 * restent en DB comme trace audit.
 *
 * Réponse 200 :
 *   { success, primaryProvider, fallbackProvider, responseExcerpt,
 *     eventsCreated, healthAfter, apiKeyRestored, durationMs }
 */
const _postHandler = async () => {
  try {
    const result = await runFailoverTest()

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'TEST_FAILOVER',
          entite: 'AIFailover',
          details: `Test failover: primary="${result.primaryProvider.name}", fallback="${result.fallbackProvider?.name ?? 'N/A'}", success=${result.success}, restored=${result.apiKeyRestored}`,
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[AI Failover] Test failed:', error)
    return NextResponse.json(
      {
        error: 'Erreur lors du test de failover',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_postHandler, ['ADMIN'])
