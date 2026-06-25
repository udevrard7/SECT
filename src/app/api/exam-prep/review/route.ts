import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { requireStudentScope, isChapterAccessible } from '@/lib/exam-prep/scope'

/**
 * Spaced repetition (ReviewItem).
 *
 * GET /api/exam-prep/review
 *     Liste les chapitres à réviser aujourd'hui (nextReviewAt <= now)
 *     + statistiques de maîtrise globales.
 *     Filtre optionnel : ?documentId=... pour se limiter à un document.
 *
 * POST /api/exam-prep/review
 *     Marque un chapitre comme « révisé maintenant » (réinitialise
 *     nextReviewAt à today + interval courant, sans changer le score —
 *     le score est géré par /practice/[id]/submit). Sert pour les
 *     sessions de révision flashcards/lecture où il n'y a pas de
 *     PracticeAttempt.
 *     Body : { chapterId: string, quality?: 0..5 (défaut 3) }
 */
async function _GET(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    const now = new Date()

    // Items dus (nextReviewAt <= now)
    const dueItems = await withRetry(() =>
      db.reviewItem.findMany({
        where: {
          userId: user.id,
          nextReviewAt: { lte: now },
          ...(documentId ? { chapter: { documentId } } : {}),
        },
        include: {
          chapter: {
            select: {
              id: true, titre: true, ordre: true,
              document: { select: { id: true, nomFichier: true } },
            },
          },
        },
        orderBy: { nextReviewAt: 'asc' },
      })
    )

    // Stats globales de maîtrise
    const allItems = await withRetry(() =>
      db.reviewItem.findMany({
        where: {
          userId: user.id,
          ...(documentId ? { chapter: { documentId } } : {}),
        },
        select: { masteryLevel: true, interval: true, nextReviewAt: true },
      })
    )

    const totalItems = allItems.length
    const masteredItems = allItems.filter((i) => i.masteryLevel >= 0.7).length
    const avgMastery = totalItems > 0
      ? allItems.reduce((sum, i) => sum + i.masteryLevel, 0) / totalItems
      : 0
    const dueCount = allItems.filter((i) => i.nextReviewAt <= now).length

    return NextResponse.json({
      due: dueItems.map((item) => ({
        id: item.id,
        chapterId: item.chapterId,
        chapterTitle: item.chapter?.titre ?? '—',
        chapterOrder: item.chapter?.ordre ?? 0,
        documentId: item.chapter?.document.id ?? null,
        documentName: item.chapter?.document.nomFichier ?? '—',
        masteryLevel: item.masteryLevel,
        interval: item.interval,
        nextReviewAt: item.nextReviewAt,
      })),
      stats: {
        totalItems,
        masteredItems,
        dueCount,
        avgMastery: Math.round(avgMastery * 100) / 100,
      },
    })
  } catch (error) {
    console.error('[exam-prep/review] GET error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des révisions' }, { status: 500 })
  }
}

interface ReviewBody {
  chapterId: string
  quality?: number // 0..5
}

async function _POST(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context
    const body = (await request.json()) as ReviewBody
    const { chapterId } = body
    const quality = Math.min(Math.max(body.quality ?? 3, 0), 5)

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId est requis' }, { status: 400 })
    }

    const existing = await withRetry(() =>
      db.reviewItem.findUnique({
        where: { userId_chapterId: { userId: user.id, chapterId } },
      })
    )

    if (!existing) {
      // Crée un ReviewItem initial si inexistant (session de lecture/flashcards)
      const interval = quality < 3 ? 1 : 1
      const nextReviewAt = new Date(Date.now() + interval * 86400000)
      const created = await withRetry(() =>
        db.reviewItem.create({
          data: {
            userId: user.id, chapterId,
            interval, easeFactor: 2.5, repetitions: quality >= 3 ? 1 : 0,
            lastReviewedAt: new Date(), nextReviewAt,
            masteryLevel: quality >= 3 ? 0.2 : 0,
          },
        })
      )
      return NextResponse.json({
        reviewItem: {
          nextReviewAt: created.nextReviewAt.toISOString(),
          masteryLevel: created.masteryLevel,
          interval: created.interval,
        },
      })
    }

    // SM-2 update (même logique que practice/[id]/submit)
    let interval: number
    let easeFactor = existing.easeFactor
    let repetitions = existing.repetitions

    if (quality < 3) {
      repetitions = 0
      interval = 1
    } else {
      repetitions += 1
      interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(existing.interval * easeFactor)
    }
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    const masteryDelta = quality >= 4 ? 0.15 : quality >= 3 ? 0.05 : -0.1
    const masteryLevel = Math.min(1, Math.max(0, existing.masteryLevel + masteryDelta))
    const nextReviewAt = new Date(Date.now() + interval * 86400000)

    const updated = await withRetry(() =>
      db.reviewItem.update({
        where: { id: existing.id },
        data: {
          interval, easeFactor, repetitions,
          lastReviewedAt: new Date(), nextReviewAt, masteryLevel,
        },
      })
    )

    return NextResponse.json({
      reviewItem: {
        nextReviewAt: updated.nextReviewAt.toISOString(),
        masteryLevel: updated.masteryLevel,
        interval: updated.interval,
      },
    })
  } catch (error) {
    console.error('[exam-prep/review] POST error:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour de la révision' }, { status: 500 })
  }
}

export const GET = withAuth(_GET, ['ETUDIANT'])
export const POST = withAuth(_POST, ['ETUDIANT'])
