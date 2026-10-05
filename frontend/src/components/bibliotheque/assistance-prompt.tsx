// ─────────────────────────────────────────────────────────────────────
// AssistancePrompt — SECT-RBAC-AUDITS (ADR-0009) : carte d'orientation
// pour l'ADMIN GLOBAL (sans établissement) qui ouvre un outil de pilotage
// pédagogique par établissement (activité de lecture, conformité aux
// référentiels). Ces audits sont les outils du RESPONSABLE ; la voie de
// l'ADMIN est le mode assistance — accès demandé AVEC motif, APPROUVÉ par
// le responsable de l'établissement (B-2 : pas d'auto-approbation),
// valable 24 h max, auto-révoqué, tracé dans le journal d'audit.
// ═════════════════════════════════════════════════════════════════════

'use client'

import { useRouter } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PAGE_ROUTES } from '@/lib/routes'

interface AssistancePromptProps {
  /** Nom de l'outil concerné, affiché dans le texte (ex. « L'audit de conformité »). */
  outil: string
}

export function AssistancePrompt({ outil }: AssistancePromptProps) {
  const router = useRouter()

  return (
    <Card>
      <CardContent className="py-10 text-center space-y-3">
        <LifeBuoy className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm font-medium">
          {outil} est un outil de pilotage propre à chaque établissement
        </p>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          En tant qu&apos;administrateur de la plateforme, vous y accédez via le{' '}
          <strong>mode assistance</strong>&nbsp;: une demande d&apos;accès avec
          motif, approuvée par le responsable de l&apos;établissement, valable
          24&nbsp;h maximum et tracée dans le journal d&apos;audit.
        </p>
        <Button
          className="mt-2"
          onClick={() => router.push(PAGE_ROUTES['acces-etablissements'])}
        >
          Gérer vos accès aux établissements
        </Button>
      </CardContent>
    </Card>
  )
}
