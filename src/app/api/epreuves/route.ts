import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enseignantId, titre, description, duree, dateDebut, dateFin, melangeQuestions, melangePropositions, blocageRetour, groupesCibles, questions } = body

    if (!enseignantId || !titre || !duree || !dateDebut || !dateFin) {
      return NextResponse.json(
        { error: 'Enseignant, titre, durée, dates de début et de fin requis' },
        { status: 400 }
      )
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json(
        { error: 'L\'épreuve doit contenir au moins une question' },
        { status: 400 }
      )
    }

    // Create the epreuve
    const epreuve = await db.epreuve.create({
      data: {
        enseignantId,
        titre,
        description: description || null,
        duree,
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        melangeQuestions: melangeQuestions ?? true,
        melangePropositions: melangePropositions ?? true,
        blocageRetour: blocageRetour ?? false,
        groupesCibles: groupesCibles ? JSON.stringify(groupesCibles) : null,
        statut: 'BROUILLON',
        questions: {
          create: questions.map((q: { questionId: string; bareme: number; ordre: number }, index: number) => ({
            questionId: q.questionId,
            bareme: q.bareme || 1.0,
            ordre: q.ordre ?? index,
          })),
        },
      },
      include: {
        questions: {
          include: {
            question: true,
          },
        },
      },
    })

    return NextResponse.json({
      epreuve: {
        ...epreuve,
        groupesCibles: epreuve.groupesCibles ? JSON.parse(epreuve.groupesCibles) : null,
      },
      message: 'Épreuve créée avec succès',
    })
  } catch (error) {
    console.error('Create epreuve error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'épreuve' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const etudiantId = searchParams.get('etudiantId')
    const statut = searchParams.get('statut')

    if (enseignantId) {
      // Get teacher's exams
      const where: Record<string, unknown> = { enseignantId }
      if (statut) where.statut = statut

      const epreuves = await db.epreuve.findMany({
        where,
        orderBy: { dateDebut: 'desc' },
        include: {
          enseignant: { select: { id: true, name: true } },
          questions: { include: { question: true } },
          sessions: {
            select: { id: true, statut: true, score: true, etudiantId: true },
          },
        },
      })

      const parsedEpreuves = epreuves.map((e) => ({
        ...e,
        groupesCibles: e.groupesCibles ? JSON.parse(e.groupesCibles) : null,
      }))

      return NextResponse.json({ epreuves: parsedEpreuves })
    }

    if (etudiantId) {
      // Get exams available to student
      const now = new Date()

      // Get all active/planned exams
      const epreuves = await db.epreuve.findMany({
        where: {
          statut: { in: ['PLANIFIEE', 'EN_COURS'] },
          dateFin: { gte: now },
        },
        orderBy: { dateDebut: 'asc' },
        include: {
          enseignant: { select: { id: true, name: true } },
          questions: { select: { id: true, bareme: true } },
          sessions: {
            where: { etudiantId },
            select: { id: true, statut: true, score: true, dateDebut: true, dateFin: true },
          },
        },
      })

      // Also get completed exams with student's results
      const completedEpreuves = await db.epreuve.findMany({
        where: {
          statut: { in: ['TERMINEE', 'CLOTUREE'] },
          sessions: { some: { etudiantId } },
        },
        orderBy: { dateDebut: 'desc' },
        include: {
          enseignant: { select: { id: true, name: true } },
          questions: { select: { id: true, bareme: true } },
          sessions: {
            where: { etudiantId },
            select: { id: true, statut: true, score: true, dateDebut: true, dateFin: true, resultat: true },
          },
        },
      })

      const allEpreuves = [...epreuves, ...completedEpreuves].map((e) => ({
        ...e,
        groupesCibles: e.groupesCibles ? JSON.parse(e.groupesCibles) : null,
        questionCount: e.questions.length,
        totalPoints: e.questions.reduce((sum, q) => sum + q.bareme, 0),
      }))

      return NextResponse.json({ epreuves: allEpreuves })
    }

    return NextResponse.json({ error: 'enseignantId ou etudiantId requis' }, { status: 400 })
  } catch (error) {
    console.error('List epreuves error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des épreuves' },
      { status: 500 }
    )
  }
}
