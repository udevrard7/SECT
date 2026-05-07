import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const VALID_NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2']

// ─── GET /api/enseignant-filieres ───
// List teacher-filiere assignments with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const filiereId = searchParams.get('filiereId')
    const responsableId = searchParams.get('responsableId')

    const where: Record<string, unknown> = {}

    if (enseignantId) {
      where.enseignantId = enseignantId
    }

    if (filiereId) {
      where.filiereId = filiereId
    }

    // If responsableId is provided, find all assignments for filières managed by this responsable
    if (responsableId) {
      const filieresDuResponsable = await db.filiere.findMany({
        where: { responsableId },
        select: { id: true },
      })
      const filiereIds = filieresDuResponsable.map((f) => f.id)
      where.filiereId = filiereId
        ? { in: [filiereId].filter((id) => filiereIds.includes(id)) }
        : { in: filiereIds }
    }

    const assignments = await db.enseignantFiliere.findMany({
      where,
      include: {
        enseignant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
            niveau: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    console.error('[ENSEIGNANT_FILIERES_GET]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des affectations' },
      { status: 500 }
    )
  }
}

// ─── POST /api/enseignant-filieres ───
// Create one or more teacher-filiere-level assignments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enseignantId, filiereId, niveau, assignments: bulkAssignments } = body

    // Normalize to array of assignments
    const toCreate: { enseignantId: string; filiereId: string; niveau: string }[] = []

    if (bulkAssignments && Array.isArray(bulkAssignments)) {
      toCreate.push(...bulkAssignments)
    } else if (enseignantId && filiereId && niveau) {
      toCreate.push({ enseignantId, filiereId, niveau })
    } else {
      return NextResponse.json(
        { error: 'Données invalides. Fournissez { enseignantId, filiereId, niveau } ou { assignments: [...] }' },
        { status: 400 }
      )
    }

    // Validate all entries
    const errors: { index: number; message: string }[] = []

    for (let i = 0; i < toCreate.length; i++) {
      const entry = toCreate[i]

      if (!entry.enseignantId) {
        errors.push({ index: i, message: "L'identifiant de l'enseignant est requis" })
        continue
      }

      if (!entry.filiereId) {
        errors.push({ index: i, message: "L'identifiant de la filière est requis" })
        continue
      }

      if (!entry.niveau || !VALID_NIVEAUX.includes(entry.niveau)) {
        errors.push({
          index: i,
          message: `Le niveau doit être l'un de : ${VALID_NIVEAUX.join(', ')}`,
        })
        continue
      }

      // Validate enseignant exists and has role ENSEIGNANT
      const enseignant = await db.user.findUnique({
        where: { id: entry.enseignantId },
      })

      if (!enseignant) {
        errors.push({ index: i, message: 'Enseignant introuvable' })
        continue
      }

      if (enseignant.role !== 'ENSEIGNANT') {
        errors.push({
          index: i,
          message: `L'utilisateur "${enseignant.name}" n'a pas le rôle ENSEIGNANT (rôle actuel : ${enseignant.role})`,
        })
        continue
      }

      // Validate filiere exists
      const filiere = await db.filiere.findUnique({
        where: { id: entry.filiereId },
      })

      if (!filiere) {
        errors.push({ index: i, message: 'Filière introuvable' })
        continue
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Erreurs de validation', errors }, { status: 400 })
    }

    // Create assignments
    const created = []

    for (const entry of toCreate) {
      try {
        const assignment = await db.enseignantFiliere.create({
          data: {
            enseignantId: entry.enseignantId,
            filiereId: entry.filiereId,
            niveau: entry.niveau,
          },
          include: {
            enseignant: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            filiere: {
              select: {
                id: true,
                nom: true,
                code: true,
                niveau: true,
              },
            },
          },
        })
        created.push(assignment)
      } catch (err: unknown) {
        // Handle unique constraint violation
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
          errors.push({
            index: toCreate.indexOf(entry),
            message: `L'affectation existe déjà pour cet enseignant, cette filière et ce niveau (${entry.niveau})`,
          })
        } else {
          errors.push({
            index: toCreate.indexOf(entry),
            message: 'Erreur lors de la création de l\'affectation',
          })
        }
      }
    }

    if (created.length === 0 && errors.length > 0) {
      return NextResponse.json({ error: 'Erreurs de création', errors }, { status: 409 })
    }

    return NextResponse.json(
      {
        assignments: created,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[ENSEIGNANT_FILIERES_POST]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création des affectations' },
      { status: 500 }
    )
  }
}

// ─── DELETE /api/enseignant-filieres ───
// Remove an assignment by id or by enseignantId + filiereId + niveau
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, enseignantId, filiereId, niveau } = body

    if (id) {
      // Delete by id
      const existing = await db.enseignantFiliere.findUnique({ where: { id } })

      if (!existing) {
        return NextResponse.json(
          { error: 'Affectation introuvable' },
          { status: 404 }
        )
      }

      await db.enseignantFiliere.delete({ where: { id } })

      return NextResponse.json({ message: 'Affectation supprimée avec succès' })
    }

    if (enseignantId && filiereId && niveau) {
      // Validate niveau
      if (!VALID_NIVEAUX.includes(niveau)) {
        return NextResponse.json(
          { error: `Le niveau doit être l'un de : ${VALID_NIVEAUX.join(', ')}` },
          { status: 400 }
        )
      }

      // Delete by unique combo
      const existing = await db.enseignantFiliere.findUnique({
        where: {
          enseignantId_filiereId_niveau: {
            enseignantId,
            filiereId,
            niveau,
          },
        },
      })

      if (!existing) {
        return NextResponse.json(
          { error: 'Affectation introuvable pour cette combinaison' },
          { status: 404 }
        )
      }

      await db.enseignantFiliere.delete({
        where: {
          enseignantId_filiereId_niveau: {
            enseignantId,
            filiereId,
            niveau,
          },
        },
      })

      return NextResponse.json({ message: 'Affectation supprimée avec succès' })
    }

    return NextResponse.json(
      { error: "Données invalides. Fournissez { id } ou { enseignantId, filiereId, niveau }" },
      { status: 400 }
    )
  } catch (error) {
    console.error('[ENSEIGNANT_FILIERES_DELETE]', error)
    return NextResponse.json(
      { error: "Erreur lors de la suppression de l'affectation" },
      { status: 500 }
    )
  }
}
