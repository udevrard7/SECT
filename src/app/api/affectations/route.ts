import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const VALID_TYPES_SEANCE = ['CM', 'TD', 'TP']
const VALID_STATUTS = ['PROVISOIRE', 'VALIDEE', 'PUBLIEE']

// ─── GET /api/affectations ───
// List affectations with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const filiereId = searchParams.get('filiereId')
    const niveau = searchParams.get('niveau')
    const anneeUniversitaire = searchParams.get('anneeUniversitaire')
    const statut = searchParams.get('statut')
    const responsableId = searchParams.get('responsableId')

    const where: Record<string, unknown> = {}

    if (enseignantId) {
      where.enseignantId = enseignantId
    }

    if (anneeUniversitaire) {
      where.anneeUniversitaire = anneeUniversitaire
    }

    if (statut && VALID_STATUTS.includes(statut)) {
      where.statut = statut
    }

    // Filter by filiereId — needs to join through UniteEnseignement
    const uniteEnseignementWhere: Record<string, unknown> = {}

    if (filiereId) {
      uniteEnseignementWhere.filiereId = filiereId
    }

    if (niveau) {
      uniteEnseignementWhere.niveau = niveau
    }

    // If responsableId is provided, find filières managed by this responsable
    if (responsableId) {
      const filieresDuResponsable = await db.filiere.findMany({
        where: { responsableId },
        select: { id: true },
      })
      const responsableFiliereIds = filieresDuResponsable.map((f) => f.id)

      if (filiereId) {
        // Intersection: only keep filiereId if it belongs to this responsable
        uniteEnseignementWhere.filiereId = responsableFiliereIds.includes(filiereId)
          ? filiereId
          : '___none___' // force no results
      } else {
        uniteEnseignementWhere.filiereId = { in: responsableFiliereIds }
      }
    }

    // Only add uniteEnseignement filter if there are conditions
    if (Object.keys(uniteEnseignementWhere).length > 0) {
      where.uniteEnseignement = uniteEnseignementWhere
    }

    const affectations = await db.affectation.findMany({
      where,
      include: {
        enseignant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        uniteEnseignement: {
          include: {
            filiere: {
              select: {
                id: true,
                nom: true,
                code: true,
                niveau: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ affectations })
  } catch (error) {
    console.error('[AFFECTATIONS_GET]', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des affectations' },
      { status: 500 }
    )
  }
}

// ─── POST /api/affectations ───
// Create a new affectation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      enseignantId,
      uniteEnseignementId,
      typeSeance,
      groupe,
      volumeHeures,
      anneeUniversitaire,
      commentaire,
    } = body

    // Validate required fields
    if (!enseignantId) {
      return NextResponse.json(
        { error: 'L\'identifiant de l\'enseignant est obligatoire' },
        { status: 400 }
      )
    }

    if (!uniteEnseignementId) {
      return NextResponse.json(
        { error: 'L\'identifiant de l\'unité d\'enseignement est obligatoire' },
        { status: 400 }
      )
    }

    if (!typeSeance || !VALID_TYPES_SEANCE.includes(typeSeance)) {
      return NextResponse.json(
        { error: `Le type de séance doit être l'un de : ${VALID_TYPES_SEANCE.join(', ')}` },
        { status: 400 }
      )
    }

    if (volumeHeures === undefined || volumeHeures === null || volumeHeures <= 0) {
      return NextResponse.json(
        { error: 'Le volume horaire doit être un nombre positif' },
        { status: 400 }
      )
    }

    if (!anneeUniversitaire) {
      return NextResponse.json(
        { error: 'L\'année universitaire est obligatoire' },
        { status: 400 }
      )
    }

    // Validate enseignant exists and has role ENSEIGNANT
    const enseignant = await db.user.findUnique({
      where: { id: enseignantId },
    })

    if (!enseignant) {
      return NextResponse.json(
        { error: 'Enseignant introuvable' },
        { status: 404 }
      )
    }

    if (enseignant.role !== 'ENSEIGNANT') {
      return NextResponse.json(
        { error: `L'utilisateur "${enseignant.name}" n'a pas le rôle ENSEIGNANT (rôle actuel : ${enseignant.role})` },
        { status: 400 }
      )
    }

    // Validate uniteEnseignement exists
    const uniteEnseignement = await db.uniteEnseignement.findUnique({
      where: { id: uniteEnseignementId },
    })

    if (!uniteEnseignement) {
      return NextResponse.json(
        { error: 'Unité d\'enseignement introuvable' },
        { status: 404 }
      )
    }

    // Check unique constraint (enseignantId + uniteEnseignementId + typeSeance + groupe + anneeUniversitaire)
    const existingAffectation = await db.affectation.findFirst({
      where: {
        enseignantId,
        uniteEnseignementId,
        typeSeance,
        groupe: groupe || null,
        anneeUniversitaire,
      },
    })

    if (existingAffectation) {
      return NextResponse.json(
        { error: 'Une affectation existe déjà pour cet enseignant, cette UE, ce type de séance, ce groupe et cette année universitaire' },
        { status: 409 }
      )
    }

    const affectation = await db.affectation.create({
      data: {
        enseignantId,
        uniteEnseignementId,
        typeSeance,
        groupe: groupe || null,
        volumeHeures,
        anneeUniversitaire,
        commentaire: commentaire || null,
        statut: 'PROVISOIRE',
      },
      include: {
        enseignant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        uniteEnseignement: {
          include: {
            filiere: {
              select: {
                id: true,
                nom: true,
                code: true,
                niveau: true,
              },
            },
          },
        },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'Affectation',
        entiteId: affectation.id,
        details: JSON.stringify({
          enseignantId,
          uniteEnseignementId,
          typeSeance,
          groupe: groupe || null,
          volumeHeures,
          anneeUniversitaire,
        }),
      },
    })

    return NextResponse.json({ affectation }, { status: 201 })
  } catch (error) {
    console.error('[AFFECTATIONS_POST]', error)
    // Handle Prisma unique constraint violation
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Une affectation avec cette combinaison existe déjà' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'affectation' },
      { status: 500 }
    )
  }
}
