'use client'

import { useState } from 'react'
import {
  User,
  Mail,
  Lock,
  Shield,
  Building2,
  GraduationCap,
  Calendar,
  Camera,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { toast } from 'sonner'

// ─── Role display info ───
const ROLE_INFO: Record<UserRole, { label: string; color: string; description: string }> = {
  ADMIN: {
    label: 'Administrateur',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    description: 'Accès complet à la plateforme',
  },
  RESPONSABLE: {
    label: 'Responsable des études',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    description: 'Gestion des formations et du personnel',
  },
  ENSEIGNANT: {
    label: 'Enseignant',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    description: 'Création et gestion des évaluations',
  },
  ETUDIANT: {
    label: 'Étudiant',
    color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    description: 'Passation des épreuves et devoirs',
  },
}

export function ProfilPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'infos' | 'password'>('infos')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Profile edit state
  const [editName, setEditName] = useState(user?.name ?? '')
  const [editEmail] = useState(user?.email ?? '') // Email is read-only

  if (!user) return null

  const roleInfo = ROLE_INFO[user.role]
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      toast.error('Le nom ne peut pas être vide')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) {
        throw new Error('Erreur lors de la mise à jour')
      }
      const data = await res.json()
      // Update auth store with new user data
      useAuthStore.getState().setUser({ ...user, name: data.name ?? editName.trim() })
      toast.success('Profil mis à jour avec succès')
    } catch {
      toast.error('Impossible de mettre à jour le profil')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Veuillez remplir tous les champs')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Le nouveau mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          currentPassword,
          newPassword,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors du changement de mot de passe')
      }
      toast.success('Mot de passe modifié avec succès')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ─── Profile Header Card ─── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group">
              <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-2xl font-bold dark:bg-emerald-900/30 dark:text-emerald-400">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                aria-label="Changer la photo"
              >
                <Camera className="h-6 w-6 text-white" />
              </button>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold">{user.name}</h2>
              <p className="text-muted-foreground mt-0.5">{user.email}</p>
              <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                <Badge className={roleInfo.color}>{roleInfo.label}</Badge>
                {user.matricule && (
                  <Badge variant="outline" className="text-xs">
                    Matricule : {user.matricule}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Tabs ─── */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === 'infos' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('infos')}
          className={activeTab === 'infos' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
        >
          <User className="h-4 w-4 mr-2" />
          Informations personnelles
        </Button>
        <Button
          variant={activeTab === 'password' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('password')}
          className={activeTab === 'password' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
        >
          <Lock className="h-4 w-4 mr-2" />
          Mot de passe
        </Button>
      </div>

      {/* ─── Informations Tab ─── */}
      {activeTab === 'infos' && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Edit form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Modifier mes informations</CardTitle>
              <CardDescription>
                Mettez à jour vos informations personnelles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom complet</Label>
                <Input
                  id="name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Votre nom complet"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  value={editEmail}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  L&apos;adresse email ne peut pas être modifiée
                </p>
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={isSubmitting || editName === user.name}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Enregistrement...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Enregistrer les modifications
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Info summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Détails du compte</CardTitle>
              <CardDescription>
                Résumé de vos informations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow
                icon={User}
                label="Nom complet"
                value={user.name}
              />
              <Separator />
              <InfoRow
                icon={Mail}
                label="Adresse email"
                value={user.email}
              />
              <Separator />
              <InfoRow
                icon={Shield}
                label="Rôle"
                value={roleInfo.label}
                badge={roleInfo.color}
              />
              <Separator />
              {user.etablissement && (
                <>
                  <InfoRow
                    icon={Building2}
                    label="Établissement"
                    value={user.etablissement.nom}
                  />
                  <Separator />
                </>
              )}
              {user.filiere && (
                <>
                  <InfoRow
                    icon={GraduationCap}
                    label="Filière"
                    value={user.filiere.nom}
                  />
                  <Separator />
                </>
              )}
              <InfoRow
                icon={Calendar}
                label="Dernière connexion"
                value={user.derniereConnexion
                  ? new Date(user.derniereConnexion).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Jamais'
                }
              />
              <Separator />
              <div className="flex items-center gap-2">
                {user.actif ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-emerald-600 dark:text-emerald-400">Compte actif</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-600 dark:text-red-400">Compte désactivé</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Password Tab ─── */}
      {activeTab === 'password' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Changer mon mot de passe</CardTitle>
            <CardDescription>
              Pour votre sécurité, entrez votre mot de passe actuel et choisissez-en un nouveau
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="current-password">Mot de passe actuel</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Entrez votre mot de passe actuel"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showCurrentPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Entrez votre nouveau mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && newPassword.length < 8 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Le mot de passe doit contenir au moins 8 caractères
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre nouveau mot de passe"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Les mots de passe ne correspondent pas
                </p>
              )}
              {confirmPassword && newPassword === confirmPassword && newPassword.length >= 8 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Les mots de passe correspondent
                </p>
              )}
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={
                isSubmitting ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword ||
                newPassword.length < 8
              }
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Modification...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Changer le mot de passe
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Info row helper component ───
function InfoRow({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  badge?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {badge ? (
          <Badge className={`mt-0.5 ${badge}`}>{value}</Badge>
        ) : (
          <p className="text-sm font-medium truncate">{value}</p>
        )}
      </div>
    </div>
  )
}
