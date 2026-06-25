import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { getAIProvider } from '@/lib/ai-providers'
import { requireStudentScope, studentUeFilter } from '@/lib/exam-prep/scope'

/**
 * POST /api/exam-prep/practice
 *
 * Génère des questions d'entraînement depuis un document (et optionnel-
 * lement un chapitre) via l'IA, puis les persiste dans la table Question
 * (validee: false, auteurId = étudiant) pour permettre le suivi des
 * PracticeAttempt et du SRS.
 *
 * Les questions sont renvoyées SANS reponseCorrecte ni explication —
 * l'étudiant les découvre après soumission (POST /practice/[id]/submit).
 *
 * Body : { documentId, chapterId?, count?, type?, difficulte? }
 */
export const maxDuration = 60

type QuestionType = 'QCU' | 'QCM' | 'QRC' | 'TRS' | 'MIXTE'
type Difficulte = 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT' | 'MIXTE'

interface PracticeRequest {
  documentId: string
  chapterId?: string
  count?: number
  type?: QuestionType
  difficulte?: Difficulte
}

async function _POST(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const body = (await request.json()) as PracticeRequest
    const { documentId, chapterId } = body
    const count = Math.min(Math.max(body.count ?? 5, 1), 10)
    const type = body.type ?? 'MIXTE'
    const difficulte = body.difficulte ?? 'MIXTE'

    if (!documentId) {
      return NextResponse.json({ error: 'documentId est requis' }, { status: 400 })
    }

    // ─── Vérifie l'accès au document (scoping étudiant) ───
    const scope = requireStudentScope(user)
    if (scope.response) return scope.response
    const document = await withRetry(() =>
      db.document.findFirst({
        where: {
          id: documentId,
          deletedAt: null,
          statutAnalyse: 'ANALYSE',
          uniteEnseignement: studentUeFilter(scope.filiereId, scope.niveau),
        },
        select: {
          id: true,
          contenuTexte: true,
          chapters: { select: { id: true, titre: true, ordre: true, sujets: true } },
        },
      })
    )

    if (!document || !document.contenuTexte) {
      return NextResponse.json(
        { error: 'Document introuvable ou non accessible.' },
        { status: 404 }
      )
    }

    // ─── Contexte RAG : chapitre ciblé ou document entier ───
    let contextText = document.contenuTexte.slice(0, 8000)
    let chapterLabel = 'document complet'
    if (chapterId) {
      const chapter = document.chapters.find((c) => c.id === chapterId)
      if (chapter) {
        chapterLabel = `chapitre « ${chapter.titre} »`
        // On n'a pas le contenu découpé par chapitre ; on garde le doc entier
        // mais on précise le focus dans le prompt.
      } else {
        return NextResponse.json({ error: 'Chapitre introuvable.' }, { status: 404 })
      }
    }

    // ─── Prompt IA ───
    const typeInstruction = type === 'MIXTE'
      ? 'un mélange équilibré de QCU, QCM, QRC et TRS'
      : `uniquement des questions de type ${type}`
    const diffInstruction = difficulte === 'MIXTE'
      ? 'variez les niveaux de difficulté (FACILE, MOYEN, DIFFICILE)'
      : `niveau de difficulté ${difficulte}`

    const completion = await getAIProvider().then((p) =>
      p.chatCompletion({
        messages: [
          {
            role: 'system',
            content: `Tu es un générateur de questions d'entraînement pédagogiques pour l'enseignement supérieur. Réponds UNIQUEMENT en JSON valide, sans markdown.`
          },
          {
            role: 'user',
            content: `Génère ${count} questions d'entraînement sur le ${chapterLabel} du document suivant. Demande ${typeInstruction}, ${diffInstruction}.

Document:
"""
${contextText}
"""

Réponds en JSON avec la structure:
{
  "questions": [
    {
      "enonce": "énoncé clair de la question",
      "type": "QCU" | "QCM" | "QRC" | "TRS",
      "propositions": [{"texte": "...", "correct": true}, ...],  // pour QCU (1 correct) et QCM (2+ corrects)
      "reponseCorrecte": "réponse attendue",  // pour QRC/TRS
      "explication": "feedback pédagogique 1-2 phrases expliquant POURQUOI c'est correct",
      "difficulte": "FACILE" | "MOYEN" | "DIFFICILE" | "EXPERT",
      "themes": ["thème 1", ...]
    }
  ]
}`
          }
        ],
      })
    )

    const responseText = completion.choices[0]?.message?.content || ''
    let parsed: { questions?: Array<Record<string, unknown>> }
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { questions: [] }
    } catch {
      return NextResponse.json(
        { error: "L'IA a retourné un format invalide. Réessayez." },
        { status: 502 }
      )
    }

    const aiQuestions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (aiQuestions.length === 0) {
      return NextResponse.json(
        { error: "Aucune question générée. Réessayez avec d'autres paramètres." },
        { status: 502 }
      )
    }

    // ─── Persiste les questions + renvoie (sans réponses/explications) ───
    const validTypes = ['QCU', 'QCM', 'QRC', 'TRS', 'REFLEXION', 'CODE']
    const validDiff = ['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT']

    const created = await Promise.all(
      aiQuestions.slice(0, count).map(async (q) => {
        const qType = validTypes.includes(q.type as string) ? (q.type as string) : 'QCU'
        const qDiff = validDiff.includes(q.difficulte as string) ? (q.difficulte as string) : 'MOYEN'
        const propositions = Array.isArray(q.propositions) ? JSON.stringify(q.propositions) : null

        const created = await withRetry(() =>
          db.question.create({
            data: {
              documentId,
              auteurId: user.id,
              type: qType as 'QCU' | 'QCM' | 'QRC' | 'TRS' | 'REFLEXION' | 'CODE',
              enonce: String(q.enonce ?? '').slice(0, 2000),
              propositions,
              reponseCorrecte: q.reponseCorrecte ? String(q.reponseCorrecte).slice(0, 2000) : null,
              explication: q.explication ? String(q.explication).slice(0, 1000) : null,
              difficulte: qDiff as 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT',
              themes: Array.isArray(q.themes) ? JSON.stringify(q.themes) : null,
              validee: false,
              langue: 'fr',
            },
            select: { id: true, type: true, enonce: true, propositions: true, difficulte: true, themes: true },
          })
        )

        return {
          ...created,
          propositions: created.propositions
            ? safeJsonParse<Array<{ texte: string; correct: boolean }>>(created.propositions, []).map(p => ({ texte: p.texte })) // sans le flag correct
            : null,
          themes: created.themes ? safeJsonParse<string[]>(created.themes, []) : [],
          // explication et reponseCorrecte NON renvoyés
        }
      })
    )

    return NextResponse.json({ questions: created })
  } catch (error) {
    console.error('[exam-prep/practice] POST error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la génération des questions." },
      { status: 500 }
    )
  }
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const POST = withAuth(_POST, ['ETUDIANT'])
