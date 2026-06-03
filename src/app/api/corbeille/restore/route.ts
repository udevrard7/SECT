import { NextRequest, NextResponse } from 'next/server'

// ─── POST /api/corbeille/restore — Restore soft-deleted items ───
// Note: Soft delete (deletedAt) is not supported in the current schema.
// This endpoint returns a message indicating the feature is not available.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items } = body as { items: Array<{ id: string; type: string }> }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Liste d\'éléments à restaurer requise' },
        { status: 400 }
      )
    }

    // Soft delete is not supported in the current schema (no deletedAt field)
    // Return a message indicating no items were restored
    return NextResponse.json({
      message: 'La restauration n\'est pas disponible (suppression douce non supportée)',
      restoredCount: 0,
    })
  } catch (error) {
    console.error('Restore from corbeille error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la restauration des éléments' },
      { status: 500 }
    )
  }
}
