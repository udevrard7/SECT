import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'ADMIN' | 'RESPONSABLE' | 'ENSEIGNANT' | 'ETUDIANT'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  etablissementId?: string | null
  filiereId?: string | null
  etablissement?: { id: string; nom: string } | null
  filiere?: { id: string; nom: string } | null
  image?: string | null
  actif?: boolean
  matricule?: string | null
  mustChangePwd?: boolean
  derniereConnexion?: string | null
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  mustChangePassword: boolean
  loginPassword: string
  login: (email: string, password: string) => Promise<boolean>
  loginStudent: (matricule: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  clearMustChangePassword: () => void
}

/**
 * Get authentication headers for API requests.
 * Reads user context from the persisted Zustand store via localStorage.
 * This is used to send x-user-id and x-user-role headers to protected API routes.
 */
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const stored = localStorage.getItem('sect-auth')
    if (!stored) return {}

    const parsed = JSON.parse(stored)
    const user = parsed?.state?.user
    if (!user?.id || !user?.role) return {}

    return {
      'x-user-id': user.id,
      'x-user-role': user.role,
    }
  } catch {
    return {}
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      mustChangePassword: false,
      loginPassword: '',

      loginStudent: async (matricule: string, password: string) => {
        set({ isLoading: true })
        try {
          const res = await fetch('/api/auth/login-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matricule, password }),
          })
          if (!res.ok) {
            set({ isLoading: false })
            return false
          }
          const data = await res.json()

          if (data.mustChangePassword) {
            set({
              user: data.user,
              isAuthenticated: true,
              isLoading: false,
              mustChangePassword: true,
              loginPassword: password,
            })
            return true
          }

          set({ user: data.user, isAuthenticated: true, isLoading: false })
          return true
        } catch {
          set({ isLoading: false })
          return false
        }
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          if (!res.ok) {
            set({ isLoading: false })
            return false
          }
          const data = await res.json()

          // Check if user must change password on first login
          if (data.mustChangePassword) {
            set({
              user: data.user,
              isAuthenticated: true,
              isLoading: false,
              mustChangePassword: true,
              loginPassword: password,
            })
            return true
          }

          set({ user: data.user, isAuthenticated: true, isLoading: false })
          return true
        } catch {
          set({ isLoading: false })
          return false
        }
      },

      logout: async () => {
        const currentUser = get().user
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders(),
            },
            body: JSON.stringify({ userId: currentUser?.id }),
          })
        } finally {
          set({ user: null, isAuthenticated: false })
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      clearMustChangePassword: () => set({ mustChangePassword: false, loginPassword: '' }),
    }),
    {
      name: 'sect-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        // mustChangePassword and loginPassword are NOT persisted for security
      }),
    }
  )
)
