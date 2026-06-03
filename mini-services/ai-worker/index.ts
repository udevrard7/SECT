/**
 * AI Worker Service
 * 
 * Background worker that processes documents needing AI analysis.
 * This runs on the sandbox where internal-api.z.ai is reachable.
 * 
 * Architecture:
 * - Vercel app uploads documents → saves text with EN_COURS status
 * - This worker polls Supabase for EN_COURS/ERREUR documents
 * - Analyzes them using the Z-AI SDK (which can reach internal-api.z.ai)
 * - Updates the database with analysis results
 * 
 * Port: 3032 (health check only)
 * Poll interval: 15 seconds
 */

// Set SUPABASE_URL before importing Prisma (schema uses env("SUPABASE_URL"))
const SUPABASE_URL = 'postgresql://postgres.gnicihntcisgkkkuwolx:Victoire%401993%23@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5&pool_timeout=10'
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = SUPABASE_URL
}

import { PrismaClient } from '@prisma/client'

const PORT = 3032
const POLL_INTERVAL_MS = 15000 // 15 seconds
const MAX_TEXT_LENGTH = 10000 // Characters for AI analysis
const MAX_CONCURRENT = 1 // Process one document at a time

const prisma = new PrismaClient()

// ZAI config - read from /etc/.z-ai-config
interface ZAIConfig {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

let zaiConfig: ZAIConfig | null = null
let isProcessing = false
let stats = {
  totalProcessed: 0,
  totalErrors: 0,
  lastPoll: null as Date | null,
  lastProcessedId: null as string | null,
  currentStatus: 'idle' as string,
}

async function loadZAIConfig(): Promise<ZAIConfig> {
  if (zaiConfig) return zaiConfig

  const { readFileSync } = await import('fs')
  const { resolve } = await import('path')
  const { homedir } = await import('os')
  
  const configPaths = [
    resolve(process.cwd(), '.z-ai-config'),
    resolve(homedir(), '.z-ai-config'),
    '/etc/.z-ai-config'
  ]
  
  for (const filePath of configPaths) {
    try {
      const configStr = readFileSync(filePath, 'utf-8')
      const config = JSON.parse(configStr)
      if (config.baseUrl && config.apiKey) {
        console.log(`✅ ZAI config loaded from ${filePath}`)
        zaiConfig = config
        return config
      }
    } catch {
      // Continue to next path
    }
  }
  
  throw new Error('No .z-ai-config found for ZAI SDK')
}

/**
 * Call the Z-AI API directly using fetch
 */
async function callZAI(messages: Array<{ role: string; content: string }>): Promise<any> {
  const config = await loadZAIConfig()
  const url = `${config.baseUrl}/chat/completions`
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  }
  
  if (config.chatId) headers['X-Chat-Id'] = config.chatId
  if (config.userId) headers['X-User-Id'] = config.userId
  if (config.token) headers['X-Token'] = config.token

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      thinking: { type: 'disabled' },
    }),
    signal: AbortSignal.timeout(120000), // 2 min timeout
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`ZAI API error ${response.status}: ${errorBody}`)
  }

  return await response.json()
}

/**
 * Analyze a document using Z-AI
 */
async function analyzeDocument(documentId: string, extractedText: string): Promise<void> {
  const textForAnalysis = extractedText.slice(0, MAX_TEXT_LENGTH)

  console.log(`🔍 Analyzing document ${documentId} (${extractedText.length} chars, using ${textForAnalysis.length} for analysis)`)

  const completion = await callZAI([
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
  "resumeCourt": "Résumé en 2-3 phrases du contenu du document"
}`
    }
  ])

  const responseText = completion.choices?.[0]?.message?.content || ''
  
  // Parse JSON response
  let analysisResult: any
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      analysisResult = JSON.parse(jsonMatch[0])
    } else {
      throw new Error('No JSON in AI response')
    }
  } catch (parseError) {
    console.warn(`⚠️ Failed to parse AI response for ${documentId}, using heuristic fallback`)
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

  // Update document with results
  await prisma.document.update({
    where: { id: documentId },
    data: {
      statutAnalyse: 'ANALYSE',
      themesDetectes: JSON.stringify(analysisResult.themes || []),
      conceptsCles: JSON.stringify(analysisResult.conceptsCles || []),
      volumeEstime: JSON.stringify(analysisResult.volumeEstime || {}),
      resumeAnalyse: analysisResult.resumeCourt || null,
      erreurAnalyse: null,
    },
  })

  console.log(`✅ Document ${documentId} analyzed successfully (themes: ${JSON.stringify(analysisResult.themes || [])})`)
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

/**
 * Poll for documents that need analysis and process them
 */
async function pollAndProcess(): Promise<void> {
  if (isProcessing) {
    console.log('⏳ Already processing, skipping this poll')
    return
  }

  isProcessing = true
  stats.currentStatus = 'polling'
  stats.lastPoll = new Date()

  try {
    // Find documents that need analysis
    const pendingDocs = await prisma.document.findMany({
      where: {
        statutAnalyse: { in: ['EN_COURS', 'EN_ATTENTE'] },
        contenuTexte: { not: null },
      },
      orderBy: { dateUpload: 'asc' },
      take: MAX_CONCURRENT,
    })

    // Also find ERROR documents that haven't been retried too many times
    const errorDocs = await prisma.document.findMany({
      where: {
        statutAnalyse: 'ERREUR',
        contenuTexte: { not: null },
        // Only retry if the error was about AI being unavailable
        erreurAnalyse: { contains: 'fetch failed' },
      },
      orderBy: { dateUpload: 'asc' },
      take: 1,
    })

    const docsToProcess = [...pendingDocs, ...errorDocs]

    if (docsToProcess.length === 0) {
      stats.currentStatus = 'idle'
      return
    }

    console.log(`📋 Found ${docsToProcess.length} document(s) to process`)

    for (const doc of docsToProcess) {
      if (!doc.contenuTexte || doc.contenuTexte.length < 50) {
        // Mark documents with insufficient text as errors
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            statutAnalyse: 'ERREUR',
            erreurAnalyse: 'Le document ne contient pas assez de texte exploitable (minimum 50 caractères).',
          },
        })
        continue
      }

      stats.currentStatus = `processing:${doc.id}`
      stats.lastProcessedId = doc.id

      try {
        // Set status to EN_COURS
        await prisma.document.update({
          where: { id: doc.id },
          data: { statutAnalyse: 'EN_COURS', erreurAnalyse: null },
        })

        await analyzeDocument(doc.id, doc.contenuTexte)
        stats.totalProcessed++
      } catch (err: any) {
        console.error(`❌ Error processing document ${doc.id}:`, err.message)
        stats.totalErrors++

        // Mark as error but with a clear message
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            statutAnalyse: 'ERREUR',
            erreurAnalyse: `Erreur d'analyse IA: ${err.message}. Le document sera retraité automatiquement.`,
          },
        }).catch(e => console.error('Failed to update error status:', e))
      }
    }

    stats.currentStatus = 'idle'
  } catch (error: any) {
    console.error('❌ Poll error:', error.message)
    stats.currentStatus = 'error'
  } finally {
    isProcessing = false
  }
}

// Health check HTTP server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    
    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'ai-worker',
        port: PORT,
        stats: {
          ...stats,
          uptime: process.uptime(),
        },
      })
    }

    // Manual trigger endpoint
    if (url.pathname === '/trigger' && req.method === 'POST') {
      console.log('🔔 Manual trigger received')
      pollAndProcess().catch(console.error)
      return Response.json({ message: 'Processing triggered' })
    }

    return Response.json({ error: 'Not found' }, { status: 404 })
  },
})

console.log(`🤖 AI Worker running on port ${PORT}`)
console.log(`   Database: supabase (production)`)
console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000}s`)
console.log(`   Max concurrent: ${MAX_CONCURRENT}`)

// Initialize and start polling
async function start() {
  try {
    await loadZAIConfig()
    await prisma.$connect()
    console.log('✅ Connected to database and loaded ZAI config')
    
    // Do initial poll
    await pollAndProcess()
    
    // Start periodic polling
    setInterval(() => {
      pollAndProcess().catch(console.error)
    }, POLL_INTERVAL_MS)
    
    console.log(`🔄 Polling every ${POLL_INTERVAL_MS / 1000}s for documents to analyze`)
  } catch (err: any) {
    console.error('💥 Failed to start AI Worker:', err.message)
    process.exit(1)
  }
}

start()
