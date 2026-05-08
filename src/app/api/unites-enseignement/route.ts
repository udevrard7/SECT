import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const VALID_NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT']

// ─── GET /api/unites-enseignement ───
// List UE with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filiereId = searchParams.get('filiereId')
    const niveau = searchParams.get('niveau')
    const semestre = searchParams.get('semestre')
    const actif = searchParams.get('actif')
    const responsableId = searchParams.get('responsableId')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}

    if (filiereId) {
      where.filiereId = filiereId
    }

    if (niveau && VALID_NIVEAUX.includes(niveau)) {
      where.niveau = niveau
    }

    if (semestre) {
      where.semestre = parseInt(semestre, 10)
    }

    if (actif !== null && actif !== '') {
      where.actif = actif === 'true'
    }

    // If responsableId is provided, filter by filières managed by this responsable
    if (responsableId) {
      const filieresDuResponsable = await db.filiere.findMany({
        where: { responsableId },
        select: { id: true },
      })
      const filiereIds = filieresDuResponsable.map((f) => f.id)
      where.filiereId = filiereId
        ? { in: [filiereId].filter((id) => filiereIds.includes(id)) }
        : { in: filiereIds }
    }

    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ]
    }

    const unitesEnseignement = await db.uniteEnseignement.findMany({
      where,
      include: {
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
            niveau: true,
          },
        },
        _count: {
          select: { affectations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ unitesEnseignement })
  } catch (error) {
    console.error('[UNITES_ENSEIGNEMENT_GET]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des unités d\'enseignement' },
      { status: 500 }
    )
  }
}

// ─── POST /api/unites-enseignement ───
// Create a new UE
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      code,
      nom,
      description,
      filiereId,
      niveau,
      semestre,
      creditsECTS,
      volumeHeuresCM,
      volumeHeuresTD,
      volumeHeuresTP,
      obligatoire,
      actif,
    } = body

    // Validate required fields
    if (!code) {
      return NextResponse.json(
        { error: 'Le code de l\'UE est obligatoire' },
        { status: 400 }
      )
    }

    if (!nom) {
      return NextResponse.json(
        { error: 'Le nom de l\'UE est obligatoire' },
        { status: 400 }
      )
    }

    if (!filiereId) {
      return NextResponse.json(
        { error: 'La filière est obligatoire' },
        { status: 400 }
      )
    }

    if (!niveau || !VALID_NIVEAUX.includes(niveau)) {
      return NextResponse.json(
        { error: `Le niveau doit être l'un de : ${VALID_NIVEAUX.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate filiere exists
    const filiere = await db.filiere.findUnique({
      where: { id: filiereId },
    })

    if (!filiere) {
      return NextResponse.json(
        { error: 'Filière introuvable' },
        { status: 404 }
      )
    }

    // Check code uniqueness within filiere
    const existingUE = await db.uniteEnseignement.findFirst({
      where: { code, filiereId },
    })

    if (existingUE) {
      return NextResponse.json(
        { error: `Une UE avec le code "${code}" existe déjà dans cette filière` },
        { status: 409 }
      )
    }

    // Validate semestre if provided
    if (semestre !== undefined && semestre !== null && ![1, 2].includes(semestre)) {
      return NextResponse.json(
        { error: 'Le semestre doit être 1 ou 2' },
        { status: 400 }
      )
    }

    const uniteEnseignement = await db.uniteEnseignement.create({
      data: {
        code,
        nom,
        description: description || null,
        filiereId,
        niveau,
        semestre: semestre || null,
        creditsECTS: creditsECTS || null,
        volumeHeuresCM: volumeHeuresCM ?? 0,
        volumeHeuresTD: volumeHeuresTD ?? 0,
        volumeHeuresTP: volumeHeuresTP ?? 0,
        obligatoire: obligatoire !== undefined ? obligatoire : true,
        actif: actif !== undefined ? actif : true,
      },
      include: {
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
            niveau: true,
          },
        },
        _count: {
          select: { affectations: true },
        },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'UniteEnseignement',
        entiteId: uniteEnseignement.id,
        details: JSON.stringify({ code, nom, filiereId, niveau }),
      },
    })

    return NextResponse.json({ uniteEnseignement }, { status: 201 })
  } catch (error) {
    console.error('[UNITES_ENSEIGNEMENT_POST]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'unité d\'enseignement' },
      { status: 500 }
    )
  }
}
