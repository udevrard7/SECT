import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Determine the correct database URL for Prisma.
 *
 * In sandbox environments, a system-level DATABASE_URL may point to a local
 * SQLite file, which would conflict with the PostgreSQL Prisma client.
 * We use DATABASE_URL_PG (set in .env) as the primary override.
 *
 * In production (Vercel), DATABASE_URL is set correctly by the platform,
 * so DATABASE_URL_PG is not needed.
 */
function getDatasourceUrl(): string | undefined {
  // Priority 1: DATABASE_URL_PG override (always takes precedence)
  const pgUrl = process.env.DATABASE_URL_PG
  if (pgUrl?.startsWith('postgresql://') || pgUrl?.startsWith('postgres://')) {
    return pgUrl
  }

  // Priority 2: If DATABASE_URL is a PostgreSQL URL, use it directly
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl?.startsWith('postgresql://') || dbUrl?.startsWith('postgres://')) {
    return dbUrl
  }

  // Fallback: let Prisma use whatever DATABASE_URL is set
  return undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
    ...(getDatasourceUrl() ? { datasourceUrl: getDatasourceUrl() } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Execute a database operation with automatic retry on connection errors.
 *
 * PgBouncer (used by Supabase) has a default server_lifetime of 3600s (1 hour).
 * When a connection is recycled, queries can fail with transient errors.
 * This wrapper retries the operation up to `maxRetries` times with a delay.
 *
 * Usage:
 *   const user = await withRetry(() => db.user.findUnique({ where: { id } }))
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 500,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: unknown) {
      lastError = error

      // Check if this is a retryable connection error
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable =
        errorMessage.includes('Connection') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('EPIPE') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('P1001') || // P1001: Can't reach database server
        errorMessage.includes('P1002') || // P1002: Database server rejected the connection
        errorMessage.includes('P1008') || // P1008: Operations timed out
        errorMessage.includes('P1017') || // P1017: Server has closed the connection
        errorMessage.includes('pgbouncer')

      if (!isRetryable || attempt === maxRetries) {
        throw error
      }

      // Wait before retrying, with exponential backoff
      const waitTime = delayMs * Math.pow(2, attempt)
      console.warn(
        `[DB Retry] Attempt ${attempt + 1}/${maxRetries} failed (${errorMessage.slice(0, 80)}). Retrying in ${waitTime}ms...`
      )
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }

  throw lastError
}
