'use client'

// ═══════════════════════════════════════════════════════════════════════════
// StudentSignupPage — Inscription étudiante via lien direct (MVP B2C Phase 1)
// ═══════════════════════════════════════════════════════════════════════════
// Clone de accept-invitation-page.tsx (design particules + password strength),
// adapté pour l'inscription étudiante B2C : l'étudiant saisit lui-même son
// email + nom + mot de passe. Le token est vérifié via
// /api/student-signup/verify, puis l'inscription est finalisée via
// /api/student-signup.
//
// SECT-REG-LINK-PHASE2-FRONTEND-1 : Phase 2
//  - Widget Cloudflare Turnstile (chargé via next/script, rendu conditionnel
//    si GET /api/turnstile/site-key renvoie un siteKey non vide).
//  - Codes d'erreur DOMAIN_NOT_ALLOWED + TURNSTILE_FAILED + QUOTA_EXCEEDED
//    capitation (message amélioré + bouton « Contacter le support »).
//  - Banner contextuel « Email institutionnel requis » si le lien impose un
//    domaine (@univ-ci.edu).
//
// Identité visuelle : "Savane EdTech" — palette dark navy (#0A1931 / #0f172a /
// #1E1B4B) + accents vert lime #84CC16 + or #F59E0B + terre cuite #C2410C,
// motif kente + glow orbs animés + glass-morphism. Alignée exactement sur la
// page /souscrire-b2c (cf. SECT-INSCRIPTION-STYLE-ALIGN-1). Aucune dépendance à
// accept-invitation (les helpers getPasswordStrength / getPasswordChecks /
// useCountdown sont clonés ici pour éviter un couplage fragile).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import Script from 'next/script'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  BookOpen,
  MapPin,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  X,
  KeyRound,
  Users,
  ShieldCheck,
  AtSign,
  ShieldAlert,
  AlertTriangle,
  MessageSquare,
  GraduationCap,
} from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Badge as DSBadge, ProgressBar } from '@/components/ds'

// ─── Types ───

interface VerifyLinkResponse {
  valid: boolean
  // SECT-INSCRIPTION-DISPLAY-FIX-1 : le backend retourne etablissement + filiere
  // imbriqués (objet), PAS plats. Anciennement le type attendait etablissementNom,
  // filiereNom etc. plats → undefined → rien ne s'affichait sauf niveau (qui est plat).
  etablissement?: {
    nom: string
    type: string
    ville?: string | null
    matriculeRegex?: string
    matriculeFormat?: string
    matriculeExample?: string
  }
  filiere?: {
    nom: string
    code?: string
  } | null
  creatorName: string
  expiresAt: string
  useCount: number
  maxUses: number | null
  niveau: string | null
  label: string | null
  // SECT-REG-LINK-PHASE2-FRONTEND-1 : restriction de domaine email (B2B)
  emailDomainRestriction?: string | null
  // SECT-REG-LINK-PHASE3-FRONTEND-1 : message de bienvenue personnalisé
  // (présent seulement si non vide côté backend — preview dans l'encart contexte).
  customWelcomeMessage?: string | null
  // SECT-STUDENT-SIGNUP-MATRICULE-1 : flag B2B — si true, l'étudiant doit saisir
  // un matricule (fourni par son établissement). La validation utilise la config
  // matricule de l'établissement (regex/format/example ci-dessus).
  requireMatricule?: boolean
}

type VerifyErrorCode =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'QUOTA_EXCEEDED'
  | 'USER_EXISTS'
  | 'DOMAIN_NOT_ALLOWED'
  | 'TURNSTILE_FAILED'
  | 'MATRICULE_REQUIRED'
  | 'MATRICULE_INVALID'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | null

interface StudentSignupPageProps {
  token: string
  initialEmail?: string
  onComplete: () => void
}

// ─── Cloudflare Turnstile typing (window global) ───
// Le script Turnstile expose `window.turnstile` une fois chargé depuis
// https://challenges.cloudflare.com/turnstile/v0/api.js (via next/script).

declare global {
  interface Window {
    turnstile?: {
      render: (
        selector: string | HTMLElement,
        options: {
          sitekey: string
          appearance?: 'always' | 'execute' | 'interaction-only'
          theme?: 'light' | 'dark' | 'auto'
          callback?: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
        },
      ) => string
      reset: (id?: string) => void
      remove: (id: string) => void
    }
  }
}

// ─── Step Indicator — aligné sur le style Progress de /souscrire-b2c ───
// SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : wizard 2 étapes pour la page
// d'inscription étudiante. Step 1 = Vérification du contexte du lien,
// Step 2 = Création du compte (formulaire + Turnstile).
//
// SECT-INSCRIPTION-STYLE-ALIGN-1 : refonte visuelle exacte du StepIndicator
// pour matcher le composant Progress de /souscrire-b2c (palette dark navy +
// vert lime #84CC16 + or #F59E0B + terre cuite #C2410C, glow pulse, track
// animé). Adapté pour 2 cercles (au lieu de 3) : la formule de fill devient
// `(step-1)/1` au lieu de `(step-1)/2`.
function StepIndicator({ currentStep }: { currentStep: 1 | 2 }) {
  const labels: [string, string] = ['Vérification', 'Création du compte']
  const step = currentStep
  return (
    <div
      className="mb-6"
      role="navigation"
      aria-label="Étapes d'inscription étudiante"
    >
      <div className="relative flex items-center justify-between px-2">
        {/* Background track */}
        <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-white/10 -translate-y-1/2" />
        {/* Animated fill */}
        <motion.div
          className="absolute top-1/2 left-2 h-0.5 bg-gradient-to-r from-[#84CC16] to-[#65A30D] -translate-y-1/2"
          initial={false}
          animate={{ width: `calc((100% - 1rem) * ${Math.max(step - 1, 0) / 1})` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        {/* Circles */}
        {[1, 2].map((n) => {
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
                  ? {
                      boxShadow: [
                        '0 0 0 0 rgba(132,204,22,0.5)',
                        '0 0 0 8px rgba(132,204,22,0)',
                      ],
                    }
                  : {}
              }
              transition={isCurrent ? { duration: 1.5, repeat: Infinity } : {}}
            >
              {isComplete ? <CheckCircle2 className="h-4 w-4" /> : n}
            </motion.div>
          )
        })}
      </div>
      <div className="grid grid-cols-2 mt-2">
        {labels.map((label, i) => (
          <span
            key={i}
            className={`text-center text-[10px] font-medium transition-colors ${
              step === i + 1
                ? 'text-white'
                : step > i + 1
                  ? 'text-white/60'
                  : 'text-white/40'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Etab type labels ───

const ETAB_TYPE_LABELS: Record<string, string> = {
  UNIVERSITE: 'Université',
  INSTITUT: 'Institut',
  ECOLE: 'École',
  PERSONNEL: 'Établissement personnel',
  IUT: 'IUT',
  BTS: 'BTS',
}

// ─── Password strength helpers (clonés depuis accept-invitation-page.tsx) ───

function getPasswordStrength(password: string): {
  score: number
  label: string
  color: string
  bgColor: string
} {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 1) return { score, label: 'Faible', color: 'text-red-400', bgColor: 'bg-red-500' }
  if (score === 2) return { score, label: 'Moyen', color: 'text-amber-400', bgColor: 'bg-amber-500' }
  if (score === 3) return { score, label: 'Fort', color: 'text-[#84CC16]', bgColor: 'bg-[#84CC16]' }
  return { score, label: 'Très fort', color: 'text-[#84CC16]', bgColor: 'bg-[#84CC16]' }
}

function getPasswordChecks(password: string) {
  return [
    { label: 'Au moins 8 caractères', met: password.length >= 8 },
    { label: 'Une lettre majuscule', met: /[A-Z]/.test(password) },
    { label: 'Une lettre minuscule', met: /[a-z]/.test(password) },
    { label: 'Un chiffre', met: /[0-9]/.test(password) },
    { label: 'Un caractère spécial (recommandé)', met: /[^A-Za-z0-9]/.test(password) },
  ]
}

// ─── Countdown timer (cloné depuis accept-invitation-page.tsx) ───

function useCountdown(targetDate: string | null) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!targetDate) return

    const update = () => {
      const now = new Date().getTime()
      const target = new Date(targetDate).getTime()
      const diff = target - now

      if (diff <= 0) {
        setTimeLeft('Expirée')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      if (days > 0) {
        setTimeLeft(`${days}j ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`)
      } else {
        setTimeLeft(`${seconds}s`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  return timeLeft
}

// ─── Zod schema ───
// Validation : name ≥ 3 chars, email valide, password ≥ 8 chars avec
// 1 majuscule + 1 minuscule + 1 chiffre (cohérent avec accept-invitation,
// spécial = recommandé mais non bloquant), confirm doit matcher, CGU acceptées.

const signupSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Le nom doit contenir au moins 3 caractères'),
    email: z.string().email('Adresse email invalide'),
    password: z
      .string()
      .min(8, 'Au moins 8 caractères')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[a-z]/, 'Au moins une minuscule')
      .regex(/[0-9]/, 'Au moins un chiffre'),
    confirmPassword: z.string(),
    acceptCGU: z.boolean().refine((v) => v === true, {
      message: "Vous devez accepter les conditions d'utilisation",
    }),
    // SECT-STUDENT-SIGNUP-MATRICULE-1 : matricule optionnel (requis conditionnellement
    // si linkData.requireMatricule === true). La validation required + regex est
    // faite côté onSubmit handler (dynamique selon linkData) + côté backend (authoritative).
    matricule: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

type SignupFormValues = z.infer<typeof signupSchema>

// ─── Main Component ───

export function StudentSignupPage({ token, initialEmail = '', onComplete }: StudentSignupPageProps) {
  // State
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [matricule, setMatricule] = useState<string | null>(null)
  const [userExistsEmail, setUserExistsEmail] = useState<string | null>(null)

  // SECT-REG-LINK-PHASE2-FRONTEND-1 : Cloudflare Turnstile captcha
  // `turnstileSiteKey` est vide par défaut (= dev mode, widget désactivé).
  // Une fois le fetch /api/turnstile/site-key terminé, il contient la clé
  // publique Cloudflare (non sensible) et le widget est rendu.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string>('')
  const [turnstileRendered, setTurnstileRendered] = useState(false)
  // SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : traque l'ID du widget Turnstile
  // pour pouvoir le reset/remove proprement, + un flag d'échec de chargement
  // (si l'iframe ne s'injecte pas après 8s, on affiche un bouton Réessayer).
  const [turnstileWidgetId, setTurnstileWidgetId] = useState<string | null>(null)
  const [turnstileLoadFailed, setTurnstileLoadFailed] = useState(false)

  // SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : wizard 2 étapes.
  // Step 1 = Vérification du contexte du lien (établissement, filière, message,
  // countdown, places restantes) + bouton "Continuer".
  // Step 2 = Création du compte (formulaire Nom/Email/Password/CGU + Turnstile).
  // Le step reste à 2 en cas d'erreur submit (l'utilisateur peut corriger).
  const [step, setStep] = useState<1 | 2>(1)

  // SECT-REG-LINK-PHASE2-FRONTEND-1 : code d'erreur provenant du POST
  // /api/student-signup (DOMAIN_NOT_ALLOWED / TURNSTILE_FAILED / QUOTA_EXCEEDED
  // capitation). Quand non-null, on affiche l'écran d'erreur dédié (au lieu
  // du simple toast) pour une meilleure visibilité et des actions dédiées.
  const [submitErrorCode, setSubmitErrorCode] = useState<VerifyErrorCode>(null)

  // ─── Verify token (TanStack Query, one-shot) ───
  // On ne logue JAMAIS le token dans la console (sécurité frontend).
  const verifyQuery = useQuery<{
    ok: boolean
    data?: VerifyLinkResponse
    code?: VerifyErrorCode
    message?: string
  }>({
    queryKey: ['student-signup-verify', token],
    queryFn: async () => {
      const res = await fetch(
        `/api/student-signup/verify?token=${encodeURIComponent(token)}`,
      )
      const json = await res.json()
      if (!res.ok) {
        return {
          ok: false,
          code: (json.code || 'SERVER_ERROR') as VerifyErrorCode,
          message: json.error || 'Erreur lors de la vérification',
        }
      }
      return { ok: true, data: json as VerifyLinkResponse }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const isVerifying = verifyQuery.isLoading || verifyQuery.isFetching
  const linkData = verifyQuery.data?.ok ? verifyQuery.data.data ?? null : null
  const verifyError: VerifyErrorCode = verifyQuery.isError
    ? 'NETWORK_ERROR'
    : verifyQuery.data && !verifyQuery.data.ok
      ? (verifyQuery.data.code ?? null)
      : null
  const verifyErrorMessage = verifyQuery.isError
    ? 'Erreur de connexion. Veuillez vérifier votre connexion internet.'
    : verifyQuery.data && !verifyQuery.data.ok
      ? (verifyQuery.data.message ?? '')
      : ''

  // SECT-REG-LINK-PHASE2-FRONTEND-1 : fetch de la clé publique Turnstile.
  // Endpoint PUBLIC (Cache-Control: public, max-age=60). Si la clé est vide
  // (= dev mode ou Turnstile non configuré côté backend), le widget n'est pas
  // rendu et le formulaire fonctionne comme avant (rétro-compatible Phase 1).
  useEffect(() => {
    let cancelled = false
    fetch('/api/turnstile/site-key')
      .then((r) => r.json())
      .then((data: { siteKey?: string }) => {
        if (!cancelled && data.siteKey) setTurnstileSiteKey(data.siteKey)
      })
      .catch(() => {
        /* silent — dev mode (widget désactivé) */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // SECT-REG-LINK-PHASE2-FRONTEND-1 : rendu du widget Turnstile une fois le
  // script chargé + la clé récupérée. On attend que `window.turnstile` soit
  // disponible (next/script strategy="afterInteractive" charge de façon async).
  //
  // SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : améliorations clés pour garantir
  // l'affichage du widget :
  //  - `appearance: 'always'` force le rendu même en mode "managed" (Cloudflare
  //    peut décider de ne pas rendre le widget si l'environnement semble suspect).
  //  - `theme: 'auto'` s'adapte au dark/light mode de SECT (sinon le widget peut
  //    être invisible en dark mode si le thème n'est pas forcé).
  //  - Si après 8s le widget n'est toujours pas rendu, on bascule
  //    `turnstileLoadFailed = true` pour afficher un bouton "Réessayer".
  //  - On sauvegarde le widget ID pour pouvoir le reset/remove proprement.
  //  - Avant chaque render(), on vide le conteneur #cf-turnstile au cas où un
  //    résidu d'un widget précédent empêche Cloudflare de re-render.
  //
  // SECT-TURNSTILE-RENDER-FIX-1 : BUG FIX — le conteneur #cf-turnstile n'existe
  // qu'au Step 2 (dans renderStep2). Avant ce fix, le useEffect se déclenchait
  // dès que siteKey était fetched (Step 1), appelait render() sur un conteneur
  // introuvable → retournait undefined → setTurnstileLoadFailed(true) → bouton
  // "Réessayer" affiché dès l'arrivée au Step 2. Fix : ajouter `step` dans les
  // dépendances + guard `if (step !== 2) return` + vérifier que le conteneur
  // existe avant de render (sinon retry 100ms).
  useEffect(() => {
    if (!turnstileSiteKey || turnstileRendered) return
    // SECT-TURNSTILE-RENDER-FIX-1 : ne rendre le widget qu'au Step 2 (le conteneur
    // #cf-turnstile n'est monté que dans renderStep2). Au Step 1, on sort tôt.
    if (step !== 2) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const tryRender = () => {
      if (typeof window === 'undefined') return
      if (window.turnstile) {
        try {
          // SECT-TURNSTILE-RENDER-FIX-1 : vérifier que le conteneur #cf-turnstile
          // existe dans le DOM avant d'appeler render(). Au Step 2, le conteneur
          // est monté par renderStep2, mais il peut y avoir un race condition
          // (useEffect se déclenche avant le commit DOM). Si le conteneur n'existe
          // pas encore, on retry dans 100ms au lieu de failer silencieusement.
          const container = document.getElementById('cf-turnstile')
          if (!container) {
            // Conteneur pas encore monté — retry dans 100ms (max ~5s via le
            // timeoutId de 8s qui mettra loadFailed=true si jamais rendu).
            retryTimer = setTimeout(tryRender, 100)
            return
          }
          // Nettoie le conteneur avant render (au cas où un widget précédent
          // ait laissé des résidus — hidden input, etc.).
          if (container.innerHTML) {
            container.innerHTML = ''
          }
          const widgetId = window.turnstile.render('#cf-turnstile', {
            sitekey: turnstileSiteKey,
            appearance: 'always',
            theme: 'auto',
            callback: (t) => {
              setTurnstileToken(t)
              setTurnstileLoadFailed(false)
            },
            'error-callback': () => {
              setTurnstileToken(null)
              setTurnstileLoadFailed(true)
            },
            'expired-callback': () => setTurnstileToken(null),
          })
          // Si render() retourne un ID valide, on marque comme rendu.
          // Sinon (undefined/null), on considère que le rendu a échoué.
          if (widgetId) {
            setTurnstileWidgetId(widgetId)
            setTurnstileRendered(true)
            // Timeout de sécurité : si après 8s aucun token n'a été obtenu ET
            // qu'aucune erreur n'a été signalée, on considère que le widget a
            // échoué à se charger (ex: environnement headless, network bloqué).
            timeoutId = setTimeout(() => {
              setTurnstileToken((current) => {
                if (!current) {
                  setTurnstileLoadFailed(true)
                }
                return current
              })
            }, 8000)
          } else {
            // render() a retourné undefined/null → échec silencieux.
            setTurnstileLoadFailed(true)
          }
        } catch {
          setTurnstileLoadFailed(true)
        }
      } else {
        // Le script n'est pas encore chargé — retry dans 200ms.
        retryTimer = setTimeout(tryRender, 200)
      }
    }
    tryRender()

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [turnstileSiteKey, turnstileRendered, step])

  // SECT-TURNSTILE-RENDER-FIX-1 : cleanup quand on quitte le Step 2.
  // Si l'utilisateur retourne au Step 1 après que le widget a été rendu, on
  // retire le widget Cloudflare et on reset turnstileRendered pour permettre
  // un re-render propre au prochain passage au Step 2. Sans ça, le widget
  // resterait orphan (conteneur démonté mais turnstileRendered=true bloque le
  // re-render au prochain Step 2).
  useEffect(() => {
    if (step === 2 || !turnstileRendered) return
    // On a quitté le Step 2 et le widget était rendu — cleanup.
    if (typeof window !== 'undefined' && window.turnstile && turnstileWidgetId) {
      try {
        window.turnstile.remove(turnstileWidgetId)
      } catch {
        /* ignore — widget déjà retiré ou ID invalide */
      }
    }
    setTurnstileWidgetId(null)
    setTurnstileRendered(false)
    setTurnstileLoadFailed(false)
    setTurnstileToken(null)
  }, [step])

  // SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : retry du widget Turnstile.
  // On retire l'ancien widget (si présent) puis on reset les états pour
  // re-déclencher le useEffect qui rappellera render() + resettera le
  // timeout de 8s. Toutes les opérations sont wrappées en try/catch pour
  // éviter qu'une erreur côté Cloudflare ne crash l'app React.
  const retryTurnstile = () => {
    // Retire proprement l'ancien widget si présent.
    if (typeof window !== 'undefined' && window.turnstile && turnstileWidgetId) {
      try {
        window.turnstile.remove(turnstileWidgetId)
      } catch {
        /* ignore — widget déjà retiré ou ID invalide */
      }
    }
    // Note : on ne vide PAS manuellement innerHTML du div #cf-turnstile car
    // ce div est vide côté React (géré par Turnstile). Le remove() ci-dessus
    // a déjà nettoyé le contenu injecté par Cloudflare.
    setTurnstileWidgetId(null)
    setTurnstileRendered(false)
    setTurnstileLoadFailed(false)
    setTurnstileToken(null)
  }

  // ─── Form (react-hook-form + zod) ───
  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: initialEmail,
      password: '',
      confirmPassword: '',
      acceptCGU: false,
      matricule: '',
    },
    mode: 'onTouched',
  })

  // Watch password + confirmPassword for live strength meter + match indicator
  const password = form.watch('password')
  const confirmPassword = form.watch('confirmPassword')

  // Countdown
  const countdown = useCountdown(linkData?.expiresAt || null)

  // Places restantes (si maxUses défini)
  const placesRestantes =
    linkData?.maxUses != null ? Math.max(0, linkData.maxUses - linkData.useCount) : null
  const placesPourcentage =
    linkData?.maxUses != null && linkData.maxUses > 0
      ? (linkData.useCount / linkData.maxUses) * 100
      : 0

  // ─── Submit handler ───
  // SECT-REG-LINK-PHASE2-FRONTEND-1 : si Turnstile est activé (siteKey non vide)
  // mais qu'aucun token n'a été obtenu (widget non complété/expiré/erreur),
  // on bloque la soumission côté client (defense in depth — le backend refait
  // la vérification via siteverify). En cas d'échec, on reset le widget pour
  // permettre à l'utilisateur de réessayer.
  const onSubmit = async (values: SignupFormValues) => {
    if (turnstileSiteKey && !turnstileToken) {
      toast.error('Vérification anti-robot requise', {
        description: 'Veuillez compléter la vérification anti-robot pour continuer.',
      })
      return
    }
    // SECT-STUDENT-SIGNUP-MATRICULE-1 : validation matricule côté client (UX rapide).
    // Le backend refait la validation (authoritative). Si requireMatricule=true et
    // matricule vide → on bloque ici (évite un round-trip). Si regex fournie et ne
    // match pas → on bloque aussi avec un message explicite.
    if (linkData?.requireMatricule === true) {
      const mat = values.matricule?.trim() ?? ''
      if (!mat) {
        toast.error('Matricule requis', {
          description: 'Veuillez saisir le matricule fourni par votre établissement.',
        })
        return
      }
      const regex = linkData.etablissement?.matriculeRegex
      if (regex) {
        try {
          const re = new RegExp(regex)
          if (!re.test(mat)) {
            toast.error('Format de matricule invalide', {
              description: linkData.etablissement?.matriculeFormat
                ? `Format attendu : ${linkData.etablissement.matriculeFormat}`
                : 'Le format du matricule ne correspond pas à celui attendu par votre établissement.',
            })
            return
          }
        } catch {
          // Regex Postgres invalide côté JS (syntaxe différente) — on skip la
          // validation client et on laisse le backend faire (fail-open UX).
        }
      }
    }
    setIsSubmitting(true)
    setUserExistsEmail(null)
    try {
      const res = await fetch('/api/student-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: values.email.trim().toLowerCase(),
          name: values.name.trim(),
          password: values.password,
          // SECT-REG-LINK-PHASE2-FRONTEND-1 : token Turnstile (vide en dev mode).
          cfTurnstileToken: turnstileToken ?? '',
          // SECT-STUDENT-SIGNUP-MATRICULE-1 : matricule B2B (vide si non requis).
          matricule: values.matricule?.trim() || '',
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        // Reset Turnstile pour permettre une nouvelle tentative — le token
        // est à usage unique et ne peut être réutilisé après un échec.
        if (turnstileSiteKey && typeof window !== 'undefined' && window.turnstile) {
          window.turnstile.reset()
          setTurnstileToken(null)
        }
        // SECT-REG-LINK-PHASE2-FRONTEND-1 : on bascule vers un écran d'erreur
        // dédié pour les nouveaux codes (DOMAIN_NOT_ALLOWED / TURNSTILE_FAILED
        // / QUOTA_EXCEEDED capitation). Les autres erreurs (USER_EXISTS, etc.)
        // conservent leur traitement existant (écran dédié ou toast).
        if (data.code === 'DOMAIN_NOT_ALLOWED' || data.code === 'TURNSTILE_FAILED' || data.code === 'QUOTA_EXCEEDED' || data.code === 'MATRICULE_REQUIRED' || data.code === 'MATRICULE_INVALID') {
          setSubmitErrorCode(data.code as VerifyErrorCode)
          toast.error('Inscription échouée', {
            description: data.error || 'Veuillez corriger et réessayer.',
          })
        } else if (data.code === 'USER_EXISTS') {
          setUserExistsEmail(values.email.trim().toLowerCase())
          toast.error('Compte existant', {
            description:
              'Un compte existe déjà avec cet email. Connectez-vous directement.',
          })
        } else if (data.error) {
          toast.error('Erreur', { description: data.error })
        }
        return
      }

      setMatricule(data.user?.matricule ?? null)
      setIsSuccess(true)
      toast.success('Compte créé avec succès', {
        description: 'Vous pouvez maintenant vous connecter.',
      })
    } catch {
      // Reset Turnstile aussi sur erreur réseau (token potentiellement consommé).
      if (turnstileSiteKey && typeof window !== 'undefined' && window.turnstile) {
        window.turnstile.reset()
        setTurnstileToken(null)
      }
      toast.error('Erreur réseau', {
        description: 'Impossible de créer votre compte. Veuillez réessayer.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Render: Loading state ───
  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="h-10 w-10 animate-spin text-[#84CC16] mb-4" />
      <p className="text-sm text-white/40">Vérification de votre lien d&apos;inscription...</p>
    </div>
  )

  // ─── Render: Error state ───
  // SECT-REG-LINK-PHASE2-FRONTEND-1 : la fonction accepte désormais un code
  // d'erreur explicite pour gérer à la fois les erreurs verify (NOT_FOUND,
  // INACTIVE, EXPIRED, QUOTA_EXCEEDED lien, NETWORK_ERROR) et les erreurs
  // submit (DOMAIN_NOT_ALLOWED, TURNSTILE_FAILED, QUOTA_EXCEEDED capitation).
  const renderError = (errorCode: VerifyErrorCode) => {
    const getErrorContent = () => {
      switch (errorCode) {
        case 'NOT_FOUND':
          return {
            icon: <X className="h-8 w-8" />,
            title: 'Lien invalide',
            description:
              "Ce lien d'inscription n'est pas valide. Il a peut-être été modifié, révoqué, ou n'existe plus.",
            showRetry: false,
            showSupport: true,
            showReload: false,
          }
        case 'INACTIVE':
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Lien désactivé',
            description:
              "Ce lien d'inscription a été désactivé par l'établissement. Contactez votre établissement pour obtenir un nouveau lien.",
            showRetry: false,
            showSupport: true,
            showReload: false,
          }
        case 'EXPIRED':
          return {
            icon: <Clock className="h-8 w-8" />,
            title: 'Lien expiré',
            description:
              verifyErrorMessage ||
              "Ce lien d'inscription a expiré. Les liens sont valables 30 jours. Demandez un nouveau lien à votre établissement.",
            showRetry: false,
            showSupport: true,
            showReload: false,
          }
        case 'QUOTA_EXCEEDED':
          // SECT-REG-LINK-PHASE2-FRONTEND-1 : message amélioré pour le quota
          // capitation (distinct du quota maxUses du lien). Si submitErrorCode
          // est QUOTA_EXCEEDED, c'est le quota capitation qui a été atteint ;
          // sinon, c'est le quota maxUses du lien (verify-time).
          return {
            icon: <Users className="h-8 w-8" />,
            title: 'Quota atteint',
            description: submitErrorCode === 'QUOTA_EXCEEDED'
              ? 'Votre établissement a atteint son quota d\'étudiants. Contactez votre responsable ou le support SECT pour régulariser.'
              : "Ce lien a atteint son nombre maximum d'inscriptions. Contactez votre établissement pour obtenir un nouveau lien.",
            showRetry: false,
            showSupport: true,
            showReload: false,
          }
        case 'DOMAIN_NOT_ALLOWED':
          // SECT-REG-LINK-PHASE2-FRONTEND-1 : email hors domaine autorisé.
          return {
            icon: <ShieldAlert className="h-8 w-8" />,
            title: 'Domaine email non autorisé',
            description: 'Cet email n\'appartient pas au domaine autorisé par votre établissement. Utilisez votre email institutionnel.',
            showRetry: true,
            showSupport: true,
            showReload: false,
          }
        case 'TURNSTILE_FAILED':
          // SECT-REG-LINK-PHASE2-FRONTEND-1 : vérification anti-robot échouée.
          return {
            icon: <AlertTriangle className="h-8 w-8" />,
            title: 'Vérification anti-robot échouée',
            description: 'Veuillez rafraîchir la page et réessayer. Si le problème persiste, contactez le support.',
            showRetry: false,
            showSupport: true,
            showReload: true,
          }
        case 'MATRICULE_REQUIRED':
          // SECT-STUDENT-SIGNUP-MATRICULE-1 : matricule B2B requis mais manquant.
          return {
            icon: <KeyRound className="h-8 w-8" />,
            title: 'Matricule requis',
            description: 'Votre établissement exige un matricule pour l\'inscription. Veuillez saisir le matricule qui vous a été fourni, puis réessayer.',
            showRetry: true,
            showSupport: true,
            showReload: false,
          }
        case 'MATRICULE_INVALID':
          // SECT-STUDENT-SIGNUP-MATRICULE-1 : format matricule invalide.
          return {
            icon: <KeyRound className="h-8 w-8" />,
            title: 'Format de matricule invalide',
            description: linkData?.etablissement?.matriculeFormat
              ? `Le format attendu est : ${linkData.etablissement.matriculeFormat}${linkData.etablissement.matriculeExample ? ` (ex: ${linkData.etablissement.matriculeExample})` : ''}`
              : 'Le matricule saisi ne correspond pas au format attendu par votre établissement.',
            showRetry: true,
            showSupport: true,
            showReload: false,
          }
        case 'NETWORK_ERROR':
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Erreur de connexion',
            description:
              'Impossible de vérifier votre lien. Veuillez vérifier votre connexion internet.',
            showRetry: true,
            showSupport: false,
            showReload: false,
          }
        default:
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Erreur',
            description: verifyErrorMessage || "Une erreur inattendue s'est produite.",
            showRetry: true,
            showSupport: true,
            showReload: false,
          }
      }
    }

    const errorContent = getErrorContent()

    return (
      <div className="flex flex-col items-center text-center py-8" role="alert">
        <div className="flex h-16 w-16 items-center justify-center rounded-full mb-4 bg-red-500/10 text-red-400">
          {errorContent.icon}
        </div>
        <h3 className="text-lg font-semibold mb-2 font-display text-white">{errorContent.title}</h3>
        <p className="text-sm text-white/40 max-w-sm mb-6">
          {errorContent.description}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {errorContent.showRetry && (
            <Button
              variant="outline"
              onClick={() => {
                // Réinitialise l'erreur submit + permet de re-soumettre.
                // Pour une erreur verify, on tente un refetch.
                setSubmitErrorCode(null)
                if (verifyError) verifyQuery.refetch()
              }}
              className="border-[#84CC16]/30 text-[#84CC16] hover:bg-[#84CC16]/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
          )}
          {errorContent.showReload && (
            <Button
              variant="outline"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload()
              }}
              className="border-[#F59E0B]/30 text-[#F59E0B] hover:bg-[#F59E0B]/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Recharger
            </Button>
          )}
          {errorContent.showSupport && (
            <a href="mailto:contact@sect.app?subject=Probl%C3%A8me%20lien%20d%27inscription">
              <Button className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all">
                Contacter le support
              </Button>
            </a>
          )}
        </div>
      </div>
    )
  }

  // ─── Render: Success state ───
  const renderSuccess = () => (
    <div className="flex flex-col items-center text-center py-8">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-[#84CC16]/15 mb-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        >
          <CheckCircle2 className="h-10 w-10 text-[#84CC16]" />
        </motion.div>
      </motion.div>
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-xl font-semibold text-[#84CC16] mb-2 font-display"
      >
        Compte créé avec succès !
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-sm text-white/40 mb-4"
      >
        Bienvenue sur SECT. Vous pouvez maintenant vous connecter avec votre email et votre mot de passe.
      </motion.p>

      {matricule && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-4 py-3 mb-6 flex items-center gap-3"
        >
          <KeyRound className="h-5 w-5 text-[#F59E0B] flex-shrink-0" />
          <div className="text-left">
            <p className="text-xs text-white/40">Votre matricule étudiant</p>
            <p className="text-sm font-mono font-bold tracking-wider text-white">
              {matricule}
            </p>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <Button
          onClick={onComplete}
          className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
        >
          Se connecter
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </motion.div>
    </div>
  )

  // ─── Render: USER_EXISTS state ───
  // Cas spécial : un compte existe déjà avec cet email. On affiche un message
  // dédié + un bouton "Se connecter" au lieu du formulaire.
  const renderUserExists = () => (
    <div className="flex flex-col items-center text-center py-8" role="alert">
      <div className="flex h-16 w-16 items-center justify-center rounded-full mb-4 bg-[#84CC16]/15 text-[#84CC16]">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold mb-2 font-display text-white">Compte existant</h3>
      <p className="text-sm text-white/40 max-w-sm mb-6">
        Un compte existe déjà avec l&apos;adresse{' '}
        <span className="font-medium text-white">{userExistsEmail}</span>. Connectez-vous
        directement avec cette adresse email.
      </p>
      <Button
        onClick={onComplete}
        className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
      >
        Aller à la connexion
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  )

  // ─── Render: Step 1 - Vérification du contexte du lien ───
  // SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : wizard 2 étapes. Le step 1 affiche
  // le contexte (établissement, filière, message, countdown, places restantes)
  // + un bouton "Continuer" qui passe au step 2 (formulaire). Aucun champ de
  // formulaire ici — l'utilisateur confirme juste qu'il est sur le bon lien.
  const renderStep1 = () => {
    if (!linkData) return null

    return (
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        {/* SECT-STUDENT-SIGNUP-DESIGN-WAHOU-1 : chip de section colorée (alignée wizard B2C). */}
        <div className="flex items-center gap-1.5 mb-2">
          <Building2 className="h-4 w-4 text-[#84CC16]" />
          <span className="text-xs font-semibold uppercase tracking-wide text-[#84CC16]">
            Étape 1 — Vérification du contexte
          </span>
        </div>

        <div className="text-center space-y-1 mb-2">
          <h2 className="text-lg font-semibold font-display text-white">Confirmez votre inscription</h2>
          <p className="text-sm text-white/40">
            Vérifiez les informations ci-dessous avant de créer votre compte.
          </p>
        </div>

        {/* Contexte établissement — glassmorphism interne (bg-white/[0.04] + border-white/10) */}
        <div className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-sm p-4 space-y-3">
          <p className="text-xs text-white/40">Vous rejoignez</p>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#84CC16] flex-shrink-0" />
            <p className="text-sm font-semibold font-display text-white">
              {linkData.etablissement?.nom || 'Établissement'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {/* SECT-INSCRIPTION-BADGES-FIX-1 : remplacer les DSBadge shadcn (conçus
                pour thème clair) par des badges inline avec couleurs hex du thème
                sombre. Les DSBadge variants (primary/success/info/warning)
                avaient des fonds clairs qui rendaient le texte illisible sur le
                fond sombre — notamment le badge 'primary' qui créait un rectangle
                blanc masquant le texte. */}
            {linkData.etablissement?.type && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-[#84CC16]/40 bg-[#84CC16]/15 text-[#84CC16]">
                <Building2 className="h-3 w-3" />
                {ETAB_TYPE_LABELS[linkData.etablissement.type] || linkData.etablissement.type}
              </span>
            )}
            {linkData.filiere?.nom && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#F59E0B]">
                <BookOpen className="h-3 w-3" />
                {linkData.filiere.nom}
                {linkData.filiere.code ? ` (${linkData.filiere.code})` : ''}
              </span>
            )}
            {linkData.etablissement?.ville && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-white/20 bg-white/5 text-white/80">
                <MapPin className="h-3 w-3" />
                {linkData.etablissement.ville}
              </span>
            )}
            {linkData.niveau && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-[#C2410C]/40 bg-[#C2410C]/15 text-[#C2410C]">
                <GraduationCap className="h-3 w-3" />
                {linkData.niveau}
              </span>
            )}
          </div>
          {/* SECT-REG-LINK-PHASE2-FRONTEND-1 : banner contexte domaine email */}
          {linkData.emailDomainRestriction && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-[#C2410C]/40 bg-[#C2410C]/15 text-[#C2410C] w-full">
              <AtSign className="h-3 w-3" />
              Email institutionnel requis : @{linkData.emailDomainRestriction}
            </span>
          )}
          {/* SECT-REG-LINK-PHASE3-FRONTEND-1 : message de bienvenue personnalisé
              de l'enseignant (affiché si non vide côté backend). */}
          {linkData.customWelcomeMessage && (
            <div className="mt-2 p-3 rounded-md bg-[#84CC16]/10 border border-[#84CC16]/20">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#84CC16] mb-1">
                <MessageSquare className="h-3 w-3" />
                Message de votre enseignant
              </div>
              <p className="text-sm text-white whitespace-pre-wrap">
                {linkData.customWelcomeMessage}
              </p>
            </div>
          )}
          {linkData.creatorName && (
            <p className="text-xs text-white/40 pt-1 border-t border-white/10">
              Invité par <span className="font-medium text-white">{linkData.creatorName}</span>
            </p>
          )}
        </div>

        {/* Compte à rebours expiration (toujours visible au step 1) */}
        {countdown && countdown !== 'Expirée' && (
          <div className="flex items-center gap-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-3 py-2">
            <Clock className="h-4 w-4 text-[#F59E0B] flex-shrink-0" />
            <p className="text-xs text-white">
              <span className="font-semibold">Expire dans :</span> {countdown}
            </p>
          </div>
        )}

        {/* Places restantes */}
        {placesRestantes != null && (
          <div className="rounded-lg border border-[#84CC16]/20 bg-[#84CC16]/5 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#84CC16]">
                <Users className="h-3.5 w-3.5" />
                Places restantes
              </span>
              <span className="font-mono font-semibold tabular-nums text-white">
                {placesRestantes} / {linkData.maxUses}
              </span>
            </div>
            <ProgressBar
              value={placesPourcentage}
              accent={placesRestantes === 0 ? 'destructive' : 'info'}
              size="sm"
              showLabel={false}
              showValue={false}
            />
          </div>
        )}

        {/* Bouton Continuer */}
        <Button
          onClick={() => setStep(2)}
          className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
        >
          Continuer
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </motion.div>
    )
  }

  // ─── Render: Step 2 - Création du compte (formulaire) ───
  // SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : le formulaire de création de compte
  // (Nom, Email, Password + meter, Confirm, CGU, Turnstile, Submit) avec un
  // bouton "Retour" en haut pour revenir au step 1.
  const renderStep2 = () => {
    if (!linkData) return null

    const strength = getPasswordStrength(password)
    const checks = getPasswordChecks(password)
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
    const isFormValid = form.formState.isValid
    // SECT-REG-LINK-PHASE2-FRONTEND-1 : Turnstile doit être complété si activé.
    const turnstileRequired = !!turnstileSiteKey
    const turnstileSatisfied = !turnstileRequired || !!turnstileToken
    // SECT-STUDENT-SIGNUP-MATRICULE-1 : si le lien exige un matricule, le bouton
    // submit est désactivé tant que le champ est vide (UX — le backend refait le check).
    const matriculeRequired = linkData.requireMatricule === true
    const matriculeValue = form.watch('matricule')?.trim() ?? ''
    const matriculeSatisfied = !matriculeRequired || matriculeValue.length > 0

    return (
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* SECT-STUDENT-SIGNUP-DESIGN-WAHOU-1 : chip de section colorée (alignée wizard B2C). */}
          <div className="flex items-center gap-1.5 mb-2">
            <User className="h-4 w-4 text-[#F59E0B]" />
            <span className="text-xs font-semibold uppercase tracking-wide text-[#F59E0B]">
              Étape 2 — Création du compte
            </span>
          </div>

          {/* Bouton Retour */}
          <button
            type="button"
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>

          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="signup-name" className="text-white/80">Nom complet</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                id="signup-name"
                type="text"
                placeholder="Prénom Nom"
                autoComplete="name"
                className="pl-9 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                aria-invalid={!!form.formState.errors.name}
                {...form.register('name')}
              />
            </div>
            {form.formState.errors.name && (
              <p className="text-xs text-red-400" role="alert">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* SECT-STUDENT-SIGNUP-MATRICULE-1 : Matricule B2B (conditionnel).
              Affiché uniquement si le lien exige un matricule (requireMatricule=true).
              L'étudiant saisit le matricule fourni par son établissement. La validation
              utilise etab.matriculeRegex (Postgres regex) côté client + backend. */}
          {linkData.requireMatricule === true && (
            <div className="space-y-2">
              <Label htmlFor="signup-matricule" className="flex items-center gap-1.5 text-white/80">
                <KeyRound className="h-3.5 w-3.5 text-[#F59E0B]" />
                Matricule étudiant
                <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  id="signup-matricule"
                  type="text"
                  placeholder={linkData.etablissement?.matriculeExample || 'Votre matricule étudiant'}
                  autoComplete="off"
                  className="pl-9 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all font-mono"
                  aria-invalid={!!form.formState.errors.matricule}
                  {...form.register('matricule')}
                />
              </div>
              {linkData.etablissement?.matriculeFormat && (
                <p className="text-xs text-white/40 flex items-center gap-1">
                  <span>Format attendu :</span>
                  <span className="font-mono font-medium text-white">
                    {linkData.etablissement.matriculeFormat}
                  </span>
                </p>
              )}
              {form.formState.errors.matricule && (
                <p className="text-xs text-red-400" role="alert">
                  {form.formState.errors.matricule.message}
                </p>
              )}
            </div>
          )}

          {/* Email field */}
          <div className="space-y-2">
            <Label htmlFor="signup-email" className="text-white/80">Adresse email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                id="signup-email"
                type="email"
                placeholder="vous@exemple.com"
                autoComplete="email"
                className="pl-9 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
            </div>
            {form.formState.errors.email && (
              <p className="text-xs text-red-400" role="alert">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Password field */}
          <div className="space-y-2">
            <Label htmlFor="signup-password" className="text-white/80">Mot de passe</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Créez un mot de passe sécurisé"
                autoComplete="new-password"
                className="pl-9 pr-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                aria-invalid={!!form.formState.errors.password}
                {...form.register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Strength indicator */}
            {password.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        strength.score >= level ? strength.bgColor : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${strength.color}`}>
                  Force : {strength.label}
                </p>
              </div>
            )}

            {/* Requirements checklist */}
            {password.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-1.5">
                <p className="text-xs font-medium text-white/40 mb-2">
                  Exigences du mot de passe
                </p>
                {checks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2">
                    {check.met ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#84CC16] flex-shrink-0" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-white/40 flex-shrink-0" />
                    )}
                    <span
                      className={`text-xs ${
                        check.met ? 'text-[#84CC16]' : 'text-white/40'
                      }`}
                    >
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {form.formState.errors.password && (
              <p className="text-xs text-red-400" role="alert">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          {/* Confirm password field */}
          <div className="space-y-2">
            <Label htmlFor="signup-confirm-password" className="text-white/80">Confirmer le mot de passe</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                id="signup-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirmez votre mot de passe"
                autoComplete="new-password"
                className="pl-9 pr-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all"
                aria-invalid={!!form.formState.errors.confirmPassword}
                {...form.register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                aria-label={
                  showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                }
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-400">Les mots de passe ne correspondent pas</p>
            )}
            {confirmPassword.length > 0 && passwordsMatch && (
              <p className="text-xs text-[#84CC16]">Les mots de passe correspondent</p>
            )}
            {form.formState.errors.confirmPassword && (
              <p className="text-xs text-red-400" role="alert">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* CGU checkbox (label sibling — évite le double-toggle Radix) */}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="signup-cgu"
                checked={form.watch('acceptCGU')}
                onCheckedChange={(checked) => {
                  form.setValue('acceptCGU', checked === true, { shouldValidate: true })
                }}
                className="mt-0.5 border-white/20 data-[state=checked]:bg-[#84CC16] data-[state=checked]:border-[#84CC16] data-[state=checked]:text-[#0A1931]"
                aria-invalid={!!form.formState.errors.acceptCGU}
              />
              <label
                htmlFor="signup-cgu"
                className="text-sm leading-relaxed cursor-pointer text-white/40"
              >
                J&apos;accepte les{' '}
                <span className="font-medium text-white">conditions d&apos;utilisation</span> et la{' '}
                <span className="font-medium text-white">politique de confidentialité</span> de SECT.
              </label>
            </div>
            {form.formState.errors.acceptCGU && (
              <p className="text-xs text-red-400" role="alert">
                {form.formState.errors.acceptCGU.message}
              </p>
            )}
          </div>

          {/* SECT-REG-LINK-PHASE2-FRONTEND-1 : widget Cloudflare Turnstile */}
          {/* Rendu conditionnel — uniquement si siteKey non vide (prod). En dev */}
          {/* (clé vide), le bloc n'est pas rendu et le formulaire marche comme avant. */}
          {/* SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : le conteneur #cf-turnstile est */}
          {/* VIDE (géré entièrement par Turnstile — pas d'enfants React dedans pour */}
          {/* éviter les conflits de réconciliation DOM React vs Turnstile). Les */}
          {/* placeholders de chargement/erreur sont des siblings positionnés en */}
          {/* absolu au-dessus du conteneur, visibles seulement quand Turnstile n'a */}
          {/* pas encore injecté son iframe. */}
          {turnstileSiteKey && (
            <div className="space-y-2">
              <Label htmlFor="cf-turnstile" className="text-white/80">Vérification de sécurité</Label>
              <div className="relative min-h-[70px] rounded-md border border-white/10 bg-white/5 p-2">
                {/* Conteneur Turnstile — VIDE, géré par Cloudflare. Ne PAS
                    mettre d'enfants React ici (conflit DOM). */}
                <div
                  id="cf-turnstile"
                  className="min-h-[66px] flex items-center justify-center"
                  aria-label="Vérification anti-robot Cloudflare"
                  role="group"
                />
                {/* Placeholder de chargement : overlay absolu au-dessus du
                    conteneur Turnstile. Caché une fois le widget rendu. */}
                {!turnstileRendered && !turnstileLoadFailed && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/40 bg-white/5 rounded-md pointer-events-none">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Chargement du défi de sécurité…
                  </div>
                )}
                {/* État d'échec : overlay absolu avec bouton Réessayer. */}
                {turnstileLoadFailed && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-white/40 bg-[#0A1931]/95 rounded-md">
                    <ShieldAlert className="h-4 w-4 text-[#F59E0B]" />
                    <span>Le défi de sécurité n&apos;a pas pu se charger.</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={retryTurnstile}
                      className="h-7 text-xs mt-1 border-[#84CC16]/30 text-[#84CC16] hover:bg-[#84CC16]/10"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Réessayer
                    </Button>
                  </div>
                )}
              </div>
              {!turnstileToken && !turnstileLoadFailed && (
                <p className="text-xs text-white/40 flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 flex-shrink-0" />
                  Vérification anti-robot requise pour activer le bouton de création.
                </p>
              )}
              {turnstileToken && (
                <p className="text-xs text-[#84CC16] flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                  Vérification réussie. Vous pouvez créer votre compte.
                </p>
              )}
            </div>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            disabled={!isFormValid || isSubmitting || !turnstileSatisfied || !matriculeSatisfied}
            className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Création du compte...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-1" />
                Créer mon compte
              </>
            )}
          </Button>
        </form>
      </motion.div>
    )
  }

  // ─── Main render ───
  // SECT-REG-LINK-PHASE2-FRONTEND-1 : l'erreur active prend en priorité les
  // erreurs submit (DOMAIN_NOT_ALLOWED / TURNSTILE_FAILED / QUOTA_EXCEEDED
  // capitation), puis les erreurs verify (NOT_FOUND / INACTIVE / EXPIRED /
  // QUOTA_EXCEEDED lien / NETWORK_ERROR). Le Script Turnstile est chargé via
  // next/script strategy="afterInteractive" (uniquement si siteKey non vide).
  //
  // SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : la StepIndicator n'est visible que
  // dans le flow normal (pas sur loading/error/success/userExists). Le contenu
  // bascule entre renderStep1 (contexte) et renderStep2 (formulaire) selon
  // l'état `step`. En cas d'erreur submit, on reste à step=2.
  const activeError: VerifyErrorCode = submitErrorCode ?? verifyError

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-br from-[#0A1931] via-[#0f172a] to-[#1E1B4B] p-4 sm:p-6 overflow-hidden">
      {/* SECT-REG-LINK-PHASE2-FRONTEND-1 : script Cloudflare Turnstile */}
      {/* Chargé uniquement si siteKey non vide (dev mode = pas de widget). */}
      {turnstileSiteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          async
          defer
        />
      )}

      {/* SECT-INSCRIPTION-STYLE-ALIGN-1 : arrière-plan aligné sur /souscrire-b2c.
          Couche 1 : 2 glow orbs animés (vert lime + or) qui pulse.
          Couche 2 : motif kente subtil (opacity 4%) en repeating-linear-gradient. */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#84CC16]/15 blur-3xl pointer-events-none"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#F59E0B]/10 blur-3xl pointer-events-none"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: `
            repeating-linear-gradient(90deg, transparent 0, transparent 50px, #84CC16 50px, #84CC16 55px, transparent 55px, transparent 58px, #F59E0B 58px, #F59E0B 61px, transparent 61px, transparent 64px, #C2410C 64px, #C2410C 66px, transparent 66px, transparent 100px),
            repeating-linear-gradient(45deg, transparent 0, transparent 25px, #F59E0B 25px, #F59E0B 30px, transparent 30px, transparent 50px)
          `,
        }}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-2 py-8 sm:py-12 relative z-10">
        {/* Signup Card — WizardCard style aligné sur /souscrire-b2c
            (glass-morphism + kente top bar + logo + brand subtitle). */}
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
                background:
                  'linear-gradient(90deg, #84CC16 0%, #84CC16 25%, #C2410C 25%, #C2410C 50%, #F59E0B 50%, #F59E0B 75%, #1E1B4B 75%)',
              }}
              aria-hidden="true"
            />

            {/* Logo + brand */}
            <div className="flex flex-col items-center mb-5 mt-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center mb-3 shadow-lg shadow-[#84CC16]/30">
                <GraduationCap className="h-7 w-7 text-[#0A1931]" />
              </div>
              <p className="text-[10px] text-[#84CC16]/80 font-medium tracking-wider uppercase">
                SECT — Système d&apos;Évaluation Casse-Tête
              </p>
              <h1 className="mt-2 text-xl sm:text-2xl font-semibold text-white font-display">
                Inscription étudiante
              </h1>
            </div>

            <AnimatePresence mode="wait">
              {isVerifying && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {renderLoading()}
                </motion.div>
              )}
              {!isVerifying && activeError && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {renderError(activeError)}
                </motion.div>
              )}
              {!isVerifying && !activeError && isSuccess && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {renderSuccess()}
                </motion.div>
              )}
              {!isVerifying && !activeError && !isSuccess && userExistsEmail && (
                <motion.div
                  key="user-exists"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {renderUserExists()}
                </motion.div>
              )}
              {/* SECT-STUDENT-SIGNUP-WIZARD-REDESIGN-1 : wizard 2 étapes avec
                  StepIndicator visible uniquement dans le flow normal. */}
              {!isVerifying && !activeError && !isSuccess && !userExistsEmail && linkData && (
                <motion.div
                  key={`step-${step}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <StepIndicator currentStep={step} />
                  {step === 1 && renderStep1()}
                  {step === 2 && renderStep2()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center relative z-10 mt-auto">
        <Separator className="mx-auto max-w-md mb-4 bg-white/10" />
        <p className="text-xs text-white/40">
          &copy; 2026 SECT — Tous droits réservés
        </p>
      </footer>
    </div>
  )
}
