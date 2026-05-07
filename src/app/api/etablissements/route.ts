import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/etablissements — List etablissements
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''
    const actif = searchParams.get('actif') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { ville: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (type) where.type = type
    if (actif !== '') where.actif = actif === 'true'

    const etablissements = await db.etablissement.findMany({
      where,
      include: {
        _count: { select: { filieres: true, users: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ etablissements })
  } catch (error) {
    console.error('Error fetching etablissements:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 })
  }
}

// POST /api/etablissements — Create an etablissement
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nom, type, ville, pays, adresse, telephone, email, siteWeb, actif } = body

    if (!nom) {
      return NextResponse.json({ error: 'Le nom est obligatoire' }, { status: 400 })
    }

    // Check unique name
    const existing = await db.etablissement.findUnique({ where: { nom } })
    if (existing) {
      return NextResponse.json({ error: 'Un établissement avec ce nom existe déjà' }, { status: 409 })
    }

    const etablissement = await db.etablissement.create({
      data: {
        nom,
        type: type || null,
        ville: ville || null,
        pays: pays || 'France',
        adresse: adresse || null,
        telephone: telephone || null,
        email: email || null,
        siteWeb: siteWeb || null,
        actif: actif !== undefined ? actif : true,
      },
      include: {
        _count: { select: { filieres: true, users: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'Etablissement',
        entiteId: etablissement.id,
        details: JSON.stringify({ nom, type, ville }),
      },
    })

    return NextResponse.json({ etablissement }, { status: 201 })
  } catch (error) {
    console.error('Error creating etablissement:', error)
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 })
  }
}
