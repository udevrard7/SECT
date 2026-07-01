// ─────────────────────────────────────────────────────────────
// StudentDetailDialog — Fiche détaillée d'un étudiant en difficulté.
// Refonte Savane EdTech — n'utilise QUE les données réelles de StudentAtRisk
// (moyenne, derniereNote, nbExamens). Pas de données simulées.
// Recommandations contextuelles selon la moyenne.
// ─────────────────────────────────────────────────────────────

'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ds'
import { Badge } from '@/components/ds/badge'
import {
  Award,
  TrendingDown,
  Target,
  Mail,
  AlertTriangle,
  GraduationCap,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StudentAtRisk } from '@/types/resultats'

interface StudentDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: StudentAtRisk | null
}

/**
 * StudentDetailDialog — Affiche une fiche détaillée pour un étudiant en difficulté.
 *
 * N'utilise que les champs réels du type `StudentAtRisk` (renvoyés par
 * `/api/resultats/overview` → `studentsAtRisk[]`). Aucune donnée simulée.
 *
 * @param open — État d'ouverture du dialogue.
 * @param onOpenChange — Callback pour fermer le dialogue.
 * @param student — Données de l'étudiant (depuis studentsAtRisk).
 */
export function StudentDetailDialog({
  open,
  onOpenChange,
  student,
}: StudentDetailDialogProps) {
  if (!student) return null

  const moyenne = student.moyenne ?? 0
  const derniereNote = student.derniereNote ?? 0
  const nbExamens = student.nbExamens ?? 0

  // Recommandation contextuelle selon la moyenne (seul signal réel disponible)
  const reco =
    moyenne < 6
      ? {
          borderClass: 'border-l-destructive',
          iconClass: 'text-destructive',
          icon: AlertTriangle,
          title: 'Suivi renforcé urgent',
          text: `La moyenne de ${student.etudiantName} est très en dessous du seuil (8/20). Un accompagnement personnalisé et un plan de soutien sont fortement recommandés.`,
        }
      : moyenne < 8
        ? {
            borderClass: 'border-l-warning',
            iconClass: 'text-warning',
            icon: AlertTriangle,
            title: 'Suivi renforcé nécessaire',
            text: `La moyenne de ${student.etudiantName} est en dessous de 8/20. Proposez un accompagnement personnalisé et des séances de rattrapage.`,
          }
        : {
            borderClass: 'border-l-info',
            iconClass: 'text-info',
            icon: Target,
            title: 'Encouragements ciblés',
            text: `${student.etudiantName} progresse. Mettez en avant ses points forts et fixez des objectifs de progression.`,
          }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-warning to-secondary shadow-sm">
              <GraduationCap className="h-5 w-5 text-white" />
            </span>
            Fiche étudiant
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{student.etudiantName}</span>
            <Badge variant={moyenne < 8 ? 'danger' : 'warning'} size="sm">
              En difficulté
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          {/* Coordonnées */}
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm text-muted-foreground">{student.etudiantEmail}</span>
          </div>

          {/* KPIs réels (3) */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={TrendingDown}
              label="Moyenne globale"
              value={moyenne.toFixed(1)}
              suffix="/20"
              accent="danger"
              scoreOn20={moyenne}
              index={0}
            />
            <StatCard
              icon={Clock}
              label="Dernière note"
              value={derniereNote.toFixed(1)}
              suffix="/20"
              accent={derniereNote >= 10 ? 'success' : 'warning'}
              scoreOn20={derniereNote}
              index={1}
            />
            <StatCard
              icon={Award}
              label="Épreuves passées"
              value={nbExamens}
              accent="info"
              index={2}
            />
          </div>

          {/* Écart moyenne / dernière note (signal de progression) */}
          {nbExamens > 1 && (
            <Card className="ds-kente-top">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Tendance récente</p>
                  <p className="mt-0.5 text-sm">
                    Dernière note vs moyenne :{' '}
                    <span
                      className={
                        derniereNote >= moyenne
                          ? 'font-semibold text-success-text'
                          : 'font-semibold text-destructive'
                      }
                    >
                      {derniereNote >= moyenne ? '+' : ''}
                      {(derniereNote - moyenne).toFixed(1)}
                    </span>
                  </p>
                </div>
                <Badge
                  variant={derniereNote >= moyenne ? 'success' : 'danger'}
                  size="md"
                >
                  {derniereNote >= moyenne ? 'En progression' : 'À la baisse'}
                </Badge>
              </CardContent>
            </Card>
          )}

          {/* Recommandation contextuelle */}
          <Card className={`ds-kente-top border-l-4 ${reco.borderClass}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-display tracking-tight">
                <reco.icon className={`h-4 w-4 ${reco.iconClass}`} />
                {reco.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm leading-relaxed text-muted-foreground">{reco.text}</p>
            </CardContent>
          </Card>

          {/* Note d'accès aux détails complets */}
          <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              L&apos;historique détaillé par épreuve (évolution, performance par type de question)
              est disponible dans la vue <span className="font-medium text-foreground">« Par épreuve »</span>{' '}
              en sélectionnant une épreuve, ou via le relevé de notes de l&apos;étudiant.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
