import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

async function _GET(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params

    const document = await db.document.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        uniteEnseignement: {
          select: {
            id: true,
            code: true,
            nom: true,
            niveau: true,
            niveaux: true,
            filiere: { select: { id: true, nom: true } },
          },
        },
        questions: {
          select: {
            id: true,
            type: true,
            enonce: true,
            difficulte: true,
            validee: true,
          },
        },
      },
    })

    if (!document || document.deletedAt) {
      return NextResponse.json(
        { error: 'Document non trouvé' },
        { status: 404 }
      )
    }

    // Parse JSON fields
    const result = {
      ...document,
      themesDetectes: document.themesDetectes ? JSON.parse(document.themesDetectes) : null,
      conceptsCles: document.conceptsCles ? JSON.parse(document.conceptsCles) : null,
      volumeEstime: document.volumeEstime ? JSON.parse(document.volumeEstime) : null,
    }

    return NextResponse.json({ document: result })
  } catch (error) {
    console.error('Get document error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du document' },
      { status: 500 }
    )
  }
}

async function _DELETE(
  request: NextRequest,
  context: { params: any; user: any }
) {
  try {
    const { id } = await context.params

    // Check if document exists
    const document = await db.document.findUnique({
      where: { id },
    })

    if (!document) {
      return NextResponse.json(
        { error: 'Document non trouvé' },
        { status: 404 }
      )
    }

    // Soft delete — move to Corbeille
    await db.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'SOFT_DELETE_DOCUMENT',
        entite: 'Document',
        entiteId: id,
        details: `Document déplacé vers la corbeille — ${document.nomFichier}`,
      },
    })

    return NextResponse.json({ message: 'Document déplacé vers la corbeille' })
  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du document' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ENSEIGNANT', 'ADMIN'])
export const DELETE = withAuth(_DELETE, ['ENSEIGNANT', 'ADMIN'])
