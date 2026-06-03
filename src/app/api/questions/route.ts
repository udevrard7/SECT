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

    // Parse JSON fields safely (some fields like reponseCorrecte may not be valid JSON)
    const parseJsonSafe = (val: string | null) => {
      if (!val) return null
      try { return JSON.parse(val) } catch { return val }
    }

    const parsedQuestions = questions.map((q) => ({
      ...q,
      propositions: parseJsonSafe(q.propositions as string | null),
      reponseCorrecte: parseJsonSafe(q.reponseCorrecte as string | null),
      themes: parseJsonSafe(q.themes as string | null),
      tags: parseJsonSafe(q.tags as string | null),
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

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids } = body as { ids: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Liste d\'IDs requise' },
        { status: 400 }
      )
    }

    // Hard delete questions in a transaction (soft delete not supported)
    const result = await db.$transaction(
      ids.map((id) =>
        db.question.delete({ where: { id } })
      )
    )

    // Audit log
    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'BATCH_DELETE_QUESTIONS',
        entite: 'Question',
        entiteId: ids.join(','),
        details: `${ids.length} question(s) supprimée(s) définitivement`,
      },
    })

    return NextResponse.json({
      message: `${result.length} question(s) supprimée(s) définitivement`,
      deletedCount: result.length,
    })
  } catch (error) {
    console.error('Batch delete questions error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression des questions' },
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

    // Audit log
    await db.auditLog.create({
      data: {
        userId: auteurId || 'system',
        userEmail: 'system',
        action: 'CREATE_QUESTION',
        entite: 'Question',
        entiteId: question.id,
        details: `Question ${type} créée`,
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
