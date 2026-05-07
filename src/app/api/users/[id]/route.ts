import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// GET /api/users/[id] — Get a single user
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        etablissementId: true,
        filiereId: true,
        image: true,
        actif: true,
        derniereConnexion: true,
        createdAt: true,
        updatedAt: true,
        etablissement: { select: { id: true, nom: true } },
        filiere: { select: { id: true, nom: true } },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 })
  }
}

// PATCH /api/users/[id] — Update a user
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.email !== undefined) data.email = body.email
    if (body.role !== undefined) data.role = body.role
    if (body.etablissementId !== undefined) data.etablissementId = body.etablissementId || null
    if (body.filiereId !== undefined) data.filiereId = body.filiereId || null
    if (body.actif !== undefined) data.actif = body.actif
    if (body.password) {
      data.password = await bcrypt.hash(body.password, 10)
    }

    const user = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        etablissementId: true,
        filiereId: true,
        actif: true,
        etablissement: { select: { id: true, nom: true } },
        filiere: { select: { id: true, nom: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'User',
        entiteId: id,
        details: JSON.stringify(data),
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
  }
}

// DELETE /api/users/[id] — Delete a user
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const user = await db.user.delete({
      where: { id },
      select: { id: true, name: true, email: true },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'User',
        entiteId: id,
        details: JSON.stringify({ name: user.name, email: user.email }),
      },
    })

    return NextResponse.json({ message: 'Utilisateur supprimé', user })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }
}
