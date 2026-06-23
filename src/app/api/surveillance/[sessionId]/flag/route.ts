import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { computeRiskScore, type LogEvent } from '@/lib/surveillance-types'

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

// POST /api/surveillance/[sessionId]/flag
// Signale une session comme suspecte → crée une Alerte de type FRAUDE
// (sécurité multi-tenant : la session doit appartenir à une épreuve de l'enseignant)
async function _POST(
  request: NextRequest,
  context: {
    params: { sessionId: string }
    user: AuthenticatedUser
  }
) {
  try {
    const { user } = context
    const { sessionId } = context.params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    // ─── Récupère la session + vérifie l'appartenance ───
    const session = await db.sessionPassation.findUnique({
      where: { id: sessionId },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
        epreuve: {
          select: {
            id: true,
            titre: true,
            enseignantId: true,
            deletedAt: true,
          },
        },
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Session introuvable.' },
        { status: 404 }
      )
    }

    // RBAC : la session doit appartenir à une épreuve de l'enseignant connecté
    if (
      session.epreuve.enseignantId !== user.id ||
      session.epreuve.deletedAt !== null
    ) {
      return NextResponse.json(
        { error: "Accès refusé : cette session ne vous appartient pas." },
        { status: 403 }
      )
    }

    // ─── Évite les doublons : si une alerte FRAUDE non résolue existe déjà ───
    const existing = await db.alerte.findFirst({
      where: {
        type: 'FRAUDE',
        epreuveId: session.epreuveId,
        titre: { contains: session.id },
        resolu: false,
      },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        {
          error: 'Cette session a déjà été signalée.',
          alerteId: existing.id,
        },
        { status: 409 }
      )
    }

    // ─── Calcule le score de risque pour le titre ───
    const events = safeJsonParse<LogEvent[]>(session.logEvents, [])
    const fraudEvents = events.filter((e) => FRAUD_TYPES.includes(e.type))
    const totalPenalite = fraudEvents.reduce(
      (sum, e) => sum + (e.penalite || 0),
      0
    )
    const riskScore = computeRiskScore(
      session.alertes,
      totalPenalite,
      fraudEvents
    )

    // ─── Crée l'alerte FRAUDE ───
    const titre = `[FLAG] Session ${session.id.slice(-6)} — ${session.etudiant.name} (risque ${riskScore}/100)`
    const descriptionParts = [
      `Étudiant : ${session.etudiant.name} (${session.etudiant.email})`,
      `Épreuve : ${session.epreuve.titre}`,
      `Alertes : ${session.alertes} | Pénalité : ${totalPenalite} | Score de risque : ${riskScore}/100`,
      `Statut session : ${session.statut}`,
    ]
    if (session.dateDebut) {
      descriptionParts.push(
        `Début : ${new Date(session.dateDebut).toLocaleString('fr-FR')}`
      )
    }
    if (reason) {
      descriptionParts.push(`Motif du signalement : ${reason}`)
    }
    // Résumé des types de fraude détectés
    if (fraudEvents.length > 0) {
      const byType: Record<string, number> = {}
      fraudEvents.forEach((e) => {
        byType[e.type] = (byType[e.type] || 0) + 1
      })
      const summary = Object.entries(byType)
        .map(([t, n]) => `${t} (${n})`)
        .join(', ')
      descriptionParts.push(`Événements : ${summary}`)
    }

    const alerte = await db.alerte.create({
      data: {
        titre,
        description: descriptionParts.join('\n'),
        severity: riskScore >= 70 ? 'CRITICAL' : riskScore >= 40 ? 'WARNING' : 'INFO',
        type: 'FRAUDE',
        epreuveId: session.epreuveId,
        // userId null → broadcast pour les responsables/enseignants de l'établissement
        userId: null,
      },
      select: { id: true, titre: true, severity: true, type: true },
    })

    // ─── Audit log ───
    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'CREATE',
        entite: 'Alerte',
        entiteId: alerte.id,
        details: JSON.stringify({
          action: 'flag_session',
          sessionId,
          epreuveId: session.epreuveId,
          riskScore,
          reason: reason || null,
        }),
      },
    })

    return NextResponse.json(
      {
        alerte,
        message: 'Session signalée avec succès. Une alerte fraude a été créée.',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Flag session error:', error)
    return NextResponse.json(
      { error: "Erreur lors du signalement de la session." },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_POST, ['ENSEIGNANT'])
