import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

/**
 * GET /api/exam-prep/dashboard
 *
 * Tableau de bord de progression du module Préparation aux examens
 * (spécifique à chaque document si ?documentId fourni, sinon global).
 *
 * Renvoie :
 *  - scoreMoyen : moyenne des PracticeAttempt.score (0..1)
 *  - totalAttempts : nombre total de tentatives
 *  - tauxReussite : % d'attempts correct=true
 *  - lacunesParChapitre : [{ chapterId, titre, avgScore, attempts }]
 *    (chapitres avec avgScore < 0.5 = lacunes détectées)
 *  - tempsRevision : somme des dureeSec des PracticeAttempt
 *  - sessionsAVenir : StudySession PLANIFIEE à venir (count + 5 prochaines)
 *  - itemsSrs : { total, dusAujourd'hui, masterisés, avgMastery }
 *  - evolution : moyenne mensuelle des attempts (6 derniers mois)
 */
async function _GET(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    const attemptWhere = {
      userId: user.id,
      ...(documentId ? { documentId } : {}),
    }

    // ─── PracticeAttempt agrégats ───
    const attempts = await withRetry(() =>
      db.practiceAttempt.findMany({
        where: attemptWhere,
        select: { questionId: true, score: true, correct: true, dureeSec: true, chapterId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500, // limite perf
      })
    )

    const totalAttempts = attempts.length

    // ─── Questions distinctes tentées (un étudiant peut refaire une question) ───
    // Le KPI « Questions répondues » compte le nombre de questions uniques,
    // pas le nombre total de tentatives (qui peut être > si l'étudiant
    // refait une question plusieurs fois).
    const uniqueQuestionIds = new Set(attempts.map((a) => a.questionId))

    const scoreMoyen = totalAttempts > 0
      ? attempts.reduce((s, a) => s + (a.score ?? 0), 0) / totalAttempts
      : 0
    const tauxReussite = totalAttempts > 0
      ? attempts.filter((a) => a.correct).length / totalAttempts
      : 0
    const tempsRevision = attempts.reduce((s, a) => s + (a.dureeSec ?? 0), 0)

    // ─── Lacunes par chapitre ───
    const byChapter = new Map<string, { scores: number[]; attempts: number }>()
    for (const a of attempts) {
      if (!a.chapterId) continue
      const entry = byChapter.get(a.chapterId) ?? { scores: [], attempts: 0 }
      entry.scores.push(a.score ?? 0)
      entry.attempts += 1
      byChapter.set(a.chapterId, entry)
    }

    const chapterIds = Array.from(byChapter.keys())
    const chapters = chapterIds.length > 0
      ? await withRetry(() =>
          db.chapter.findMany({
            where: { id: { in: chapterIds } },
            select: { id: true, titre: true, ordre: true },
          })
        )
      : []

    const lacunesParChapitre = chapterIds.map((cid) => {
      const entry = byChapter.get(cid)!
      const avg = entry.scores.reduce((s, v) => s + v, 0) / entry.scores.length
      const chapter = chapters.find((c) => c.id === cid)
      return {
        chapterId: cid,
        titre: chapter?.titre ?? '—',
        ordre: chapter?.ordre ?? 0,
        avgScore: Math.round(avg * 100) / 100,
        attempts: entry.attempts,
        lacune: avg < 0.5,
      }
    }).sort((a, b) => a.avgScore - b.avgScore)

    // ─── Sessions à venir ───
    const sessionsAVenir = await withRetry(() =>
      db.studySession.findMany({
        where: {
          userId: user.id,
          statut: 'PLANIFIEE',
          dateDebut: { gte: new Date() },
          ...(documentId ? { documentId } : {}),
        },
        orderBy: { dateDebut: 'asc' },
        take: 5,
        select: { id: true, titre: true, dateDebut: true, dureeMin: true, documentId: true },
      })
    )

    // ─── SRS items ───
    const srsItems = await withRetry(() =>
      db.reviewItem.findMany({
        where: {
          userId: user.id,
          ...(documentId ? { chapter: { documentId } } : {}),
        },
        select: { masteryLevel: true, nextReviewAt: true },
      })
    )

    const now = new Date()
    const itemsSrs = {
      total: srsItems.length,
      dusAujourdHui: srsItems.filter((i) => i.nextReviewAt <= now).length,
      masterises: srsItems.filter((i) => i.masteryLevel >= 0.7).length,
      avgMastery: srsItems.length > 0
        ? Math.round((srsItems.reduce((s, i) => s + i.masteryLevel, 0) / srsItems.length) * 100) / 100
        : 0,
    }

    // ─── Évolution mensuelle (6 derniers mois) ───
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const evolution = attempts
      .filter((a) => a.createdAt >= sixMonthsAgo)
      .reduce((acc, a) => {
        const key = `${a.createdAt.getFullYear()}-${String(a.createdAt.getMonth() + 1).padStart(2, '0')}`
        const entry = acc.get(key) ?? { mois: key, scores: [] as number[] }
        entry.scores.push(a.score ?? 0)
        acc.set(key, entry)
        return acc
      }, new Map<string, { mois: string; scores: number[] }>())

    const evolutionData = Array.from(evolution.values())
      .map((e) => ({
        mois: e.mois,
        moyenne: Math.round((e.scores.reduce((s, v) => s + v, 0) / e.scores.length) * 100) / 100,
        count: e.scores.length,
      }))
      .sort((a, b) => a.mois.localeCompare(b.mois))

    return NextResponse.json({
      scoreMoyen: Math.round(scoreMoyen * 100) / 100,
      totalAttempts,
      uniqueQuestionsCount: uniqueQuestionIds.size,
      tauxReussite: Math.round(tauxReussite * 100),
      tempsRevisionSec: tempsRevision,
      lacunesParChapitre,
      sessionsAVenir,
      itemsSrs,
      evolution: evolutionData,
    })
  } catch (error) {
    console.error('[exam-prep/dashboard] GET error:', error)
    return NextResponse.json({ error: 'Erreur lors du chargement du tableau de bord' }, { status: 500 })
  }
}

export const GET = withAuth(_GET, ['ETUDIANT'])
