import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// GET /api/users — List users with filters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const role = searchParams.get('role') || ''
    const actif = searchParams.get('actif') || ''
    const etablissementId = searchParams.get('etablissementId') || ''
    const filiereId = searchParams.get('filiereId') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (role) where.role = role
    if (actif !== '') where.actif = actif === 'true'
    if (etablissementId) where.etablissementId = etablissementId
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
          derniereConnexion: true,
          createdAt: true,
          etablissement: { select: { id: true, nom: true } },
          filiere: { select: { id: true, nom: true } },
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
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, password, role, etablissementId, filiereId, actif } = body

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
    }

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        etablissementId: etablissementId || null,
        filiereId: filiereId || null,
        actif: actif !== undefined ? actif : true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        etablissementId: true,
        filiereId: true,
        actif: true,
        createdAt: true,
        etablissement: { select: { id: true, nom: true } },
        filiere: { select: { id: true, nom: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'User',
        entiteId: user.id,
        details: JSON.stringify({ name, email, role }),
      },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Erreur lors de la création de l\'utilisateur' }, { status: 500 })
  }
}
