
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-middleware'

// Helper function to check if a user has permission to access an alert
async function canUserAccessAlerte(
  user: AuthenticatedUser,
  alerte: { id: string, filiereId: string | null, epreuveId: string | null, userId: string | null }
): Promise<boolean> {
  // Rule 1: Admins can see everything.
  if (user.role === 'ADMIN') {
    return true;
  }

  // Rule 2: Users can always see alerts assigned directly to them.
  if (alerte.userId === user.id) {
    return true;
  }

  // Rule 3: Responsables can access alerts linked to filières in their etablissement.
  if (user.role === 'RESPONSABLE' && user.etablissementId) {
    if (alerte.filiereId) {
      const filiere = await db.filiere.findUnique({
        where: { id: alerte.filiereId },
        select: { etablissementId: true },
      });
      return filiere?.etablissementId === user.etablissementId;
    }
  }

  // Rule 4: Enseignants can access alerts linked to their own epreuves.
  if (user.role === 'ENSEIGNANT') {
    if (alerte.epreuveId) {
      const epreuve = await db.epreuve.findUnique({
        where: { id: alerte.epreuveId },
        select: { enseignantId: true },
      });
      return epreuve?.enseignantId === user.id;
    }
  }
  
  // Default to deny access if no rule matches.
  return false;
}

// GET /api/alertes/[id] — Détail d'une alerte
export const GET = withAuth(async (
  request: NextRequest,
  { params, user }: { params: { id: string }, user: AuthenticatedUser }
) => {
  try {
    const { id } = params

    const alerte = await db.alerte.findUnique({
      where: { id },
    })

    if (!alerte) {
      return NextResponse.json({ error: 'Alerte non trouvée' }, { status: 404 })
    }

    // --- Authorization Check ---
    const hasAccess = await canUserAccessAlerte(user, alerte);
    if (!hasAccess) {
        return NextResponse.json({ error: 'Accès refusé. Vous n\'avez pas la permission de voir cette alerte.' }, { status: 403 });
    }

    const fullAlerte = await db.alerte.findUnique({
        where: {id},
        include: {
            filiere: { select: { id: true, nom: true, code: true, etablissement: { select: { id: true, nom: true } } } },
            epreuve: { select: { id: true, titre: true, statut: true, enseignant: { select: { id: true, name: true } } } },
            user: { select: { id: true, name: true, email: true, role: true } },
        }
    });

    // Marquer comme lue
    if (!fullAlerte!.lue) {
      const updated = await db.alerte.update({
        where: { id },
        data: { lue: true },
        include: {
            filiere: { select: { id: true, nom: true, code: true, etablissement: { select: { id: true, nom: true } } } },
            epreuve: { select: { id: true, titre: true, statut: true, enseignant: { select: { id: true, name: true } } } },
            user: { select: { id: true, name: true, email: true, role: true } },
        },
      })

      await db.auditLog.create({
        data: {
            userId: user.id,
            userEmail: user.email,
            action: 'READ',
            entite: 'Alerte',
            entiteId: id,
            details: JSON.stringify({ action: 'marquée_comme_lue' }),
        },
      })

      return NextResponse.json({ alerte: updated })
    }

    return NextResponse.json({ alerte: fullAlerte })
  } catch (error) {
    console.error('Détail alerte erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'alerte' },
      { status: 500 }
    )
  }
});

// PATCH /api/alertes/[id] — Mise à jour d'une alerte
export const PATCH = withAuth(async (
  request: NextRequest,
  { params, user }: { params: { id: string }, user: AuthenticatedUser }
) => {
  try {
    const { id } = params
    const body = await request.json()

    const existing = await db.alerte.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Alerte non trouvée' }, { status: 404 })
    }

    // --- Authorization Check ---
    const hasAccess = await canUserAccessAlerte(user, existing);
    if (!hasAccess) {
        return NextResponse.json({ error: 'Accès refusé. Vous n\'avez pas la permission de modifier cette alerte.' }, { status: 403 });
    }

    const updatedAlerte = await db.alerte.update({
        where: { id },
        data: { ...body },
        include: {
            filiere: { select: { id: true, nom: true } },
            epreuve: { select: { id: true, titre: true } },
            user: { select: { id: true, name: true, email: true } },
        },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'UPDATE',
        entite: 'Alerte',
        entiteId: id,
        details: JSON.stringify({ changes: body }),
      },
    });

    return NextResponse.json({ alerte: updatedAlerte, message: 'Alerte mise à jour' })

  } catch (error) {
    console.error('Mise à jour alerte erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'alerte' },
      { status: 500 }
    )
  }
}, ['ADMIN', 'RESPONSABLE']); // Only ADMIN and RESPONSABLE can PATCH


// DELETE /api/alertes/[id] — Supprimer une alerte
export const DELETE = withAuth(async (
  request: NextRequest,
  { params, user }: { params: { id: string }, user: AuthenticatedUser }
) => {
  try {
    const { id } = params

    const existing = await db.alerte.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Alerte non trouvée' }, { status: 404 });
    }
    
    // --- Authorization Check ---
    const hasAccess = await canUserAccessAlerte(user, existing);
    if (!hasAccess) {
        return NextResponse.json({ error: 'Accès refusé. Vous n\'avez pas la permission de supprimer cette alerte.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url)
    const confirm = searchParams.get('confirm')
    if (confirm !== 'true') {
      return NextResponse.json(
        { message: 'Ajoutez ?confirm=true pour confirmer la suppression' },
        { status: 400 }
      )
    }

    await db.alerte.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'DELETE',
        entite: 'Alerte',
        entiteId: id,
        details: JSON.stringify({ alerteSupprimee: existing }),
      },
    });

    return NextResponse.json({ message: 'Alerte supprimée avec succès' });

  } catch (error) {
    console.error('Suppression alerte erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'alerte' },
      { status: 500 }
    )
  }
}, ['ADMIN']); // Only ADMIN can DELETE
