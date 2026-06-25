import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { sendPushToUser } from '@/lib/push'

/**
 * Messagerie étudiant ↔ enseignant (aide contextuelle).
 *
 * GET  /api/exam-prep/help — liste les threads de l'utilisateur
 *      (étudiant : ses threads ; enseignant : threads de ses documents).
 *      Filtre ?documentId=... & ?statut=OUVERT|REPONDU|CLOS
 * POST /api/exam-prep/help — l'étudiant crée un thread + premier message.
 *      Body : { documentId, chapterId?, sujet, message, passageContext? }
 *      → notifie l'enseignant propriétaire du document (NotificationAdmin
 *        + push si abonné).
 */
async function _GET(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    const statut = searchParams.get('statut')

    const where: Record<string, unknown> = {}
    if (documentId) where.documentId = documentId
    if (statut) where.statut = statut

    if (user.role === 'ETUDIANT') {
      where.etudiantId = user.id
    } else if (user.role === 'ENSEIGNANT') {
      where.enseignantId = user.id
    } else {
      // RESPONSABLE / ADMIN : voient les threads des documents de leur tenant
      // (filtre large — on suppose le tenant isolation déjà appliquée plus haut)
    }

    const threads = await withRetry(() =>
      db.helpThread.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          document: { select: { id: true, nomFichier: true } },
          chapter: { select: { id: true, titre: true } },
          etudiant: { select: { id: true, name: true } },
          enseignant: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
        },
      })
    )

    return NextResponse.json({ threads })
  } catch (error) {
    console.error('[exam-prep/help] GET error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des threads' }, { status: 500 })
  }
}

interface CreateThreadBody {
  documentId: string
  chapterId?: string
  sujet: string
  message: string
  passageContext?: string
}

async function _POST(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context

    // Seuls les étudiants créent des threads d'aide
    if (user.role !== 'ETUDIANT') {
      return NextResponse.json({ error: 'Seuls les étudiants peuvent créer un thread d\'aide' }, { status: 403 })
    }

    const body = (await request.json()) as CreateThreadBody
    const { documentId, sujet, message } = body

    if (!documentId || !sujet?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'documentId, sujet et message sont requis' }, { status: 400 })
    }

    // ─── Vérifie l'accès au document + récupère l'enseignant propriétaire ───
    const document = await withRetry(() =>
      db.document.findFirst({
        where: {
          id: documentId,
          deletedAt: null,
          uniteEnseignement: {
            filiereId: user.filiereId ?? '___none___',
            actif: true,
            OR: [
              { niveau: user.niveau ?? '___none___' },
              { niveaux: { contains: user.niveau ?? '___none___' } },
            ],
          },
        },
        select: { id: true, ownerId: true, nomFichier: true },
      })
    )

    if (!document) {
      return NextResponse.json({ error: 'Document non accessible' }, { status: 403 })
    }

    // ─── Crée le thread + premier message (transaction) ───
    const thread = await withRetry(() =>
      db.helpThread.create({
        data: {
          documentId,
          chapterId: body.chapterId ?? null,
          etudiantId: user.id,
          enseignantId: document.ownerId,
          sujet: sujet.trim().slice(0, 200),
          passageContext: body.passageContext?.slice(0, 1000) ?? null,
          statut: 'OUVERT',
          messages: {
            create: {
              auteurId: user.id,
              role: 'etudiant',
              content: message.trim().slice(0, 4000),
            },
          },
        },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          document: { select: { id: true, nomFichier: true } },
          chapter: { select: { id: true, titre: true } },
        },
      })
    )

    // ─── Notifie l'enseignant (in-app + push) ───
    try {
      await withRetry(() =>
        db.notificationAdmin.create({
          data: {
            type: 'HELP_REQUEST',
            titre: 'Nouvelle question d\'étudiant',
            message: `${user.name} : ${sujet.trim().slice(0, 80)}`,
            destinataireId: document.ownerId,
            destinataireRole: 'ENSEIGNANT',
            actionUrl: `/exam-prep-help?threadId=${thread.id}`,
            actionLabel: 'Répondre',
            priorite: 'NORMALE',
            categorie: 'PEDAGOGIE',
            icone: 'HelpCircle',
          },
        })
      )

      // Push notification (non bloquant — ignore les erreurs)
      sendPushToUser(document.ownerId, {
        title: '📚 Question d\'étudiant',
        body: `${user.name} a une question sur « ${document.nomFichier} »`,
        url: `/exam-prep-help?threadId=${thread.id}`,
        tag: `help-${thread.id}`,
      }).catch(() => {})
    } catch (notifError) {
      console.error('[exam-prep/help] notif failed:', notifError)
    }

    return NextResponse.json({ thread }, { status: 201 })
  } catch (error) {
    console.error('[exam-prep/help] POST error:', error)
    return NextResponse.json({ error: 'Erreur lors de la création du thread' }, { status: 500 })
  }
}

export const GET = withAuth(_GET, ['ETUDIANT', 'ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
export const POST = withAuth(_POST, ['ETUDIANT'])
