import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/plans/[id] — Get a single plan by ID
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const plan = await db.plan.findUnique({
      where: { id },
      include: {
        _count: { select: { abonnements: true } },
      },
    })

    if (!plan) {
      return NextResponse.json(
        { error: 'Plan non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({ plan })
  } catch (error) {
    console.error('Error fetching plan:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du plan' },
      { status: 500 }
    )
  }
}

// PATCH /api/plans/[id] — Update a plan
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Verify plan exists
    const existing = await db.plan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Plan non trouvé' },
        { status: 404 }
      )
    }

    // If changing name, check uniqueness
    if (body.nom !== undefined && body.nom !== existing.nom) {
      const duplicate = await db.plan.findUnique({ where: { nom: body.nom } })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Un plan avec ce nom existe déjà' },
          { status: 409 }
        )
      }
    }

    // Validate type enum if provided
    if (body.type !== undefined) {
      const validTypes = ['GRATUIT', 'ESSENTIEL', 'PROFESSIONNEL', 'ENTREPRISE']
      if (!validTypes.includes(body.type)) {
        return NextResponse.json(
          { error: `Type invalide. Valeurs acceptées: ${validTypes.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Build update data object — only include fields that are provided
    const data: Record<string, unknown> = {}
    if (body.nom !== undefined) data.nom = body.nom
    if (body.type !== undefined) data.type = body.type
    if (body.prixMensuel !== undefined) data.prixMensuel = parseFloat(body.prixMensuel)
    if (body.prixAnnuel !== undefined) data.prixAnnuel = body.prixAnnuel !== null ? parseFloat(body.prixAnnuel) : null
    if (body.nbEtablissementsMax !== undefined) data.nbEtablissementsMax = body.nbEtablissementsMax
    if (body.nbFilieresMax !== undefined) data.nbFilieresMax = body.nbFilieresMax
    if (body.nbEnseignantsMax !== undefined) data.nbEnseignantsMax = body.nbEnseignantsMax
    if (body.nbEtudiantsMax !== undefined) data.nbEtudiantsMax = body.nbEtudiantsMax
    if (body.nbQuestionsMax !== undefined) data.nbQuestionsMax = body.nbQuestionsMax
    if (body.nbEvaluationsMois !== undefined) data.nbEvaluationsMois = body.nbEvaluationsMois
    if (body.iaGeneration !== undefined) data.iaGeneration = body.iaGeneration
    if (body.iaCorrection !== undefined) data.iaCorrection = body.iaCorrection
    if (body.proctoring !== undefined) data.proctoring = body.proctoring
    if (body.exportPDF !== undefined) data.exportPDF = body.exportPDF
    if (body.support !== undefined) data.support = body.support
    if (body.description !== undefined) data.description = body.description || null
    if (body.actif !== undefined) data.actif = body.actif

    const plan = await db.plan.update({
      where: { id },
      data,
      include: {
        _count: { select: { abonnements: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'Plan',
        entiteId: id,
        details: JSON.stringify({ updatedFields: Object.keys(data) }),
      },
    })

    return NextResponse.json({ plan })
  } catch (error) {
    console.error('Error updating plan:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du plan' },
      { status: 500 }
    )
  }
}

// DELETE /api/plans/[id] — Soft delete a plan (set actif=false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify plan exists
    const existing = await db.plan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Plan non trouvé' },
        { status: 404 }
      )
    }

    // Check if already inactive
    if (!existing.actif) {
      return NextResponse.json(
        { error: 'Ce plan est déjà désactivé' },
        { status: 400 }
      )
    }

    // Soft delete: set actif=false
    const plan = await db.plan.update({
      where: { id },
      data: { actif: false },
      include: {
        _count: { select: { abonnements: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'Plan',
        entiteId: id,
        details: JSON.stringify({
          action: 'DÉSACTIVATION',
          nom: existing.nom,
          type: existing.type,
        }),
      },
    })

    return NextResponse.json({
      message: 'Plan désactivé avec succès',
      plan,
    })
  } catch (error) {
    console.error('Error deleting plan:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la désactivation du plan' },
      { status: 500 }
    )
  }
}
