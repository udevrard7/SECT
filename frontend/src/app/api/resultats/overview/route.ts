import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { requireAdminEtablissementAccess } from '@/lib/tenant-access'

// ─── Helpers ───

/**
 * Compute the true median of an ALREADY sorted array.
 * - Odd n: middle element.
 * - Even n: average of the two middle elements.
 * - Empty: 0.
 */
function calculateMedian(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  return n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function emptyOverview() {
  return {
    totalEpreuves: 0,
    totalSessions: 0,
    totalCorrigees: 0,
    globalMoyenne: 0,
    globalTauxReussite: 0,
    epreuves: [] as Array<{
      id: string
      titre: string
      dateDebut: Date | null
      dateFin: Date | null
      statut: string
      noteTotal: number
      nbSessions: number
      nbCorrigees: number
      moyenne: number
      tauxReussite: number
      mediane: number
    }>,
    evolution: [] as Array<{ mois: string; moyenne: number; count: number }>,
    studentsAtRisk: [] as Array<{
      etudiantId: string
      etudiantName: string
      etudiantEmail: string
      nbExamens: number
      moyenne: number
      derniereNote: number
    }>,
    topQuestions: [] as Array<{
      epreuveId: string
      epreuveTitre: string
      questionIndex: number
      enonce: string
      type: string
      tauxReussite: number
      count: number
    }>,
  }
}

/**
 * Lightweight cross-exam analytics endpoint for teachers.
 *
 * Auth: ENSEIGNANT (scoped to user.id) or ADMIN (optional ?enseignantId= filter,
 * otherwise scoped to all establishments the ADMIN has APPROUVE access to).
 *
 * Returns aggregated analytics across ALL the teacher's finished exams
 * (TERMINEE + CLOTUREE) in ONE efficient query batch. All scores are
 * normalized to /20 using Epreuve.noteTotal (default 20).
 */
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)

    let enseignantId: string | undefined
    let adminScopedToTeacher = false

    if (user.role === 'ENSEIGNANT') {
      enseignantId = user.id
    } else if (user.role === 'ADMIN') {
      const q = searchParams.get('enseignantId')
      if (q) {
        // Verify ADMIN has access to that teacher's establishment before scoping.
        const teacher = await db.user.findUnique({
          where: { id: q },
          select: { etablissementId: true },
        })
        if (teacher?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(
            user,
            teacher.etablissementId
          )
          if (accessError) return accessError
          enseignantId = q
          adminScopedToTeacher = true
        } else {
          return NextResponse.json(
            { error: 'Enseignant introuvable.' },
            { status: 404 }
          )
        }
      }
    }

    // ─── Build epreuve where clause — only finished exams ───
    const epreuveWhere: Record<string, unknown> = {
      deletedAt: null,
      statut: { in: ['TERMINEE', 'CLOTUREE'] },
    }

    if (enseignantId) {
      epreuveWhere.enseignantId = enseignantId
    } else if (user.role === 'ADMIN' && !adminScopedToTeacher) {
      // ADMIN without a specific teacher filter — restrict to authorized establishments.
      const now = new Date()
      const accessRecords = await db.etablissementAccess.findMany({
        where: {
          adminId: user.id,
          statut: 'APPROUVE',
          OR: [{ dateDebut: null }, { dateDebut: { lte: now } }],
        },
        select: { etablissementId: true, dateFin: true },
      })
      const adminEtabIds = accessRecords
        .filter((r) => !r.dateFin || r.dateFin >= now)
        .map((r) => r.etablissementId)
      if (adminEtabIds.length === 0) {
        return NextResponse.json(emptyOverview())
      }
      epreuveWhere.enseignant = { etablissementId: { in: adminEtabIds } }
    }

    // ─── Parallel queries ───
    // 1. Teacher's epreuves list (with questions for topQuestions lookup).
    // 2. All sessions for these epreuves (with resultat for detailParQuestion parsing).
    const [epreuves, sessions] = await Promise.all([
      db.epreuve.findMany({
        where: epreuveWhere,
        select: {
          id: true,
          titre: true,
          dateDebut: true,
          dateFin: true,
          statut: true,
          noteTotal: true,
          questions: {
            include: {
              question: { select: { id: true, type: true, enonce: true } },
            },
            orderBy: { ordre: 'asc' },
          },
        },
        orderBy: { dateFin: 'desc' },
      }),
      db.sessionPassation.findMany({
        where: { epreuve: epreuveWhere },
        select: {
          id: true,
          epreuveId: true,
          etudiantId: true,
          statut: true,
          score: true,
          dateFin: true,
          etudiant: { select: { id: true, name: true, email: true } },
          epreuve: { select: { id: true, titre: true, noteTotal: true } },
          resultat: { select: { detailParQuestion: true } },
        },
      }),
    ])

    if (epreuves.length === 0) {
      return NextResponse.json(emptyOverview())
    }

    // ─── Per-epreuve stats accumulator ───
    const epreuveStatsMap = new Map<
      string,
      {
        id: string
        titre: string
        dateDebut: Date
        dateFin: Date
        statut: string
        noteTotal: number
        nbSessions: number
        nbCorrigees: number
        scores: number[] // normalized to /20
      }
    >()
    for (const e of epreuves) {
      epreuveStatsMap.set(e.id, {
        id: e.id,
        titre: e.titre,
        dateDebut: e.dateDebut,
        dateFin: e.dateFin,
        statut: e.statut,
        noteTotal: e.noteTotal ?? 20,
        nbSessions: 0,
        nbCorrigees: 0,
        scores: [],
      })
    }

    // ─── Global accumulators ───
    let totalScoredSessions = 0
    let totalReussite = 0
    const allNormalizedScores: number[] = []

    // ─── Evolution: last 12 months (YYYY-MM) ───
    const evolutionMap = new Map<string, { sum: number; count: number }>()
    const nowDate = new Date()
    const last12Months = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1)
      last12Months.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      )
    }

    // ─── Students at risk: aggregate per etudiantId ───
    const studentMap = new Map<
      string,
      {
        etudiantId: string
        etudiantName: string
        etudiantEmail: string
        examIds: Set<string>
        sumScore: number
        countScore: number
        derniereDate: Date | null
        derniereNote: number
      }
    >()

    // ─── Top questions: per (epreuveId, questionIndex) ───
    const questionAgg = new Map<
      string,
      {
        epreuveId: string
        epreuveTitre: string
        questionIndex: number
        enonce: string
        type: string
        sumRatio: number
        count: number
      }
    >()

    // Build question lookup: epreuveId → [{enonce, type}] in ordre
    const epreuveQuestionLookup = new Map<
      string,
      Array<{ enonce: string; type: string }>
    >()
    for (const e of epreuves) {
      epreuveQuestionLookup.set(
        e.id,
        e.questions.map((eq) => ({
          enonce: eq.question.enonce,
          type: String(eq.question.type),
        }))
      )
    }

    // ─── Iterate over sessions and accumulate everything in a single pass ───
    for (const s of sessions) {
      const ep = epreuveStatsMap.get(s.epreuveId)
      if (ep) {
        ep.nbSessions++
        if (s.statut === 'CORRIGEE' || s.statut === 'RETOURNEE') ep.nbCorrigees++
      }

      const noteTotal = s.epreuve?.noteTotal ?? 20
      const normScore =
        noteTotal > 0 && s.score !== null ? (s.score / noteTotal) * 20 : null

      if (normScore !== null) {
        allNormalizedScores.push(normScore)
        totalScoredSessions++
        if (normScore >= 10) totalReussite++

        if (ep) ep.scores.push(normScore)

        // Evolution (last 12 months only, based on dateFin)
        if (s.dateFin) {
          const monthKey = `${s.dateFin.getFullYear()}-${String(
            s.dateFin.getMonth() + 1
          ).padStart(2, '0')}`
          if (last12Months.has(monthKey)) {
            const cur = evolutionMap.get(monthKey) || { sum: 0, count: 0 }
            cur.sum += normScore
            cur.count++
            evolutionMap.set(monthKey, cur)
          }
        }

        // Students at risk
        const stuId = s.etudiantId
        const stuName = s.etudiant?.name || ''
        const stuEmail = s.etudiant?.email || ''
        const stu =
          studentMap.get(stuId) ||
          {
            etudiantId: stuId,
            etudiantName: stuName,
            etudiantEmail: stuEmail,
            examIds: new Set<string>(),
            sumScore: 0,
            countScore: 0,
            derniereDate: null as Date | null,
            derniereNote: 0,
          }
        stu.examIds.add(s.epreuveId)
        stu.sumScore += normScore
        stu.countScore++
        if (s.dateFin && (!stu.derniereDate || s.dateFin > stu.derniereDate)) {
          stu.derniereDate = s.dateFin
          stu.derniereNote = normScore
        }
        studentMap.set(stuId, stu)
      }

      // Top questions: parse detailParQuestion JSON
      const dpq = s.resultat?.detailParQuestion
      if (dpq) {
        try {
          const parsed = JSON.parse(dpq) as Array<Record<string, unknown>>
          if (Array.isArray(parsed)) {
            const lookup = epreuveQuestionLookup.get(s.epreuveId) || []
            parsed.forEach((q, idx) => {
              const score = typeof q.score === 'number' ? q.score : null
              const bareme = typeof q.bareme === 'number' ? q.bareme : null
              if (score === null || bareme === null || bareme === 0) return
              const ratio = score / bareme // 0..1
              const qInfo = lookup[idx] || { enonce: '', type: String(q.type || '') }
              const key = `${s.epreuveId}:${idx}`
              const cur =
                questionAgg.get(key) ||
                {
                  epreuveId: s.epreuveId,
                  epreuveTitre: s.epreuve?.titre || '',
                  questionIndex: idx,
                  enonce: qInfo.enonce,
                  type: qInfo.type || String(q.type || ''),
                  sumRatio: 0,
                  count: 0,
                }
              cur.sumRatio += ratio
              cur.count++
              questionAgg.set(key, cur)
            })
          }
        } catch {
          // Ignore malformed JSON — single bad row shouldn't break the overview.
        }
      }
    }

    // ─── Build per-epreuve response array ───
    const epreuvesOut = epreuves.map((e) => {
      const st = epreuveStatsMap.get(e.id)!
      // IMPORTANT: sort a copy — never mutate the source array.
      const sortedScores = [...st.scores].sort((a, b) => a - b)
      const moyenne =
        st.scores.length > 0
          ? Math.round(
              (st.scores.reduce((a, b) => a + b, 0) / st.scores.length) * 100
            ) / 100
          : 0
      const mediane = Math.round(calculateMedian(sortedScores) * 100) / 100
      const tauxReussite =
        st.scores.length > 0
          ? Math.round(
              (st.scores.filter((sv) => sv >= 10).length / st.scores.length) * 100
            )
          : 0
      return {
        id: st.id,
        titre: st.titre,
        dateDebut: st.dateDebut,
        dateFin: st.dateFin,
        statut: st.statut,
        noteTotal: st.noteTotal,
        nbSessions: st.nbSessions,
        nbCorrigees: st.nbCorrigees,
        moyenne,
        tauxReussite,
        mediane,
      }
    })

    // ─── Evolution: chronological order (oldest first) ───
    const evolution = Array.from(evolutionMap.entries())
      .map(([mois, v]) => ({
        mois,
        moyenne: v.count > 0 ? Math.round((v.sum / v.count) * 100) / 100 : 0,
        count: v.count,
      }))
      .sort((a, b) => a.mois.localeCompare(b.mois))

    // ─── Students at risk: avg < 8/20 across their exams ───
    const studentsAtRisk = Array.from(studentMap.values())
      .filter((stu) => stu.countScore > 0 && stu.sumScore / stu.countScore < 8)
      .map((stu) => ({
        etudiantId: stu.etudiantId,
        etudiantName: stu.etudiantName,
        etudiantEmail: stu.etudiantEmail,
        nbExamens: stu.examIds.size,
        moyenne: Math.round((stu.sumScore / stu.countScore) * 100) / 100,
        derniereNote: Math.round(stu.derniereNote * 100) / 100,
      }))
      .sort((a, b) => a.moyenne - b.moyenne)
      .slice(0, 50) // Cap at 50 to keep payload reasonable

    // ─── Top questions: lowest success rate, top 10 ───
    const topQuestions = Array.from(questionAgg.values())
      .filter((q) => q.count > 0)
      .map((q) => ({
        epreuveId: q.epreuveId,
        epreuveTitre: q.epreuveTitre,
        questionIndex: q.questionIndex,
        enonce: q.enonce,
        type: q.type,
        tauxReussite: Math.round((q.sumRatio / q.count) * 1000) / 10, // %
        count: q.count,
      }))
      .sort((a, b) => a.tauxReussite - b.tauxReussite)
      .slice(0, 10)

    // ─── Global stats (normalized to /20) ───
    const globalMoyenne =
      allNormalizedScores.length > 0
        ? Math.round(
            (allNormalizedScores.reduce((a, b) => a + b, 0) /
              allNormalizedScores.length) *
              100
          ) / 100
        : 0
    const globalTauxReussite =
      totalScoredSessions > 0
        ? Math.round((totalReussite / totalScoredSessions) * 100)
        : 0

    return NextResponse.json({
      totalEpreuves: epreuves.length,
      totalSessions: sessions.length,
      // RETOURNEE = also fully corrected (teacher clicked "Finaliser" → direct SOUMISE→RETOURNEE)
    totalCorrigees: sessions.filter((s) => s.statut === 'CORRIGEE' || s.statut === 'RETOURNEE').length,
      globalMoyenne,
      globalTauxReussite,
      epreuves: epreuvesOut,
      evolution,
      studentsAtRisk,
      topQuestions,
    })
  } catch (error) {
    console.error('Overview error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'aperçu des résultats" },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ENSEIGNANT', 'ADMIN'])
