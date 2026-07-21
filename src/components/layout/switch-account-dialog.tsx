'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut, Repeat, ShieldCheck, Mail, Lock, Eye, EyeOff } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { useSwitchAccountStore } from '@/stores/switch-account-store'
import { toast } from 'sonner'

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  RESPONSABLE: 'Responsable des études',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

/**
 * SwitchAccountDialog — Dialog moderne pour changer de compte.
 *
 * Rendu une seule fois au niveau du `AuthenticatedLayout` (singleton) et
 * contrôlé par `useSwitchAccountStore`. Peut être ouvert depuis le header
 * (bouton « Switch Account ») ou la carte utilisateur de la sidebar.
 *
 * Flux :
 *  1. Affiche le compte courant (avatar, nom, email, rôle)
 *  2. L'utilisateur saisit les identifiants d'un autre compte (email + mot
 *     de passe), avec bascule de visibilité du mot de passe
 *  3. Au submit : déconnexion du compte courant puis connexion avec les
 *     nouveaux identifiants via `useAuthStore.login`
 *  4. Feedback toast (succès / erreur) + fermeture du dialog
 *  5. Action secondaire « Se déconnecter seulement » → logout + redirect
 *     vers /login
 *
 * Accessibilité :
 *  - Dialog radix (focus trap, restauration du focus, Esc pour fermer)
 *  - Labels associés aux champs, aria-label sur la bascule de visibilité
 *  - Loading state désactivant le submit (anti double-clic)
 */
export function SwitchAccountDialog() {
  const open = useSwitchAccountStore((s) => s.open)
  const setOpen = useSwitchAccountStore((s) => s.setOpen)
  const { user, login, logout } = useAuthStore()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Reset du formulaire à l'ouverture + focus sur le champ email
  useEffect(() => {
    if (open) {
      setEmail('')
      setPassword('')
      setShowPassword(false)
      setIsLoading(false)
      setIsLoggingOut(false)
      // Focus différé pour laisser le dialog s'animer
      const t = setTimeout(() => emailInputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!user) return null

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast.error('Veuillez renseigner un email et un mot de passe')
      return
    }

    setIsLoading(true)
    try {
      // 1. Déconnexion du compte courant
      await logout()

      // 2. Connexion avec les nouveaux identifiants
      try {
        await login(email.trim(), password)
        toast.success('Connexion réussie', {
          description: `Bienvenue, connexion établie avec ${email.trim()}`,
        })
        setOpen(false)
      } catch (err) {
        const message = err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Identifiants incorrects'
        toast.error('Échec de la connexion', { description: message })
        // Le user est déconnecté → redirect vers /login
        router.push('/login')
      }
    } catch {
      toast.error('Erreur lors du changement de compte')
      router.push('/login')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogoutOnly = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      setOpen(false)
      router.push('/login')
    } catch {
      toast.error('Erreur lors de la déconnexion')
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md overflow-hidden p-0 gap-0">
        {/* ─── Header visuel avec compte courant ─── */}
        <div className="bg-gradient-to-br from-sidebar to-sidebar-accent px-6 py-5 text-sidebar-foreground">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Repeat className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Changer de compte
              </span>
            </div>
            <DialogTitle className="text-left text-lg font-bold tracking-tight">
              Basculer vers un autre compte
            </DialogTitle>
            <DialogDescription className="text-left text-sidebar-foreground/60 sr-only">
              Saisissez les identifiants du compte vers lequel vous souhaitez basculer.
            </DialogDescription>

            {/* Carte compte courant */}
            <div className="mt-2 flex items-center gap-3 rounded-xl bg-sidebar-foreground/5 border border-sidebar-foreground/10 p-3 backdrop-blur-sm">
              <Avatar className="h-10 w-10 shrink-0 ring-2 ring-primary/30">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-primary/15 text-primary">
                <ShieldCheck className="h-3 w-3" />
                {ROLE_LABELS[user.role]}
              </span>
            </div>
          </DialogHeader>
        </div>

        {/* ─── Formulaire de connexion ─── */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="switch-email" className="text-xs font-medium text-muted-foreground">
              Email du nouveau compte
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
              <Input
                id="switch-email"
                ref={emailInputRef}
                type="email"
                autoComplete="username"
                placeholder="exemple@etablissement.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading || isLoggingOut}
                className="pl-9 h-10"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="switch-password" className="text-xs font-medium text-muted-foreground">
              Mot de passe
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
              <Input
                id="switch-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading || isLoggingOut}
                className="pl-9 pr-9 h-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="submit"
              disabled={isLoading || isLoggingOut || !email.trim() || !password}
              className="h-10 w-full font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connexion en cours…
                </>
              ) : (
                <>
                  <Repeat className="h-4 w-4 mr-2" />
                  Basculer vers ce compte
                </>
              )}
            </Button>
          </div>
        </form>

        <Separator />

        {/* ─── Action secondaire : déconnexion seule ─── */}
        <div className="px-6 py-4">
          <p className="text-[11px] text-muted-foreground mb-2 text-center">
            Ou déconnectez-vous simplement pour revenir à l'écran de connexion
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={handleLogoutOnly}
            disabled={isLoading || isLoggingOut}
            className="h-9 w-full text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Déconnexion…
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4 mr-2" />
                Se déconnecter
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
