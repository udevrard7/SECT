import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAIProvider } from '@/lib/ai-providers'

// Extend Vercel function timeout for AI generation
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { documentId, type, difficulte } = body

    // Get the original question to understand context
    const originalQuestion = await db.question.findUnique({
      where: { id },
      include: {
        document: {
          select: { id: true, nomFichier: true, cheminStockage: true, typeMime: true, contenuTexte: true },
        },
      },
    })

    if (!originalQuestion) {
      return NextResponse.json(
        { error: 'Question non trouvée' },
        { status: 404 }
      )
    }

    // Get document text from database (Vercel-compatible: no filesystem reads)
    let contextText = ''
    if (originalQuestion.document?.contenuTexte) {
      contextText = originalQuestion.document.contenuTexte.slice(0, 8000)
    }

    // Delete the old question
    await db.question.delete({ where: { id } })

    // Generate a new question of the same type
    const aiProvider = await getAIProvider()

    const questionType = type || originalQuestion.type
    const questionDiff = difficulte || originalQuestion.difficulte

    const typeDescriptions: Record<string, string> = {
      QCU: 'une question à Choix Unique (QCU) avec 3 à 5 propositions et une seule bonne réponse',
      QCM: 'une question à Choix Multiple (QCM) avec 3 à 5 propositions et plusieurs bonnes réponses possibles',
      QRC: 'une question à Réponse Courte (QRC) avec une réponse modèle en 1 à 5 lignes',
      TRS: 'un Test de Réflexion Structuré (TRS) composé de plusieurs parties (mise en contexte, analyse, synthèse) avec grille de correction',
    }

    const prompt = `Tu es un expert en pédagogie universitaire. Génère ${typeDescriptions[questionType]} de niveau ${questionDiff}.

${contextText ? `Contexte du document source:\n"""\n${contextText}\n"""` : 'Question originale à remplacer:\n"""' + originalQuestion.enonce + '\n"""'}

Réponds UNIQUEMENT en JSON valide:
{
  "questions": [
    {
      "type": "${questionType}",
      "enonce": "Énoncé de la question",
      "propositions": ["Proposition A", "Proposition B", "Proposition C", "Proposition D"],
      "reponseCorrecte": "A" ou ["A", "C"] ou "Réponse attendue",
      "explication": "Explication de la réponse correcte",
      "difficulte": "${questionDiff}",
      "themes": ["thème1", "thème2"],
      "scoreQualite": 85
    }
  ]
}

Génère exactement 1 question. Pour QCU: reponseCorrecte est la lettre. Pour QCM: reponseCorrecte est un tableau. Pour QRC: reponseCorrecte est le texte modèle. Pour TRS: propositions est null, reponseCorrecte contient la grille.`

    const completion = await aiProvider.chatCompletion({
      messages: [
        {
          role: 'system',
          content: 'Tu es un générateur de questions d\'évaluation académique de haute qualité. Tu réponds UNIQUEMENT en JSON valide.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
    })

    const responseText = completion.choices[0]?.message?.content || ''

    let generatedData
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        generatedData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found')
      }
    } catch {
      return NextResponse.json(
        { error: 'Erreur lors de la régénération. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    const q = generatedData.questions?.[0]
    if (!q) {
      return NextResponse.json(
        { error: 'Aucune question générée' },
        { status: 500 }
      )
    }

    // Save the new question
    const newQuestion = await db.question.create({
      data: {
        documentId: originalQuestion.documentId,
        auteurId: originalQuestion.auteurId,
        type: q.type || questionType,
        enonce: q.enonce || '',
        propositions: q.propositions ? JSON.stringify(q.propositions) : null,
        reponseCorrecte: q.reponseCorrecte ? JSON.stringify(q.reponseCorrecte) : null,
        explication: q.explication || null,
        difficulte: q.difficulte || questionDiff,
        themes: q.themes ? JSON.stringify(q.themes) : null,
        scoreQualite: q.scoreQualite || null,
        validee: false,
        langue: originalQuestion.langue,
      },
    })

    return NextResponse.json({
      question: {
        ...newQuestion,
        propositions: newQuestion.propositions ? JSON.parse(newQuestion.propositions) : null,
        reponseCorrecte: newQuestion.reponseCorrecte ? JSON.parse(newQuestion.reponseCorrecte) : null,
        themes: newQuestion.themes ? JSON.parse(newQuestion.themes) : null,
      },
      message: 'Question régénérée avec succès',
    })
  } catch (error) {
    console.error('Regenerate question error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la régénération de la question' },
      { status: 500 }
    )
  }
}
