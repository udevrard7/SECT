import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/etablissements/[id] — Get single etablissement with details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const etablissement = await db.etablissement.findUnique({
      where: { id },
      include: {
        filieres: {
          include: {
            _count: { select: { etudiants: true } },
            responsable: { select: { id: true, name: true, email: true } },
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            actif: true,
          },
          take: 50,
        },
        _count: { select: { filieres: true, users: true } },
      },
    })

    if (!etablissement) {
      return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 404 })
    }

    return NextResponse.json({ etablissement })
  } catch (error) {
    console.error('Error fetching etablissement:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 })
  }
}

// PATCH /api/etablissements/[id] — Update an etablissement
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const data: Record<string, unknown> = {}
    if (body.nom !== undefined) data.nom = body.nom
    if (body.type !== undefined) data.type = body.type || null
    if (body.ville !== undefined) data.ville = body.ville || null
    if (body.pays !== undefined) data.pays = body.pays
    if (body.adresse !== undefined) data.adresse = body.adresse || null
    if (body.telephone !== undefined) data.telephone = body.telephone || null
    if (body.email !== undefined) data.email = body.email || null
    if (body.siteWeb !== undefined) data.siteWeb = body.siteWeb || null
    if (body.actif !== undefined) data.actif = body.actif

    const etablissement = await db.etablissement.update({
      where: { id },
      data,
      include: {
        _count: { select: { filieres: true, users: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'Etablissement',
        entiteId: id,
        details: JSON.stringify(data),
      },
    })

    return NextResponse.json({ etablissement })
  } catch (error) {
    console.error('Error updating etablissement:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
  }
}

// DELETE /api/etablissements/[id] — Delete an etablissement
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const etablissement = await db.etablissement.delete({
      where: { id },
      select: { id: true, nom: true },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'Etablissement',
        entiteId: id,
        details: JSON.stringify({ nom: etablissement.nom }),
      },
    })

    return NextResponse.json({ message: 'Établissement supprimé', etablissement })
  } catch (error) {
    console.error('Error deleting etablissement:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }
}
