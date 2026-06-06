import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/plans — List all plans
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const actif = searchParams.get('actif') || ''

    const where: Record<string, unknown> = {}
    if (actif !== '') where.actif = actif === 'true'

    const plans = await db.plan.findMany({
      where,
      include: {
        _count: { select: { abonnements: true } },
      },
      orderBy: { prixMensuel: 'asc' },
    })

    return NextResponse.json({ plans })
  } catch (error) {
    console.error('Error fetching plans:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des plans' }, { status: 500 })
  }
}

// POST /api/plans — Create a new plan (Admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      nom,
      type,
      prixMensuel,
      prixAnnuel,
      nbEtablissementsMax,
      nbFilieresMax,
      nbEnseignantsMax,
      nbEtudiantsMax,
      nbQuestionsMax,
      nbEvaluationsMois,
      iaGeneration,
      iaCorrection,
      proctoring,
      exportPDF,
      support,
      description,
      actif,
    } = body

    if (!nom || !type || prixMensuel === undefined) {
      return NextResponse.json(
        { error: 'Les champs nom, type et prixMensuel sont obligatoires' },
        { status: 400 }
      )
    }

    // Validate type enum
    const validTypes = ['GRATUIT', 'ESSENTIEL', 'PROFESSIONNEL', 'ENTREPRISE']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Type invalide. Valeurs acceptées: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Check unique name
    const existing = await db.plan.findUnique({ where: { nom } })
    if (existing) {
      return NextResponse.json(
        { error: 'Un plan avec ce nom existe déjà' },
        { status: 409 }
      )
    }

    const plan = await db.plan.create({
      data: {
        nom,
        type,
        prixMensuel: parseFloat(prixMensuel),
        prixAnnuel: prixAnnuel !== undefined ? parseFloat(prixAnnuel) : null,
        nbEtablissementsMax: nbEtablissementsMax ?? 1,
        nbFilieresMax: nbFilieresMax ?? 5,
        nbEnseignantsMax: nbEnseignantsMax ?? 10,
        nbEtudiantsMax: nbEtudiantsMax ?? 100,
        nbQuestionsMax: nbQuestionsMax ?? 500,
        nbEvaluationsMois: nbEvaluationsMois ?? 10,
        iaGeneration: iaGeneration !== undefined ? iaGeneration : true,
        iaCorrection: iaCorrection !== undefined ? iaCorrection : false,
        proctoring: proctoring !== undefined ? proctoring : false,
        exportPDF: exportPDF !== undefined ? exportPDF : true,
        support: support || 'email',
        description: description || null,
        actif: actif !== undefined ? actif : true,
      },
      include: {
        _count: { select: { abonnements: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'Plan',
        entiteId: plan.id,
        details: JSON.stringify({ nom, type, prixMensuel }),
      },
    })

    return NextResponse.json({ plan }, { status: 201 })
  } catch (error) {
    console.error('Error creating plan:', error)
    return NextResponse.json({ error: 'Erreur lors de la création du plan' }, { status: 500 })
  }
}
