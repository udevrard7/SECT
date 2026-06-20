import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { computeAllBadges, getUserBadgesFromDB } from '@/lib/badges-engine'

/**
 * GET /api/badges
 * Récupère les badges de l'utilisateur connecté avec progression.
 * Query params:
 *   - refresh=true : Force le recalcul complet des badges (plus lent mais à jour)
 *   - Par défaut : Lit les badges depuis la DB (rapide)
 */
async function _GET(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    const userId = context.user.id
    const role = context.user.role
    const etablissementId = context.user.etablissementId ?? null
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true'

    let badges
    if (refresh) {
      // Recalcul complet des badges (à appeler après une action significative)
      badges = await computeAllBadges(userId, role, etablissementId)
    } else {
      // Lecture rapide depuis la DB
      badges = await getUserBadgesFromDB(userId, role)
    }

    // Statistiques globales
    const totalBadges = badges.length
    const unlockedBadges = badges.filter(b => b.debloque).length
    const newBadges = badges.filter(b => b.isNewlyUnlocked)

    return NextResponse.json({
      badges,
      stats: {
        total: totalBadges,
        unlocked: unlockedBadges,
        locked: totalBadges - unlockedBadges,
        progress: totalBadges > 0 ? Math.round((unlockedBadges / totalBadges) * 100) : 0,
      },
      newlyUnlocked: newBadges,
    })
  } catch (error) {
    console.error('Badges API error:', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des badges' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/badges
 * Force le recalcul des badges après une action.
 * Body: { action: string } (optionnel, pour logging)
 */
async function _POST(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    const userId = context.user.id
    const role = context.user.role
    const etablissementId = context.user.etablissementId ?? null

    const badges = await computeAllBadges(userId, role, etablissementId)
    const newBadges = badges.filter(b => b.isNewlyUnlocked)

    return NextResponse.json({
      badges,
      stats: {
        total: badges.length,
        unlocked: badges.filter(b => b.debloque).length,
        locked: badges.filter(b => !b.debloque).length,
        progress: badges.length > 0 ? Math.round((badges.filter(b => b.debloque).length / badges.length) * 100) : 0,
      },
      newlyUnlocked: newBadges,
    })
  } catch (error) {
    console.error('Badges refresh error:', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    return NextResponse.json(
      { error: 'Erreur lors du recalcul des badges' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
