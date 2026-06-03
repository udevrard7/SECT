import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { getUserFromRequest } from '@/lib/auth-helpers'
import { validateCreationPermission } from '@/lib/role-permissions'

// Generate a random password of given length
function generatePassword(length: number = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

// Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

interface ImportUser {
  name: string
  email: string
  password?: string
}

interface ImportError {
  row: number
  email: string
  error: string
}

interface ImportResultUser {
  id: string
  name: string
  email: string
  password: string
  role: string
}

// POST /api/users/import — Bulk import of ETUDIANT or ENSEIGNANT users
export async function POST(request: NextRequest) {
  try {
    // Role-based permission check
    const creator = getUserFromRequest(request)
    if (!creator) {
      return NextResponse.json(
        { error: 'Vous n\'avez pas les permissions pour importer des utilisateurs' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { users, role, filiereId, etablissementId } = body as {
      users: ImportUser[]
      role: string
      filiereId?: string
      etablissementId?: string
    }

    // Validate required fields
    if (!users || !Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { error: 'La liste des utilisateurs est requise et ne peut pas être vide' },
        { status: 400 }
      )
    }

    if (!role || !['ETUDIANT', 'ENSEIGNANT'].includes(role)) {
      return NextResponse.json(
        { error: 'Le rôle doit être ETUDIANT ou ENSEIGNANT' },
        { status: 400 }
      )
    }

    // Validate that the creator is allowed to create this role
    const permissionError = validateCreationPermission(creator.role, role)
    if (permissionError) {
      return NextResponse.json({ error: permissionError }, { status: 403 })
    }

    // For RESPONSABLE creators: auto-set etablissementId from their own establishment
    let resolvedEtablissementId = etablissementId || null
    if (creator.role === 'RESPONSABLE') {
      const creatorUser = await db.user.findUnique({
        where: { id: creator.userId },
        select: { etablissementId: true },
      })
      if (creatorUser?.etablissementId) {
        resolvedEtablissementId = creatorUser.etablissementId
      }
    }

    // Validate filiereId is provided for students if filiereId is given
    if (filiereId && role === 'ENSEIGNANT') {
      return NextResponse.json(
        { error: 'filiereId ne peut pas être assigné à un enseignant' },
        { status: 400 }
      )
    }

    // Verify filiereId exists if provided
    if (filiereId) {
      const filiere = await db.filiere.findUnique({ where: { id: filiereId } })
      if (!filiere) {
        return NextResponse.json(
          { error: 'La filière spécifiée n\'existe pas' },
          { status: 400 }
        )
      }
    }

    // Verify etablissementId exists if resolved
    if (resolvedEtablissementId) {
      const etablissement = await db.etablissement.findUnique({ where: { id: resolvedEtablissementId } })
      if (!etablissement) {
        return NextResponse.json(
          { error: 'L\'établissement spécifié n\'existe pas' },
          { status: 400 }
        )
      }
    }

    const errors: ImportError[] = []
    const importedUsers: ImportResultUser[] = []
    const seenEmails = new Set<string>()

    // Collect all emails to check for existing ones in one query
    const emailsToCheck = users.map((u) => u.email?.trim().toLowerCase()).filter(Boolean)
    const existingUsers = await db.user.findMany({
      where: { email: { in: emailsToCheck } },
      select: { email: true },
    })
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()))

    for (let i = 0; i < users.length; i++) {
      const row = i + 1
      const user = users[i]

      // Validate name
      if (!user.name || !user.name.trim()) {
        errors.push({
          row,
          email: user.email || '',
          error: 'Le nom est requis',
        })
        continue
      }

      // Validate email
      if (!user.email || !user.email.trim()) {
        errors.push({
          row,
          email: '',
          error: 'L\'email est requis',
        })
        continue
      }

      const normalizedEmail = user.email.trim().toLowerCase()

      if (!isValidEmail(normalizedEmail)) {
        errors.push({
          row,
          email: user.email,
          error: 'Format d\'email invalide',
        })
        continue
      }

      // Check for duplicates within the import list
      if (seenEmails.has(normalizedEmail)) {
        errors.push({
          row,
          email: user.email,
          error: 'Email en double dans la liste d\'import',
        })
        continue
      }
      seenEmails.add(normalizedEmail)

      // Check for existing email in the database
      if (existingEmails.has(normalizedEmail)) {
        errors.push({
          row,
          email: user.email,
          error: 'Email déjà utilisé',
        })
        continue
      }

      // Auto-generate password if not provided
      const plainPassword = user.password?.trim() || generatePassword()
      const hashedPassword = await bcrypt.hash(plainPassword, 10)

      try {
        const createdUser = await db.user.create({
          data: {
            name: user.name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role,
            filiereId: filiereId || null,
            etablissementId: resolvedEtablissementId,
            actif: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        })

        importedUsers.push({
          id: createdUser.id,
          name: createdUser.name,
          email: createdUser.email,
          password: plainPassword,
          role: createdUser.role,
        })

        // Remove from existingEmails set to prevent false duplicates
        // (already handled by seenEmails, but just in case)
        existingEmails.add(normalizedEmail)
      } catch (createError) {
        console.error(`Error creating user ${normalizedEmail}:`, createError)
        errors.push({
          row,
          email: user.email,
          error: 'Erreur lors de la création de l\'utilisateur',
        })
      }
    }

    // Log audit for bulk import
    if (importedUsers.length > 0) {
      await db.auditLog.create({
        data: {
          action: 'CREATE',
          entite: 'User',
          details: JSON.stringify({
            type: 'BULK_IMPORT',
            role,
            count: importedUsers.length,
            filiereId: filiereId || null,
            etablissementId: resolvedEtablissementId,
          }),
        },
      })
    }

    return NextResponse.json({
      imported: importedUsers.length,
      errors,
      users: importedUsers,
    })
  } catch (error) {
    console.error('Error importing users:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'import des utilisateurs' },
      { status: 500 }
    )
  }
}
