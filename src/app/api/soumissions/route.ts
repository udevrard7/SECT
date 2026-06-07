import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createId } from '@paralleldrive/cuid2'
import { withAuth } from '@/lib/auth-session'

async function _POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      devoirId,
      etudiantId,
      groupeId,
      contenuTexte,
      fichiersSoumis,
      commentaireEtudiant,
      statut,
    } = body

    // Validation
    if (!devoirId || !etudiantId) {
      return NextResponse.json(
        { error: 'Devoir et étudiant requis' },
        { status: 400 }
      )
    }

    // Verify devoir exists
    const devoir = await db.devoir.findUnique({ where: { id: devoirId } })
    if (!devoir) {
      return NextResponse.json(
        { error: 'Devoir non trouvé' },
        { status: 404 }
      )
    }

    // Verify etudiant exists
    const etudiant = await db.user.findUnique({ where: { id: etudiantId } })
    if (!etudiant) {
      return NextResponse.json(
        { error: 'Étudiant non trouvé' },
        { status: 404 }
      )
    }

    // Check if soumission already exists for this devoir/etudiant pair
    const existing = await db.soumission.findUnique({
      where: { devoirId_etudiantId: { devoirId, etudiantId } },
    })

    if (existing) {
      // Update existing soumission
      const updateData: Record<string, unknown> = {}
      if (contenuTexte !== undefined) updateData.contenuTexte = contenuTexte
      if (fichiersSoumis !== undefined) updateData.fichiersSoumis = JSON.stringify(fichiersSoumis)
      if (commentaireEtudiant !== undefined) updateData.commentaireEtudiant = commentaireEtudiant
      if (groupeId !== undefined) updateData.groupeId = groupeId

      // If submitting (not just saving draft)
      if (statut === 'SOUMIS') {
        updateData.statut = 'SOUMIS'
        updateData.renduAt = new Date()
      }

      // Track version history
      const currentVersions = existing.historiqueVersions
        ? JSON.parse(existing.historiqueVersions)
        : []
      const newVersion = {
        date: new Date().toISOString(),
        contenuTexte: contenuTexte ?? existing.contenuTexte,
        fichiersSoumis: fichiersSoumis ?? (existing.fichiersSoumis ? JSON.parse(existing.fichiersSoumis) : null),
        statut: statut || existing.statut,
      }
      updateData.historiqueVersions = JSON.stringify([...currentVersions, newVersion])

      const soumission = await db.soumission.update({
        where: { id: existing.id },
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
    }

    // Create new soumission
    const isSoumis = statut === 'SOUMIS'
    const soumission = await db.soumission.create({
      data: {
        id: createId(),
        devoirId,
        etudiantId,
        groupeId: groupeId || null,
        contenuTexte: contenuTexte || null,
        fichiersSoumis: fichiersSoumis ? JSON.stringify(fichiersSoumis) : null,
        commentaireEtudiant: commentaireEtudiant || null,
        statut: isSoumis ? 'SOUMIS' : 'BROUILLON',
        renduAt: isSoumis ? new Date() : null,
        updatedAt: new Date(),
        historiqueVersions: JSON.stringify([
          {
            date: new Date().toISOString(),
            contenuTexte: contenuTexte || null,
            fichiersSoumis: fichiersSoumis || null,
            statut: isSoumis ? 'SOUMIS' : 'BROUILLON',
          },
        ]),
      },
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
      message: isSoumis ? 'Devoir soumis avec succès' : 'Brouillon sauvegardé',
    })
  } catch (error) {
    console.error('Create/update soumission error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la soumission du devoir' },
      { status: 500 }
    )
  }
}

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const devoirId = searchParams.get('devoirId')
    const etudiantId = searchParams.get('etudiantId')
    const statut = searchParams.get('statut')

    const where: Record<string, unknown> = {}

    if (devoirId) where.devoirId = devoirId
    if (etudiantId) where.etudiantId = etudiantId
    if (statut) where.statut = statut

    // If no filters, require at least one
    if (!devoirId && !etudiantId && !statut) {
      return NextResponse.json(
        { error: 'Au moins un filtre requis (devoirId, etudiantId ou statut)' },
        { status: 400 }
      )
    }

    const soumissions = await db.soumission.findMany({
      where,
      orderBy: { renduAt: 'desc' },
      include: {
        Devoir: {
          select: {
            id: true,
            titre: true,
            dateLimite: true,
            noteMax: true,
            statut: true,
            UniteEnseignement: { select: { id: true, code: true, nom: true } },
          },
        },
        User: { select: { id: true, name: true, email: true, matricule: true } },
      },
    })

    const parsedSoumissions = soumissions.map((s) => ({
      ...s,
      fichiersSoumis: s.fichiersSoumis ? JSON.parse(s.fichiersSoumis) : null,
      rapportPlagiat: s.rapportPlagiat ? JSON.parse(s.rapportPlagiat) : null,
      historiqueVersions: s.historiqueVersions ? JSON.parse(s.historiqueVersions) : null,
    }))

    return NextResponse.json({ soumissions: parsedSoumissions })
  } catch (error) {
    console.error('List soumissions error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des soumissions' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
