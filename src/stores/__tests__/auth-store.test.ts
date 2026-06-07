import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../auth-store'
import type { UserRole } from '../auth-store'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

describe('auth-store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      mustChangePassword: false,
    })
    vi.clearAllMocks()
  })

  it('starts with unauthenticated state', () => {
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.mustChangePassword).toBe(false)
  })

  it('setUser updates user and isAuthenticated', () => {
    const testUser = {
      id: '1',
      email: 'test@test.com',
      name: 'Test User',
      role: 'ADMIN' as UserRole,
    }
    useAuthStore.getState().setUser(testUser)

    const state = useAuthStore.getState()
    expect(state.user).toEqual(testUser)
    expect(state.isAuthenticated).toBe(true)
  })

  it('setUser with null clears authentication', () => {
    useAuthStore.getState().setUser({
      id: '1',
      email: 'test@test.com',
      name: 'Test User',
      role: 'ADMIN' as UserRole,
    })
    useAuthStore.getState().setUser(null)

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('clearMustChangePassword resets the flag', () => {
    useAuthStore.setState({ mustChangePassword: true })
    useAuthStore.getState().clearMustChangePassword()

    expect(useAuthStore.getState().mustChangePassword).toBe(false)
  })

  it('syncFromSession populates user from session data', () => {
    const mockSession = {
      user: {
        id: 'session-1',
        email: 'session@test.com',
        name: 'Session User',
        role: 'ENSEIGNANT',
        etablissementId: 'etab-1',
        filiereId: null,
        etablissement: { id: 'etab-1', nom: 'Test Etab' },
        filiere: null,
        image: null,
        actif: true,
        matricule: null,
        mustChangePwd: false,
      },
    }
    useAuthStore.getState().syncFromSession(mockSession)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.id).toBe('session-1')
    expect(state.user?.role).toBe('ENSEIGNANT')
  })

  it('syncFromSession with null session clears state', () => {
    useAuthStore.getState().setUser({
      id: '1',
      email: 'test@test.com',
      name: 'Test',
      role: 'ADMIN' as UserRole,
    })
    useAuthStore.getState().syncFromSession(null)

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
  })
})
