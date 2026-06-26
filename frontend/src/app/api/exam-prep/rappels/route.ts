import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { sendPushToUser } from '@/lib/push'

/**
 * GET/POST /api/exam-prep/rappels
 *
 * Endpoint cron (à appeler toutes les 15 min via cron-job.org ou service
 * externe) qui scanne les StudySession PLANIFIEE dont la dateDebut est dans
 * moins d'1 heure ET dont le rappel n'a pas encore été envoyé.
 *
 * Supporte GET et POST (certains services cron utilisent GET par défaut).
 *
 * Sécurité : si CRON_SECRET est défini dans les variables d'environnement,
 * l'endpoint vérifie le header x-api-key ou le query param ?CRON_SECRET=.
 * Sans CRON_SECRET, l'endpoint est ouvert (pour cron-job.org).
 */
export const maxDuration = 60

// Logique partagée GET + POST
async function runRappelsScan() {
  const now = new Date()
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000)

  // Sessions à venir dans moins d'1h, rappel pas encore envoyé
  const sessionsToRemind = await withRetry(() =>
    db.studySession.findMany({
      where: {
        statut: 'PLANIFIEE',
        rappelEnvoye: false,
        dateDebut: {
          gte: now,
          lte: inOneHour,
        },
      },
      include: {
        document: { select: { nomFichier: true } },
      },
      take: 50,
    })
  )

  let sent = 0
  for (const session of sessionsToRemind) {
    const sessionLabel = session.titre || `Session de révision`
    const timeLabel = session.dateDebut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    try {
      // Alerte (type RAPPEL)
      await withRetry(() =>
        db.alerte.create({
          data: {
            titre: '⏰ Rappel : session de révision dans 1h',
            description: `${sessionLabel} à ${timeLabel} (${session.dureeMin} min)${
              session.document ? ` — ${session.document.nomFichier}` : ''
            }`,
            severity: 'WARNING',
            type: 'RAPPEL',
            userId: session.userId,
          },
        })
      )

      // NotificationAdmin
      await withRetry(() =>
        db.notificationAdmin.create({
          data: {
            type: 'STUDY_REMINDER',
            titre: '⏰ Rappel : révision dans 1h',
            message: `${sessionLabel} à ${timeLabel}`,
            destinataireId: session.userId,
            destinataireRole: 'ETUDIANT',
            actionUrl: '/exam-prep',
            actionLabel: 'Commencer la révision',
            priorite: 'HAUTE',
            categorie: 'PEDAGOGIE',
            icone: 'Clock',
          },
        })
      )

      // Push (non bloquant)
      sendPushToUser(session.userId, {
        title: '⏰ Révision dans 1h',
        body: `${sessionLabel} à ${timeLabel}`,
        url: '/exam-prep',
        tag: `reminder-${session.id}`,
      }).catch(() => {})

      // Marque rappel envoyé
      await withRetry(() =>
        db.studySession.update({
          where: { id: session.id },
          data: { rappelEnvoye: true },
        })
      )
      sent++
    } catch (err) {
      console.error(`[exam-prep/rappels] session ${session.id} failed:`, err)
    }
  }

  return NextResponse.json({
    sent,
    scanned: sessionsToRemind.length,
    message: sent > 0 ? `${sent} rappel(s) envoyé(s)` : 'Aucun rappel à envoyer',
  })
}

// Vérification du secret (optionnelle)
function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return null // Pas de secret configuré = accès ouvert

  const apiKey = request.headers.get('x-api-key')
    ?? request.headers.get('authorization')?.replace('Bearer ', '')
  const querySecret = new URL(request.url).searchParams.get('CRON_SECRET')

  if (apiKey !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  return null
}

export async function GET(request: NextRequest) {
  const authError = checkAuth(request)
  if (authError) return authError

  try {
    return await runRappelsScan()
  } catch (error) {
    console.error('[exam-prep/rappels] GET error:', error)
    return NextResponse.json({ error: 'Erreur lors du scan des rappels' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = checkAuth(request)
  if (authError) return authError

  try {
    return await runRappelsScan()
  } catch (error) {
    console.error('[exam-prep/rappels] POST error:', error)
    return NextResponse.json({ error: 'Erreur lors du scan des rappels' }, { status: 500 })
  }
}
