import { NextResponse } from 'next/server'

/**
 * Run ALL pending database migrations.
 * Safe to call multiple times — each migration is idempotent.
 *
 * Call: GET /api/migrate/all
 */
export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const results: Array<{ name: string; success: boolean; message: string }> = []

  // Migration 1: AI Provider Config table
  try {
    const res = await fetch(`${baseUrl}/api/migrate/ai-providers`, { cache: 'no-store' })
    const data = await res.json()
    results.push({
      name: 'ai-providers',
      success: res.ok,
      message: data.message || data.error || 'OK',
    })
  } catch (err) {
    results.push({
      name: 'ai-providers',
      success: false,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  // Migration 2: Failover support (priority + AIFailoverEvent)
  try {
    const res = await fetch(`${baseUrl}/api/migrate/failover`, { cache: 'no-store' })
    const data = await res.json()
    results.push({
      name: 'failover',
      success: res.ok,
      message: data.message || data.error || 'OK',
    })
  } catch (err) {
    results.push({
      name: 'failover',
      success: false,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  const allSuccess = results.every(r => r.success)

  return NextResponse.json({
    success: allSuccess,
    migrations: results,
    timestamp: new Date().toISOString(),
  })
}

export async function POST() {
  return GET()
}
