import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/monitoring/[id] — Resolve a monitoring event
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, resoluPar, message, severite, source, duree } = body

    // Verify event exists
    const existing = await db.monitoringEvent.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Événement de monitoring non trouvé' },
        { status: 404 }
      )
    }

    // Action: resolve the event
    if (action === 'resoudre') {
      if (existing.statut === 'RESOLU') {
        return NextResponse.json(
          { error: 'Cet événement est déjà résolu' },
          { status: 400 }
        )
      }

      const event = await db.monitoringEvent.update({
        where: { id },
        data: {
          statut: 'RESOLU',
          resoluLe: new Date(),
          resoluPar: resoluPar || null,
        },
      })

      await db.auditLog.create({
        data: {
          action: 'RESOLVE_MONITORING',
          entite: 'MonitoringEvent',
          entiteId: id,
          details: JSON.stringify({
            type: existing.type,
            severite: existing.severite,
            message: existing.message,
            resoluPar: resoluPar || null,
          }),
        },
      })

      return NextResponse.json({
        event: {
          ...event,
          details: event.details ? JSON.parse(event.details) : null,
        },
        message: 'Événement résolu',
      })
    }

    // General update of event fields
    const updateData: Record<string, unknown> = {}

    if (message !== undefined) updateData.message = message
    if (severite !== undefined) {
      const validSeverites = ['INFO', 'WARNING', 'ERROR', 'CRITICAL']
      if (!validSeverites.includes(severite)) {
        return NextResponse.json(
          { error: `Sévérité invalide. Valeurs acceptées: ${validSeverites.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.severite = severite
    }
    if (source !== undefined) updateData.source = source || null
    if (duree !== undefined) updateData.duree = duree || null
    if (body.details !== undefined) updateData.details = JSON.stringify(body.details)

    const event = await db.monitoringEvent.update({
      where: { id },
      data: updateData,
    })

    await db.auditLog.create({
      data: {
        action: 'UPDATE_MONITORING',
        entite: 'MonitoringEvent',
        entiteId: id,
        details: JSON.stringify({
          champsModifies: Object.keys(updateData),
        }),
      },
    })

    return NextResponse.json({
      event: {
        ...event,
        details: event.details ? JSON.parse(event.details) : null,
      },
      message: 'Événement mis à jour',
    })
  } catch (error) {
    console.error('Error updating monitoring event:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'événement de monitoring' },
      { status: 500 }
    )
  }
}

// DELETE /api/monitoring/[id] — Ignore a monitoring event (set statut=IGNORE)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify event exists
    const existing = await db.monitoringEvent.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Événement de monitoring non trouvé' },
        { status: 404 }
      )
    }

    if (existing.statut === 'IGNORE') {
      return NextResponse.json(
        { error: 'Cet événement est déjà ignoré' },
        { status: 400 }
      )
    }

    const event = await db.monitoringEvent.update({
      where: { id },
      data: { statut: 'IGNORE' },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'IGNORE_MONITORING',
        entite: 'MonitoringEvent',
        entiteId: id,
        details: JSON.stringify({
          type: existing.type,
          severite: existing.severite,
          message: existing.message,
          ancienStatut: existing.statut,
          action: 'IGNORE',
        }),
      },
    })

    return NextResponse.json({
      message: 'Événement ignoré',
      event: {
        ...event,
        details: event.details ? JSON.parse(event.details) : null,
      },
    })
  } catch (error) {
    console.error('Error ignoring monitoring event:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'ignorance de l\'événement de monitoring' },
      { status: 500 }
    )
  }
}
