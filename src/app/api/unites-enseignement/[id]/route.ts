import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── GET /api/unites-enseignement/[id] ───
// Get a single UE with filiere + affectations (include enseignant name)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const uniteEnseignement = await db.uniteEnseignement.findUnique({
      where: { id },
      include: {
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
            etablissementId: true,
          },
        },
        affectations: {
          include: {
            enseignant: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!uniteEnseignement) {
      return NextResponse.json(
        { error: 'Unité d\'enseignement introuvable' },
        { status: 404 }
      )
    }

    return NextResponse.json({ uniteEnseignement })
  } catch (error) {
    console.error('[UNITES_ENSEIGNEMENT_GET_BY_ID]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'unité d\'enseignement' },
      { status: 500 }
    )
  }
}

// ─── PATCH /api/unites-enseignement/[id] ───
// Update UE fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.uniteEnseignement.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Unité d\'enseignement introuvable' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const {
      code,
      nom,
      description,
      filiereId,
      niveau,
      semestre,
      creditsECTS,
      volumeHeuresCM,
      volumeHeuresTD,
      volumeHeuresTP,
      obligatoire,
      actif,
    } = body

    const VALID_NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT']

    // If code or filiereId is being changed, check uniqueness
    const newCode = code ?? existing.code
    const newFiliereId = filiereId ?? existing.filiereId

    if ((code !== undefined && code !== existing.code) || (filiereId !== undefined && filiereId !== existing.filiereId)) {
      const duplicate = await db.uniteEnseignement.findFirst({
        where: { code: newCode, filiereId: newFiliereId, id: { not: id } },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: `Une UE avec le code "${newCode}" existe déjà dans cette filière` },
          { status: 409 }
        )
      }
    }

    if (niveau && !VALID_NIVEAUX.includes(niveau)) {
      return NextResponse.json(
        { error: `Le niveau doit être l'un de : ${VALID_NIVEAUX.join(', ')}` },
        { status: 400 }
      )
    }

    if (semestre !== undefined && semestre !== null && ![1, 2].includes(semestre)) {
      return NextResponse.json(
        { error: 'Le semestre doit être 1 ou 2' },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}
    if (code !== undefined) data.code = code
    if (nom !== undefined) data.nom = nom
    if (description !== undefined) data.description = description
    if (filiereId !== undefined) data.filiereId = filiereId
    if (niveau !== undefined) data.niveau = niveau
    if (semestre !== undefined) data.semestre = semestre
    if (creditsECTS !== undefined) data.creditsECTS = creditsECTS
    if (volumeHeuresCM !== undefined) data.volumeHeuresCM = volumeHeuresCM
    if (volumeHeuresTD !== undefined) data.volumeHeuresTD = volumeHeuresTD
    if (volumeHeuresTP !== undefined) data.volumeHeuresTP = volumeHeuresTP
    if (obligatoire !== undefined) data.obligatoire = obligatoire
    if (actif !== undefined) data.actif = actif

    const uniteEnseignement = await db.uniteEnseignement.update({
      where: { id },
      data,
      include: {
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
          },
        },
        _count: {
          select: { affectations: true },
        },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'UniteEnseignement',
        entiteId: id,
        details: JSON.stringify({ updatedFields: Object.keys(data) }),
      },
    })

    return NextResponse.json({ uniteEnseignement })
  } catch (error) {
    console.error('[UNITES_ENSEIGNEMENT_PATCH]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'unité d\'enseignement' },
      { status: 500 }
    )
  }
}

// ─── DELETE /api/unites-enseignement/[id] ───
// Soft delete (set actif=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.uniteEnseignement.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Unité d\'enseignement introuvable' },
        { status: 404 }
      )
    }

    // Soft delete
    const uniteEnseignement = await db.uniteEnseignement.update({
      where: { id },
      data: { actif: false },
      include: {
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
          },
        },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'UniteEnseignement',
        entiteId: id,
        details: JSON.stringify({ softDelete: true, code: existing.code, nom: existing.nom }),
      },
    })

    return NextResponse.json({ uniteEnseignement, message: 'Unité d\'enseignement désactivée avec succès' })
  } catch (error) {
    console.error('[UNITES_ENSEIGNEMENT_DELETE]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'unité d\'enseignement' },
      { status: 500 }
    )
  }
}
