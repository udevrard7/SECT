import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/auth-middleware'

/**
 * GET /api/epreuves/banque
 * Lists all epreuves in the "Banque d'Épreuves" for a teacher.
 * Returns epreuves with their `contenu` JSONB data.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['ENSEIGNANT'])
    if (isAuthError(authResult)) return authResult

    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const search = searchParams.get('search')
    const generationMode = searchParams.get('generationMode')
    const filiereId = searchParams.get('filiereId')

    if (!enseignantId) {
      return NextResponse.json(
        { error: 'enseignantId requis' },
        { status: 400 }
      )
    }

    // Verify auth user matches
    if (authResult.id !== enseignantId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      )
    }

    // Build where clause
    const where: Record<string, unknown> = { enseignantId, deletedAt: null }

    // Filter by search on titre
    if (search) {
      where.titre = { contains: search, mode: 'insensitive' }
    }

    // Filter by generation mode
    if (generationMode && ['MANUELLE', 'IA_ASSISTEE'].includes(generationMode)) {
      where.generationMode = generationMode
    }

    // Filter by filiere
    if (filiereId) {
      where.filiereId = filiereId
    }

    const epreuves = await db.epreuve.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sourceDocuments: {
          include: {
            document: {
              select: {
                id: true,
                nomFichier: true,
                typeMime: true,
              },
            },
          },
        },
        filiere: {
          select: { id: true, nom: true, code: true },
        },
        uniteEnseignement: {
          select: { id: true, nom: true, code: true },
        },
        questions: {
          select: { id: true, bareme: true, question: { select: { id: true, type: true } } },
        },
        _count: {
          select: { sessions: true },
        },
      },
    })

    // Format response with computed fields
    const formattedEpreuves = epreuves.map((epreuve) => {
      // Extract info from contenu if available (new format)
      const contenu = epreuve.contenu as {
        questions?: Array<{ type: string; bareme: number; difficulte: string }>
        consignes?: string
        baremeTotal?: number
      } | null

      const contenuQuestions = contenu?.questions ?? []
      const contenuQuestionCount = contenuQuestions.length
      const contenuBaremeTotal = contenu?.baremeTotal ?? contenuQuestions.reduce((sum, q) => sum + (q.bareme || 0), 0)

      // Old format question count from EpreuveQuestion relation
      const oldQuestionCount = epreuve.questions.length
      const oldBaremeTotal = epreuve.questions.reduce((sum, eq) => sum + eq.bareme, 0)

      const questionCount = contenuQuestionCount > 0 ? contenuQuestionCount : oldQuestionCount
      const baremeTotal = contenuBaremeTotal > 0 ? contenuBaremeTotal : oldBaremeTotal

      // Question type distribution
      const typeDistribution: Record<string, number> = {}
      if (contenuQuestions.length > 0) {
        for (const q of contenuQuestions) {
          typeDistribution[q.type] = (typeDistribution[q.type] || 0) + 1
        }
      } else {
        for (const eq of epreuve.questions) {
          const type = eq.question.type
          typeDistribution[type] = (typeDistribution[type] || 0) + 1
        }
      }

      return {
        id: epreuve.id,
        titre: epreuve.titre,
        description: epreuve.description,
        duree: epreuve.duree,
        statut: epreuve.statut,
        generationMode: epreuve.generationMode,
        isTemplate: epreuve.isTemplate,
        contenu: epreuve.contenu,
        groupesCibles: epreuve.groupesCibles ? JSON.parse(epreuve.groupesCibles as string) : null,
        createdAt: epreuve.createdAt,
        updatedAt: epreuve.updatedAt,
        questionCount,
        baremeTotal,
        typeDistribution,
        sourceDocuments: epreuve.sourceDocuments.map((sd) => ({
          id: sd.document.id,
          nomFichier: sd.document.nomFichier,
        })),
        filiere: epreuve.filiere,
        uniteEnseignement: epreuve.uniteEnseignement,
        sessionCount: epreuve._count.sessions,
        hasContenuFormat: contenuQuestions.length > 0,
      }
    })

    return NextResponse.json({
      epreuves: formattedEpreuves,
      total: formattedEpreuves.length,
    })
  } catch (error) {
    console.error('Banque epreuves list error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la banque d\'épreuves' },
      { status: 500 }
    )
  }
}
