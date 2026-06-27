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
  // BUGFIX (REDIRECT-FIX-1) : flag indiquant que la session a été vérifiée
  // au moins une fois depuis le montage. Avant ce flag, l'état initial
  // (isLoading: false, isAuthenticated: false) déclenchait la redirection
  // vers /login AVANT que refreshSession n'ait eu le temps de vérifier le
  // cookie → flash /login puis retour dashboard.
  hasCheckedSession: boolean
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
  // BUGFIX (REDIRECT-FIX-1) : isLoading: true au démarrage pour empêcher la
  // redirection prématurée vers /login pendant que refreshSession vérifie
  // le cookie httpOnly.
  isLoading: true,
  hasCheckedSession: false,
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

        set({ user, isAuthenticated: true, isLoading: false, hasCheckedSession: true, mustChangePassword: user.mustChangePwd || false })
        return true
      }

      set({ isLoading: false, hasCheckedSession: true })
      return false
    } catch (error: any) {
      set({ isLoading: false, hasCheckedSession: true })
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
    set({ user: null, isAuthenticated: false, isLoading: false, hasCheckedSession: true, mustChangePassword: false })
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
    // BUGFIX (REDIRECT-FIX-1) : set isLoading: true avant le fetch pour
    // empêcher authenticated-layout de rediriger vers /login pendant la
    // vérification. hasCheckedSession: true à la fin (succès OU échec).
    set({ isLoading: true })
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
    } finally {
      set({ isLoading: false, hasCheckedSession: true })
    }
  },
}))
