import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { sendPushToUser } from '@/lib/push'

/**
 * POST /api/exam-prep/help/[id]/messages
 *
 * Ajoute un message à un thread d'aide existant.
 * - L'enseignant du thread peut répondre (role: 'enseignant', statut → REPONDU).
 * - L'étudiant propriétaire du thread peut ajouter un follow-up
 *   (role: 'etudiant', statut → OUVERT).
 * - Notifie l'autre partie (in-app + push).
 *
 * Body : { content: string }
 */
async function _POST(
  request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id: threadId } = await context.params
    const body = (await request.json()) as { content?: string }
    const content = body.content?.trim()

    if (!content) {
      return NextResponse.json({ error: 'content est requis' }, { status: 400 })
    }

    // ─── Charge le thread + vérifie l'accès ───
    const thread = await withRetry(() =>
      db.helpThread.findUnique({
        where: { id: threadId },
        select: {
          id: true, statut: true, etudiantId: true, enseignantId: true,
          documentId: true, sujet: true,
          document: { select: { nomFichier: true } },
        },
      })
    )

    if (!thread) {
      return NextResponse.json({ error: 'Thread introuvable' }, { status: 404 })
    }

    // Vérifie l'accès : étudiant propriétaire OU enseignant assigné
    const isEtudiant = user.role === 'ETUDIANT' && thread.etudiantId === user.id
    const isEnseignant = user.role === 'ENSEIGNANT' && thread.enseignantId === user.id
    if (!isEtudiant && !isEnseignant) {
      return NextResponse.json({ error: 'Accès non autorisé à ce thread' }, { status: 403 })
    }

    const role = isEnseignant ? 'enseignant' : 'etudiant'
    const newStatut = isEnseignant ? 'REPONDU' : 'OUVERT'

    // ─── Crée le message + update statut thread (transaction) ───
    const [message] = await withRetry(() =>
      db.$transaction([
        db.helpMessage.create({
          data: {
            threadId,
            auteurId: user.id,
            role,
            content: content.slice(0, 4000),
          },
        }),
        db.helpThread.update({
          where: { id: threadId },
          data: { statut: newStatut, updatedAt: new Date() },
        }),
      ])
    )

    // ─── Notifie l'autre partie ───
    const destinataireId = isEnseignant ? thread.etudiantId : thread.enseignantId
    if (destinataireId) {
      try {
        await withRetry(() =>
          db.notificationAdmin.create({
            data: {
              type: 'HELP_REPLY',
              titre: isEnseignant ? 'Réponse de votre enseignant' : 'Suivi de question',
              message: `${user.name} : ${content.slice(0, 80)}`,
              destinataireId,
              destinataireRole: isEnseignant ? 'ETUDIANT' : 'ENSEIGNANT',
              actionUrl: `/exam-prep-help?threadId=${threadId}`,
              actionLabel: 'Voir',
              priorite: 'NORMALE',
              categorie: 'PEDAGOGIE',
              icone: 'MessageCircle',
            },
          })
        )

        sendPushToUser(destinataireId, {
          title: isEnseignant ? '💬 Réponse du professeur' : '💬 Suivi de question',
          body: `${user.name} : ${content.slice(0, 100)}`,
          url: `/exam-prep-help?threadId=${threadId}`,
          tag: `help-${threadId}`,
        }).catch(() => {})
      } catch (notifError) {
        console.error('[exam-prep/help/messages] notif failed:', notifError)
      }
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('[exam-prep/help/messages] POST error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'envoi du message' }, { status: 500 })
  }
}

/**
 * GET /api/exam-prep/help/[id]/messages
 * Liste tous les messages d'un thread (pour recharger le fil de discussion).
 */
async function _GET(
  _request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id: threadId } = await context.params

    const thread = await withRetry(() =>
      db.helpThread.findUnique({
        where: { id: threadId },
        select: {
          id: true, statut: true, etudiantId: true, enseignantId: true, sujet: true,
          passageContext: true,
          document: {
            select: {
              id: true, nomFichier: true,
              // Inclut l'établissement (via UE → filière) pour la vérification RESPONSABLE
              uniteEnseignement: { select: { filiere: { select: { etablissementId: true } } } },
            },
          },
          chapter: { select: { id: true, titre: true } },
          messages: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, auteurId: true, role: true, content: true, createdAt: true },
          },
        },
      })
    )

    if (!thread) {
      return NextResponse.json({ error: 'Thread introuvable' }, { status: 404 })
    }

    // Vérifie l'accès :
    // - ETUDIANT : propriétaire du thread
    // - ENSEIGNANT : assigné au thread
    // - RESPONSABLE : même établissement que le document du thread
    // - ADMIN : accès global
    const isEtudiant = user.role === 'ETUDIANT' && thread.etudiantId === user.id
    const isEnseignant = user.role === 'ENSEIGNANT' && thread.enseignantId === user.id
    const isAdmin = user.role === 'ADMIN'
    const threadEtablissementId = thread.document?.uniteEnseignement?.filiere?.etablissementId ?? null
    const isResponsableSameEtab =
      user.role === 'RESPONSABLE' &&
      user.etablissementId !== null &&
      threadEtablissementId === user.etablissementId

    if (!isEtudiant && !isEnseignant && !isAdmin && !isResponsableSameEtab) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    return NextResponse.json({ thread })
  } catch (error) {
    console.error('[exam-prep/help/messages] GET error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des messages' }, { status: 500 })
  }
}

export const POST = withAuth(_POST, ['ETUDIANT', 'ENSEIGNANT'])
export const GET = withAuth(_GET, ['ETUDIANT', 'ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
