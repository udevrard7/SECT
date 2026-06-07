import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth-session'

// GET /api/ip-whitelist — List IP whitelist entries
// RESPONSABLE: Only sees entries for their own establishment
// ADMIN: Sees all or filtered by etablissementId
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const etablissementId = searchParams.get('etablissementId') || ''
    const actif = searchParams.get('actif') || ''

    const where: Record<string, unknown> = {}

    // RESPONSABLE: Force filter to their own establishment
    if (authUser.role === 'RESPONSABLE') {
      where.etablissementId = authUser.etablissementId
    } else if (etablissementId) {
      where.etablissementId = etablissementId
    }

    if (actif === 'true') where.actif = true
    else if (actif === 'false') where.actif = false

    const entries = await db.ipWhitelist.findMany({
      where,
      include: {
        etablissement: {
          select: {
            id: true,
            nom: true,
            ville: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('Error fetching IP whitelist:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la liste blanche IP' },
      { status: 500 }
    )
  }
}

// POST /api/ip-whitelist — Add IP to whitelist
// ADMIN: Can add for any establishment
// RESPONSABLE: Can add for their own establishment only
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (authUser.role !== 'ADMIN' && authUser.role !== 'RESPONSABLE') {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 })
    }

    const body = await request.json()
    const { adresseIp, description, etablissementId, creePar } = body

    // RESPONSABLE: Force etablissementId to their own
    const targetEtablissementId = authUser.role === 'RESPONSABLE'
      ? authUser.etablissementId
      : etablissementId

    // Validate required fields
    if (!adresseIp) {
      return NextResponse.json(
        { error: 'Le champ adresseIp est obligatoire' },
        { status: 400 }
      )
    }

    // Basic IP validation (IPv4 or IPv6)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/
    if (!ipv4Regex.test(adresseIp) && !ipv6Regex.test(adresseIp)) {
      return NextResponse.json(
        { error: 'Adresse IP invalide. Format attendu: IPv4 (ex: 192.168.1.1) ou IPv6, avec ou sans CIDR' },
        { status: 400 }
      )
    }

    // Check for duplicate
    const existing = await db.ipWhitelist.findUnique({
      where: { adresseIp },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Cette adresse IP existe déjà dans la liste blanche' },
        { status: 409 }
      )
    }

    // Verify etablissement exists if provided
    if (targetEtablissementId) {
      const etablissement = await db.etablissement.findUnique({
        where: { id: targetEtablissementId },
      })
      if (!etablissement) {
        return NextResponse.json(
          { error: 'Établissement non trouvé' },
          { status: 404 }
        )
      }
    }

    const entry = await db.ipWhitelist.create({
      data: {
        adresseIp,
        description: description || null,
        etablissementId: targetEtablissementId || null,
        creePar: creePar || authUser.id || null,
        actif: true,
      },
      include: {
        etablissement: {
          select: {
            id: true,
            nom: true,
            ville: true,
          },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'CREATE_IP_WHITELIST',
        entite: 'IpWhitelist',
        entiteId: entry.id,
        details: JSON.stringify({
          adresseIp,
          etablissementId: etablissementId || null,
          description: description || null,
        }),
      },
    })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    console.error('Error adding IP to whitelist:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout de l\'adresse IP à la liste blanche' },
      { status: 500 }
    )
  }
}
