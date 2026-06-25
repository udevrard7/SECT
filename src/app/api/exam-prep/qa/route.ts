import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { getAIProvider } from '@/lib/ai-providers'

/**
 * POST /api/exam-prep/qa
 *
 * Q&A IA contextuel sur un document (RAG — Retrieval Augmented Generation).
 *
 * L'étudiant pose une question en langage naturel sur le contenu d'un
 * document de cours. L'IA répond en s'appuyant sur le texte du document
 * (et de ses chapitres) et en citant les passages pertinents.
 *
 * Flux :
 *  1. Récupère (ou crée) le ChatThread pour le couple (user, document)
 *  2. Persiste le message utilisateur
 *  3. Construit le contexte RAG : contenuTexte du document + titres de
 *     chapitres + éventuellement l'historique récent (8 derniers messages)
 *  4. Appelle l'IA (getAIProvider — failover transparent) avec un system
 *     prompt qui exige des citations [Chapitre X] et différencie
 *     'je ne comprends pas ce concept' (explication pédagogique) vs
 *     'où est-ce dans le cours ?' (recherche documentaire)
 *  5. Persiste la réponse de l'IA avec les citations (JSON)
 *  6. Renvoie { message, threadId }
 *
 * Body : { documentId: string, message: string }
 * Réponse : { threadId, message: { id, role, content, citations, createdAt } }
 */
export const maxDuration = 60

interface QaRequest {
  documentId: string
  message: string
}

async function _POST(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const body = (await request.json()) as QaRequest
    const { documentId, message } = body

    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json({ error: 'documentId est requis' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'message est requis' }, { status: 400 })
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: 'Message trop long (max 4000 caractères)' }, { status: 400 })
    }

    // ─── Vérifie l'accès au document (scoping étudiant) ───
    const document = await withRetry(() =>
      db.document.findFirst({
        where: {
          id: documentId,
          deletedAt: null,
          statutAnalyse: 'ANALYSE',
          // L'étudiant ne peut accéder qu'aux documents de ses UE (filière+niveau)
          uniteEnseignement: {
            filiereId: user.filiereId ?? '___none___',
            actif: true,
            OR: [
              { niveau: user.niveau ?? '___none___' },
              { niveaux: { contains: user.niveau ?? '___none___' } },
            ],
          },
        },
        select: {
          id: true,
          contenuTexte: true,
          themesDetectes: true,
          resumeAnalyse: true,
          uniteEnseignement: { select: { code: true, nom: true } },
          chapters: {
            select: { id: true, titre: true, ordre: true },
            orderBy: { ordre: 'asc' },
          },
        },
      })
    )

    if (!document || !document.contenuTexte) {
      return NextResponse.json(
        { error: "Document introuvable ou non accessible. Vérifiez qu'il est analysé et rattaché à votre filière." },
        { status: 404 }
      )
    }

    // ─── Récupère ou crée le ChatThread (1 par couple user/document) ───
    let thread = await withRetry(() =>
      db.chatThread.findUnique({
        where: { userId_documentId: { userId: user.id, documentId } },
        include: {
          messages: { orderBy: { createdAt: 'asc' }, take: 8 }, // historique récent
        },
      })
    )

    if (!thread) {
      thread = await withRetry(() =>
        db.chatThread.create({
          data: { userId: user.id, documentId },
          include: { messages: true },
        })
      )
    }

    // ─── Persiste le message utilisateur ───
    await withRetry(() =>
      db.chatMessage.create({
        data: {
          threadId: thread!.id,
          role: 'user',
          content: message.trim(),
        },
      })
    )

    // ─── Construction du contexte RAG ───
    // On tronque le contenu texte à 12k caractères (limite de contexte LLM)
    const docContent = document.contenuTexte.slice(0, 12000)
    const chapterList = document.chapters
      .map((c, i) => `  ${i + 1}. ${c.titre}`)
      .join('\n')

    const themes = document.themesDetectes
      ? safeJsonParse<string[]>(document.themesDetectes, [])
      : []

    const ueLabel = document.uniteEnseignement
      ? `${document.uniteEnseignement.code} — ${document.uniteEnseignement.nom}`
      : 'UE non spécifiée'

    // ─── Construction des messages pour l'IA ───
    const systemPrompt = `Tu es un tuteur pédagogique expert pour l'enseignement supérieur. Tu aides un étudiant à préparer un examen à partir d'un document de cours.

RÈGLES STRICTES :
1. Réponds UNIQUEMENT à partir du contenu du document fourni. Si la question sort du cadre du document, dis-le honnêètement.
2. Cite les passages pertinents avec la mention [Chapitre X] quand tu t'appuies sur un chapitre listé.
3. Différencie deux types de questions :
   - "Je ne comprends pas ce concept" → donne une EXPLICATION pédagogique (analogie, exemple, reformulation).
   - "Où est-ce dans le cours ?" → indique le CHAPITRE et recopie le passage concerné.
4. Sois concis (max 250 mots), clair, et termine par une question de vérification de compréhension.
5. Réponds en français.

CONTEXTE DU DOCUMENT :
- UE : ${ueLabel}
- Thèmes détectés : ${themes.join(', ') || 'non spécifiés'}
- Résumé : ${document.resumeAnalyse ?? 'non disponible'}
- Chapitres :
${chapterList || '  (aucun chapitre structuré)'}

CONTENU DU DOCUMENT (source de vérité) :
"""
${docContent}
"""`

    // Historique récent (format chat) — aide l'IA à contextualiser
    const historyMessages = thread.messages.slice(-8).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const aiProvider = await getAIProvider()

    const completion = await aiProvider.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: message.trim() },
      ],
    })

    const responseText = completion.choices[0]?.message?.content?.trim() || ''
    if (!responseText) {
      return NextResponse.json(
        { error: "L'IA n'a pas retourné de réponse. Réessayez." },
        { status: 502 }
      )
    }

    // ─── Extraction des citations [Chapitre X] depuis la réponse ───
    const citations = extractCitations(responseText, document.chapters)

    // ─── Persiste la réponse de l'IA ───
    const assistantMessage = await withRetry(() =>
      db.chatMessage.create({
        data: {
          threadId: thread!.id,
          role: 'assistant',
          content: responseText,
          citations: citations.length > 0 ? JSON.stringify(citations) : null,
        },
        select: { id: true, role: true, content: true, citations: true, createdAt: true },
      })
    )

    // Met à jour le thread (updatedAt)
    await withRetry(() =>
      db.chatThread.update({ where: { id: thread!.id }, data: { updatedAt: new Date() } })
    )

    return NextResponse.json({
      threadId: thread.id,
      message: {
        ...assistantMessage,
        citations,
      },
    })
  } catch (error) {
    console.error('exam-prep/qa POST error:', error)
    return NextResponse.json(
      { error: "Erreur lors du traitement de la question. Réessayez." },
      { status: 500 }
    )
  }
}

/**
 * GET /api/exam-prep/qa?documentId=...
 *
 * Récupère l'historique du ChatThread pour un couple (user, document).
 * Sert à recharger la conversation à la réouverture de la page.
 */
async function _GET(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    if (!documentId) {
      return NextResponse.json({ error: 'documentId est requis' }, { status: 400 })
    }

    const thread = await withRetry(() =>
      db.chatThread.findUnique({
        where: { userId_documentId: { userId: user.id, documentId } },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, role: true, content: true, citations: true, createdAt: true },
          },
        },
      })
    )

    if (!thread) {
      return NextResponse.json({ thread: null, messages: [] })
    }

    // Parse les citations JSON
    const messages = thread.messages.map((m) => ({
      ...m,
      citations: m.citations ? safeJsonParse(m.citations, []) : [],
    }))

    return NextResponse.json({ threadId: thread.id, messages })
  } catch (error) {
    console.error('exam-prep/qa GET error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération de la conversation' }, { status: 500 })
  }
}

// ─── Helpers ───

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Extrait les citations [Chapitre X] / [Chapitre X : titre] depuis la
 * réponse de l'IA et les mappe vers les chapterId réels du document.
 */
function extractCitations(
  text: string,
  chapters: Array<{ id: string; titre: string; ordre: number }>
): Array<{ chapterId: string; chapterTitle: string; chapterNumber: number }> {
  const citations: Array<{ chapterId: string; chapterTitle: string; chapterNumber: number }> = []
  // Matche [Chapitre 1], [Chapitre 2 : Titre], [Chapitre 3 - Titre]
  const regex = /\[Chapitre\s+(\d+)(?:\s*[:\-]\s*([^\]]+))?\]/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10)
    const chapter = chapters.find((c) => c.ordre === num - 1 || c.ordre === num)
    if (chapter && !citations.find((c) => c.chapterId === chapter.id)) {
      citations.push({
        chapterId: chapter.id,
        chapterTitle: chapter.titre,
        chapterNumber: num,
      })
    }
  }

  return citations
}

export const POST = withAuth(_POST, ['ETUDIANT'])
export const GET = withAuth(_GET, ['ETUDIANT'])
