import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/filieres — List filieres
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const etablissementId = searchParams.get('etablissementId') || ''
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}

    if (etablissementId) where.etablissementId = etablissementId
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
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nom, code, niveau, etablissementId, responsableId, description, nbEtudiants, actif } = body

    if (!nom || !etablissementId) {
      return NextResponse.json({ error: 'Le nom et l\'établissement sont obligatoires' }, { status: 400 })
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
        niveau: niveau || null,
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
