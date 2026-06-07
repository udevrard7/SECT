import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { requireRole, isAuthError, getAuthenticatedUser } from '@/lib/auth-session'
import { validateCreationPermission } from '@/lib/role-permissions'
import { generateMatricule } from '@/lib/matricule-generator'

/**
 * Generate a secure temporary password (12 chars, mixed case + digits + special)
 */
function generateTempPassword(length = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '!@#$%^&*'
  const all = uppercase + lowercase + digits + special

  let password = ''
  // Ensure at least one of each category
  password += uppercase[crypto.randomInt(uppercase.length)]
  password += lowercase[crypto.randomInt(lowercase.length)]
  password += digits[crypto.randomInt(digits.length)]
  password += special[crypto.randomInt(special.length)]

  // Fill the rest with random chars from all categories
  for (let i = password.length; i < length; i++) {
    password += all[crypto.randomInt(all.length)]
  }

  // Shuffle the password to avoid predictable positions
  const chars = password.split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

// GET /api/users — List users with filters (authenticated users only)
export async function GET(request: NextRequest) {
  try {
    // Auth check — must be authenticated to list users
    const auth = await requireRole(request, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
    if (isAuthError(auth)) return auth

    const authUser = auth as { id: string; role: string; etablissementId: string | null; filiereId: string | null }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const role = searchParams.get('role') || ''
    const actif = searchParams.get('actif') || ''
    const etablissementIdParam = searchParams.get('etablissementId') || ''
    const filiereId = searchParams.get('filiereId') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    // SECURITY: Role-based data isolation
    // ADMIN (SaaS owner): Can ONLY see RESPONSABLE users — no access to ENSEIGNANT/ETUDIANT data
    // RESPONSABLE: Can only see users from their own etablissement
    // ENSEIGNANT: Can only see users from their own etablissement
    if (authUser.role === 'ADMIN') {
      // ADMIN: Only RESPONSABLE users are visible (SaaS owner manages Responsable accounts only)
      where.role = 'RESPONSABLE'
      // If a specific etablissementId is requested, filter by it
      if (etablissementIdParam) {
        where.etablissementId = etablissementIdParam
      }
    } else if (authUser.role === 'RESPONSABLE') {
      // RESPONSABLE: always filter by their own etablissement (ignore client param for security)
      if (authUser.etablissementId) {
        where.etablissementId = authUser.etablissementId
      }
    } else if (authUser.role === 'ENSEIGNANT') {
      // ENSEIGNANT: filter by their own etablissement
      if (authUser.etablissementId) {
        where.etablissementId = authUser.etablissementId
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }
    // SECURITY: ADMIN cannot override the RESPONSABLE filter via role param
    if (role && authUser.role !== 'ADMIN') where.role = role
    if (actif !== '') where.actif = actif === 'true'
    if (filiereId) where.filiereId = filiereId

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          etablissementId: true,
          filiereId: true,
          image: true,
          actif: true,
          mustChangePwd: true,
          matricule: true,
          niveau: true,
          derniereConnexion: true,
          createdAt: true,
          etablissement: { select: { id: true, nom: true } },
          filiere: { select: { id: true, nom: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ])

    return NextResponse.json({ users, total, page, limit })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des utilisateurs' }, { status: 500 })
  }
}

// POST /api/users — Create a new user
export async function POST(request: NextRequest) {
  try {
    // Role-based permission check
    const creator = await getAuthenticatedUser()
    if (!creator) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour créer des utilisateurs' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, email, password, role, etablissementId, filiereId, actif, mode, matricule } = body

    if (!name || !email || !role) {
      return NextResponse.json({ error: 'Champs obligatoires manquants (name, email, role)' }, { status: 400 })
    }

    // Validate that the creator is allowed to create this role
    const permissionError = validateCreationPermission(creator.role, role)
    if (permissionError) {
      return NextResponse.json({ error: permissionError }, { status: 403 })
    }

    // SECURITY: ADMIN cannot create other ADMINs
    if (creator.role === 'ADMIN' && role === 'ADMIN') {
      return NextResponse.json({ error: 'Un administrateur ne peut pas créer un autre administrateur.' }, { status: 403 })
    }

    // For RESPONSABLE creators: auto-set etablissementId from their own establishment
    let resolvedEtablissementId = etablissementId || null
    if (creator.role === 'RESPONSABLE') {
      if (creator.etablissementId) {
        resolvedEtablissementId = creator.etablissementId
      }
    }

    // In invitation mode or no mode, password is required
    if ((!mode || mode === 'invitation') && !password) {
      return NextResponse.json({ error: 'Le mot de passe est requis en mode invitation' }, { status: 400 })
    }

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
    }

    // For ETUDIANT without matricule: auto-generate from établissement format
    let finalMatricule = matricule || null
    if (role === 'ETUDIANT' && !matricule && resolvedEtablissementId) {
      try {
        const etab = await db.etablissement.findUnique({
          where: { id: resolvedEtablissementId },
          select: { nom: true, formatMatricule: true },
        })
        // Count existing students in this establishment to get next counter
        const studentCount = await db.user.count({
          where: { etablissementId: resolvedEtablissementId, role: 'ETUDIANT' },
        })
        const existingMatricules = (await db.user.findMany({
          where: { etablissementId: resolvedEtablissementId, matricule: { not: null } },
          select: { matricule: true },
        })).map(u => u.matricule).filter((m): m is string => m !== null)
        const filiereData = filiereId ? await db.filiere.findUnique({ where: { id: filiereId }, select: { code: true } }) : null
        const { matricule: generated } = generateMatricule({
          format: etab?.formatMatricule,
          etablissementNom: etab?.nom || '',
          filiereCode: filiereData?.code,
          counter: studentCount + 1,
          existingMatricules,
        })
        finalMatricule = generated
      } catch (err) {
        console.error('Auto-generate matricule error:', err)
        // Fall back to no matricule
      }
    } else if (role === 'ETUDIANT' && !matricule && !resolvedEtablissementId) {
      // No establishment: generate random matricule
      const { matricule: generated } = generateMatricule({})
      finalMatricule = generated
    }

    // Check if matricule already exists (if auto-generated or manually provided)
    if (finalMatricule) {
      const existingMatricule = await db.user.findUnique({ where: { matricule: finalMatricule } })
      if (existingMatricule) {
        return NextResponse.json({ error: 'Ce matricule est déjà utilisé' }, { status: 409 })
      }
    }

    let hashedPassword: string
    let temporaryPassword: string | undefined
    let mustChangePwd = false

    if (mode === 'direct') {
      // Direct creation mode: auto-generate temporary password
      temporaryPassword = generateTempPassword()
      hashedPassword = await bcrypt.hash(temporaryPassword, 10)
      mustChangePwd = true
    } else {
      // Invitation mode or default: use provided password
      hashedPassword = await bcrypt.hash(password, 10)
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        etablissementId: resolvedEtablissementId,
        filiereId: filiereId || null,
        actif: actif !== undefined ? actif : true,
        mustChangePwd,
        matricule: finalMatricule,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        etablissementId: true,
        filiereId: true,
        actif: true,
        mustChangePwd: true,
        matricule: true,
        createdAt: true,
        etablissement: { select: { id: true, nom: true } },
        filiere: { select: { id: true, nom: true } },
      },
    })

    // Log audit
    const auditAction = mode === 'direct' ? 'CREATE_USER_DIRECT' : 'CREATE'
    const auditDetails: Record<string, unknown> = { name, email, role }
    if (mode === 'direct') {
      auditDetails.mode = 'direct'
      // Security: do NOT store temporary password in audit logs
    }
    if (finalMatricule) {
      auditDetails.matricule = finalMatricule
    }

    await db.auditLog.create({
      data: {
        action: auditAction,
        entite: 'User',
        entiteId: user.id,
        details: JSON.stringify(auditDetails),
      },
    })

    const response: Record<string, unknown> = { user }
    if (mode === 'direct' && temporaryPassword) {
      response.temporaryPassword = temporaryPassword
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Erreur lors de la création de l\'utilisateur' }, { status: 500 })
  }
}
