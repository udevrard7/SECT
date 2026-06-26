import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createId } from '@paralleldrive/cuid2'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { devoirId, criteres } = body

    // Validation
    if (!devoirId) {
      return NextResponse.json(
        { error: 'Devoir requis' },
        { status: 400 }
      )
    }

    if (!criteres || (Array.isArray(criteres) && criteres.length === 0)) {
      return NextResponse.json(
        { error: 'Critères requis pour la grille d\'évaluation' },
        { status: 400 }
      )
    }

    // Verify devoir exists
    const devoir = await db.devoir.findUnique({ where: { id: devoirId } })
    if (!devoir) {
      return NextResponse.json(
        { error: 'Devoir non trouvé' },
        { status: 404 }
      )
    }

    // Check if grille already exists for this devoir (1-to-1 relation)
    const existingGrille = await db.grilleEvaluation.findUnique({
      where: { devoirId },
    })
    if (existingGrille) {
      return NextResponse.json(
        { error: 'Une grille d\'évaluation existe déjà pour ce devoir. Utilisez PATCH pour la modifier.' },
        { status: 400 }
      )
    }

    const grille = await db.grilleEvaluation.create({
      data: {
        id: createId(),
        devoirId,
        criteres: typeof criteres === 'string' ? criteres : JSON.stringify(criteres),
        updatedAt: new Date(),
      },
      include: {
        Devoir: { select: { id: true, titre: true } },
      },
    })

    return NextResponse.json({
      grille: {
        ...grille,
        criteres: grille.criteres ? JSON.parse(grille.criteres) : null,
      },
      message: 'Grille d\'évaluation créée avec succès',
    })
  } catch (error) {
    console.error('Create grille evaluation error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de la grille d\'évaluation' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const devoirId = searchParams.get('devoirId')

    const where: Record<string, unknown> = {}
    if (devoirId) where.devoirId = devoirId

    const grilles = await db.grilleEvaluation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        Devoir: { select: { id: true, titre: true, statut: true } },
      },
    })

    const parsedGrilles = grilles.map((g) => ({
      ...g,
      criteres: g.criteres ? JSON.parse(g.criteres) : null,
    }))

    return NextResponse.json({ grilles: parsedGrilles })
  } catch (error) {
    console.error('List grilles evaluation error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des grilles d\'évaluation' },
      { status: 500 }
    )
  }
}
