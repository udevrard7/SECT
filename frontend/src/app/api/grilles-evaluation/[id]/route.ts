import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const grille = await db.grilleEvaluation.findUnique({
      where: { id },
      include: {
        Devoir: {
          select: {
            id: true,
            titre: true,
            statut: true,
            noteMax: true,
            UniteEnseignement: { select: { id: true, code: true, nom: true } },
          },
        },
      },
    })

    if (!grille) {
      return NextResponse.json({ error: 'Grille d\'évaluation non trouvée' }, { status: 404 })
    }

    return NextResponse.json({
      grille: {
        ...grille,
        criteres: grille.criteres ? JSON.parse(grille.criteres) : null,
      },
    })
  } catch (error) {
    console.error('Get grille evaluation error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la grille d\'évaluation' },
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
    const { criteres } = body

    // Check grille exists
    const existing = await db.grilleEvaluation.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Grille d\'évaluation non trouvée' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (criteres !== undefined) {
      updateData.criteres = typeof criteres === 'string' ? criteres : JSON.stringify(criteres)
    }

    const grille = await db.grilleEvaluation.update({
      where: { id },
      data: updateData,
      include: {
        Devoir: { select: { id: true, titre: true } },
      },
    })

    return NextResponse.json({
      grille: {
        ...grille,
        criteres: grille.criteres ? JSON.parse(grille.criteres) : null,
      },
      message: 'Grille d\'évaluation mise à jour',
    })
  } catch (error) {
    console.error('Update grille evaluation error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la grille d\'évaluation' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.grilleEvaluation.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Grille d\'évaluation non trouvée' }, { status: 404 })
    }

    await db.grilleEvaluation.delete({ where: { id } })

    return NextResponse.json({ message: 'Grille d\'évaluation supprimée' })
  } catch (error) {
    console.error('Delete grille evaluation error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la grille d\'évaluation' },
      { status: 500 }
    )
  }
}
