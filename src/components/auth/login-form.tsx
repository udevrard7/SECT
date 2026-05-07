'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  GraduationCap,
  Mail,
  Lock,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'

const loginSchema = z.object({
  email: z.string().email('Veuillez entrer une adresse email valide'),
  password: z
    .string()
    .min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const demoAccounts = [
  { role: 'Administrateur', email: 'admin@sect.fr', password: 'admin123' },
  { role: 'Responsable', email: 'responsable@sect.fr', password: 'resp123' },
  { role: 'Enseignant', email: 'enseignant@sect.fr', password: 'ens123' },
  { role: 'Étudiant', email: 'etudiant@sect.fr', password: 'etu123' },
]

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const login = useAuthStore((state) => state.login)
  const isLoading = useAuthStore((state) => state.isLoading)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginFormValues) => {
    setLoginError(null)
    const success = await login(data.email, data.password)
    if (!success) {
      setLoginError('Identifiants incorrects. Veuillez réessayer.')
      toast.error('Échec de la connexion', {
        description: 'Identifiants incorrects. Veuillez réessayer.',
      })
    }
  }

  const fillCredentials = (email: string, password: string) => {
    form.setValue('email', email)
    form.setValue('password', password)
    setLoginError(null)
    form.clearErrors()
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950 dark:via-teal-950 dark:to-emerald-900">
      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {/* Branding */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-3">
            <img
              src="/logo.svg"
              alt="SECT"
              className="w-14 h-14 rounded-xl shadow-lg"
            />
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-emerald-700 to-teal-600 dark:from-emerald-300 dark:to-teal-400 bg-clip-text text-transparent">
              SECT
            </h1>
          </div>
          <p className="text-lg font-medium text-emerald-800 dark:text-emerald-200">
            Système d&apos;Evaluation Casse-Tête
          </p>
          <p className="mt-2 text-sm text-emerald-600/80 dark:text-emerald-400/80 max-w-md">
            Plateforme d&apos;évaluation en ligne propulsée par l&apos;Intelligence Artificielle
          </p>
        </motion.div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <Card className="border-emerald-200/60 dark:border-emerald-800/40 shadow-xl shadow-emerald-900/5 dark:shadow-emerald-900/20">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Connexion</CardTitle>
              <CardDescription>
                Entrez vos identifiants pour accéder à la plateforme
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Email field */}
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="votre.email@universite.fr"
                      className="pl-9"
                      {...form.register('email')}
                      aria-invalid={!!form.formState.errors.email}
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password field */}
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                      {...form.register('password')}
                      aria-invalid={!!form.formState.errors.password}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                {/* Remember me & Forgot password */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox id="remember" />
                    <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                      Se souvenir de moi
                    </Label>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>

                {/* Error message */}
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  >
                    {loginError}
                  </motion.div>
                )}

                {/* Submit button */}
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connexion en cours...
                    </>
                  ) : (
                    'Se connecter'
                  )}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="justify-center">
              <p className="text-xs text-muted-foreground">
                En vous connectant, vous acceptez les conditions d&apos;utilisation
              </p>
            </CardFooter>
          </Card>
        </motion.div>

        {/* Demo accounts section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="w-full max-w-md mt-6"
        >
          <Card className="border-emerald-200/60 dark:border-emerald-800/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Comptes de démonstration
              </CardTitle>
              <CardDescription className="text-xs">
                Cliquez sur &quot;Utiliser&quot; pour remplir automatiquement les identifiants
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Rôle</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Mot de passe</TableHead>
                    <TableHead className="text-xs w-20 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoAccounts.map((account) => (
                    <TableRow key={account.role}>
                      <TableCell className="text-xs font-medium">
                        {account.role}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {account.email}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {account.password}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          onClick={() =>
                            fillCredentials(account.email, account.password)
                          }
                        >
                          Utiliser
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center">
        <Separator className="mx-auto max-w-md mb-4 bg-emerald-200/60 dark:bg-emerald-800/40" />
        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
          &copy; 2026 SECT — Tous droits réservés
        </p>
      </footer>
    </div>
  )
}
