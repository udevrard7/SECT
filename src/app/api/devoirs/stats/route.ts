import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import type { DevoirStats } from '@/lib/devoirs-types'

/**
 * GET /api/devoirs/stats — KPIs agrégés pour l'enseignant connecté
 * Calcule : total devoirs par statut, soumissions (total/en attente/corrigées),
 * répartition par type de séance, timeline 7 jours, moyenne notes.
 */
async function _GET(
  _request: NextRequest,
  context: { params: Record<string, string>; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const enseignantId = user.id

    // ─── Devoirs de l'enseignant (non supprimés) ───
    const devoirs = await db.devoir.findMany({
      where: { enseignantId, deletedAt: null },
      select: {
        id: true,
        statut: true,
        typeSeance: true,
        dateLimite: true,
        _count: { select: { Soumission: true } },
      },
    })

    const brouillons = devoirs.filter((d) => d.statut === 'BROUILLON').length
    const publies = devoirs.filter((d) => d.statut === 'PUBLIE').length
    const fermes = devoirs.filter((d) => d.statut === 'FERME').length
    const archives = devoirs.filter((d) => d.statut === 'ARCHIVE').length

    // Devoirs en retard = dateLimite dépassée + pas ARCHIVE
    const now = new Date()
    const enRetard = devoirs.filter(
      (d) => new Date(d.dateLimite) < now && d.statut !== 'ARCHIVE'
    ).length

    // ─── Soumissions de ces devoirs ───
    const devoirIds = devoirs.map((d) => d.id)
    const soumissions = devoirIds.length
      ? await db.soumission.findMany({
          where: { devoirId: { in: devoirIds } },
          select: { id: true, statut: true, note: true, renduAt: true },
        })
      : []

    const totalSoumissions = soumissions.length
    const soumissionsEnAttente = soumissions.filter(
      (s) => s.statut === 'SOUMIS'
    ).length
    const soumissionsCorrigees = soumissions.filter(
      (s) => s.statut === 'CORRIGE' || s.statut === 'RETOURNE'
    ).length

    // Moyenne des notes attribuées
    const notesValides = soumissions
      .map((s) => s.note)
      .filter((n): n is number => n !== null && n !== undefined)
    const moyenneNotes =
      notesValides.length > 0
        ? notesValides.reduce((sum, n) => sum + n, 0) / notesValides.length
        : null

    // ─── Répartition par type de séance ───
    const typeMap: Record<string, number> = {}
    for (const d of devoirs) {
      typeMap[d.typeSeance] = (typeMap[d.typeSeance] || 0) + 1
    }
    const typeLabels: Record<string, string> = {
      CM: 'Cours magistral',
      TD: 'Travail dirigé',
      TP: 'Travaux pratiques',
    }
    const byType = Object.entries(typeMap).map(([type, count]) => ({
      type,
      count,
      label: typeLabels[type] || type,
    }))

    // ─── Soumissions par statut ───
    const soumissionStatutMap: Record<string, number> = {}
    for (const s of soumissions) {
      soumissionStatutMap[s.statut] = (soumissionStatutMap[s.statut] || 0) + 1
    }
    const soumissionStatutLabels: Record<string, string> = {
      BROUILLON: 'Brouillon',
      SOUMIS: 'En attente',
      CORRIGE: 'Corrigé',
      RETOURNE: 'Rendu',
    }
    const soumissionsByStatut = Object.entries(soumissionStatutMap).map(
      ([statut, count]) => ({
        statut,
        count,
        label: soumissionStatutLabels[statut] || statut,
      })
    )

    // ─── Timeline 7 derniers jours (soumissions reçues) ───
    const timeline: DevoirStats['timeline'] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now)
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - i)
      const nextDay = new Date(day)
      nextDay.setDate(nextDay.getDate() + 1)

      const count = soumissions.filter((s) => {
        if (!s.renduAt) return false
        const d = new Date(s.renduAt)
        return d >= day && d < nextDay
      }).length

      timeline.push({
        date: day.toISOString().slice(0, 10),
        soumissions: count,
      })
    }

    const stats: DevoirStats = {
      kpis: {
        total: devoirs.length,
        brouillons,
        publies,
        fermes,
        archives,
        totalSoumissions,
        soumissionsEnAttente,
        soumissionsCorrigees,
        enRetard,
      },
      byType,
      soumissionsByStatut,
      timeline,
      moyenneNotes: moyenneNotes !== null ? Math.round(moyenneNotes * 100) / 100 : null,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Devoirs stats error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du calcul des statistiques' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ENSEIGNANT'])
