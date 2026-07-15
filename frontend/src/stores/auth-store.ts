import { create } from 'zustand'

export type UserRole = 'ADMIN' | 'RESPONSABLE' | 'ENSEIGNANT' | 'ETUDIANT'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  etablissementId?: string | null
  filiereId?: string | null
  etablissement?: { id: string; nom: string; type?: string } | null
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
  // SECT-GENIUSPAY-WAVE-SECURITY : pour 402 Payment Required
  abonnementId?: string
  retryUrl?: string
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
        throw {
          status: resp.status,
          message: data.error || 'Identifiants incorrects',
          // SECT-GENIUSPAY-WAVE-SECURITY : 402 Payment Required inclut abonnementId + retryUrl
          abonnementId: data.abonnementId,
          retryUrl: data.retryUrl,
        } as LoginError
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

        // SECT-B2C-SELF-SERVICE : récupérer l'user complet (avec etablissement.type)
        // via /api/go-auth/session → /api/me. Le login initial ne retourne que
        // l'user de base (sans etablissement ref). Sans cet appel, le menu B2C
        // (b2cOnly) ne s'afficherait qu'au prochain reload de page.
        // Non bloquant : si ça échoue, le menu se mettra à jour au prochain refresh.
        get().refreshSession().catch(() => {})

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
      // ACCESS-ASSISTANCE-FIX (défensif) : si la session retournée pour un ADMIN
      // a etablissementId=null MAIS le store courant a un user.etablissementId
      // non null (mode assistance actif), on conserve l'état assistance.
      // Ce cas ne devrait plus se produire depuis le fix backend (/api/me overlay
      // claims.EtablissementID), mais on garde cette garde pour robustesse :
      // un cold-start Render ou une réponse /api/me partielle ne doit pas
      // faire perdre le mode assistance côté frontend (désync frontend/backend).
      const currentUser = get().user
      const sessionEtabId = session.user.etablissementId ?? null
      const preservedEtabId =
        currentUser?.role === 'ADMIN' &&
        currentUser.etablissementId &&
        !sessionEtabId
          ? currentUser.etablissementId
          : sessionEtabId
      const user: AuthUser = {
        id: session.user.id,
        email: session.user.email ?? '',
        name: session.user.name ?? '',
        role: session.user.role as UserRole,
        etablissementId: preservedEtabId,
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
    //
    // BUGFIX (KEEPALIVE-1) : ne JAMAIS déconnecter sur une erreur réseau
    // transitoire (cold start Render, timeout, 502). Pour une app d'examen,
    // déconnecter un étudiant en pleine passation est critique.
    // La route /api/go-auth/session retourne { transient: true } quand
    // l'erreur est transitoire : on garde l'utilisateur connecté.
    set({ isLoading: true })
    try {
      const resp = await fetch('/api/go-auth/session')
      const session = await resp.json()
      if (session?.user) {
        get().syncFromSession(session)
      } else if (session?.transient) {
        // Erreur transitoire (backend indisponible) : on NE déconnecte pas.
        // On garde l'état actuel (user reste connecté) et on marquera
        // hasCheckedSession pour ne pas bloquer l'UI.
        // Ne pas set user: null !
      } else {
        // Session réellement invalide (refresh token refusé) → logout
        set({ user: null, isAuthenticated: false })
      }
    } catch {
      // Erreur réseau côté route Next.js → transitoire, ne pas déconnecter
    } finally {
      set({ isLoading: false, hasCheckedSession: true })
    }
  },
}))
