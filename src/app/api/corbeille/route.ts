import { NextRequest, NextResponse } from 'next/server'

// ─── GET /api/corbeille — List all soft-deleted items for a user ───
// Note: Soft delete (deletedAt) is not supported in the current schema.
// This endpoint returns empty results since there are no soft-deleted items.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur non identifié' }, { status: 401 })
    }

    // Soft delete (deletedAt) is not supported in the current schema.
    // Return empty results.
    return NextResponse.json({
      documents: [],
      questions: [],
      epreuves: [],
      devoirs: [],
      totalCount: 0,
    })
  } catch (error) {
    console.error('List corbeille error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la corbeille' },
      { status: 500 }
    )
  }
}
