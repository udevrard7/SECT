import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET /api/enseignant/context ───
// Returns the teacher's assigned filières with niveaux and UEs
// Used to auto-populate filière/niveau/UE selectors in epreuve creation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')

    if (!enseignantId) {
      return NextResponse.json(
        { error: 'Identifiant de l\'enseignant requis' },
        { status: 400 }
      )
    }

    // Verify the user exists and is an ENSEIGNANT
    const user = await db.user.findUnique({
      where: { id: enseignantId },
      select: { id: true, role: true },
    })

    if (!user || user.role !== 'ENSEIGNANT') {
      return NextResponse.json(
        { error: 'Enseignant introuvable' },
        { status: 404 }
      )
    }

    // 1. Get EnseignantFiliere assignments (direct filière+niveau links)
    const filiereAssignments = await db.enseignantFiliere.findMany({
      where: { enseignantId },
      include: {
        filiere: {
          select: { id: true, nom: true, code: true },
        },
      },
    })

    // 2. Get Affectation-based assignments (UE → Filiere + Niveau)
    const ueAffectations = await db.affectation.findMany({
      where: { enseignantId },
      include: {
        uniteEnseignement: {
          include: {
            filiere: {
              select: { id: true, nom: true, code: true },
            },
          },
        },
      },
    })

    // 3. Build a structured map of filières with their niveaux and UEs
    const filiereMap = new Map<string, {
      id: string
      nom: string
      code: string | null
      niveaux: Set<string>
      unitesEnseignement: Array<{
        id: string
        code: string
        nom: string
        niveau: string
        niveaux: string | null  // JSON string for shared UEs
        typeSeances: string[]   // CM, TD, TP
      }>
    }>()

    // Process EnseignantFiliere assignments
    for (const assignment of filiereAssignments) {
      const fId = assignment.filiereId
      if (!filiereMap.has(fId)) {
        filiereMap.set(fId, {
          id: assignment.filiere.id,
          nom: assignment.filiere.nom,
          code: assignment.filiere.code,
          niveaux: new Set(),
          unitesEnseignement: [],
        })
      }
      filiereMap.get(fId)!.niveaux.add(assignment.niveau)
    }

    // Process Affectation-based assignments (richer data: includes UEs)
    for (const affectation of ueAffectations) {
      const ue = affectation.uniteEnseignement
      const fId = ue.filiereId
      if (!filiereMap.has(fId)) {
        filiereMap.set(fId, {
          id: ue.filiere.id,
          nom: ue.filiere.nom,
          code: ue.filiere.code,
          niveaux: new Set(),
          unitesEnseignement: [],
        })
      }
      const entry = filiereMap.get(fId)!

      // Add the UE's niveau
      entry.niveaux.add(ue.niveau)

      // Also add niveaux from the shared niveaux JSON field
      if (ue.niveaux) {
        try {
          const sharedNiveaux = JSON.parse(ue.niveaux) as string[]
          for (const n of sharedNiveaux) {
            entry.niveaux.add(n)
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Add or update the UE entry
      const existingUE = entry.unitesEnseignement.find((u) => u.id === ue.id)
      if (existingUE) {
        // Add the typeSeance if not already present
        if (!existingUE.typeSeances.includes(affectation.typeSeance)) {
          existingUE.typeSeances.push(affectation.typeSeance)
        }
      } else {
        entry.unitesEnseignement.push({
          id: ue.id,
          code: ue.code,
          nom: ue.nom,
          niveau: ue.niveau,
          niveaux: ue.niveaux,
          typeSeances: [affectation.typeSeance],
        })
      }
    }

    // Convert to array with sorted niveaux
    const filieres = Array.from(filiereMap.values()).map((f) => ({
      id: f.id,
      nom: f.nom,
      code: f.code,
      niveaux: Array.from(f.niveaux).sort(),
      unitesEnseignement: f.unitesEnseignement,
    }))

    // Sort filières by name
    filieres.sort((a, b) => a.nom.localeCompare(b.nom))

    return NextResponse.json({ filieres })
  } catch (error) {
    console.error('[ENSEIGNANT_CONTEXT_GET]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du contexte enseignant' },
      { status: 500 }
    )
  }
}
