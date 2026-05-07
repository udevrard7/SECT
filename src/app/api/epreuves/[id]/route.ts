import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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
              },
            },
          },
          orderBy: { ordre: 'asc' },
        },
        sessions: {
          include: {
            etudiant: { select: { id: true, name: true, email: true } },
            reponses: {
              include: {
                question: { select: { id: true, type: true, enonce: true } },
              },
            },
            resultat: true,
          },
        },
      },
    })

    if (!epreuve) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    // Parse JSON fields
    const parsed = {
      ...epreuve,
      groupesCibles: epreuve.groupesCibles ? JSON.parse(epreuve.groupesCibles) : null,
      questions: epreuve.questions.map((eq) => ({
        ...eq,
        question: {
          ...eq.question,
          propositions: eq.question.propositions ? JSON.parse(eq.question.propositions) : null,
          themes: eq.question.themes ? JSON.parse(eq.question.themes) : null,
        },
      })),
      sessions: epreuve.sessions.map((s) => ({
        ...s,
        logEvents: s.logEvents ? JSON.parse(s.logEvents) : null,
        reponses: s.reponses.map((r) => ({
          ...r,
        })),
      })),
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, ...data } = body

    // Check epreuve exists
    const existing = await db.epreuve.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    // Action: change status
    if (action === 'publier') {
      const epreuve = await db.epreuve.update({
        where: { id },
        data: { statut: 'PLANIFIEE' },
      })
      return NextResponse.json({ epreuve, message: 'Épreuve publiée' })
    }

    if (action === 'lancer') {
      const epreuve = await db.epreuve.update({
        where: { id },
        data: { statut: 'EN_COURS' },
      })
      return NextResponse.json({ epreuve, message: 'Épreuve lancée' })
    }

    if (action === 'terminer') {
      const epreuve = await db.epreuve.update({
        where: { id },
        data: { statut: 'TERMINEE' },
      })
      return NextResponse.json({ epreuve, message: 'Épreuve terminée' })
    }

    if (action === 'cloturer') {
      const epreuve = await db.epreuve.update({
        where: { id },
        data: { statut: 'CLOTUREE' },
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    await db.epreuve.delete({ where: { id } })

    return NextResponse.json({ message: 'Épreuve supprimée' })
  } catch (error) {
    console.error('Delete epreuve error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'épreuve' },
      { status: 500 }
    )
  }
}
