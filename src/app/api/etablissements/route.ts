import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { requireRole, isAuthError } from '@/lib/auth-middleware'
import { getUserFromRequest } from '@/lib/auth-helpers'

// GET /api/etablissements — List etablissements
// ADMIN: Sees all establishments (platform owner), but only metadata — no user/filiere data without authorization
// RESPONSABLE: Sees only their own establishment with full details
export async function GET(request: NextRequest) {
  try {
    const authUser = getUserFromRequest(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''
    const actif = searchParams.get('actif') || ''

    const where: Record<string, unknown> = {}

    // RESPONSABLE: Only see their own establishment
    if (authUser.role === 'RESPONSABLE') {
      if (authUser.etablissementId) {
        where.id = authUser.etablissementId
      } else {
        // No establishment linked — return empty
        return NextResponse.json({ etablissements: [] })
      }
    }

    // ADMIN: Sees all establishments (no filter by id)

    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { ville: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (type) where.type = type
    if (actif !== '') where.actif = actif === 'true'

    const etablissements = await db.etablissement.findMany({
      where,
      include: {
        _count: { select: { filieres: true, users: true } },
        abonnements: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { plan: { select: { nom: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // ADMIN: Check which establishments the admin has authorized access to
    if (authUser.role === 'ADMIN') {
      const adminAccesses = await db.etablissementAccess.findMany({
        where: {
          adminId: authUser.userId,
          statut: 'APPROUVE',
        },
        select: { etablissementId: true },
      })
      const authorizedIds = new Set(adminAccesses.map(a => a.etablissementId))

      // For ADMIN: Add adminHasAccess flag and get the responsable info
      const etabsWithAccess = await Promise.all(
        etablissements.map(async (etab) => {
          const hasAccess = authorizedIds.has(etab.id)
          // Get responsable info for this establishment (ADMIN can see who manages it)
          const responsable = await db.user.findFirst({
            where: { etablissementId: etab.id, role: 'RESPONSABLE' },
            select: { id: true, name: true, email: true, actif: true, derniereConnexion: true },
          })
          return {
            ...etab,
            adminHasAccess: hasAccess,
            responsable,
          }
        })
      )

      return NextResponse.json({ etablissements: etabsWithAccess })
    }

    return NextResponse.json({ etablissements })
  } catch (error) {
    console.error('Error fetching etablissements:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 })
  }
}

// POST /api/etablissements — Create an etablissement (ADMIN ONLY)
// Admin = propriétaire SaaS, non lié à un établissement (etablissementId = null)
export async function POST(request: NextRequest) {
  try {
    // ─── ADMIN ONLY ───
    const auth = await requireRole(request, ['ADMIN'])
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const {
      nom, type, ville, pays, adresse, telephone, email, siteWeb,
      actif, formatMatricule, exempleMatricule, regexMatricule,
      // Responsable info
      responsableNom, responsableEmail, responsableTelephone,
      // Abonnement info
      planId, periodeFacturation,
    } = body

    if (!nom) {
      return NextResponse.json({ error: 'Le nom est obligatoire' }, { status: 400 })
    }

    // ─── Validation: Admin must NOT be linked to an etablissement ───
    if (auth.etablissementId) {
      return NextResponse.json(
        { error: 'Un administrateur lié à un établissement ne peut pas créer de nouveaux établissements.' },
        { status: 403 }
      )
    }

    // ─── Responsable fields are REQUIRED for creation ───
    if (!responsableNom || !responsableEmail) {
      return NextResponse.json(
        { error: 'Les informations du responsable (nom et email) sont obligatoires.' },
        { status: 400 }
      )
    }

    // Validate email format for responsable
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(responsableEmail)) {
      return NextResponse.json({ error: 'L\'email du responsable est invalide.' }, { status: 400 })
    }

    // ─── Plan is REQUIRED for creation ───
    if (!planId) {
      return NextResponse.json(
        { error: 'La sélection d\'un plan d\'abonnement est obligatoire.' },
        { status: 400 }
      )
    }

    // Check unique name
    const existing = await db.etablissement.findUnique({ where: { nom } })
    if (existing) {
      return NextResponse.json({ error: 'Un établissement avec ce nom existe déjà' }, { status: 409 })
    }

    // Verify plan exists
    const plan = await db.plan.findUnique({ where: { id: planId } })
    if (!plan) {
      return NextResponse.json({ error: 'Plan d\'abonnement non trouvé.' }, { status: 400 })
    }

    // ─── Create Etablissement ───
    const etablissement = await db.etablissement.create({
      data: {
        nom,
        type: type || null,
        ville: ville || null,
        pays: pays || "Côte d'Ivoire",
        adresse: adresse || null,
        telephone: telephone || null,
        email: email || null,
        siteWeb: siteWeb || null,
        actif: actif !== undefined ? actif : true,
        formatMatricule: formatMatricule || null,
        exempleMatricule: exempleMatricule || null,
        regexMatricule: regexMatricule || null,
      },
      include: {
        _count: { select: { filieres: true, users: true } },
      },
    })

    // ─── Auto-create Responsable (ADMIN is the ONLY one who can do this) ───
    let responsable: { id: string; name: string; email: string; temporaryPassword: string } | null = null

    // Check if a responsable already exists for this etablissement
    const existingResp = await db.user.findFirst({
      where: { etablissementId: etablissement.id, role: 'RESPONSABLE' },
    })

    if (existingResp) {
      // A responsable already exists for this etablissement — link them
      responsable = { id: existingResp.id, name: existingResp.name, email: existingResp.email, temporaryPassword: '' }
    } else {
      // Check if the email is already used by another user (but NOT an ADMIN)
      const existingUser = await db.user.findUnique({ where: { email: responsableEmail } })
      if (existingUser) {
        // SECURITY: Do NOT allow role change on existing users (prevents admin takeover)
        if (existingUser.role === 'ADMIN') {
          return NextResponse.json(
            { error: 'Cet email appartient à un administrateur. Impossible de le réassigner.' },
            { status: 409 }
          )
        }
        // If the user has another role, reject to avoid confusion
        return NextResponse.json(
          { error: `Cet email est déjà utilisé par un ${existingUser.role.toLowerCase()}. Utilisez un autre email.` },
          { status: 409 }
        )
      }

      // Generate a SECURE temporary password using crypto.randomInt
      const temporaryPassword = generateTempPassword()
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10)

      const newResponsable = await db.user.create({
        data: {
          name: responsableNom,
          email: responsableEmail,
          password: hashedPassword,
          role: 'RESPONSABLE',
          etablissementId: etablissement.id,
          actif: true,
          mustChangePwd: true,
        },
      })

      responsable = {
        id: newResponsable.id,
        name: newResponsable.name,
        email: newResponsable.email,
        temporaryPassword,
      }

      // Audit (without password in logs)
      await db.auditLog.create({
        data: {
          userId: auth.id,
          userEmail: auth.email,
          action: 'CREATE_RESPONSABLE_AUTO',
          entite: 'User',
          entiteId: newResponsable.id,
          details: JSON.stringify({
            name: responsableNom,
            email: responsableEmail,
            role: 'RESPONSABLE',
            etablissementId: etablissement.id,
            etablissementNom: etablissement.nom,
            createdByAdmin: true,
          }),
        },
      })
    }

    // ─── Auto-create Abonnement ───
    const dateDebut = new Date()
    let dateFin: Date | null = null

    // Calculate end date based on billing period
    if (periodeFacturation === 'annuel' && plan.prixAnnuel) {
      dateFin = new Date(dateDebut)
      dateFin.setFullYear(dateFin.getFullYear() + 1)
    } else if (plan.prixMensuel > 0) {
      dateFin = new Date(dateDebut)
      dateFin.setMonth(dateDebut.getMonth() + 1)
    }
    // For GRATUIT plan, dateFin stays null (no expiry)

    const montantPaye = periodeFacturation === 'annuel' && plan.prixAnnuel
      ? plan.prixAnnuel
      : plan.prixMensuel

    const abonnement = await db.abonnement.create({
      data: {
        etablissementId: etablissement.id,
        planId: plan.id,
        statut: plan.type === 'GRATUIT' ? 'ACTIF' : 'ESSAI',
        dateDebut,
        dateFin,
        periodeEssaiJours: plan.type === 'GRATUIT' ? 0 : 14,
        montantPaye,
        renouvellementAuto: true,
      },
      include: {
        plan: {
          select: { id: true, nom: true, type: true, prixMensuel: true, prixAnnuel: true },
        },
      },
    })

    // Audit for etablissement + abonnement creation
    await db.auditLog.create({
      data: {
        userId: auth.id,
        userEmail: auth.email,
        action: 'CREATE_ETABLISSEMENT_WITH_ABO',
        entite: 'Etablissement',
        entiteId: etablissement.id,
        details: JSON.stringify({
          nom, type, ville,
          responsableCreated: !!responsable,
          abonnementId: abonnement.id,
          planId: plan.id,
          planNom: plan.nom,
          periodeFacturation,
          montantPaye,
          dateDebut,
          dateFin,
        }),
      },
    })

    return NextResponse.json({
      etablissement,
      responsable,
      abonnement,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating etablissement:', error)
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 })
  }
}

/**
 * Generate a secure temporary password using crypto.randomInt
 */
function generateTempPassword(length = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '!@#$%^&*'
  const all = uppercase + lowercase + digits + special

  let password = ''
  password += uppercase[crypto.randomInt(uppercase.length)]
  password += lowercase[crypto.randomInt(lowercase.length)]
  password += digits[crypto.randomInt(digits.length)]
  password += special[crypto.randomInt(special.length)]

  for (let i = password.length; i < length; i++) {
    password += all[crypto.randomInt(all.length)]
  }

  const chars = password.split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}
