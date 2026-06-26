import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import {
  computeRiskScore,
  riskLevelFromScore,
  type LogEvent,
  type SurveillanceSession,
  type SeverityLevel,
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

const SUBMISSION_TYPES = ['AUTO_SUBMIT', 'MANUAL_SUBMIT', 'FORCE_SUBMIT']

/**
 * Vérifie qu'une session appartient bien à une épreuve créée par l'enseignant.
 * Utilisé pour le scoping RBAC (anti-accès cross-tenant).
 */
async function sessionBelongsToTeacher(
  sessionId: string,
  enseignantId: string
): Promise<boolean> {
  const session = await db.sessionPassation.findUnique({
    where: { id: sessionId },
    select: { epreuve: { select: { enseignantId: true, deletedAt: true } } },
  })
  return (
    !!session &&
    session.epreuve.enseignantId === enseignantId &&
    session.epreuve.deletedAt === null
  )
}

// GET /api/surveillance — Fetch proctoring events for a teacher's exams
// Sécurisé via withAuth (résout le bug critique #1 : endpoint sans auth)
async function _GET(
  request: NextRequest,
  context: { params: Record<string, string>; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const enseignantId = user.id

    const { searchParams } = new URL(request.url)
    const epreuveId = searchParams.get('epreuveId') || ''
    // Nouveaux filtres
    const severity = (searchParams.get('severity') || '') as SeverityLevel | ''
    const typeFilter = searchParams.get('type') || ''
    const search = searchParams.get('search') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    // Construction du where avec filtres
    const where: Record<string, unknown> = {
      epreuve: { enseignantId, deletedAt: null },
      statut: {
        in: ['EN_COURS', 'SOUMISE', 'CORRIGEE', 'RETOURNEE', 'NON_SOUMIS'],
      },
    }
    if (epreuveId) where.epreuveId = epreuveId

    // Filtre par plage de dates (sur dateDebut)
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) {
        // Inclure toute la journée de fin
        const end = new Date(dateTo)
        end.setHours(23, 59, 59, 999)
        dateFilter.lte = end
      }
      where.dateDebut = dateFilter
    }

    // Filtre par nom/email d'étudiant (search)
    if (search) {
      where.etudiant = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

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

    // Récupère en parallèle les alertes FRAUDE déjà créées (pour marquer "flagged")
    const epreuveIds = [...new Set(sessions.map((s) => s.epreuveId))]
    const existingFlags = epreuveIds.length
      ? await db.alerte.findMany({
          where: {
            type: 'FRAUDE',
            epreuveId: { in: epreuveIds },
            resolu: false,
          },
          select: { epreuveId: true, titre: true },
        })
      : []
    const flaggedEpreuveIds = new Set(existingFlags.map((f) => f.epreuveId))

    // Parse logEvents, catégorise, calcule le score de risque
    let parsedSessions: SurveillanceSession[] = sessions.map((session) => {
      const logEvents = safeJsonParse<LogEvent[]>(session.logEvents, [])

      const fraudEvents = logEvents.filter((e) => FRAUD_TYPES.includes(e.type))
      const screenshotEvents = logEvents.filter((e) => e.type === 'SCREEN_CAPTURE')
      const submissionEvents = logEvents.filter((e) =>
        SUBMISSION_TYPES.includes(e.type)
      )

      const totalPenalite = fraudEvents.reduce((sum, e) => sum + (e.penalite || 0), 0)

      const riskScore = computeRiskScore(
        session.alertes,
        totalPenalite,
        fraudEvents
      )
      const riskLevel = riskLevelFromScore(riskScore)

      return {
        id: session.id,
        statut: session.statut,
        dateDebut: session.dateDebut?.toISOString() ?? null,
        dateFin: session.dateFin?.toISOString() ?? null,
        score: session.score,
        penalite: session.penalite,
        alertes: session.alertes,
        etudiant: session.etudiant,
        epreuve: {
          ...session.epreuve,
          dateDebut: session.epreuve.dateDebut.toISOString(),
          dateFin: session.epreuve.dateFin.toISOString(),
        },
        logEvents,
        fraudEvents,
        screenshotEvents,
        submissionEvents,
        totalPenalite,
        riskScore,
        riskLevel,
        flagged: flaggedEpreuveIds.has(session.epreuveId),
      }
    })

    // Filtre par sévérité (post-traitement car basé sur les événements)
    if (severity) {
      parsedSessions = parsedSessions.filter((s) =>
        s.fraudEvents.some((e) => mapSeverity(e.type) === severity)
      )
    }

    // Filtre par type d'événement
    if (typeFilter && typeFilter !== 'ALL') {
      parsedSessions = parsedSessions.filter((s) =>
        s.logEvents.some((e) => e.type === typeFilter)
      )
    }

    // Liste des épreuves avec sessions
    const epreuvesWithAlerts = await db.epreuve.findMany({
      where: {
        enseignantId,
        deletedAt: null,
        statut: { in: ['EN_COURS', 'TERMINEE', 'CLOTUREE'] },
        sessions: {
          some: {
            statut: {
              in: ['EN_COURS', 'SOUMISE', 'CORRIGEE', 'RETOURNEE', 'NON_SOUMIS'],
            },
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
                statut: {
                  in: ['EN_COURS', 'SOUMISE', 'CORRIGEE', 'RETOURNEE', 'NON_SOUMIS'],
                },
              },
            },
          },
        },
      },
      orderBy: { dateDebut: 'desc' },
    })

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

function mapSeverity(type: string): SeverityLevel {
  const high = ['FULLSCREEN_EXIT', 'TAB_SWITCH', 'DEVTOOLS_ATTEMPT']
  const medium = [
    'COPY_ATTEMPT',
    'PASTE_ATTEMPT',
    'PRINTSCREEN_ATTEMPT',
    'PRINT_ATTEMPT',
    'ALT_TAB',
  ]
  if (high.includes(type)) return 'high'
  if (medium.includes(type)) return 'medium'
  if (type === 'INACTIVITY') return 'low'
  return 'info'
}

export const GET = withAuth(_GET, ['ENSEIGNANT'])

// Note: la fonction sessionBelongsToTeacher est exportée pour réutilisation
// par la route /api/surveillance/[sessionId]/flag
export { sessionBelongsToTeacher }
