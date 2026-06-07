import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'
import { getAuthenticatedUser } from '@/lib/auth-session'
import { validateCreationPermission } from '@/lib/role-permissions'

const VALID_ROLES = ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT']

// GET /api/invitations — List invitations with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const createdById = searchParams.get('createdById') || ''
    const etablissementId = searchParams.get('etablissementId') || ''
    const email = searchParams.get('email') || ''
    const used = searchParams.get('used') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (createdById) where.createdById = createdById
    if (etablissementId) where.etablissementId = etablissementId
    if (email) where.email = { contains: email, mode: 'insensitive' }
    if (used !== '') where.used = used === 'true'

    const [invitations, total] = await Promise.all([
      db.invitation.findMany({
        where,
        include: {
          User: { select: { id: true, name: true, email: true } },
          Etablissement: { select: { id: true, nom: true } },
          Filiere: { select: { id: true, nom: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.invitation.count({ where }),
    ])

    return NextResponse.json({ invitations, total, page, limit })
  } catch (error) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des invitations' },
      { status: 500 }
    )
  }
}

// POST /api/invitations — Create an invitation
export async function POST(request: NextRequest) {
  try {
    // Role-based permission check from session
    const creatorContext = await getAuthenticatedUser()
    if (!creatorContext) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour créer des invitations' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, role, name, etablissementId, filiereId, createdById } = body

    if (!email || !role) {
      return NextResponse.json(
        { error: 'Email et rôle sont obligatoires' },
        { status: 400 }
      )
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Rôle invalide. Rôles valides : ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate that the creator is allowed to create this role
    const permissionError = validateCreationPermission(creatorContext.role, role)
    if (permissionError) {
      return NextResponse.json({ error: permissionError }, { status: 403 })
    }

    // Use the authenticated user's ID as createdById (from session, not from body)
    const effectiveCreatedById = creatorContext.id

    // For RESPONSABLE creators: auto-set etablissementId from their own establishment
    let resolvedEtablissementId = etablissementId || null
    if (creatorContext.role === 'RESPONSABLE') {
      if (creatorContext.etablissementId) {
        resolvedEtablissementId = creatorContext.etablissementId
      }
    }

    // Check if a user with this email already exists
    const existingUser = await db.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Un utilisateur avec cet email existe déjà' },
        { status: 409 }
      )
    }

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 48 hours from now

    const invitation = await db.invitation.create({
      data: {
        id: crypto.randomUUID(),
        token,
        email,
        role,
        name: name || null,
        etablissementId: resolvedEtablissementId,
        filiereId: filiereId || null,
        expiresAt,
        createdById: effectiveCreatedById,
      },
      include: {
        User: { select: { id: true, name: true, email: true } },
        Etablissement: { select: { id: true, nom: true } },
        Filiere: { select: { id: true, nom: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        userId: effectiveCreatedById,
        action: 'CREATE',
        entite: 'Invitation',
        entiteId: invitation.id,
        details: JSON.stringify({ email, role, name }),
      },
    })

    // In a real app, send invitation email with the token link.
    // For testing, include the token in the response.
    return NextResponse.json(
      { invitation, token },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'invitation' },
      { status: 500 }
    )
  }
}
