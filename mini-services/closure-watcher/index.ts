/**
 * Closure Watcher Service
 * 
 * Background watcher that automatically closes epreuves when:
 * - Condition A: All eligible students have submitted (100% submission rate)
 * - Condition B: The scheduled end date/time + grace period is reached
 * 
 * FIX: Condition A now compares against eligible student count (based on filiere/niveau),
 * NOT just existing session records. Sessions are only created when a student starts the exam,
 * so using totalSessions would incorrectly close when only 1 student submits.
 * 
 * Architecture:
 * - Polls Supabase for EN_COURS/TERMINEE epreuves
 * - Checks if closure conditions are met
 * - Performs closure: locks submissions, marks absent students, notifies teachers
 * 
 * Port: 3033 (health check only)
 * Poll interval: 30 seconds
 */

// Set DATABASE_URL before importing Prisma
process.env.DATABASE_URL = 'postgresql://postgres.gnicihntcisgkkkuwolx:Victoire%401993%23@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5&pool_timeout=10'
process.env.DIRECT_URL = 'postgresql://postgres.gnicihntcisgkkkuwolx:Victoire%401993%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres'

import { PrismaClient } from '@prisma/client'

const PORT = 3033
const POLL_INTERVAL_MS = 30000 // 30 seconds

const prisma = new PrismaClient()

let isProcessing = false
let stats = {
  totalScanned: 0,
  totalClosed: 0,
  totalMarkedAbsent: 0,
  totalMarkedNonSoumis: 0,
  lastPoll: null as Date | null,
  currentStatus: 'idle' as string,
  lastClosedEpreuveId: null as string | null,
  errors: 0,
}

/**
 * Get the number of eligible students for an epreuve based on its filiereId and groupesCibles.
 * This is the authoritative count of students who SHOULD take the exam,
 * NOT just the count of existing SessionPassation records.
 */
async function getEligibleStudentCount(
  filiereId: string | null,
  groupesCibles: string | null
): Promise<number> {
  if (!filiereId) {
    // No filiere → can't determine eligible students
    return 0
  }

  // Parse niveau from groupesCibles if available
  let niveau: string | null = null
  if (groupesCibles) {
    try {
      const parsed = JSON.parse(groupesCibles)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'niveau' in parsed && parsed.niveau) {
        niveau = parsed.niveau
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Count eligible students: active students in the filiere, optionally filtered by niveau
  const where: Record<string, unknown> = {
    role: 'ETUDIANT',
    actif: true,
    filiereId,
  }
  if (niveau) {
    where.niveau = niveau
  }

  const count = await prisma.user.count({ where })
  return count
}

/**
 * Scan all active epreuves and check if they should be closed
 */
async function scanAndCloseEpreuves(): Promise<void> {
  if (isProcessing) {
    console.log('⏳ Already processing, skipping this poll')
    return
  }

  isProcessing = true
  stats.currentStatus = 'scanning'
  stats.lastPoll = new Date()

  try {
    // Find epreuves that are EN_COURS or TERMINEE and not yet closed
    const activeEpreuves = await prisma.epreuve.findMany({
      where: {
        statut: { in: ['EN_COURS', 'TERMINEE'] },
        deletedAt: null,
      },
      select: {
        id: true,
        titre: true,
        statut: true,
        dateFin: true,
        delaiGrace: true,
        enseignantId: true,
        filiereId: true,
        groupesCibles: true,
        sessions: {
          select: {
            id: true,
            etudiantId: true,
            statut: true,
          },
        },
      },
    })

    stats.totalScanned += activeEpreuves.length
    const now = new Date()

    for (const epreuve of activeEpreuves) {
      try {
        const submittedStatuses = ['SOUMISE', 'CORRIGEE', 'RETOURNEE', 'ABSENT', 'NON_SOUMIS']
        const totalSessions = epreuve.sessions.length
        const submittedCount = epreuve.sessions.filter(s => submittedStatuses.includes(s.statut)).length
        const activeSessions = epreuve.sessions.filter(s => s.statut === 'EN_COURS').length

        // FIX: Get eligible student count for Condition A check
        const eligibleStudentCount = await getEligibleStudentCount(
          epreuve.filiereId,
          epreuve.groupesCibles as string | null
        )

        // Condition A: All eligible students have submitted
        // FIX: Compare against eligible student count, NOT just existing sessions
        const allSubmitted = eligibleStudentCount > 0
          ? submittedCount === eligibleStudentCount
          : (totalSessions > 0 && submittedCount === totalSessions && activeSessions === 0)

        // Condition B: Deadline + grace period reached
        const graceMinutes = epreuve.delaiGrace || 3
        const deadlineWithGrace = new Date(epreuve.dateFin.getTime() + graceMinutes * 60 * 1000)
        const deadlineReached = now >= deadlineWithGrace

        if (allSubmitted || deadlineReached) {
          const raison = allSubmitted ? 'TOUS_SOUMIS' : 'ECHEANCE_ATTEINTE'
          console.log(`🔒 Closing epreuve "${epreuve.titre}" (${epreuve.id}) — Raison: ${raison} (submitted: ${submittedCount}/${eligibleStudentCount || totalSessions} eligible)`)

          await closeEpreuve(epreuve, raison)
        }
      } catch (err: any) {
        console.error(`❌ Error processing epreuve ${epreuve.id}:`, err.message)
        stats.errors++
      }
    }

    stats.currentStatus = 'idle'
  } catch (error: any) {
    console.error('❌ Scan error:', error.message)
    stats.currentStatus = 'error'
    stats.errors++
  } finally {
    isProcessing = false
  }
}

/**
 * Close an epreuve: update status, mark absent students, notify teacher
 */
async function closeEpreuve(
  epreuve: {
    id: string
    titre: string
    enseignantId: string
    sessions: Array<{ id: string; etudiantId: string; statut: string }>
  },
  raison: 'TOUS_SOUMIS' | 'ECHEANCE_ATTEINTE'
): Promise<void> {
  const now = new Date()
  const submittedStatuses = ['SOUMISE', 'CORRIGEE', 'RETOURNEE']
  
  let absentCount = 0
  let nonSoumisCount = 0

  // Process sessions that are not in a final state
  for (const session of epreuve.sessions) {
    if (submittedStatuses.includes(session.statut)) {
      continue // Already submitted, nothing to do
    }

    if (session.statut === 'NON_COMMENCEE') {
      // Student never started → ABSENT
      await prisma.sessionPassation.update({
        where: { id: session.id },
        data: {
          statut: 'ABSENT',
          dateFin: now,
          logEvents: JSON.stringify([
            { type: 'MARKED_ABSENT', timestamp: now.toISOString(), reason: 'Auto-closure: student never started' },
          ]),
        },
      })
      absentCount++
      stats.totalMarkedAbsent++
    } else if (session.statut === 'EN_COURS') {
      // Student was still writing → NON_SOUMIS (draft auto-saved)
      await prisma.sessionPassation.update({
        where: { id: session.id },
        data: {
          statut: 'NON_SOUMIS',
          dateFin: now,
          logEvents: JSON.stringify([
            { type: 'MARKED_NON_SOUMIS', timestamp: now.toISOString(), reason: 'Auto-closure: grace period expired, draft auto-saved' },
          ]),
        },
      })
      nonSoumisCount++
      stats.totalMarkedNonSoumis++
    }
  }

  // Update epreuve status
  await prisma.epreuve.update({
    where: { id: epreuve.id },
    data: {
      statut: 'CLOTUREE',
      clotureeAt: now,
      clotureeAutomatiquement: true,
      raisonCloture: raison,
    },
  })

  // Create alert for teacher
  const raisonLabel = raison === 'TOUS_SOUMIS'
    ? 'Tous les étudiants ont soumis leur composition'
    : 'La période de passation est terminée'

  await prisma.alerte.create({
    data: {
      titre: `Épreuve clôturée automatiquement`,
      description: `L'épreuve "${epreuve.titre}" a été clôturée automatiquement. Raison : ${raisonLabel}.${absentCount > 0 ? ` ${absentCount} étudiant(s) marqué(s) absent(s).` : ''}${nonSoumisCount > 0 ? ` ${nonSoumisCount} étudiant(s) non soumis (brouillon sauvegardé).` : ''}`,
      severity: 'INFO',
      type: 'SYSTEME',
      epreuveId: epreuve.id,
      userId: epreuve.enseignantId,
    },
  })

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: 'system',
      userEmail: 'system',
      action: 'AUTO_CLOSE_EPREUVE',
      entite: 'Epreuve',
      entiteId: epreuve.id,
      details: `Clôture automatique — Raison: ${raison}. Absents: ${absentCount}. Non soumis: ${nonSoumisCount}.`,
    },
  })

  stats.totalClosed++
  stats.lastClosedEpreuveId = epreuve.id
  console.log(`✅ Epreuve "${epreuve.titre}" closed. Absents: ${absentCount}, Non soumis: ${nonSoumisCount}`)
}

// Health check HTTP server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'closure-watcher',
        port: PORT,
        stats: {
          ...stats,
          uptime: process.uptime(),
        },
      })
    }

    // Manual trigger endpoint
    if (url.pathname === '/trigger' && req.method === 'POST') {
      console.log('🔔 Manual trigger received')
      scanAndCloseEpreuves().catch(console.error)
      return Response.json({ message: 'Scan triggered' })
    }

    return Response.json({ error: 'Not found' }, { status: 404 })
  },
})

console.log(`🔒 Closure Watcher running on port ${PORT}`)
console.log(`   Database: supabase (production)`)
console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000}s`)

// Initialize and start polling
async function start() {
  try {
    await prisma.$connect()
    console.log('✅ Connected to database')

    // Do initial scan
    await scanAndCloseEpreuves()

    // Start periodic scanning
    setInterval(() => {
      scanAndCloseEpreuves().catch(console.error)
    }, POLL_INTERVAL_MS)

    console.log(`🔄 Scanning every ${POLL_INTERVAL_MS / 1000}s for epreuves to auto-close`)
  } catch (err: any) {
    console.error('💥 Failed to start Closure Watcher:', err.message)
    process.exit(1)
  }
}

start()
