'use client'

// ════════════════════════════════════════════════════════════════════
// LecteurOuvragePage — SECT-BIBLIO-11 : lecteur PLEIN ÉCRAN in-app
// (route /bibliotheque/lecture/{id})
// ════════════════════════════════════════════════════════════════════
// Remplace le Dialog modal de la bibliothèque (SECT-BIBLIO-P2) : la
// modale Radix piège le focus (les raccourcis clavier du lecteur PDF
// natif sont avalés), Escape ferme la fenêtre, la zone de lecture est
// amputée par l'overlay et aucun plein écran réel n'est possible. La
// route dédiée donne :
//   - toute la hauteur utile au PDF (barre d'outils slim persistante) ;
//   - un bouton « Retour à la bibliothèque » + fil d'Ariane header ;
//   - une URL dédiée (bookmark, F5, nouvel onglet in-app) ;
//   - le PLEIN ÉCRAN NATIF (Fullscreen API) sur le conteneur de
//     lecture — barre d'outils comprise (marque-page reste actif) ;
//   - le focus LIBRE : raccourcis du lecteur PDF natifs fonctionnent.
//
// Repris à l'identique du Dialog d'origine (aucune régression P2/P4) :
//   - fichier ET progression en PARALLÈLE à l'ouverture, reprise à la
//     page exacte via le fragment #page=N (jamais signé — R2 intact) ;
//   - télémétrie de lecture : temps visible uniquement (visibilitychange
//     + onglet actif), heartbeats 30 s, flush final keepalive ;
//   - marque-page DÉCLARATIF (l'iframe cross-origin ne permet pas de
//     lire la page courante du lecteur natif) ;
//   - watermark UI (ADR-0008 §6) : email + date, répété, non cliquable ;
//   - panneau d'annotations latéral repliable (ADR-0008 §1).
//
// Backend matché :
//   GET /api/ouvrages/{id}          → { ouvrage } (404 si invisible — RLS)
//   GET /api/ouvrages/{id}/fichier  → { url } (présignée 15 min)
//                                    SECT-BIBLIO-13 : disposition SIGNÉE
//                                    « inline » — le lecteur/onglet AFFICHE,
//                                    ne télécharge pas. L'acte téléchargement
//                                    vit sur /{id}/telechargement (403 si
//                                    telechargementAutorise=false) — pas ici.
//   GET/PUT /api/ouvrages/{id}/lecture → télémétrie P2
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  ExternalLink,
  Filter,
  Loader2,
  Maximize,
  Minimize,
  MessageSquareText,
  ShieldAlert,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AnnotationsPanel } from './annotations-panel'
import {
  type Ouvrage,
  type OuvrageLecture,
  type RecordLecturePayload,
  categorieLabel,
} from '@/lib/ouvrages-types'

// ─── Types locaux ───

interface LecteurData {
  ouvrage: Ouvrage
  baseUrl: string | null
  url: string | null
  error: string | null
  lecture: OuvrageLecture | null
  reprisePage: number | null
}

// ─── Composant ───

export function LecteurOuvragePage() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuthStore()

  // L'id vient de l'URL (/bibliotheque/lecture/{id}) — la page est
  // deep-linkable : F5, bookmark et « nouvel onglet in-app » fonctionnent.
  const ouvrageId = pathname.split('/').pop() ?? ''

  const [data, setData] = useState<LecteurData | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [metaError, setMetaError] = useState<string | null>(null)
  // Numéro saisi dans le marque-page déclaratif (prérempli à l'ouverture).
  const [marquePageInput, setMarquePageInput] = useState('1')
  // SECT-BIBLIO-P4 : panneau d'annotations (aside droite, repliable).
  const [panneauAnnotations, setPanneauAnnotations] = useState(false)
  // Plein écran natif (Fullscreen API) sur le conteneur racine.
  const [pleinEcran, setPleinEcran] = useState(false)

  const racineRef = useRef<HTMLDivElement>(null)

  // ─── Chargement : ouvrage + fichier ET progression en PARALLÈLE (P2) ───
  // La reprise à la page exacte est appliquée via le fragment #page=N
  // (le fragment n'est jamais signé : l'ajouter ne casse pas la
  // présignature R2). Seule l'URL du fichier peut faire échouer
  // l'ouverture ; la progression est non bloquante (404 → première
  // lecture).
  useEffect(() => {
    let annule = false
    setLoadingMeta(true)
    setMetaError(null)
    setData(null)

    ;(async () => {
      try {
        const [ouvrageRes, fichierRes, lectureRes] = await Promise.all([
          fetch(`/api/ouvrages/${ouvrageId}`, { credentials: 'include' }),
          fetch(`/api/ouvrages/${ouvrageId}/fichier`, {
            credentials: 'include',
          }),
          fetch(`/api/ouvrages/${ouvrageId}/lecture`, {
            credentials: 'include',
          }),
        ])
        if (annule) return
        if (!ouvrageRes.ok) {
          const body = await ouvrageRes.json().catch(() => ({}))
          throw new Error(
            body?.error ||
              `Ouvrage introuvable ou inaccessible (${ouvrageRes.status})`,
          )
        }
        const ouvrageData = await ouvrageRes.json()
        const ouvrage: Ouvrage = ouvrageData.ouvrage ?? ouvrageData

        if (!fichierRes.ok) {
          const body = await fichierRes.json().catch(() => ({}))
          throw new Error(body?.error || `Erreur ${fichierRes.status}`)
        }
        const fichierData = await fichierRes.json()

        let lecture: OuvrageLecture | null = null
        if (lectureRes.ok) {
          const ld = await lectureRes.json().catch(() => null)
          lecture = ld?.lecture ?? null
        }
        const reprise =
          lecture && lecture.dernierePage > 1 ? lecture.dernierePage : null
        const url = reprise
          ? `${fichierData.url}#page=${reprise}`
          : (fichierData.url as string)
        if (annule) return
        setMarquePageInput(String(lecture?.dernierePage ?? 1))
        setData({
          ouvrage,
          baseUrl: fichierData.url,
          url,
          error: null,
          lecture,
          reprisePage: reprise,
        })
      } catch (err) {
        if (annule) return
        setMetaError(
          err instanceof Error ? err.message : 'Erreur inconnue',
        )
      } finally {
        if (!annule) setLoadingMeta(false)
      }
    })()

    return () => {
      annule = true
    }
  }, [ouvrageId])

  // ─── Plein écran natif (Fullscreen API) ───
  // Le conteneur racine passe en top-layer : TOUT l'écran pour le PDF,
  // barre d'outils comprise (marque-page et annotations restent actifs —
  // c'est le confort de lecture demandé par l'exploitant, impossible en
  // modale). Le state suit fullscreenchange (Esc natif du navigateur).
  const togglePleinEcran = useCallback(() => {
    const el = racineRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void el.requestFullscreen().catch(() => {
        toast.error('Plein écran indisponible', {
          description:
            'Votre navigateur a refusé le plein écran. Vous pouvez agrandir la fenêtre du navigateur (F11).',
        })
      })
    }
  }, [])

  useEffect(() => {
    const onChange = () => setPleinEcran(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () =>
      document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Saute à une page donnée (recharge l'iframe — le fragment change).
  const allerPage = (page: number) => {
    setData((prev) =>
      prev && prev.baseUrl
        ? { ...prev, url: `${prev.baseUrl}#page=${page}`, reprisePage: page }
        : prev,
    )
  }

  // ─── Télémétrie de lecture (P2) — useRef + visibilitychange + 30 s ───
  // Le temps ne compte QUE si le document est visible (onglet actif) ET
  // la page de lecture montée ; les heartbeats partent toutes les 30 s,
  // le flush final en fetch keepalive survit à la navigation interne.
  // Best-effort : une erreur réseau n'interrompt JAMAIS la lecture.
  interface TelemetrieAccum {
    visibleMs: number
    pagesVues: Record<string, number>
    dernierePage: number | null
    lastTick: number
    visible: boolean
  }
  const TELEMETRIE_INTERVAL_MS = 30_000
  const telemetrieRef = useRef<TelemetrieAccum | null>(null)
  const telemetrieOuvrageIdRef = useRef<string | null>(null)

  const tickVisible = (acc: TelemetrieAccum) => {
    const now = Date.now()
    if (acc.visible) acc.visibleMs += now - acc.lastTick
    acc.lastTick = now
  }

  const flushTelemetrie = useCallback((keepalive: boolean) => {
    const acc = telemetrieRef.current
    const id = telemetrieOuvrageIdRef.current
    if (!acc || !id) return
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
    fetch(`/api/ouvrages/${id}/lecture`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      keepalive,
    }).catch(() => {
      // best-effort : la télémétrie ne doit jamais casser la lecture
    })
  }, [])

  // Cycle de vie : démarrage à l'obtention de l'URL, arrêt + flush final
  // au démontage (navigation retour, F5, fermeture d'onglet — le keepalive
  // survit quelques secondes à la page).
  useEffect(() => {
    if (!data?.url) return
    telemetrieOuvrageIdRef.current = data.ouvrage.id
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
      telemetrieOuvrageIdRef.current = null
      telemetrieRef.current = null
    }
  }, [data?.url, data?.ouvrage.id, flushTelemetrie])

  // Marque-page DÉCLARATIF : l'iframe cross-origin ne permet pas de lire
  // la page courante du lecteur PDF natif — c'est le lecteur qui déclare
  // où il en est (bouton « Marquer »). Envoi immédiat.
  const marquerPage = () => {
    const acc = telemetrieRef.current
    if (!acc) return
    const page = parseInt(marquePageInput, 10)
    if (Number.isNaN(page) || page < 1) {
      toast.error('Numéro de page invalide', {
        description:
          'Entrez le numéro de la page que vous êtes en train de lire.',
      })
      return
    }
    const key = String(page)
    acc.pagesVues[key] = (acc.pagesVues[key] ?? 0) + 1
    acc.dernierePage = page
    flushTelemetrie(false)
    setData((prev) =>
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

  // ─── Rendu ───

  if (loadingMeta) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Ouverture du document sécurisé…
          </p>
        </div>
      </div>
    )
  }

  if (metaError || !data) {
    return (
      <div className="flex items-center justify-center h-[60vh] px-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <p className="font-medium">Lecture impossible</p>
          <p className="text-sm text-muted-foreground">
            {metaError ?? 'Ouvrage introuvable.'}
          </p>
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => router.push('/bibliotheque')}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la bibliothèque
          </Button>
        </div>
      </div>
    )
  }

  const o = data.ouvrage

  return (
    <div
      ref={racineRef}
      className={
        pleinEcran
          ? 'h-[100dvh] w-screen bg-background flex flex-col overflow-hidden'
          : 'h-[calc(100dvh-7rem)] md:h-[calc(100dvh-8rem)] min-h-[480px] w-full flex flex-col rounded-lg border border-border bg-card shadow-sm overflow-hidden'
      }
    >
      {/* Barre d'outils principale — slim, persistante, jamais overlay :
          le PDF garde TOUTE la hauteur restante. */}
      <div className="px-4 md:px-5 pt-3 pb-2.5 border-b border-border shrink-0 bg-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0 mt-0.5"
              onClick={() => router.push('/bibliotheque')}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Bibliothèque</span>
            </Button>
            <div className="min-w-0 space-y-1">
              <h1 className="font-display text-base md:text-lg font-semibold leading-tight truncate">
                {o.titre}
              </h1>
              <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="outline" className="gap-1">
                  {categorieLabel(o.categorie ?? 'OUVRAGE_REFERENCE')}
                </Badge>
                <span>
                  {o.filiere?.nom ?? 'Toutes filières'} ·{' '}
                  {o.niveau ?? 'Tous niveaux'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {data.url && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => window.open(data.url!, '_blank')}
                title="Ouvrir le PDF dans un nouvel onglet du navigateur (affichage — SECT-BIBLIO-13 : URL de lecture en disposition inline)"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden lg:inline">Nouvel onglet</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={togglePleinEcran}
              aria-pressed={pleinEcran}
              title={
                pleinEcran
                  ? 'Quitter le plein écran'
                  : 'Plein écran — toute la place pour lire'
              }
            >
              {pleinEcran ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
              <span className="hidden lg:inline">
                {pleinEcran ? 'Quitter' : 'Plein écran'}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* SECT-BIBLIO-P2 : barre de lecture mesurée — chip de reprise,
          marque-page DÉCLARATIF et reprise au début. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 md:px-5 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-2">
          <Filter className="h-3 w-3" />
          Lecture réservée — consultation éducative, lien sécurisé de 15
          minutes, journalisée.
        </div>
        {data.url && (
          <div className="flex flex-wrap items-center gap-2">
            {data.reprisePage !== null && data.reprisePage > 1 && (
              <>
                <Badge variant="secondary" className="gap-1">
                  <Bookmark className="h-3 w-3" />
                  Reprise page {data.reprisePage}
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
              <Label htmlFor="lecteur-marque-page" className="sr-only">
                Page actuelle
              </Label>
              <Input
                id="lecteur-marque-page"
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
        )}
      </div>

      {/* Zone de lecture : TOUTE la place restante. L'iframe cross-origin
          charge l'URL présignée R2 (lecteur PDF natif du navigateur —
          ses outils de zoom/navigation sont PLEINEMENT utilisables, le
          focus n'est plus piégé par une modale). */}
      <div className="flex-1 min-h-0 bg-muted/30 flex">
        <div className="flex-1 min-w-0 relative">
          {data.error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <ShieldAlert className="h-10 w-10 text-destructive" />
              <p className="font-medium">Lecture impossible</p>
              <p className="text-sm text-muted-foreground max-w-md">
                {data.error}
              </p>
            </div>
          ) : data.url ? (
            <>
              <iframe
                src={data.url}
                title={`Lecteur — ${o.titre}`}
                className="w-full h-full border-0"
              />
              {/* SECT-BIBLIO-P4 (ADR-0008 §6) : watermark UI — email
                  + date, répété, pointer-events-none (la navigation du
                  lecteur natif reste utilisable) + select-none. */}
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
            visibilité PRIVEE/FILIERE/ETABLISSEMENT scopée RLS. En plein
            écran le panneau reste disponible (besoin pédagogique). */}
        {panneauAnnotations && (
          <aside className="w-[320px] shrink-0 border-l border-border bg-card overflow-hidden">
            <AnnotationsPanel
              ouvrageId={o.id}
              pageCourante={data.reprisePage}
              userId={user?.id}
            />
          </aside>
        )}
      </div>
    </div>
  )
}
