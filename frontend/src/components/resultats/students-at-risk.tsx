// [35m══════════════════════════════════════════════════════════════════════════════
// StudentsAtRiskList  Liste des étudiants en difficulté avec identité Savane EdTech
// Affiche les étudiants avec une moyenne < 8/20 sur les examens
// [35m══════════════════════════════════════════════════════════════════════════════

'use client'

import { useState } from 'react'
import { AlertTriangle, TrendingDown, Mail, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ds/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { StudentDetailDialog } from './student-detail-dialog'
import type { StudentAtRisk } from '@/types/resultats'

interface StudentsAtRiskListProps {
  students: StudentAtRisk[]
}

/**
 * StudentsAtRiskList  Affiche la liste des étudiants en difficulté avec option pour voir les détails.
 *
 * @param students  Liste des étudiants à risque (moyenne < 8/20).
 *
 * @example
 * ```tsx
 * <StudentsAtRiskList students={overview.studentsAtRisk} />
 * ```
 */
export function StudentsAtRiskList({ students }: StudentsAtRiskListProps) {
  const [selectedStudent, setSelectedStudent] = useState<StudentAtRisk | null>(null)

  if (students.length === 0) {
    return (
      <Card className="ds-kente-top border-l-4 border-l-emerald-500">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Étudiants en difficulté
          </CardTitle>
          <CardDescription>Aucun étudiant en difficulté détecté</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
              <TrendingDown className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-3 text-sm font-medium">Tous vos étudiants s&apos;en sortent bien</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Aucun étudiant n&apos;a une moyenne inférieure à 8/20 sur l&apos;ensemble de vos épreuves.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="ds-kente-top border-l-4 border-l-amber-500">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Étudiants en difficulté
              </CardTitle>
              <CardDescription>
                {students.length} étudiant{students.length > 1 ? 's' : ''} avec une moyenne &lt; 8/20
              </CardDescription>
            </div>
            <Badge variant="warning" size="sm">
              Attention requise
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 pr-2">
              {students.map((s, idx) => (
                <div
                  key={s.etudiantId}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.etudiantName}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {s.etudiantEmail}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="danger" size="sm">
                      {(s.moyenne ?? 0).toFixed(1)}/20
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {s.nbExamens} épreuve{s.nbExamens > 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* Bouton "Voir détails" */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedStudent(s)}
                    className="h-7 w-7 shrink-0 p-0 hover:bg-primary/5"
                    aria-label={`Voir les détails de ${s.etudiantName}`}
                  >
                    <Eye className="h-4 w-4 text-primary-text" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Dialogue de détails */}
      <StudentDetailDialog
        open={!!selectedStudent}
        onOpenChange={() => setSelectedStudent(null)}
        student={selectedStudent}
      />
    </>
  )
}
