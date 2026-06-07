import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAIProvider } from '@/lib/ai-providers'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

export const maxDuration = 60

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

async function _POST(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  const startTime = Date.now()
  try {
    const body: GenerateRequest = await request.json()
    const { documentId, config } = body
    // Use authenticated user ID from session instead of body to prevent IDOR
    const userId = context.user.id

    console.log('[Questions Generate] Request received:', { documentId, userId, totalQuestions: config.qcu + config.qcm + config.qrc + config.trs })

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document requis' },
        { status: 400 }
      )
    }

    // Verify document exists and belongs to user
    const document = await db.document.findUnique({
      where: { id: documentId },
    })

    if (!document || document.deletedAt) {
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

    const extractedText = document.contenuTexte

    if (!extractedText || extractedText.length < 100) {
      return NextResponse.json(
        { error: 'Le document ne contient pas assez de texte pour générer des questions. Veuillez le téléverser à nouveau.' },
        { status: 400 }
      )
    }

    const textForAI = extractedText.slice(0, 8000)

    const totalQuestions = config.qcu + config.qcm + config.qrc + config.trs

    if (totalQuestions === 0) {
      return NextResponse.json(
        { error: 'Veuillez spécifier au moins un type de question à générer' },
        { status: 400 }
      )
    }

    console.log('[Questions Generate] Getting AI provider...')
    let aiProvider
    try {
      aiProvider = await getAIProvider()
      console.log('[Questions Generate] AI provider obtained:', aiProvider.name, `(${aiProvider.providerType})`)
    } catch (zaiError) {
      console.error('[Questions Generate] Failed to get AI provider:', zaiError)
      return NextResponse.json(
        { error: 'Erreur de connexion au service IA. Vérifiez la configuration du fournisseur IA dans l\'admin.' },
        { status: 500 }
      )
    }

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

    const requestedTypes: string[] = []
    if (config.qcu > 0) requestedTypes.push(`- ${config.qcu} question(s) à Choix Unique (QCU): 3 à 5 propositions, une seule bonne réponse`)
    if (config.qcm > 0) requestedTypes.push(`- ${config.qcm} question(s) à Choix Multiple (QCM): 3 à 5 propositions, plusieurs bonnes réponses possibles`)
    if (config.qrc > 0) requestedTypes.push(`- ${config.qrc} question(s) à Réponse Courte (QRC): réponse libre attendue en 1 à 5 lignes`)
    if (config.trs > 0) requestedTypes.push(`- ${config.trs} Test(s) de Réflexion Structuré (TRS): devoir composé de plusieurs parties (mise en contexte, analyse, synthèse) avec grille de correction`)

    const prompt = `Tu es un expert en pédagogie universitaire. Génère des questions d'évaluation à partir du document suivant. Les questions doivent être pertinentes, précises et adaptées au niveau ${config.difficulte}.

Document source:
"""
${textForAI}
"""

Génère EXACTEMENT les types et quantités de questions suivants:
${requestedTypes.join('\n')}

CRITIQUE: Tu dois UNIQUEMENT générer les types de questions demandés ci-dessus. Ne génère AUCUN autre type de question. Si seul le type QCM est demandé, génère EXCLUSIVEMENT des questions QCM.
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

    let completion
    try {
      console.log('[Questions Generate] Calling AI API...')
      completion = await aiProvider.chatCompletion({
        messages: [
          {
            role: 'system',
            content: 'Tu es un générateur de questions d\'évaluation académique. Tu produis des questions de haute qualité, pertinentes et bien formulées. Tu réponds UNIQUEMENT en JSON valide.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      })
      console.log('[Questions Generate] AI API responded in', Date.now() - startTime, 'ms')
    } catch (aiError) {
      const aiErrorMsg = aiError instanceof Error ? aiError.message : String(aiError)
      console.error('[Questions Generate] AI API call failed:', aiErrorMsg)

      if (aiErrorMsg.includes('身份验证失败') || aiErrorMsg.includes('Authentication') || aiErrorMsg.includes('auth')) {
        return NextResponse.json(
          { error: 'Erreur d\'authentification du service IA. Veuillez contacter l\'administrateur pour vérifier la configuration ZAI (ZAI_BASE_URL et clés API).' },
          { status: 500 }
        )
      }
      if (aiErrorMsg.includes('ECONNREFUSED') || aiErrorMsg.includes('ENOTFOUND') || aiErrorMsg.includes('fetch failed')) {
        return NextResponse.json(
          { error: 'Le service IA est actuellement indisponible. Veuillez réessayer dans quelques minutes.' },
          { status: 503 }
        )
      }
      if (aiErrorMsg.includes('timeout') || aiErrorMsg.includes('ETIMEDOUT')) {
        return NextResponse.json(
          { error: 'La requête au service IA a expiré. Essayez avec moins de questions ou un document plus court.' },
          { status: 504 }
        )
      }

      return NextResponse.json(
        { error: `Erreur du service IA: ${aiErrorMsg}` },
        { status: 500 }
      )
    }

    if (!completion || !completion.choices || !Array.isArray(completion.choices) || completion.choices.length === 0) {
      console.error('[Questions Generate] Invalid completion response:', JSON.stringify(completion).slice(0, 500))
      return NextResponse.json(
        { error: 'Le service IA a retourné une réponse invalide. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    const responseText = completion.choices[0]?.message?.content || ''
    console.log('[Questions Generate] AI response length:', responseText.length)
    console.log('[Questions Generate] AI response preview:', responseText.slice(0, 300))

    if (!responseText || responseText.length < 10) {
      console.error('[Questions Generate] Empty or too short AI response')
      return NextResponse.json(
        { error: 'Le service IA n\'a pas retourné de réponse. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    let generatedQuestions
    try {
      const codeBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
      if (codeBlockMatch) {
        generatedQuestions = JSON.parse(codeBlockMatch[1].trim())
        console.log('[Questions Generate] Parsed from code block')
      } else {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          generatedQuestions = JSON.parse(jsonMatch[0])
          console.log('[Questions Generate] Parsed from raw text')
        } else {
          throw new Error('No JSON found in response')
        }
      }
    } catch (parseError) {
      console.error('[Questions Generate] Failed to parse AI response:', parseError)
      console.error('[Questions Generate] Raw response (first 1000 chars):', responseText.slice(0, 1000))
      return NextResponse.json(
        { error: 'Erreur lors du parsing de la réponse IA. L\'IA n\'a pas retourné un format valide. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    if (!generatedQuestions.questions || !Array.isArray(generatedQuestions.questions)) {
      console.error('[Questions Generate] Invalid structure:', JSON.stringify(generatedQuestions).slice(0, 500))
      return NextResponse.json(
        { error: 'La structure de la réponse IA est invalide. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    const savedQuestions: Record<string, unknown>[] = []
    const validTypes = ['QCU', 'QCM', 'QRC', 'TRS']
    const validDifficultes = ['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT']

    const allowedTypes = new Set<string>()
    if (config.qcu > 0) allowedTypes.add('QCU')
    if (config.qcm > 0) allowedTypes.add('QCM')
    if (config.qrc > 0) allowedTypes.add('QRC')
    if (config.trs > 0) allowedTypes.add('TRS')

    for (const q of generatedQuestions.questions || []) {
      try {
        const rawType = q.type
        if (!allowedTypes.has(rawType)) {
          console.warn(`[Questions Generate] Filtering out question of unauthorized type "${rawType}" (teacher only requested: ${Array.from(allowedTypes).join(', ')})`)
          continue
        }
        const qType = rawType
        const qDifficulte = validDifficultes.includes(q.difficulte) ? q.difficulte : (config.difficulte || 'MOYEN')
        const qEnonce = String(q.enonce || '').trim()

        if (!qEnonce) {
          console.warn('[Questions Generate] Skipping question with empty enonce')
          continue
        }

        let propositionsStr: string | null = null
        if (qType === 'QCU' || qType === 'QCM') {
          if (Array.isArray(q.propositions) && q.propositions.length > 0) {
            propositionsStr = JSON.stringify(q.propositions.map((p: any) => String(p)))
          }
        }

        let reponseStr: string | null = null
        if (q.reponseCorrecte !== null && q.reponseCorrecte !== undefined) {
          if (Array.isArray(q.reponseCorrecte)) {
            reponseStr = JSON.stringify(q.reponseCorrecte)
          } else if (typeof q.reponseCorrecte === 'string') {
            reponseStr = JSON.stringify(q.reponseCorrecte)
          } else {
            reponseStr = JSON.stringify(q.reponseCorrecte)
          }
        }

        const question = await db.question.create({
          data: {
            documentId: documentId,
            auteurId: userId,
            type: qType as 'QCU' | 'QCM' | 'QRC' | 'TRS',
            enonce: qEnonce,
            propositions: propositionsStr,
            reponseCorrecte: reponseStr,
            explication: q.explication ? String(q.explication) : null,
            difficulte: qDifficulte as 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT',
            themes: q.themes ? JSON.stringify(q.themes) : null,
            tags: null,
            scoreQualite: typeof q.scoreQualite === 'number' ? q.scoreQualite : null,
            validee: false,
            langue: config.langue || 'fr',
          },
        })
        savedQuestions.push(question)
      } catch (dbError) {
        console.error('[Questions Generate] Failed to save question:', dbError, 'Question data:', JSON.stringify(q).slice(0, 200))
      }
    }

    try {
      await db.auditLog.create({
        data: {
          userId: userId || 'system',
          userEmail: 'system',
          action: 'GENERATE_QUESTIONS_IA',
          entite: 'Question',
          entiteId: documentId,
          details: `${savedQuestions.length} questions générées depuis document ${documentId}`,
        },
      })
    } catch (auditError) {
      console.warn('[Questions Generate] Failed to create audit log:', auditError)
    }

    console.log('[Questions Generate] Success! Generated', savedQuestions.length, 'questions in', Date.now() - startTime, 'ms')

    return NextResponse.json({
      questions: savedQuestions,
      totalGenerated: savedQuestions.length,
      message: `${savedQuestions.length} question(s) générée(s) avec succès`,
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error('[Questions Generate] Unhandled error after', elapsed, 'ms:', error)

    const errorMsg = error instanceof Error ? error.message : String(error)

    if (errorMsg.includes('Prisma') || errorMsg.includes('database')) {
      return NextResponse.json(
        { error: 'Erreur de base de données. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: `Erreur lors de la génération des questions: ${errorMsg}` },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_POST, ['ENSEIGNANT', 'ADMIN'])
