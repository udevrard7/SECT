import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const question = await db.question.findUnique({
      where: { id },
      include: {
        document: {
          select: { id: true, nomFichier: true },
        },
      },
    })

    if (!question) {
      return NextResponse.json(
        { error: 'Question non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      question: {
        ...question,
        propositions: question.propositions ? JSON.parse(question.propositions) : null,
        reponseCorrecte: question.reponseCorrecte ? JSON.parse(question.reponseCorrecte) : null,
        themes: question.themes ? JSON.parse(question.themes) : null,
        tags: question.tags ? JSON.parse(question.tags) : null,
      },
    })
  } catch (error) {
    console.error('Get question error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la question' },
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
    const { action, ...data } = body

    // Handle specific actions
    if (action === 'valider') {
      const question = await db.question.update({
        where: { id },
        data: { validee: true },
      })
      return NextResponse.json({
        question: {
          ...question,
          propositions: question.propositions ? JSON.parse(question.propositions) : null,
          reponseCorrecte: question.reponseCorrecte ? JSON.parse(question.reponseCorrecte) : null,
          themes: question.themes ? JSON.parse(question.themes) : null,
        },
        message: 'Question validée',
      })
    }

    if (action === 'devalider') {
      const question = await db.question.update({
        where: { id },
        data: { validee: false },
      })
      return NextResponse.json({
        question: {
          ...question,
          propositions: question.propositions ? JSON.parse(question.propositions) : null,
          reponseCorrecte: question.reponseCorrecte ? JSON.parse(question.reponseCorrecte) : null,
          themes: question.themes ? JSON.parse(question.themes) : null,
        },
        message: 'Question dévalidée',
      })
    }

    // General update
    const updateData: Record<string, unknown> = {}
    if (data.enonce !== undefined) updateData.enonce = data.enonce
    if (data.propositions !== undefined) updateData.propositions = JSON.stringify(data.propositions)
    if (data.reponseCorrecte !== undefined) updateData.reponseCorrecte = JSON.stringify(data.reponseCorrecte)
    if (data.explication !== undefined) updateData.explication = data.explication
    if (data.difficulte !== undefined) updateData.difficulte = data.difficulte
    if (data.themes !== undefined) updateData.themes = JSON.stringify(data.themes)
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags)
    if (data.validee !== undefined) updateData.validee = data.validee

    const question = await db.question.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      question: {
        ...question,
        propositions: question.propositions ? JSON.parse(question.propositions) : null,
        reponseCorrecte: question.reponseCorrecte ? JSON.parse(question.reponseCorrecte) : null,
        themes: question.themes ? JSON.parse(question.themes) : null,
        tags: question.tags ? JSON.parse(question.tags) : null,
      },
      message: 'Question mise à jour',
    })
  } catch (error) {
    console.error('Update question error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la question' },
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

    await db.question.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Question supprimée' })
  } catch (error) {
    console.error('Delete question error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la question' },
      { status: 500 }
    )
  }
}
