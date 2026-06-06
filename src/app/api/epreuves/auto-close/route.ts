import { NextRequest, NextResponse } from 'next/server'
import { checkAndAutoCloseEpreuve, scanAndAutoCloseEpreuves, getEligibleStudentCount } from '@/lib/auto-closure'
import { db } from '@/lib/db'

/**
 * POST /api/epreuves/auto-close
 * 
 * Scan and auto-close eligible epreuves.
 * Can be called:
 * - With { epreuveId } to check a specific epreuve
 * - Without body to scan all active epreuves (used by monitoring service)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { epreuveId } = body

    if (epreuveId) {
      // Check and close a specific epreuve
      const result = await checkAndAutoCloseEpreuve(epreuveId)
      return NextResponse.json(result)
    }

    // Scan all epreuves
    const results = await scanAndAutoCloseEpreuves()
    const closedCount = results.filter(r => r.closed).length
    
    return NextResponse.json({
      scanned: results.length,
      closed: closedCount,
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
 * GET /api/epreuves/auto-close?epreuveId=xxx
 * 
 * Check closure status for a specific epreuve (without actually closing it).
 * Returns whether the epreuve is closed, in grace period, or still open.
 * 
 * FIX: allSubmitted now compares against eligible student count (based on filiere/niveau),
 * NOT just existing session records, to prevent premature closure display.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const epreuveId = searchParams.get('epreuveId')

    if (!epreuveId) {
      return NextResponse.json(
        { error: 'epreuveId requis' },
        { status: 400 }
      )
    }

    const epreuve = await db.epreuve.findUnique({
      where: { id: epreuveId },
      select: {
        id: true,
        titre: true,
        statut: true,
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

    // FIX: Get eligible student count (based on filiere/niveau) for accurate allSubmitted check
    const eligibleStudentCount = await getEligibleStudentCount(
      epreuve.filiereId,
      epreuve.groupesCibles as string | null
    )

    const isClosed = epreuve.statut === 'CLOTUREE'
    const isPastDeadline = now >= epreuve.dateFin
    const gracePeriodEndsAt = new Date(epreuve.dateFin.getTime() + (epreuve.delaiGrace || 3) * 60 * 1000)
    const inGracePeriod = isPastDeadline && now < gracePeriodEndsAt && !isClosed
    
    // FIX: allSubmitted uses eligible student count when available,
    // falling back to session count only if we can't determine eligible students
    const allSubmitted = eligibleStudentCount > 0
      ? submittedCount === eligibleStudentCount
      : (totalSessions > 0 && submittedCount === totalSessions)

    // Calculate submission rate based on eligible students (more accurate)
    const submissionRateDenominator = eligibleStudentCount > 0 ? eligibleStudentCount : totalSessions
    const submissionRate = submissionRateDenominator > 0 ? Math.round((submittedCount / submissionRateDenominator) * 100) : 0

    return NextResponse.json({
      epreuveId: epreuve.id,
      titre: epreuve.titre,
      statut: epreuve.statut,
      isClosed,
      inGracePeriod,
      isPastDeadline,
      allSubmitted,
      clotureeAt: epreuve.clotureeAt,
      clotureeAutomatiquement: epreuve.clotureeAutomatiquement,
      raisonCloture: epreuve.raisonCloture,
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
