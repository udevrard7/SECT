import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const VALID_NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT']

// ─── GET /api/unites-enseignement ───
// List UE with optional filters — supports multi-filière (propriétaire + partagées)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filiereId = searchParams.get('filiereId')
    const niveau = searchParams.get('niveau')
    const semestre = searchParams.get('semestre')
    const actif = searchParams.get('actif')
    const responsableId = searchParams.get('responsableId')
    const etablissementId = searchParams.get('etablissementId')
    const enseignantId = searchParams.get('enseignantId')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    const andConditions: Record<string, unknown>[] = []

    // ─── Filter by filière: include UEs owned by this filière OR shared with it ───
    if (filiereId) {
      andConditions.push({
        OR: [
          { filiereId },
          { filieresSuppl: { some: { filiereId } } },
        ],
      })
    }

    if (niveau && VALID_NIVEAUX.includes(niveau)) {
      // Filter by niveau — match either the single niveau field OR the niveaux JSON array
      andConditions.push({
        OR: [
          { niveau },
          { niveaux: { contains: `"${niveau}"` } },
        ],
      })
    }

    if (semestre) {
      andConditions.push({ semestre: parseInt(semestre, 10) })
    }

    if (actif !== null && actif !== '') {
      andConditions.push({ actif: actif === 'true' })
    }

    // If etablissementId is provided, filter UEs belonging to filières of this establishment
    // This is used by the RESPONSABLE role who manages the entire establishment
    if (etablissementId) {
      const filieresDeEtablissement = await db.filiere.findMany({
        where: { etablissementId },
        select: { id: true },
      })
      const etabFiliereIds = filieresDeEtablissement.map((f) => f.id)

      if (filiereId) {
        // Intersection: only keep filiereId if it belongs to this establishment
        if (!etabFiliereIds.includes(filiereId)) {
          return NextResponse.json({ unitesEnseignement: [] })
        }
        // Already filtered above — no additional condition needed
      } else {
        // Show UEs owned by OR shared with any of the establishment's filières
        andConditions.push({
          OR: [
            { filiereId: { in: etabFiliereIds } },
            { filieresSuppl: { some: { filiereId: { in: etabFiliereIds } } } },
          ],
        })
      }
    } else if (responsableId) {
      // Legacy: filter by filières where this user is the filière-level responsable
      const filieresDuResponsable = await db.filiere.findMany({
        where: { responsableId },
        select: { id: true },
      })
      const filiereIds = filieresDuResponsable.map((f) => f.id)

      if (filiereId) {
        // Intersection: only keep filiereId if it belongs to this responsable
        if (!filiereIds.includes(filiereId)) {
          return NextResponse.json({ unitesEnseignement: [] })
        }
        // Already filtered above — no additional condition needed
      } else {
        // Show UEs owned by OR shared with any of the responsable's filières
        andConditions.push({
          OR: [
            { filiereId: { in: filiereIds } },
            { filieresSuppl: { some: { filiereId: { in: filiereIds } } } },
          ],
        })
      }
    }

    // If enseignantId is provided, find UEs assigned to this teacher via affectations
    if (enseignantId) {
      const affectations = await db.affectation.findMany({
        where: { enseignantId },
        select: { uniteEnseignementId: true },
      })
      const ueIds = [...new Set(affectations.map((a) => a.uniteEnseignementId))]
      if (ueIds.length > 0) {
        andConditions.push({ id: { in: ueIds } })
      } else {
        return NextResponse.json({ unitesEnseignement: [] })
      }
    }

    if (search) {
      andConditions.push({
        OR: [
          { nom: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    if (andConditions.length > 0) {
      where.AND = andConditions
    }

    const unitesEnseignement = await db.uniteEnseignement.findMany({
      where,
      include: {
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
          },
        },
        filieresSuppl: {
          include: {
            filiere: {
              select: {
                id: true,
                nom: true,
                code: true,
              },
            },
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
// Create a new UE with optional multi-filière sharing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      code,
      nom,
      description,
      filiereId,
      filiereIdsSuppl, // Array of additional filière IDs to share this UE with
      niveau,
      niveaux,
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
        { error: 'La filière propriétaire est obligatoire' },
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

    // Validate supplementary filières exist and are different from the owner
    const validSupplFiliereIds: string[] = []
    if (Array.isArray(filiereIdsSuppl) && filiereIdsSuppl.length > 0) {
      const uniqueSupplIds = [...new Set(filiereIdsSuppl.filter((id: string) => id !== filiereId))]
      if (uniqueSupplIds.length > 0) {
        const supplFilieres = await db.filiere.findMany({
          where: { id: { in: uniqueSupplIds } },
          select: { id: true },
        })
        validSupplFiliereIds.push(...supplFilieres.map(f => f.id))
      }
    }

    // Validate semestre if provided
    if (semestre !== undefined && semestre !== null && ![1, 2].includes(semestre)) {
      return NextResponse.json(
        { error: 'Le semestre doit être 1 ou 2' },
        { status: 400 }
      )
    }

    // Create UE + supplementary filière links in a transaction
    const uniteEnseignement = await db.uniteEnseignement.create({
      data: {
        code,
        nom,
        description: description || null,
        filiereId,
        niveau,
        niveaux: niveaux || null,
        semestre: semestre || null,
        creditsECTS: creditsECTS || null,
        volumeHeuresCM: volumeHeuresCM ?? 0,
        volumeHeuresTD: volumeHeuresTD ?? 0,
        volumeHeuresTP: volumeHeuresTP ?? 0,
        obligatoire: obligatoire !== undefined ? obligatoire : true,
        actif: actif !== undefined ? actif : true,
        filieresSuppl: {
          create: validSupplFiliereIds.map(fid => ({
            filiereId: fid,
          })),
        },
      },
      include: {
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
          },
        },
        filieresSuppl: {
          include: {
            filiere: {
              select: {
                id: true,
                nom: true,
                code: true,
              },
            },
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
        details: JSON.stringify({ code, nom, filiereId, niveau, filiereIdsSuppl: validSupplFiliereIds }),
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
