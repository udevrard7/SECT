// ─────────────────────────────────────────────────────────────
// GET /api/resultats/etudiant-overview
// Analytics cross-exam pour l'étudiant connecté.
// Retourne : KPIs globaux, évolution 12 mois, performance par type
// de question, distribution des notes, et résultats récents.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

async function _GET(
  _request: Request,
  context: { params: Record<string, string | string[]>; user: AuthenticatedUser }
) {
  try {
    const { user } = context

    if (user.role !== 'ETUDIANT') {
      return NextResponse.json(
        { error: 'Réservé aux étudiants' },
        { status: 403 }
      )
    }

    // ─── Toutes les sessions de l'étudiant (soumises / corrigées / retournées) ───
    const sessions = await db.sessionPassation.findMany({
      where: {
        etudiantId: user.id,
        statut: { in: ['SOUMISE', 'CORRIGEE', 'RETOURNEE'] },
      },
      include: {
        epreuve: {
          select: {
            id: true,
            titre: true,
            noteTotal: true,
            dateFin: true,
            enseignant: { select: { name: true } },
            questions: {
              include: {
                question: { select: { id: true, type: true, enonce: true } },
              },
              orderBy: { ordre: 'asc' },
            },
          },
        },
        reponses: { select: { questionId: true, score: true, contenu: true } },
        resultat: true,
      },
      orderBy: { dateFin: 'desc' },
    })

    if (sessions.length === 0) {
      return NextResponse.json(emptyOverview())
    }

    // ─── Normalisation des scores vers /20 ───
    type Scored = {
      session: (typeof sessions)[number]
      rawScore: number
      noteTotal: number
      scoreOn20: number
      pct: number
      isCorrected: boolean
      isReturned: boolean
    }

    const scored: Scored[] = sessions.map((session) => {
      const rawScore = session.resultat?.scoreFinal ?? session.score ?? 0
      const noteTotal = session.epreuve.noteTotal || session.resultat?.totalPossible || 20
      const scoreOn20 = noteTotal > 0 ? (rawScore / noteTotal) * 20 : 0
      const pct = noteTotal > 0 ? Math.round((rawScore / noteTotal) * 100) : 0
      return {
        session,
        rawScore,
        noteTotal,
        scoreOn20,
        pct,
        isCorrected: session.statut === 'CORRIGEE',
        isReturned: session.statut === 'RETOURNEE',
      }
    })

    // ─── KPIs globaux (sur les corrigées/retournées seulement) ───
    const finalised = scored.filter((s) => s.isCorrected || s.isReturned)
    const scoresOn20 = finalised.map((s) => s.scoreOn20).filter((s) => s > 0)
    const moyenne = scoresOn20.length > 0 ? scoresOn20.reduce((a, b) => a + b, 0) / scoresOn20.length : 0
    const best = scoresOn20.length > 0 ? Math.max(...scoresOn20) : 0
    const worst = scoresOn20.length > 0 ? Math.min(...scoresOn20) : 0
    const tauxReussite = scoresOn20.length > 0
      ? Math.round((scoresOn20.filter((s) => s >= 10).length / scoresOn20.length) * 100)
      : 0

    // ─── Évolution sur 12 mois (basée sur dateFin) ───
    const now = new Date()
    const months: { key: string; moyenne: number; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        moyenne: 0,
        count: 0,
      })
    }
    const monthMap = new Map(months.map((m) => [m.key, m]))
    const monthSums = new Map<string, { sum: number; count: number }>()

    finalised.forEach((s) => {
      if (!s.session.dateFin) return
      const d = new Date(s.session.dateFin)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const entry = monthMap.get(key)
      if (!entry) return
      const acc = monthSums.get(key) ?? { sum: 0, count: 0 }
      acc.sum += s.scoreOn20
      acc.count += 1
      monthSums.set(key, acc)
    })

    const evolution = months.map((m) => {
      const acc = monthSums.get(m.key)
      return {
        mois: m.key,
        moyenne: acc && acc.count > 0 ? Math.round((acc.sum / acc.count) * 10) / 10 : 0,
        count: acc?.count ?? 0,
      }
    })

    // ─── Performance par type de question ───
    type TypeAcc = { sum: number; count: number }
    const typeMap = new Map<string, TypeAcc>()
    finalised.forEach((s) => {
      const eqs = s.session.epreuve.questions ?? []
      eqs.forEach((eq) => {
        const type = eq.question.type
        const reponse = s.session.reponses.find((r) => r.questionId === eq.questionId)
        if (reponse?.score !== null && reponse?.score !== undefined && eq.bareme > 0) {
          const acc = typeMap.get(type) ?? { sum: 0, count: 0 }
          acc.sum += (reponse.score / eq.bareme) * 20
          acc.count += 1
          typeMap.set(type, acc)
        }
      })
    })

    const performanceParType = Array.from(typeMap.entries())
      .map(([type, acc]) => ({
        type,
        moyenne: acc.count > 0 ? Math.round((acc.sum / acc.count) * 10) / 10 : 0,
        count: acc.count,
      }))
      .sort((a, b) => b.moyenne - a.moyenne)

    // ─── Distribution des notes (7 tranches /20) ───
    const distributionBins = [
      { label: '0-4', min: 0, max: 4 },
      { label: '4-8', min: 4, max: 8 },
      { label: '8-10', min: 8, max: 10 },
      { label: '10-12', min: 10, max: 12 },
      { label: '12-14', min: 12, max: 14 },
      { label: '14-16', min: 14, max: 16 },
      { label: '16-20', min: 16, max: 20.01 },
    ].map((b) => ({ label: b.label, count: 0, min: b.min, max: b.max }))

    scoresOn20.forEach((s) => {
      for (const bin of distributionBins) {
        if (s >= bin.min && s < bin.max) {
          bin.count++
          break
        }
      }
    })

    // ─── Résultats récents (5 derniers) ───
    const recentResults = scored.slice(0, 5).map((s) => ({
      id: s.session.id,
      epreuveId: s.session.epreuve.id,
      titre: s.session.epreuve.titre,
      enseignant: s.session.epreuve.enseignant?.name ?? '',
      statut: s.session.statut,
      score: s.rawScore,
      noteTotal: s.noteTotal,
      scoreOn20: Math.round(s.scoreOn20 * 10) / 10,
      percentage: s.pct,
      dateFin: s.session.dateFin,
      dateDebut: s.session.dateDebut,
      isCorrected: s.isCorrected,
      isReturned: s.isReturned,
    }))

    // ─── Progression (comparaison 3 derniers vs 3 précédents) ───
    const chronological = [...finalised].reverse() // oldest first
    const recent3 = chronological.slice(-3)
    const previous3 = chronological.slice(-6, -3)
    const recentAvg = recent3.length > 0 ? recent3.reduce((a, b) => a + b.scoreOn20, 0) / recent3.length : 0
    const previousAvg = previous3.length > 0 ? previous3.reduce((a, b) => a + b.scoreOn20, 0) / previous3.length : 0
    const tendance = previous3.length > 0 ? Math.round((recentAvg - previousAvg) * 10) / 10 : 0

    return NextResponse.json({
      totalEpreuves: sessions.length,
      totalCorrigees: finalised.length,
      moyenneGenerale: Math.round(moyenne * 10) / 10,
      meilleureNote: Math.round(best * 10) / 10,
      moinsBonneNote: Math.round(worst * 10) / 10,
      tauxReussite,
      tendance, // positif = progression, négatif = régression
      evolution,
      performanceParType,
      distribution: distributionBins.map((b) => ({ label: b.label, count: b.count })),
      recentResults,
    })
  } catch (error) {
    console.error('Get etudiant overview error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des analytics' },
      { status: 500 }
    )
  }
}

function emptyOverview() {
  return {
    totalEpreuves: 0,
    totalCorrigees: 0,
    moyenneGenerale: 0,
    meilleureNote: 0,
    moinsBonneNote: 0,
    tauxReussite: 0,
    tendance: 0,
    evolution: [],
    performanceParType: [],
    distribution: [],
    recentResults: [],
  }
}

export const GET = withAuth(_GET, ['ETUDIANT'])
