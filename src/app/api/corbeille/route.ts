import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { getAuthorizedEtablissementIds } from '@/lib/tenant-access'

// ─── GET /api/corbeille — List all soft-deleted items for a user ───
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur non identifié' }, { status: 400 })
    }

    // Role-based access control for corbeille
    if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT: can only see their own deleted items
      if (userId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez consulter que votre propre corbeille.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: can see items from any user in their establishment
      const targetUser = await db.user.findUnique({
        where: { id: userId },
        select: { etablissementId: true },
      })
      if (!targetUser || targetUser.etablissementId !== user.etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez consulter que la corbeille des utilisateurs de votre établissement.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: can see items from any user in their authorized establishments
      const targetUser = await db.user.findUnique({
        where: { id: userId },
        select: { etablissementId: true },
      })
      if (!targetUser || !targetUser.etablissementId) {
        return NextResponse.json(
          { error: 'Utilisateur non trouvé ou sans établissement associé.' },
          { status: 404 }
        )
      }
      const authorizedIds = await getAuthorizedEtablissementIds(user.id)
      if (!authorizedIds.has(targetUser.etablissementId)) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous n\'êtes pas autorisé à accéder aux données de cet établissement.' },
          { status: 403 }
        )
      }
    }

    // Fetch soft-deleted items belonging to this user
    const [documents, questions, epreuves, devoirs] = await Promise.all([
      // Documents deleted by this user
      db.document.findMany({
        where: {
          ownerId: userId,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          nomFichier: true,
          tailleFichier: true,
          typeMime: true,
          dateUpload: true,
          deletedAt: true,
        },
        orderBy: { deletedAt: 'desc' },
      }),

      // Questions created by this user
      db.question.findMany({
        where: {
          auteurId: userId,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          type: true,
          enonce: true,
          difficulte: true,
          validee: true,
          deletedAt: true,
          document: {
            select: { id: true, nomFichier: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),

      // Epreuves created by this user
      db.epreuve.findMany({
        where: {
          enseignantId: userId,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          titre: true,
          duree: true,
          statut: true,
          dateDebut: true,
          dateFin: true,
          deletedAt: true,
          uniteEnseignement: {
            select: { id: true, code: true, nom: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),

      // Devoirs created by this user
      db.devoir.findMany({
        where: {
          enseignantId: userId,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          titre: true,
          dateLimite: true,
          statut: true,
          noteMax: true,
          deletedAt: true,
          UniteEnseignement: {
            select: { id: true, code: true, nom: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),
    ])

    // Serialize dates for JSON transport
    const serialized = {
      documents: documents.map((d) => ({
        ...d,
        dateUpload: d.dateUpload.toISOString(),
        deletedAt: d.deletedAt!.toISOString(),
      })),
      questions: questions.map((q) => ({
        ...q,
        deletedAt: q.deletedAt!.toISOString(),
      })),
      epreuves: epreuves.map((e) => ({
        ...e,
        dateDebut: e.dateDebut.toISOString(),
        dateFin: e.dateFin.toISOString(),
        deletedAt: e.deletedAt!.toISOString(),
      })),
      devoirs: devoirs.map((d) => ({
        ...d,
        dateLimite: d.dateLimite.toISOString(),
        deletedAt: d.deletedAt!.toISOString(),
      })),
      totalCount: documents.length + questions.length + epreuves.length + devoirs.length,
    }

    return NextResponse.json(serialized)
  } catch (error) {
    console.error('List corbeille error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la corbeille' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
