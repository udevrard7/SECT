import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const document = await db.document.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
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

    if (!document) {
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    // Hard delete (soft delete not supported - no deletedAt field in schema)
    await db.document.delete({ where: { id } })

    return NextResponse.json({ message: 'Document supprimé définitivement' })
  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du document' },
      { status: 500 }
    )
  }
}
