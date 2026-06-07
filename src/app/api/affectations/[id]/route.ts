import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

// Valid statut transitions: PROVISOIRE → VALIDEE → PUBLIEE
const VALID_STATUTS = ['PROVISOIRE', 'VALIDEE', 'PUBLIEE']

function isValidStatutTransition(current: string, next: string): boolean {
  const transitions: Record<string, string[]> = {
    PROVISOIRE: ['VALIDEE'],
    VALIDEE: ['PUBLIEE'],
    PUBLIEE: [], // No further transitions
  }
  return transitions[current]?.includes(next) ?? false
}

// ─── PATCH /api/affectations/[id] ───
// Update affectation (statut, volumeHeures, groupe, commentaire)
async function _PATCH(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params

    const existing = await db.affectation.findUnique({
      where: { id },
      include: {
        enseignant: { select: { id: true, name: true } },
        uniteEnseignement: { select: { id: true, code: true, nom: true } },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Affectation introuvable' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { statut, volumeHeures, groupe, commentaire } = body

    // Validate statut transition if provided
    if (statut !== undefined) {
      if (!VALID_STATUTS.includes(statut)) {
        return NextResponse.json(
          { error: `Le statut doit être l'un de : ${VALID_STATUTS.join(', ')}` },
          { status: 400 }
        )
      }

      if (!isValidStatutTransition(existing.statut, statut)) {
        return NextResponse.json(
          {
            error: `Transition de statut invalide : ${existing.statut} → ${statut}. Les transitions valides sont : PROVISOIRE → VALIDEE → PUBLIEE`,
          },
          { status: 400 }
        )
      }
    }

    // Validate volumeHeures if provided
    if (volumeHeures !== undefined && (volumeHeures === null || volumeHeures <= 0)) {
      return NextResponse.json(
        { error: 'Le volume horaire doit être un nombre positif' },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}
    if (statut !== undefined) data.statut = statut
    if (volumeHeures !== undefined) data.volumeHeures = volumeHeures
    if (groupe !== undefined) data.groupe = groupe || null
    if (commentaire !== undefined) data.commentaire = commentaire || null

    const affectation = await db.affectation.update({
      where: { id },
      data,
      include: {
        enseignant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        uniteEnseignement: {
          include: {
            filiere: {
              select: {
                id: true,
                nom: true,
                code: true,
              },
            },
          },
        },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'Affectation',
        entiteId: id,
        details: JSON.stringify({
          updatedFields: Object.keys(data),
          previousStatut: existing.statut,
          newStatut: statut,
          enseignant: existing.enseignant.name,
          uniteEnseignement: existing.uniteEnseignement.code,
        }),
      },
    })

    return NextResponse.json({ affectation })
  } catch (error) {
    console.error('[AFFECTATIONS_PATCH]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'affectation' },
      { status: 500 }
    )
  }
}

// ─── DELETE /api/affectations/[id] ───
// Delete affectation — only PROVISOIRE affectations can be deleted
async function _DELETE(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params

    const existing = await db.affectation.findUnique({
      where: { id },
      include: {
        enseignant: { select: { id: true, name: true } },
        uniteEnseignement: { select: { id: true, code: true, nom: true } },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Affectation introuvable' },
        { status: 404 }
      )
    }

    // Only PROVISOIRE affectations can be deleted
    if (existing.statut !== 'PROVISOIRE') {
      return NextResponse.json(
        {
          error: `Seules les affectations avec le statut PROVISOIRE peuvent être supprimées. Statut actuel : ${existing.statut}`,
        },
        { status: 400 }
      )
    }

    await db.affectation.delete({
      where: { id },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'Affectation',
        entiteId: id,
        details: JSON.stringify({
          enseignant: existing.enseignant.name,
          uniteEnseignement: existing.uniteEnseignement.code,
          typeSeance: existing.typeSeance,
          groupe: existing.groupe,
          volumeHeures: existing.volumeHeures,
          anneeUniversitaire: existing.anneeUniversitaire,
        }),
      },
    })

    return NextResponse.json({ message: 'Affectation supprimée avec succès' })
  } catch (error) {
    console.error('[AFFECTATIONS_DELETE]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'affectation' },
      { status: 500 }
    )
  }
}

export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE'])
export const DELETE = withAuth(_DELETE, ['ADMIN', 'RESPONSABLE'])
