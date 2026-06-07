import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

async function _GET(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params

    const { searchParams } = new URL(request.url)
    const studentView = searchParams.get('studentView') === 'true'

    const epreuve = await db.epreuve.findUnique({
      where: { id },
      include: {
        enseignant: { select: { id: true, name: true, email: true } },
        questions: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                enonce: true,
                propositions: true,
                difficulte: true,
                themes: true,
                ...(studentView ? {} : { reponseCorrecte: true, explication: true }),
              },
            },
          },
          orderBy: { ordre: 'asc' },
        },
        ...(studentView ? {} : {
          sessions: {
            include: {
              etudiant: { select: { id: true, name: true, email: true } },
              reponses: true,
              resultat: true,
            },
          },
        }),
        sourceDocuments: {
          include: {
            document: {
              select: {
                id: true,
                nomFichier: true,
                typeMime: true,
                statutAnalyse: true,
                themesDetectes: true,
                resumeAnalyse: true,
                contenuTexte: true,
              },
            },
          },
        },
      },
    })

    if (!epreuve || epreuve.deletedAt) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    const parsed = {
      ...epreuve,
      groupesCibles: epreuve.groupesCibles ? JSON.parse(epreuve.groupesCibles) : null,
      questions: epreuve.questions.map((eq) => ({
        ...eq,
        question: {
          ...eq.question,
          propositions: eq.question.propositions ? JSON.parse(eq.question.propositions) : null,
          themes: eq.question.themes ? JSON.parse(eq.question.themes) : null,
          ...(studentView ? {} : {
            reponseCorrecte: eq.question.reponseCorrecte ? JSON.parse(eq.question.reponseCorrecte) : null,
          }),
        },
      })),
      ...(studentView ? {} : {
        sessions: (epreuve.sessions as Array<Record<string, unknown>> | undefined)?.map((sRaw) => {
          const s = sRaw as Record<string, unknown> & { logEvents: string | null; reponses: Array<Record<string, unknown>> }
          return {
            ...s,
            logEvents: s.logEvents ? JSON.parse(s.logEvents) : null,
            reponses: s.reponses.map((r) => ({
              ...r,
            })),
          }
        }) || [],
      }),
    }

    return NextResponse.json({ epreuve: parsed })
  } catch (error) {
    console.error('Get epreuve error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'épreuve' },
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

    const existing = await db.epreuve.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    if (action === 'publier') {
      const epreuve = await db.epreuve.update({
        where: { id },
        data: { statut: 'PLANIFIEE' },
      })
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'UPDATE_EPREUVE',
          entite: 'Epreuve',
          entiteId: id,
          details: `Épreuve publiée — ${existing.titre}`,
        },
      })
      return NextResponse.json({ epreuve, message: 'Épreuve publiée' })
    }

    if (action === 'lancer') {
      const epreuve = await db.epreuve.update({
        where: { id },
        data: { statut: 'EN_COURS' },
      })
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'UPDATE_EPREUVE',
          entite: 'Epreuve',
          entiteId: id,
          details: `Épreuve lancée — ${existing.titre}`,
        },
      })
      return NextResponse.json({ epreuve, message: 'Épreuve lancée' })
    }

    if (action === 'terminer') {
      const epreuve = await db.epreuve.update({
        where: { id },
        data: { statut: 'TERMINEE' },
      })
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'UPDATE_EPREUVE',
          entite: 'Epreuve',
          entiteId: id,
          details: `Épreuve terminée — ${existing.titre}`,
        },
      })
      return NextResponse.json({ epreuve, message: 'Épreuve terminée' })
    }

    if (action === 'cloturer') {
      const epreuve = await db.epreuve.update({
        where: { id },
        data: { 
          statut: 'CLOTUREE',
          clotureeAt: new Date(),
          clotureeAutomatiquement: false,
          clotureePar: body.userId || null,
        },
      })
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'UPDATE_EPREUVE',
          entite: 'Epreuve',
          entiteId: id,
          details: `Épreuve clôturée — ${existing.titre}`,
        },
      })
      return NextResponse.json({ epreuve, message: 'Épreuve clôturée' })
    }

    // General update
    const updateData: Record<string, unknown> = {}
    if (data.titre !== undefined) updateData.titre = data.titre
    if (data.description !== undefined) updateData.description = data.description
    if (data.duree !== undefined) updateData.duree = data.duree
    if (data.dateDebut !== undefined) updateData.dateDebut = new Date(data.dateDebut)
    if (data.dateFin !== undefined) updateData.dateFin = new Date(data.dateFin)
    if (data.melangeQuestions !== undefined) updateData.melangeQuestions = data.melangeQuestions
    if (data.melangePropositions !== undefined) updateData.melangePropositions = data.melangePropositions
    if (data.blocageRetour !== undefined) updateData.blocageRetour = data.blocageRetour
    if (data.groupesCibles !== undefined) updateData.groupesCibles = JSON.stringify(data.groupesCibles)
    if (data.statut !== undefined) updateData.statut = data.statut

    const epreuve = await db.epreuve.update({
      where: { id },
      data: updateData,
    })

    const changedFields = Object.keys(updateData)
    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'UPDATE_EPREUVE',
        entite: 'Epreuve',
        entiteId: id,
        details: `Épreuve mise à jour — champs: ${changedFields.join(', ')}`,
      },
    })

    return NextResponse.json({
      epreuve: {
        ...epreuve,
        groupesCibles: epreuve.groupesCibles ? JSON.parse(epreuve.groupesCibles) : null,
      },
      message: 'Épreuve mise à jour',
    })
  } catch (error) {
    console.error('Update epreuve error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'épreuve' },
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

    const existing = await db.epreuve.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    if (existing.statut === 'EN_COURS') {
      return NextResponse.json(
        { error: 'Impossible de supprimer une épreuve en cours' },
        { status: 400 }
      )
    }

    await db.epreuve.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'SOFT_DELETE_EPREUVE',
        entite: 'Epreuve',
        entiteId: id,
        details: `Épreuve déplacée vers la corbeille — ${existing.titre}`,
      },
    })

    return NextResponse.json({ message: 'Épreuve déplacée vers la corbeille' })
  } catch (error) {
    console.error('Delete epreuve error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'épreuve' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const DELETE = withAuth(_DELETE, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
