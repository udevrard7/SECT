import { create } from 'zustand'
import { signIn, signOut } from 'next-auth/react'

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
  login: (email: string, password: string) => Promise<boolean>
  loginStudent: (matricule: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  clearMustChangePassword: () => void
  syncFromSession: (session: any) => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  mustChangePassword: false,

  loginStudent: async (matricule: string, password: string) => {
    set({ isLoading: true })
    try {
      const result = await signIn('credentials-matricule', {
        matricule,
        password,
        redirect: false,
      })

      if (result?.error) {
        set({ isLoading: false })
        const error: LoginError = {
          status: 401,
          message: result.error === 'CredentialsSignin'
            ? 'Matricule ou mot de passe incorrect'
            : result.error,
        }
        throw error
      }

      if (!result?.ok) {
        set({ isLoading: false })
        throw { status: 0, message: 'Erreur de connexion' } as LoginError
      }

      // Fetch session to get user data
      const sessionRes = await fetch('/api/auth/session')
      const session = await sessionRes.json()

      if (session?.user) {
        const user: AuthUser = {
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.name ?? '',
          role: session.user.role as UserRole,
          etablissementId: session.user.etablissementId,
          filiereId: session.user.filiereId,
          etablissement: session.user.etablissement,
          filiere: session.user.filiere,
          image: session.user.image,
          actif: session.user.actif,
          matricule: session.user.matricule,
          mustChangePwd: session.user.mustChangePwd,
        }

        if (user.mustChangePwd) {
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            mustChangePassword: true,
          })
          return true
        }

        set({ user, isAuthenticated: true, isLoading: false })
        return true
      }

      set({ isLoading: false })
      throw { status: 0, message: 'Session non disponible' } as LoginError
    } catch (err) {
      set({ isLoading: false })
      if (err && typeof err === 'object' && 'status' in err) {
        throw err
      }
      throw { status: 0, message: 'Erreur réseau' } as LoginError
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const result = await signIn('credentials-email', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        set({ isLoading: false })
        const error: LoginError = {
          status: 401,
          message: result.error === 'CredentialsSignin'
            ? 'Identifiants incorrects'
            : result.error,
        }
        throw error
      }

      if (!result?.ok) {
        set({ isLoading: false })
        throw { status: 0, message: 'Erreur de connexion' } as LoginError
      }

      // Fetch session to get user data
      const sessionRes = await fetch('/api/auth/session')
      const session = await sessionRes.json()

      if (session?.user) {
        const user: AuthUser = {
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.name ?? '',
          role: session.user.role as UserRole,
          etablissementId: session.user.etablissementId,
          filiereId: session.user.filiereId,
          etablissement: session.user.etablissement,
          filiere: session.user.filiere,
          image: session.user.image,
          actif: session.user.actif,
          matricule: session.user.matricule,
          mustChangePwd: session.user.mustChangePwd,
        }

        if (user.mustChangePwd) {
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            mustChangePassword: true,
          })
          return true
        }

        set({ user, isAuthenticated: true, isLoading: false })
        return true
      }

      set({ isLoading: false })
      throw { status: 0, message: 'Session non disponible' } as LoginError
    } catch (err) {
      set({ isLoading: false })
      if (err && typeof err === 'object' && 'status' in err) {
        throw err
      }
      throw { status: 0, message: 'Erreur réseau' } as LoginError
    }
  },

  logout: async () => {
    try {
      await signOut({ redirect: false })
    } finally {
      set({ user: null, isAuthenticated: false })
    }
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  clearMustChangePassword: () => set({ mustChangePassword: false }),

  syncFromSession: (session) => {
    if (!session?.user?.id) {
      set({ user: null, isAuthenticated: false })
      return
    }
    const user: AuthUser = {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      role: session.user.role as UserRole,
      etablissementId: session.user.etablissementId,
      filiereId: session.user.filiereId,
      etablissement: session.user.etablissement,
      filiere: session.user.filiere,
      image: session.user.image,
      actif: session.user.actif,
      matricule: session.user.matricule,
      mustChangePwd: session.user.mustChangePwd,
    }
    set({ user, isAuthenticated: true })
  },
}))
