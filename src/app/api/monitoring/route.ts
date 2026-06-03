import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/monitoring — List monitoring events with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || ''
    const severite = searchParams.get('severite') || ''
    const statut = searchParams.get('statut') || ''
    const source = searchParams.get('source') || ''
    const dateDebut = searchParams.get('dateDebut') || ''
    const dateFin = searchParams.get('dateFin') || ''
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}

    if (type) {
      const validTypes = ['API', 'DATABASE', 'AUTH', 'EVALUATION', 'PAYMENT', 'SYSTEM']
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Type invalide. Valeurs acceptées: ${validTypes.join(', ')}` },
          { status: 400 }
        )
      }
      where.type = type
    }

    if (severite) {
      const validSeverites = ['INFO', 'WARNING', 'ERROR', 'CRITICAL']
      if (!validSeverites.includes(severite)) {
        return NextResponse.json(
          { error: `Sévérité invalide. Valeurs acceptées: ${validSeverites.join(', ')}` },
          { status: 400 }
        )
      }
      where.severite = severite
    }

    if (statut) {
      const validStatuts = ['ACTIF', 'RESOLU', 'IGNORE']
      if (!validStatuts.includes(statut)) {
        return NextResponse.json(
          { error: `Statut invalide. Valeurs acceptées: ${validStatuts.join(', ')}` },
          { status: 400 }
        )
      }
      where.statut = statut
    }

    if (source) {
      where.source = source
    }

    if (dateDebut || dateFin) {
      const dateFilter: Record<string, Date> = {}
      if (dateDebut) dateFilter.gte = new Date(dateDebut)
      if (dateFin) dateFilter.lte = new Date(dateFin)
      where.createdAt = dateFilter
    }

    const [events, total] = await Promise.all([
      db.monitoringEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.monitoringEvent.count({ where }),
    ])

    // Parse details JSON for each event
    const parsedEvents = events.map((e) => ({
      ...e,
      details: e.details ? JSON.parse(e.details) : null,
    }))

    // Stats summary
    const activeCount = await db.monitoringEvent.count({ where: { statut: 'ACTIF' } })
    const criticalCount = await db.monitoringEvent.count({
      where: { severite: 'CRITICAL', statut: 'ACTIF' },
    })
    const errorCount = await db.monitoringEvent.count({
      where: { severite: 'ERROR', statut: 'ACTIF' },
    })

    return NextResponse.json({
      events: parsedEvents,
      total,
      stats: {
        activeCount,
        criticalCount,
        errorCount,
      },
    })
  } catch (error) {
    console.error('Error fetching monitoring events:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des événements de monitoring' },
      { status: 500 }
    )
  }
}

// POST /api/monitoring — Create a monitoring event (for system events)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      type,
      severite,
      message,
      details,
      source,
      duree,
    } = body

    // Validate required fields
    if (!type || !message) {
      return NextResponse.json(
        { error: 'Les champs type et message sont obligatoires' },
        { status: 400 }
      )
    }

    // Validate type
    const validTypes = ['API', 'DATABASE', 'AUTH', 'EVALUATION', 'PAYMENT', 'SYSTEM']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Type invalide. Valeurs acceptées: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate severite if provided
    const eventSeverite = severite || 'INFO'
    const validSeverites = ['INFO', 'WARNING', 'ERROR', 'CRITICAL']
    if (!validSeverites.includes(eventSeverite)) {
      return NextResponse.json(
        { error: `Sévérité invalide. Valeurs acceptées: ${validSeverites.join(', ')}` },
        { status: 400 }
      )
    }

    const event = await db.monitoringEvent.create({
      data: {
        type,
        severite: eventSeverite,
        message,
        details: details ? JSON.stringify(details) : null,
        source: source || null,
        duree: duree || null,
        statut: 'ACTIF',
      },
    })

    // Log audit for critical/error events
    if (eventSeverite === 'CRITICAL' || eventSeverite === 'ERROR') {
      await db.auditLog.create({
        data: {
          action: 'MONITORING_EVENT',
          entite: 'MonitoringEvent',
          entiteId: event.id,
          details: JSON.stringify({
            type,
            severite: eventSeverite,
            message,
            source,
          }),
        },
      })
    }

    return NextResponse.json({
      event: {
        ...event,
        details: event.details ? JSON.parse(event.details) : null,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating monitoring event:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'événement de monitoring' },
      { status: 500 }
    )
  }
}
