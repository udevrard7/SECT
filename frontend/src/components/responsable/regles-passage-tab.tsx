'use client'

// ═══════════════════════════════════════════════════════════════════════════
// SECT-REGLES-PASSAGE-MUTATION-1 : ReglesPassageTab — onglet "Règles de passage"
// de la page Paramètres établissement (ResponsableParametresPage).
//
// Permet à un RESPONSABLE de modifier les 5 seuils pédagogiques de passage qui
// déterminent la décision automatique de cloturer_annee_etudiant :
//   - seuilMoyennePassage     ∈ [0, 20]        (ex: 10/20 pour être promu)
//   - seuilMoyenneRattrapage  ∈ [0, passage]   (ex: 8/20 pour éviter le redoublement)
//   - creditsMinPourcent      ∈ [0, 100]       (ex: 60% de crédits ECTS à valider)
//   - regime                  ∈ {STRICT, COMPENSATION}
//     STRICT = toutes les UE doivent être validées
//     COMPENSATION = compensation entre UE (réservé future évolution SQL)
//   - limiteRedoublements     ≥ 0              (ex: 2 redoublements max autorisés)
//
// Endpoints backend consommés :
//   GET  /api/etablissements/{id}/regles-passage  → lecture config actuelle
//   PUT  /api/etablissements/{id}/regles-passage  → upsert (INSERT ou UPDATE)
//
// Invalidation TanStack Query après mutation :
//   - ['regles-passage', etabId]         → refresh local (ce composant)
//   - ['cloture-annee-preview']          → refresh la page Clôture (broad prefix)
//                                            car la preview dépend des règles
//
// Pattern identique à audit-tab.tsx (lazy-loaded via TanStack Query interne,
// gate `enabled=!!etablissementId`, PulseSkeleton pour le loading, friendly
// error message + retry). Palette Savane EdTech (success / warning / info).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SlidersHorizontal,
  Save,
  AlertCircle,
  RefreshCw,
  GraduationCap,
  ShieldCheck,
  Loader2,
  Info,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'

// ─── Types ───

interface ReglesPassageTabProps {
  /** ID de l'établissement actif (responsable) ou sélectionné (admin). */
  etablissementId: string
}

/** Miroir frontend du DTO backend domain.ReglesPassage (GET /regles-passage). */
interface ReglesPassage {
  id: string
  etablissementId: string
  seuilMoyennePassage: number
  seuilMoyenneRattrapage: number
  creditsMinPourcent: number
  regime: string
  limiteRedoublements: number
  createdAt: string
  updatedAt: string
}

/** Body du PUT /regles-passage (5 champs configurables). */
interface UpdateReglesPassageBody {
  seuilMoyennePassage: number
  seuilMoyenneRattrapage: number
  creditsMinPourcent: number
  regime: string
  limiteRedoublements: number
}

// ─── Constantes ───

/** Valeurs par défaut affichées dans le formulaire avant chargement (cf.
 * ReglesPassageDefaults côté backend — 10/20, 8/20, 60%, STRICT, 2). */
const DEFAULTS: UpdateReglesPassageBody = {
  seuilMoyennePassage: 10,
  seuilMoyenneRattrapage: 8,
  creditsMinPourcent: 60,
  regime: 'STRICT',
  limiteRedoublements: 2,
}

// ─── Composant principal ───

export function ReglesPassageTab({ etablissementId }: ReglesPassageTabProps) {
  const queryClient = useQueryClient()

  // ─── Query : GET current rules ───
  const reglesQuery = useQuery<ReglesPassage>({
    queryKey: ['regles-passage', etablissementId],
    queryFn: async () => {
      const res = await fetch(
        `/api/etablissements/${etablissementId}/regles-passage`,
        { credentials: 'same-origin' },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(
          err?.error ?? 'Erreur lors du chargement des règles de passage',
        )
      }
      return (await res.json()) as ReglesPassage
    },
    enabled: !!etablissementId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // ─── Local form state (initialisé quand la query résout) ───
  const [form, setForm] = useState<UpdateReglesPassageBody>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  // Quand les règles chargent (ou changent après mutation), on hydrate le form
  // UNE fois. Le `loaded` flag évite de réécraser le form si l'utilisateur a
  // déjà commencé à éditer avant un refetch (ex: window focus).
  // Pattern standard TanStack Query "hydrate state from query" — le React
  // Compiler flagge set-state-in-effect, on disable ciblé comme audit-tab.tsx.
  useEffect(() => {
    if (reglesQuery.data && !loaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate form from query data (one-shot), pattern standard
      setForm({
        seuilMoyennePassage: reglesQuery.data.seuilMoyennePassage,
        seuilMoyenneRattrapage: reglesQuery.data.seuilMoyenneRattrapage,
        creditsMinPourcent: reglesQuery.data.creditsMinPourcent,
        regime: reglesQuery.data.regime,
        limiteRedoublements: reglesQuery.data.limiteRedoublements,
      })
      setLoaded(true)
    }
  }, [reglesQuery.data, loaded])

  // ─── Détection de changements (pour désactiver le bouton Enregistrer) ───
  const hasChanges = useMemo(() => {
    if (!reglesQuery.data) return true
    const r = reglesQuery.data
    return (
      form.seuilMoyennePassage !== r.seuilMoyennePassage ||
      form.seuilMoyenneRattrapage !== r.seuilMoyenneRattrapage ||
      form.creditsMinPourcent !== r.creditsMinPourcent ||
      form.regime !== r.regime ||
      form.limiteRedoublements !== r.limiteRedoublements
    )
  }, [form, reglesQuery.data])

  // ─── Validation côté formulaire (mirrors backend) ───
  const validationError = useMemo(() => {
    if (form.seuilMoyennePassage < 0 || form.seuilMoyennePassage > 20) {
      return 'Le seuil de passage doit être compris entre 0 et 20.'
    }
    if (
      form.seuilMoyenneRattrapage < 0 ||
      form.seuilMoyenneRattrapage > form.seuilMoyennePassage
    ) {
      return 'Le seuil de rattrapage doit être inférieur ou égal au seuil de passage.'
    }
    if (form.creditsMinPourcent < 0 || form.creditsMinPourcent > 100) {
      return 'Le pourcentage de crédits minimum doit être compris entre 0 et 100.'
    }
    if (form.limiteRedoublements < 0) {
      return 'La limite de redoublements doit être un entier positif ou nul.'
    }
    if (form.regime !== 'STRICT' && form.regime !== 'COMPENSATION') {
      return 'Le régime doit être STRICT ou COMPENSATION.'
    }
    return null
  }, [form])

  // ─── Mutation : PUT /regles-passage ───
  const updateMutation = useMutation({
    mutationFn: async (body: UpdateReglesPassageBody) => {
      const res = await fetch(
        `/api/etablissements/${etablissementId}/regles-passage`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'same-origin',
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(
          err?.error ?? 'Erreur lors de la mise à jour des règles de passage',
        )
      }
      return (await res.json()) as ReglesPassage
    },
    onSuccess: (data) => {
      // Invalidation locale (refresh ce composant + la page Clôture qui
      // affiche les règles en read-only + la preview qui dépend des règles).
      queryClient.invalidateQueries({
        queryKey: ['regles-passage', etablissementId],
      })
      // Broad prefix : toutes les queries ['cloture-annee-preview', ...] (peu
      // importe l'année source) doivent se rafraîchir car la décision suggérée
      // change si les seuils changent.
      queryClient.invalidateQueries({
        queryKey: ['cloture-annee-preview'],
        // exact: false (défaut) → match par prefix, invalide toutes les variantes
      })
      // Ré-hydrate le form avec la réponse (timestamps + id à jour).
      setForm({
        seuilMoyennePassage: data.seuilMoyennePassage,
        seuilMoyenneRattrapage: data.seuilMoyenneRattrapage,
        creditsMinPourcent: data.creditsMinPourcent,
        regime: data.regime,
        limiteRedoublements: data.limiteRedoublements,
      })
      toast.success('Règles de passage mises à jour', {
        description:
          'Les nouveaux seuils seront appliqués lors de la prochaine clôture d\'année.',
      })
    },
    onError: (err: Error) => {
      toast.error('Erreur de sauvegarde', {
        description: err.message,
      })
    },
  })

  const handleSave = () => {
    if (validationError) {
      toast.error('Formulaire invalide', { description: validationError })
      return
    }
    updateMutation.mutate(form)
  }

  const handleReset = () => {
    if (reglesQuery.data) {
      setForm({
        seuilMoyennePassage: reglesQuery.data.seuilMoyennePassage,
        seuilMoyenneRattrapage: reglesQuery.data.seuilMoyenneRattrapage,
        creditsMinPourcent: reglesQuery.data.creditsMinPourcent,
        regime: reglesQuery.data.regime,
        limiteRedoublements: reglesQuery.data.limiteRedoublements,
      })
    }
  }

  // ─── Render ───

  const isLoading = reglesQuery.isLoading
  const isError = reglesQuery.isError
  const isSaving = updateMutation.isPending

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* ─── Carte d'introduction ─── */}
      <Card className="border-l-4 border-l-info/40 bg-info/5">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 shrink-0">
            <Info className="h-5 w-5 text-info" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              Ces règles déterminent comment les étudiants sont promus ou
              redoublent à la fin de l&apos;année. Elles s&apos;appliquent à
              tous les niveaux (L1 → L2 → ... → Doctorat).
            </p>
            <p className="text-xs text-muted-foreground">
              Les modifications sont prises en compte lors de la prochaine
              clôture d&apos;année académique (page Clôture de l&apos;année).
              Les décisions individuelles déjà appliquées ne sont pas
              rétroactivement recalculées.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ─── États : loading / error ─── */}
      {isLoading && (
        <Card>
          <CardHeader>
            <PulseSkeleton className="h-6 w-64" />
            <PulseSkeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <PulseSkeleton className="h-4 w-32" />
                  <PulseSkeleton className="h-10 w-full" />
                  <PulseSkeleton className="h-3 w-48" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="mt-3 text-base font-display font-semibold tracking-tight">
              Impossible de charger les règles de passage
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {reglesQuery.error instanceof Error
                ? reglesQuery.error.message
                : 'Veuillez réessayer dans un instant.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => reglesQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Formulaire ─── */}
      {!isLoading && !isError && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <SlidersHorizontal className="h-5 w-5 text-success-text" />
              Configuration des seuils
            </CardTitle>
            <CardDescription className="text-xs">
              Ajustez les 5 paramètres ci-dessous selon la politique
              pédagogique de votre établissement. Tous les champs sont
              obligatoires.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* ─── Seuil Moyenne Passage ─── */}
              <div className="space-y-2">
                <Label htmlFor="regles-seuil-passage" className="flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                  Seuil Moyenne Passage
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="regles-seuil-passage"
                  type="number"
                  step={0.5}
                  min={0}
                  max={20}
                  value={form.seuilMoyennePassage}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      seuilMoyennePassage: parseFloat(e.target.value) || 0,
                    }))
                  }
                  disabled={isSaving}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Moyenne minimum pour être promu (ex: 10/20).
                </p>
              </div>

              {/* ─── Seuil Moyenne Rattrapage ─── */}
              <div className="space-y-2">
                <Label htmlFor="regles-seuil-rattrapage" className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-warning" />
                  Seuil Moyenne Rattrapage
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="regles-seuil-rattrapage"
                  type="number"
                  step={0.5}
                  min={0}
                  max={form.seuilMoyennePassage}
                  value={form.seuilMoyenneRattrapage}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      seuilMoyenneRattrapage: parseFloat(e.target.value) || 0,
                    }))
                  }
                  disabled={isSaving}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Moyenne minimum pour éviter le redoublement (ex: 8/20). Doit
                  être ≤ au seuil de passage.
                </p>
              </div>

              {/* ─── Crédits Min (%) ─── */}
              <div className="space-y-2">
                <Label htmlFor="regles-credits-min" className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-info" />
                  Crédits Min. (%)
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="regles-credits-min"
                  type="number"
                  min={0}
                  max={100}
                  value={form.creditsMinPourcent}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      creditsMinPourcent: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  disabled={isSaving}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Pourcentage minimum de crédits ECTS à valider (ex: 60%).
                </p>
              </div>

              {/* ─── Régime ─── */}
              <div className="space-y-2">
                <Label htmlFor="regles-regime" className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  Régime
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.regime}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, regime: val }))
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger id="regles-regime" className="w-full">
                    <SelectValue placeholder="Sélectionner un régime" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STRICT">STRICT</SelectItem>
                    <SelectItem value="COMPENSATION">COMPENSATION</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  STRICT = toutes les UE doivent être validées ; COMPENSATION =
                  compensation entre UE.
                </p>
              </div>

              {/* ─── Limite Redoublements ─── */}
              <div className="space-y-2">
                <Label htmlFor="regles-limite-redoublements" className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  Limite Redoublements
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="regles-limite-redoublements"
                  type="number"
                  min={0}
                  max={5}
                  value={form.limiteRedoublements}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      limiteRedoublements: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  disabled={isSaving}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Nombre maximum de redoublements autorisés (ex: 2). Au-delà,
                  l&apos;étudiant est orienté ou exclu.
                </p>
              </div>
            </div>

            {/* ─── Validation error (inline) ─── */}
            {validationError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{validationError}</p>
              </div>
            )}

            <Separator />

            {/* ─── Footer : état + actions ─── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {reglesQuery.data && (
                  <>
                    <Badge variant="outline" className="font-mono">
                      Dernière maj:{' '}
                      {new Date(reglesQuery.data.updatedAt).toLocaleDateString(
                        'fr-FR',
                        {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      )}
                    </Badge>
                    {hasChanges && (
                      <Badge
                        variant="outline"
                        className="border-warning/40 text-warning"
                      >
                        Modifications non enregistrées
                      </Badge>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={isSaving || !hasChanges}
                  className="gap-1.5"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={
                    isSaving || !hasChanges || !!validationError
                  }
                  className="gap-1.5 bg-success hover:bg-success/90"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enregistrement…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Enregistrer
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
