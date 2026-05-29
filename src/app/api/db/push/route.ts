import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/db/push — Create missing tables using raw SQL
// This should be called once after deploying schema changes
export async function POST() {
  try {
    // Check if EnseignantFiliere table exists
    const tableCheck = await db.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE tablename = 'EnseignantFiliere'
    `

    if (tableCheck.length === 0) {
      // Create the EnseignantFiliere table
      await db.$executeRawUnsafe(`
        CREATE TABLE "EnseignantFiliere" (
          "id" TEXT NOT NULL,
          "enseignantId" TEXT NOT NULL,
          "filiereId" TEXT NOT NULL,
          "niveau" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "EnseignantFiliere_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "EnseignantFiliere_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "EnseignantFiliere_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "EnseignantFiliere_enseignantId_filiereId_niveau_key" UNIQUE ("enseignantId", "filiereId", "niveau")
        )
      `)

      // Create index for faster lookups
      await db.$executeRawUnsafe(`
        CREATE INDEX "EnseignantFiliere_enseignantId_idx" ON "EnseignantFiliere"("enseignantId")
      `)
      await db.$executeRawUnsafe(`
        CREATE INDEX "EnseignantFiliere_filiereId_idx" ON "EnseignantFiliere"("filiereId")
      `)

      return NextResponse.json({
        success: true,
        message: 'Table EnseignantFiliere créée avec succès',
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Toutes les tables existent déjà',
    })
  } catch (error) {
    console.error('DB push error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erreur lors de la mise à jour du schéma',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
