import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createId } from '@paralleldrive/cuid2'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { resolveTenantFilter, requireAdminEtablissementAccess } from '@/lib/tenant-access'

// POST /api/devoirs — Create a new devoir
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
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

    // Verify uniteEnseignement exists and get its etablissementId via filiere
    const ue = await db.uniteEnseignement.findUnique({
      where: { id: uniteEnseignementId },
      include: { filiere: { select: { etablissementId: true } } },
    })
    if (!ue) {
      return NextResponse.json(
        { error: 'Unité d\'enseignement non trouvée' },
        { status: 404 }
      )
    }

    const ueEtablissementId = ue.filiere.etablissementId

    // Role-based authorization for POST
    if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: enseignantId must be their own ID
      if (enseignantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez créer des devoirs qu\'en votre nom.' },
          { status: 403 }
        )
      }
      // UE must be in their establishment
      if (user.etablissementId !== ueEtablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez créer des devoirs que dans votre établissement.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: can create devoirs in their establishment
      if (user.etablissementId !== ueEtablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez créer des devoirs que dans votre établissement.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: Must have EtablissementAccess for the UE's establishment
      const accessError = await requireAdminEtablissementAccess(user, ueEtablissementId)
      if (accessError) return accessError
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
        renduFichiers: renduFichiers != null ? JSON.stringify(renduFichiers) : null,
        soumissionGroupe: soumissionGroupe ?? false,
        nbMaxFichiers: nbMaxFichiers != null ? nbMaxFichiers : 10,
        tailleMaxFichier: tailleMaxFichier != null ? tailleMaxFichier : 52428800,
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

// GET /api/devoirs — List devoirs with filters
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const uniteEnseignementId = searchParams.get('uniteEnseignementId')
    const statut = searchParams.get('statut')
    const anneeUniversitaire = searchParams.get('anneeUniversitaire')
    const etudiantId = searchParams.get('etudiantId')

    // ─── ETUDIANT: can only query with their own etudiantId ───
    if (user.role === 'ETUDIANT') {
      if (!etudiantId || etudiantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez consulter que vos propres devoirs.' },
          { status: 403 }
        )
      }
    }

    // ─── Student-specific filter: return devoirs for the student's filiere ───
    if (etudiantId) {
      // Find the student and their filiere
      const etudiant = await db.user.findUnique({
        where: { id: etudiantId },
        select: { id: true, filiereId: true, etablissementId: true },
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

      // Verify tenant access for non-ETUDIANT roles viewing a student's devoirs
      if (user.role !== 'ETUDIANT') {
        const tenantFilter = await resolveTenantFilter(user, etudiant.etablissementId)
        if ('error' in tenantFilter) return tenantFilter.error
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

    // Apply tenant-based filtering for non-ETUDIANT roles
    if (user.role === 'ADMIN') {
      // ADMIN: Must have EtablissementAccess. Apply establishment filter via UE's filiere.
      const tenantFilter = await resolveTenantFilter(user)
      if ('error' in tenantFilter) return tenantFilter.error

      if ('etablissementIds' in tenantFilter) {
        // Filter devoirs whose UE's filiere belongs to authorized establishments
        const authorizedUes = await db.uniteEnseignement.findMany({
          where: {
            filiere: { etablissementId: { in: tenantFilter.etablissementIds } },
          },
          select: { id: true },
        })
        const authorizedUeIds = authorizedUes.map((u) => u.id)

        if (uniteEnseignementId) {
          if (!authorizedUeIds.includes(uniteEnseignementId)) {
            return NextResponse.json(
              { error: 'Accès refusé. Vous n\'êtes pas autorisé à accéder aux données de cet établissement.' },
              { status: 403 }
            )
          }
        } else {
          where.uniteEnseignementId = { in: authorizedUeIds }
        }
      } else if ('etablissementId' in tenantFilter) {
        const authorizedUes = await db.uniteEnseignement.findMany({
          where: {
            filiere: { etablissementId: tenantFilter.etablissementId },
          },
          select: { id: true },
        })
        const authorizedUeIds = authorizedUes.map((u) => u.id)

        if (uniteEnseignementId) {
          if (!authorizedUeIds.includes(uniteEnseignementId)) {
            return NextResponse.json(
              { error: 'Accès refusé. Vous n\'êtes pas autorisé à accéder aux données de cet établissement.' },
              { status: 403 }
            )
          }
        } else {
          where.uniteEnseignementId = { in: authorizedUeIds }
        }
      }
    } else if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: Can only see devoirs they created or in their establishment
      const authorizedUes = await db.uniteEnseignement.findMany({
        where: {
          filiere: { etablissementId: user.etablissementId },
        },
        select: { id: true },
      })
      const authorizedUeIds = authorizedUes.map((u) => u.id)

      if (uniteEnseignementId) {
        if (!authorizedUeIds.includes(uniteEnseignementId)) {
          return NextResponse.json(
            { error: 'Accès refusé. Vous ne pouvez accéder qu\'aux devoirs de votre établissement.' },
            { status: 403 }
          )
        }
      } else {
        // Either they created the devoir or it's in their establishment
        where.OR = [
          { enseignantId: user.id },
          { uniteEnseignementId: { in: authorizedUeIds } },
        ]
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: Can see devoirs in their establishment
      const authorizedUes = await db.uniteEnseignement.findMany({
        where: {
          filiere: { etablissementId: user.etablissementId },
        },
        select: { id: true },
      })
      const authorizedUeIds = authorizedUes.map((u) => u.id)

      if (uniteEnseignementId) {
        if (!authorizedUeIds.includes(uniteEnseignementId)) {
          return NextResponse.json(
            { error: 'Accès refusé. Vous ne pouvez accéder qu\'aux devoirs de votre établissement.' },
            { status: 403 }
          )
        }
      } else {
        where.uniteEnseignementId = { in: authorizedUeIds }
      }
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

export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
