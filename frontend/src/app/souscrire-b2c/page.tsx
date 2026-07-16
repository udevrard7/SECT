'use client'

import { useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock, Eye, EyeOff, Loader2, GraduationCap, CheckCircle2,
  ArrowLeft, ArrowRight, Mail, User, MapPin, Sparkles, Zap,
  Shield, CreditCard, AlertCircle, Calendar, RefreshCw, Phone,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  initiatePayment, isValidWavePhone, normalizeWavePhone, setPendingAbonnement,
} from '@/hooks/use-payment'

// ═══════════════════════════════════════════════════════════════════
// Suspense wrapper (useSearchParams requires a Suspense boundary)
// ═══════════════════════════════════════════════════════════════════
export default function SouscrireB2CPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SouscrireB2CContent />
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <Background>
      <Loader2 className="h-8 w-8 animate-spin text-[#84CC16]" />
    </Background>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Plan data
// ═══════════════════════════════════════════════════════════════════
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
    description: "Pour l'enseignant qui veut gagner du temps avec l'IA",
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

// ═══════════════════════════════════════════════════════════════════
// API response shape
// ═══════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════
function SouscrireB2CContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedPlan = searchParams.get('plan')

  // ─── Wizard state (3 steps) ───
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    preselectedPlan === 'prof-premium' ? 'plan_b2c_prof_premium'
    : preselectedPlan === 'prof-solo' ? 'plan_b2c_prof_solo'
    : ''
  )

  // ─── Account form state ───
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ville, setVille] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // ─── Premium billing period ───
  const [periodeAbonnement, setPeriodeAbonnement] = useState<'mensuel' | 'auto'>('mensuel')

  // ─── Submission state ───
  const [submitting, setSubmitting] = useState(false)
  const [paying, setPaying] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionResponse | null>(null)

  // ─── Wave payment (Premium) ───
  const [wavePhone, setWavePhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)

  const selectedPlan = PLANS_B2C.find(p => p.id === selectedPlanId)
  const isPremium = selectedPlan?.paymentRequired === true

  // Step labels for progress bar (3rd label depends on selected plan)
  const stepLabels: [string, string, string] = [
    'Plan',
    'Compte',
    isPremium ? 'Paiement' : 'Compte créé',
  ]

  // ─── Step 2 → submit inscription (creates account + subscription) ───
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
        setStep(3)
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

  // ─── Step 3 (Premium) → initiate Wave payment via GeniusPay ───
  // Contract (GP-7): POST /api/subscriptions/b2c/{id}/initiate-payment
  //   body { customerPhone, customerName? } → { paymentUrl, reference, ... }
  //   then window.location.href = paymentUrl
  const handlePayment = useCallback(async () => {
    if (!subscriptionData?.abonnementId || paying) return

    const normalized = normalizeWavePhone(wavePhone)
    if (!isValidWavePhone(normalized)) {
      toast.error('Téléphone Wave invalide', {
        description: 'Format attendu : +225 suivi de 10 chiffres (ex: +2250777123456).',
      })
      setPhoneTouched(true)
      return
    }

    setPaying(true)
    try {
      // Store pending abonnement BEFORE redirect — /paiement/succes can find it
      // back if Wave omits the `abo` query param.
      setPendingAbonnement(subscriptionData.abonnementId)

      const res = await fetch(
        `/api/subscriptions/b2c/${subscriptionData.abonnementId}/initiate-payment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerPhone: normalized,
            customerName: subscriptionData.user?.name,
          }),
        },
      )
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.paymentUrl) {
        toast.success('Redirection vers Wave...', {
          description: 'Vous allez être redirigé vers la page de paiement sécurisée.',
        })
        window.location.href = data.paymentUrl
        return
      }

      // Fine-grained error handling per contract
      const errMsg = data?.error || 'Erreur inconnue'
      if (res.status === 400) {
        toast.error('Téléphone requis', { description: errMsg })
      } else if (res.status === 404) {
        toast.error('Abonnement introuvable', { description: 'Veuillez recommencer votre inscription.' })
      } else if (res.status === 409) {
        toast.error('Abonnement déjà traité', { description: errMsg })
      } else if (res.status === 502) {
        toast.error('Service de paiement indisponible', {
          description: 'GeniusPay est momentanément indisponible. Réessayez dans un instant.',
        })
      } else {
        toast.error('Paiement impossible', { description: errMsg })
      }
    } catch {
      toast.error('Erreur réseau', {
        description: 'Vérifiez votre connexion internet et réessayez.',
      })
    } finally {
      setPaying(false)
    }
  }, [subscriptionData, wavePhone, paying])

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════
  return (
    <Background>
      <WizardCard step={step} stepLabels={stepLabels}>
        <AnimatePresence mode="wait">
          {/* ─── STEP 3 : Payment (Premium) OR Success (Solo) ─── */}
          {step === 3 && subscriptionData ? (
            isPremium ? (
              <motion.div
                key="step-3-payment"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <StepHeader
                  icon={<WaveMark className="h-6 w-6" />}
                  title="Paiement Wave"
                  subtitle={<>Finalisez votre paiement pour activer votre abonnement <strong className="text-white">Prof Premium</strong>.</>}
                />

                {/* Payment recap */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-5 backdrop-blur-sm">
                  <Row label="Plan" value="Prof Premium" />
                  <Row label="Facturation" value={periodeAbonnement === 'auto' ? 'Auto (prélèvement)' : 'Mensuel manuel'} />
                  <Row label="Compte" value={subscriptionData.user.email} />
                  <div className="border-t border-white/10 my-3" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">Montant à payer</span>
                    <motion.span
                      className="text-2xl font-bold text-[#84CC16] font-mono"
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200 }}
                    >
                      {new Intl.NumberFormat('fr-FR').format(subscriptionData.abonnementMontant)} FCFA
                    </motion.span>
                  </div>
                  <p className="text-[11px] text-white/40 mt-1">
                    Valable 30 jours. Renouvellement {periodeAbonnement === 'auto' ? 'automatique' : 'manuel'}.
                  </p>
                </div>

                {/* Wave phone input */}
                <div className="space-y-1.5 mb-5">
                  <Label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                    Numéro Wave
                  </Label>
                  <div className="relative group">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#84CC16] transition-transform group-focus-within:scale-110" />
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="+225 07 77 12 34 56"
                      value={wavePhone}
                      onChange={(e) => setWavePhone(e.target.value)}
                      onBlur={() => setPhoneTouched(true)}
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all font-mono tracking-wide"
                      aria-invalid={phoneTouched && wavePhone.length > 0 && !isValidWavePhone(normalizeWavePhone(wavePhone))}
                    />
                  </div>
                  <AnimatePresence mode="wait">
                    {phoneTouched && wavePhone.length > 0 && !isValidWavePhone(normalizeWavePhone(wavePhone)) ? (
                      <motion.p
                        key="phone-error"
                        initial={{ y: -8, opacity: 0, x: 0 }}
                        animate={{ y: 0, opacity: 1, x: [0, -6, 6, -3, 3, 0] }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.4 }}
                        className="text-xs text-red-400 flex items-center gap-1"
                      >
                        <AlertCircle className="h-3 w-3" />
                        Format invalide. Entrez votre numéro au format +225 suivi de 10 chiffres.
                      </motion.p>
                    ) : (
                      <motion.p
                        key="phone-help"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[11px] text-white/40"
                      >
                        Numéro WaveMoney rattaché à votre compte Wave. Paiement sécurisé via GeniusPay.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Security note */}
                <div className="rounded-lg border border-[#84CC16]/25 bg-[#84CC16]/8 p-3 mb-5">
                  <p className="text-xs text-white/80 flex items-start gap-2">
                    <Shield className="h-4 w-4 text-[#84CC16] shrink-0 mt-0.5" />
                    <span>
                      Vous serez redirigé vers la page sécurisée <strong>Wave</strong> pour valider le
                      paiement de <strong>{new Intl.NumberFormat('fr-FR').format(subscriptionData.abonnementMontant)} FCFA</strong>. Aucune donnée bancaire n'est stockée par SECT.
                    </span>
                  </p>
                </div>

                {/* Pay button — primary lime, WaveMark accent in cyan */}
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button
                    onClick={handlePayment}
                    disabled={paying || (wavePhone.length > 0 && !isValidWavePhone(normalizeWavePhone(wavePhone)))}
                    className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
                  >
                    {paying ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Redirection vers Wave...
                      </>
                    ) : (
                      <>
                        <WaveMark className="h-5 w-5 mr-2" />
                        Payer {new Intl.NumberFormat('fr-FR').format(subscriptionData.abonnementMontant)} FCFA avec Wave
                        <ExternalLink className="h-3.5 w-3.5 ml-2 opacity-70" />
                      </>
                    )}
                  </Button>
                </motion.div>

                <div className="flex items-center justify-center gap-4 pt-3 text-[11px] text-white/40">
                  <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Paiement sécurisé</span>
                  <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> SSL/TLS</span>
                </div>

                <div className="pt-3 text-center">
                  <button
                    onClick={() => router.push('/login')}
                    className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Payer plus tard (compte en attente)
                  </button>
                </div>
              </motion.div>
            ) : (
              // ─── Solo success card ───
              <motion.div
                key="step-3-success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="text-center py-2"
              >
                <motion.div
                  className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#84CC16]/15 border-2 border-[#84CC16] mb-5"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                >
                  <motion.svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-10 w-10"
                    initial="hidden"
                    animate="visible"
                  >
                    <motion.path
                      d="M5 13l4 4L19 7"
                      stroke="#84CC16"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      variants={{
                        hidden: { pathLength: 0, opacity: 0 },
                        visible: { pathLength: 1, opacity: 1 },
                      }}
                      transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                    />
                  </motion.svg>
                </motion.div>

                <motion.h2
                  className="text-2xl font-bold text-white mb-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  Compte créé !
                </motion.h2>
                <motion.p
                  className="text-sm text-white/60 mb-6 px-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  Votre espace enseignant <strong className="text-[#84CC16]">{selectedPlan?.nom}</strong> est prêt.
                </motion.p>

                <motion.div
                  className="rounded-xl border border-[#84CC16]/25 bg-[#84CC16]/8 p-4 mb-6 text-left"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/50 uppercase tracking-wider">Email de connexion</span>
                    <Mail className="h-3.5 w-3.5 text-[#84CC16]" />
                  </div>
                  <p className="text-sm font-semibold text-white font-mono break-all">{subscriptionData.user.email}</p>
                  <p className="text-[11px] text-white/40 mt-2">
                    Un établissement personnel a été créé automatiquement pour gérer vos classes et étudiants.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <Button
                    onClick={() => router.push('/login')}
                    className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
                  >
                    Se connecter <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </motion.div>
              </motion.div>
            )
          ) : null}

          {/* ─── STEP 1 : Plan selection ─── */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <StepHeader
                icon={<GraduationCap className="h-6 w-6" />}
                title="Choisissez votre plan"
                subtitle="SECT pour les enseignants freelance et indépendants. Sans engagement, annulable à tout moment."
              />
              <div className="space-y-3 mt-5">
                {PLANS_B2C.map((plan, i) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    index={i}
                    onSelect={() => {
                      setSelectedPlanId(plan.id)
                      setStep(2)
                    }}
                  />
                ))}
              </div>
              <div className="mt-6 text-center">
                <a href="/login" className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors">
                  <ArrowLeft className="h-3 w-3" /> Déjà un compte ? Se connecter
                </a>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 2 : Account form ─── */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <StepHeader
                icon={<User className="h-6 w-6" />}
                title="Créez votre compte"
                subtitle="Quelques informations et votre compte enseignant sera prêt."
              />

              {/* Plan recap */}
              <div className="rounded-xl border border-[#84CC16]/25 bg-[#84CC16]/8 p-4 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-white/50 uppercase tracking-wider">Plan sélectionné</p>
                    <p className="text-lg font-bold text-white">{selectedPlan?.nom}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-[#84CC16] font-mono">{selectedPlan?.prix}</div>
                    {selectedPlan?.suffix && <div className="text-xs text-white/50">{selectedPlan.suffix}</div>}
                  </div>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="mt-2 text-xs text-[#84CC16] hover:underline inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Changer de plan
                </button>
              </div>

              {/* Premium billing period */}
              {isPremium && (
                <motion.div
                  className="space-y-2 mb-4"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3 }}
                >
                  <Label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                    Mode de facturation
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <BillingToggle
                      active={periodeAbonnement === 'mensuel'}
                      onClick={() => setPeriodeAbonnement('mensuel')}
                      icon={<Calendar className="h-4 w-4 text-[#84CC16]" />}
                      title="Mensuel manuel"
                      desc="Vous payez chaque mois. Rappel par email."
                    />
                    <BillingToggle
                      active={periodeAbonnement === 'auto'}
                      onClick={() => setPeriodeAbonnement('auto')}
                      icon={<RefreshCw className="h-4 w-4 text-[#84CC16]" />}
                      title="Auto (prélèvement)"
                      desc="Renouvellement automatique chaque mois."
                    />
                  </div>
                </motion.div>
              )}

              {/* Form fields */}
              <div className="space-y-4">
                <Field label="Nom complet">
                  <InputWithIcon icon={<User className="h-4 w-4 text-[#84CC16]" />}>
                    <Input
                      type="text"
                      placeholder="Ex: Jean Kouassi"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                    />
                  </InputWithIcon>
                </Field>

                <Field label="Adresse email">
                  <InputWithIcon icon={<Mail className="h-4 w-4 text-[#84CC16]" />}>
                    <Input
                      type="email"
                      placeholder="professeur@exemple.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                    />
                  </InputWithIcon>
                </Field>

                <Field label={<>Ville <span className="text-white/30 normal-case">(optionnel)</span></>}>
                  <InputWithIcon icon={<MapPin className="h-4 w-4 text-[#84CC16]" />}>
                    <Input
                      type="text"
                      placeholder="Abidjan, Dakar, Lomé..."
                      value={ville}
                      onChange={(e) => setVille(e.target.value)}
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                    />
                  </InputWithIcon>
                </Field>

                <Field label="Mot de passe">
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#84CC16] transition-transform group-focus-within:scale-110" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                      aria-label={showPassword ? 'Masquer' : 'Afficher'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <AnimatePresence>
                    {password && password.length < 8 && (
                      <motion.p
                        initial={{ y: -8, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-xs text-amber-400 mt-1"
                      >
                        8 caractères minimum
                      </motion.p>
                    )}
                  </AnimatePresence>
                </Field>

                <Field label="Confirmer le mot de passe">
                  <InputWithIcon icon={<Lock className="h-4 w-4 text-[#84CC16]" />}>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitInscription() }}
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                    />
                  </InputWithIcon>
                  <AnimatePresence>
                    {confirmPassword && password !== confirmPassword && (
                      <motion.p
                        initial={{ y: -8, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-xs text-red-400 mt-1"
                      >
                        Les mots de passe ne correspondent pas.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </Field>

                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button
                    onClick={handleSubmitInscription}
                    disabled={submitting || !name.trim() || !email.trim() || password.length < 8 || password !== confirmPassword}
                    className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Création du compte...</>
                    ) : (
                      isPremium ? (
                        <><CreditCard className="h-5 w-5 mr-2" /> Continuer vers le paiement</>
                      ) : (
                        <><Sparkles className="h-5 w-5 mr-2" /> Créer mon compte enseignant</>
                      )
                    )}
                  </Button>
                </motion.div>

                <div className="flex items-center justify-center gap-4 pt-2 text-[11px] text-white/40">
                  <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Données sécurisées</span>
                  <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Sans engagement</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </WizardCard>
    </Background>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Background — dark gradient + glow orbs + subtle kente accent
// ═══════════════════════════════════════════════════════════════════
function Background({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0A1931] via-[#0f172a] to-[#1E1B4B] p-4 sm:p-6 overflow-hidden">
      {/* Glow orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#84CC16]/15 blur-3xl pointer-events-none"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#F59E0B]/10 blur-3xl pointer-events-none"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Subtle kente motif */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(90deg, transparent 0, transparent 50px, #84CC16 50px, #84CC16 55px, transparent 55px, transparent 58px, #F59E0B 58px, #F59E0B 61px, transparent 61px, transparent 64px, #C2410C 64px, #C2410C 66px, transparent 66px, transparent 100px),
            repeating-linear-gradient(45deg, transparent 0, transparent 25px, #F59E0B 25px, #F59E0B 30px, transparent 30px, transparent 50px)
          `,
        }}
      />
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// WizardCard — glass-morphism card with progress bar
// ═══════════════════════════════════════════════════════════════════
function WizardCard({
  step,
  stepLabels,
  children,
}: {
  step: number
  stepLabels: [string, string, string]
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-md relative z-10"
    >
      <div className="relative bg-white/[0.06] backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl shadow-black/40 p-6 sm:p-7 overflow-hidden">
        {/* Top kente accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: 'linear-gradient(90deg, #84CC16 0%, #84CC16 25%, #C2410C 25%, #C2410C 50%, #F59E0B 50%, #F59E0B 75%, #1E1B4B 75%)',
          }}
        />

        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-5 mt-2">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center mb-3 shadow-lg shadow-[#84CC16]/30">
            <GraduationCap className="h-7 w-7 text-[#0A1931]" />
          </div>
          <p className="text-[10px] text-[#84CC16]/80 font-medium tracking-wider uppercase">
            SECT — Système d'Évaluation Casse-Tête
          </p>
        </div>

        {/* Progress bar */}
        <Progress step={step} labels={stepLabels} />

        {children}
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Progress — 3 dots with animated fill
// ═══════════════════════════════════════════════════════════════════
function Progress({ step, labels }: { step: number; labels: [string, string, string] }) {
  return (
    <div className="mb-6">
      <div className="relative flex items-center justify-between px-2">
        {/* Background track */}
        <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-white/10 -translate-y-1/2" />
        {/* Animated fill */}
        <motion.div
          className="absolute top-1/2 left-2 h-0.5 bg-gradient-to-r from-[#84CC16] to-[#65A30D] -translate-y-1/2"
          initial={false}
          animate={{ width: `calc((100% - 1rem) * ${(Math.max(step - 1, 0)) / 2})` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        {/* Circles */}
        {[1, 2, 3].map(n => {
          const isComplete = step > n
          const isCurrent = step === n
          return (
            <motion.div
              key={n}
              className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                isComplete
                  ? 'bg-[#84CC16] border-[#84CC16] text-[#0A1931]'
                  : isCurrent
                  ? 'bg-[#0A1931] border-[#84CC16] text-[#84CC16]'
                  : 'bg-[#0A1931] border-white/15 text-white/40'
              }`}
              animate={
                isCurrent
                  ? { boxShadow: ['0 0 0 0 rgba(132,204,22,0.5)', '0 0 0 8px rgba(132,204,22,0)'] }
                  : {}
              }
              transition={isCurrent ? { duration: 1.5, repeat: Infinity } : {}}
            >
              {isComplete ? <CheckCircle2 className="h-4 w-4" /> : n}
            </motion.div>
          )
        })}
      </div>
      <div className="grid grid-cols-3 mt-2">
        {labels.map((label, i) => (
          <span
            key={i}
            className={`text-center text-[10px] font-medium transition-colors ${
              step === i + 1 ? 'text-white' : step > i + 1 ? 'text-white/60' : 'text-white/40'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// StepHeader — icon + title + subtitle
// ═══════════════════════════════════════════════════════════════════
function StepHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-9 w-9 rounded-lg bg-[#84CC16]/15 border border-[#84CC16]/30 flex items-center justify-center text-[#84CC16]">
          {icon}
        </div>
        <h1 className="text-lg font-bold text-white">{title}</h1>
      </div>
      <p className="text-sm text-white/55 ml-11">{subtitle}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// PlanCard — selectable plan with hover lift + scale popular badge
// ═══════════════════════════════════════════════════════════════════
function PlanCard({ plan, index, onSelect }: { plan: B2CPlan; index: number; onSelect: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.1, duration: 0.3 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
        plan.popular
          ? 'border-[#84CC16] bg-[#84CC16]/8 shadow-lg shadow-[#84CC16]/15'
          : 'border-white/10 bg-white/[0.03] hover:border-[#84CC16]/40 hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
            {plan.nom}
            {plan.popular && (
              <motion.span
                className="text-[10px] bg-[#84CC16] text-[#0A1931] px-2 py-0.5 rounded-full font-semibold"
                whileHover={{ scale: 1.08 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                ★ Populaire
              </motion.span>
            )}
          </h3>
          <p className="text-xs text-white/55 mt-0.5">{plan.description}</p>
        </div>
        <div className="text-right ml-2 shrink-0">
          <div className="text-xl font-bold text-white font-mono">{plan.prix}</div>
          {plan.suffix && <div className="text-[10px] text-white/50">{plan.suffix}</div>}
          {plan.sub && <div className="text-[10px] text-[#F59E0B] font-medium">{plan.sub}</div>}
        </div>
      </div>
      <ul className="space-y-1.5 mt-3">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-white/75">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#84CC16] shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      {plan.paymentRequired && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#F59E0B]">
          <CreditCard className="h-3 w-3" />
          Paiement requis après inscription
        </div>
      )}
    </motion.button>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Small UI helpers
// ═══════════════════════════════════════════════════════════════════
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">{label}</Label>
      {children}
    </div>
  )
}

function InputWithIcon({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative group">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-transform group-focus-within:scale-110">
        {icon}
      </div>
      {children}
    </div>
  )
}

function BillingToggle({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-xl border-2 text-left transition-all ${
        active
          ? 'border-[#84CC16] bg-[#84CC16]/8'
          : 'border-white/10 bg-white/[0.03] hover:border-[#84CC16]/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-semibold text-white">{title}</span>
      </div>
      <p className="text-[10px] text-white/55">{desc}</p>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-white/55">{label}</span>
      <span className="text-sm font-semibold text-white text-right">{value}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// WaveMark — Wave brand mark (accent cyan, never used as primary)
// Wave official color is #1DC8FF. Per project rules (no blue/indigo as
// primary), it's used ONLY as accent on the WaveMark — never as button
// background or primary color.
// ═══════════════════════════════════════════════════════════════════
function WaveMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2 14c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"
        stroke="#1DC8FF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 19c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"
        stroke="#1DC8FF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <circle cx="12" cy="6" r="2.2" fill="#1DC8FF" />
    </svg>
  )
}
