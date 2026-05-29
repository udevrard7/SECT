import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const soumission = await db.soumission.findUnique({
      where: { id },
      include: {
        Devoir: {
          select: {
            id: true,
            titre: true,
            description: true,
            consignes: true,
            dateLimite: true,
            noteMax: true,
            statut: true,
            typeSeance: true,
            renduFichiers: true,
            GrilleEvaluation: true,
            UniteEnseignement: { select: { id: true, code: true, nom: true } },
          },
        },
        User: { select: { id: true, name: true, email: true, matricule: true } },
      },
    })

    if (!soumission) {
      return NextResponse.json({ error: 'Soumission non trouvée' }, { status: 404 })
    }

    // Parse JSON fields
    const parsed = {
      ...soumission,
      fichiersSoumis: soumission.fichiersSoumis ? JSON.parse(soumission.fichiersSoumis) : null,
      rapportPlagiat: soumission.rapportPlagiat ? JSON.parse(soumission.rapportPlagiat) : null,
      historiqueVersions: soumission.historiqueVersions ? JSON.parse(soumission.historiqueVersions) : null,
      Devoir: {
        ...soumission.Devoir,
        renduFichiers: soumission.Devoir.renduFichiers ? JSON.parse(soumission.Devoir.renduFichiers) : null,
        GrilleEvaluation: soumission.Devoir.GrilleEvaluation
          ? {
              ...soumission.Devoir.GrilleEvaluation,
              criteres: soumission.Devoir.GrilleEvaluation.criteres
                ? JSON.parse(soumission.Devoir.GrilleEvaluation.criteres)
                : null,
            }
          : null,
      },
    }

    return NextResponse.json({ soumission: parsed })
  } catch (error) {
    console.error('Get soumission error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la soumission' },
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
    const {
      contenuTexte,
      fichiersSoumis,
      commentaireEtudiant,
      statut,
      note,
      commentaireEnseignant,
      noteIA,
      justificationIA,
      rapportPlagiat,
      groupeId,
    } = body

    // Check soumission exists
    const existing = await db.soumission.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Soumission non trouvée' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    // Student fields
    if (contenuTexte !== undefined) updateData.contenuTexte = contenuTexte
    if (fichiersSoumis !== undefined) updateData.fichiersSoumis = JSON.stringify(fichiersSoumis)
    if (commentaireEtudiant !== undefined) updateData.commentaireEtudiant = commentaireEtudiant
    if (groupeId !== undefined) updateData.groupeId = groupeId

    // Teacher/grading fields
    if (note !== undefined) {
      updateData.note = note
      // Auto-transition to CORRIGE when a note is assigned
      if (existing.statut === 'SOUMIS') {
        updateData.statut = 'CORRIGE'
      }
    }
    if (commentaireEnseignant !== undefined) updateData.commentaireEnseignant = commentaireEnseignant
    if (noteIA !== undefined) updateData.noteIA = noteIA
    if (justificationIA !== undefined) updateData.justificationIA = justificationIA
    if (rapportPlagiat !== undefined) updateData.rapportPlagiat = JSON.stringify(rapportPlagiat)

    // Status transitions
    if (statut !== undefined) {
      const validTransitions: Record<string, string[]> = {
        BROUILLON: ['SOUMIS'],
        SOUMIS: ['CORRIGE'],
        CORRIGE: ['RETOURNE'],
        RETOURNE: [],
      }
      if (!validTransitions[existing.statut]?.includes(statut)) {
        // Allow auto-transition when grading
        if (!(statut === 'CORRIGE' && note !== undefined && existing.statut === 'SOUMIS')) {
          return NextResponse.json(
            { error: `Transition impossible de ${existing.statut} vers ${statut}` },
            { status: 400 }
          )
        }
      }
      updateData.statut = statut

      if (statut === 'SOUMIS') {
        updateData.renduAt = new Date()
      }
    }

    // Track version history
    const currentVersions = existing.historiqueVersions
      ? JSON.parse(existing.historiqueVersions)
      : []
    const newVersion = {
      date: new Date().toISOString(),
      modifications: Object.keys(updateData),
      statut: updateData.statut || existing.statut,
    }
    updateData.historiqueVersions = JSON.stringify([...currentVersions, newVersion])

    const soumission = await db.soumission.update({
      where: { id },
      data: updateData,
      include: {
        Devoir: { select: { id: true, titre: true, dateLimite: true, noteMax: true } },
        User: { select: { id: true, name: true, email: true } },
      },
    })

    return NextResponse.json({
      soumission: {
        ...soumission,
        fichiersSoumis: soumission.fichiersSoumis ? JSON.parse(soumission.fichiersSoumis) : null,
        rapportPlagiat: soumission.rapportPlagiat ? JSON.parse(soumission.rapportPlagiat) : null,
        historiqueVersions: soumission.historiqueVersions ? JSON.parse(soumission.historiqueVersions) : null,
      },
      message: 'Soumission mise à jour',
    })
  } catch (error) {
    console.error('Update soumission error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la soumission' },
      { status: 500 }
    )
  }
}
