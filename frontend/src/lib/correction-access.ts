import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminEtablissementAccess } from '@/lib/tenant-access'
import type { AuthenticatedUser } from '@/lib/auth-session'

/**
 * Vérifie qu'un utilisateur peut accéder aux ressources de correction
 * (épreuves / sessions / devoirs) appartenant à un enseignant donné.
 *
 * Règles :
 * - ENSEIGNANT : doit être propriétaire (enseignantId === user.id)
 * - RESPONSABLE : doit partager le même établissement que l'enseignant
 * - ADMIN : doit avoir un EtablissementAccess pour l'établissement de l'enseignant
 * - Tout autre rôle : refusé
 *
 * @returns null si autorisé, sinon une NextResponse d'erreur (403).
 */
export async function verifyCorrectionOwnership(
  user: AuthenticatedUser,
  enseignantId: string
): Promise<NextResponse | null> {
  // ENSEIGNANT : doit posséder la ressource
  if (user.role === 'ENSEIGNANT') {
    if (enseignantId !== user.id) {
      return NextResponse.json(
        { error: "Accès refusé. Vous ne pouvez accéder qu'à vos propres corrections." },
        { status: 403 }
      )
    }
    return null
  }

  // RESPONSABLE : même établissement que l'enseignant
  if (user.role === 'RESPONSABLE') {
    const teacher = await db.user.findUnique({
      where: { id: enseignantId },
      select: { etablissementId: true },
    })
    if (teacher?.etablissementId && teacher.etablissementId !== user.etablissementId) {
      return NextResponse.json(
        { error: "Accès refusé. Vous ne pouvez voir les corrections que des enseignants de votre établissement." },
        { status: 403 }
      )
    }
    return null
  }

  // ADMIN : doit avoir EtablissementAccess pour l'établissement de l'enseignant
  if (user.role === 'ADMIN') {
    const teacher = await db.user.findUnique({
      where: { id: enseignantId },
      select: { etablissementId: true },
    })
    if (teacher?.etablissementId) {
      const accessError = await requireAdminEtablissementAccess(user, teacher.etablissementId)
      if (accessError) return accessError
    }
    return null
  }

  // Tout autre rôle (ETUDIANT, etc.) — non autorisé sur la correction
  return NextResponse.json(
    { error: 'Accès refusé. Rôle non autorisé pour la correction.' },
    { status: 403 }
  )
}
