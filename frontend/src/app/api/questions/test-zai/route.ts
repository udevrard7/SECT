import { NextResponse } from 'next/server'
import { getAIProvider } from '@/lib/ai-providers'

/**
 * Diagnostic endpoint to test the active AI provider connection.
 * This helps debug authentication and connectivity issues in production.
 * Call: GET /api/questions/test-zai
 */
export async function GET() {
  try {
    const provider = await getAIProvider()
    const testResult = await provider.testConnection()

    return NextResponse.json({
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.providerType,
      },
      ...testResult,
    })
  } catch (err) {
    return NextResponse.json({
      provider: null,
      success: false,
      message: `Erreur: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
