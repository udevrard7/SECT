import { create } from 'zustand'

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

export interface LoginError {
  status: number
  message: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  mustChangePassword: boolean
  login: (identifier: string, password: string) => Promise<boolean>
  loginStudent: (matricule: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  clearMustChangePassword: () => void
  syncFromSession: (session: any) => void
  refreshSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  mustChangePassword: false,

  login: async (identifier: string, password: string) => {
    set({ isLoading: true })
    try {
      const resp = await fetch('/api/go-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })

      const data = await resp.json()

      if (!resp.ok) {
        set({ isLoading: false })
        throw { status: resp.status, message: data.error || 'Identifiants incorrects' } as LoginError
      }

      if (data.user) {
        const user: AuthUser = {
          id: data.user.id,
          email: data.user.email ?? '',
          name: data.user.name ?? '',
          role: data.user.role as UserRole,
          etablissementId: data.user.etablissementId ?? null,
          filiereId: data.user.filiereId ?? null,
          etablissement: null,
          filiere: null,
          image: data.user.image ?? null,
          actif: data.user.actif,
          matricule: data.user.matricule ?? null,
          mustChangePwd: data.user.mustChangePwd,
          derniereConnexion: data.user.derniereConnexion ?? null,
        }

        set({ user, isAuthenticated: true, isLoading: false, mustChangePassword: user.mustChangePwd || false })
        return true
      }

      set({ isLoading: false })
      return false
    } catch (error: any) {
      set({ isLoading: false })
      if (error.status) throw error
      throw { status: 0, message: 'Erreur de connexion' } as LoginError
    }
  },

  loginStudent: async (matricule: string, password: string) => {
    return get().login(matricule, password)
  },

  logout: async () => {
    try {
      await fetch('/api/go-auth/logout', { method: 'POST' })
    } catch {}
    set({ user: null, isAuthenticated: false, mustChangePassword: false })
  },

  setUser: (user: AuthUser | null) => set({ user, isAuthenticated: !!user }),

  clearMustChangePassword: () => set({ mustChangePassword: false }),

  syncFromSession: (session: any) => {
    if (session?.user) {
      const user: AuthUser = {
        id: session.user.id,
        email: session.user.email ?? '',
        name: session.user.name ?? '',
        role: session.user.role as UserRole,
        etablissementId: session.user.etablissementId ?? null,
        filiereId: session.user.filiereId ?? null,
        etablissement: session.user.etablissement ?? null,
        filiere: session.user.filiere ?? null,
        image: session.user.image ?? null,
        actif: session.user.actif,
        matricule: session.user.matricule ?? null,
        mustChangePwd: session.user.mustChangePwd,
        derniereConnexion: session.user.derniereConnexion ?? null,
      }
      set({ user, isAuthenticated: true, mustChangePassword: user.mustChangePwd || false })
    } else {
      set({ user: null, isAuthenticated: false })
    }
  },

  refreshSession: async () => {
    try {
      const resp = await fetch('/api/go-auth/session')
      const session = await resp.json()
      if (session?.user) {
        get().syncFromSession(session)
      } else {
        set({ user: null, isAuthenticated: false })
      }
    } catch {
      set({ user: null, isAuthenticated: false })
    }
  },
}))
