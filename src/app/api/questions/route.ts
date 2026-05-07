import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const documentId = searchParams.get('documentId')
    const type = searchParams.get('type')
    const difficulte = searchParams.get('difficulte')
    const validee = searchParams.get('validee')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}

    if (documentId) where.documentId = documentId
    if (type) where.type = type
    if (difficulte) where.difficulte = difficulte
    if (validee !== null && validee !== undefined) where.validee = validee === 'true'

    if (search) {
      where.enonce = { contains: search }
    }

    // If userId provided, only get questions from user's documents or manually created
    if (userId) {
      where.OR = [
        { auteurId: userId },
        { document: { ownerId: userId } },
      ]
    }

    const [questions, total] = await Promise.all([
      db.question.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          document: {
            select: { id: true, nomFichier: true },
          },
        },
      }),
      db.question.count({ where }),
    ])

    // Parse JSON fields
    const parsedQuestions = questions.map((q) => ({
      ...q,
      propositions: q.propositions ? JSON.parse(q.propositions) : null,
      reponseCorrecte: q.reponseCorrecte ? JSON.parse(q.reponseCorrecte) : null,
      themes: q.themes ? JSON.parse(q.themes) : null,
      tags: q.tags ? JSON.parse(q.tags) : null,
    }))

    return NextResponse.json({
      questions: parsedQuestions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('List questions error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des questions' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, enonce, propositions, reponseCorrecte, explication, difficulte, themes, documentId, auteurId } = body

    if (!type || !enonce) {
      return NextResponse.json(
        { error: 'Type et énoncé requis' },
        { status: 400 }
      )
    }

    const question = await db.question.create({
      data: {
        documentId: documentId || null,
        auteurId: auteurId || null,
        type,
        enonce,
        propositions: propositions ? JSON.stringify(propositions) : null,
        reponseCorrecte: reponseCorrecte ? JSON.stringify(reponseCorrecte) : null,
        explication: explication || null,
        difficulte: difficulte || 'MOYEN',
        themes: themes ? JSON.stringify(themes) : null,
        validee: true, // Manually created questions are auto-validated
      },
    })

    return NextResponse.json({
      question: {
        ...question,
        propositions: question.propositions ? JSON.parse(question.propositions) : null,
        reponseCorrecte: question.reponseCorrecte ? JSON.parse(question.reponseCorrecte) : null,
        themes: question.themes ? JSON.parse(question.themes) : null,
      },
      message: 'Question créée avec succès',
    })
  } catch (error) {
    console.error('Create question error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de la question' },
      { status: 500 }
    )
  }
}
