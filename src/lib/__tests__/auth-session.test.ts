import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

// Mock the auth options
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}))

// Mock db
vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
  withRetry: vi.fn((fn) => fn()),
}))

import { getAuthSession, isAuthError } from '../auth-session'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

describe('auth-session helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAuthSession', () => {
    it('returns null when no session exists', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null)
      const result = await getAuthSession()
      expect(result).toBeNull()
    })

    it('returns null when session has no user id', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce({ user: {} })
      const result = await getAuthSession()
      expect(result).toBeNull()
    })

    it('returns session when valid', async () => {
      const mockSession = { user: { id: '123', role: 'ADMIN' } }
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)
      const result = await getAuthSession()
      expect(result).toEqual(mockSession)
    })
  })

  describe('isAuthError', () => {
    it('returns true for NextResponse instances', () => {
      const errorResponse = NextResponse.json({ error: 'test' }, { status: 401 })
      expect(isAuthError(errorResponse)).toBe(true)
    })

    it('returns false for regular user objects', () => {
      const user = { id: '1', email: 'test@test.com', name: 'Test', role: 'ADMIN', actif: true, etablissementId: null, filiereId: null }
      expect(isAuthError(user)).toBe(false)
    })
  })
})
