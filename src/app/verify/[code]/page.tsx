'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  CheckCircle2,
  XCircle,
  Search,
  Loader2,
  ShieldCheck,
  GraduationCap,
  Calendar,
  Building2,
  Hash,
  Award,
  BookOpen,
  Star,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CertificatData {
  id?: string
  codeVerification: string
  type: 'STANDARD' | 'AVANCE' | 'EXPERT'
  etudiantNom: string
  ueCode: string
  ueNom: string
  note: number
  mention: string
  dateEmission: string
  etablissementNom: string
  revoked?: boolean
}

interface VerifyResponse {
  valid: boolean
  certificat?: CertificatData
}

type VerificationStatus = 'idle' | 'loading' | 'valid' | 'invalid' | 'not_found' | 'error'

// ─── Badge config per type ───────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  STANDARD: {
    label: 'Standard',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700',
    icon: <BookOpen className="size-3.5" />,
  },
  AVANCE: {
    label: 'Avancé',
    color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
    icon: <Award className="size-3.5" />,
  },
  EXPERT: {
    label: "Expert",
    color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700',
    icon: <Star className="size-3.5" />,
  },
}

// ─── Detail row component ────────────────────────────────────────────────────

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function VerifyCertificatePage() {
  const params = useParams()
  const router = useRouter()
  const codeFromUrl = params.code as string

  const decodedUrlCode = codeFromUrl ? decodeURIComponent(codeFromUrl) : ''
  const [inputCode, setInputCode] = useState(decodedUrlCode)
  const [status, setStatus] = useState<VerificationStatus>(decodedUrlCode ? 'loading' : 'idle')
  const [certificat, setCertificat] = useState<CertificatData | null>(null)

  const verifyCode = useCallback(async (code: string) => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return

    setStatus('loading')
    setCertificat(null)

    try {
      const res = await fetch(`/api/certificats/verify/${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        if (res.status === 404) {
          setStatus('not_found')
        } else {
          setStatus('error')
        }
        return
      }

      const data: VerifyResponse = await res.json()

      if (data.valid && data.certificat) {
        setStatus('valid')
        setCertificat(data.certificat)
      } else {
        setStatus('invalid')
      }
    } catch {
      setStatus('error')
    }
  }, [])

  // Auto-verify from URL on mount — fetch is async so setState happens in .then() callbacks
  useEffect(() => {
    if (!decodedUrlCode) return
    const trimmed = decodedUrlCode.trim().toUpperCase()

    fetch(`/api/certificats/verify/${encodeURIComponent(trimmed)}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            setStatus('not_found')
          } else {
            setStatus('error')
          }
          return null
        }
        return res.json() as Promise<VerifyResponse>
      })
      .then((data) => {
        if (!data) return
        if (data.valid && data.certificat) {
          setStatus('valid')
          setCertificat(data.certificat)
        } else {
          setStatus('invalid')
        }
      })
      .catch(() => {
        setStatus('error')
      })
  }, [decodedUrlCode])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputCode.trim()) {
      // Navigate to /verify/[code] for shareable URL
      router.push(`/verify/${encodeURIComponent(inputCode.trim().toUpperCase())}`)
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────

  const renderResult = () => {
    switch (status) {
      case 'loading':
        return (
          <Card className="border-border/50 shadow-md">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="size-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Vérification en cours...</p>
            </CardContent>
          </Card>
        )

      case 'valid':
        if (!certificat) return null
        const typeConf = TYPE_CONFIG[certificat.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.STANDARD

        return (
          <Card className="border-green-300 dark:border-green-800 shadow-lg overflow-hidden">
            {/* Green header band */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-700 dark:to-emerald-800 px-6 py-5 flex items-center gap-3">
              <CheckCircle2 className="size-8 text-white shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-white">Certificat Valide</h2>
                <p className="text-green-100 text-sm">Ce certificat a été vérifié avec succès</p>
              </div>
            </div>

            <CardContent className="pt-6 px-6 pb-6 space-y-1">
              {/* Type badge */}
              <div className="flex items-center gap-2 mb-4">
                <Badge className={`${typeConf.color} border gap-1.5 px-3 py-1 text-sm`}>
                  {typeConf.icon}
                  {typeConf.label}
                </Badge>
              </div>

              {/* Student name */}
              <DetailRow
                icon={<GraduationCap className="size-4" />}
                label="Étudiant(e)"
                value={certificat.etudiantNom || '—'}
              />

              <Separator />

              {/* UE */}
              <DetailRow
                icon={<BookOpen className="size-4" />}
                label="Unité d'enseignement"
                value={
                  <span>
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded mr-2">
                      {certificat.ueCode || '—'}
                    </span>
                    {certificat.ueNom || '—'}
                  </span>
                }
              />

              <Separator />

              {/* Note */}
              <DetailRow
                icon={<Award className="size-4" />}
                label="Note"
                value={
                  <span className="text-base font-bold">
                    {typeof certificat.note === 'number'
                      ? certificat.note.toFixed(2).replace(/[.,]00$/, '')
                      : '—'}
                    <span className="text-muted-foreground font-normal">/20</span>
                  </span>
                }
              />

              <Separator />

              {/* Mention */}
              <DetailRow
                icon={<Star className="size-4" />}
                label="Mention"
                value={
                  certificat.mention
                    ? <Badge variant="secondary" className="text-sm">{certificat.mention}</Badge>
                    : <span className="text-muted-foreground">—</span>
                }
              />

              <Separator />

              {/* Date */}
              <DetailRow
                icon={<Calendar className="size-4" />}
                label="Date d'émission"
                value={
                  certificat.dateEmission
                    ? new Date(certificat.dateEmission).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '—'
                }
              />

              <Separator />

              {/* Establishment */}
              <DetailRow
                icon={<Building2 className="size-4" />}
                label="Établissement"
                value={certificat.etablissementNom || '—'}
              />

              <Separator />

              {/* Verification code */}
              <DetailRow
                icon={<Hash className="size-4" />}
                label="Code de vérification"
                value={
                  certificat.codeVerification ? (
                    <span className="font-mono text-xs bg-muted px-2 py-1 rounded select-all">
                      {certificat.codeVerification}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
            </CardContent>
          </Card>
        )

      case 'invalid':
        return (
          <Card className="border-red-300 dark:border-red-800 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-rose-600 dark:from-red-700 dark:to-rose-800 px-6 py-5 flex items-center gap-3">
              <XCircle className="size-8 text-white shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-white">Certificat Invalide</h2>
                <p className="text-red-100 text-sm">Ce certificat n'est pas valide ou a été révoqué</p>
              </div>
            </div>
            <CardContent className="pt-6 px-6 pb-6">
              <p className="text-sm text-muted-foreground text-center">
                Le code de vérification ne correspond à aucun certificat actif.
                Il est possible que le certificat ait été révoqué ou que le code soit incorrect.
              </p>
            </CardContent>
          </Card>
        )

      case 'not_found':
        return (
          <Card className="border-amber-300 dark:border-amber-800 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-700 dark:to-orange-700 px-6 py-5 flex items-center gap-3">
              <Search className="size-8 text-white shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-white">Certificat Introuvable</h2>
                <p className="text-amber-100 text-sm">Aucun certificat ne correspond à ce code</p>
              </div>
            </div>
            <CardContent className="pt-6 px-6 pb-6">
              <p className="text-sm text-muted-foreground text-center">
                Vérifiez le code de vérification et réessayez.
                Assurez-vous de saisir le code exactement comme indiqué sur le certificat.
              </p>
            </CardContent>
          </Card>
        )

      case 'error':
        return (
          <Card className="border-destructive shadow-lg overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
              <XCircle className="size-10 text-destructive" />
              <p className="text-sm text-destructive font-medium">Erreur de vérification</p>
              <p className="text-xs text-muted-foreground text-center">
                Une erreur est survenue lors de la vérification. Veuillez réessayer.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => verifyCode(inputCode)}
              >
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      {/* Main content */}
      <main className="flex-1 flex items-start justify-center px-4 py-8 sm:py-16">
        <div className="w-full max-w-lg space-y-8">
          {/* Branding */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative size-16 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
              <Image
                src="/logo.png"
                alt="SECT Logo"
                width={48}
                height={48}
                className="object-contain"
                priority
              />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">SECT</h1>
              <p className="text-sm text-muted-foreground">
                Système d&apos;Évaluation Casse-Tête
              </p>
            </div>
          </div>

          {/* Verification form card */}
          <Card className="shadow-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="size-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Vérification de Certificat</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Entrez le code de vérification pour confirmer l&apos;authenticité d&apos;un certificat
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Ex : SECT-A1B2-C3D4"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  className="flex-1 font-mono uppercase"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" disabled={!inputCode.trim() || status === 'loading'}>
                  {status === 'loading' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  <span className="sr-only sm:not-sr-only sm:ml-1.5">Vérifier</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Result */}
          {renderResult()}

          {/* Footer info */}
          <p className="text-center text-xs text-muted-foreground">
            Chaque certificat émis par SECT porte un code de vérification unique.
            <br />
            Vous pouvez partager le lien directement pour permettre la vérification.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground border-t bg-background/50">
        <p>&copy; {new Date().getFullYear()} SECT — Système d&apos;Évaluation Casse-Tête</p>
      </footer>
    </div>
  )
}
