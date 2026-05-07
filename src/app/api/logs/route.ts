import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/logs — List audit logs
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || ''
    const entite = searchParams.get('entite') || ''
    const search = searchParams.get('search') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (action) where.action = action
    if (entite) where.entite = entite
    if (search) {
      where.userEmail = { contains: search, mode: 'insensitive' }
    }
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {}
      if (dateFrom) createdAt.gte = new Date(dateFrom)
      if (dateTo) createdAt.lte = new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000) // end of day
      where.createdAt = createdAt
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ])

    return NextResponse.json({ logs, total, page, limit })
  } catch (error) {
    console.error('Error fetching logs:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des logs' }, { status: 500 })
  }
}
