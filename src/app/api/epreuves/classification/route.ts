import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { requireAdminEtablissementAccess } from '@/lib/tenant-access'

// ─── Types for classification response ───

interface ByNiveau {
  niveau: string
  count: number
}

interface ByFiliere {
  filiereId: string
  filiereNom: string
  filiereCode: string | null
  count: number
  byNiveau: ByNiveau[]
}

interface ByNiveauAgg {
  niveau: string
  count: number
}

interface BySessionExamen {
  sessionExamen: string
  count: number
}

interface ByAnneeAcademique {
  anneeAcademiqueId: string
  libelle: string
  count: number
}

interface ByUniteEnseignement {
  ueId: string
  ueCode: string
  ueNom: string
  count: number
}

interface ByStatut {
  statut: string
  count: number
}

interface TreeEpreuve {
  id: string
  titre: string
  statut: string
  sessionExamen: string
  dateDebut: Date | string
  dateFin: Date | string
  duree: number
  noteTotal: number
  enseignantNom: string | null
}

interface TreeUE {
  ueId: string | null
  ueCode: string | null
  ueNom: string | null
  count: number
  epreuves: TreeEpreuve[]
}

interface TreeNiveau {
  niveau: string | null
  count: number
  byUE: TreeUE[]
}

interface TreeFiliere {
  filiereId: string | null
  filiereNom: string | null
  filiereCode: string | null
  count: number
  byNiveau: TreeNiveau[]
}

interface ClassificationResponse {
  byFiliere: ByFiliere[]
  byNiveau: ByNiveauAgg[]
  bySessionExamen: BySessionExamen[]
  byAnneeAcademique: ByAnneeAcademique[]
  byUniteEnseignement: ByUniteEnseignement[]
  byStatut: ByStatut[]
  tree: TreeFiliere[]
  uncategorizedCount: number
  totalCount: number
}

async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const responsableId = searchParams.get('responsableId')

    // ─── Build the base where clause with tenant scoping ───
    // Same logic as /api/epreuves/route.ts GET handler

    // ADMIN: must specify a scope
    if (user.role === 'ADMIN' && !enseignantId && !responsableId) {
      return NextResponse.json(
        { error: 'Vous devez spécifier un scope (enseignantId ou responsableId)' },
        { status: 400 }
      )
    }

    // ENSEIGNANT: must use their own ID
    if (user.role === 'ENSEIGNANT') {
      if (enseignantId && enseignantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez accéder qu\'à vos propres épreuves.' },
          { status: 403 }
        )
      }
    }

    // ADMIN: verify access when specific IDs are provided
    if (user.role === 'ADMIN' && responsableId) {
      const responsable = await db.user.findUnique({
        where: { id: responsableId },
        select: { etablissementId: true },
      })
      if (responsable?.etablissementId) {
        const accessError = await requireAdminEtablissementAccess(user, responsable.etablissementId)
        if (accessError) return accessError
      }
    }

    if (user.role === 'ADMIN' && enseignantId) {
      const teacher = await db.user.findUnique({
        where: { id: enseignantId },
        select: { etablissementId: true },
      })
      if (teacher?.etablissementId) {
        const accessError = await requireAdminEtablissementAccess(user, teacher.etablissementId)
        if (accessError) return accessError
      }
    }

    // ─── Fetch epreuves based on scope ───
    let epreuveIds: string[] = []

    if (responsableId) {
      // RESPONSABLE mode: fetch epreuves for all filières managed by this responsable
      const responsableFilieres = await db.filiere.findMany({
        where: { responsableId },
        select: { id: true, etablissementId: true },
      })

      if (responsableFilieres.length === 0) {
        return NextResponse.json(buildEmptyResponse())
      }

      const etablissementId = responsableFilieres[0].etablissementId

      // RESPONSABLE: verify they can only query their own filieres
      if (user.role === 'RESPONSABLE' && user.etablissementId !== etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez accéder qu\'aux épreuves de votre établissement.' },
          { status: 403 }
        )
      }

      const allFiliereIds = responsableFilieres.map((f) => f.id)

      // Use OR condition matching the existing pattern
      const epreuves = await db.epreuve.findMany({
        where: {
          deletedAt: null,
          OR: [
            { sessions: { some: { etudiant: { filiereId: { in: allFiliereIds } } } } },
            { enseignant: { etablissementId } },
          ],
        },
        select: { id: true },
      })

      // Deduplicate
      const seen = new Set<string>()
      epreuveIds = epreuves.filter((e) => {
        if (seen.has(e.id)) return false
        seen.add(e.id)
        return true
      }).map((e) => e.id)
    } else if (enseignantId || user.role === 'ENSEIGNANT') {
      // ENSEIGNANT mode: scope to the teacher's epreuves
      const targetEnseignantId = enseignantId || user.id
      const epreuves = await db.epreuve.findMany({
        where: { enseignantId: targetEnseignantId, deletedAt: null },
        select: { id: true },
      })
      epreuveIds = epreuves.map((e) => e.id)
    } else {
      // ADMIN with no scope — already returned 400 above
      return NextResponse.json(
        { error: 'Vous devez spécifier un scope (enseignantId ou responsableId)' },
        { status: 400 }
      )
    }

    if (epreuveIds.length === 0) {
      return NextResponse.json(buildEmptyResponse())
    }

    // ─── Fetch all classification-relevant data for the scoped epreuves ───
    const epreuves = await db.epreuve.findMany({
      where: {
        id: { in: epreuveIds },
        deletedAt: null,
      },
      select: {
        id: true,
        titre: true,
        statut: true,
        sessionExamen: true,
        dateDebut: true,
        dateFin: true,
        duree: true,
        noteTotal: true,
        niveau: true,
        filiereId: true,
        uniteEnseignementId: true,
        anneeAcademiqueId: true,
        enseignant: {
          select: { name: true },
        },
        filiere: {
          select: { id: true, nom: true, code: true },
        },
        uniteEnseignement: {
          select: { id: true, code: true, nom: true },
        },
        anneeAcademique: {
          select: { id: true, libelle: true },
        },
      },
    })

    // ─── Build aggregated statistics ───
    const totalCount = epreuves.length

    // By filière
    const filiereMap = new Map<string, {
      filiereId: string
      filiereNom: string
      filiereCode: string | null
      count: number
      niveauMap: Map<string, number>
    }>()

    for (const e of epreuves) {
      const key = e.filiereId || '__NONE__'
      if (!filiereMap.has(key)) {
        filiereMap.set(key, {
          filiereId: e.filiereId || '__NONE__',
          filiereNom: e.filiere?.nom || 'Non classée',
          filiereCode: e.filiere?.code || null,
          count: 0,
          niveauMap: new Map<string, number>(),
        })
      }
      const entry = filiereMap.get(key)!
      entry.count++
      const niveauKey = e.niveau || '__NONE__'
      entry.niveauMap.set(niveauKey, (entry.niveauMap.get(niveauKey) || 0) + 1)
    }

    const byFiliere: ByFiliere[] = Array.from(filiereMap.values()).map((f) => ({
      filiereId: f.filiereId,
      filiereNom: f.filiereNom,
      filiereCode: f.filiereCode,
      count: f.count,
      byNiveau: Array.from(f.niveauMap.entries()).map(([niveau, count]) => ({
        niveau: niveau === '__NONE__' ? 'NON_DEFINI' : niveau,
        count,
      })).sort((a, b) => a.niveau.localeCompare(b.niveau)),
    })).sort((a, b) => b.count - a.count)

    // By niveau
    const niveauMap = new Map<string, number>()
    for (const e of epreuves) {
      const key = e.niveau || 'NON_DEFINI'
      niveauMap.set(key, (niveauMap.get(key) || 0) + 1)
    }
    const byNiveau: ByNiveauAgg[] = Array.from(niveauMap.entries()).map(([niveau, count]) => ({
      niveau,
      count,
    })).sort((a, b) => a.niveau.localeCompare(b.niveau))

    // By sessionExamen
    const sessionMap = new Map<string, number>()
    for (const e of epreuves) {
      const key = e.sessionExamen
      sessionMap.set(key, (sessionMap.get(key) || 0) + 1)
    }
    const bySessionExamen: BySessionExamen[] = Array.from(sessionMap.entries()).map(([sessionExamen, count]) => ({
      sessionExamen,
      count,
    })).sort((a, b) => b.count - a.count)

    // By anneeAcademique
    const anneeMap = new Map<string, { anneeAcademiqueId: string; libelle: string; count: number }>()
    for (const e of epreuves) {
      const key = e.anneeAcademiqueId || '__NONE__'
      if (!anneeMap.has(key)) {
        anneeMap.set(key, {
          anneeAcademiqueId: e.anneeAcademiqueId || '__NONE__',
          libelle: e.anneeAcademique?.libelle || 'Non définie',
          count: 0,
        })
      }
      anneeMap.get(key)!.count++
    }
    const byAnneeAcademique: ByAnneeAcademique[] = Array.from(anneeMap.values())
      .sort((a, b) => b.count - a.count)

    // By uniteEnseignement
    const ueMap = new Map<string, { ueId: string; ueCode: string; ueNom: string; count: number }>()
    for (const e of epreuves) {
      const key = e.uniteEnseignementId || '__NONE__'
      if (!ueMap.has(key)) {
        ueMap.set(key, {
          ueId: e.uniteEnseignementId || '__NONE__',
          ueCode: e.uniteEnseignement?.code || 'N/A',
          ueNom: e.uniteEnseignement?.nom || 'Non classée',
          count: 0,
        })
      }
      ueMap.get(key)!.count++
    }
    const byUniteEnseignement: ByUniteEnseignement[] = Array.from(ueMap.values())
      .sort((a, b) => b.count - a.count)

    // By statut
    const statutMap = new Map<string, number>()
    for (const e of epreuves) {
      const key = e.statut
      statutMap.set(key, (statutMap.get(key) || 0) + 1)
    }
    const byStatut: ByStatut[] = Array.from(statutMap.entries()).map(([statut, count]) => ({
      statut,
      count,
    })).sort((a, b) => b.count - a.count)

    // Uncategorised count (no filiereId)
    const uncategorizedCount = epreuves.filter((e) => !e.filiereId).length

    // ─── Build tree structure: Filière > Niveau > UE > Epreuves ───
    const treeMap = new Map<string, TreeFiliere>()

    for (const e of epreuves) {
      const filiereKey = e.filiereId || '__NONE__'
      if (!treeMap.has(filiereKey)) {
        treeMap.set(filiereKey, {
          filiereId: e.filiereId || null,
          filiereNom: e.filiere?.nom || 'Non classée',
          filiereCode: e.filiere?.code || null,
          count: 0,
          byNiveau: [],
        })
      }
      const filiereNode = treeMap.get(filiereKey)!
      filiereNode.count++

      // Find or create niveau node
      let niveauNode = filiereNode.byNiveau.find((n) => n.niveau === (e.niveau || null))
      if (!niveauNode) {
        niveauNode = {
          niveau: e.niveau || null,
          count: 0,
          byUE: [],
        }
        filiereNode.byNiveau.push(niveauNode)
      }
      niveauNode.count++

      // Find or create UE node
      let ueNode = niveauNode.byUE.find((u) => u.ueId === (e.uniteEnseignementId || null))
      if (!ueNode) {
        ueNode = {
          ueId: e.uniteEnseignementId || null,
          ueCode: e.uniteEnseignement?.code || null,
          ueNom: e.uniteEnseignement?.nom || null,
          count: 0,
          epreuves: [],
        }
        niveauNode.byUE.push(ueNode)
      }
      ueNode.count++

      // Add epreuve to the UE node
      ueNode.epreuves.push({
        id: e.id,
        titre: e.titre,
        statut: e.statut,
        sessionExamen: e.sessionExamen,
        dateDebut: e.dateDebut,
        dateFin: e.dateFin,
        duree: e.duree,
        noteTotal: e.noteTotal,
        enseignantNom: e.enseignant?.name || null,
      })
    }

    // Sort the tree
    const tree: TreeFiliere[] = Array.from(treeMap.values())
      .sort((a, b) => {
        // "Non classée" goes last
        if (!a.filiereId) return 1
        if (!b.filiereId) return -1
        return b.count - a.count
      })
      .map((f) => ({
        ...f,
        byNiveau: f.byNiveau
          .sort((a, b) => {
            // Sort null niveau last
            if (a.niveau === null) return 1
            if (b.niveau === null) return -1
            return a.niveau.localeCompare(b.niveau)
          })
          .map((n) => ({
            ...n,
            byUE: n.byUE
              .sort((a, b) => {
                // Sort null UE last
                if (!a.ueId) return 1
                if (!b.ueId) return -1
                return b.count - a.count
              })
              .map((u) => ({
                ...u,
                epreuves: u.epreuves.sort(
                  (a, b) => new Date(b.dateDebut).getTime() - new Date(a.dateDebut).getTime()
                ),
              })),
          })),
      }))

    const response: ClassificationResponse = {
      byFiliere,
      byNiveau,
      bySessionExamen,
      byAnneeAcademique,
      byUniteEnseignement,
      byStatut,
      tree,
      uncategorizedCount,
      totalCount,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Classification epreuves error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques de classification' },
      { status: 500 }
    )
  }
}

function buildEmptyResponse(): ClassificationResponse {
  return {
    byFiliere: [],
    byNiveau: [],
    bySessionExamen: [],
    byAnneeAcademique: [],
    byUniteEnseignement: [],
    byStatut: [],
    tree: [],
    uncategorizedCount: 0,
    totalCount: 0,
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
