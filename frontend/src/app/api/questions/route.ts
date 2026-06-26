import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { resolveTenantFilter, requireAdminEtablissementAccess } from '@/lib/tenant-access'

async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const documentId = searchParams.get('documentId')
    const type = searchParams.get('type')
    const difficulte = searchParams.get('difficulte')
    const validee = searchParams.get('validee')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = { deletedAt: null }

    if (documentId) where.documentId = documentId
    if (type) where.type = type
    if (difficulte) where.difficulte = difficulte
    if (validee !== null && validee !== undefined) where.validee = validee === 'true'

    if (search) {
      where.enonce = { contains: search }
    }

    // ─── Tenant scoping ───
    if (user.role === 'ADMIN') {
      if (userId) {
        // ADMIN with userId filter: verify access to that user's establishment
        const targetUser = await db.user.findUnique({
          where: { id: userId },
          select: { etablissementId: true },
        })
        if (targetUser?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, targetUser.etablissementId)
          if (accessError) return accessError
        }
        where.OR = [
          { auteurId: userId },
          { document: { ownerId: userId } },
        ]
      } else {
        // ADMIN without filter: return questions from authorized establishments only
        const tenantFilter = await resolveTenantFilter(user)
        if ('error' in tenantFilter) return tenantFilter.error
        if ('etablissementIds' in tenantFilter) {
          where.auteur = { etablissementId: { in: tenantFilter.etablissementIds } }
        } else if ('etablissementId' in tenantFilter) {
          where.auteur = { etablissementId: tenantFilter.etablissementId }
        }
      }
    } else if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: auto-scope to their establishment
      if (userId) {
        where.OR = [
          { auteurId: userId },
          { document: { ownerId: userId } },
        ]
      } else {
        where.auteur = { etablissementId: user.etablissementId }
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: scope to their establishment
      where.auteur = { etablissementId: user.etablissementId }
      if (userId) {
        // Additional filter for specific user (already scoped by etablissementId)
        delete where.auteur
        where.OR = [
          { auteurId: userId, auteur: { etablissementId: user.etablissementId } },
          { document: { ownerId: userId } },
        ]
      }
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

async function _DELETE(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const { ids } = body as { ids: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Liste d\'IDs requise' },
        { status: 400 }
      )
    }

    // ─── Verify ownership or EtablissementAccess before delete ───
    // The Question model exposes only `auteurId` (scalar) and no relation to its author,
    // so we resolve each author's `etablissementId` via a batched User lookup.
    const questionsToDelete = await db.question.findMany({
      where: { id: { in: ids } },
      select: { id: true, auteurId: true },
    })

    const auteurIds = Array.from(
      new Set(questionsToDelete.map((q) => q.auteurId).filter((id): id is string => Boolean(id)))
    )
    const auteurs = auteurIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: auteurIds } },
          select: { id: true, etablissementId: true },
        })
      : []
    const auteurEtabMap = new Map(auteurs.map((a) => [a.id, a.etablissementId]))
    const getAuteurEtabId = (q: { auteurId: string | null }) =>
      q.auteurId ? auteurEtabMap.get(q.auteurId) : undefined

    if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: can only delete their own questions
      const notOwned = questionsToDelete.filter(q => q.auteurId !== user.id)
      if (notOwned.length > 0) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez supprimer que vos propres questions.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: can delete questions in their establishment
      const notInEtab = questionsToDelete.filter(q => getAuteurEtabId(q) !== user.etablissementId)
      if (notInEtab.length > 0) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez supprimer que les questions de votre établissement.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the questions' establishments
      const etabIds = new Set(
        questionsToDelete
          .map((q) => getAuteurEtabId(q))
          .filter((id): id is string => Boolean(id))
      )
      for (const etabId of etabIds) {
        const accessError = await requireAdminEtablissementAccess(user, etabId)
        if (accessError) return accessError
      }
    }

    const result = await db.$transaction(
      ids.map((id) =>
        db.question.delete({ where: { id } })
      )
    )

    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
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

async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const { type, enonce, propositions, reponseCorrecte, explication, difficulte, themes, documentId, auteurId } = body

    if (!type || !enonce) {
      return NextResponse.json(
        { error: 'Type et énoncé requis' },
        { status: 400 }
      )
    }

    // ─── Tenant scoping for POST ───
    let finalAuteurId = auteurId || null

    if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT must set auteurId to their own ID
      finalAuteurId = user.id
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: can create questions in their establishment
      // auteurId must belong to their establishment if provided
      if (finalAuteurId && finalAuteurId !== user.id) {
        const auteur = await db.user.findUnique({
          where: { id: finalAuteurId },
          select: { etablissementId: true },
        })
        if (auteur?.etablissementId !== user.etablissementId) {
          return NextResponse.json(
            { error: 'Accès refusé. Vous ne pouvez créer des questions que pour votre établissement.' },
            { status: 403 }
          )
        }
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the auteur's establishment
      if (finalAuteurId) {
        const auteur = await db.user.findUnique({
          where: { id: finalAuteurId },
          select: { etablissementId: true },
        })
        if (auteur?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, auteur.etablissementId)
          if (accessError) return accessError
        }
      }
    }

    const question = await db.question.create({
      data: {
        documentId: documentId || null,
        auteurId: finalAuteurId,
        type,
        enonce,
        propositions: propositions ? JSON.stringify(propositions) : null,
        reponseCorrecte: reponseCorrecte ? JSON.stringify(reponseCorrecte) : null,
        explication: explication || null,
        difficulte: difficulte || 'MOYEN',
        themes: themes ? JSON.stringify(themes) : null,
        validee: true,
      },
    })

    await db.auditLog.create({
      data: {
        userId: finalAuteurId || user.id,
        userEmail: user.email,
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

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const DELETE = withAuth(_DELETE, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
