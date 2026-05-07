import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface GenerateRequest {
  documentId: string
  userId: string
  config: {
    qcu: number
    qcm: number
    qrc: number
    trs: number
    difficulte: string
    themes?: string[]
    langue?: string
    tonPedagogique?: string
    themesExclus?: string[]
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json()
    const { documentId, userId, config } = body

    if (!documentId || !userId) {
      return NextResponse.json(
        { error: 'Document et utilisateur requis' },
        { status: 400 }
      )
    }

    // Verify document exists and belongs to user
    const document = await db.document.findUnique({
      where: { id: documentId },
    })

    if (!document) {
      return NextResponse.json(
        { error: 'Document non trouvé' },
        { status: 404 }
      )
    }

    if (document.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Accès non autorisé' },
        { status: 403 }
      )
    }

    // Get extracted text from database (Vercel-compatible: no filesystem reads)
    const extractedText = document.contenuTexte

    if (!extractedText || extractedText.length < 100) {
      return NextResponse.json(
        { error: 'Le document ne contient pas assez de texte pour générer des questions. Veuillez le téléverser à nouveau.' },
        { status: 400 }
      )
    }

    // Prepare text for AI (truncate to ~12000 chars)
    const textForAI = extractedText.slice(0, 12000)

    // Build generation prompt
    const totalQuestions = config.qcu + config.qcm + config.qrc + config.trs

    if (totalQuestions === 0) {
      return NextResponse.json(
        { error: 'Veuillez spécifier au moins un type de question à générer' },
        { status: 400 }
      )
    }

    // Generate questions using z-ai-web-dev-sdk
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const themesInstruction = config.themes && config.themes.length > 0
      ? `\nThèmes à couvrir obligatoirement: ${config.themes.join(', ')}`
      : ''

    const themesExclusInstruction = config.themesExclus && config.themesExclus.length > 0
      ? `\nThèmes à exclure: ${config.themesExclus.join(', ')}`
      : ''

    const langueInstruction = config.langue ? `\nLangue de génération: ${config.langue === 'en' ? 'anglais' : 'français'}` : '\nLangue de génération: français'

    const tonInstruction = config.tonPedagogique
      ? `\nTon pédagogique: ${config.tonPedagogique}`
      : ''

    const prompt = `Tu es un expert en pédagogie universitaire. Génère des questions d'évaluation à partir du document suivant. Les questions doivent être pertinentes, précises et adaptées au niveau ${config.difficulte}.

Document source:
"""
${textForAI}
"""

Génère exactement:
- ${config.qcu} question(s) à Choix Unique (QCU): 3 à 5 propositions, une seule bonne réponse
- ${config.qcm} question(s) à Choix Multiple (QCM): 3 à 5 propositions, plusieurs bonnes réponses possibles
- ${config.qrc} question(s) à Réponse Courte (QRC): réponse libre attendue en 1 à 5 lignes
- ${config.trs} Test(s) de Réflexion Structuré (TRS): devoir composé de plusieurs parties (mise en contexte, analyse, synthèse) avec grille de correction
${themesInstruction}${themesExclusInstruction}${langueInstruction}${tonInstruction}

Réponds UNIQUEMENT en JSON valide avec la structure suivante:
{
  "questions": [
    {
      "type": "QCU|QCM|QRC|TRS",
      "enonce": "Énoncé de la question",
      "propositions": ["Proposition A", "Proposition B", "Proposition C", "Proposition D"],
      "reponseCorrecte": "A" ou ["A", "C"] ou "Réponse attendue",
      "explication": "Explication de la réponse correcte",
      "difficulte": "FACILE|MOYEN|DIFFICILE|EXPERT",
      "themes": ["thème1", "thème2"],
      "scoreQualite": 85
    }
  ]
}

Pour les QCU: reponseCorrecte est la lettre de la bonne réponse (ex: "B")
Pour les QCM: reponseCorrecte est un tableau des lettres des bonnes réponses (ex: ["A", "C"])
Pour les QRC: reponseCorrecte est la réponse modèle attendue en texte
Pour les TRS: enonce contient la consigne complète, propositions est null, reponseCorrecte contient la grille de correction détaillée

Important: 
- Chaque question doit tester une compétence ou connaissance distincte
- Les propositions des QCU/QCM doivent être plausibles
- Le scoreQualite est une estimation de 0 à 100 de la pertinence pédagogique
- Les thèmes doivent correspondre au contenu du document`

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'Tu es un générateur de questions d\'évaluation académique. Tu produis des questions de haute qualité, pertinentes et bien formulées. Tu réponds UNIQUEMENT en JSON valide.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      thinking: { type: 'disabled' }
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse the JSON response
    let generatedQuestions
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        generatedQuestions = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.error('Failed to parse AI generation:', parseError)
      console.error('Raw response:', responseText.slice(0, 500))
      return NextResponse.json(
        { error: 'Erreur lors du parsing de la réponse IA. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    // Save generated questions to database
    const savedQuestions = []
    for (const q of generatedQuestions.questions || []) {
      try {
        const question = await db.question.create({
          data: {
            documentId: documentId,
            auteurId: userId,
            type: q.type as 'QCU' | 'QCM' | 'QRC' | 'TRS',
            enonce: q.enonce || '',
            propositions: q.propositions ? JSON.stringify(q.propositions) : null,
            reponseCorrecte: q.reponseCorrecte ? JSON.stringify(q.reponseCorrecte) : null,
            explication: q.explication || null,
            difficulte: q.difficulte || config.difficulte || 'MOYEN',
            themes: q.themes ? JSON.stringify(q.themes) : null,
            tags: null,
            scoreQualite: q.scoreQualite || null,
            validee: false,
            langue: config.langue || 'fr',
          },
        })
        savedQuestions.push(question)
      } catch (dbError) {
        console.error('Failed to save question:', dbError)
      }
    }

    return NextResponse.json({
      questions: savedQuestions,
      totalGenerated: savedQuestions.length,
      message: `${savedQuestions.length} question(s) générée(s) avec succès`,
    })
  } catch (error) {
    console.error('Question generation error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la génération des questions' },
      { status: 500 }
    )
  }
}
