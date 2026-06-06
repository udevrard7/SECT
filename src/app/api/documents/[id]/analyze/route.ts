import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAIProvider } from '@/lib/ai-providers'

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const document = await db.document.findUnique({
      where: { id },
    })

    if (!document || document.deletedAt) {
      return NextResponse.json(
        { error: 'Document non trouvé' },
        { status: 404 }
      )
    }

    // Get extracted text from database (Vercel-compatible: no filesystem reads)
    const extractedText = document.contenuTexte

    if (!extractedText || extractedText.length < 50) {
      return NextResponse.json(
        { error: 'Le document ne contient pas assez de texte exploitable. Veuillez le téléverser à nouveau.' },
        { status: 400 }
      )
    }

    // Update status to processing
    await db.document.update({
      where: { id },
      data: { statutAnalyse: 'EN_COURS', erreurAnalyse: null },
    })

    // Analyze with AI (synchronously - await for Vercel serverless)
    console.log('[Document Analyze] Getting AI provider for document:', id)
    let aiProvider
    try {
      aiProvider = await getAIProvider()
    } catch (zaiError) {
      console.error('[Document Analyze] Failed to get AI provider:', zaiError)
      await db.document.update({
        where: { id },
        data: {
          statutAnalyse: 'ERREUR',
          erreurAnalyse: 'Service IA indisponible. Vérifiez la configuration du fournisseur IA dans l\'admin.',
        },
      })
      return NextResponse.json(
        { error: 'Service IA indisponible. Vérifiez la configuration du fournisseur IA.' },
        { status: 500 }
      )
    }

    const textForAnalysis = extractedText.slice(0, 10000)

    let completion
    try {
      completion = await aiProvider.chatCompletion({
        messages: [
          {
            role: 'system',
            content: `Tu es un assistant pédagogique expert en analyse de contenu académique pour l'enseignement supérieur. Tu analyses des documents de cours pour préparer la génération de questions d'évaluation. Tu dois répondre UNIQUEMENT en JSON valide, sans texte additionnel ni markdown.`
          },
          {
            role: 'user',
            content: `Analyse le document suivant et identifie les éléments clés pour la génération de questions d'évaluation.

Document:
"""
${textForAnalysis}
"""

Réponds en JSON avec la structure suivante:
{
  "themes": ["thème 1", "thème 2", ...],
  "conceptsCles": ["concept 1", "concept 2", ...],
  "chapitres": [
    { "titre": "Chapitre 1", "sujets": ["sujet A", "sujet B"] }
  ],
  "volumeEstime": {
    "QCU": nombre_estimé,
    "QCM": nombre_estimé,
    "QRC": nombre_estimé,
    "TRS": nombre_estimé
  },
  "niveauDifficulte": "FACILE|MOYEN|DIFFICILE|EXPERT",
  "resumeCourt": "Résumé en 2-3 phrases"
}`
          }
        ],
      })
    } catch (aiError) {
      console.error('[Document Analyze] AI call failed:', aiError)
      // Use heuristic fallback but mark that AI analysis failed
      const themes = extractThemesHeuristically(extractedText)
      const analysisResult = {
        themes,
        conceptsCles: themes.slice(0, 3),
        chapitres: [],
        volumeEstime: { QCU: 10, QCM: 5, QRC: 3, TRS: 1 },
        niveauDifficulte: 'MOYEN',
        resumeCourt: 'Analyse de secours (IA indisponible).',
      }

      await db.document.update({
        where: { id },
        data: {
          statutAnalyse: 'ANALYSE',
          themesDetectes: JSON.stringify(analysisResult.themes),
          conceptsCles: JSON.stringify(analysisResult.conceptsCles),
          volumeEstime: JSON.stringify(analysisResult.volumeEstime),
          resumeAnalyse: analysisResult.resumeCourt,
          erreurAnalyse: `Analyse IA échouée: ${aiError instanceof Error ? aiError.message : String(aiError)}`,
        },
      })

      return NextResponse.json({
        analysis: analysisResult,
        warning: 'L\'analyse IA a échoué. Une analyse de secours a été utilisée.',
      })
    }

    // Validate the response has the expected structure
    if (!completion || !completion.choices || !Array.isArray(completion.choices) || completion.choices.length === 0) {
      console.error('[Document Analyze] Invalid completion response:', JSON.stringify(completion).slice(0, 500))
      throw new Error('Le service IA a retourné une réponse invalide.')
    }

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse the JSON response
    let analysisResult
    let usedFallback = false
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in AI response')
      }
    } catch (parseError) {
      console.error('[Document Analyze] Failed to parse AI response:', parseError)
      // Fallback analysis
      usedFallback = true
      const themes = extractThemesHeuristically(extractedText)
      analysisResult = {
        themes,
        conceptsCles: themes.slice(0, 3),
        chapitres: [],
        volumeEstime: { QCU: 10, QCM: 5, QRC: 3, TRS: 1 },
        niveauDifficulte: 'MOYEN',
        resumeCourt: 'Document analysé avec succès (analyse de secours).',
      }
    }

    // Update document with analysis results
    await db.document.update({
      where: { id },
      data: {
        statutAnalyse: 'ANALYSE',
        themesDetectes: JSON.stringify(analysisResult.themes || []),
        conceptsCles: JSON.stringify(analysisResult.conceptsCles || []),
        volumeEstime: JSON.stringify(analysisResult.volumeEstime || {}),
        resumeAnalyse: analysisResult.resumeCourt || null,
        erreurAnalyse: usedFallback ? 'Analyse IA de secours (format de réponse invalide)' : null,
      },
    })

    const response: Record<string, unknown> = {
      analysis: analysisResult,
      message: 'Document analysé avec succès',
    }
    if (usedFallback) {
      response.warning = 'L\'analyse IA a retourné un format invalide. Une analyse de secours a été utilisée.'
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Document Analyze] Unhandled error:', error)

    // Mark as error
    try {
      const { id } = await params
      await db.document.update({
        where: { id },
        data: {
          statutAnalyse: 'ERREUR',
          erreurAnalyse: error instanceof Error ? error.message : 'Erreur lors de l\'analyse',
        },
      })
    } catch {
      // Ignore
    }

    return NextResponse.json(
      { error: 'Erreur lors de l\'analyse du document' },
      { status: 500 }
    )
  }
}

/**
 * Heuristic theme extraction as fallback
 */
function extractThemesHeuristically(text: string): string[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  const potentialTitles = lines
    .filter(l => l.trim().length < 100 && l.trim().length > 3)
    .filter(l => /^[A-ZÀ-ÿ0-9]/.test(l.trim()))
    .slice(0, 5)
    .map(l => l.trim().replace(/^[#*\-\d.]+\s*/, ''))

  return potentialTitles.length > 0 ? potentialTitles : ['Contenu principal']
}
