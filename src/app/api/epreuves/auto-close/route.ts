import { NextRequest, NextResponse } from 'next/server'
import { checkAndAutoCloseEpreuve, scanAndAutoCloseEpreuves, getEligibleStudentCount } from '@/lib/auto-closure'
import { db } from '@/lib/db'

// Cron secret for securing the auto-close endpoint
const CRON_SECRET = process.env.CRON_SECRET || 'sect-cron-2024-auto-close'

/**
 * Verify that the request is authorized to trigger auto-close batch scan.
 * Accepts:
 * - URL secret: ?secret=xxx (simplest for cron-job.org)
 * - Authorization header: Bearer xxx (for Vercel Cron / custom clients)
 * - Custom header: x-cron-secret: xxx
 */
function isCronAuthorized(request: NextRequest, searchParams: URLSearchParams): boolean {
  // Method 1: Secret in URL query param (easiest for external cron services like cron-job.org)
  const urlSecret = searchParams.get('secret')
  if (urlSecret && urlSecret === CRON_SECRET) return true

  // Method 2: Vercel Cron sends Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${CRON_SECRET}`) return true

  // Method 3: Custom header
  const cronHeader = request.headers.get('x-cron-secret')
  if (cronHeader === CRON_SECRET) return true

  return false
}

/**
 * POST /api/epreuves/auto-close
 * 
 * Scan and auto-close eligible epreuves.
 * Can be called:
 * - With { epreuveId } to check a specific epreuve (any authenticated user)
 * - Without body to scan all active epreuves (cron only — requires cron secret)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { epreuveId } = body

    // Specific epreuve check — allowed for all
    if (epreuveId) {
      const result = await checkAndAutoCloseEpreuve(epreuveId)
      return NextResponse.json(result)
    }

    // Batch scan — requires cron authorization
    const { searchParams } = new URL(request.url)
    if (!isCronAuthorized(request, searchParams)) {
      return NextResponse.json(
        { error: 'Non autorisé. La scan global nécessite une authentification cron.' },
        { status: 401 }
      )
    }

    const results = await scanAndAutoCloseEpreuves()
    const closedCount = results.filter(r => r.closed).length
    const transitionedCount = results.filter(r => r.transitioned).length
    
    return NextResponse.json({
      scanned: results.length,
      closed: closedCount,
      transitioned: transitionedCount,
      results,
    })
  } catch (error) {
    console.error('Auto-close scan error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du scan de clôture automatique' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/epreuves/auto-close
 * 
 * Multiple modes:
 * 
 * 1. Cron scan: ?secret=sect-cron-2024-auto-close
 *    Triggers batch scan of all epreuves. Used by cron-job.org (simple GET, no headers needed).
 * 
 * 2. Cron scan (header auth): ?cron=true + Authorization: Bearer xxx
 *    Same as above but uses header-based auth.
 * 
 * 3. Status check: ?epreuveId=xxx
 *    Check closure status for a specific epreuve (read-only, no closing).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const epreuveId = searchParams.get('epreuveId')
    const isCron = searchParams.get('cron') === 'true' || searchParams.get('secret')

    // ─── Cron invocation (batch scan) ─────────────────────────────────────
    if (isCron) {
      if (!isCronAuthorized(request, searchParams)) {
        return NextResponse.json(
          { error: 'Non autorisé. Fournissez ?secret=VOTRE_CRON_SECRET' },
          { status: 401 }
        )
      }

      const results = await scanAndAutoCloseEpreuves()
      const closedCount = results.filter(r => r.closed).length
      const transitionedCount = results.filter(r => r.transitioned).length

      return NextResponse.json({
        scanned: results.length,
        closed: closedCount,
        transitioned: transitionedCount,
        timestamp: new Date().toISOString(),
        results,
      })
    }

    // ─── Specific epreuve status check (read-only) ────────────────────────
    if (!epreuveId) {
      return NextResponse.json(
        { error: 'epreuveId requis (ou ?secret=xxx pour le cron)' },
        { status: 400 }
      )
    }

    const epreuve = await db.epreuve.findUnique({
      where: { id: epreuveId },
      select: {
        id: true,
        titre: true,
        statut: true,
        dateDebut: true,
        dateFin: true,
        delaiGrace: true,
        clotureeAt: true,
        clotureeAutomatiquement: true,
        raisonCloture: true,
        filiereId: true,
        groupesCibles: true,
        sessions: {
          select: {
            id: true,
            statut: true,
            etudiantId: true,
          },
        },
      },
    })

    if (!epreuve) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    const now = new Date()
    const submittedStatuses = ['SOUMISE', 'CORRIGEE', 'RETOURNEE']
    const totalSessions = epreuve.sessions.length
    const submittedCount = epreuve.sessions.filter(s => submittedStatuses.includes(s.statut)).length
    const activeCount = epreuve.sessions.filter(s => s.statut === 'EN_COURS').length
    const absentCount = epreuve.sessions.filter(s => s.statut === 'ABSENT').length
    const notStartedCount = epreuve.sessions.filter(s => s.statut === 'NON_COMMENCEE').length

    const eligibleStudentCount = await getEligibleStudentCount(
      epreuve.filiereId,
      epreuve.groupesCibles as string | null
    )

    const isClosed = epreuve.statut === 'CLOTUREE'
    const isPastDeadline = now >= epreuve.dateFin
    const gracePeriodEndsAt = new Date(epreuve.dateFin.getTime() + (epreuve.delaiGrace || 3) * 60 * 1000)
    const inGracePeriod = isPastDeadline && now < gracePeriodEndsAt && !isClosed
    
    const allSubmitted = eligibleStudentCount > 0
      ? submittedCount === eligibleStudentCount
      : (totalSessions > 0 && submittedCount === totalSessions)

    const submissionRateDenominator = eligibleStudentCount > 0 ? eligibleStudentCount : totalSessions
    const submissionRate = submissionRateDenominator > 0 ? Math.round((submittedCount / submissionRateDenominator) * 100) : 0

    const shouldAutoStart = epreuve.statut === 'PLANIFIEE' && now >= epreuve.dateDebut

    return NextResponse.json({
      epreuveId: epreuve.id,
      titre: epreuve.titre,
      statut: epreuve.statut,
      isClosed,
      inGracePeriod,
      isPastDeadline,
      allSubmitted,
      shouldAutoStart,
      clotureeAt: epreuve.clotureeAt,
      clotureeAutomatiquement: epreuve.clotureeAutomatiquement,
      raisonCloture: epreuve.raisonCloture,
      dateDebut: epreuve.dateDebut,
      dateFin: epreuve.dateFin,
      gracePeriodEndsAt: isPastDeadline ? gracePeriodEndsAt : null,
      delaiGrace: epreuve.delaiGrace || 3,
      eligibleStudentCount,
      sessions: {
        total: totalSessions,
        submitted: submittedCount,
        active: activeCount,
        absent: absentCount,
        notStarted: notStartedCount,
        submissionRate,
      },
    })
  } catch (error) {
    console.error('Check closure status error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la vérification du statut de clôture' },
      { status: 500 }
    )
  }
}
