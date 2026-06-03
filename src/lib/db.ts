import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Determine the correct database URL.
 *
 * In the sandbox environment, a system-level DATABASE_URL points to a local
 * SQLite file, which would conflict with the PostgreSQL Prisma client.
 * We use DATABASE_URL_PG (set in .env) to override it when available.
 *
 * In production (Vercel), DATABASE_URL is set correctly by the platform,
 * so DATABASE_URL_PG is not needed and the override is ignored.
 */
function getDatasourceUrl(): string | undefined {
  // If the system DATABASE_URL is a PostgreSQL URL, use it as-is
  if (process.env.DATABASE_URL?.startsWith('postgresql://')) {
    return undefined // Let Prisma use the default DATABASE_URL
  }

  // System DATABASE_URL is SQLite or missing → use the override
  const pgUrl = process.env.DATABASE_URL_PG
  if (pgUrl) {
    return pgUrl
  }

  // Fallback: let Prisma use whatever DATABASE_URL is set
  return undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [],
    ...(getDatasourceUrl() ? { datasourceUrl: getDatasourceUrl() } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
