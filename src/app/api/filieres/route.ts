import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { resolveTenantFilter, requireAdminEtablissementAccess } from '@/lib/tenant-access'

// GET /api/filieres — List filieres
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const etablissementId = searchParams.get('etablissementId') || ''
    const search = searchParams.get('search') || ''
    const responsableId = searchParams.get('responsableId') || ''
    const actif = searchParams.get('actif') || ''

    const where: Record<string, unknown> = {}

    // ─── Tenant scoping ───
    if (user.role === 'ADMIN') {
      // ADMIN: Use resolveTenantFilter to check access
      const tenantFilter = await resolveTenantFilter(user, etablissementId || null)
      if ('error' in tenantFilter) return tenantFilter.error
      if ('etablissementId' in tenantFilter) {
        where.etablissementId = tenantFilter.etablissementId
      } else if ('etablissementIds' in tenantFilter) {
        where.etablissementId = { in: tenantFilter.etablissementIds }
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: auto-scope to their own etablissement (override query param)
      where.etablissementId = user.etablissementId
    }

    // Non-role filter params
    if (responsableId) where.responsableId = responsableId
    if (actif !== '') where.actif = actif === 'true'
    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ]
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

    return NextResponse.json({ filieres })
  } catch (error) {
    console.error('Error fetching filieres:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 })
  }
}

// POST /api/filieres — Create a filiere
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    let { nom, code, etablissementId, responsableId, description, nbEtudiants, actif } = body

    if (!nom || !etablissementId) {
      return NextResponse.json({ error: 'Le nom et l\'établissement sont obligatoires' }, { status: 400 })
    }

    // ─── Tenant scoping ───
    if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: auto-scope to their own establishment (override the body param)
      etablissementId = user.etablissementId
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the target establishment
      const accessError = await requireAdminEtablissementAccess(user, etablissementId)
      if (accessError) return accessError
    }

    // Check unique constraint
    const existing = await db.filiere.findFirst({
      where: { nom, etablissementId },
    })
    if (existing) {
      return NextResponse.json({ error: 'Une filière avec ce nom existe déjà dans cet établissement' }, { status: 409 })
    }

    const filiere = await db.filiere.create({
      data: {
        nom,
        code: code || null,
        etablissementId,
        responsableId: responsableId || null,
        description: description || null,
        nbEtudiants: nbEtudiants || null,
        actif: actif !== undefined ? actif : true,
      },
      include: {
        etablissement: { select: { id: true, nom: true } },
        responsable: { select: { id: true, name: true, email: true } },
        _count: { select: { etudiants: true } },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'Filiere',
        entiteId: filiere.id,
        details: JSON.stringify({ nom, code, etablissementId }),
      },
    })

    return NextResponse.json({ filiere }, { status: 201 })
  } catch (error) {
    console.error('Error creating filiere:', error)
    return NextResponse.json({ error: 'Erreur lors de la création de la filière' }, { status: 500 })
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE'])
export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE'])
