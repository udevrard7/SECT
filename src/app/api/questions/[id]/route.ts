import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

const parseJsonSafe = (val: string | null) => {
  if (!val) return null
  try { return JSON.parse(val) } catch { return val }
}

async function _GET(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params

    const question = await db.question.findUnique({
      where: { id },
      include: {
        document: {
          select: { id: true, nomFichier: true },
        },
      },
    })

    if (!question || question.deletedAt) {
      return NextResponse.json(
        { error: 'Question non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      question: {
        ...question,
        propositions: parseJsonSafe(question.propositions as string | null),
        reponseCorrecte: parseJsonSafe(question.reponseCorrecte as string | null),
        themes: parseJsonSafe(question.themes as string | null),
        tags: parseJsonSafe(question.tags as string | null),
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

async function _PATCH(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const { action, ...data } = body

    if (action === 'valider') {
      const question = await db.question.update({
        where: { id },
        data: { validee: true },
      })

      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'UPDATE_QUESTION',
          entite: 'Question',
          entiteId: id,
          details: 'Question validée',
        },
      })

      return NextResponse.json({
        question: {
          ...question,
          propositions: parseJsonSafe(question.propositions as string | null),
          reponseCorrecte: parseJsonSafe(question.reponseCorrecte as string | null),
          themes: parseJsonSafe(question.themes as string | null),
        },
        message: 'Question validée',
      })
    }

    if (action === 'devalider') {
      const question = await db.question.update({
        where: { id },
        data: { validee: false },
      })

      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'UPDATE_QUESTION',
          entite: 'Question',
          entiteId: id,
          details: 'Question dévalidée',
        },
      })

      return NextResponse.json({
        question: {
          ...question,
          propositions: parseJsonSafe(question.propositions as string | null),
          reponseCorrecte: parseJsonSafe(question.reponseCorrecte as string | null),
          themes: parseJsonSafe(question.themes as string | null),
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

    const changedFields = Object.keys(updateData)
    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'UPDATE_QUESTION',
        entite: 'Question',
        entiteId: id,
        details: `Question mise à jour — champs: ${changedFields.join(', ')}`,
      },
    })

    return NextResponse.json({
      question: {
        ...question,
        propositions: parseJsonSafe(question.propositions as string | null),
        reponseCorrecte: parseJsonSafe(question.reponseCorrecte as string | null),
        themes: parseJsonSafe(question.themes as string | null),
        tags: parseJsonSafe(question.tags as string | null),
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

async function _DELETE(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params

    await db.question.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'SOFT_DELETE_QUESTION',
        entite: 'Question',
        entiteId: id,
        details: 'Question déplacée vers la corbeille',
      },
    })

    return NextResponse.json({ message: 'Question déplacée vers la corbeille' })
  } catch (error) {
    console.error('Delete question error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la question' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const DELETE = withAuth(_DELETE, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
