import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/alertes — List alertes with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filiereId = searchParams.get('filiereId') || ''
    const severity = searchParams.get('severity') || ''
    const type = searchParams.get('type') || ''
    const lue = searchParams.get('lue') || ''
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}

    if (filiereId) where.filiereId = filiereId
    if (severity) where.severity = severity
    if (type) where.type = type
    if (lue === 'true') where.lue = true
    else if (lue === 'false') where.lue = false
    if (search) {
      where.OR = [
        { titre: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [alertes, total] = await Promise.all([
      db.alerte.findMany({
        where,
        include: {
          filiere: { select: { id: true, nom: true } },
          epreuve: { select: { id: true, titre: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.alerte.count({ where }),
    ])

    return NextResponse.json({ alertes, total })
  } catch (error) {
    console.error('Error fetching alertes:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des alertes' },
      { status: 500 }
    )
  }
}

// POST /api/alertes — Create a new alerte
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { titre, description, severity, type, filiereId, epreuveId, userId } = body

    if (!titre || !description) {
      return NextResponse.json(
        { error: 'Le titre et la description sont obligatoires' },
        { status: 400 }
      )
    }

    const alerte = await db.alerte.create({
      data: {
        titre,
        description,
        severity: severity || 'INFO',
        type: type || 'CUSTOM',
        filiereId: filiereId || null,
        epreuveId: epreuveId || null,
        userId: userId || null,
      },
      include: {
        filiere: { select: { id: true, nom: true } },
        epreuve: { select: { id: true, titre: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })

    return NextResponse.json({ alerte }, { status: 201 })
  } catch (error) {
    console.error('Error creating alerte:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'alerte' },
      { status: 500 }
    )
  }
}
