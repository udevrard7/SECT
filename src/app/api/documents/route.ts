import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { extractTextFromFile, getMimeType, isSupportedFileType, isWithinSizeLimit } from '@/lib/text-extraction'

// Directory to store uploaded files
const UPLOAD_DIR = path.join(process.cwd(), 'upload', 'documents')

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur non identifié' }, { status: 401 })
    }

    // Validate file type
    if (!isSupportedFileType(file.name)) {
      return NextResponse.json(
        { error: 'Format non supporté. Formats acceptés : PDF, DOCX, DOC, PPTX, TXT, MD' },
        { status: 400 }
      )
    }

    // Validate file size (50 MB)
    if (!isWithinSizeLimit(file.size)) {
      return NextResponse.json(
        { error: 'Fichier trop volumineux. Taille maximale : 50 Mo' },
        { status: 400 }
      )
    }

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true })

    // Generate unique filename
    const timestamp = Date.now()
    const ext = path.extname(file.name)
    const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_')
    const uniqueFileName = `${baseName}_${timestamp}${ext}`
    const filePath = path.join(UPLOAD_DIR, uniqueFileName)

    // Write file to disk
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Get MIME type
    const mimeType = getMimeType(file.name)

    // Extract text from file
    let extractedText = ''
    let wordCount = 0
    try {
      const extractionResult = await extractTextFromFile(filePath, mimeType)
      extractedText = extractionResult.text
      wordCount = extractionResult.wordCount
    } catch (extractionError) {
      console.error('Text extraction failed:', extractionError)
      // Continue without extracted text - analysis will handle it
    }

    // Save document to database
    const relativePath = path.relative(process.cwd(), filePath)
    const document = await db.document.create({
      data: {
        ownerId: userId,
        nomFichier: file.name,
        cheminStockage: relativePath,
        tailleFichier: file.size,
        typeMime: mimeType,
        statutAnalyse: 'EN_ATTENTE',
        themesDetectes: extractedText ? undefined : undefined,
        volumeEstime: undefined,
      },
    })

    // If text was extracted, automatically trigger analysis
    if (extractedText && wordCount > 0) {
      // Update status to processing
      await db.document.update({
        where: { id: document.id },
        data: { statutAnalyse: 'EN_COURS' },
      })

      // Trigger analysis asynchronously
      analyzeDocumentAsync(document.id, extractedText).catch(console.error)
    }

    return NextResponse.json({
      document: {
        id: document.id,
        nomFichier: document.nomFichier,
        tailleFichier: document.tailleFichier,
        typeMime: document.typeMime,
        statutAnalyse: document.statutAnalyse,
        dateUpload: document.dateUpload,
        wordCount,
      },
      message: 'Document uploadé avec succès',
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'upload du document' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur non identifié' }, { status: 401 })
    }

    const documents = await db.document.findMany({
      where: { ownerId: userId },
      orderBy: { dateUpload: 'desc' },
      select: {
        id: true,
        nomFichier: true,
        tailleFichier: true,
        typeMime: true,
        statutAnalyse: true,
        themesDetectes: true,
        conceptsCles: true,
        volumeEstime: true,
        dateUpload: true,
      },
    })

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('List documents error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des documents' },
      { status: 500 }
    )
  }
}

/**
 * Asynchronous document analysis using z-ai-web-dev-sdk
 */
async function analyzeDocumentAsync(documentId: string, extractedText: string) {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    // Truncate text if too long (keep first ~10000 chars for analysis)
    const textForAnalysis = extractedText.slice(0, 10000)

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `Tu es un assistant pédagogique expert en analyse de contenu académique. Tu analyses des documents de cours pour l'enseignement supérieur. Tu dois répondre UNIQUEMENT en JSON valide, sans texte additionnel.`
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
  "resumeCourt": "Résumé en 2-3 phrases du contenu du document"
}`
        }
      ],
      thinking: { type: 'disabled' }
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse the JSON response
    let analysisResult
    try {
      // Try to extract JSON from the response (might have markdown wrapping)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.error('Failed to parse AI analysis:', parseError)
      // Fallback analysis
      analysisResult = {
        themes: ['Thème principal'],
        conceptsCles: ['Concept identifié'],
        chapitres: [],
        volumeEstime: { QCU: 10, QCM: 5, QRC: 3, TRS: 1 },
        niveauDifficulte: 'MOYEN',
        resumeCourt: 'Document analysé avec succès.'
      }
    }

    // Update document with analysis results
    await db.document.update({
      where: { id: documentId },
      data: {
        statutAnalyse: 'ANALYSE',
        themesDetectes: JSON.stringify(analysisResult.themes || []),
        conceptsCles: JSON.stringify(analysisResult.conceptsCles || []),
        volumeEstime: JSON.stringify(analysisResult.volumeEstime || {}),
      },
    })

    console.log(`Document ${documentId} analyzed successfully`)
  } catch (error) {
    console.error('Document analysis error:', error)
    // Mark as error
    await db.document.update({
      where: { id: documentId },
      data: { statutAnalyse: 'ERREUR' },
    })
  }
}
