import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth-session'

// POST /api/etablissements/upload-logo — Upload a logo for an establishment
// Accepts multipart/form-data with a file and etablissementId
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Only ADMIN and RESPONSABLE can upload logos
    if (authUser.role !== 'ADMIN' && authUser.role !== 'RESPONSABLE') {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const etablissementId = formData.get('etablissementId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }

    if (!etablissementId) {
      return NextResponse.json({ error: 'ID établissement manquant' }, { status: 400 })
    }

    // RESPONSABLE can only update their own establishment
    if (authUser.role === 'RESPONSABLE' && authUser.etablissementId !== etablissementId) {
      return NextResponse.json({ error: 'Vous ne pouvez modifier que votre propre établissement' }, { status: 403 })
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Type de fichier non supporté. Utilisez PNG, JPG, WEBP ou SVG.' },
        { status: 400 }
      )
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Le fichier ne doit pas dépasser 2 Mo.' },
        { status: 400 }
      )
    }

    // Read file as base64 data URL
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const dataUrl = `data:${file.type};base64,${base64}`

    // Update the establishment with the logo
    const etablissement = await db.etablissement.update({
      where: { id: etablissementId },
      data: { logo: dataUrl },
    })

    // Audit
    await db.auditLog.create({
      data: {
        userId: authUser.id,
        action: 'UPDATE_LOGO',
        entite: 'Etablissement',
        entiteId: etablissementId,
        details: JSON.stringify({
          updatedBy: authUser.role,
          fileName: file.name,
          fileSize: file.size,
        }),
      },
    })

    return NextResponse.json({ logo: dataUrl, etablissement })
  } catch (error) {
    console.error('Error uploading logo:', error)
    return NextResponse.json({ error: 'Erreur lors du téléchargement du logo' }, { status: 500 })
  }
}
