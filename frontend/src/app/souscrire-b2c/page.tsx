'use client'

import { useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Lock, Eye, EyeOff, Loader2, GraduationCap, CheckCircle2, ArrowLeft, ArrowRight, Mail, User, MapPin, Sparkles, Zap, Shield, CreditCard, AlertCircle, Calendar, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

// Wrappeur Suspense car useSearchParams doit être dans un Suspense boundary
export default function SouscrireB2CPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SouscrireB2CContent />
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1E1B4B]">
      <Loader2 className="h-8 w-8 animate-spin text-[#84CC16]" />
    </div>
  )
}

// ═══ Données des plans B2C ═══
interface B2CPlan {
  id: string
  nom: string
  prix: string
  suffix: string
  sub: string
  description: string
  features: string[]
  popular: boolean
  color: string
  paymentRequired: boolean
  montant: number
}

const PLANS_B2C: B2CPlan[] = [
  {
    id: 'plan_b2c_prof_solo',
    nom: 'Prof Solo',
    prix: 'Gratuit',
    suffix: '',
    sub: 'Pour découvrir SECT',
    description: 'Idéal pour tester la plateforme sans engagement',
    features: [
      '1 enseignant',
      '2 classes / groupes',
      '40 étudiants max',
      'Génération IA : 3 épreuves/mois',
      'Correction IA : 3 épreuves/mois',
      'Export PDF inclus',
    ],
    popular: false,
    color: '#6B7280',
    paymentRequired: false,
    montant: 0,
  },
  {
    id: 'plan_b2c_prof_premium',
    nom: 'Prof Premium',
    prix: '4 900',
    suffix: 'FCFA/mois',
    sub: '49 000 FCFA/an',
    description: 'Pour l\'enseignant qui veut gagner du temps avec l\'IA',
    features: [
      '1 enseignant',
      'Classes illimitées',
      '200 étudiants max',
      'Génération IA illimitée',
      'Correction IA illimitée',
      'Export PDF inclus',
      'Support email prioritaire',
    ],
    popular: true,
    color: '#84CC16',
    paymentRequired: true,
    montant: 4900,
  },
]

// ═══ Types de réponse API ═══
interface SubscriptionResponse {
  user: { id: string; email: string; name: string; role: string }
  etablissementId: string
  etablissementNom: string
  abonnementId: string
  abonnementStatut: string
  abonnementDateFin?: string
  abonnementMontant: number
  paymentRequired: boolean
  message: string
}

function SouscrireB2CContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedPlan = searchParams.get('plan')

  // ─── État du wizard ───
  // Étapes : 1 = choix plan | 2 = inscription | 3 = paiement (Premium only) | 4 = confirmation
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    preselectedPlan === 'prof-premium' ? 'plan_b2c_prof_premium'
    : preselectedPlan === 'prof-solo' ? 'plan_b2c_prof_solo'
    : ''
  )

  // ─── Formulaire inscription ───
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ville, setVille] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // ─── Choix période abonnement (Premium only) ───
  const [periodeAbonnement, setPeriodeAbonnement] = useState<'mensuel' | 'auto'>('mensuel')

  // ─── État soumission ───
  const [submitting, setSubmitting] = useState(false)
  const [paying, setPaying] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionResponse | null>(null)

  const selectedPlan = PLANS_B2C.find(p => p.id === selectedPlanId)
  const isPremium = selectedPlan?.paymentRequired === true

  // ─── Étape 2 : soumettre l'inscription (crée le compte + abonnement) ───
  const handleSubmitInscription = useCallback(async () => {
    if (!selectedPlanId) return
    if (!name.trim()) { toast.error('Nom requis', { description: 'Saisissez votre nom complet.' }); return }
    if (!email.trim() || !email.includes('@')) { toast.error('Email invalide'); return }
    if (password.length < 8) { toast.error('Mot de passe trop court', { description: '8 caractères minimum.' }); return }
    if (password !== confirmPassword) { toast.error('Les mots de passe ne correspondent pas'); return }
    if (submitting) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/subscriptions/b2c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlanId,
          name: name.trim(),
          email: email.trim(),
          password,
          ville: ville.trim() || undefined,
          periodeAbonnement: isPremium ? periodeAbonnement : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSubscriptionData(data)
        // Si paiement requis (Premium) → étape 3 (paiement). Sinon → étape 4 (confirmation).
        if (data.paymentRequired) {
          setStep(3)
        } else {
          setStep(4)
        }
        toast.success('Compte créé', {
          description: data.paymentRequired
            ? 'Finalisez votre paiement pour activer votre abonnement.'
            : 'Votre compte est prêt. Vous pouvez vous connecter.',
        })
      } else {
        toast.error('Souscription impossible', { description: data?.error || 'Erreur.' })
      }
    } catch {
      toast.error('Erreur', { description: 'Vérifiez votre connexion.' })
    } finally {
      setSubmitting(false)
    }
  }, [selectedPlanId, name, email, password, confirmPassword, ville, periodeAbonnement, isPremium, submitting])

  // ─── Étape 3 : simuler le paiement (V1) ───
  const handlePayment = useCallback(async () => {
    if (!subscriptionData?.abonnementId || paying) return
    setPaying(true)
    try {
      const res = await fetch(`/api/subscriptions/b2c/${subscriptionData.abonnementId}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methodePaiement: 'simulation' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        // Mettre à jour le statut de l'abonnement dans subscriptionData
        setSubscriptionData(prev => prev ? {
          ...prev,
          abonnementStatut: 'ACTIF',
          abonnementDateFin: data.dateFin,
          message: data.message,
        } : null)
        setStep(4)
        toast.success('Paiement confirmé', {
          description: 'Votre abonnement Prof Premium est maintenant actif.',
        })
      } else {
        toast.error('Paiement impossible', { description: data?.error || 'Erreur.' })
      }
    } catch {
      toast.error('Erreur', { description: 'Vérifiez votre connexion.' })
    } finally {
      setPaying(false)
    }
  }, [subscriptionData, paying])

  // ════════════════════════════════════════════════════════════════════
  // ÉTAPE 4 : Confirmation (compte créé, éventuellement payé)
  // ════════════════════════════════════════════════════════════════════
  if (step === 4 && subscriptionData) {
    const isPaid = subscriptionData.abonnementStatut === 'ACTIF'
    return (
      <Shell title={isPaid ? 'Compte activé !' : 'Compte créé !'} icon={<CheckCircle2 className="h-7 w-7 text-[#84CC16]" />}>
        <p className="text-sm text-[#1E1B4B]/70 mb-3">
          Votre espace enseignant <strong style={{ color: '#1E1B4B' }}>{selectedPlan?.nom}</strong> a été créé avec succès.
        </p>
        <div className="bg-[#FFFBEB] border-l-4 border-[#F59E0B] rounded-lg p-4 mb-5">
          <p className="text-sm text-[#1E1B4B]">
            <strong>Email de connexion :</strong> {subscriptionData.user.email}
          </p>
          {isPremium && isPaid && (
            <p className="text-xs text-[#1E1B4B]/60 mt-1">
              Abonnement <strong>Prof Premium</strong> actif jusqu'au {subscriptionData.abonnementDateFin
                ? new Date(subscriptionData.abonnementDateFin).toLocaleDateString('fr-FR')
                : '—'}.
              {periodeAbonnement === 'auto' && ' Renouvellement automatique activé.'}
            </p>
          )}
          <p className="text-xs text-[#1E1B4B]/60 mt-1">
            Un établissement personnel a été créé automatiquement pour gérer vos classes et étudiants.
          </p>
        </div>
        <Button
          onClick={() => router.push('/login')}
          className="w-full h-11 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold"
        >
          Se connecter <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Shell>
    )
  }

  // ════════════════════════════════════════════════════════════════════
  // ÉTAPE 3 : Paiement (Premium only)
  // ════════════════════════════════════════════════════════════════════
  if (step === 3 && subscriptionData) {
    return (
      <Shell title="Paiement" icon={<CreditCard className="h-7 w-7 text-[#84CC16]" />}>
        <p className="text-sm text-[#1E1B4B]/70 mb-5">
          Finalisez votre paiement pour activer votre abonnement <strong style={{ color: '#1E1B4B' }}>Prof Premium</strong>.
        </p>

        {/* Récap paiement */}
        <div className="bg-[#FFFBEB] border border-[#F59E0B]/20 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#1E1B4B]/70">Plan</span>
            <span className="text-sm font-semibold text-[#1E1B4B]">Prof Premium</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#1E1B4B]/70">Mode de facturation</span>
            <span className="text-sm font-semibold text-[#1E1B4B]">
              {periodeAbonnement === 'auto' ? 'Auto (prélèvement)' : 'Mensuel manuel'}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#1E1B4B]/70">Compte</span>
            <span className="text-sm font-semibold text-[#1E1B4B]">{subscriptionData.user.email}</span>
          </div>
          <div className="border-t border-[#F59E0B]/20 my-2"></div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1E1B4B]">Montant à payer</span>
            <span className="text-2xl font-bold text-[#1E1B4B] font-mono">4 900 FCFA</span>
          </div>
          <p className="text-xs text-[#1E1B4B]/60 mt-1">Valable 30 jours. Renouvellement {periodeAbonnement === 'auto' ? 'automatique' : 'manuel'}.</p>
        </div>

        {/* Avertissement V1 simulation */}
        <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg p-3 mb-5">
          <p className="text-xs text-[#1E1B4B] flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-[#F59E0B] shrink-0 mt-0.5" />
            <span>
              <strong>Mode démo :</strong> le paiement est simulé. En production, l'intégration
              CinetPay (Mobile Money + cartes bancaires) sera activée.
            </span>
          </p>
        </div>

        {/* Bouton paiement simulé */}
        <Button
          onClick={handlePayment}
          disabled={paying}
          className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
        >
          {paying ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Traitement du paiement...</>
          ) : (
            <><CreditCard className="h-5 w-5 mr-2" /> Payer 4 900 FCFA</>
          )}
        </Button>

        {/* Sécurité */}
        <div className="flex items-center justify-center gap-4 pt-3 text-xs text-[#1E1B4B]/50">
          <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Paiement sécurisé</span>
          <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> AES-256</span>
        </div>

        <div className="pt-3 text-center">
          <button
            onClick={() => router.push('/login')}
            className="inline-flex items-center gap-1.5 text-xs text-[#1E1B4B]/60 hover:text-[#1E1B4B] transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Payer plus tard (compte en attente)
          </button>
        </div>
      </Shell>
    )
  }

  // ════════════════════════════════════════════════════════════════════
  // ÉTAPE 1 : Choix du plan
  // ════════════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <Shell title="Choisissez votre plan" icon={<GraduationCap className="h-7 w-7 text-[#84CC16]" />}>
        <p className="text-sm text-[#1E1B4B]/70 mb-5">
          SECT pour les enseignants freelance et indépendants. Sans engagement, annulable à tout moment.
        </p>
        <div className="space-y-3">
          {PLANS_B2C.map((plan) => (
            <button
              key={plan.id}
              onClick={() => {
                setSelectedPlanId(plan.id)
                setStep(2)
              }}
              className={`w-full text-left p-5 rounded-xl border-2 transition-all hover:shadow-md ${
                plan.popular
                  ? 'border-[#84CC16] bg-[#FFFBEB] ring-2 ring-[#84CC16]/20'
                  : 'border-[#1E1B4B]/12 bg-white hover:border-[#84CC16]/40'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-lg font-bold text-[#1E1B4B] flex items-center gap-2">
                    {plan.nom}
                    {plan.popular && (
                      <span className="text-xs bg-[#84CC16] text-[#1E1B4B] px-2 py-0.5 rounded-full font-semibold">
                        ⭐ Populaire
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-[#1E1B4B]/60 mt-0.5">{plan.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-[#1E1B4B] font-mono">{plan.prix}</div>
                  {plan.suffix && <div className="text-xs text-[#1E1B4B]/60">{plan.suffix}</div>}
                  {plan.sub && <div className="text-xs text-[#F59E0B] font-medium">{plan.sub}</div>}
                </div>
              </div>
              <ul className="space-y-1.5 mt-3">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#1E1B4B]/80">
                    <CheckCircle2 className="h-4 w-4 text-[#84CC16] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.paymentRequired && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-[#C2410C]">
                  <CreditCard className="h-3.5 w-3.5" />
                  Paiement requis après inscription
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="mt-6 text-center">
          <a href="/login" className="inline-flex items-center gap-1.5 text-xs text-[#1E1B4B]/60 hover:text-[#1E1B4B] transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Déjà un compte ? Se connecter
          </a>
        </div>
      </Shell>
    )
  }

  // ════════════════════════════════════════════════════════════════════
  // ÉTAPE 2 : Inscription
  // ════════════════════════════════════════════════════════════════════
  return (
    <Shell title="Créez votre compte" icon={<User className="h-7 w-7 text-[#84CC16]" />}>
      {/* Récap plan sélectionné */}
      <div className="bg-[#FFFBEB] border border-[#F59E0B]/20 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#1E1B4B]/60 uppercase tracking-wider">Plan sélectionné</p>
            <p className="text-lg font-bold text-[#1E1B4B]">{selectedPlan?.nom}</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-[#1E1B4B] font-mono">{selectedPlan?.prix}</div>
            {selectedPlan?.suffix && <div className="text-xs text-[#1E1B4B]/60">{selectedPlan.suffix}</div>}
          </div>
        </div>
        <button onClick={() => setStep(1)} className="mt-2 text-xs text-[#C2410C] hover:underline">
          ← Changer de plan
        </button>
      </div>

      {/* Choix période abonnement (Premium only) */}
      {isPremium && (
        <div className="space-y-2 mb-4">
          <Label className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">
            Mode de facturation
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPeriodeAbonnement('mensuel')}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                periodeAbonnement === 'mensuel'
                  ? 'border-[#84CC16] bg-[#FFFBEB]'
                  : 'border-[#1E1B4B]/12 bg-white hover:border-[#84CC16]/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-[#F59E0B]" />
                <span className="text-sm font-semibold text-[#1E1B4B]">Mensuel manuel</span>
              </div>
              <p className="text-[11px] text-[#1E1B4B]/60">Vous payez chaque mois. Rappel par email.</p>
            </button>
            <button
              type="button"
              onClick={() => setPeriodeAbonnement('auto')}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                periodeAbonnement === 'auto'
                  ? 'border-[#84CC16] bg-[#FFFBEB]'
                  : 'border-[#1E1B4B]/12 bg-white hover:border-[#84CC16]/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="h-4 w-4 text-[#F59E0B]" />
                <span className="text-sm font-semibold text-[#1E1B4B]">Auto (prélèvement)</span>
              </div>
              <p className="text-[11px] text-[#1E1B4B]/60">Renouvellement automatique chaque mois.</p>
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Nom complet */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">Nom complet</Label>
          <div className="relative group">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
            <Input
              type="text"
              placeholder="Ex: Jean Kouassi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">Adresse email</Label>
          <div className="relative group">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
            <Input
              type="email"
              placeholder="professeur@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Ville */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">
            Ville <span className="text-[#1E1B4B]/40 normal-case">(optionnel)</span>
          </Label>
          <div className="relative group">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
            <Input
              type="text"
              placeholder="Abidjan, Dakar, Lomé..."
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              className="pl-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Mot de passe */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">Mot de passe</Label>
          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#1E1B4B]/55 hover:text-[#1E1B4B] transition-colors"
              aria-label={showPassword ? 'Masquer' : 'Afficher'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password && password.length < 8 && <p className="text-xs text-[#C2410C]">8 caractères minimum</p>}
        </div>

        {/* Confirmation */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">Confirmer le mot de passe</Label>
          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitInscription() }}
              className="pl-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
            />
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-[#C2410C]">Les mots de passe ne correspondent pas.</p>
          )}
        </div>

        <Button
          onClick={handleSubmitInscription}
          disabled={submitting || !name.trim() || !email.trim() || password.length < 8 || password !== confirmPassword}
          className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
        >
          {submitting ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Création du compte...</>
          ) : (
            <>
              {isPremium ? (
                <><CreditCard className="h-5 w-5 mr-2" /> Continuer vers le paiement</>
              ) : (
                <><Sparkles className="h-5 w-5 mr-2" /> Créer mon compte enseignant</>
              )}
            </>
          )}
        </Button>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-4 pt-2 text-xs text-[#1E1B4B]/50">
          <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Données sécurisées</span>
          <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Sans engagement</span>
        </div>

        <div className="pt-2 text-center">
          <a href="/login" className="inline-flex items-center gap-1.5 text-xs text-[#1E1B4B]/60 hover:text-[#1E1B4B] transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Déjà un compte ? Se connecter
          </a>
        </div>
      </div>
    </Shell>
  )
}

// ═══ Shell commun — design "Savane EdTech" (palette africaine + kente) ═══
function Shell({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0A1931] via-[#1E1B4B] to-[#0f0d2e] p-4">
      {/* Motif kente en fond */}
      <div
        className="fixed inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(90deg, transparent 0, transparent 50px, #84CC16 50px, #84CC16 55px, transparent 55px, transparent 58px, #F59E0B 58px, #F59E0B 61px, transparent 61px, transparent 64px, #C2410C 64px, #C2410C 66px, transparent 66px, transparent 100px),
            repeating-linear-gradient(45deg, transparent 0, transparent 25px, #F59E0B 25px, #F59E0B 30px, transparent 30px, transparent 50px)
          `,
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7 sm:p-8 relative z-10"
      >
        {/* Bandeau kente supérieur */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl"
          style={{
            background: 'linear-gradient(90deg, #84CC16 0%, #84CC16 25%, #C2410C 25%, #C2410C 50%, #F59E0B 50%, #F59E0B 75%, #1E1B4B 75%)',
          }}
        />
        {/* Logo + titre */}
        <div className="flex flex-col items-center mb-6 mt-2">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center mb-4 shadow-lg shadow-[#84CC16]/30">
            <GraduationCap className="h-8 w-8 text-[#1E1B4B]" />
          </div>
          <div className="flex items-center gap-2 mb-1">
            {icon}
            <h1 className="text-xl font-bold text-[#1E1B4B]">{title}</h1>
          </div>
          <p className="text-[10px] text-[#F59E0B]/80 font-medium tracking-wider uppercase">SECT — Système d'Évaluation Casse-Tête</p>
        </div>
        {children}
      </motion.div>
    </div>
  )
}
