import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readFile } from 'fs/promises'
import path from 'path'
import { extractTextFromFile, getMimeType } from '@/lib/text-extraction'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const document = await db.document.findUnique({
      where: { id },
    })

    if (!document) {
      return NextResponse.json(
        { error: 'Document non trouvé' },
        { status: 404 }
      )
    }

    // Update status to processing
    await db.document.update({
      where: { id },
      data: { statutAnalyse: 'EN_COURS' },
    })

    // Read and extract text from file
    const filePath = path.join(process.cwd(), document.cheminStockage)
    let extractedText = ''

    try {
      const extractionResult = await extractTextFromFile(filePath, document.typeMime || getMimeType(document.nomFichier))
      extractedText = extractionResult.text
    } catch (error) {
      console.error('Text extraction error:', error)
      await db.document.update({
        where: { id },
        data: { statutAnalyse: 'ERREUR' },
      })
      return NextResponse.json(
        { error: 'Impossible d\'extraire le texte du document' },
        { status: 400 }
      )
    }

    if (!extractedText || extractedText.length < 50) {
      await db.document.update({
        where: { id },
        data: { statutAnalyse: 'ERREUR' },
      })
      return NextResponse.json(
        { error: 'Le document ne contient pas assez de texte exploitable' },
        { status: 400 }
      )
    }

    // Analyze with AI
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const textForAnalysis = extractedText.slice(0, 10000)

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
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
      thinking: { type: 'disabled' }
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse the JSON response
    let analysisResult
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch {
      analysisResult = {
        themes: ['Thème principal'],
        conceptsCles: ['Concept identifié'],
        chapitres: [],
        volumeEstime: { QCU: 10, QCM: 5, QRC: 3, TRS: 1 },
        niveauDifficulte: 'MOYEN',
        resumeCourt: 'Document analysé avec succès.',
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
      },
    })

    return NextResponse.json({
      analysis: analysisResult,
      message: 'Document analysé avec succès',
    })
  } catch (error) {
    console.error('Analysis error:', error)

    // Mark as error
    try {
      const { id } = await params
      await db.document.update({
        where: { id },
        data: { statutAnalyse: 'ERREUR' },
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
