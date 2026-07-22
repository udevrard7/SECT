'use client'

import { useState, useCallback, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, ArrowLeft, ArrowRight, AlertCircle, CheckCircle2,
  Loader2, User, Mail, Lock, Eye, EyeOff, Phone, MapPin, Users,
  Globe, Shield, Sparkles, ClipboardList, MailCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * /souscrire-b2b — Inscription self-service pour les institutions B2B.
 *
 * Wizard 3 étapes : Établissement → Responsable → Confirmation.
 * Crée : Établissement + RESPONSABLE + abonnement ESSAI (14 jours).
 * L'admin SECT valide ensuite (ESSAI → ACTIF).
 *
 * Modèle capitation : max(nbEtudiants, 50) × 900 FCFA/an.
 */

// ═══════════════════════════════════════════════════════════════════
// Suspense wrapper (page may use useSearchParams in the future)
// ═══════════════════════════════════════════════════════════════════
export default function SouscrireB2BPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SouscrireB2BContent />
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <Background>
      <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
    </Background>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Types & constants
// ═══════════════════════════════════════════════════════════════════
const ETAB_TYPES: { value: string; label: string }[] = [
  { value: 'UNIVERSITE', label: 'Université' },
  { value: 'INSTITUT', label: 'Institut' },
  { value: 'ECOLE', label: 'École' },
  { value: 'FORMATION_PRO', label: 'Centre de formation pro' },
]

const PAYS_OPTIONS = [
  "Côte d'Ivoire", 'Sénégal', 'Mali', 'Burkina Faso', 'Guinée', 'Bénin', 'Togo', 'Cameroun', 'Gabon', 'Autre',
]

const CAPITATION_PER_STUDENT = 900
const CAPITATION_MIN_STUDENTS = 50

// ═══════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════
function SouscrireB2BContent() {
  const router = useRouter()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const [form, setForm] = useState({
    etabNom: '',
    etabType: 'UNIVERSITE',
    etabVille: '',
    etabPays: "Côte d'Ivoire",
    etabTelephone: '',
    respName: '',
    respEmail: '',
    respPassword: '',
    nbEtudiants: '50',
  })

  // ─── Live capitation calculation ───
  const capitation = useMemo(() => {
    const nb = Math.max(parseInt(form.nbEtudiants) || 0, CAPITATION_MIN_STUDENTS)
    return {
      nb,
      montant: nb * CAPITATION_PER_STUDENT,
    }
  }, [form.nbEtudiants])

  const set = useCallback((field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }, [])

  // ─── Step 2 → Step 3 (validation, no API call yet) ───
  const goToConfirmation = useCallback(() => {
    setError(null)
    if (!form.etabNom.trim()) {
      setError("Le nom de l'établissement est requis.")
      setStep(1)
      return
    }
    if (!form.respName.trim()) {
      setError('Le nom du responsable est requis.')
      setStep(2)
      return
    }
    if (!form.respEmail.trim() || !form.respEmail.includes('@')) {
      setError('Email du responsable invalide.')
      setStep(2)
      return
    }
    if (form.respPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      setStep(2)
      return
    }
    setStep(3)
  }, [form])

  // ─── Step 3 → submit (POST /api/subscriptions/b2b) ───
  const handleSubmit = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/subscriptions/b2b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          nbEtudiants: parseInt(form.nbEtudiants) || 50,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'inscription")
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription")
      setStep(1)
    } finally {
      setLoading(false)
    }
  }, [form])

  // ═══════════════════════════════════════════════════════════════
  // Render — success state (full-screen)
  // ═══════════════════════════════════════════════════════════════
  if (success) {
    return (
      <Background>
        <WizardCard step={3} stepLabels={['Établissement', 'Responsable', 'Confirmation']}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="text-center py-2"
          >
            <motion.div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#F97316]/15 border-2 border-[#F97316] mb-5"
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
                  stroke="#F97316"
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
              Inscription reçue !
            </motion.h2>
            <motion.p
              className="text-sm text-white/60 mb-6 px-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              Un <strong className="text-[#F97316]">email de vérification</strong> vous a été envoyé.
              Cliquez sur le lien qu'il contient pour confirmer votre adresse email.
            </motion.p>

            <motion.div
              className="rounded-xl border border-[#F97316]/25 bg-[#F97316]/8 p-4 mb-6 text-left"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <p className="text-xs text-white/60 mb-3 flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-[#F97316]" />
                Prochaines étapes :
              </p>
              <ol className="space-y-2">
                {[
                  'Vérifiez votre email (boîte de réception)',
                  'Cliquez sur le lien de vérification',
                  'Notre équipe valide votre établissement sous 24h',
                  'Vous recevez un email de confirmation → essai 14 jours',
                ].map((s, i) => (
                  <motion.li
                    key={i}
                    className="flex items-start gap-2 text-sm text-white/80"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + i * 0.1 }}
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[#F97316]/20 border border-[#F97316]/40 text-[#F97316] text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </motion.li>
                ))}
              </ol>
            </motion.div>

            <motion.div
              className="rounded-lg border border-white/10 bg-white/[0.03] p-3 mb-6 text-left"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
            >
              <p className="text-[11px] text-white/60 flex items-start gap-1.5">
                <MailCheck className="h-3.5 w-3.5 text-[#F97316] shrink-0 mt-0.5" />
                Vous pouvez utiliser un email Gmail, Yahoo ou Outlook. Notre équipe vérifiera
                votre établissement avant l'activation de l'essai.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <Button
                onClick={() => router.push('/')}
                className="w-full h-12 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold shadow-lg shadow-[#F97316]/25 hover:shadow-xl hover:shadow-[#F97316]/40 transition-all"
              >
                Retour à l'accueil <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          </motion.div>
        </WizardCard>
      </Background>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Render — wizard
  // ═══════════════════════════════════════════════════════════════
  const stepLabels: [string, string, string] = ['Établissement', 'Responsable', 'Confirmation']

  return (
    <Background>
      <WizardCard step={step} stepLabels={stepLabels}>
        {/* Error banner (slide-in from top + shake) */}
        <AnimatePresence>
          {error && (
            <motion.div
              key={error}
              initial={{ y: -12, opacity: 0, x: 0, height: 0 }}
              animate={{
                y: 0,
                opacity: 1,
                x: [0, -8, 8, -4, 4, 0],
                height: 'auto',
              }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden mb-4"
            >
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* ─── STEP 1 : Établissement ─── */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <StepHeader
                icon={<Building2 className="h-6 w-6" />}
                title="Votre établissement"
                subtitle="Inscrivez votre institution. Période d'essai de 14 jours, sans engagement."
              />

              <div className="space-y-4">
                <Field label="Nom de l'établissement *">
                  <InputWithIcon icon={<Building2 className="h-4 w-4 text-[#F97316]" />}>
                    <Input
                      value={form.etabNom}
                      onChange={(e) => set('etabNom', e.target.value)}
                      placeholder="Ex: Université Félix Houphouët-Boigny"
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all"
                    />
                  </InputWithIcon>
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Type">
                    <div className="relative">
                      <select
                        value={form.etabType}
                        onChange={(e) => set('etabType', e.target.value)}
                        className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 pr-9 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all appearance-none cursor-pointer"
                      >
                        {ETAB_TYPES.map(t => (
                          <option key={t.value} value={t.value} className="bg-[#0f172a] text-white">
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </Field>

                  <Field label="Nb étudiants estimé">
                    <InputWithIcon icon={<Users className="h-4 w-4 text-[#F97316]" />}>
                      <Input
                        type="number"
                        min={CAPITATION_MIN_STUDENTS}
                        value={form.nbEtudiants}
                        onChange={(e) => set('nbEtudiants', e.target.value)}
                        className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all font-mono"
                      />
                    </InputWithIcon>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Ville">
                    <InputWithIcon icon={<MapPin className="h-4 w-4 text-[#F97316]" />}>
                      <Input
                        value={form.etabVille}
                        onChange={(e) => set('etabVille', e.target.value)}
                        placeholder="Abidjan"
                        className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all"
                      />
                    </InputWithIcon>
                  </Field>

                  <Field label="Pays">
                    <div className="relative">
                      <select
                        value={form.etabPays}
                        onChange={(e) => set('etabPays', e.target.value)}
                        className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 pr-9 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all appearance-none cursor-pointer"
                      >
                        {PAYS_OPTIONS.map(p => (
                          <option key={p} value={p} className="bg-[#0f172a] text-white">{p}</option>
                        ))}
                      </select>
                      <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </Field>
                </div>

                <Field label="Téléphone">
                  <InputWithIcon icon={<Phone className="h-4 w-4 text-[#F97316]" />}>
                    <Input
                      type="tel"
                      value={form.etabTelephone}
                      onChange={(e) => set('etabTelephone', e.target.value)}
                      placeholder="+225 ..."
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all font-mono"
                    />
                  </InputWithIcon>
                </Field>

                {/* Live capitation calculation */}
                <motion.div
                  className="rounded-xl border border-[#F97316]/25 bg-[#F97316]/8 p-4"
                  layout
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-[#F97316]" />
                    <p className="text-xs font-semibold text-[#F97316] uppercase tracking-wider">
                      Estimation capitation annuelle
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-white/60">
                      max({form.nbEtudiants || '0'}, {CAPITATION_MIN_STUDENTS}) × {CAPITATION_PER_STUDENT} FCFA
                    </div>
                    <motion.div
                      key={capitation.montant}
                      initial={{ scale: 0.85, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="text-xl font-bold text-[#F97316] font-mono"
                    >
                      {new Intl.NumberFormat('fr-FR').format(capitation.montant)} FCFA
                    </motion.div>
                  </div>
                  <p className="text-[11px] text-white/40 mt-1">
                    {capitation.nb} étudiants facturés · Essai gratuit de 14 jours avant activation
                  </p>
                </motion.div>

                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button
                    onClick={() => { setError(null); setStep(2) }}
                    disabled={!form.etabNom.trim()}
                    className="w-full h-12 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold shadow-lg shadow-[#F97316]/25 hover:shadow-xl hover:shadow-[#F97316]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continuer <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </motion.div>

                <div className="text-center">
                  <button
                    onClick={() => router.push('/')}
                    className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" /> Retour à l'accueil
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 2 : Responsable ─── */}
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
                title="Compte responsable"
                subtitle="Ce compte vous donnera un accès administrateur à votre établissement."
              />

              {/* Recap établissement */}
              <div className="rounded-xl border border-[#F97316]/25 bg-[#F97316]/8 p-4 mb-5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] text-white/50 uppercase tracking-wider">Établissement</p>
                    <p className="text-base font-bold text-white truncate">{form.etabNom}</p>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      {ETAB_TYPES.find(t => t.value === form.etabType)?.label}
                      {form.etabVille && ` · ${form.etabVille}`}
                      {form.etabPays && ` · ${form.etabPays}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setStep(1)}
                    className="text-xs text-[#F97316] hover:underline inline-flex items-center gap-1 shrink-0 ml-2"
                  >
                    <ArrowLeft className="h-3 w-3" /> Modifier
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <Field label="Nom complet *">
                  <InputWithIcon icon={<User className="h-4 w-4 text-[#F97316]" />}>
                    <Input
                      value={form.respName}
                      onChange={(e) => set('respName', e.target.value)}
                      placeholder="Jean Kouassi"
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all"
                    />
                  </InputWithIcon>
                </Field>

                <Field label="Email *">
                  <InputWithIcon icon={<Mail className="h-4 w-4 text-[#F97316]" />}>
                    <Input
                      type="email"
                      value={form.respEmail}
                      onChange={(e) => set('respEmail', e.target.value)}
                      placeholder="responsable@etablissement.ci"
                      className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all"
                    />
                  </InputWithIcon>
                </Field>

                <Field label={<>Mot de passe * <span className="text-white/30 normal-case">(min 8 caractères)</span></>}>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F97316] transition-transform group-focus-within:scale-110" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={form.respPassword}
                      onChange={(e) => set('respPassword', e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') goToConfirmation() }}
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/25 focus:bg-white/8 transition-all"
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
                    {form.respPassword && form.respPassword.length < 8 && (
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

                <div className="flex items-center justify-center gap-4 pt-1 text-[11px] text-white/40">
                  <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Données chiffrées</span>
                  <span className="flex items-center gap-1"><MailCheck className="h-3.5 w-3.5" /> Email vérifié</span>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="flex-1 h-12 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                  </Button>
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="flex-1">
                    <Button
                      onClick={goToConfirmation}
                      disabled={!form.respName.trim() || !form.respEmail.includes('@') || form.respPassword.length < 8}
                      className="w-full h-12 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold shadow-lg shadow-[#F97316]/25 hover:shadow-xl hover:shadow-[#F97316]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Voir le récapitulatif <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 3 : Confirmation ─── */}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <StepHeader
                icon={<ClipboardList className="h-6 w-6" />}
                title="Confirmation"
                subtitle="Vérifiez les informations avant de soumettre votre inscription."
              />

              {/* Établissement récap */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-3">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-[#F97316]" />
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Établissement</p>
                </div>
                <div className="space-y-1.5">
                  <RecapRow label="Nom" value={form.etabNom} />
                  <RecapRow label="Type" value={ETAB_TYPES.find(t => t.value === form.etabType)?.label || form.etabType} />
                  <RecapRow label="Ville" value={form.etabVille || '—'} />
                  <RecapRow label="Pays" value={form.etabPays} />
                  <RecapRow label="Téléphone" value={form.etabTelephone || '—'} />
                  <RecapRow label="Nb étudiants" value={form.nbEtudiants} />
                </div>
              </div>

              {/* Responsable récap */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-3">
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4 text-[#F97316]" />
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Responsable</p>
                </div>
                <div className="space-y-1.5">
                  <RecapRow label="Nom" value={form.respName} />
                  <RecapRow label="Email" value={form.respEmail} />
                  <RecapRow label="Mot de passe" value="••••••••" />
                </div>
              </div>

              {/* Capitation récap */}
              <motion.div
                className="rounded-xl border border-[#F97316]/25 bg-[#F97316]/8 p-4 mb-5"
                initial={{ scale: 0.98, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-white/50 uppercase tracking-wider">Capitation annuelle</p>
                    <p className="text-[11px] text-white/40 mt-0.5">
                      {capitation.nb} étudiants × {CAPITATION_PER_STUDENT} FCFA
                    </p>
                  </div>
                  <div className="text-2xl font-bold text-[#F97316] font-mono">
                    {new Intl.NumberFormat('fr-FR').format(capitation.montant)}
                    <span className="text-sm font-normal text-white/50 ml-1">FCFA</span>
                  </div>
                </div>
                <p className="text-[11px] text-white/40 mt-2 pt-2 border-t border-white/10">
                  Essai gratuit de 14 jours — La capitation sera facturée après validation par notre équipe.
                </p>
              </motion.div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setStep(2)}
                  variant="outline"
                  className="flex-1 h-12 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                </Button>
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="flex-[2]">
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full h-12 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold shadow-lg shadow-[#F97316]/25 hover:shadow-xl hover:shadow-[#F97316]/40 transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Inscription...</>
                    ) : (
                      <><Sparkles className="h-5 w-5 mr-2" /> Inscrire mon établissement</>
                    )}
                  </Button>
                </motion.div>
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
      {/* Glow orbs (orange + amber) */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#F97316]/15 blur-3xl pointer-events-none"
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
            repeating-linear-gradient(90deg, transparent 0, transparent 50px, #F97316 50px, #F97316 55px, transparent 55px, transparent 58px, #F59E0B 58px, #F59E0B 61px, transparent 61px, transparent 64px, #C2410C 64px, #C2410C 66px, transparent 66px, transparent 100px),
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
      className="w-full max-w-lg relative z-10"
    >
      <div className="relative bg-white/[0.06] backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl shadow-black/40 p-6 sm:p-7 overflow-hidden">
        {/* Top kente accent bar (orange tones) */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: 'linear-gradient(90deg, #F97316 0%, #F97316 25%, #C2410C 25%, #C2410C 50%, #F59E0B 50%, #F59E0B 75%, #1E1B4B 75%)',
          }}
        />

        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-5 mt-2">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#F97316] to-[#EA580C] flex items-center justify-center mb-3 shadow-lg shadow-[#F97316]/30">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <p className="text-[10px] text-[#F97316]/80 font-medium tracking-wider uppercase">
            SECT — Institutionnel
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
          className="absolute top-1/2 left-2 h-0.5 bg-gradient-to-r from-[#F97316] to-[#EA580C] -translate-y-1/2"
          initial={false}
          animate={{ width: `calc((100% - 1rem) * ${Math.max(step - 1, 0) / 2})` }}
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
                  ? 'bg-[#F97316] border-[#F97316] text-white'
                  : isCurrent
                  ? 'bg-[#0A1931] border-[#F97316] text-[#F97316]'
                  : 'bg-[#0A1931] border-white/15 text-white/40'
              }`}
              animate={
                isCurrent
                  ? { boxShadow: ['0 0 0 0 rgba(249,115,22,0.5)', '0 0 0 8px rgba(249,115,22,0)'] }
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
        <div className="h-9 w-9 rounded-lg bg-[#F97316]/15 border border-[#F97316]/30 flex items-center justify-center text-[#F97316]">
          {icon}
        </div>
        <h1 className="text-lg font-bold text-white">{title}</h1>
      </div>
      <p className="text-sm text-white/55 ml-11">{subtitle}</p>
    </div>
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

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/55">{label}</span>
      <span className="text-white font-medium text-right break-all ml-2">{value}</span>
    </div>
  )
}
