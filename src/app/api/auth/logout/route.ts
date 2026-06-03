import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { userId } = body

    if (userId) {
      // Update derniereConnexion
      await db.user.update({
        where: { id: userId },
        data: { derniereConnexion: new Date() },
      }).catch(() => {
        // User may not exist, ignore error
      })

      // Create audit log for logout
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true },
      })

      if (user) {
        const adresseIp = request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'unknown'

        await db.auditLog.create({
          data: {
            userId: user.id,
            userEmail: user.email,
            action: 'LOGOUT',
            entite: 'User',
            entiteId: user.id,
            details: JSON.stringify({ name: user.name, role: user.role }),
            adresseIp,
          },
        })
      }
    }

    return NextResponse.json({ message: 'Déconnexion réussie' })
  } catch (error) {
    console.error('Logout error:', error)
    // Still return success — client-side store handles clearing the auth state
    return NextResponse.json({ message: 'Déconnexion réussie' })
  }
}
