import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { sendPushToUser } from '@/lib/push'

/**
 * POST /api/exam-prep/rappels
 *
 * Endpoint cron (à appeler toutes les 15-30 min via Vercel Cron ou service
 * externe) qui scanne les StudySession PLANIFIEE dont la dateDebut est dans
 * moins d'1 heure ET dont le rappel n'a pas encore été envoyé (rappelEnvoye
 * = false). Pour chaque session :
 *  - crée une Alerte (type RAPPEL, severity WARNING) pour l'étudiant
 *  - crée une NotificationAdmin pour l'étudiant
 *  - envoie un push notification (si abonné)
 *  - marque rappelEnvoye = true (anti-doublon)
 *
 * Sécurité : protégé par CRON_SECRET (header x-api-key) pour empêcher les
 * appels publics. Vercel Cron envoie automatiquement ce header.
 */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  // Vérifie le secret cron (Vercel Cron envoie ?CRON_SECRET=... en query ou
  // x-api-key en header). En l'absence de CRON_SECRET configuré, on autorise
  // (mode dev) mais on log un warning.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const apiKey = request.headers.get('x-api-key') ?? request.headers.get('authorization')?.replace('Bearer ', '')
    const querySecret = new URL(request.url).searchParams.get('CRON_SECRET')
    if (apiKey !== cronSecret && querySecret !== cronSecret) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
  }

  try {
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
        take: 50, // limite par run
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
  } catch (error) {
    console.error('[exam-prep/rappels] error:', error)
    return NextResponse.json({ error: 'Erreur lors du scan des rappels' }, { status: 500 })
  }
}
