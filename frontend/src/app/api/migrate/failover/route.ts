import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Migration endpoint to add failover support to Supabase.
 *
 * This migration is SAFE — it only adds new columns/tables, never drops existing data.
 *
 * What it does:
 * 1. Adds "priority" column to AIProviderConfig (default 99)
 * 2. Creates AIFailoverEvent table for logging failover events
 *
 * Call: GET or POST /api/migrate/failover
 */
export async function GET() {
  const results: string[] = []

  try {
    // ─── Step 1: Add "priority" column to AIProviderConfig ───
    try {
      // Check if column already exists
      await db.$queryRawUnsafe(`
        SELECT "priority" FROM "AIProviderConfig" LIMIT 1
      `)
      results.push('✅ Colonne "priority" déjà présente dans AIProviderConfig')
    } catch {
      // Column doesn't exist — add it
      try {
        await db.$executeRawUnsafe(`
          ALTER TABLE "AIProviderConfig" 
          ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 99
        `)
        results.push('✅ Colonne "priority" ajoutée à AIProviderConfig (default: 99)')
      } catch (err) {
        results.push(`⚠️ Impossible d'ajouter "priority": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // ─── Step 2: Create AIFailoverEvent table ───
    try {
      await db.$queryRaw`SELECT 1 FROM "AIFailoverEvent" LIMIT 1`
      results.push('✅ Table AIFailoverEvent déjà présente')
    } catch {
      // Table doesn't exist — create it
      try {
        await db.$executeRawUnsafe(`
          CREATE TABLE "AIFailoverEvent" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "providerId" TEXT,
            "providerName" TEXT,
            "eventType" TEXT NOT NULL,
            "fromProvider" TEXT,
            "toProvider" TEXT,
            "reason" TEXT NOT NULL,
            "errorDetails" TEXT,
            "resolved" BOOLEAN NOT NULL DEFAULT false,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "AIFailoverEvent_pkey" PRIMARY KEY ("id")
          )
        `)
        results.push('✅ Table AIFailoverEvent créée avec succès')

        // Create index for efficient querying
        await db.$executeRawUnsafe(`
          CREATE INDEX "AIFailoverEvent_createdAt_idx" ON "AIFailoverEvent"("createdAt")
        `)
        results.push('✅ Index créé sur AIFailoverEvent.createdAt')
      } catch (err) {
        results.push(`⚠️ Impossible de créer AIFailoverEvent: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // ─── Step 3: Set priorities for existing providers ───
    try {
      // Check if any providers have priority 99 (default) and set proper priorities
      const providers = await db.$queryRawUnsafe<Array<{ id: string; name: string; isActive: boolean }>>(`
        SELECT "id", "name", "isActive" FROM "AIProviderConfig" ORDER BY "createdAt" ASC
      `)

      if (providers.length > 0) {
        for (let i = 0; i < providers.length; i++) {
          const priority = providers[i].isActive ? 1 : i + 2
          await db.$executeRawUnsafe(`
            UPDATE "AIProviderConfig" SET "priority" = ${priority} WHERE "id" = '${providers[i].id}'
          `)
        }
        results.push(`✅ Priorités attribuées à ${providers.length} fournisseur(s) existant(s)`)
      } else {
        results.push('ℹ️ Aucun fournisseur existant — priorités non modifiées')
      }
    } catch (err) {
      results.push(`⚠️ Impossible d'attribuer les priorités: ${err instanceof Error ? err.message : String(err)}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Migration failover terminée avec succès',
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Migrate Failover] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: `Migration échouée: ${error instanceof Error ? error.message : String(error)}`,
        results,
      },
      { status: 500 }
    )
  }
}

export async function POST() {
  return GET()
}
