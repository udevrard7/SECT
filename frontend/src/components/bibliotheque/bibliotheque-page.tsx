'use client'

// ════════════════════════════════════════════════════════════════════
// BibliothequePage — Bibliothèque numérique (ADR-0007, P1)
// ════════════════════════════════════════════════════════════════════
// Couche NORMATIVE du Système d'Évaluation (étage 0 — transposition
// didactique) : référentiels officiels, ouvrages de référence, recherche
// académique, pratique professionnelle. Le livre NE GÉNÈRE JAMAIS de
// questions (invariant I1) — il référence (I2).
//
// G1 (gouvernance validée) : dépôt réservé à l'ADMIN — la page affiche
// les boutons de dépôt/édition/corbeille uniquement pour ce rôle ; la
// défense réelle est le RLS (policies Ouvrage_*, migration 000123).
//
// Backend matché (transport/http/ouvrage_handlers.go + ouvrage_lecture_handlers.go) :
//   GET    /api/ouvrages?q&categorie&filiereId&niveau&page&limit
//          &includeDeleted          → OuvrageListResult { ouvrages, total, page, limit }
//   GET    /api/ouvrages/{id}       → { ouvrage }
//   GET    /api/ouvrages/{id}/fichier → { url } (présignée 15 min,
//                                     AuditLog OUVRAGE_LECTURE)
//   POST   /api/ouvrages (multipart, ADMIN) → { ouvrage } (201)
//   PATCH  /api/ouvrages/{id} (ADMIN) → { ouvrage } — tri-state :
//                                     absent=inchangé, null=unset DB,
//                                     valeur=nouvelle valeur
//   DELETE /api/ouvrages/{id} (ADMIN, soft) → { message }
//   POST   /api/ouvrages/{id}/restore (ADMIN) → { ouvrage }
//
// SECT-BIBLIO-P2 (ADR-0007 §P2 — lecture mesurée) :
//   GET    /api/ouvrages/{id}/lecture  → { lecture: OuvrageLecture | null }
//                                     (null = première lecture ; 404 si
//                                     l'ouvrage est invisible — jamais de
//                                     fuite d'existence)
//   PUT    /api/ouvrages/{id}/lecture  → { lecture } — télémétrie :
//                                     tempsDeltaSec (incrément), pagesVues
//                                     (delta fusionné serveur), dernierePage
//                                     (marque-page DÉCLARATIF)
//   GET    /api/etablissements/{id}/bibliotheque-activite (ENS/RESP/ADMIN)
//                                     → { etablissementId, activite[] } —
//                                     agrégats SECURITY DEFINER cloisonnés
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Library,
  Plus,
  Search,
  Edit3,
  Trash2,
  RotateCcw,
  BookOpen,
  FileText,
  ExternalLink,
  Loader2,
  X,
  AlertTriangle,
  ShieldAlert,
  Scale,
  Download,
  Filter,
  CalendarClock,
  Gavel,
  Activity,
  Bookmark,
  Users,
  Timer,
  Eye,
  // SECT-BIBLIO-P4 (ADR-0008) : dimension sociale.
  BellPlus,
  BellRing,
  Inbox,
  MessageSquareText,
  // SECT-BIBLIO-5 (000137) : visibilité 3 niveaux + analyse IA.
  Globe,
  Building2,
  GraduationCap,
  Sparkles,
  BadgeCheck,
  // SECT-BIBLIO-6 : relance de l'analyse IA.
  RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDateUTC } from '@/lib/date-utils'
import { StatCard, EntityCard, PulseSkeleton } from '@/components/ds'
// SECT-BIBLIO-P3 (ADR-0007 §P3) : la déclaration des 5 minutes —
// l'IA propose (retrieval thèmes), l'enseignant décide.
import { AlignementsView } from './alignements-view'
// SECT-BIBLIO-P4 (ADR-0008) : dimension sociale — file de
// propositions G1 (RESPONSABLE→ADMIN) + annotations du lecteur.
import { PropositionsView } from './propositions-view'
import { AnnotationsPanel } from './annotations-panel'
// SECT-RBAC-AUDITS (ADR-0009) : carte d'orientation mode assistance
// pour l'ADMIN global sur les audits par établissement.
import { AssistancePrompt } from './assistance-prompt'
import { toast } from 'sonner'
import {
  type Ouvrage,
  type CategorieOuvrage,
  type OuvrageListResult,
  type OuvrageLecture,
  type RecordLecturePayload,
  type OuvrageActivite,
  type BibliothequeActiviteResult,
  type OuvrageVeille,
  type AnalyseOuvrageResult,
  type VisibiliteOuvrage,
  type OuvrageClasseRef,
  CATEGORIES_OUVRAGE,
  NIVEAUX_ETUDE,
  categorieLabel,
  visibiliteOuvrageLabel,
  visibiliteOuvrageDescription,
  parseAuteurs,
  tailleAffichable,
  tempsAffichable,
} from '@/lib/ouvrages-types'

// ─── Types locaux (UI) ───

interface FiliereOption {
  id: string
  nom: string
  code?: string | null
}

interface LecteurState {
  ouvrage: Ouvrage
  /** URL présignée SANS fragment (base, jamais altérée). */
  baseUrl: string | null
  /** URL effective de l'iframe (base + #page=N — le fragment n'est JAMAIS
   *  signé : l'ajouter ne casse pas la signature R2). */
  url: string | null
  loading: boolean
  error: string | null
  /** Progression chargée en parallèle du fichier (null = 1re lecture). */
  lecture: OuvrageLecture | null
  /** Page de reprise appliquée au fragment (null = ouverture page 1). */
  reprisePage: number | null
}

// Variant de badge par catégorie (poids normatif — cf. ADR §Taxonomie).
// NB : EntityCard n'a pas de variant 'info' — recherche → 'success'.
const BADGE_VARIANTS: Record<
  CategorieOuvrage,
  'primary' | 'secondary' | 'success' | 'warning'
> = {
  REFERENTIEL_OFFICIEL: 'primary',
  OUVRAGE_REFERENCE: 'secondary',
  RECHERCHE_ACADEMIQUE: 'success',
  PRATIQUE_PROFESSIONNELLE: 'warning',
}

const MAX_TAILLE_FICHIER = 100 * 1024 * 1024 // 100 Mo (domain.MaxTailleOuvrage)

// SECT-BIBLIO-5 (tâche 2) : ligne de preuve sous un champ pré-rempli par
// l'IA — confiance % + extrait source. L'humain voit POURUQUOI la valeur
// est proposée et peut la corriger (human-in-the-loop).
function LigneIA({
  champ,
}: {
  champ?: { valeur: string; confiance: number; preuve?: string }
}) {
  if (!champ || !champ.valeur || champ.confiance <= 0) return null
  const preuve = champ.preuve ?? ''
  return (
    <p className="text-[11px] leading-snug text-muted-foreground flex items-start gap-1">
      <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
      <span>
        IA · {champ.confiance} %
        {preuve
          ? ` — « ${preuve.slice(0, 90)}${preuve.length > 90 ? '…' : ''} »`
          : ''}
      </span>
    </p>
  )
}

// ════════════════════════════════════════════════════════════════════
// BibliothequePage
// ════════════════════════════════════════════════════════════════════

export function BibliothequePage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const isAdmin = user?.role === 'ADMIN'
  const estResponsable = user?.role === 'RESPONSABLE'
  const estEnseignant = user?.role === 'ENSEIGNANT'
  // SECT-BIBLIO-5 (000137) : dépôt élargi — ADMIN (catalogue commun
  // PLATEFORME), RESPONSABLE (son établissement), ENSEIGNANT (ses
  // classes, brouillon validé par le responsable). L'étudiant reste
  // lecteur. Le périmètre est DÉRIVÉ DU RÔLE côté serveur — jamais choisi.
  const peutDeposer = isAdmin || estResponsable || estEnseignant
  // L'ADMIN en mode assistance agit sur son établissement courant ; l'ADMIN
  // global dépose dans le catalogue commun (PLATEFORME, 000137 — pour TOUS
  // les clients SECT, corrige « destiné à une seule université »).
  const adminAssistance = isAdmin && !!user?.etablissementId

  // ─── SECT-BIBLIO-P2 : vue Catalogue / Activité ───
  // L'activité de lecture est une vue enseignante (ADR-0007 §P2) :
  // ENS/RESP/ADMIN-assistance voient LEUR établissement (ADR-0009 —
  // l'ADMIN global est orienté vers le mode assistance, carte dédiée).
  const peutVoirActivite =
    user?.role === 'ENSEIGNANT' ||
    user?.role === 'RESPONSABLE' ||
    user?.role === 'ADMIN'
  // SECT-BIBLIO-P3 : la déclaration d'alignement est l'acte de
  // L'ENSEIGNANT sur SON support (ADR-0007 §P3) — vue réservée ENS.
  const peutDeclarer = user?.role === 'ENSEIGNANT'
  // SECT-BIBLIO-P4 : file de propositions G1 — le RESPONSABLE
  // propose, l'ADMIN tranche (les deux voient la file).
  const peutProposer = user?.role === 'RESPONSABLE' || isAdmin
  const [vue, setVue] = useState<
    'catalogue' | 'activite' | 'alignements' | 'propositions'
  >('catalogue')
  // SECT-RBAC-AUDITS (ADR-0009) : l'activité sonde uniquement l'étab des
  // claims — DÉRIVÉ du store (pas de state : toujours frais après entrée
  // en mode assistance) ; plus de sélecteur global ADMIN.
  const activiteEtab = user?.etablissementId ?? ''

  // ─── Filtres catalogue ───
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('') // debouncé
  const [categorie, setCategorie] = useState<string>('toutes')
  const [filiereFiltre, setFiliereFiltre] = useState<string>('toutes')
  const [niveauFiltre, setNiveauFiltre] = useState<string>('tous')
  // SECT-BIBLIO-5 (000137) : filtre provenance (PLATEFORME /
  // ETABLISSEMENT / CLASSE).
  const [provenanceFiltre, setProvenanceFiltre] = useState<string>('toutes')
  const [page, setPage] = useState(1)
  const [corbeille, setCorbeille] = useState(false) // ADMIN : voir la corbeille
  // SECT-BIBLIO-P4 : veilles thématiques (alertes nouveautés).
  const [veilleEnCours, setVeilleEnCours] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const resetFiltres = () => {
    setSearchInput('')
    setCategorie('toutes')
    setFiliereFiltre('toutes')
    setNiveauFiltre('tous')
    setProvenanceFiltre('toutes')
    setPage(1)
  }
  const filtresActifs =
    search !== '' ||
    categorie !== 'toutes' ||
    filiereFiltre !== 'toutes' ||
    niveauFiltre !== 'tous' ||
    provenanceFiltre !== 'toutes'

  // ─── SECT-BIBLIO-P4 : veilles de l'utilisateur (chips sous les filtres) ───
  const veillesQuery = useQuery({
    queryKey: ['ouvrages-veilles'],
    queryFn: async () => {
      const res = await fetch('/api/ouvrages/veilles', {
        credentials: 'include',
      })
      if (!res.ok) return []
      const body = await res.json().catch(() => ({}))
      return (body?.veilles ?? []) as OuvrageVeille[]
    },
    staleTime: 60_000,
  })

  const creerVeille = async () => {
    const terme = search.trim()
    if (terme.length < 2) {
      toast.error('Terme trop court', {
        description: 'Saisissez d’abord une recherche (2 caractères minimum).',
      })
      return
    }
    setVeilleEnCours(true)
    try {
      const res = await fetch('/api/ouvrages/veilles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          terme,
          categorie: categorie !== 'toutes' ? categorie : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['ouvrages-veilles'] })
      toast.success('Alerte créée', {
        description: `Vous serez notifié quand un ouvrage matchant « ${terme} » sera déposé.`,
      })
    } catch (err) {
      toast.error('Alerte impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setVeilleEnCours(false)
    }
  }

  const supprimerVeille = async (id: string) => {
    try {
      const res = await fetch(`/api/ouvrages/veilles/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['ouvrages-veilles'] })
    } catch (err) {
      toast.error('Suppression impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    }
  }

  // SECT-BIBLIO-P4 : count EN_ATTENTE pour le badge du toggle
  // Propositions (queryKey partagée avec la vue — TanStack déduplique).
  const propositionsCountQuery = useQuery({
    queryKey: ['ouvrages-propositions'],
    queryFn: async () => {
      const res = await fetch(
        '/api/ouvrages/propositions?statut=EN_ATTENTE&limit=1',
        { credentials: 'include' },
      )
      if (!res.ok) return { propositions: [], total: 0 }
      return res.json()
    },
    enabled: peutProposer,
    staleTime: 60_000,
  })
  const nbEnAttente = propositionsCountQuery.data?.total ?? 0

  // ─── Query catalogue ───
  const params = new URLSearchParams()
  if (search) params.set('q', search)
  if (categorie !== 'toutes') params.set('categorie', categorie)
  if (filiereFiltre !== 'toutes') params.set('filiereId', filiereFiltre)
  if (niveauFiltre !== 'tous') params.set('niveau', niveauFiltre)
  if (provenanceFiltre !== 'toutes') params.set('visibility', provenanceFiltre)
  params.set('page', String(page))
  params.set('limit', '12')
  if (corbeille && isAdmin) params.set('includeDeleted', 'true')

  const ouvragesQuery = useQuery<OuvrageListResult>({
    queryKey: ['ouvrages', params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/ouvrages?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      return res.json()
    },
    staleTime: 60_000,
  })

  const ouvrages = ouvragesQuery.data?.ouvrages ?? []
  const total = ouvragesQuery.data?.total ?? 0
  const pageCourante = ouvragesQuery.data?.page ?? 1
  const limit = ouvragesQuery.data?.limit ?? 12

  // ─── Query filières (options select — visible selon RLS Filiere_select ;
  // un échec renvoie simplement une liste vide, le filtre est optionnel) ───
  const filieresQuery = useQuery<FiliereOption[]>({
    queryKey: ['filieres-bibliotheque'],
    queryFn: async () => {
      const res = await fetch('/api/filieres', { credentials: 'include' })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data?.filieres) ? data.filieres : []
    },
    staleTime: 5 * 60_000,
  })

  // ─── Query établissements : SUPPRIMÉ (SECT-BIBLIO-8) — ne servait
  // qu'au select établissement du form dépôt (ADMIN global), champ que
  // le serveur ignore de toute façon (deriveScope écrase
  // etablissementId) — plus de requête /api/etablissements au montage. ───

  // ─── SECT-BIBLIO-5 (000137) : classes de l'enseignant — sélecteur
  // « classes destinatrices » du formulaire de dépôt (le serveur
  // intersecte de toute façon : usurpation impossible). ───
  const mesClassesQuery = useQuery<OuvrageClasseRef[]>({
    queryKey: ['ouvrages-mes-classes'],
    queryFn: async () => {
      const res = await fetch('/api/ouvrages/mes-classes', {
        credentials: 'include',
      })
      if (!res.ok) return []
      const body = await res.json().catch(() => ({}))
      return (body?.classes ?? []) as OuvrageClasseRef[]
    },
    enabled: estEnseignant,
    staleTime: 5 * 60_000,
  })
  const mesClasses = mesClassesQuery.data ?? []

  // ─── SECT-BIBLIO-P2 : activité de lecture (vue enseignante) ───
  // ADR-0009 : l'étab sondé est toujours celui des claims (dérivé du
  // store ci-dessus) ; l'ADMIN global voit la carte mode assistance.
  const activiteQuery = useQuery<BibliothequeActiviteResult>({
    queryKey: ['bibliotheque-activite', activiteEtab],
    queryFn: async () => {
      const res = await fetch(
        `/api/etablissements/${activiteEtab}/bibliotheque-activite`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      return res.json()
    },
    enabled: vue === 'activite' && peutVoirActivite && !!activiteEtab,
    staleTime: 60_000,
  })

  // Agrégats du panneau (calculés depuis les lignes par ouvrage).
  const activiteStats = useMemo(() => {
    const rows: OuvrageActivite[] = activiteQuery.data?.activite ?? []
    const lus = rows.filter((r) => r.nbLecteurs > 0)
    return {
      ouvrages: rows.length,
      ouvragesLus: lus.length,
      lectures: rows.reduce((s, r) => s + r.nbLecteurs, 0),
      tempsTotalSec: rows.reduce((s, r) => s + r.tempsTotalSec, 0),
      pagesVues: rows.reduce((s, r) => s + r.pagesVuesTotal, 0),
      derniere: lus.reduce<string | null>(
        (m, r) =>
          r.derniereActivite && (!m || r.derniereActivite > m)
            ? r.derniereActivite
            : m,
        null,
      ),
    }
  }, [activiteQuery.data])

  // ─── Stats (page courante pour les catégories — P1 sans endpoint dédié) ───
  const stats = useMemo(() => {
    const referentiels = ouvrages.filter(
      (o) => o.categorie === 'REFERENTIEL_OFFICIEL',
    ).length
    const ouvragesRef = ouvrages.filter(
      (o) => o.categorie === 'OUVRAGE_REFERENCE',
    ).length
    const recherche = ouvrages.filter(
      (o) =>
        o.categorie === 'RECHERCHE_ACADEMIQUE' ||
        o.categorie === 'PRATIQUE_PROFESSIONNELLE',
    ).length
    return { referentiels, ouvragesRef, recherche }
  }, [ouvrages])

  // ─── Lecteur in-browser (URL présignée courte durée) ───
  const [lecteur, setLecteur] = useState<LecteurState | null>(null)
  // Numéro saisi dans le marque-page déclaratif (prérempli à l'ouverture).
  const [marquePageInput, setMarquePageInput] = useState('1')

  // Ouverture : fichier ET progression en PARALLÈLE (P2) — la reprise à la
  // page exacte est appliquée via le fragment #page=N (le fragment n'est
  // jamais signé : l'ajouter ne casse pas la présignature R2).
  const ouvrirLecteur = async (o: Ouvrage) => {
    setLecteur({
      ouvrage: o,
      baseUrl: null,
      url: null,
      loading: true,
      error: null,
      lecture: null,
      reprisePage: null,
    })
    try {
      const [fichierRes, lectureRes] = await Promise.all([
        fetch(`/api/ouvrages/${o.id}/fichier`, { credentials: 'include' }),
        fetch(`/api/ouvrages/${o.id}/lecture`, { credentials: 'include' }),
      ])
      if (!fichierRes.ok) {
        const body = await fichierRes.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${fichierRes.status}`)
      }
      const fichierData = await fichierRes.json()
      // Progression : non bloquante (404/erreur → première lecture). Seule
      // l'URL du fichier peut faire échouer l'ouverture du lecteur.
      let lecture: OuvrageLecture | null = null
      if (lectureRes.ok) {
        const ld = await lectureRes.json().catch(() => null)
        lecture = ld?.lecture ?? null
      }
      const reprise = lecture && lecture.dernierePage > 1 ? lecture.dernierePage : null
      const url = reprise ? `${fichierData.url}#page=${reprise}` : (fichierData.url as string)
      setMarquePageInput(String(lecture?.dernierePage ?? 1))
      setLecteur({
        ouvrage: o,
        baseUrl: fichierData.url,
        url,
        loading: false,
        error: null,
        lecture,
        reprisePage: reprise,
      })
    } catch (err) {
      setLecteur({
        ouvrage: o,
        baseUrl: null,
        url: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Erreur inconnue',
        lecture: null,
        reprisePage: null,
      })
    }
  }

  const fermerLecteur = () => {
    // Le dernier battement de cœur part en keepalive (survit à la fermeture
    // du dialog) ; le cleanup de l'effet de télémétrie fait un 2e flush
    // no-op de sécurité.
    flushTelemetrie(true)
    setLecteur(null)
  }

  // Saute à une page donnée (recharge l'iframe — le fragment change).
  const allerPage = (page: number) => {
    setLecteur((prev) =>
      prev && prev.baseUrl
        ? {
            ...prev,
            url: `${prev.baseUrl}#page=${page}`,
            reprisePage: page,
          }
        : prev,
    )
  }

  // ─── Télémétrie de lecture (P2) — useRef + visibilitychange + 30 s ───
  // Le temps ne compte QUE si le document est visible (onglet actif) ET le
  // lecteur ouvert ; les heartbeats partent toutes les 30 s, le flush final
  // en fetch keepalive survit à la fermeture. Best-effort : une erreur
  // réseau n'interrompt JAMAIS la lecture.
  interface TelemetrieAccum {
    visibleMs: number
    pagesVues: Record<string, number>
    dernierePage: number | null
    lastTick: number
    visible: boolean
  }
  const TELEMETRIE_INTERVAL_MS = 30_000
  const telemetrieRef = useRef<TelemetrieAccum | null>(null)
  const lecteurOuvrageIdRef = useRef<string | null>(null)

  const tickVisible = (acc: TelemetrieAccum) => {
    const now = Date.now()
    if (acc.visible) acc.visibleMs += now - acc.lastTick
    acc.lastTick = now
  }

  const flushTelemetrie = useCallback((keepalive: boolean) => {
    const acc = telemetrieRef.current
    const ouvrageId = lecteurOuvrageIdRef.current
    if (!acc || !ouvrageId) return
    tickVisible(acc)
    const tempsDeltaSec = Math.floor(acc.visibleMs / 1000)
    acc.visibleMs -= tempsDeltaSec * 1000 // conserve la fraction < 1 s
    const hasPages = Object.keys(acc.pagesVues).length > 0
    const page = acc.dernierePage
    if (tempsDeltaSec === 0 && !hasPages && page === null) return
    const body: RecordLecturePayload = { tempsDeltaSec }
    if (hasPages) body.pagesVues = acc.pagesVues
    if (page !== null) body.dernierePage = page
    acc.pagesVues = {}
    acc.dernierePage = null
    fetch(`/api/ouvrages/${ouvrageId}/lecture`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      keepalive,
    }).catch(() => {
      // best-effort : la télémétrie ne doit jamais casser la lecture
    })
  }, [])

  // Cycle de vie de la télémétrie : démarrage à l'ouverture de l'URL,
  // arrêt + flush final à la fermeture/changement.
  useEffect(() => {
    if (!lecteur?.url) return
    lecteurOuvrageIdRef.current = lecteur.ouvrage.id
    const acc: TelemetrieAccum = {
      visibleMs: 0,
      pagesVues: {},
      dernierePage: null,
      lastTick: Date.now(),
      visible: document.visibilityState === 'visible',
    }
    telemetrieRef.current = acc

    const onVisibility = () => {
      tickVisible(acc)
      acc.visible = document.visibilityState === 'visible'
    }
    document.addEventListener('visibilitychange', onVisibility)
    const interval = window.setInterval(
      () => flushTelemetrie(false),
      TELEMETRIE_INTERVAL_MS,
    )

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
      flushTelemetrie(true)
      lecteurOuvrageIdRef.current = null
      telemetrieRef.current = null
    }
  }, [lecteur?.url, lecteur?.ouvrage.id, flushTelemetrie])

  // SECT-BIBLIO-P4 : panneau d'annotations du lecteur (aside droite).
  const [panneauAnnotations, setPanneauAnnotations] = useState(false)

  // Marque-page DÉCLARATIF : l'iframe cross-origin ne permet pas de lire la
  // page courante du lecteur PDF natif — c'est le lecteur qui déclare où il
  // en est (bouton « Marquer »). Envoie immédiat (pas d'attente du heartbeat).
  const marquerPage = () => {
    const acc = telemetrieRef.current
    if (!acc) return
    const page = parseInt(marquePageInput, 10)
    if (Number.isNaN(page) || page < 1) {
      toast.error('Numéro de page invalide', {
        description: 'Entrez le numéro de la page que vous êtes en train de lire.',
      })
      return
    }
    const key = String(page)
    acc.pagesVues[key] = (acc.pagesVues[key] ?? 0) + 1
    acc.dernierePage = page
    flushTelemetrie(false)
    // Mise à jour locale immédiate (chip) — le serveur fait foi à la
    // prochaine ouverture.
    setLecteur((prev) =>
      prev
        ? {
            ...prev,
            reprisePage: page,
            lecture: prev.lecture
              ? { ...prev.lecture, dernierePage: page }
              : prev.lecture,
          }
        : prev,
    )
    toast.success(`Marque-page enregistré — page ${page}`, {
      description: 'Vous reprendrez à cette page à la prochaine ouverture.',
    })
  }

  const telecharger = async (o: Ouvrage) => {
    if (!o.telechargementAutorise) return
    try {
      const res = await fetch(`/api/ouvrages/${o.id}/fichier`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank')
    } catch {
      toast.error('Téléchargement impossible', {
        description: 'La génération du lien sécurisé a échoué.',
      })
    }
  }

  // ─── Dialog dépôt (ADMIN/RESPONSABLE/ENSEIGNANT — 000137) ───
  const [depotOuvert, setDepotOuvert] = useState(false)
  const [fichier, setFichier] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [depotEnCours, setDepotEnCours] = useState(false)
  // SECT-BIBLIO-P4 : dépôt pré-lié à une proposition ACCEPTEE (file G1) —
  // pré-remplit le formulaire, ajoute propositionId au FormData.
  const [depotProposition, setDepotProposition] = useState<{
    id: string
    titre: string
  } | null>(null)

  // SECT-BIBLIO-5 (tâche 2 — 000137) : analyse IA du PDF. L'IA PROPOSE
  // (valeur + confiance + preuve par champ), l'HUMAIN dispose — les
  // champs pré-remplis restent éditables, les boutons d'enregistrement
  // exigent les champs requis complétés par l'humain.
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [analyse, setAnalyse] = useState<AnalyseOuvrageResult | null>(null)
  // SECT-BIBLIO-6 : message d'erreur réseau/timeout (bouton « Relancer »).
  // Distinct de `analyse` (réponse backend {disponible:false, raison}) —
  // ici c'est un échec transport (502, timeout, réseau) : l'utilisateur
  // doit pouvoir relancer SANS re-choisir le fichier.
  const [analyseErreur, setAnalyseErreur] = useState<string | null>(null)
  // SECT-BIBLIO-6 : anti-course — changer de fichier annule l'analyse du
  // précédent (sinon la réponse lente du 1er PDF pré-remplit le formulaire
  // du 2e : métadonnées FAUSSES). AbortController + génération par requête.
  const analyseAbortRef = useRef<AbortController | null>(null)
  const analyseGenRef = useRef(0)
  // SECT-BIBLIO-5 (000137) : classes destinatrices sélectionnées
  // (ENSEIGNANT — intersection scellée serveur avec EnseignantFiliere).
  const [classesSelectionnees, setClassesSelectionnees] = useState<
    { filiereId: string; niveau: string }[]
  >([])

  const [fTitre, setFTitre] = useState('')
  const [fCategorie, setFCategorie] = useState<string>('')
  const [fLicence, setFLicence] = useState('')
  const [fFiliere, setFFiliere] = useState<string>('toutes')
  const [fNiveau, setFNiveau] = useState<string>('tous')
  const [fAuteurs, setFAuteurs] = useState('')
  const [fEditeur, setFEditeur] = useState('')
  const [fEdition, setFEdition] = useState('')
  const [fAnnee, setFAnnee] = useState('')
  const [fIsbn, setFIsbn] = useState('')
  const [fLangue, setFLangue] = useState('')
  const [fThemes, setFThemes] = useState('')
  const [fDescription, setFDescription] = useState('')
  const [fExpiration, setFExpiration] = useState('')

  const resetDepot = () => {
    setFichier(null)
    setFTitre('')
    setFCategorie('')
    setFLicence('')
    setFFiliere('toutes')
    setFNiveau('tous')
    setFAuteurs('')
    setFEditeur('')
    setFEdition('')
    setFAnnee('')
    setFIsbn('')
    setFLangue('')
    setFThemes('')
    setFDescription('')
    setFExpiration('')
    setDepotProposition(null)
    setAnalyse(null)
    setAnalyseEnCours(false)
    setAnalyseErreur(null)
    analyseAbortRef.current?.abort()
    analyseAbortRef.current = null
    setClassesSelectionnees([])
  }

  // SECT-BIBLIO-5 (tâche 2) : analyse IA du PDF — lancée automatiquement
  // au choix du fichier. PRÉ-REMPLIT le formulaire (valeur + confiance +
  // preuve), JAMAIS bloquante : indisponible → toast d'information et
  // saisie manuelle (le principe reste human-in-the-loop).
  // SECT-BIBLIO-6 : annulation de la requête précédente (anti-course
  // multi-fichiers), timeout client 110 s (le budget backend est 75 s —
  // cf. analyzeBudget, ouvrage_handlers.go) et message d'erreur avec
  // bouton « Relancer » (analyseErreur) au lieu d'un toast muet.
  const lancerAnalyse = async (f: File) => {
    // 1. Annule toute analyse en cours (nouveau fichier choisi).
    analyseAbortRef.current?.abort()
    const controller = new AbortController()
    analyseAbortRef.current = controller
    const gen = ++analyseGenRef.current

    setAnalyse(null)
    setAnalyseErreur(null)
    setAnalyseEnCours(true)
    // Filet de sécurité : le backend répond toujours en ≤ 75 s (budget
    // analyzeBudget) — 55 s couvre la latence CDN + marge.
    const timeout = setTimeout(() => controller.abort(), 110_000)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/ouvrages/analyze', {
        method: 'POST',
        body: fd,
        credentials: 'include',
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      const result = (await res.json()) as AnalyseOuvrageResult
      // Génération obsolète (un autre fichier a été choisi entre-temps) :
      // on ignore silencieusement — ne JAMAIS pré-remplir avec les
      // métadonnées d'un autre PDF.
      if (analyseGenRef.current !== gen) return
      setAnalyse(result)
      if (result.disponible) {
        // Pré-remplissage HUMAIN-ÉDITABLE (les champs restent modifiables).
        if (result.titre.valeur) setFTitre(result.titre.valeur)
        if (result.auteurs.valeur) setFAuteurs(result.auteurs.valeur)
        // SECT-BIBLIO-8 : la catégorie est PROPOSÉE par l'IA (suggestion
        // human-in-the-loop). Double garde : le backend valide déjà contre
        // l'enum, on re-vérifie côté client — une valeur inconnue n'est
        // simplement pas appliquée (l'humain garde le select sur « Choisir… »).
        const catIA = result.categorie?.valeur
        if (
          catIA &&
          CATEGORIES_OUVRAGE.some((c) => c.value === catIA)
        ) {
          setFCategorie(catIA)
        }
        if (result.editeur.valeur) setFEditeur(result.editeur.valeur)
        if (result.edition.valeur) setFEdition(result.edition.valeur)
        if (result.anneePublication.valeur) setFAnnee(result.anneePublication.valeur)
        if (result.isbn.valeur) setFIsbn(result.isbn.valeur)
        if (result.langue.valeur) setFLangue(result.langue.valeur)
        if (result.themes.valeur) setFThemes(result.themes.valeur)
        if (result.description.valeur) setFDescription(result.description.valeur)
        const remplis = Object.values(result).filter(
          (v) =>
            v &&
            typeof v === 'object' &&
            'valeur' in v &&
            String((v as { valeur?: string }).valeur ?? '').trim() !== '',
        ).length
        toast.success('Formulaire pré-rempli par l’IA', {
          description: `${remplis} champ(s) proposé(s) — vérifiez et complétez avant d’enregistrer (modèle ${result.modele ?? 'n/a'}, ${result.pagesAnalysees} page(s) analysée(s)).`,
        })
      } else {
        toast.info('Analyse IA indisponible', {
          description: `${result.raison ?? 'Analyse impossible'} — remplissez le formulaire manuellement.`,
        })
      }
    } catch (err) {
      // Erreur honnête : l'aide ne bloque JAMAIS le dépôt.
      if (analyseGenRef.current !== gen) return
      const msg =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'L’analyse a pris trop de temps (providers IA congestionnés ou indisponibles).'
          : err instanceof Error
            ? err.message
            : 'Erreur inconnue'
      setAnalyseErreur(msg)
      toast.info('Analyse IA impossible', {
        description: `${msg} — remplissez le formulaire manuellement ou relancez l’analyse.`,
      })
    } finally {
      clearTimeout(timeout)
      // Ne PAS remettre à false si une NOUVELLE analyse a déjà démarré.
      if (analyseGenRef.current === gen) setAnalyseEnCours(false)
    }
  }

  const onChoisirFichier = (f: File | null) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Format non supporté', {
        description: 'Seuls les fichiers PDF sont acceptés (P1).',
      })
      return
    }
    if (f.size > MAX_TAILLE_FICHIER) {
      toast.error('Fichier trop volumineux', {
        description: 'Taille maximale : 100 Mo.',
      })
      return
    }
    setFichier(f)
    // Tâche 2 : l'analyse IA part immédiatement (pré-remplissage
    // assisté pendant que l'utilisateur regarde le formulaire).
    lancerAnalyse(f)
  }

  // SECT-BIBLIO-6 : relance sans re-choisir le fichier (échec transport
  // ou analyse indisponible — providers congestionnés, cooldown passager).
  const relancerAnalyse = () => {
    if (!fichier || analyseEnCours) return
    lancerAnalyse(fichier)
  }

  // SECT-BIBLIO-6 : annule la requête d'analyse au démontage (évite un
  // setState sur composant démonté si l'utilisateur quitte le formulaire
  // pendant l'analyse).
  useEffect(() => {
    return () => {
      analyseAbortRef.current?.abort()
      analyseAbortRef.current = null
    }
  }, [])

  const soumettreDepot = async () => {
    if (!fTitre.trim()) {
      toast.error('Titre manquant')
      return
    }
    if (!fCategorie) {
      toast.error('Catégorie manquante')
      return
    }
    if (!fLicence.trim()) {
      toast.error('Licence / origine des droits requise', {
        description:
          "Garde-fou ADR-0007 : déclarez l'origine des droits (ex : œuvre propre, licence établissement, auteur).",
      })
      return
    }
    // SECT-BIBLIO-8 (000137) : plus d'établissement requis pour le
    // super admin — le serveur DÉRIVE le périmètre du rôle (ADMIN
    // global ⇒ catalogue commun PLATEFORME, etablissementId écrasé
    // à "" dans deriveScope). RESP/ENS : dérivé du rôle serveur.
    // ENSEIGNANT : au moins une classe destinataire (le serveur
    // ré-verifie l’intersection — usurpation impossible).
    if (estEnseignant && classesSelectionnees.length === 0) {
      toast.error('Classe destinataire manquante', {
        description:
          'Sélectionnez au moins une de vos classes : le document ne sera visible que de ses étudiants.',
      })
      return
    }
    if (!fichier) {
      toast.error('Fichier PDF manquant')
      return
    }

    setDepotEnCours(true)
    try {
      const fd = new FormData()
      fd.append('file', fichier)
      fd.append('titre', fTitre.trim())
      fd.append('categorie', fCategorie)
      fd.append('licenceOrigine', fLicence.trim())
      // etablissementId n'est PAS envoyé (SECT-BIBLIO-8) : le serveur
      // l'écrase systématiquement dans deriveScope (claims en mode
      // assistance, "" pour l'ADMIN global) — champ décoratif supprimé.
      if (fFiliere !== 'toutes') fd.append('filiereId', fFiliere)
      if (fNiveau !== 'tous') fd.append('niveau', fNiveau)
      if (fAuteurs.trim())
        fd.append(
          'auteurs',
          JSON.stringify(
            fAuteurs.split(/[;,]/).map((a) => a.trim()).filter(Boolean),
          ),
        )
      if (fEditeur.trim()) fd.append('editeur', fEditeur.trim())
      if (fEdition.trim()) fd.append('edition', fEdition.trim())
      if (fAnnee.trim()) fd.append('anneePublication', fAnnee.trim())
      if (fIsbn.trim()) fd.append('isbn', fIsbn.trim())
      if (fLangue.trim()) fd.append('langue', fLangue.trim())
      if (fThemes.trim())
        fd.append(
          'themes',
          JSON.stringify(
            fThemes.split(/[;,]/).map((t) => t.trim()).filter(Boolean),
          ),
        )
      if (fDescription.trim()) fd.append('description', fDescription.trim())
      if (fExpiration) fd.append('dateExpirationDroits', fExpiration)
      // P1 : lecture in-browser par défaut — le téléchargement est un
      // opt-in par ouvrage (PATCH telechargementAutorise).
      fd.append('telechargementAutorise', 'false')
      // SECT-BIBLIO-5 (000137) : ciblage classes de l'ENSEIGNANT.
      if (estEnseignant && classesSelectionnees.length > 0) {
        fd.append('classes', JSON.stringify(classesSelectionnees))
      }
      // SECT-BIBLIO-P4 : liaison à la proposition ACCEPTEE (file G1).
      if (depotProposition) fd.append('propositionId', depotProposition.id)

      const res = await fetch('/api/ouvrages', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      const dataDepot = await res.json().catch(() => ({}))
      await queryClient.invalidateQueries({ queryKey: ['ouvrages'] })
      if (depotProposition) {
        await queryClient.invalidateQueries({
          queryKey: ['ouvrages-propositions'],
        })
      }
      // SECT-BIBLIO-5 : le message suit le périmètre dérivé du rôle.
      const messageDepot = estEnseignant
        ? {
            titre: `« ${fTitre.trim()} » déposé en brouillon`,
            description:
              'Il sera visible de vos classes destinatrices dès validation par le responsable de votre établissement.',
          }
        : {
            titre: `« ${fTitre.trim()} » déposé`,
            description: estResponsable
              ? "L'ouvrage est disponible pour les membres de votre établissement."
              : adminAssistance
                ? "L'ouvrage est disponible pour les membres de l'établissement assisté."
                : 'L’ouvrage est disponible dans le catalogue commun à TOUS les établissements clients SECT.',
          }
      toast.success(messageDepot.titre, {
        description: messageDepot.description,
      })
      // P4 : la liaison proposition peut échouer APRÈS un dépôt réussi
      // (ex : proposition retranchée entre-temps) — avertissement honnête.
      if (dataDepot?.avertissement) {
        toast.warning('Liaison à la proposition', {
          description: dataDepot.avertissement,
        })
      }
      setDepotOuvert(false)
      resetDepot()
    } catch (err) {
      toast.error('Dépôt impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setDepotEnCours(false)
    }
  }

  // ─── Dialog édition (ADMIN, PATCH tri-state : null = unset) ───
  const [editionOuverte, setEditionOuverte] = useState(false)
  const [editionCible, setEditionCible] = useState<Ouvrage | null>(null)
  const [editionEnCours, setEditionEnCours] = useState(false)
  // champs édition (préremplis dans ouvrirEdition)
  const [eTitre, setETitre] = useState('')
  const [eCategorie, setECategorie] = useState<string>('')
  const [eLicence, setELicence] = useState('')
  const [eFiliere, setEFiliere] = useState<string>('toutes')
  const [eNiveau, setENiveau] = useState<string>('tous')
  const [eAuteurs, setEAuteurs] = useState('')
  const [eEditeur, setEEditeur] = useState('')
  const [eEdition, setEEdition] = useState('')
  const [eAnnee, setEAnnee] = useState('')
  const [eIsbn, setEIsbn] = useState('')
  const [eLangue, setELangue] = useState('')
  const [eThemes, setEThemes] = useState('')
  const [eDescription, setEDescription] = useState('')
  const [eExpiration, setEExpiration] = useState('')
  const [eExpirationPresente, setEExpirationPresente] = useState(true)
  const [eTelechargement, setETelechargement] = useState(false)

  const ouvrirEdition = (o: Ouvrage) => {
    setEditionCible(o)
    setETitre(o.titre)
    setECategorie(o.categorie)
    setELicence(o.licenceOrigine)
    setEFiliere(o.filiereId ?? 'toutes')
    setENiveau(o.niveau ?? 'tous')
    setEAuteurs(parseAuteurs(o.auteurs).join('; '))
    setEEditeur(o.editeur ?? '')
    setEEdition(o.edition ?? '')
    setEAnnee(o.anneePublication != null ? String(o.anneePublication) : '')
    setEIsbn(o.isbn ?? '')
    setELangue(o.langue ?? '')
    setEThemes(o.themes ? parseAuteurs(o.themes).join('; ') : '')
    setEDescription(o.description ?? '')
    const exp = o.dateExpirationDroits
      ? o.dateExpirationDroits.slice(0, 10)
      : ''
    setEExpiration(exp)
    setEExpirationPresente(!!exp)
    setETelechargement(o.telechargementAutorise)
    setEditionOuverte(true)
  }

  const soumettreEdition = async () => {
    if (!editionCible) return
    if (!eTitre.trim()) {
      toast.error('Le titre ne peut pas être vide')
      return
    }
    if (!eLicence.trim()) {
      toast.error('La licence ne peut pas être vide')
      return
    }

    setEditionEnCours(true)
    try {
      const auteursArr = eAuteurs.split(/[;,]/).map((a) => a.trim()).filter(Boolean)
      const themesArr = eThemes.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
      const body: Record<string, unknown> = {
        titre: eTitre.trim(),
        categorie: eCategorie,
        licenceOrigine: eLicence.trim(),
        // Tri-state : null = mettre NULL en DB (« toutes filières », etc.)
        filiereId: eFiliere === 'toutes' ? null : eFiliere,
        niveau: eNiveau === 'tous' ? null : eNiveau,
        auteurs: auteursArr.length ? JSON.stringify(auteursArr) : null,
        editeur: eEditeur.trim() || null,
        edition: eEdition.trim() || null,
        anneePublication: eAnnee.trim() ? Number(eAnnee.trim()) : null,
        isbn: eIsbn.trim() || null,
        langue: eLangue.trim() || null,
        themes: themesArr.length ? JSON.stringify(themesArr) : null,
        description: eDescription.trim() || null,
        dateExpirationDroits:
          eExpirationPresente && eExpiration ? eExpiration : null,
        telechargementAutorise: eTelechargement,
      }
      const res = await fetch(`/api/ouvrages/${editionCible.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Erreur ${res.status}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['ouvrages'] })
      toast.success('Ouvrage mis à jour')
      setEditionOuverte(false)
      setEditionCible(null)
    } catch (err) {
      toast.error('Modification impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setEditionEnCours(false)
    }
  }

  // ─── Corbeille / restauration ───
  const [confirmCible, setConfirmCible] = useState<Ouvrage | null>(null)

  const mettreEnCorbeille = async (o: Ouvrage) => {
    try {
      const res = await fetch(`/api/ouvrages/${o.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Erreur ${res.status}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['ouvrages'] })
      toast.success(`« ${o.titre} » déplacé vers la corbeille`)
    } catch (err) {
      toast.error('Suppression impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setConfirmCible(null)
    }
  }

  const restaurer = async (o: Ouvrage) => {
    try {
      const res = await fetch(`/api/ouvrages/${o.id}/restore`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Erreur ${res.status}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['ouvrages'] })
      toast.success(`« ${o.titre} » restauré`)
    } catch (err) {
      toast.error('Restauration impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    }
  }

  // ─── SECT-BIBLIO-5 (000137) : modération human-in-the-loop — le
  // RESPONSABLE publie les brouillons (dépôts enseignants) de SON
  // établissement ; l'ADMIN peut tout valider. Le serveur re-vérifie.
  const validerOuvrage = async (o: Ouvrage) => {
    try {
      const res = await fetch(`/api/ouvrages/${o.id}/valider`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Erreur ${res.status}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['ouvrages'] })
      toast.success(`« ${o.titre} » validé`, {
        description:
          'Le document est désormais visible des classes destinatrices.',
      })
    } catch (err) {
      toast.error('Validation impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    }
  }

  // SECT-BIBLIO-5 (000137) : droit de gestion approximé côté UI (la
  // DÉFENSE RÉELLE est la RLS serveur — canManageOuvrage + policies).
  const peutGererUI = (o: Ouvrage) =>
    isAdmin ||
    (estResponsable && o.etablissementId === user?.etablissementId) ||
    (estEnseignant && o.createdById === user?.id)
  const peutValiderUI = (o: Ouvrage) =>
    o.statut === 'BROUILLON' && !o.deletedAt && (isAdmin || estResponsable)

  // ─── Rendu carte ouvrage ───
  // SECT-BIBLIO-5 (000137) : badges de provenance (Globe/Building2/
  // GraduationCap — qui voit le document) et statut de modération.
  const ICONES_PROVENANCE: Record<
    VisibiliteOuvrage,
    typeof Globe
  > = {
    PLATEFORME: Globe,
    ETABLISSEMENT: Building2,
    CLASSE: GraduationCap,
  }
  const carteOuvrage = (o: Ouvrage, i: number) => {
    const enCorbeille = !!o.deletedAt
    const auteurs = parseAuteurs(o.auteurs)
    const IconeProvenance = ICONES_PROVENANCE[o.visibility] ?? Building2
    const classesAffichees = (o.classes ?? [])
      .map(
        (c) =>
          `${c.filiere?.nom ?? c.filiereId} · ${c.niveau}`,
      )
      .slice(0, 2)
    return (
      <EntityCard
        key={o.id}
        title={o.titre}
        subtitle={
          auteurs.length
            ? auteurs.slice(0, 2).join(', ') +
              (auteurs.length > 2 ? ' et al.' : '')
            : (o.editeur ?? '—')
        }
        thumbnailIcon={o.categorie === 'REFERENTIEL_OFFICIEL' ? Gavel : BookOpen}
        badge={{
          label: categorieLabel(o.categorie),
          variant: BADGE_VARIANTS[o.categorie],
        }}
        meta={`${o.filiere?.nom ?? 'Toutes filières'} · ${o.niveau ?? 'Tous niveaux'} · ${tailleAffichable(o.tailleFichier)}${o.anneePublication ? ` · ${o.anneePublication}` : ''}`}
        index={i}
      >
        {/* SECT-BIBLIO-5 : provenance + statut de modération. */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="gap-1 cursor-help"
              >
                <IconeProvenance className="h-3 w-3" />
                {visibiliteOuvrageLabel(o.visibility)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {visibiliteOuvrageDescription(o.visibility)}
            </TooltipContent>
          </Tooltip>
          {o.statut === 'BROUILLON' && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
            >
              À valider
            </Badge>
          )}
        </div>
        {/* SECT-BIBLIO-5 : classes destinatrices (visibility=CLASSE). */}
        {o.visibility === 'CLASSE' && classesAffichees.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2 flex flex-wrap gap-1">
            {classesAffichees.map((c) => (
              <Badge
                key={c}
                variant="secondary"
                className="font-normal"
              >
                <GraduationCap className="h-3 w-3 mr-1" />
                {c}
              </Badge>
            ))}
            {(o.classes ?? []).length > 2 && (
              <span className="text-muted-foreground">
                +{(o.classes ?? []).length - 2}
              </span>
            )}
          </p>
        )}
        {o.droitsExpires && (
          <Badge variant="destructive" className="mb-2">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Droits expirés — invisible des lecteurs
          </Badge>
        )}
        {enCorbeille && (
          <Badge variant="outline" className="mb-2">
            <Trash2 className="h-3 w-3 mr-1" />
            Dans la corbeille
          </Badge>
        )}
        {o.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {o.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-auto pt-2">
          <Button size="sm" onClick={() => ouvrirLecteur(o)} className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Lire
          </Button>
          {/* SECT-BIBLIO-5 : modération — publier un brouillon
              (RESPONSABLE de l'étab / ADMIN). */}
          {peutValiderUI(o) && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => validerOuvrage(o)}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              Valider
            </Button>
          )}
          {o.telechargementAutorise && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => telecharger(o)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Télécharger
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Téléchargement autorisé pour cet ouvrage
              </TooltipContent>
            </Tooltip>
          )}
          {peutGererUI(o) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="ml-auto">
                  Gérer
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => ouvrirEdition(o)}>
                  <Edit3 className="h-4 w-4 mr-2" /> Modifier
                </DropdownMenuItem>
                {enCorbeille ? (
                  <DropdownMenuItem onClick={() => restaurer(o)}>
                    <RotateCcw className="h-4 w-4 mr-2" /> Restaurer
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setConfirmCible(o)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Mettre en corbeille
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs">
                  Licence : {o.licenceOrigine.slice(0, 40)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </EntityCard>
    )
  }

  // ─── Rendu ───
  const premiere = (pageCourante - 1) * limit + (total > 0 ? 1 : 0)
  const derniere = Math.min(pageCourante * limit, total)
  const filieresOptions: FiliereOption[] = filieresQuery.data ?? []

  return (
    <div className="space-y-6">
      {/* Bandeau kente — signature Savane EdTech */}
      <div className="ds-kente-pattern border-b border-border bg-card">
        <div className="ds-kente-strip" aria-hidden="true" />
        <div className="px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Bibliothèque
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Référentiels officiels, ouvrages de référence, recherche
                académique et pratique professionnelle — la source normative
                partagée : catalogue commun SECT, documents de votre
                établissement et ouvrages de vos classes.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              {/* SECT-BIBLIO-P2 : vue Catalogue / Activité (vue enseignante) */}
              {peutVoirActivite && (
                <ToggleGroup
                  type="single"
                  value={vue}
                  onValueChange={(value) => {
                    if (value) setVue(value as typeof vue)
                  }}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="catalogue" className="gap-1.5">
                    <Library className="h-3.5 w-3.5" />
                    Catalogue
                  </ToggleGroupItem>
                  <ToggleGroupItem value="activite" className="gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Activité
                  </ToggleGroupItem>
                  {/* SECT-BIBLIO-P3 : déclaration d'alignement (ENS). */}
                  {peutDeclarer && (
                    <ToggleGroupItem value="alignements" className="gap-1.5">
                      <Scale className="h-3.5 w-3.5" />
                      Mes alignements
                    </ToggleGroupItem>
                  )}
                  {/* SECT-BIBLIO-P4 : file de propositions G1. */}
                  {peutProposer && (
                    <ToggleGroupItem value="propositions" className="gap-1.5">
                      <Inbox className="h-3.5 w-3.5" />
                      Propositions
                      {nbEnAttente > 0 && (
                        <Badge
                          variant="default"
                          className="ml-0.5 h-4 min-w-4 px-1 text-[10px]"
                        >
                          {nbEnAttente}
                        </Badge>
                      )}
                    </ToggleGroupItem>
                  )}
                </ToggleGroup>
              )}
              {peutDeposer && (
                <Button
                  onClick={() => setDepotOuvert(true)}
                  className="ds-shimmer gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter un document
                </Button>
              )}
            </div>
          </div>
          {/* SECT-BIBLIO-5 (000137) : légende des 3 niveaux de diffusion. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-primary" />
              Catalogue SECT — tous les établissements clients
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              Établissement — le vôtre uniquement
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              Classes — vos étudiants uniquement
            </span>
          </div>
        </div>
      </div>

      {/* SECT-BIBLIO-P4 : file de propositions G1 — le RESPONSABLE
          propose (métadonnées), l'ADMIN tranche puis dépose le fichier
          (dépôt pré-lié via propositionId). SECT-BIBLIO-5 (000137) : le
          RESPONSABLE peut aussi déposer directement (son périmètre =
          son établissement). */}
      {vue === 'propositions' && peutProposer ? (
        <PropositionsView
          filieresOptions={filieresOptions}
          onDeposer={
            isAdmin || estResponsable
              ? (p) => {
                  setDepotProposition({ id: p.id, titre: p.titre })
                  setFTitre(p.titre)
                  setFCategorie(p.categorie)
                  setFLicence(p.licenceOrigine)
                  if (p.auteurs) setFAuteurs(parseAuteurs(p.auteurs).join(' ; '))
                  if (p.editeur) setFEditeur(p.editeur)
                  if (p.anneePublication) setFAnnee(String(p.anneePublication))
                  if (p.isbn) setFIsbn(p.isbn)
                  if (p.langue) setFLangue(p.langue)
                  if (p.filiereId) setFFiliere(p.filiereId)
                  if (p.niveau) setFNiveau(p.niveau)
                  if (p.description) setFDescription(p.description)
                  if (p.themes) {
                    try {
                      const arr = JSON.parse(p.themes)
                      if (Array.isArray(arr)) setFThemes(arr.join(' ; '))
                    } catch {
                      setFThemes(p.themes)
                    }
                  }
                  setDepotOuvert(true)
                }
              : undefined
          }
        />
      ) : vue === 'alignements' && peutDeclarer ? (
        <AlignementsView />
      ) : vue === 'activite' && peutVoirActivite && isAdmin && !adminAssistance ? (
        <div className="space-y-6">
          {/* SECT-RBAC-AUDITS (ADR-0009) : l'activité sonde uniquement
              l'établissement des claims — l'ADMIN global est orienté vers
              le mode assistance (accès AVEC motif, APPROUVÉ par le
              RESPONSABLE, 24 h max, tracé dans le journal d'audit). */}
          <AssistancePrompt outil="L'activité de lecture" />
        </div>
      ) : vue === 'activite' && peutVoirActivite ? (
        <div className="space-y-6">
          {/* Stats d'activité */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Ouvrages (catalogue)"
              value={activiteStats.ouvrages}
              icon={Library}
              accent="primary"
              loading={activiteQuery.isLoading}
              hint="Ouvrages visibles de l'établissement"
            />
            <StatCard
              label="Ouvrages lus"
              value={activiteStats.ouvragesLus}
              icon={BookOpen}
              accent="secondary"
              loading={activiteQuery.isLoading}
              hint="Au moins une lecture enregistrée"
            />
            <StatCard
              label="Lectures"
              value={activiteStats.lectures}
              icon={Users}
              accent="info"
              loading={activiteQuery.isLoading}
              hint="Total des progressions de lecture"
            />
            <StatCard
              label="Temps de lecture"
              value={tempsAffichable(activiteStats.tempsTotalSec)}
              icon={Timer}
              accent="gold"
              loading={activiteQuery.isLoading}
              hint={
                activiteStats.derniere
                  ? `Dernière activité : ${formatDateUTC(activiteStats.derniere)}`
                  : 'Aucune lecture pour le moment'
              }
            />
          </div>

          {/* Table d'activité par ouvrage */}
          {activiteQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activiteQuery.isError ? (
            <Card className="border-destructive/50">
              <CardContent className="pt-6 text-center space-y-2">
                <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {activiteQuery.error instanceof Error
                    ? activiteQuery.error.message
                    : 'Erreur de chargement de l\u2019activité.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => activiteQuery.refetch()}
                >
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : (activiteQuery.data?.activite ?? []).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-8 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-display font-semibold">
                    Aucune activité pour le moment
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Aucun ouvrage visible dans cet établissement — les
                    lectures apparaîtront ici dès le premier dépôt lu.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ouvrage</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead className="text-right">Lecteurs</TableHead>
                        <TableHead className="text-right">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" /> Pages vues
                          </span>
                        </TableHead>
                        <TableHead className="text-right">Temps total</TableHead>
                        <TableHead className="text-right">
                          Dernière activité
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(activiteQuery.data?.activite ?? []).map((r) => (
                        <TableRow key={r.ouvrageId}>
                          <TableCell className="font-medium max-w-[280px] truncate">
                            {r.titre}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {categorieLabel(r.categorie as CategorieOuvrage)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.nbLecteurs}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.pagesVuesTotal}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {tempsAffichable(r.tempsTotalSec)}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.derniereActivite
                              ? formatDateUTC(r.derniereActivite)
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <>
      {/* SECT-BIBLIO-5 (000137) : bandeau de modération — brouillons
          (dépôts enseignants) en attente de validation par le
          responsable de l'établissement / l'ADMIN. */}
      {(isAdmin || estResponsable) &&
        !corbeille &&
        ouvrages.some((o) => o.statut === 'BROUILLON') && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="pt-4 pb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-sm">
                <BadgeCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>
                  <span className="font-medium">
                    {ouvrages.filter((o) => o.statut === 'BROUILLON').length}{' '}
                    document(s) en attente
                  </span>{' '}
                  <span className="text-muted-foreground">
                    — déposés par des enseignants, visibles uniquement après
                    votre validation (page courante).
                  </span>
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  resetFiltres()
                  setCorbeille(false)
                }}
                className="gap-1.5"
              >
                <Filter className="h-3.5 w-3.5" />
                Réinitialiser les filtres
              </Button>
            </CardContent>
          </Card>
        )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Ouvrages (catalogue)"
          value={corbeille ? `${total} (corbeille incluse)` : total}
          icon={Library}
          accent="primary"
          loading={ouvragesQuery.isLoading}
          hint="Total correspondant aux filtres actuels"
        />
        <StatCard
          label="Référentiels officiels"
          value={stats.referentiels}
          icon={Gavel}
          accent="secondary"
          loading={ouvragesQuery.isLoading}
          hint="Normatif pur — page courante"
        />
        <StatCard
          label="Ouvrages de référence"
          value={stats.ouvragesRef}
          icon={BookOpen}
          accent="info"
          loading={ouvragesQuery.isLoading}
          hint="Référence normative — page courante"
        />
        <StatCard
          label="Recherche & pratique"
          value={stats.recherche}
          icon={FileText}
          accent="gold"
          loading={ouvragesQuery.isLoading}
          hint="Preuve & contexte — page courante"
        />
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative flex-1">
              <Label htmlFor="biblio-search" className="sr-only">
                Rechercher
              </Label>
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="biblio-search"
                placeholder="Titre, auteur, éditeur, description, thèmes…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 pr-20"
              />
              {/* SECT-BIBLIO-P4 : veille thématique — créer une alerte
                  sur la recherche courante (notification au dépôt). */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="absolute right-1.5 top-1.5 h-7 gap-1 px-2 text-xs"
                    onClick={creerVeille}
                    disabled={veilleEnCours}
                    aria-label="Créer une alerte sur cette recherche"
                  >
                    <BellPlus className="h-3.5 w-3.5" />
                    Alerte
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Être notifié des nouveaux ouvrages correspondant à cette
                  recherche
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-auto">
              <div>
                <Label className="text-xs text-muted-foreground">Catégorie</Label>
                <Select
                  value={categorie}
                  onValueChange={(v) => {
                    setCategorie(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="toutes">Toutes</SelectItem>
                    {CATEGORIES_OUVRAGE.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* SECT-BIBLIO-5 (000137) : filtre provenance — qui voit
                  le document (plateforme / établissement / classes). */}
              <div>
                <Label className="text-xs text-muted-foreground">Provenance</Label>
                <Select
                  value={provenanceFiltre}
                  onValueChange={(v) => {
                    setProvenanceFiltre(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="toutes">Toutes</SelectItem>
                    <SelectItem value="PLATEFORME">Catalogue SECT</SelectItem>
                    <SelectItem value="ETABLISSEMENT">Établissement</SelectItem>
                    <SelectItem value="CLASSE">Classes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Filière</Label>
                <Select
                  value={filiereFiltre}
                  onValueChange={(v) => {
                    setFiliereFiltre(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="toutes">Toutes</SelectItem>
                    {filieresOptions.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Niveau</Label>
                <Select
                  value={niveauFiltre}
                  onValueChange={(v) => {
                    setNiveauFiltre(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tous">Tous</SelectItem>
                    {NIVEAUX_ETUDE.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="biblio-corbeille"
                    checked={corbeille}
                    onCheckedChange={(v) => {
                      setCorbeille(v)
                      setPage(1)
                    }}
                  />
                  <Label htmlFor="biblio-corbeille" className="text-sm">
                    Corbeille
                  </Label>
                </div>
              )}
              {filtresActifs && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFiltres}
                  className="gap-1.5"
                >
                  <X className="h-3.5 w-3.5" /> Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECT-BIBLIO-P4 : veilles actives (alertes nouveautés). */}
      {(veillesQuery.data ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <BellRing className="h-3.5 w-3.5" />
            Alertes :
          </span>
          {(veillesQuery.data ?? []).map((v) => (
            <Badge
              key={v.id}
              variant="secondary"
              className="gap-1 py-1 pl-2.5 pr-1"
            >
              {v.terme}
              <button
                type="button"
                onClick={() => supprimerVeille(v.id)}
                className="rounded-full p-0.5 hover:bg-destructive/20"
                aria-label={`Supprimer l'alerte ${v.terme}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Liste */}
      {ouvragesQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-64 w-full" />
          ))}
        </div>
      ) : ouvragesQuery.isError ? (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">
              {ouvragesQuery.error instanceof Error
                ? ouvragesQuery.error.message
                : 'Erreur de chargement du catalogue.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => ouvragesQuery.refetch()}
            >
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : ouvrages.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Library className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-display font-semibold">
                {filtresActifs
                  ? 'Aucun ouvrage ne correspond'
                  : corbeille
                    ? 'La corbeille est vide'
                    : 'La bibliothèque est vide'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {filtresActifs
                  ? 'Essayez de réinitialiser les filtres.'
                  : peutDeposer
                    ? 'Déposez le premier document (PDF) — l’analyse IA pré-remplira le formulaire.'
                    : "Les documents déposés par l'administration et vos enseignants apparaîtront ici."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ouvrages.map((o, i) => carteOuvrage(o, i))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {premiere}–{derniere} sur {total} ouvrage(s)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageCourante <= 1}
                onClick={() => setPage(pageCourante - 1)}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pageCourante * limit >= total}
                onClick={() => setPage(pageCourante + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        </>
      )}
        </>
      )}

      {/* ─── Dialog dépôt (ADMIN/RESPONSABLE/ENSEIGNANT — 000137) ─── */}
      <Dialog open={depotOuvert} onOpenChange={setDepotOuvert}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Ajouter un document</DialogTitle>
            <DialogDescription>
              {/* SECT-BIBLIO-5 (000137) : le périmètre est DÉRIVÉ DU RÔLE
                  (le serveur le scelle — ce bandeau informe, il ne
                  décide pas). */}
              {estEnseignant
                ? 'Vos classes uniquement — le document naît « à valider » et devient visible de vos étudiants après validation par le responsable de votre établissement.'
                : estResponsable
                  ? "Votre établissement uniquement — visible des membres de votre établissement dès le dépôt."
                  : adminAssistance
                    ? "Établissement assisté — visible de ses membres dès le dépôt."
                    : 'Catalogue commun SECT — visible par TOUS les établissements clients dès le dépôt.'}
              {' '}PDF uniquement, 100 Mo max. L'analyse IA pré-remplit le
              formulaire : vous vérifiez, complétez et validez.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[58vh] pr-3">
            <div className="space-y-4">
              {/* SECT-BIBLIO-5 : bandeau de portée (couleur du niveau). */}
              <div
                className={`rounded-lg border px-3.5 py-2.5 text-sm flex items-start gap-2.5 ${
                  estEnseignant
                    ? 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                    : estResponsable || adminAssistance
                      ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                      : 'border-primary/30 bg-primary/5 text-foreground'
                }`}
              >
                {estEnseignant ? (
                  <GraduationCap className="h-4 w-4 mt-0.5 shrink-0" />
                ) : estResponsable || adminAssistance ? (
                  <Building2 className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                  <Globe className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <span>
                  <span className="font-medium">Publication : </span>
                  {estEnseignant
                    ? 'vos classes destinatrices (à sélectionner ci-dessous)'
                    : estResponsable
                      ? 'votre établissement'
                      : adminAssistance
                        ? "l'établissement assisté"
                        : 'tous les établissements clients SECT'}
                </span>
              </div>

              {/* Fichier */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Zone de dépôt du fichier PDF"
                onClick={() => document.getElementById('biblio-file')?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    document.getElementById('biblio-file')?.click()
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  onChoisirFichier(e.dataTransfer.files?.[0] ?? null)
                }}
                className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input
                  id="biblio-file"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) =>
                    onChoisirFichier(e.target.files?.[0] ?? null)
                  }
                />
                {fichier ? (
                  <div className="space-y-1">
                    <FileText className="h-8 w-8 text-primary mx-auto" />
                    <p className="font-medium">{fichier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tailleAffichable(fichier.size)} — cliquez pour changer
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <BookOpen className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm">Glissez le PDF ici ou cliquez</p>
                    <p className="text-xs text-muted-foreground">
                      PDF · max 100 Mo · l'analyse IA démarre automatiquement
                    </p>
                  </div>
                )}
              </div>

              {/* SECT-BIBLIO-5 (tâche 2) : état de l'analyse IA —
                  l'IA PROPOSE, l'humain dispose (human-in-the-loop). */}
              {analyseEnCours && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm flex items-center gap-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span className="text-muted-foreground">
                    Analyse du document par l'IA en cours — le formulaire se
                    pré-remplit automatiquement…
                  </span>
                </div>
              )}
              {analyse?.disponible && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm space-y-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Formulaire pré-rempli par l'IA
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Chaque valeur proposée reste éditable et sa preuve est
                    citée sous le champ concerné — vérifiez, complétez les
                    champs manquants (en particulier catégorie et licence),
                    puis enregistrez.
                    {analyse.modele ? ` Modèle : ${analyse.modele} · ` : ' '}
                    {analyse.pagesAnalysees} page(s) analysée(s).
                  </p>
                </div>
              )}
              {analyse && !analyse.disponible && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <span>
                      Analyse IA indisponible — {analyse.raison ?? 'raison inconnue'}.{' '}
                      Remplissez le formulaire manuellement : le dépôt reste
                      entièrement possible.
                    </span>
                    {/* SECT-BIBLIO-6 : relance sans re-choisir le fichier —
                        le cooldown passager d'un provider ne doit pas
                        condamner l'utilisateur à reparcourir son disque. */}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                        onClick={relancerAnalyse}
                        disabled={analyseEnCours}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        Relancer l'analyse
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {/* SECT-BIBLIO-6 : échec transport (502, timeout 35 s, réseau) —
                  message persistant + relance, au lieu d'un toast muet qui
                  laissait l'utilisateur sans explication ni action. */}
              {analyseErreur && !analyseEnCours && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <span>
                      Analyse IA impossible — {analyseErreur} Remplissez le
                      formulaire manuellement : le dépôt reste entièrement
                      possible.
                    </span>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                        onClick={relancerAnalyse}
                        disabled={analyseEnCours}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        Relancer l'analyse
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* SECT-BIBLIO-5 (000137) : classes destinatrices de
                  l'ENSEIGNANT — chips togglables, au moins une requise
                  (le serveur intersecte avec EnseignantFiliere :
                  usurpation impossible). */}
              {estEnseignant && (
                <div className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <GraduationCap className="h-4 w-4" />
                      Classes destinatrices
                    </Label>
                    <Badge variant="outline" className="text-[10px]">
                      Obligatoire
                    </Badge>
                  </div>
                  {mesClassesQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Chargement de vos classes…
                    </p>
                  ) : mesClasses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Vous n'avez pas encore de classe affectée — demandez au
                      responsable de votre établissement de vous affecter à
                      une filière et un niveau.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {mesClasses.map((c) => {
                        const cle = `${c.filiereId}|${c.niveau}`
                        const active = classesSelectionnees.some(
                          (s) => s.filiereId === c.filiereId && s.niveau === c.niveau,
                        )
                        return (
                          <button
                            key={cle}
                            type="button"
                            onClick={() =>
                              setClassesSelectionnees((prev) =>
                                active
                                  ? prev.filter(
                                      (s) =>
                                        !(
                                          s.filiereId === c.filiereId &&
                                          s.niveau === c.niveau
                                        ),
                                    )
                                  : [...prev, { filiereId: c.filiereId, niveau: c.niveau }],
                              )
                            }
                            aria-pressed={active}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                              active
                                ? 'border-rose-500 bg-rose-500 text-white'
                                : 'border-border bg-card hover:border-rose-500/50'
                            }`}
                          >
                            {c.filiere?.nom ?? c.filiereId} · {c.niveau}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Seuls les étudiants de ces classes verront le document.
                  </p>
                </div>
              )}

              {/* Champs principaux */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="biblio-titre">Titre *</Label>
                  <Input
                    id="biblio-titre"
                    value={fTitre}
                    onChange={(e) => setFTitre(e.target.value)}
                    placeholder="Ex : Mathématiques L1 — Analyse, cours et exercices"
                  />
                  {/* SECT-BIBLIO-5 : preuve IA sous le champ. */}
                  <LigneIA champ={analyse?.disponible ? analyse.titre : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label>Catégorie *</Label>
                  <Select value={fCategorie} onValueChange={setFCategorie}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES_OUVRAGE.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label} — {c.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* SECT-BIBLIO-8 : preuve IA sous le champ (la
                      catégorie est PROPOSÉE par l'IA — human-in-the-loop,
                      l'humain valide ou corrige). */}
                  <LigneIA
                    champ={analyse?.disponible ? analyse.categorie : undefined}
                  />
                </div>
                {/* SECT-BIBLIO-8 (000137) : plus de select établissement
                    pour l'ADMIN global — le serveur IGNORE ce champ
                    (deriveScope : ADMIN global ⇒ catalogue commun
                    PLATEFORME, etablissementId écrasé à ""). Le bandeau
                    de portée ci-dessus documente déjà la publication
                    « tous les établissements clients SECT » ; le champ
                    restait bloquant côté UI alors qu'il ne servait à
                    rien — incohérence signalée par l'exploitant. */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="biblio-licence">
                    Licence / origine des droits *
                  </Label>
                  <Input
                    id="biblio-licence"
                    value={fLicence}
                    onChange={(e) => setFLicence(e.target.value)}
                    placeholder="Ex : Œuvre propre de l'établissement / achat licence / autorisation de l'auteur"
                  />
                  <p className="text-xs text-muted-foreground">
                    Garde-fou ADR-0007 — obligatoire pour tout dépôt.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Filière (recommandation)</Label>
                  <Select value={fFiliere} onValueChange={setFFiliere}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="toutes">Toutes filières</SelectItem>
                      {filieresOptions.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Niveau (recommandation)</Label>
                  <Select value={fNiveau} onValueChange={setFNiveau}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tous">Tous niveaux</SelectItem>
                      {NIVEAUX_ETUDE.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biblio-auteurs">Auteurs (séparés par ;)</Label>
                  <Input
                    id="biblio-auteurs"
                    value={fAuteurs}
                    onChange={(e) => setFAuteurs(e.target.value)}
                    placeholder="Ex : Koffi A. ; Traoré M."
                  />
                  <LigneIA champ={analyse?.disponible ? analyse.auteurs : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biblio-editeur">Éditeur</Label>
                  <Input
                    id="biblio-editeur"
                    value={fEditeur}
                    onChange={(e) => setFEditeur(e.target.value)}
                  />
                  <LigneIA champ={analyse?.disponible ? analyse.editeur : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biblio-edition">Édition</Label>
                  <Input
                    id="biblio-edition"
                    value={fEdition}
                    onChange={(e) => setFEdition(e.target.value)}
                    placeholder="Ex : 3e édition"
                  />
                  <LigneIA champ={analyse?.disponible ? analyse.edition : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biblio-annee">Année de publication</Label>
                  <Input
                    id="biblio-annee"
                    type="number"
                    value={fAnnee}
                    onChange={(e) => setFAnnee(e.target.value)}
                    placeholder="Ex : 2024"
                  />
                  <LigneIA champ={analyse?.disponible ? analyse.anneePublication : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biblio-isbn">ISBN</Label>
                  <Input
                    id="biblio-isbn"
                    value={fIsbn}
                    onChange={(e) => setFIsbn(e.target.value)}
                  />
                  <LigneIA champ={analyse?.disponible ? analyse.isbn : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biblio-langue">Langue</Label>
                  <Input
                    id="biblio-langue"
                    value={fLangue}
                    onChange={(e) => setFLangue(e.target.value)}
                    placeholder="Ex : Français"
                  />
                  <LigneIA champ={analyse?.disponible ? analyse.langue : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biblio-expiration">
                    Expiration des droits (optionnel)
                  </Label>
                  <Input
                    id="biblio-expiration"
                    type="date"
                    value={fExpiration}
                    onChange={(e) => setFExpiration(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Après cette date : invisible des lecteurs (badge ADMIN).
                  </p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="biblio-themes">Thèmes (séparés par ;)</Label>
                  <Input
                    id="biblio-themes"
                    value={fThemes}
                    onChange={(e) => setFThemes(e.target.value)}
                    placeholder="Ex : analyse ; dérivées ; intégrales"
                  />
                  <LigneIA champ={analyse?.disponible ? analyse.themes : undefined} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="biblio-description">Description</Label>
                  <Textarea
                    id="biblio-description"
                    value={fDescription}
                    onChange={(e) => setFDescription(e.target.value)}
                    placeholder="Résumé et usage pédagogique recommandé…"
                    rows={3}
                  />
                  <LigneIA champ={analyse?.disponible ? analyse.description : undefined} />
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDepotOuvert(false)}>
              Annuler
            </Button>
            {/* SECT-BIBLIO-5 : classes requises pour l'enseignant — le
                bouton guide la complétion humaine (l'IA a pré-rempli,
                l'humain complète/valide). */}
            <Button
              onClick={soumettreDepot}
              disabled={
                depotEnCours ||
                (estEnseignant && classesSelectionnees.length === 0)
              }
              className="gap-2"
            >
              {depotEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
              {estEnseignant
                ? 'Enregistrer le brouillon'
                : "Enregistrer le document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog édition (ADMIN) ─── */}
      <Dialog open={editionOuverte} onOpenChange={setEditionOuverte}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              Modifier « {editionCible?.titre} »
            </DialogTitle>
            <DialogDescription>
              « Toutes filières » / « Tous niveaux » / sans expiration remettent
              la restriction à NULL (pertinent pour tous).
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[58vh] pr-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-titre">Titre</Label>
                <Input
                  id="edit-titre"
                  value={eTitre}
                  onChange={(e) => setETitre(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Select value={eCategorie} onValueChange={setECategorie}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES_OUVRAGE.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-licence">Licence / origine des droits</Label>
                <Input
                  id="edit-licence"
                  value={eLicence}
                  onChange={(e) => setELicence(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Filière</Label>
                <Select value={eFiliere} onValueChange={setEFiliere}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="toutes">Toutes filières</SelectItem>
                    {filieresOptions.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Niveau</Label>
                <Select value={eNiveau} onValueChange={setENiveau}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tous">Tous niveaux</SelectItem>
                    {NIVEAUX_ETUDE.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-auteurs">Auteurs ( ; )</Label>
                <Input
                  id="edit-auteurs"
                  value={eAuteurs}
                  onChange={(e) => setEAuteurs(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-editeur">Éditeur</Label>
                <Input
                  id="edit-editeur"
                  value={eEditeur}
                  onChange={(e) => setEEditeur(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-edition">Édition</Label>
                <Input
                  id="edit-edition"
                  value={eEdition}
                  onChange={(e) => setEEdition(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-annee">Année</Label>
                <Input
                  id="edit-annee"
                  type="number"
                  value={eAnnee}
                  onChange={(e) => setEAnnee(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-isbn">ISBN</Label>
                <Input
                  id="edit-isbn"
                  value={eIsbn}
                  onChange={(e) => setEIsbn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-langue">Langue</Label>
                <Input
                  id="edit-langue"
                  value={eLangue}
                  onChange={(e) => setELangue(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-themes">Thèmes ( ; )</Label>
                <Input
                  id="edit-themes"
                  value={eThemes}
                  onChange={(e) => setEThemes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={eDescription}
                  onChange={(e) => setEDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-exp-present"
                    checked={eExpirationPresente}
                    onCheckedChange={(v) => setEExpirationPresente(v === true)}
                  />
                  <Label htmlFor="edit-exp-present" className="text-sm font-normal">
                    Droits avec expiration
                  </Label>
                </div>
                <Input
                  id="edit-exp"
                  type="date"
                  value={eExpiration}
                  onChange={(e) => setEExpiration(e.target.value)}
                  disabled={!eExpirationPresente}
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  Décocher = pas d'expiration (null).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Téléchargement autorisé</Label>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    id="edit-telechargement"
                    checked={eTelechargement}
                    onCheckedChange={setETelechargement}
                  />
                  <Label
                    htmlFor="edit-telechargement"
                    className="text-sm font-normal"
                  >
                    Autoriser le téléchargement du PDF
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Scale className="h-3 w-3" />
                  Lecture in-browser reste toujours disponible.
                </p>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditionOuverte(false)}>
              Annuler
            </Button>
            <Button
              onClick={soumettreEdition}
              disabled={editionEnCours}
              className="gap-2"
            >
              {editionEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirmation corbeille ─── */}
      <AlertDialog
        open={!!confirmCible}
        onOpenChange={(v) => !v && setConfirmCible(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mettre « {confirmCible?.titre} » en corbeille ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              L'ouvrage devient invisible des lecteurs (restauration possible
              depuis la corbeille). Le fichier est conservé — pas de suppression
              définitive en P1.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmCible(null)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmCible && mettreEnCorbeille(confirmCible)}
            >
              Mettre en corbeille
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Lecteur in-browser (présigné 15 min, iframe + lecture mesurée P2) ─── */}
      <Dialog open={!!lecteur} onOpenChange={(v) => !v && fermerLecteur()}>
        <DialogContent className="max-w-7xl h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <DialogTitle className="font-display truncate">
                  {lecteur?.ouvrage.titre}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <Badge variant="outline">
                      {categorieLabel(
                        lecteur?.ouvrage.categorie ?? 'OUVRAGE_REFERENCE',
                      )}
                    </Badge>
                  </span>
                  <span>
                    {lecteur?.ouvrage.filiere?.nom ?? 'Toutes filières'} ·{' '}
                    {lecteur?.ouvrage.niveau ?? 'Tous niveaux'}
                  </span>
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {lecteur?.url && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => window.open(lecteur.url!, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Nouvel onglet
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fermerLecteur()}
                  aria-label="Fermer le lecteur"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* SECT-BIBLIO-P2 : barre de lecture mesurée — chip de reprise,
              marque-page DÉCLARATIF (l'iframe cross-origin ne permet pas de
              lire la page courante du lecteur natif) et reprise au début. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground shrink-0">
            <div className="flex items-center gap-2">
              <Filter className="h-3 w-3" />
              Lecture réservée — consultation éducative, lien sécurisé de 15
              minutes, journalisée.
            </div>
            {lecteur?.url && (
              <div className="flex flex-wrap items-center gap-2">
                {lecteur.reprisePage !== null && lecteur.reprisePage > 1 && (
                  <>
                    <Badge variant="secondary" className="gap-1">
                      <Bookmark className="h-3 w-3" />
                      Reprise page {lecteur.reprisePage}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => allerPage(1)}
                    >
                      Reprendre au début
                    </Button>
                  </>
                )}
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="biblio-marque-page" className="sr-only">
                    Page actuelle
                  </Label>
                  <Input
                    id="biblio-marque-page"
                    type="number"
                    min={1}
                    value={marquePageInput}
                    onChange={(e) => setMarquePageInput(e.target.value)}
                    className="h-7 w-[74px] text-xs"
                    aria-label="Numéro de la page que vous lisez"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={marquerPage}
                  >
                    <Bookmark className="h-3 w-3" />
                    Marquer
                  </Button>
                </div>
              </div>
            )}
            {/* SECT-BIBLIO-P4 : panneau d'annotations (ADR-0008 §1) —
                indépendant du fichier (les annotations vivent sur
                l'ouvrage, utiles même en erreur honnête DB-only). */}
            <Button
              variant={panneauAnnotations ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setPanneauAnnotations((v) => !v)}
              aria-pressed={panneauAnnotations}
            >
              <MessageSquareText className="h-3 w-3" />
              Annotations
            </Button>
          </div>

          <div className="flex-1 min-h-0 bg-muted/30 flex">
            <div className="flex-1 min-w-0 relative">
              {lecteur?.loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Génération du lien sécurisé…
                  </p>
                </div>
              ) : lecteur?.error ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <ShieldAlert className="h-10 w-10 text-destructive" />
                  <p className="font-medium">Lecture impossible</p>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {lecteur.error}
                  </p>
                </div>
              ) : lecteur?.url ? (
                <>
                  <iframe
                    src={lecteur.url}
                    title={`Lecteur — ${lecteur.ouvrage.titre}`}
                    className="w-full h-full border-0"
                  />
                  {/* SECT-BIBLIO-P4 (ADR-0008 §6) : watermark UI — email
                      + date, répété, pointer-events-none (la navigation
                      du lecteur natif reste utilisable) + select-none. */}
                  <div
                    className="absolute inset-0 pointer-events-none select-none overflow-hidden"
                    aria-hidden="true"
                  >
                    <div className="h-full w-full flex flex-col justify-around items-center">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <p
                          key={i}
                          className="text-[10px] font-medium text-foreground/10 -rotate-[18deg] whitespace-nowrap"
                        >
                          {user?.email ?? 'lecteur'} ·{' '}
                          {new Date().toLocaleDateString('fr-FR')} · lecture
                          réservée
                        </p>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            {/* SECT-BIBLIO-P4 : panneau d'annotations (ADR-0008 §1) —
                visibilité PRIVEE/FILIERE/ETABLISSEMENT scopée RLS. */}
            {panneauAnnotations && lecteur && (
              <aside className="w-[320px] shrink-0 border-l border-border bg-card overflow-hidden">
                <AnnotationsPanel
                  ouvrageId={lecteur.ouvrage.id}
                  pageCourante={lecteur.reprisePage}
                  userId={user?.id}
                />
              </aside>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
