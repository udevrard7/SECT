import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Safe JSON.parse that returns fallback instead of throwing */
function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// GET /api/surveillance — Fetch proctoring events for a teacher's exams
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const epreuveId = searchParams.get('epreuveId')

    if (!enseignantId) {
      return NextResponse.json({ error: 'Enseignant requis' }, { status: 400 })
    }

    // Find all sessions for this teacher's exams that have been started
    const where: Record<string, unknown> = {
      epreuve: { enseignantId, deletedAt: null },
      // Only show sessions that have been started (not NON_COMMENCEE)
      statut: { in: ['EN_COURS', 'SOUMISE', 'CORRIGEE', 'RETOURNEE', 'NON_SOUMIS'] },
    }
    if (epreuveId) where.epreuveId = epreuveId

    const sessions = await db.sessionPassation.findMany({
      where,
      orderBy: { dateDebut: 'desc' },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
        epreuve: {
          select: {
            id: true,
            titre: true,
            statut: true,
            dateDebut: true,
            dateFin: true,
            proctoringActif: true,
          },
        },
      },
    })

    // Parse logEvents and categorize events
    const parsedSessions = sessions.map((session) => {
      const logEvents = safeJsonParse<
        Array<{
          type: string
          timestamp: string
          details?: string
          penalite?: number
          imageLength?: number
          thumbnail?: string
        }>
      >(session.logEvents, [])

      // Categorize events
      const fraudEvents = logEvents.filter((e) =>
        ['FULLSCREEN_EXIT', 'TAB_SWITCH', 'COPY_ATTEMPT', 'PASTE_ATTEMPT',
         'DEVTOOLS_ATTEMPT', 'PRINTSCREEN_ATTEMPT', 'PRINT_ATTEMPT',
         'ALT_TAB', 'INACTIVITY'].includes(e.type)
      )
      const screenshotEvents = logEvents.filter((e) => e.type === 'SCREEN_CAPTURE')
      const submissionEvents = logEvents.filter((e) =>
        ['AUTO_SUBMIT', 'MANUAL_SUBMIT', 'FORCE_SUBMIT'].includes(e.type)
      )

      // Calculate total penalty from events
      const totalPenalite = fraudEvents.reduce((sum, e) => sum + (e.penalite || 0), 0)

      return {
        id: session.id,
        statut: session.statut,
        dateDebut: session.dateDebut,
        dateFin: session.dateFin,
        score: session.score,
        penalite: session.penalite,
        alertes: session.alertes,
        etudiant: session.etudiant,
        epreuve: session.epreuve,
        logEvents,
        fraudEvents,
        screenshotEvents,
        submissionEvents,
        totalPenalite,
      }
    })

    // Get list of epreuves with sessions that have alerts
    const epreuvesWithAlerts = await db.epreuve.findMany({
      where: {
        enseignantId,
        deletedAt: null,
        statut: { in: ['EN_COURS', 'TERMINEE', 'CLOTUREE'] },
        sessions: {
          some: {
            statut: { in: ['EN_COURS', 'SOUMISE', 'CORRIGEE', 'RETOURNEE', 'NON_SOUMIS'] },
          },
        },
      },
      select: {
        id: true,
        titre: true,
        statut: true,
        dateDebut: true,
        dateFin: true,
        proctoringActif: true,
        _count: {
          select: {
            sessions: {
              where: {
                statut: { in: ['EN_COURS', 'SOUMISE', 'CORRIGEE', 'RETOURNEE', 'NON_SOUMIS'] },
              },
            },
          },
        },
      },
      orderBy: { dateDebut: 'desc' },
    })

    // Add alert counts per epreuve
    const epreuveStats = epreuvesWithAlerts.map((ep) => {
      const epSessions = parsedSessions.filter((s) => s.epreuve.id === ep.id)
      const totalAlerts = epSessions.reduce((sum, s) => sum + s.alertes, 0)
      const sessionsWithAlerts = epSessions.filter((s) => s.alertes > 0).length
      return {
        ...ep,
        totalAlerts,
        sessionsWithAlerts,
        totalSessions: ep._count.sessions,
      }
    })

    return NextResponse.json({
      sessions: parsedSessions,
      epreuves: epreuveStats,
    })
  } catch (error) {
    console.error('Surveillance fetch error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des données de surveillance' },
      { status: 500 }
    )
  }
}
