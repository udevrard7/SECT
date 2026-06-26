import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractTextFromBuffer, getMimeType, isSupportedFileType, isWithinSizeLimit } from '@/lib/text-extraction'
import { getAIProvider } from '@/lib/ai-providers'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { persistChapters } from '@/lib/exam-prep/chapters'

async function _POST(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    // Use authenticated user ID from session to prevent IDOR
    const userId = context.user.id
    const uniteEnseignementId = formData.get('uniteEnseignementId') as string | null

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

    // Get MIME type
    const mimeType = getMimeType(file.name)

    // Read file as buffer for text extraction (Vercel-compatible: no filesystem writes)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Extract text from buffer directly
    let extractedText = ''
    let wordCount = 0
    let extractionError: string | null = null
    try {
      const extractionResult = await extractTextFromBuffer(buffer, mimeType)
      extractedText = extractionResult.text
      wordCount = extractionResult.wordCount
    } catch (err: any) {
      console.error('Text extraction failed:', err)
      extractionError = err instanceof Error ? err.message : 'Échec de l\'extraction du texte'
    }

    // Use a storage path reference (no actual file stored on disk)
    const storagePath = `documents/${userId}/${Date.now()}_${file.name}`

    // Determine initial status based on text extraction
    // If text was extracted, set EN_COURS (will be processed by AI worker on sandbox)
    const initialStatus = extractionError
      ? 'ERREUR'
      : (!extractedText || wordCount === 0)
        ? 'ERREUR'
        : 'EN_COURS'

    // Save document to database WITH extracted text
    let document = await db.document.create({
      data: {
        ownerId: userId,
        nomFichier: file.name,
        cheminStockage: storagePath,
        tailleFichier: file.size,
        typeMime: mimeType,
        statutAnalyse: initialStatus,
        contenuTexte: extractedText || null,
        erreurAnalyse: extractionError || (!extractedText || wordCount === 0
          ? 'Aucun texte exploitable extrait du document. Essayez un format DOCX ou TXT.'
          : null),
        uniteEnseignementId: uniteEnseignementId || null,
      },
    })

    // Try to run AI analysis immediately (works on sandbox, fails gracefully on Vercel)
    let analysisResult = null
    if (extractedText && wordCount > 0) {
      try {
        analysisResult = await analyzeDocument(document.id, extractedText)
      } catch (analysisError: any) {
        console.error('Analysis failed after upload:', analysisError?.message || analysisError)
        // On Vercel, the AI API is unreachable (private IPs).
        // Keep EN_COURS status so the sandbox AI worker can process it later.
        // Only mark as ERREUR if it's not a network/connectivity issue.
        const isNetworkError = analysisError?.message?.includes('fetch failed') ||
          analysisError?.message?.includes('ECONNREFUSED') ||
          analysisError?.message?.includes('timeout') ||
          analysisError?.message?.includes('UND_ERR_CONNECT')

        if (!isNetworkError) {
          // Non-network error: mark as ERREUR so user can retry
          await db.document.update({
            where: { id: document.id },
            data: {
              statutAnalyse: 'ERREUR',
              erreurAnalyse: analysisError instanceof Error ? analysisError.message : 'Erreur lors de l\'analyse IA',
            },
          })
        } else {
          // Network error: keep EN_COURS - sandbox AI worker will process it
          console.log(`Document ${document.id} kept in EN_COURS status - sandbox AI worker will process it`)
          await db.document.update({
            where: { id: document.id },
            data: {
              erreurAnalyse: 'Analyse IA en cours de traitement... Le résultat sera disponible dans quelques instants.',
            },
          })
        }
      }

      // Re-fetch document to get updated status
      document = await db.document.findUnique({
        where: { id: document.id },
      }) as typeof document
    }

    return NextResponse.json({
      document: {
        id: document.id,
        nomFichier: document.nomFichier,
        tailleFichier: document.tailleFichier,
        typeMime: document.typeMime,
        statutAnalyse: document.statutAnalyse,
        themesDetectes: document.themesDetectes,
        conceptsCles: document.conceptsCles,
        volumeEstime: document.volumeEstime,
        dateUpload: document.dateUpload,
        erreurAnalyse: document.erreurAnalyse,
        uniteEnseignementId: document.uniteEnseignementId,
        wordCount,
      },
      analysis: analysisResult,
      message: extractedText && wordCount > 0
        ? (analysisResult
          ? 'Document uploadé et analysé avec succès'
          : 'Document uploadé avec succès. L\'analyse IA est en cours de traitement...')
        : extractionError
          ? `Document uploadé mais extraction du texte impossible : ${extractionError}`
          : 'Document uploadé mais aucun texte exploitable trouvé. Essayez un format DOCX ou TXT.',
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    // Return detailed error for debugging
    const errorDetails = error instanceof Error
      ? `${error.message}${error.cause ? ` | Cause: ${String(error.cause)}` : ''}`
      : String(error)
    return NextResponse.json(
      {
        error: 'Erreur lors de l\'upload du document',
        details: errorDetails,
      },
      { status: 500 }
    )
  }
}

async function _GET(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    const { searchParams } = new URL(request.url)
    // Use authenticated user ID from session to prevent IDOR
    const userId = context.user.id

    const documents = await db.document.findMany({
      where: { ownerId: userId, deletedAt: null },
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
        contenuTexte: true,
        erreurAnalyse: true,
        uniteEnseignementId: true,
        uniteEnseignement: {
          select: { id: true, code: true, nom: true, niveau: true, niveaux: true, filiere: { select: { id: true, nom: true } } },
        },
      },
    })

    // Fix documents stuck in EN_ATTENTE with no text
    const stuckNoText = documents.filter(d => d.statutAnalyse === 'EN_ATTENTE' && (!d.contenuTexte || d.contenuTexte.length < 50))
    if (stuckNoText.length > 0) {
      markStuckAsError(stuckNoText).catch(console.error)
    }

    // Remove contenuTexte from response (not needed by frontend, saves bandwidth)
    const cleanDocuments = documents.map(({ contenuTexte: _ct, ...doc }) => doc)

    return NextResponse.json({ documents: cleanDocuments })
  } catch (error) {
    console.error('List documents error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des documents' },
      { status: 500 }
    )
  }
}

/**
 * Mark documents stuck in EN_ATTENTE with no text as ERREUR
 */
async function markStuckAsError(docs: Array<{ id: string; contenuTexte: string | null }>) {
  for (const doc of docs) {
    await db.document.update({
      where: { id: doc.id },
      data: {
        statutAnalyse: 'ERREUR',
        erreurAnalyse: 'Aucun texte exploitable extrait du document. Veuillez le téléverser à nouveau au format DOCX ou TXT.',
      },
    }).catch(console.error)
  }
}

/**
 * Document analysis using the active AI provider
 * On sandbox: works directly
 * On Vercel: will fail with network error, document stays EN_COURS for retry
 */
async function analyzeDocument(documentId: string, extractedText: string) {
  const aiProvider = await getAIProvider()

  // Truncate text if too long (keep first ~10000 chars for analysis)
  const textForAnalysis = extractedText.slice(0, 10000)

  const completion = await aiProvider.chatCompletion({
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
  "resumeCourt": "Résumé en 2-3 phrases du contenu du document"
}`
      }
    ],
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
      throw new Error('No JSON found in AI response')
    }
  } catch (parseError) {
    console.error('Failed to parse AI analysis:', parseError, 'Response:', responseText.slice(0, 200))
    // Fallback analysis based on extracted text
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
    where: { id: documentId },
    data: {
      statutAnalyse: 'ANALYSE',
      themesDetectes: JSON.stringify(analysisResult.themes || []),
      conceptsCles: JSON.stringify(analysisResult.conceptsCles || []),
      volumeEstime: JSON.stringify(analysisResult.volumeEstime || {}),
      resumeAnalyse: analysisResult.resumeCourt || null,
    },
  })

  // Persiste les chapitres pour le module Préparation aux examens
  // (auparavant jetés — l'IA les produisait mais ils n'étaient pas stockés).
  try {
    const nbChapters = await persistChapters(documentId, analysisResult.chapitres)
    console.log(`Document ${documentId}: ${nbChapters} chapitre(s) persisté(s)`)
  } catch (chapError) {
    // Non bloquant : les chapitres sont un bonus pour l'exam-prep,
    // l'analyse principale (thèmes/concepts) a déjà réussi.
    console.error(`Document ${documentId}: échec persistance chapitres:`, chapError)
  }

  console.log(`Document ${documentId} analyzed successfully`)
  return analysisResult
}

/**
 * Heuristic theme extraction as fallback when AI analysis fails
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

async function _DELETE(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    const userId = context.user.id
    const body = await request.json()
    const { ids } = body as { ids?: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Liste d\'identifiants vide ou manquante' }, { status: 400 })
    }

    // Soft-delete: set deletedAt to now for all matching documents owned by the user
    const result = await db.document.updateMany({
      where: {
        id: { in: ids },
        ownerId: userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    })

    return NextResponse.json({
      message: `${result.count} document(s) déplacé(s) vers la corbeille`,
      count: result.count,
    })
  } catch (error) {
    console.error('Bulk delete documents error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression des documents' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_POST, ['ENSEIGNANT', 'ADMIN'])
export const GET = withAuth(_GET, ['ENSEIGNANT', 'ADMIN'])
export const DELETE = withAuth(_DELETE, ['ENSEIGNANT', 'ADMIN'])
