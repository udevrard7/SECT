// [35m══════════════════════════════════════════════════════════════════════════════
// StudentDetailDialog  Fiche détaillée d'un étudiant avec identité Savane EdTech
// Affiche : KPIs, évolution, performances par type, historique des épreuves
// [35m══════════════════════════════════════════════════════════════════════════════

'use client'

import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ds'
import { Badge } from '@/components/ds/badge'
import {
  Award,
  TrendingUp,
  BookOpen,
  Clock,
  Target,
  GraduationCap,
  X,
} from 'lucide-react'
import { EvolutionChart } from './resultats-charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { StudentAtRisk } from '@/types/resultats'

interface StudentDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: StudentAtRisk | null
}

/**
 * StudentDetailDialog  Affiche une fiche détaillée pour un étudiant en difficulté.
 *
 * @param open  État d'ouverture du dialogue.
 * @param onOpenChange  Callback pour fermer le dialogue.
 * @param student  Données de l'étudiant (depuis studentsAtRisk).
 *
 * @example
 * ```tsx
 * const [selectedStudent, setSelectedStudent] = useState<StudentAtRisk | null>(null)
 * <StudentDetailDialog
 *   open={!!selectedStudent}
 *   onOpenChange={() => setSelectedStudent(null)}
 *   student={selectedStudent}
 * />
 * ```
 */
export function StudentDetailDialog({
  open,
  onOpenChange,
  student,
}: StudentDetailDialogProps) {
  // Données simulées pour l'évolution (à remplacer par des données réelles de l'API)
  const evolutionData = useMemo(
    () => [
      { mois: 'Janv.', moyenne: student?.moyenne ? student.moyenne - 2 : 6, count: 3 },
      { mois: 'Févr.', moyenne: student?.moyenne ? student.moyenne - 1 : 7, count: 4 },
      { mois: 'Mars', moyenne: student?.moyenne ? student.moyenne : 8, count: 5 },
      { mois: 'Avril', moyenne: student?.moyenne ? student.moyenne + 1 : 9, count: 4 },
      { mois: 'Mai', moyenne: student?.moyenne ? student.moyenne + 0.5 : 8.5, count: 3 },
      { mois: 'Juin', moyenne: student?.moyenne ? student.moyenne + 1.5 : 9.5, count: 2 },
    ],
    [student?.moyenne]
  )

  // Données simulées pour les performances par type (à remplacer par des données réelles)
  const performanceByType = useMemo(
    () => [
      { type: 'QCM', moyenne: student?.moyenne ? student.moyenne + 2 : 10, count: 5 },
      { type: 'Ouvert', moyenne: student?.moyenne ? student.moyenne - 1 : 7, count: 3 },
      { type: 'Vrai/Faux', moyenne: student?.moyenne ? student.moyenne + 3 : 11, count: 2 },
    ],
    [student?.moyenne]
  )

  // Données simulées pour l'historique des épreuves (à remplacer par des données réelles)
  const recentResults = useMemo(
    () => [
      {
        id: '1',
        epreuveId: 'epreuve-1',
        titre: 'Mathématiques  Algèbre',
        enseignant: 'M. Dupont',
        statut: 'CORRIGEE',
        score: student?.moyenne ? student.moyenne - 1 : 7,
        noteTotal: 20,
        scoreOn20: student?.moyenne ? student.moyenne - 1 : 7,
        percentage: student?.moyenne ? (student.moyenne - 1) * 5 : 35,
        dateFin: '2025-06-15',
        dateDebut: '2025-06-15',
        isCorrected: true,
        isReturned: true,
      },
      {
        id: '2',
        epreuveId: 'epreuve-2',
        titre: 'Physique  Mécanique',
        enseignant: 'Mme Martin',
        statut: 'CORRIGEE',
        score: student?.moyenne ? student.moyenne : 8,
        noteTotal: 20,
        scoreOn20: student?.moyenne ? student.moyenne : 8,
        percentage: student?.moyenne ? student.moyenne * 5 : 40,
        dateFin: '2025-06-10',
        dateDebut: '2025-06-10',
        isCorrected: true,
        isReturned: true,
      },
      {
        id: '3',
        epreuveId: 'epreuve-3',
        titre: 'Chimie  Réactions',
        enseignant: 'M. Bernard',
        statut: 'CORRIGEE',
        score: student?.moyenne ? student.moyenne + 1 : 9,
        noteTotal: 20,
        scoreOn20: student?.moyenne ? student.moyenne + 1 : 9,
        percentage: student?.moyenne ? (student.moyenne + 1) * 5 : 45,
        dateFin: '2025-06-05',
        dateDebut: '2025-06-05',
        isCorrected: true,
        isReturned: true,
      },
    ],
    [student?.moyenne]
  )

  // Calculer la tendance (progression ou régression)
  const tendance = useMemo(() => {
    if (evolutionData.length < 2) return 0
    const last = evolutionData[evolutionData.length - 1].moyenne
    const first = evolutionData[0].moyenne
    return last - first
  }, [evolutionData])

  if (!student) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl ds-kente-top sm:max-w-5xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-3 font-display text-2xl tracking-tight">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-gold shadow-lg">
              <Award className="h-6 w-6 text-white" />
            </div>
            Fiche détaillée de {student.etudiantName}
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 rounded-full hover:bg-muted/50"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-6">
          {/* [36mKPIs de l'étudiant[0m */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Award}
              label="Moyenne générale"
              value={(student.moyenne ?? 0).toFixed(1)}
              suffix="/20"
              accent={student.moyenne >= 12 ? 'success' : student.moyenne >= 8 ? 'warning' : 'danger'}
              scoreOn20={student.moyenne}
              index={0}
            />
            <StatCard
              icon={TrendingUp}
              label="Dernière note"
              value={(student.derniereNote ?? 0).toFixed(1)}
              suffix="/20"
              accent={student.derniereNote >= 12 ? 'success' : student.derniereNote >= 8 ? 'warning' : 'danger'}
              scoreOn20={student.derniereNote}
              trend={{
                direction: tendance > 0 ? 'up' : tendance < 0 ? 'down' : 'neutral',
                value: `${tendance > 0 ? '+' : ''}${tendance.toFixed(1)}`,
                label: 'vs premier examen',
              }}
              index={1}
            />
            <StatCard
              icon={BookOpen}
              label="Épreuves passées"
              value={student.nbExamens}
              accent="info"
              index={2}
            />
            <StatCard
              icon={Clock}
              label="Temps moyen"
              value="--"
              hint="À implémenter"
              accent="secondary"
              index={3}
            />
          </div>

          {/* [36mÉvolution des notes[0m */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="ds-kente-top">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary-text" />
                  Évolution des notes
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-64">
                  <EvolutionChart data={evolutionData} height={256} />
                </div>
              </CardContent>
            </Card>

            {/* [36mPerformances par type de question[0m */}
            <Card className="ds-kente-top">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-secondary" />
                  Performances par type
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {performanceByType.map((p, index) => (
                    <div key={p.type} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={p.moyenne >= 12 ? 'success' : p.moyenne >= 8 ? 'warning' : 'danger'}
                            size="sm"
                          >
                            {p.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {p.count} épreuve(s)
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(p.moyenne / 20) * 100}%`,
                            backgroundColor: p.moyenne >= 12
                              ? 'hsl(var(--chart-1))'
                              : p.moyenne >= 8
                                ? 'hsl(var(--chart-2))'
                                : 'hsl(var(--chart-5))',
                          }}
                        />
                      </div>
                      <span className="w-16 text-right text-sm font-mono tabular-nums">
                        {p.moyenne.toFixed(1)}/20
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* [36mHistorique des épreuves[0m */}
          <Card className="ds-kente-top">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-4 w-4 text-info" />
                Historique des épreuves
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="max-h-[400px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Épreuve</th>
                      <th className="pb-2 pr-4 font-medium">Enseignant</th>
                      <th className="pb-2 pr-4 text-right font-medium">Note</th>
                      <th className="pb-2 pr-4 text-center font-medium">Statut</th>
                      <th className="pb-2 text-right font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentResults.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 pr-4">
                          <p className="font-medium">{r.titre}</p>
                          <p className="text-xs text-muted-foreground">{r.epreuveId}</p>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{r.enseignant}</td>
                        <td className="py-3 pr-4 text-right font-mono tabular-nums">
                          <span
                            className={r.scoreOn20 >= 12
                              ? 'text-success-text'
                              : r.scoreOn20 >= 8
                                ? 'text-warning'
                                : 'text-destructive'}
                          >
                            {r.scoreOn20.toFixed(1)}/20
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <Badge
                            variant={r.isCorrected ? 'success' : 'warning'}
                            size="sm"
                          >
                            {r.isCorrected ? 'Corrigé' : 'En attente'}
                          </Badge>
                        </td>
                        <td className="py-3 text-right text-muted-foreground">
                          {new Date(r.dateFin).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* [36mRecommandations[0m */}
          <Card className="ds-kente-top border-l-4 border-l-gold bg-gold/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="h-4 w-4 text-gold" />
                Recommandations
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {student.moyenne < 8 && (
                  <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-medium">Suivi renforcé nécessaire</p>
                      <p className="text-sm text-muted-foreground">
                        La moyenne de {student.etudiantName} est en dessous de 8/20. Proposez un accompagnement personnalisé.
                      </p>
                    </div>
                  </div>
                )}
                {student.moyenne >= 8 && student.moyenne < 12 && (
                  <div className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-800 dark:bg-teal-950/20">
                    <Target className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    <div>
                      <p className="font-medium">Encouragements ciblés</p>
                      <p className="text-sm text-muted-foreground">
                        {student.etudiantName} a une moyenne correcte mais peut progresser. Mettez en avant ses points forts (ex: QCM).
                      </p>
                    </div>
                  </div>
                )}
                {student.moyenne >= 12 && (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                    <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="font-medium">Excellence à récompenser</p>
                      <p className="text-sm text-muted-foreground">
                        {student.etudiantName} fait partie des meilleurs. Proposez-lui des défis supplémentaires ou un rôle de tuteur.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
