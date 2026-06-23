import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import {
  EVENT_LABELS,
  type LogEvent,
  type SurveillanceStats,
} from '@/lib/surveillance-types'

/** Safe JSON.parse that returns fallback instead of throwing */
function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const FRAUD_TYPES = [
  'FULLSCREEN_EXIT',
  'TAB_SWITCH',
  'COPY_ATTEMPT',
  'PASTE_ATTEMPT',
  'DEVTOOLS_ATTEMPT',
  'PRINTSCREEN_ATTEMPT',
  'PRINT_ATTEMPT',
  'ALT_TAB',
  'INACTIVITY',
]

// GET /api/surveillance/stats — KPIs agrégés pour l'enseignant connecté
async function _GET(
  _request: NextRequest,
  context: { params: Record<string, string>; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const enseignantId = user.id

    // ─── Sessions de l'enseignant ───
    const sessions = await db.sessionPassation.findMany({
      where: {
        epreuve: { enseignantId, deletedAt: null },
        statut: {
          in: ['EN_COURS', 'SOUMISE', 'CORRIGEE', 'RETOURNEE', 'NON_SOUMIS'],
        },
      },
      select: {
        id: true,
        statut: true,
        dateDebut: true,
        alertes: true,
        penalite: true,
        logEvents: true,
        etudiant: { select: { id: true, name: true, email: true } },
        epreuveId: true,
      },
    })

    // ─── KPIs ───
    const totalSessions = sessions.length
    const activeSessions = sessions.filter((s) => s.statut === 'EN_COURS').length
    const sessionsWithAlerts = sessions.filter((s) => s.alertes > 0).length
    const totalAlerts = sessions.reduce((sum, s) => sum + s.alertes, 0)
    const totalPenalite = sessions.reduce((sum, s) => sum + s.penalite, 0)

    // ─── Comptage fraudes par type + screenshots ───
    const fraudCountByType: Record<string, number> = {}
    let screenshots = 0
    const studentMap: Record<
      string,
      { id: string; name: string; email: string; alertes: number; penalite: number }
    > = {}

    for (const s of sessions) {
      const events = safeJsonParse<LogEvent[]>(s.logEvents, [])
      for (const e of events) {
        if (FRAUD_TYPES.includes(e.type)) {
          fraudCountByType[e.type] = (fraudCountByType[e.type] || 0) + 1
        }
        if (e.type === 'SCREEN_CAPTURE') screenshots++
      }
      const key = s.etudiant.id
      if (!studentMap[key]) {
        studentMap[key] = {
          id: s.etudiant.id,
          name: s.etudiant.name,
          email: s.etudiant.email,
          alertes: 0,
          penalite: 0,
        }
      }
      studentMap[key].alertes += s.alertes
      studentMap[key].penalite += s.penalite
    }

    // ─── Sessions flaguées (alerte FRAUDE non résolue) ───
    const epreuveIds = [...new Set(sessions.map((s) => s.epreuveId))]
    const flaggedCount = epreuveIds.length
      ? await db.alerte.count({
          where: {
            type: 'FRAUDE',
            epreuveId: { in: epreuveIds },
            resolu: false,
          },
        })
      : 0

    // ─── fraudByType trié ───
    const fraudByType = Object.entries(fraudCountByType)
      .map(([type, count]) => ({
        type,
        count,
        label: EVENT_LABELS[type] || type,
      }))
      .sort((a, b) => b.count - a.count)

    // ─── Timeline 7 derniers jours ───
    const now = new Date()
    const timeline: SurveillanceStats['timeline'] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now)
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - i)
      const nextDay = new Date(day)
      nextDay.setDate(nextDay.getDate() + 1)

      const daySessions = sessions.filter((s) => {
        if (!s.dateDebut) return false
        const d = new Date(s.dateDebut)
        return d >= day && d < nextDay
      })
      const alerts = daySessions.reduce((sum, s) => sum + s.alertes, 0)

      timeline.push({
        date: day.toISOString().slice(0, 10),
        alerts,
        sessions: daySessions.length,
      })
    }

    // ─── Top 5 étudiants par alertes ───
    const topStudents = Object.values(studentMap)
      .sort((a, b) => b.alertes - a.alertes)
      .slice(0, 5)

    const stats: SurveillanceStats = {
      kpis: {
        totalSessions,
        activeSessions,
        sessionsWithAlerts,
        totalAlerts,
        totalPenalite,
        flaggedSessions: flaggedCount,
        screenshots,
      },
      fraudByType,
      timeline,
      topStudents,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Surveillance stats error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du calcul des statistiques' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ENSEIGNANT'])
