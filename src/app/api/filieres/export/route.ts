import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

// GET /api/filieres/export — Export filières as CSV
async function _GET(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { searchParams } = new URL(request.url)
    const etablissementId = searchParams.get('etablissementId') || ''
    const search = searchParams.get('search') || ''
    const responsableId = searchParams.get('responsableId') || ''
    const actif = searchParams.get('actif') || ''

    // Build where clause with same filters as main GET /api/filieres
    const where: Record<string, unknown> = {}

    if (etablissementId) where.etablissementId = etablissementId
    if (responsableId) where.responsableId = responsableId
    if (actif !== '') where.actif = actif === 'true'
    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ]
    }

    // RESPONSABLE can only export filières in their establishment
    if (context.user.role === 'RESPONSABLE' && context.user.etablissementId) {
      where.etablissementId = context.user.etablissementId
    }

    const filieres = await db.filiere.findMany({
      where,
      include: {
        etablissement: { select: { id: true, nom: true } },
        responsable: { select: { id: true, name: true, email: true } },
        _count: { select: { etudiants: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Build CSV content
    const headers = ['Nom', 'Code', 'Établissement', 'Responsable', 'Étudiants', 'Statut', 'Date création']

    function escapeCsv(value: string): string {
      // If the value contains a comma, double quote, or newline, wrap it in quotes
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    const rows = filieres.map((f) => [
      escapeCsv(f.nom),
      escapeCsv(f.code || ''),
      escapeCsv(f.etablissement?.nom || ''),
      escapeCsv(f.responsable?.name || ''),
      String(f._count.etudiants),
      f.actif ? 'Actif' : 'Inactif',
      f.createdAt.toISOString().split('T')[0], // YYYY-MM-DD format
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    // Add BOM for proper UTF-8 display in Excel
    const bom = '\uFEFF'
    const csvWithBom = bom + csvContent

    // Create audit log for the export action
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        userEmail: context.user.email,
        action: 'EXPORT',
        entite: 'Filiere',
        details: JSON.stringify({
          format: 'CSV',
          count: filieres.length,
          filters: { etablissementId, search, responsableId, actif },
        }),
      },
    })

    return new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="filieres_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting filieres:', error)
    return NextResponse.json(
      { error: "Erreur lors de l'export des filières" },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE'])
