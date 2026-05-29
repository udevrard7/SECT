import { NextResponse } from 'next/server'

export async function POST() {
  // In a full implementation, this would invalidate the session/token
  // For now, the client-side store handles clearing the auth state
  return NextResponse.json({ message: 'Déconnexion réussie' })
}
