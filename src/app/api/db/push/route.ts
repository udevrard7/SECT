import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// POST /api/db/push — Push Prisma schema changes to the database
// This should be called once after deploying schema changes
export async function POST() {
  try {
    const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss', {
      timeout: 60000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    })

    console.log('Prisma db push stdout:', stdout)
    if (stderr) console.log('Prisma db push stderr:', stderr)

    return NextResponse.json({
      success: true,
      message: 'Schéma de base de données mis à jour avec succès',
      output: stdout,
    })
  } catch (error) {
    console.error('Prisma db push error:', error)
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
