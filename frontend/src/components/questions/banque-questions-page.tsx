'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
 Search,
 Plus,
 Filter,
 Library,
 Eye,
 Pencil,
 Trash2,
 CheckCircle2,
 Clock,
 ChevronLeft,
 ChevronRight,
 Loader2,
 Sparkles,
 BookOpen,
 Hash,
 FileText,
 Star,
 AlertTriangle,
 X,
 PlusCircle,
 MinusCircle,
 Lightbulb,
 CheckSquare,
 Square,
} from'lucide-react'
import { useAuthStore } from'@/stores/auth-store'
import { useRouter } from'next/navigation'
import { PAGE_ROUTES } from'@/lib/routes'
import {
 Card,
 CardContent,
} from'@/components/ui/card'
import { Button } from'@/components/ui/button'
import { Badge } from'@/components/ui/badge'
import { Input } from'@/components/ui/input'
import { Label } from'@/components/ui/label'
import { Textarea } from'@/components/ui/textarea'
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from'@/components/ui/select'
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from'@/components/ui/dialog'
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from'@/components/ui/alert-dialog'
import { Separator } from'@/components/ui/separator'
import { ScrollArea } from'@/components/ui/scroll-area'
import { EntityCard } from '@/components/ds'
import { Checkbox } from'@/components/ui/checkbox'
import { toast } from'sonner'
import { CODING_LANGUAGES, getDefaultStarterCode, type CodingLanguage } from'@/lib/coding-types'

// ─── Types ───

interface Question {
 id: string
 documentId: string | null
 type:'QCU' |'QCM' |'QRC' |'TRS' |'CODE'
 enonce: string
 propositions: string[] | null
 reponseCorrecte: string | string[] | null
 explication: string | null
 difficulte:'FACILE' |'MOYEN' |'DIFFICILE' |'EXPERT'
 themes: string[] | null
 tags: string[] | null
 scoreQualite: number | null
 validee: boolean
 langue: string
 createdAt: string
 document?: { id: string; nomFichier: string } | null
 // CODE-specific fields (parsed from reponseCorrecte JSON when type=CODE)
 langage?: string
 codeInitial?: string
 fonctionSignature?: string
}

interface QuestionsResponse {
 questions: Question[]
 total: number
 page: number
 limit: number
 totalPages: number
}

interface DocumentOption {
 id: string
 nomFichier: string
}

// ─── Utility functions ───

function getTypeBadgeConfig(type: Question['type']) {
 switch (type) {
 case'QCU':
 return { label:'QCU', className:'bg-info/15 text-info border-info/30' }
 case'QCM':
 return { label:'QCM', className:'bg-warning/15 text-warning border-warning/30' }
 case'QRC':
 return { label:'QRC', className:'bg-success/15 text-success-text border-success/30' }
 case'TRS':
 return { label:'TRS', className:'bg-destructive/15 text-destructive border-destructive/30' }
 case'CODE':
 return { label:'CODE', className:'bg-secondary/15 text-secondary border-secondary/30' }
 }
}

function getDifficulteBadgeConfig(difficulte: Question['difficulte']) {
 switch (difficulte) {
 case'FACILE':
 return { label:'Facile', className:'bg-success/15 text-success-text border-success/30' }
 case'MOYEN':
 return { label:'Moyen', className:'bg-warning/15 text-warning border-warning/30' }
 case'DIFFICILE':
 return { label:'Difficile', className:'bg-warning/15 text-warning border-warning/30' }
 case'EXPERT':
 return { label:'Expert', className:'bg-destructive/15 text-destructive border-destructive/30' }
 }
}

function getScoreColor(score: number | null): string {
 if (score === null) return'text-muted-foreground'
 if (score >= 80) return'text-success-text'
 if (score >= 60) return'text-warning'
 return'text-destructive'
}

function formatDate(date: string | Date): string {
 const d = typeof date ==='string' ? new Date(date) : date
 const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre',
 ]
 return`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Component ───

export function BanqueQuestionsPage() {
 const user = useAuthStore((s) => s.user)
 const router = useRouter()
 const queryClient = useQueryClient()

 // ─── Filter state ───
 const [search, setSearch] = useState('')
 const [debouncedSearch, setDebouncedSearch] = useState('')
 const [typeFilter, setTypeFilter] = useState('TOUS')
 const [difficulteFilter, setDifficulteFilter] = useState('TOUS')
 const [valideeFilter, setValideeFilter] = useState('TOUS')
 const [documentFilter, setDocumentFilter] = useState('TOUS')
 const [page, setPage] = useState(1)
 const limit = 20

 // ─── Dialog state ───
 const [detailQuestion, setDetailQuestion] = useState<Question | null>(null)
 const [detailDialogOpen, setDetailDialogOpen] = useState(false)
 const [createDialogOpen, setCreateDialogOpen] = useState(false)
 const [editDialogOpen, setEditDialogOpen] = useState(false)
 const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
 const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
 const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null)

 // ─── Form state for creation ───
 const [formType, setFormType] = useState<'QCU' |'QCM' |'QRC' |'TRS' |'CODE'>('QCU')
 const [formEnonce, setFormEnonce] = useState('')
 const [formPropositions, setFormPropositions] = useState<string[]>(['','',''])
 const [formReponseCorrecte, setFormReponseCorrecte] = useState<string[]>([])
 const [formReponseQRC, setFormReponseQRC] = useState('')
 const [formConsigneTRS, setFormConsigneTRS] = useState('')
 const [formGrilleTRS, setFormGrilleTRS] = useState('')
 const [formDifficulte, setFormDifficulte] = useState<'FACILE' |'MOYEN' |'DIFFICILE' |'EXPERT'>('MOYEN')
 const [formThemes, setFormThemes] = useState('')
 const [isSubmitting, setIsSubmitting] = useState(false)
 // CODE-specific form fields
 const [formLangage, setFormLangage] = useState<CodingLanguage>('python')
 const [formFonctionSignature, setFormFonctionSignature] = useState('')
 const [formCodeInitial, setFormCodeInitial] = useState('')
 const [formSolutionCode, setFormSolutionCode] = useState('')

 // ─── Multi-select state ───
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
 const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false)
 const [isBatchDeleting, setIsBatchDeleting] = useState(false)

 const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

 // ─── Debounced search ───
 useEffect(() => {
 if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
 debounceTimerRef.current = setTimeout(() => {
 setDebouncedSearch(search)
 setPage(1)
 }, 300)
 return () => {
 if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
 }
 }, [search])

 // ─── Fetch questions (TanStack Query) ───
 // Migration useEffect+fetch → useQuery. Le cache survit au démontage :
 // 0 refetch au retour navigation, 0 skeleton. staleTime 60s.
 const questionsQuery = useQuery<QuestionsResponse>({
 queryKey: ['banque-questions', user?.id, page, debouncedSearch, typeFilter, difficulteFilter, valideeFilter, documentFilter],
 queryFn: async () => {
 const params = new URLSearchParams({
 userId: user!.id,
 page: String(page),
 limit: String(limit),
 })
 if (debouncedSearch) params.set('search', debouncedSearch)
 if (typeFilter !=='TOUS') params.set('type', typeFilter)
 if (difficulteFilter !=='TOUS') params.set('difficulte', difficulteFilter)
 if (valideeFilter !=='TOUS') params.set('validee', valideeFilter ==='VALIDEES' ?'true' :'false')
 if (documentFilter !=='TOUS') params.set('documentId', documentFilter)

 const res = await fetch(`/api/questions?${params.toString()}`)
 if (!res.ok) throw new Error('Failed to fetch questions')
 return res.json()
 },
 enabled: !!user?.id,
 staleTime: 60 * 1000,
 refetchOnWindowFocus: false,
 })

 const questions = questionsQuery.data?.questions ?? []
 const totalQuestions = questionsQuery.data?.total ?? 0
 const totalPages = questionsQuery.data?.totalPages ?? 1
 const isLoading = questionsQuery.isLoading

 // Toast d'erreur (préserve le comportement original : toast sur erreur fetch)
 useEffect(() => {
 if (questionsQuery.error) {
 toast.error('Erreur', { description:'Impossible de charger les questions.' })
 }
 }, [questionsQuery.error])

 // ─── Fetch documents for filter (TanStack Query) ───
 const documentsQuery = useQuery<{ documents: { id: string; nomFichier: string }[] }>({
 queryKey: ['banque-questions-documents', user?.id],
 queryFn: async () => {
 const res = await fetch(`/api/documents?userId=${user!.id}`)
 if (!res.ok) throw new Error('Failed to fetch documents')
 return res.json()
 },
 enabled: !!user?.id,
 staleTime: 60 * 1000,
 refetchOnWindowFocus: false,
 })

 const documents: DocumentOption[] = (documentsQuery.data?.documents ?? []).map((d) => ({
 id: d.id,
 nomFichier: d.nomFichier,
 }))

 // Helper pour invalider le cache après mutation (create/update/delete/batch)
 const refreshQuestions = () => queryClient.invalidateQueries({ queryKey: ['banque-questions', user?.id] })

 // ─── Reset page and selection on filter change ───
 useEffect(() => {
 setPage(1)
 setSelectedIds(new Set())
 }, [typeFilter, difficulteFilter, valideeFilter, documentFilter, debouncedSearch])

 // ─── Open detail dialog ───
 const handleViewDetail = (q: Question) => {
 setDetailQuestion(q)
 setDetailDialogOpen(true)
 }

 // ─── Open edit dialog ───
 const handleEdit = (q: Question) => {
 setEditingQuestion(q)
 setFormType(q.type)
 setFormEnonce(q.enonce)
 setFormDifficulte(q.difficulte)
 setFormThemes(q.themes?.join(',') ??'')

 if (q.type ==='QCU' || q.type ==='QCM') {
 const props = q.propositions ?? ['','','']
 setFormPropositions(props.length >= 3 ? props : [...props, ...Array(Math.max(0, 3 - props.length)).fill('')])
 const rep = q.reponseCorrecte
 if (Array.isArray(rep)) {
 setFormReponseCorrecte(rep)
 } else if (typeof rep ==='string') {
 setFormReponseCorrecte([rep])
 } else {
 setFormReponseCorrecte([])
 }
 setFormReponseQRC('')
 setFormConsigneTRS('')
 setFormGrilleTRS('')
 } else if (q.type ==='QRC') {
 setFormReponseQRC(typeof q.reponseCorrecte ==='string' ? q.reponseCorrecte :'')
 setFormPropositions(['','',''])
 setFormReponseCorrecte([])
 setFormConsigneTRS('')
 setFormGrilleTRS('')
 } else if (q.type ==='TRS') {
 setFormConsigneTRS(q.enonce)
 setFormGrilleTRS(typeof q.reponseCorrecte ==='string' ? q.reponseCorrecte :'')
 setFormEnonce('')
 setFormPropositions(['','',''])
 setFormReponseCorrecte([])
 setFormReponseQRC('')
 } else if (q.type ==='CODE') {
 // Parse CODE-specific fields from reponseCorrecte JSON
 const codeData = (() => {
 if (!q.reponseCorrecte) return null
 try {
 const parsed = typeof q.reponseCorrecte ==='string' ? JSON.parse(q.reponseCorrecte) : q.reponseCorrecte
 if (parsed && typeof parsed ==='object' && parsed.type ==='CODE') return parsed
 } catch { /* not JSON */ }
 return null
 })()
 setFormLangage((codeData?.langage as CodingLanguage) ||'python')
 setFormFonctionSignature(codeData?.fonctionSignature ||'')
 setFormCodeInitial(codeData?.codeInitial ||'')
 setFormSolutionCode(codeData?.solution ||'')
 setFormPropositions(['','',''])
 setFormReponseCorrecte([])
 setFormReponseQRC('')
 setFormConsigneTRS('')
 setFormGrilleTRS('')
 }

 setEditDialogOpen(true)
 }

 // ─── Delete handler ───
 const handleDelete = async () => {
 if (!deletingQuestion) return
 try {
 const res = await fetch(`/api/questions/${deletingQuestion.id}`, { method:'DELETE' })
 if (!res.ok) throw new Error('Erreur')
 toast.success('Question déplacée vers la corbeille', {
 description:'La question a été déplacée vers la corbeille. Vous pouvez la restaurer dans les 30 jours.',
 })
 refreshQuestions()
 } catch {
 toast.error('Erreur', { description:'Impossible de supprimer la question.' })
 } finally {
 setDeleteConfirmOpen(false)
 setDeletingQuestion(null)
 }
 }

 // ─── Toggle question selection ───
 const toggleSelect = (id: string) => {
 setSelectedIds((prev) => {
 const next = new Set(prev)
 if (next.has(id)) next.delete(id)
 else next.add(id)
 return next
 })
 }

 // ─── Toggle select all on current page ───
 const toggleSelectAll = () => {
 if (selectedIds.size === questions.length) {
 // Deselect all
 setSelectedIds(new Set())
 } else {
 // Select all on current page
 setSelectedIds(new Set(questions.map((q) => q.id)))
 }
 }

 // ─── Batch delete handler ───
 const handleBatchDelete = async () => {
 if (selectedIds.size === 0) return
 setIsBatchDeleting(true)
 try {
 const res = await fetch('/api/questions', {
 method:'DELETE',
 headers: {'Content-Type':'application/json' },
 body: JSON.stringify({ ids: Array.from(selectedIds) }),
 })
 if (!res.ok) {
 const errData = await res.json().catch(() => ({}))
 throw new Error(errData.error ||'Erreur')
 }
 const data = await res.json()
 toast.success('Questions déplacées vers la corbeille', {
 description:`${data.deletedCount} question(s) déplacée(s) vers la corbeille. Vous pouvez les restaurer dans les 30 jours.`,
 })
 setSelectedIds(new Set())
 refreshQuestions()
 } catch {
 toast.error('Erreur', { description:'Impossible de supprimer les questions sélectionnées.' })
 } finally {
 setIsBatchDeleting(false)
 setBatchDeleteConfirmOpen(false)
 }
 }

 // ─── Reset form ───
 const resetForm = () => {
 setFormType('QCU')
 setFormEnonce('')
 setFormPropositions(['','',''])
 setFormReponseCorrecte([])
 setFormReponseQRC('')
 setFormConsigneTRS('')
 setFormGrilleTRS('')
 setFormDifficulte('MOYEN')
 setFormThemes('')
 setFormLangage('python')
 setFormFonctionSignature('')
 setFormCodeInitial('')
 setFormSolutionCode('')
 }

 // ─── Create question ───
 const handleCreate = async () => {
 if (!user?.id) return
 if (!formEnonce.trim() && formType !=='TRS') {
 toast.error('Champ requis', { description:'L\'énoncé est obligatoire.' })
 return
 }
 if (formType ==='TRS' && !formConsigneTRS.trim()) {
 toast.error('Champ requis', { description:'La consigne est obligatoire pour un TRS.' })
 return
 }

 setIsSubmitting(true)
 try {
 const body: Record<string, unknown> = {
 type: formType,
 auteurId: user.id,
 difficulte: formDifficulte,
 themes: formThemes
 ? formThemes.split(',').map((t) => t.trim()).filter(Boolean)
 : null,
 }

 if (formType ==='QCU' || formType ==='QCM') {
 body.enonce = formEnonce
 const validProps = formPropositions.filter((p) => p.trim())
 if (validProps.length < 3) {
 toast.error('Propositions insuffisantes', { description:'Un QCU/QCM nécessite au moins 3 propositions.' })
 setIsSubmitting(false)
 return
 }
 body.propositions = validProps
 if (formReponseCorrecte.length === 0) {
 toast.error('Réponse manquante', { description:'Veuillez sélectionner au moins une réponse correcte.' })
 setIsSubmitting(false)
 return
 }
 body.reponseCorrecte = formType ==='QCU' ? formReponseCorrecte[0] : formReponseCorrecte
 } else if (formType ==='QRC') {
 body.enonce = formEnonce
 body.reponseCorrecte = formReponseQRC || null
 } else if (formType ==='TRS') {
 body.enonce = formConsigneTRS
 body.reponseCorrecte = formGrilleTRS || null
 } else if (formType ==='CODE') {
 body.enonce = formEnonce
 body.propositions = null
 body.reponseCorrecte = {
 type:'CODE',
 langage: formLangage,
 codeInitial: formCodeInitial || getDefaultStarterCode(formLangage, formFonctionSignature || undefined),
 fonctionSignature: formFonctionSignature || null,
 solution: formSolutionCode || null,
 }
 }

 const res = await fetch('/api/questions', {
 method:'POST',
 headers: {'Content-Type':'application/json' },
 body: JSON.stringify(body),
 })

 if (!res.ok) {
 const errData = await res.json().catch(() => ({}))
 throw new Error(errData.error ||'Erreur lors de la création')
 }

 toast.success('Question créée', {
 description:'La question a été créée et validée automatiquement.',
 })

 resetForm()
 setCreateDialogOpen(false)
 refreshQuestions()
 } catch (err) {
 toast.error('Erreur', {
 description: err instanceof Error ? err.message :'Impossible de créer la question.',
 })
 } finally {
 setIsSubmitting(false)
 }
 }

 // ─── Update question ───
 const handleUpdate = async () => {
 if (!editingQuestion) return
 setIsSubmitting(true)
 try {
 const body: Record<string, unknown> = {
 difficulte: formDifficulte,
 themes: formThemes
 ? formThemes.split(',').map((t) => t.trim()).filter(Boolean)
 : null,
 }

 if (formType ==='QCU' || formType ==='QCM') {
 body.enonce = formEnonce
 const validProps = formPropositions.filter((p) => p.trim())
 body.propositions = validProps
 body.reponseCorrecte = formType ==='QCU' ? formReponseCorrecte[0] : formReponseCorrecte
 } else if (formType ==='QRC') {
 body.enonce = formEnonce
 body.reponseCorrecte = formReponseQRC || null
 } else if (formType ==='TRS') {
 body.enonce = formConsigneTRS
 body.reponseCorrecte = formGrilleTRS || null
 } else if (formType ==='CODE') {
 body.enonce = formEnonce
 body.propositions = null
 body.reponseCorrecte = {
 type:'CODE',
 langage: formLangage,
 codeInitial: formCodeInitial || getDefaultStarterCode(formLangage, formFonctionSignature || undefined),
 fonctionSignature: formFonctionSignature || null,
 solution: formSolutionCode || null,
 }
 }

 const res = await fetch(`/api/questions/${editingQuestion.id}`, {
 method:'PATCH',
 headers: {'Content-Type':'application/json' },
 body: JSON.stringify(body),
 })

 if (!res.ok) throw new Error('Erreur lors de la mise à jour')

 toast.success('Question mise à jour', {
 description:'Les modifications ont été enregistrées.',
 })

 setEditDialogOpen(false)
 setEditingQuestion(null)
 refreshQuestions()
 } catch {
 toast.error('Erreur', { description:'Impossible de mettre à jour la question.' })
 } finally {
 setIsSubmitting(false)
 }
 }

 // ─── Toggle correct answer for QCU/QCM ───
 const toggleCorrectAnswer = (index: string) => {
 if (formType ==='QCU') {
 setFormReponseCorrecte([index])
 } else {
 setFormReponseCorrecte((prev) => {
 if (prev.includes(index)) {
 return prev.filter((i) => i !== index)
 }
 return [...prev, index]
 })
 }
 }

 // ─── Add / remove proposition ───
 const addProposition = () => {
 if (formPropositions.length < 5) {
 setFormPropositions([...formPropositions,''])
 }
 }

 const removeProposition = (index: number) => {
 if (formPropositions.length > 3) {
 const newProps = formPropositions.filter((_, i) => i !== index)
 setFormPropositions(newProps)
 // Clean up correct answers referencing removed index
 const letterIndex = String.fromCharCode(65 + index)
 setFormReponseCorrecte((prev) => prev.filter((i) => i !== letterIndex))
 }
 }

 // ─── Statistics ───
 const stats = {
 total: totalQuestions,
 byType: {
 QCU: questions.filter((q) => q.type ==='QCU').length,
 QCM: questions.filter((q) => q.type ==='QCM').length,
 QRC: questions.filter((q) => q.type ==='QRC').length,
 TRS: questions.filter((q) => q.type ==='TRS').length,
 CODE: questions.filter((q) => q.type ==='CODE').length,
 },
 validees: questions.filter((q) => q.validee).length,
 nonValidees: questions.filter((q) => !q.validee).length,
 avgScore: questions.length > 0
 ? Math.round(questions.reduce((sum, q) => sum + (q.scoreQualite ?? 0), 0) / questions.filter((q) => q.scoreQualite !== null).length || 0)
 : 0,
 }

 // ─── Render proposition list for detail ───
 const renderPropositions = (q: Question) => {
 if (!q.propositions || q.propositions.length === 0) return null
 const correctAnswers = Array.isArray(q.reponseCorrecte)
 ? q.reponseCorrecte
 : q.reponseCorrecte
 ? [q.reponseCorrecte]
 : []

 return (
 <div className="mt-3 space-y-2">
 <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
 Propositions
 </p>
 {q.propositions.map((prop, i) => {
 const letter = String.fromCharCode(65 + i)
 const isCorrect = correctAnswers.includes(letter)
 return (
 <div
 key={i}
 className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
 isCorrect
 ?'border-success/40 bg-success/10'
 :'border-muted'
 }`}
 >
 <span
 className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
 isCorrect
 ?'bg-success/60 text-white'
 :'bg-muted text-muted-foreground'
 }`}
 >
 {letter}
 </span>
 <span className={isCorrect ?'font-medium text-success-text' :''}>
 {prop}
 </span>
 {isCorrect && (
 <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-success-text" />
 )}
 </div>
 )
 })}
 </div>
 )
 }

 // ─── Form for QCU/QCM ───
 const renderQCUQCMForm = () => (
 <div className="space-y-4">
 <div className="space-y-2">
 <Label>Énoncé *</Label>
 <Textarea
 value={formEnonce}
 onChange={(e) => setFormEnonce(e.target.value)}
 placeholder="Entrez l'énoncé de la question..."
 rows={3}
 />
 </div>
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <Label>Propositions * (min 3, max 5)</Label>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onClick={addProposition}
 disabled={formPropositions.length >= 5}
 className="h-7 text-xs text-success-text hover:text-success-text"
 >
 <PlusCircle className="mr-1 h-3 w-3" />
 Ajouter
 </Button>
 </div>
 <div className="space-y-2">
 {formPropositions.map((prop, i) => {
 const letter = String.fromCharCode(65 + i)
 const isSelected = formReponseCorrecte.includes(letter)
 return (
 <div key={i} className="flex items-center gap-2">
 <button
 type="button"
 onClick={() => toggleCorrectAnswer(letter)}
 className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
 isSelected
 ?'border-success/70 bg-success/60 text-white'
 :'border-muted-foreground/30 text-muted-foreground hover:border-success/50'
 }`}
 >
 {letter}
 </button>
 <Input
 value={prop}
 onChange={(e) => {
 const newProps = [...formPropositions]
 newProps[i] = e.target.value
 setFormPropositions(newProps)
 }}
 placeholder={`Proposition ${letter}`}
 className="flex-1"
 />
 {formPropositions.length > 3 && (
 <Button
 type="button"
 variant="ghost"
 size="icon"
 className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
 onClick={() => removeProposition(i)}
 >
 <MinusCircle className="h-4 w-4" />
 </Button>
 )}
 </div>
 )
 })}
 </div>
 <p className="text-xs text-muted-foreground">
 {formType ==='QCU'
 ?'Cliquez sur la lettre pour sélectionner la bonne réponse (1 seule).'
 :'Cliquez sur les lettres pour sélectionner les bonnes réponses (plusieurs possibles).'}
 </p>
 </div>
 </div>
 )

 // ─── Form for CODE ───
 const renderCODEForm = () => (
 <div className="space-y-4">
 <div className="space-y-2">
 <Label>Énoncé *</Label>
 <Textarea
 value={formEnonce}
 onChange={(e) => setFormEnonce(e.target.value)}
 placeholder="Entrez l'énoncé du problème de programmation..."
 rows={4}
 />
 </div>
 <div className="space-y-2">
 <Label>Langage de programmation *</Label>
 <Select
 value={formLangage}
 onValueChange={(val) => {
 const newLang = val as CodingLanguage
 setFormLangage(newLang)
 // Update starter code when language changes
 if (!formCodeInitial || formCodeInitial === getDefaultStarterCode(formLangage, formFonctionSignature || undefined)) {
 setFormCodeInitial(getDefaultStarterCode(newLang, formFonctionSignature || undefined))
 }
 }}
 >
 <SelectTrigger>
 <SelectValue placeholder="Sélectionner un langage" />
 </SelectTrigger>
 <SelectContent>
 {CODING_LANGUAGES.map((lang) => (
 <SelectItem key={lang.value} value={lang.value}>
 <span className="flex items-center gap-2">
 <span>{lang.icon}</span>
 <span>{lang.label}</span>
 <span className="text-muted-foreground text-xs">({lang.fileExtension})</span>
 </span>
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Signature de la fonction</Label>
 <Input
 value={formFonctionSignature}
 onChange={(e) => setFormFonctionSignature(e.target.value)}
 placeholder="ex: def calculer_moyenne(nombres):"
 className="font-mono"
 />
 <p className="text-xs text-muted-foreground">La signature attendue pour la fonction que l'étudiant doit implémenter.</p>
 </div>
 <div className="space-y-2">
 <Label>Code initial (template)</Label>
 <Textarea
 value={formCodeInitial}
 onChange={(e) => setFormCodeInitial(e.target.value)}
 placeholder="Code de départ fourni à l'étudiant..."
 rows={6}
 className="font-mono text-sm"
 />
 <p className="text-xs text-muted-foreground">Code fourni comme point de départ à l'étudiant.</p>
 </div>
 <div className="space-y-2">
 <Label>Solution modèle</Label>
 <Textarea
 value={formSolutionCode}
 onChange={(e) => setFormSolutionCode(e.target.value)}
 placeholder="Code de la solution correcte..."
 rows={8}
 className="font-mono text-sm"
 />
 </div>
 </div>
 )

 // ─── Form for QRC ───
 const renderQRCForm = () => (
 <div className="space-y-4">
 <div className="space-y-2">
 <Label>Énoncé *</Label>
 <Textarea
 value={formEnonce}
 onChange={(e) => setFormEnonce(e.target.value)}
 placeholder="Entrez l'énoncé de la question..."
 rows={3}
 />
 </div>
 <div className="space-y-2">
 <Label>Réponse attendue</Label>
 <Textarea
 value={formReponseQRC}
 onChange={(e) => setFormReponseQRC(e.target.value)}
 placeholder="Entrez la réponse modèle attendue..."
 rows={4}
 />
 </div>
 </div>
 )

 // ─── Form for TRS ───
 const renderTRSForm = () => (
 <div className="space-y-4">
 <div className="space-y-2">
 <Label>Consigne *</Label>
 <Textarea
 value={formConsigneTRS}
 onChange={(e) => setFormConsigneTRS(e.target.value)}
 placeholder="Entrez la consigne du test de réflexion structuré..."
 rows={4}
 />
 </div>
 <div className="space-y-2">
 <Label>Grille de correction</Label>
 <Textarea
 value={formGrilleTRS}
 onChange={(e) => setFormGrilleTRS(e.target.value)}
 placeholder="Entrez la grille de correction détaillée..."
 rows={4}
 />
 </div>
 </div>
 )

 // ─── Common form fields (difficulty + themes) ───
 const renderCommonFields = () => (
 <div className="space-y-4">
 <div className="space-y-2">
 <Label>Difficulté</Label>
 <Select
 value={formDifficulte}
 onValueChange={(v) => setFormDifficulte(v as typeof formDifficulte)}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="FACILE">Facile</SelectItem>
 <SelectItem value="MOYEN">Moyen</SelectItem>
 <SelectItem value="DIFFICILE">Difficile</SelectItem>
 <SelectItem value="EXPERT">Expert</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Thèmes (séparés par des virgules)</Label>
 <Input
 value={formThemes}
 onChange={(e) => setFormThemes(e.target.value)}
 placeholder="ex: algorithmique, bases de données, réseaux"
 />
 </div>
 </div>
 )

 return (
 <div className="space-y-6">
 {/* ─── Header ─── */}
 <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <h1 className="text-2xl font-bold font-display tracking-tight md:text-3xl">
 Banque de Questions
 </h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Parcourez et gérez toutes vos questions validées
 </p>
 </div>
 <Button
 className="bg-success/60 hover:bg-success/70"
 size="lg"
 onClick={() => {
 resetForm()
 setCreateDialogOpen(true)
 }}
 >
 <Plus className="h-4 w-4" />
 Ajouter une question
 </Button>
 </div>

 {/* ─── Statistics Card ─── */}
 {!isLoading && (
 <Card className="border-success/30 bg-gradient-to-r from-success/80 to-info/80">
 <CardContent className="flex flex-wrap items-center gap-4 p-4 md:gap-6 md:p-5">
 <div className="flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/15">
 <Library className="h-4 w-4 text-success-text" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">Total</p>
 <p className="text-lg font-bold font-mono tabular-nums">{stats.total}</p>
 </div>
 </div>

 <Separator orientation="vertical" className="hidden h-8 sm:block" />

 <div className="flex flex-wrap items-center gap-1.5">
 <span className="text-xs text-muted-foreground mr-1">Par type :</span>
 <Badge variant="outline" className="bg-info/10 text-info border-info/30">
 QCU: {stats.byType.QCU}
 </Badge>
 <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
 QCM: {stats.byType.QCM}
 </Badge>
 <Badge variant="outline" className="bg-success/10 text-success-text border-success/30">
 QRC: {stats.byType.QRC}
 </Badge>
 <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
 TRS: {stats.byType.TRS}
 </Badge>
 <Badge variant="outline" className="bg-secondary/10 text-secondary border-secondary/30">
 CODE: {stats.byType.CODE}
 </Badge>
 </div>

 <Separator orientation="vertical" className="hidden h-8 sm:block" />

 <div className="flex items-center gap-2">
 <CheckCircle2 className="h-4 w-4 text-success-text" />
 <span className="text-sm">
 <span className="font-semibold">{stats.validees}</span>{''}
 <span className="text-muted-foreground">validées</span>
 </span>
 <span className="text-muted-foreground">·</span>
 <Clock className="h-4 w-4 text-warning" />
 <span className="text-sm">
 <span className="font-semibold">{stats.nonValidees}</span>{''}
 <span className="text-muted-foreground">non validées</span>
 </span>
 </div>

 <Separator orientation="vertical" className="hidden h-8 sm:block" />

 <div className="flex items-center gap-2">
 <Star className="h-4 w-4 text-warning" />
 <span className="text-sm">
 <span className={`font-semibold ${getScoreColor(stats.avgScore)}`}>
 {stats.avgScore > 0 ? stats.avgScore :'—'}
 </span>{''}
 <span className="text-muted-foreground">qualité moy.</span>
 </span>
 </div>
 </CardContent>
 </Card>
 )}

 {/* ─── Search & Filters (sticky) ─── */}
 <div className="sticky top-0 z-10 -mx-4 border-b bg-background px-4 pb-4 pt-2 md:-mx-6 md:px-6">
 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-3 sm:flex-row">
 {/* Search */}
 <div className="relative flex-1">
 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Rechercher dans les questions..."
 className="pl-9"
 />
 {search && (
 <Button
 variant="ghost"
 size="icon"
 className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
 onClick={() => setSearch('')}
 >
 <X className="h-3 w-3" />
 </Button>
 )}
 </div>

 <div className="flex flex-wrap gap-2">
 {/* Type filter */}
 <Select value={typeFilter} onValueChange={setTypeFilter}>
 <SelectTrigger className="w-[120px]">
 <Filter className="mr-1 h-3 w-3" />
 <SelectValue placeholder="Type" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="TOUS">Tous les types</SelectItem>
 <SelectItem value="QCU">QCU</SelectItem>
 <SelectItem value="QCM">QCM</SelectItem>
 <SelectItem value="QRC">QRC</SelectItem>
 <SelectItem value="TRS">TRS</SelectItem>
 <SelectItem value="CODE">CODE</SelectItem>
 </SelectContent>
 </Select>

 {/* Difficulty filter */}
 <Select value={difficulteFilter} onValueChange={setDifficulteFilter}>
 <SelectTrigger className="w-[140px]">
 <SelectValue placeholder="Difficulté" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="TOUS">Toutes difficultés</SelectItem>
 <SelectItem value="FACILE">Facile</SelectItem>
 <SelectItem value="MOYEN">Moyen</SelectItem>
 <SelectItem value="DIFFICILE">Difficile</SelectItem>
 <SelectItem value="EXPERT">Expert</SelectItem>
 </SelectContent>
 </Select>

 {/* Validation filter */}
 <Select value={valideeFilter} onValueChange={setValideeFilter}>
 <SelectTrigger className="w-[140px]">
 <SelectValue placeholder="Statut" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="TOUS">Tous les statuts</SelectItem>
 <SelectItem value="VALIDEES">Validées</SelectItem>
 <SelectItem value="NON_VALIDEES">Non validées</SelectItem>
 </SelectContent>
 </Select>

 {/* Document filter */}
 <Select value={documentFilter} onValueChange={setDocumentFilter}>
 <SelectTrigger className="w-[180px]">
 <SelectValue placeholder="Document" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="TOUS">Tous les documents</SelectItem>
 {documents.map((doc) => (
 <SelectItem key={doc.id} value={doc.id}>
 {doc.nomFichier.length > 28
 ? doc.nomFichier.slice(0, 25) +'...'
 : doc.nomFichier}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="flex items-center justify-between">
 <p className="text-sm text-muted-foreground">
 {isLoading ? (
 <span className="flex items-center gap-1">
 <Loader2 className="h-3 w-3 animate-spin" />
 Chargement...
 </span>
 ) : (
 <><span className="font-semibold text-foreground">{totalQuestions}</span> question{totalQuestions !== 1 ?'s' :''} trouvée{totalQuestions !== 1 ?'s' :''}</>
 )}
 </p>
 {(search || typeFilter !=='TOUS' || difficulteFilter !=='TOUS' || valideeFilter !=='TOUS' || documentFilter !=='TOUS') && (
 <Button
 variant="ghost"
 size="sm"
 className="text-xs text-muted-foreground hover:text-foreground"
 onClick={() => {
 setSearch('')
 setTypeFilter('TOUS')
 setDifficulteFilter('TOUS')
 setValideeFilter('TOUS')
 setDocumentFilter('TOUS')
 }}
 >
 Réinitialiser les filtres
 </Button>
 )}
 </div>
 </div>
 </div>

 {/* ─── Loading state ─── */}
 {isLoading && (
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {Array.from({ length: 6 }).map((_, i) => (
 <EntityCard key={i} loading title="" />
 ))}
 </div>
 )}

 {/* ─── Empty state ─── */}
 {!isLoading && questions.length === 0 && (
 <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
 <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
 <BookOpen className="h-10 w-10 text-success-text" />
 </div>
 <h3 className="mt-4 font-display tracking-tight text-lg font-semibold">Aucune question trouvée</h3>
 <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
 {search || typeFilter !=='TOUS' || difficulteFilter !=='TOUS' || valideeFilter !=='TOUS' || documentFilter !=='TOUS'
 ?'Aucune question ne correspond à vos critères de recherche. Essayez de modifier vos filtres.'
 :'Commencez par générer des questions via l\'IA à partir de vos documents, ou ajoutez-en manuellement.'}
 </p>
 <div className="mt-6 flex flex-wrap gap-3">
 {!search && typeFilter ==='TOUS' && difficulteFilter ==='TOUS' && valideeFilter ==='TOUS' && documentFilter ==='TOUS' && (
 <Button
 variant="outline"
 className="border-success/40 text-success-text hover:bg-success/10"
 onClick={() => router.push(PAGE_ROUTES['questions-ia'])}
 >
 <Sparkles className="h-4 w-4" />
 Générer via l&apos;IA
 </Button>
 )}
 <Button
 className="bg-success/60 hover:bg-success/70"
 onClick={() => {
 resetForm()
 setCreateDialogOpen(true)
 }}
 >
 <Plus className="h-4 w-4" />
 Ajouter manuellement
 </Button>
 </div>
 </div>
 )}

 {/* ─── Select all bar ─── */}
 {!isLoading && questions.length > 0 && (
 <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
 <div className="flex items-center gap-2">
 <Checkbox
 checked={selectedIds.size === questions.length && questions.length > 0 ? true : selectedIds.size > 0 ?'indeterminate' : false}
 onCheckedChange={toggleSelectAll}
 className="h-4 w-4"
 />
 <span className="text-sm text-muted-foreground">
 {selectedIds.size > 0 ? (
 <><span className="font-semibold text-foreground">{selectedIds.size}</span> sélectionnée{selectedIds.size > 1 ?'s' :''}</>
 ) : ('Tout sélectionner'
 )}
 </span>
 </div>
 {selectedIds.size > 0 && (
 <div className="ml-auto flex items-center gap-2">
 <Button
 variant="ghost"
 size="sm"
 className="h-8 text-xs text-muted-foreground hover:text-foreground"
 onClick={() => setSelectedIds(new Set())}
 >
 <X className="mr-1 h-3 w-3" />
 Annuler la sélection
 </Button>
 <Button
 variant="destructive"
 size="sm"
 className="h-8 text-xs"
 onClick={() => setBatchDeleteConfirmOpen(true)}
 disabled={isBatchDeleting}
 >
 {isBatchDeleting ? (
 <Loader2 className="mr-1 h-3 w-3 animate-spin" />
 ) : (
 <Trash2 className="mr-1 h-3 w-3" />
 )}
 Supprimer ({selectedIds.size})
 </Button>
 </div>
 )}
 </div>
 )}

 {/* ─── Question cards ─── */}
 {!isLoading && questions.length > 0 && (
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {questions.map((q, idx) => {
 const typeBadge = getTypeBadgeConfig(q.type)
 const diffBadge = getDifficulteBadgeConfig(q.difficulte)
 const isSelected = selectedIds.has(q.id)

 const typeVariant =
 q.type === 'QCU' ? 'primary' as const
 : q.type === 'QCM' ? 'warning' as const
 : q.type === 'QRC' ? 'success' as const
 : q.type === 'TRS' ? 'danger' as const
 : 'secondary' as const

 const thumbnailIcon = q.document ? FileText : q.documentId === null ? Pencil : Hash
 const subtitle = q.document
 ? q.document.nomFichier.length > 40
 ? q.document.nomFichier.slice(0, 37) + '...'
 : q.document.nomFichier
 : q.documentId === null
 ? 'Création manuelle'
 : undefined

 const meta = `${diffBadge.label}${q.scoreQualite !== null ? ` · ${q.scoreQualite}/100` : ''} · ${formatDate(q.createdAt)}`

 return (
 <div
 key={q.id}
 className={`relative rounded-lg ${
 isSelected ? 'ring-2 ring-destructive' : ''
 }`}
 >
 {/* Checkbox overlay */}
 <div className="absolute top-2 left-2 z-20">
 <Checkbox
 checked={isSelected}
 onCheckedChange={() => toggleSelect(q.id)}
 className="h-4 w-4 bg-background/80 backdrop-blur-sm"
 />
 </div>

 <EntityCard
 index={idx}
 title={q.enonce}
 subtitle={subtitle}
 thumbnailIcon={thumbnailIcon}
 badge={{ label: typeBadge.label, variant: typeVariant }}
 meta={meta}
 >
 {/* Validated + score + difficulté badges */}
 <div className="mt-3 flex flex-wrap items-center gap-2">
 <Badge variant="outline" className={`text-xs ${diffBadge.className}`}>
 {diffBadge.label}
 </Badge>
 {q.validee ? (
 <span className="flex items-center gap-1 text-xs font-medium text-success-text">
 <CheckCircle2 className="h-3.5 w-3.5" />
 Validée
 </span>
 ) : (
 <span className="flex items-center gap-1 text-xs font-medium text-warning">
 <Clock className="h-3.5 w-3.5" />
 Non validée
 </span>
 )}
 {q.scoreQualite !== null && (
 <span className={`flex items-center gap-1 text-xs font-medium ${getScoreColor(q.scoreQualite)}`}>
 <Star className="h-3 w-3" />
 {q.scoreQualite}
 </span>
 )}
 </div>

 {/* Themes */}
 {q.themes && q.themes.length > 0 && (
 <div className="mt-2 flex flex-wrap items-center gap-1">
 {q.themes.slice(0, 3).map((theme, i) => (
 <Badge
 key={i}
 variant="secondary"
 className="text-[10px] bg-info/10 text-info"
 >
 {theme}
 </Badge>
 ))}
 {q.themes.length > 3 && (
 <Badge variant="secondary" className="text-[10px]">
 +{q.themes.length - 3}
 </Badge>
 )}
 </div>
 )}

 {/* Action buttons */}
 <div className="mt-3 flex flex-wrap items-center gap-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-8 text-xs hover:text-success-text"
 onClick={() => handleViewDetail(q)}
 >
 <Eye className="mr-1 h-3.5 w-3.5" />
 Voir détail
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 text-xs hover:text-warning"
 onClick={() => handleEdit(q)}
 >
 <Pencil className="mr-1 h-3.5 w-3.5" />
 Modifier
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 text-xs hover:text-destructive"
 onClick={() => {
 setDeletingQuestion(q)
 setDeleteConfirmOpen(true)
 }}
 >
 <Trash2 className="mr-1 h-3.5 w-3.5" />
 Supprimer
 </Button>
 </div>
 </EntityCard>
 </div>
 )
 })}
 </div>
 )}

 {/* ─── Pagination ─── */}
 {!isLoading && totalPages > 1 && (
 <div className="flex items-center justify-between">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setPage((p) => Math.max(1, p - 1))}
 disabled={page <= 1}
 >
 <ChevronLeft className="mr-1 h-4 w-4" />
 Précédent
 </Button>
 <p className="text-sm text-muted-foreground">
 Page <span className="font-semibold text-foreground">{page}</span> sur{''}
 <span className="font-semibold text-foreground">{totalPages}</span>
 </p>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
 disabled={page >= totalPages}
 >
 Suivant
 <ChevronRight className="ml-1 h-4 w-4" />
 </Button>
 </div>
 )}

 {/* ─── Question Detail Dialog ─── */}
 <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
 <DialogContent className="max-w-2xl max-h-[85vh]">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 {detailQuestion && (
 <>
 <Badge variant="outline" className={getTypeBadgeConfig(detailQuestion.type).className}>
 {getTypeBadgeConfig(detailQuestion.type).label}
 </Badge>
 Détail de la question
 </>
 )}
 </DialogTitle>
 <DialogDescription>
 Informations complètes sur la question sélectionnée
 </DialogDescription>
 </DialogHeader>

 {detailQuestion && (
 <ScrollArea className="max-h-[60vh] pr-2">
 <div className="space-y-5">
 {/* Badges row */}
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant="outline" className={getTypeBadgeConfig(detailQuestion.type).className}>
 {getTypeBadgeConfig(detailQuestion.type).label}
 </Badge>
 <Badge variant="outline" className={getDifficulteBadgeConfig(detailQuestion.difficulte).className}>
 {getDifficulteBadgeConfig(detailQuestion.difficulte).label}
 </Badge>
 {detailQuestion.validee ? (
 <Badge className="bg-success/15 text-success-text border-success/30 gap-1">
 <CheckCircle2 className="h-3 w-3" />
 Validée
 </Badge>
 ) : (
 <Badge className="bg-warning/15 text-warning border-warning/30 gap-1">
 <Clock className="h-3 w-3" />
 Non validée
 </Badge>
 )}
 {detailQuestion.scoreQualite !== null && (
 <Badge variant="outline" className="gap-1">
 <Star className={`h-3 w-3 ${getScoreColor(detailQuestion.scoreQualite)}`} />
 <span className={getScoreColor(detailQuestion.scoreQualite)}>
 Score : {detailQuestion.scoreQualite}/100
 </span>
 </Badge>
 )}
 </div>

 <Separator />

 {/* Énoncé */}
 <section>
 <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
 <Hash className="h-4 w-4 text-success-text" />
 Énoncé
 </h3>
 <div className="rounded-lg border bg-muted/30 p-3">
 <p className="text-sm leading-relaxed whitespace-pre-wrap">
 {detailQuestion.enonce}
 </p>
 </div>
 </section>

 {/* Propositions (QCU/QCM) */}
 {(detailQuestion.type ==='QCU' || detailQuestion.type ==='QCM') && renderPropositions(detailQuestion)}

 {/* Réponse attendue (QRC) */}
 {detailQuestion.type ==='QRC' && detailQuestion.reponseCorrecte && (
 <section>
 <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
 <BookOpen className="h-4 w-4 text-success-text" />
 Réponse attendue
 </h3>
 <div className="rounded-lg border border-success/30 bg-success/50 p-3">
 <p className="text-sm leading-relaxed whitespace-pre-wrap">
 {typeof detailQuestion.reponseCorrecte ==='string'
 ? detailQuestion.reponseCorrecte
 : JSON.stringify(detailQuestion.reponseCorrecte)}
 </p>
 </div>
 </section>
 )}

 {/* Grille de correction (TRS) */}
 {detailQuestion.type ==='TRS' && detailQuestion.reponseCorrecte && (
 <section>
 <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
 <BookOpen className="h-4 w-4 text-success-text" />
 Grille de correction
 </h3>
 <div className="rounded-lg border border-success/30 bg-success/50 p-3">
 <p className="text-sm leading-relaxed whitespace-pre-wrap">
 {typeof detailQuestion.reponseCorrecte ==='string'
 ? detailQuestion.reponseCorrecte
 : JSON.stringify(detailQuestion.reponseCorrecte)}
 </p>
 </div>
 </section>
 )}

 {/* CODE question details */}
 {detailQuestion.type ==='CODE' && (() => {
 const codeData = (() => {
 if (!detailQuestion.reponseCorrecte) return null
 try {
 const parsed = typeof detailQuestion.reponseCorrecte ==='string'
 ? JSON.parse(detailQuestion.reponseCorrecte)
 : detailQuestion.reponseCorrecte
 if (parsed && typeof parsed ==='object') return parsed
 } catch { /* not JSON */ }
 return null
 })()
 return (
 <div className="space-y-3">
 {codeData?.langage && (
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="gap-1 bg-secondary/15 text-secondary border-secondary/30">
 <Hash className="h-3 w-3" />
 {(() => { const cfg = CODING_LANGUAGES.find(l => l.value === codeData.langage); return cfg ?`${cfg.icon} ${cfg.label}` : codeData.langage; })()}
 </Badge>
 {codeData.fonctionSignature && (
 <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-xs" title={codeData.fonctionSignature}>
 {codeData.fonctionSignature}
 </code>
 )}
 </div>
 )}
 {codeData?.codeInitial && (
 <section>
 <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
 <FileText className="h-4 w-4 text-secondary" />
 Code initial
 </h3>
 <pre className="rounded-lg bg-zinc-900 text-zinc-100 p-3 text-xs overflow-x-auto font-mono leading-relaxed">
 {codeData.codeInitial}
 </pre>
 </section>
 )}
 {codeData?.solution && (
 <section>
 <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
 <BookOpen className="h-4 w-4 text-success-text" />
 Solution modèle
 </h3>
 <pre className="rounded-lg bg-success/95 text-success-text/15 p-3 text-xs overflow-x-auto font-mono leading-relaxed">
 {codeData.solution}
 </pre>
 </section>
 )}
 </div>
 )
 })()}

 {/* Explication */}
 {detailQuestion.explication && (
 <section>
 <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
 <Lightbulb className="h-4 w-4 text-info" />
 Explication
 </h3>
 <div className="rounded-lg border border-info/30 bg-info/50 p-3">
 <p className="text-sm leading-relaxed whitespace-pre-wrap">
 {detailQuestion.explication}
 </p>
 </div>
 </section>
 )}

 {/* Themes */}
 {detailQuestion.themes && detailQuestion.themes.length > 0 && (
 <section>
 <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
 <Hash className="h-4 w-4 text-success-text" />
 Thèmes
 </h3>
 <div className="flex flex-wrap gap-2">
 {detailQuestion.themes.map((theme, i) => (
 <Badge
 key={i}
 className="bg-success/15 text-success-text border-success/30"
 >
 {theme}
 </Badge>
 ))}
 </div>
 </section>
 )}

 {/* Document source */}
 {detailQuestion.document && (
 <section>
 <h3 className="mb-2 flex items-center gap-2 font-display tracking-tight text-sm font-semibold">
 <FileText className="h-4 w-4 text-success-text" />
 Document source
 </h3>
 <p className="text-sm text-muted-foreground">
 {detailQuestion.document.nomFichier}
 </p>
 </section>
 )}

 <Separator />

 {/* Actions in dialog */}
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="border-warning/40 text-warning hover:bg-warning/10"
 onClick={() => {
 setDetailDialogOpen(false)
 handleEdit(detailQuestion)
 }}
 >
 <Pencil className="mr-1 h-3.5 w-3.5" />
 Modifier
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="border-destructive/40 text-destructive hover:bg-destructive/10"
 onClick={() => {
 setDetailDialogOpen(false)
 setDeletingQuestion(detailQuestion)
 setDeleteConfirmOpen(true)
 }}
 >
 <Trash2 className="mr-1 h-3.5 w-3.5" />
 Supprimer
 </Button>
 </div>
 </div>
 </ScrollArea>
 )}
 </DialogContent>
 </Dialog>

 {/* ─── Create Question Dialog ─── */}
 <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
 <DialogContent className="max-w-xl max-h-[85vh]">
 <DialogHeader>
 <DialogTitle>Ajouter une question manuellement</DialogTitle>
 <DialogDescription>
 Créez une nouvelle question. Les questions ajoutées manuellement sont automatiquement validées.
 </DialogDescription>
 </DialogHeader>

 <ScrollArea className="max-h-[60vh] pr-2">
 <div className="space-y-5">
 {/* Type selector */}
 <div className="space-y-2">
 <Label>Type de question *</Label>
 <div className="grid grid-cols-5 gap-2">
 {(['QCU','QCM','QRC','TRS','CODE'] as const).map((t) => {
 const config = getTypeBadgeConfig(t)
 return (
 <button
 key={t}
 type="button"
 onClick={() => {
 setFormType(t)
 setFormPropositions(['','',''])
 setFormReponseCorrecte([])
 setFormReponseQRC('')
 setFormConsigneTRS('')
 setFormGrilleTRS('')
 setFormEnonce('')
 if (t ==='CODE') {
 setFormLangage('python')
 setFormCodeInitial(getDefaultStarterCode('python'))
 setFormFonctionSignature('')
 setFormSolutionCode('')
 }
 }}
 className={`rounded-lg border-2 p-2.5 text-center text-sm font-medium transition-colors ${
 formType === t
 ?'border-success/60 bg-success/10'
 :'border-muted hover:border-success/40'
 }`}
 >
 <Badge variant="outline" className={config.className}>
 {config.label}
 </Badge>
 </button>
 )
 })}
 </div>
 </div>

 {/* Dynamic form based on type */}
 {formType ==='QCU' || formType ==='QCM'
 ? renderQCUQCMForm()
 : formType ==='QRC'
 ? renderQRCForm()
 : formType ==='CODE'
 ? renderCODEForm()
 : renderTRSForm()}

 <Separator />

 {/* Common fields */}
 {renderCommonFields()}
 </div>
 </ScrollArea>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => {
 setCreateDialogOpen(false)
 resetForm()
 }}
 disabled={isSubmitting}
 >
 Annuler
 </Button>
 <Button
 className="bg-success/60 hover:bg-success/70"
 onClick={handleCreate}
 disabled={isSubmitting}
 >
 {isSubmitting ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 Création...
 </>
 ) : (
 <>
 <Plus className="h-4 w-4" />
 Créer la question
 </>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ─── Edit Question Dialog ─── */}
 <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
 <DialogContent className="max-w-xl max-h-[85vh]">
 <DialogHeader>
 <DialogTitle>Modifier la question</DialogTitle>
 <DialogDescription>
 Modifiez les informations de la question.
 </DialogDescription>
 </DialogHeader>

 <ScrollArea className="max-h-[60vh] pr-2">
 <div className="space-y-5">
 {/* Type display (read-only when editing) */}
 <div className="space-y-2">
 <Label>Type de question</Label>
 <div className="flex items-center gap-2">
 <Badge variant="outline" className={getTypeBadgeConfig(formType).className}>
 {getTypeBadgeConfig(formType).label}
 </Badge>
 <span className="text-xs text-muted-foreground">
 Le type ne peut pas être modifié
 </span>
 </div>
 </div>

 {/* Dynamic form based on type */}
 {formType ==='QCU' || formType ==='QCM'
 ? renderQCUQCMForm()
 : formType ==='QRC'
 ? renderQRCForm()
 : formType ==='CODE'
 ? renderCODEForm()
 : renderTRSForm()}

 <Separator />

 {/* Common fields */}
 {renderCommonFields()}
 </div>
 </ScrollArea>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => {
 setEditDialogOpen(false)
 setEditingQuestion(null)
 }}
 disabled={isSubmitting}
 >
 Annuler
 </Button>
 <Button
 className="bg-success/60 hover:bg-success/70"
 onClick={handleUpdate}
 disabled={isSubmitting}
 >
 {isSubmitting ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 Enregistrement...
 </>
 ) : (
 <>
 <Pencil className="h-4 w-4" />
 Enregistrer
 </>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* ─── Delete Confirmation ─── */}
 <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2">
 <AlertTriangle className="h-5 w-5 text-destructive" />
 Supprimer cette question ?
 </AlertDialogTitle>
 <AlertDialogDescription>
 Cette action est irréversible. La question sera définitivement supprimée de la banque.
 {deletingQuestion && (
 <span className="mt-2 block rounded-lg border bg-muted/30 p-2 text-sm">
 &quot;{deletingQuestion.enonce.slice(0, 100)}{deletingQuestion.enonce.length > 100 ?'...' :''}&quot;
 </span>
 )}
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel onClick={() => setDeletingQuestion(null)}>
 Annuler
 </AlertDialogCancel>
 <AlertDialogAction
 onClick={handleDelete}
 className="bg-destructive/60 hover:bg-destructive/70"
 >
 Supprimer
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* ─── Batch Delete Confirmation ─── */}
 <AlertDialog open={batchDeleteConfirmOpen} onOpenChange={setBatchDeleteConfirmOpen}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2">
 <AlertTriangle className="h-5 w-5 text-destructive" />
 Suppression multiple
 </AlertDialogTitle>
 <AlertDialogDescription>
 Vous êtes sur le point de supprimer <strong>{selectedIds.size} question{selectedIds.size > 1 ?'s' :''}</strong>.
 Cette action est irréversible. Les questions sélectionnées seront définitivement supprimées de la banque.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Annuler</AlertDialogCancel>
 <AlertDialogAction
 onClick={handleBatchDelete}
 className="bg-destructive/60 hover:bg-destructive/70 focus:ring-destructive/40"
 disabled={isBatchDeleting}
 >
 {isBatchDeleting ? (
 <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Suppression...</>
 ) : (
 <><Trash2 className="mr-2 h-4 w-4" /> Supprimer {selectedIds.size} question{selectedIds.size > 1 ?'s' :''}</>
 )}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 )
}
