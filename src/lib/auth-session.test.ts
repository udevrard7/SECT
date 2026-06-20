import { describe, it, expect } from 'vitest'
import { isAuthError } from '@/lib/auth-session'
import { NextResponse } from 'next/server'

describe('auth-session', () => {
  describe('isAuthError', () => {
    it('should return true for NextResponse error', () => {
      const error = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      expect(isAuthError(error)).toBe(true)
    })

    it('should return false for a valid user object', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        actif: true,
        etablissementId: null,
        filiereId: null,
      }
      expect(isAuthError(user as any)).toBe(false)
    })
  })
})
