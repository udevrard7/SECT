import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

/**
 * GET /api/enseignant/etudiants
 *
 * Liste les étudiants que l'enseignant connecté peut voir, en fonction
 * des UE qui lui sont affectées (table Affectation) et des couples
 * filière+niveau qu'il couvre (table EnseignantFiliere).
 *
 * Règles de scoping :
 *  - L'enseignant ne voit QUE les étudiants dont la filière + le niveau
 *    correspondent à au moins une de ses EnseignantFiliere, OU dont la
 *    filière correspond ET l'étudiant a passé au moins une épreuve liée
 *    à une UE affectée à l'enseignant (Affectation).
 *  - Aucun étudiant hors établissement n'est visible.
 *  - L'enseignant ne peut ni créer, ni éditer, ni supprimer (lecture seule).
 *
 * Réponse :
 *   { etudiants: [{ id, name, email, matricule, niveau, filiere, nbEpreuves, derniereConnexion }] }
 */
async function _GET(request: NextRequest, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context

    if (user.role !== 'ENSEIGNANT') {
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const filiereId = searchParams.get('filiereId') || ''
    const niveau = searchParams.get('niveau') || ''

    // ─── 1. Récupère les couples (filiereId, niveau) de l'enseignant ───
    // via EnseignantFiliere (affectation large filière+niveau)
    const enseignantFilieres = await withRetry(() =>
      db.enseignantFiliere.findMany({
        where: { enseignantId: user.id },
        select: { filiereId: true, niveau: true },
      })
    )

    // ─── 2. Récupère les UE affectées à l'enseignant (Affectation) ───
    const affectations = await withRetry(() =>
      db.affectation.findMany({
        where: { enseignantId: user.id },
        select: {
          uniteEnseignement: {
            select: { filiereId: true, niveau: true },
          },
        },
        distinct: ['uniteEnseignementId'],
      })
    )

    // Construit l'ensemble des (filiereId, niveau) visibles :
    // union de EnseignantFiliere + filière/niveau des UE affectées
    const visibleScopes = new Set<string>()
    for (const ef of enseignantFilieres) {
      visibleScopes.add(`${ef.filiereId}|${ef.niveau}`)
    }
    for (const aff of affectations) {
      const ue = aff.uniteEnseignement
      if (ue?.filiereId && ue?.niveau) {
        visibleScopes.add(`${ue.filiereId}|${ue.niveau}`)
      }
    }

    if (visibleScopes.size === 0) {
      return NextResponse.json({ etudiants: [] })
    }

    // Construit la clause OR pour Prisma : (filiereId AND niveau) pour chaque scope
    const scopeFilters = Array.from(visibleScopes).map((scope) => {
      const [fid, niv] = scope.split('|')
      return { filiereId: fid, niveau: niv as typeof user.niveau }
    })

    const where: Record<string, unknown> = {
      role: 'ETUDIANT',
      actif: true,
      OR: scopeFilters,
    }

    // Filtres optionnels
    if (filiereId) {
      where.filiereId = filiereId
    }
    if (niveau) {
      where.niveau = niveau as typeof user.niveau
    }
    if (search) {
      where.OR = [
        ...(where.OR as unknown[]),
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { matricule: { contains: search, mode: 'insensitive' } },
      ]
    }

    const etudiants = await withRetry(() =>
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          matricule: true,
          niveau: true,
          derniereConnexion: true,
          filiere: { select: { id: true, nom: true, code: true } },
          _count: {
            select: {
              sessions: {
                where: { statut: { in: ['SOUMISE', 'CORRIGEE', 'RETOURNEE'] } },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
        take: 500, // limite perf
      })
    )

    return NextResponse.json({
      etudiants: etudiants.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        matricule: e.matricule,
        niveau: e.niveau,
        filiere: e.filiere,
        nbEpreuves: e._count.sessions,
        derniereConnexion: e.derniereConnexion,
      })),
    })
  } catch (error) {
    console.error('[enseignant/etudiants] GET error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des étudiants' }, { status: 500 })
  }
}

export const GET = withAuth(_GET, ['ENSEIGNANT'])
