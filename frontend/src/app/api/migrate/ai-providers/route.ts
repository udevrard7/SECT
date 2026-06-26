import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Migration endpoint to create the AIProviderConfig table in Supabase.
 * Also seeds the Z-AI provider with proper API credentials.
 * 
 * Call: GET or POST /api/migrate/ai-providers
 * 
 * Steps:
 * 1. Create AIProviderConfig table if not exists
 * 2. Seed Z-AI provider with API key configuration
 */
export async function GET() {
  try {
    // Step 1: Check if table exists
    try {
      await db.$queryRaw`SELECT 1 FROM "AIProviderConfig" LIMIT 1`
      // Table exists — ensure the Z-AI provider has the right config
      await seedZAIProvider()
      return NextResponse.json({
        message: 'Table AIProviderConfig already exists — provider config updated',
      })
    } catch {
      // Table doesn't exist, create it
    }

    // Create the AIProviderConfig table
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AIProviderConfig" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
        "name" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "baseUrl" TEXT,
        "apiKey" TEXT,
        "model" TEXT,
        "temperature" DOUBLE PRECISION DEFAULT 0.7,
        "maxTokens" INTEGER DEFAULT 4096,
        "isActive" BOOLEAN NOT NULL DEFAULT false,
        "extraConfig" TEXT,
        "lastTestAt" TIMESTAMP(3),
        "lastTestOk" BOOLEAN,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AIProviderConfig_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "AIProviderConfig_name_key" UNIQUE ("name")
      );
    `)

    // Seed the Z-AI provider with full API configuration
    await seedZAIProvider()

    return NextResponse.json({
      success: true,
      message: 'Table AIProviderConfig created and Z-AI provider seeded successfully',
    })
  } catch (error) {
    console.error('[Migrate AI Providers] Error:', error)
    return NextResponse.json(
      { error: `Migration failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}

export async function POST() {
  return GET()
}

/**
 * Seed or update the Z-AI provider with API credentials.
 * Uses env vars for Vercel production, or direct config.
 */
async function seedZAIProvider() {
  const extraConfig = JSON.stringify({
    baseUrl: process.env.ZAI_BASE_URL || 'https://z.ai/api/v1',
    apiKey: process.env.ZAI_API_KEY || 'Z.ai',
    chatId: process.env.ZAI_CHAT_ID || '',
    userId: process.env.ZAI_USER_ID || '',
    token: process.env.ZAI_TOKEN || '',
  })

  // Upsert: update if exists, insert if not
  try {
    // Check if Z-AI provider already exists
    const existing = await db.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id", "name" FROM "AIProviderConfig" WHERE "provider" = 'ZAI' LIMIT 1
    `

    if (existing.length > 0) {
      // Update existing Z-AI provider with full config
      await db.$executeRawUnsafe(`
        UPDATE "AIProviderConfig"
        SET 
          "name" = 'Z-AI (principal)',
          "model" = 'default',
          "temperature" = 0.7,
          "maxTokens" = 4096,
          "isActive" = true,
          "extraConfig" = '${extraConfig.replace(/'/g, "''")}',
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "provider" = 'ZAI'
      `)
    } else {
      // Insert new Z-AI provider
      await db.$executeRawUnsafe(`
        INSERT INTO "AIProviderConfig" ("id", "name", "provider", "model", "temperature", "maxTokens", "isActive", "extraConfig", "createdAt", "updatedAt")
        VALUES (
          'zai-principal',
          'Z-AI (principal)',
          'ZAI',
          'default',
          0.7,
          4096,
          true,
          '${extraConfig.replace(/'/g, "''")}',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("name") DO UPDATE SET
          "model" = EXCLUDED."model",
          "isActive" = EXCLUDED."isActive",
          "extraConfig" = EXCLUDED."extraConfig",
          "updatedAt" = EXCLUDED."updatedAt"
      `)
    }
  } catch (err) {
    console.error('[Migrate AI Providers] Seed error:', err)
    // Don't throw — table creation is the critical part
  }
}
