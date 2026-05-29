import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Valid status transitions for Devoir
const VALID_TRANSITIONS: Record<string, string[]> = {
  BROUILLON: ['PUBLIE'],
  PUBLIE: ['FERME'],
  FERME: ['ARCHIVE'],
  ARCHIVE: [],
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const devoir = await db.devoir.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, name: true, email: true } },
        UniteEnseignement: {
          select: {
            id: true,
            code: true,
            nom: true,
            niveau: true,
            semestre: true,
            filiere: { select: { id: true, nom: true } },
          },
        },
        GrilleEvaluation: true,
        Soumission: {
          include: {
            User: { select: { id: true, name: true, email: true, matricule: true } },
          },
          orderBy: { renduAt: 'desc' },
        },
      },
    })

    if (!devoir) {
      return NextResponse.json({ error: 'Devoir non trouvé' }, { status: 404 })
    }

    // Parse JSON fields
    const parsed = {
      ...devoir,
      renduFichiers: devoir.renduFichiers ? JSON.parse(devoir.renduFichiers) : null,
      GrilleEvaluation: devoir.GrilleEvaluation
        ? {
            ...devoir.GrilleEvaluation,
            criteres: devoir.GrilleEvaluation.criteres ? JSON.parse(devoir.GrilleEvaluation.criteres) : null,
          }
        : null,
      Soumission: devoir.Soumission.map((s) => ({
        ...s,
        fichiersSoumis: s.fichiersSoumis ? JSON.parse(s.fichiersSoumis) : null,
        rapportPlagiat: s.rapportPlagiat ? JSON.parse(s.rapportPlagiat) : null,
        historiqueVersions: s.historiqueVersions ? JSON.parse(s.historiqueVersions) : null,
      })),
    }

    return NextResponse.json({ devoir: parsed })
  } catch (error) {
    console.error('Get devoir error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du devoir' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, ...data } = body

    // Check devoir exists
    const existing = await db.devoir.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Devoir non trouvé' }, { status: 404 })
    }

    // Action: change status
    if (action === 'publier') {
      if (!VALID_TRANSITIONS[existing.statut]?.includes('PUBLIE')) {
        return NextResponse.json(
          { error: `Transition impossible de ${existing.statut} vers PUBLIE` },
          { status: 400 }
        )
      }
      const devoir = await db.devoir.update({
        where: { id },
        data: { statut: 'PUBLIE', datePublication: new Date() },
      })
      return NextResponse.json({
        devoir: {
          ...devoir,
          renduFichiers: devoir.renduFichiers ? JSON.parse(devoir.renduFichiers) : null,
        },
        message: 'Devoir publié',
      })
    }

    if (action === 'fermer') {
      if (!VALID_TRANSITIONS[existing.statut]?.includes('FERME')) {
        return NextResponse.json(
          { error: `Transition impossible de ${existing.statut} vers FERME` },
          { status: 400 }
        )
      }
      const devoir = await db.devoir.update({
        where: { id },
        data: { statut: 'FERME' },
      })
      return NextResponse.json({
        devoir: {
          ...devoir,
          renduFichiers: devoir.renduFichiers ? JSON.parse(devoir.renduFichiers) : null,
        },
        message: 'Devoir fermé',
      })
    }

    if (action === 'archiver') {
      if (!VALID_TRANSITIONS[existing.statut]?.includes('ARCHIVE')) {
        return NextResponse.json(
          { error: `Transition impossible de ${existing.statut} vers ARCHIVE` },
          { status: 400 }
        )
      }
      const devoir = await db.devoir.update({
        where: { id },
        data: { statut: 'ARCHIVE' },
      })
      return NextResponse.json({
        devoir: {
          ...devoir,
          renduFichiers: devoir.renduFichiers ? JSON.parse(devoir.renduFichiers) : null,
        },
        message: 'Devoir archivé',
      })
    }

    // General update
    const updateData: Record<string, unknown> = {}
    if (data.titre !== undefined) updateData.titre = data.titre
    if (data.description !== undefined) updateData.description = data.description
    if (data.consignes !== undefined) updateData.consignes = data.consignes
    if (data.typeSeance !== undefined) updateData.typeSeance = data.typeSeance
    if (data.datePublication !== undefined) updateData.datePublication = data.datePublication ? new Date(data.datePublication) : null
    if (data.dateLimite !== undefined) updateData.dateLimite = new Date(data.dateLimite)
    if (data.noteMax !== undefined) updateData.noteMax = data.noteMax
    if (data.renduFichiers !== undefined) updateData.renduFichiers = JSON.stringify(data.renduFichiers)
    if (data.soumissionGroupe !== undefined) updateData.soumissionGroupe = data.soumissionGroupe
    if (data.nbMaxFichiers !== undefined) updateData.nbMaxFichiers = data.nbMaxFichiers
    if (data.tailleMaxFichier !== undefined) updateData.tailleMaxFichier = data.tailleMaxFichier
    if (data.anneeUniversitaire !== undefined) updateData.anneeUniversitaire = data.anneeUniversitaire

    // Allow direct statut change only if valid transition
    if (data.statut !== undefined) {
      if (!VALID_TRANSITIONS[existing.statut]?.includes(data.statut)) {
        return NextResponse.json(
          { error: `Transition impossible de ${existing.statut} vers ${data.statut}` },
          { status: 400 }
        )
      }
      updateData.statut = data.statut
    }

    const devoir = await db.devoir.update({
      where: { id },
      data: updateData,
      include: {
        User: { select: { id: true, name: true, email: true } },
        UniteEnseignement: { select: { id: true, code: true, nom: true } },
      },
    })

    return NextResponse.json({
      devoir: {
        ...devoir,
        renduFichiers: devoir.renduFichiers ? JSON.parse(devoir.renduFichiers) : null,
      },
      message: 'Devoir mis à jour',
    })
  } catch (error) {
    console.error('Update devoir error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du devoir' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.devoir.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Devoir non trouvé' }, { status: 404 })
    }

    if (existing.statut === 'PUBLIE') {
      return NextResponse.json(
        { error: 'Impossible de supprimer un devoir publié' },
        { status: 400 }
      )
    }

    // Soft delete: set statut to ARCHIVE
    const devoir = await db.devoir.update({
      where: { id },
      data: { statut: 'ARCHIVE' },
    })

    return NextResponse.json({
      devoir: {
        ...devoir,
        renduFichiers: devoir.renduFichiers ? JSON.parse(devoir.renduFichiers) : null,
      },
      message: 'Devoir archivé (suppression logique)',
    })
  } catch (error) {
    console.error('Delete devoir error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du devoir' },
      { status: 500 }
    )
  }
}
