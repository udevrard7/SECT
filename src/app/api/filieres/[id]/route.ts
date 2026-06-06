import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const filiere = await db.filiere.findUnique({
      where: { id },
      include: {
        etablissement: {
          select: { id: true, nom: true, type: true, ville: true, pays: true },
        },
        responsable: {
          select: { id: true, name: true, email: true },
        },
        etudiants: {
          select: {
            id: true,
            name: true,
            email: true,
            actif: true,
            createdAt: true,
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: { etudiants: true },
        },
      },
    })

    if (!filiere) {
      return NextResponse.json(
        { error: 'Filière non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json(filiere)
  } catch (error) {
    console.error('Error getting filiere:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la filière' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { nom, code, etablissementId, responsableId, description, nbEtudiants, actif } = body

    const existing = await db.filiere.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Filière non trouvée' },
        { status: 404 }
      )
    }

    // Check unique constraint if name or etablissementId changed
    if ((nom && nom !== existing.nom) || (etablissementId && etablissementId !== existing.etablissementId)) {
      const duplicate = await db.filiere.findFirst({
        where: {
          nom: nom || existing.nom,
          etablissementId: etablissementId || existing.etablissementId,
          id: { not: id },
        },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Une filière avec ce nom existe déjà dans cet établissement' },
          { status: 409 }
        )
      }
    }

    const data: Record<string, unknown> = {}
    if (nom !== undefined) data.nom = nom
    if (code !== undefined) data.code = code
    if (etablissementId !== undefined) data.etablissementId = etablissementId
    if (responsableId !== undefined) data.responsableId = responsableId
    if (description !== undefined) data.description = description
    if (nbEtudiants !== undefined) data.nbEtudiants = nbEtudiants
    if (actif !== undefined) data.actif = actif

    const filiere = await db.filiere.update({
      where: { id },
      data,
      include: {
        etablissement: { select: { id: true, nom: true } },
        responsable: { select: { id: true, name: true, email: true } },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'Filiere',
        entiteId: id,
        details: JSON.stringify({ updatedFields: Object.keys(data) }),
      },
    })

    return NextResponse.json(filiere)
  } catch (error) {
    console.error('Error updating filiere:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la filière' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.filiere.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Filière non trouvée' },
        { status: 404 }
      )
    }

    // Soft delete
    const filiere = await db.filiere.update({
      where: { id },
      data: { actif: false },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'Filiere',
        entiteId: id,
        details: JSON.stringify({ nom: existing.nom, permanent: false }),
      },
    })

    return NextResponse.json({
      message: 'Filière désactivée (suppression logique)',
      filiere,
    })
  } catch (error) {
    console.error('Error deleting filiere:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la filière' },
      { status: 500 }
    )
  }
}
