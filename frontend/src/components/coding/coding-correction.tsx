'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  CheckCircle2,
  XCircle,
  Code2,
  Play,
  Loader2,
  MessageSquare,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react'
import { CodeEditor, TestResultsDisplay } from './code-editor'
import {
  type CodingLanguage,
  type TestCase,
  type TestResult,
  type CodingAnswer,
  type GradedCodingAnswer,
  getCodingLanguageConfig,
  convertSignatureToLanguage,
  parseFunctionSignature,
  parseCodingAnswer,
  EXECUTION_CONFIG,
} from '@/lib/coding-types'
import { toast } from 'sonner'

interface CodingCorrectionProps {
  questionId: string
  enonce: string
  langage: CodingLanguage
  fonctionSignature: string
  testsPublics: TestCase[]
  testsPrives: TestCase[]
  bareme: number
  reponseCorrecte: string
  studentAnswer: CodingAnswer | null
  scoreAuto?: number
  noteIA?: number
  justificationIA?: string
  scoreFinal?: number
  commentaireEnseignant?: string
  onSaveScore: (questionId: string, score: number, comment?: string) => Promise<void>
  onRegenerateTests?: () => Promise<void>
}

export function CodingCorrection({
  questionId,
  enonce,
  langage,
  fonctionSignature,
  testsPublics,
  testsPrives,
  bareme,
  reponseCorrecte,
  studentAnswer,
  scoreAuto,
  noteIA,
  justificationIA,
  scoreFinal,
  commentaireEnseignant,
  onSaveScore,
  onRegenerateTests,
}: CodingCorrectionProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [allTestResults, setAllTestResults] = useState<TestResult[]>([])
  const [manualScore, setManualScore] = useState<string>(String(scoreFinal ?? scoreAuto ?? 0))
  const [comment, setComment] = useState(commentaireEnseignant || '')
  const [isSaving, setIsSaving] = useState(false)
  const [showModelSolution, setShowModelSolution] = useState(false)
  const [showPrivateTests, setShowPrivateTests] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Use the student's chosen language from their answer, falling back to the question's language
  const studentLang = studentAnswer?.language || langage
  const langConfig = getCodingLanguageConfig(studentLang)

  // Run all tests (public + private) against student code
  const handleRunAllTests = useCallback(async () => {
    if (!studentAnswer?.code) return
    setIsRunning(true)

    try {
      const allTests = [...testsPublics, ...testsPrives]
      const response = await fetch('/api/coding/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: studentAnswer.code,
          language: studentLang,
          testCases: allTests,
          functionSignature: fonctionSignature,
        }),
      })
      const result = await response.json()
      setAllTestResults(result.testResults || [])
      setShowPrivateTests(true)
    } catch (error) {
      toast.error('Erreur lors de l\'exécution des tests')
    } finally {
      setIsRunning(false)
    }
  }, [studentAnswer, testsPublics, testsPrives, studentLang, fonctionSignature])

  // Save manual score override
  const handleSaveScore = useCallback(async () => {
    setIsSaving(true)
    try {
      const score = Math.min(bareme, Math.max(0, parseFloat(manualScore) || 0))
      await onSaveScore(questionId, score, comment)
      toast.success('Note sauvegardée')
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setIsSaving(false)
    }
  }, [manualScore, bareme, questionId, comment, onSaveScore])

  // Regenerate tests
  const handleRegenerateTests = useCallback(async () => {
    if (!onRegenerateTests) return
    setIsRegenerating(true)
    try {
      await onRegenerateTests()
      toast.success('Tests régénérés')
    } catch (error) {
      toast.error('Erreur lors de la régénération')
    } finally {
      setIsRegenerating(false)
    }
  }, [onRegenerateTests])

  // Calculate auto score from test results
  const calculatedAutoScore = allTestResults.length > 0
    ? Math.round((allTestResults.filter(r => r.passed).length / allTestResults.length) * bareme * 100) / 100
    : scoreAuto

  return (
    <div className="space-y-4">
      {/* Question header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-violet-600" />
          <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600">
            CODE — {langConfig.icon} {langConfig.label}
          </Badge>
          {studentAnswer?.language && studentAnswer.language !== langage && (
            <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Langue étudiant: {getCodingLanguageConfig(studentAnswer.language).icon} {getCodingLanguageConfig(studentAnswer.language).label}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {bareme} pts
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowModelSolution(!showModelSolution)}
          className="text-xs"
        >
          {showModelSolution ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
          {showModelSolution ? 'Masquer' : 'Voir'} la solution
        </Button>
      </div>

      {/* Problem statement */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="pt-4">
          <p className="text-sm whitespace-pre-wrap">{enonce}</p>
          <div className="mt-2 rounded-md bg-slate-100 dark:bg-slate-900 p-2 font-mono text-xs">
            <span className="text-muted-foreground text-[10px]">Signature :</span>
            <pre className="text-violet-700 dark:text-violet-300">{
              fonctionSignature
                ? convertSignatureToLanguage(fonctionSignature, studentLang)
                : ''
            }</pre>
          </div>
        </CardContent>
      </Card>

      {/* Student code */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium">Code soumis par l'étudiant</span>
          {studentAnswer?.lastSaved && (
            <span className="text-[10px] text-muted-foreground">
              Dernière sauvegarde : {new Date(studentAnswer.lastSaved).toLocaleString('fr-FR')}
            </span>
          )}
        </div>
        <CodeEditor
          language={studentLang}
          initialCode={studentAnswer?.code || '// Aucun code soumis'}
          onChange={() => {}}
          readOnly={true}
          height="300px"
        />
      </div>

      {/* Model solution (collapsible) */}
      {showModelSolution && (
        <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <Shield className="h-3.5 w-3.5" />
              Solution de référence (confidentiel)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CodeEditor
              language={langage}
              initialCode={reponseCorrecte}
              onChange={() => {}}
              readOnly={true}
              height="250px"
            />
          </CardContent>
        </Card>
      )}

      {/* Run all tests button */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={handleRunAllTests}
          disabled={isRunning || !studentAnswer?.code}
          className="gap-2"
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Exécuter tous les tests
        </Button>
        {onRegenerateTests && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerateTests}
            disabled={isRegenerating}
            className="text-xs"
          >
            {isRegenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Régénérer les tests
          </Button>
        )}
      </div>

      {/* Public test results */}
      {studentAnswer?.testResultsPublics && studentAnswer.testResultsPublics.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Eye className="h-3.5 w-3.5" />
              Tests publics (vus par l'étudiant)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TestResultsDisplay testResults={studentAnswer.testResultsPublics} isPublic={true} />
          </CardContent>
        </Card>
      )}

      {/* All test results (after running) */}
      {allTestResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-amber-600" />
                Tous les tests (publics + privés)
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPrivateTests(!showPrivateTests)}
                className="text-[10px]"
              >
                {showPrivateTests ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                {showPrivateTests ? 'Masquer privés' : 'Voir privés'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <TestResultsDisplay
              testResults={showPrivateTests ? allTestResults : allTestResults.slice(0, testsPublics.length)}
              isPublic={false}
            />
          </CardContent>
        </Card>
      )}

      {/* Auto-calculated score */}
      {calculatedAutoScore != null && (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Note auto-calculée</span>
              <Badge variant="outline" className="font-mono text-sm border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400">
                {calculatedAutoScore} / {bareme}
              </Badge>
            </div>
            <div className="mt-1 text-[10px] text-blue-600 dark:text-blue-400">
              {allTestResults.length > 0
                ? `${allTestResults.filter(r => r.passed).length} tests réussis sur ${allTestResults.length}`
                : 'Exécutez les tests pour calculer la note'}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI suggestion */}
      {noteIA != null && (
        <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Suggestion IA
              </span>
              <Badge variant="outline" className="font-mono border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-400">
                {noteIA} / {bareme}
              </Badge>
            </div>
            {justificationIA && (
              <p className="text-xs text-purple-600 dark:text-purple-400 whitespace-pre-wrap">{justificationIA}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual score override */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            Correction manuelle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium whitespace-nowrap">Note :</label>
            <Input
              type="number"
              min={0}
              max={bareme}
              step={0.5}
              value={manualScore}
              onChange={(e) => setManualScore(e.target.value)}
              className="w-24 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground">/ {bareme}</span>
            {scoreAuto != null && parseFloat(manualScore) !== scoreAuto && (
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">
                Override (auto : {scoreAuto})
              </Badge>
            )}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Commentaire pour l'étudiant (optionnel)..."
            className="min-h-[80px] text-sm"
          />
          <Button
            onClick={handleSaveScore}
            disabled={isSaving}
            className="gap-2"
            size="sm"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Sauvegarder la note
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
