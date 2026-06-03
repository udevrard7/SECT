import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/alertes/[id] — Détail d'une alerte
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const alerte = await db.alerte.findUnique({
      where: { id },
      include: {
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
            etablissement: {
              select: { id: true, nom: true },
            },
          },
        },
        epreuve: {
          select: {
            id: true,
            titre: true,
            description: true,
            statut: true,
            dateDebut: true,
            dateFin: true,
            enseignant: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            filiere: {
              select: { id: true, nom: true },
            },
          },
        },
      },
    })

    if (!alerte) {
      return NextResponse.json(
        { error: 'Alerte non trouvée' },
        { status: 404 }
      )
    }

    // Marquer automatiquement comme lue si elle ne l'est pas encore
    if (!alerte.lue) {
      const updated = await db.alerte.update({
        where: { id },
        data: { lue: true },
        include: {
          filiere: {
            select: {
              id: true,
              nom: true,
              code: true,
              etablissement: {
                select: { id: true, nom: true },
              },
            },
          },
          epreuve: {
            select: {
              id: true,
              titre: true,
              description: true,
              statut: true,
              dateDebut: true,
              dateFin: true,
              enseignant: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              filiere: {
                select: { id: true, nom: true },
              },
            },
          },
        },
      })

      // Audit pour la lecture
      await db.auditLog.create({
        data: {
          action: 'READ',
          entite: 'Alerte',
          entiteId: id,
          details: JSON.stringify({ action: 'marquée_comme_lue' }),
        },
      })

      return NextResponse.json({ alerte: updated })
    }

    return NextResponse.json({ alerte })
  } catch (error) {
    console.error('Détail alerte erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'alerte' },
      { status: 500 }
    )
  }
}

// PATCH /api/alertes/[id] — Mise à jour d'une alerte
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, titre, description, severity, type, lue, resolu, filiereId, epreuveId, userId } = body

    // Vérifier l'existence de l'alerte
    const existing = await db.alerte.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Alerte non trouvée' },
        { status: 404 }
      )
    }

    // Actions spécifiques
    if (action === 'marquer_lue') {
      const alerte = await db.alerte.update({
        where: { id },
        data: { lue: true },
        include: {
          filiere: { select: { id: true, nom: true, code: true } },
          epreuve: { select: { id: true, titre: true, statut: true } },
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      })

      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          entite: 'Alerte',
          entiteId: id,
          details: JSON.stringify({ action: 'marquer_lue' }),
        },
      })

      return NextResponse.json({
        alerte,
        message: 'Alerte marquée comme lue',
      })
    }

    if (action === 'marquer_non_lue') {
      const alerte = await db.alerte.update({
        where: { id },
        data: { lue: false },
        include: {
          filiere: { select: { id: true, nom: true, code: true } },
          epreuve: { select: { id: true, titre: true, statut: true } },
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      })

      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          entite: 'Alerte',
          entiteId: id,
          details: JSON.stringify({ action: 'marquer_non_lue' }),
        },
      })

      return NextResponse.json({
        alerte,
        message: 'Alerte marquée comme non lue',
      })
    }

    if (action === 'resoudre') {
      const alerte = await db.alerte.update({
        where: { id },
        data: { resolu: true, lue: true },
        include: {
          filiere: { select: { id: true, nom: true, code: true } },
          epreuve: { select: { id: true, titre: true, statut: true } },
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      })

      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          entite: 'Alerte',
          entiteId: id,
          details: JSON.stringify({ action: 'resoudre' }),
        },
      })

      return NextResponse.json({
        alerte,
        message: 'Alerte marquée comme résolue',
      })
    }

    if (action === 'rouvrir') {
      const alerte = await db.alerte.update({
        where: { id },
        data: { resolu: false },
        include: {
          filiere: { select: { id: true, nom: true, code: true } },
          epreuve: { select: { id: true, titre: true, statut: true } },
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      })

      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          entite: 'Alerte',
          entiteId: id,
          details: JSON.stringify({ action: 'rouvrir' }),
        },
      })

      return NextResponse.json({
        alerte,
        message: 'Alerte rouverte',
      })
    }

    // Mise à jour générale des champs
    const updateData: Record<string, unknown> = {}

    if (titre !== undefined) updateData.titre = titre
    if (description !== undefined) updateData.description = description
    if (severity !== undefined) {
      const validSeverities = ['CRITICAL', 'WARNING', 'INFO']
      if (!validSeverities.includes(severity)) {
        return NextResponse.json(
          { error: `Sévérité invalide. Valeurs acceptées : ${validSeverities.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.severity = severity
    }
    if (type !== undefined) {
      const validTypes = ['PERFORMANCE', 'FRAUDE', 'SYSTEME', 'RAPPEL', 'CUSTOM']
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Type invalide. Valeurs acceptées : ${validTypes.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.type = type
    }
    if (lue !== undefined) updateData.lue = lue
    if (resolu !== undefined) updateData.resolu = resolu
    if (filiereId !== undefined) updateData.filiereId = filiereId || null
    if (epreuveId !== undefined) updateData.epreuveId = epreuveId || null
    if (userId !== undefined) updateData.userId = userId || null

    // Vérifier les entités liées si mises à jour
    if (filiereId) {
      const filiere = await db.filiere.findUnique({ where: { id: filiereId } })
      if (!filiere) {
        return NextResponse.json(
          { error: 'Filière non trouvée' },
          { status: 404 }
        )
      }
    }

    if (epreuveId) {
      const epreuve = await db.epreuve.findUnique({ where: { id: epreuveId } })
      if (!epreuve) {
        return NextResponse.json(
          { error: 'Épreuve non trouvée' },
          { status: 404 }
        )
      }
    }

    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId } })
      if (!user) {
        return NextResponse.json(
          { error: 'Utilisateur non trouvé' },
          { status: 404 }
        )
      }
    }

    const alerte = await db.alerte.update({
      where: { id },
      data: updateData,
      include: {
        filiere: { select: { id: true, nom: true, code: true } },
        epreuve: { select: { id: true, titre: true, statut: true } },
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    // Journal d'audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'Alerte',
        entiteId: id,
        details: JSON.stringify({
          champsModifies: Object.keys(updateData),
          anciennesValeurs: {
            titre: existing.titre,
            severity: existing.severity,
            type: existing.type,
            lue: existing.lue,
            resolu: existing.resolu,
            filiereId: existing.filiereId,
            epreuveId: existing.epreuveId,
            userId: existing.userId,
          },
          nouvellesValeurs: updateData,
        }),
      },
    })

    return NextResponse.json({
      alerte,
      message: 'Alerte mise à jour',
    })
  } catch (error) {
    console.error('Mise à jour alerte erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'alerte' },
      { status: 500 }
    )
  }
}

// DELETE /api/alertes/[id] — Supprimer une alerte
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Vérifier l'existence de l'alerte
    const existing = await db.alerte.findUnique({
      where: { id },
      include: {
        filiere: { select: { id: true, nom: true } },
        epreuve: { select: { id: true, titre: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Alerte non trouvée' },
        { status: 404 }
      )
    }

    // Vérifier le paramètre de confirmation
    const { searchParams } = new URL(request.url)
    const confirm = searchParams.get('confirm')
    if (confirm !== 'true') {
      return NextResponse.json(
        {
          error: 'Confirmation requise',
          message: 'Ajoutez ?confirm=true pour confirmer la suppression',
          alerte: {
            id: existing.id,
            titre: existing.titre,
            severity: existing.severity,
            type: existing.type,
          },
        },
        { status: 400 }
      )
    }

    // Suppression
    await db.alerte.delete({
      where: { id },
    })

    // Journal d'audit
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'Alerte',
        entiteId: id,
        details: JSON.stringify({
          titre: existing.titre,
          severity: existing.severity,
          type: existing.type,
          filiereId: existing.filiereId,
          epreuveId: existing.epreuveId,
          userId: existing.userId,
          supprimeePar: 'admin',
        }),
      },
    })

    return NextResponse.json({
      message: 'Alerte supprimée avec succès',
      alerteSupprimee: {
        id: existing.id,
        titre: existing.titre,
      },
    })
  } catch (error) {
    console.error('Suppression alerte erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'alerte' },
      { status: 500 }
    )
  }
}
