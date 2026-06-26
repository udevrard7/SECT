import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { requireStudentScope, studentUeFilter } from '@/lib/exam-prep/scope'

/**
 * GET /api/exam-prep/documents/[id]/read
 *
 * Retourne le contenu textuel intégral d'un document pour la lecture
 * directe (visionneuse intégrée dans le navigateur). L'étudiant n'a pas
 * besoin de télécharger le fichier — il lit directement dans SECT.
 *
 * Scoping : l'étudiant doit avoir accès au document via ses UE
 * (filière + niveau). Vérification via findFirst avec filtre relationnel.
 *
 * Réponse : { document: { id, nomFichier, contenuTexte, typeMime, themesDetectes, resumeAnalyse } }
 */
async function _GET(
  _request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id } = await context.params

    const scope = requireStudentScope(user)
    if (scope.response) return scope.response

    const document = await withRetry(() =>
      db.document.findFirst({
        where: {
          id,
          deletedAt: null,
          uniteEnseignement: studentUeFilter(scope.filiereId, scope.niveau),
        },
        select: {
          id: true,
          nomFichier: true,
          contenuTexte: true,
          typeMime: true,
          themesDetectes: true,
          resumeAnalyse: true,
          dateUpload: true,
          owner: { select: { name: true } },
          uniteEnseignement: { select: { code: true, nom: true } },
        },
      })
    )

    if (!document) {
      return NextResponse.json({ error: 'Document introuvable ou non accessible' }, { status: 404 })
    }

    return NextResponse.json({
      document: {
        ...document,
        themesDetectes: document.themesDetectes ? safeJsonParse(document.themesDetectes, []) : [],
      },
    })
  } catch (error) {
    console.error('[exam-prep/documents/read] error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération du document' }, { status: 500 })
  }
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const GET = withAuth(_GET, ['ETUDIANT'])
