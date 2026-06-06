import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createId } from '@paralleldrive/cuid2'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      titre,
      description,
      consignes,
      uniteEnseignementId,
      enseignantId,
      typeSeance,
      datePublication,
      dateLimite,
      noteMax,
      renduFichiers,
      soumissionGroupe,
      nbMaxFichiers,
      tailleMaxFichier,
      anneeUniversitaire,
    } = body

    // Validation
    if (!titre || !uniteEnseignementId || !enseignantId || !dateLimite) {
      return NextResponse.json(
        { error: 'Titre, unité d\'enseignement, enseignant et date limite requis' },
        { status: 400 }
      )
    }

    // Verify enseignant exists
    const enseignant = await db.user.findUnique({
      where: { id: enseignantId },
    })
    if (!enseignant) {
      return NextResponse.json(
        { error: 'Enseignant non trouvé' },
        { status: 404 }
      )
    }

    // Verify uniteEnseignement exists
    const ue = await db.uniteEnseignement.findUnique({
      where: { id: uniteEnseignementId },
    })
    if (!ue) {
      return NextResponse.json(
        { error: 'Unité d\'enseignement non trouvée' },
        { status: 404 }
      )
    }

    const devoir = await db.devoir.create({
      data: {
        id: createId(),
        titre,
        description: description || null,
        consignes: consignes || null,
        uniteEnseignementId,
        enseignantId,
        typeSeance: typeSeance || 'TD',
        datePublication: datePublication ? new Date(datePublication) : null,
        dateLimite: new Date(dateLimite),
        noteMax: noteMax ?? 20,
        renduFichiers: renduFichiers ? JSON.stringify(renduFichiers) : null,
        soumissionGroupe: soumissionGroupe ?? false,
        nbMaxFichiers: nbMaxFichiers ?? 10,
        tailleMaxFichier: tailleMaxFichier ?? 52428800,
        statut: 'BROUILLON',
        anneeUniversitaire: anneeUniversitaire || '2024-2025',
        updatedAt: new Date(),
      },
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
      message: 'Devoir créé avec succès',
    })
  } catch (error) {
    console.error('Create devoir error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création du devoir' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const uniteEnseignementId = searchParams.get('uniteEnseignementId')
    const statut = searchParams.get('statut')
    const anneeUniversitaire = searchParams.get('anneeUniversitaire')
    const etudiantId = searchParams.get('etudiantId')

    // ─── Student-specific filter: return devoirs for the student's filiere ───
    if (etudiantId) {
      // Find the student and their filiere
      const etudiant = await db.user.findUnique({
        where: { id: etudiantId },
        select: { id: true, filiereId: true },
      })

      if (!etudiant) {
        return NextResponse.json(
          { error: 'Étudiant non trouvé' },
          { status: 404 }
        )
      }

      if (!etudiant.filiereId) {
        return NextResponse.json({ devoirs: [] })
      }

      // Find UEs that belong to the student's filiere
      const ues = await db.uniteEnseignement.findMany({
        where: { filiereId: etudiant.filiereId },
        select: { id: true },
      })
      const ueIds = ues.map((ue) => ue.id)

      if (ueIds.length === 0) {
        return NextResponse.json({ devoirs: [] })
      }

      // Get devoirs for those UEs that are PUBLIE or FERME
      const devoirs = await db.devoir.findMany({
        where: {
          deletedAt: null,
          uniteEnseignementId: { in: ueIds },
          statut: { in: ['PUBLIE', 'FERME'] },
        },
        orderBy: { dateLimite: 'desc' },
        include: {
          User: { select: { id: true, name: true, email: true } },
          UniteEnseignement: { select: { id: true, code: true, nom: true, niveau: true } },
          GrilleEvaluation: true,
          _count: { select: { Soumission: true } },
        },
      })

      // Get the student's soumissions for these devoirs
      const devoirIds = devoirs.map((d) => d.id)
      const soumissions = devoirIds.length > 0
        ? await db.soumission.findMany({
            where: {
              devoirId: { in: devoirIds },
              etudiantId,
            },
          })
        : []

      const soumissionMap = new Map(soumissions.map((s) => [s.devoirId, s]))

      const parsedDevoirs = devoirs.map((d: any) => {
        const soumission = soumissionMap.get(d.id)
        return {
          ...d,
          renduFichiers: d.renduFichiers ? JSON.parse(d.renduFichiers) : null,
          GrilleEvaluation: d.GrilleEvaluation
            ? {
                ...d.GrilleEvaluation,
                criteres: d.GrilleEvaluation.criteres ? JSON.parse(d.GrilleEvaluation.criteres) : null,
              }
            : null,
          soumissionCount: d._count?.Soumission ?? 0,
          soumission: soumission
            ? {
                id: soumission.id,
                contenuTexte: soumission.contenuTexte,
                commentaireEtudiant: soumission.commentaireEtudiant,
                statut: soumission.statut,
                renduAt: soumission.renduAt,
                note: soumission.note,
                commentaireEnseignant: soumission.commentaireEnseignant,
                noteIA: soumission.noteIA,
                justificationIA: soumission.justificationIA,
                createdAt: soumission.createdAt,
              }
            : null,
        }
      })

      return NextResponse.json({ devoirs: parsedDevoirs })
    }

    // ─── Standard filters (enseignant, UE, statut, annee) ───
    const where: Record<string, unknown> = { deletedAt: null }

    if (enseignantId) where.enseignantId = enseignantId
    if (uniteEnseignementId) where.uniteEnseignementId = uniteEnseignementId
    if (statut) where.statut = statut
    if (anneeUniversitaire) where.anneeUniversitaire = anneeUniversitaire

    // If no filters provided, require at least one
    if (!enseignantId && !uniteEnseignementId && !statut && !anneeUniversitaire) {
      return NextResponse.json(
        { error: 'Au moins un filtre requis (enseignantId, uniteEnseignementId, statut, anneeUniversitaire ou etudiantId)' },
        { status: 400 }
      )
    }

    const devoirs = await db.devoir.findMany({
      where,
      orderBy: { dateLimite: 'desc' },
      include: {
        User: { select: { id: true, name: true, email: true } },
        UniteEnseignement: { select: { id: true, code: true, nom: true } },
        GrilleEvaluation: true,
        _count: { select: { Soumission: true } },
      },
    })

    const parsedDevoirs = devoirs.map((d: any) => ({
      ...d,
      renduFichiers: d.renduFichiers ? JSON.parse(d.renduFichiers) : null,
      GrilleEvaluation: d.GrilleEvaluation
        ? {
            ...d.GrilleEvaluation,
            criteres: d.GrilleEvaluation.criteres ? JSON.parse(d.GrilleEvaluation.criteres) : null,
          }
        : null,
      soumissionCount: d._count?.Soumission ?? 0,
    }))

    return NextResponse.json({ devoirs: parsedDevoirs })
  } catch (error) {
    console.error('List devoirs error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des devoirs' },
      { status: 500 }
    )
  }
}
