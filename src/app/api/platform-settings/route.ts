import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const DEFAULT_SETTINGS = {
  siteName: 'SECT',
  siteDescription: 'Système d\'Évaluation et de Contrôle des Tests',
  maintenanceMode: false,
  registrationOpen: true,
  defaultPlanType: 'GRATUIT',
  maxUploadSizeMB: 50,
  allowedFileTypes: ['pdf', 'docx', 'txt', 'csv'],
  aiGenerationEnabled: true,
  aiCorrectionEnabled: false,
  proctoringEnabled: false,
  emailNotifications: true,
  contactEmail: 'contact@sect.fr',
  helpUrl: '',
  legalNoticeUrl: '',
  privacyPolicyUrl: '',
}

// GET /api/platform-settings — Get platform settings
export async function GET() {
  try {
    let record = await db.platformSettings.findUnique({
      where: { id: 'default' },
    })

    // If no settings exist yet, create default ones
    if (!record) {
      record = await db.platformSettings.create({
        data: {
          id: 'default',
          settings: JSON.stringify(DEFAULT_SETTINGS),
          updatedAt: new Date(),
        },
      })
    }

    // Parse the JSON settings field
    const settings = JSON.parse(record.settings)

    return NextResponse.json({
      id: record.id,
      settings,
      updatedAt: record.updatedAt,
    })
  } catch (error) {
    console.error('Error fetching platform settings:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des paramètres de la plateforme' },
      { status: 500 }
    )
  }
}

// POST /api/platform-settings — Update platform settings (merge with existing)
// Also supports PATCH for semantic clarity
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Get existing settings or create default
    let record = await db.platformSettings.findUnique({
      where: { id: 'default' },
    })

    let currentSettings: Record<string, unknown>
    if (record) {
      currentSettings = JSON.parse(record.settings)
    } else {
      currentSettings = { ...DEFAULT_SETTINGS }
    }

    // Merge: new values override existing ones
    const mergedSettings = { ...currentSettings, ...body }

    // Upsert the settings record
    record = await db.platformSettings.upsert({
      where: { id: 'default' },
      update: {
        settings: JSON.stringify(mergedSettings),
        updatedAt: new Date(),
      },
      create: {
        id: 'default',
        settings: JSON.stringify(mergedSettings),
        updatedAt: new Date(),
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'PlatformSettings',
        entiteId: 'default',
        details: JSON.stringify({ updatedFields: Object.keys(body) }),
      },
    })

    return NextResponse.json({
      id: record.id,
      settings: mergedSettings,
      updatedAt: record.updatedAt,
    })
  } catch (error) {
    console.error('Error updating platform settings:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour des paramètres de la plateforme' },
      { status: 500 }
    )
  }
}

// PATCH /api/platform-settings — Update platform settings (same as POST, merge semantics)
export async function PATCH(request: NextRequest) {
  return POST(request)
}
