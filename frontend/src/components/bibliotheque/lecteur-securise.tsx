'use client'

// ════════════════════════════════════════════════════════════════════
// LecteurSecurise — SECT-BIBLIO-14 : lecteur CANVAS pdf.js pour les
// ouvrages dont telechargementAutorise = false
// ════════════════════════════════════════════════════════════════════
// PROBLÈME (constat exploitant) : les étudiants et enseignants arrivent
// à télécharger des livres même quand l'autorisation n'est pas accordée.
// L'API refusait bien /telechargement (403, SECT-BIBLIO-13) mais le
// lecteur in-app affichait le PDF dans une iframe → le lecteur PDF NATIF
// du navigateur rendait sa propre barre d'outils : bouton « Télécharger »,
// « Imprimer », clic-droit « Enregistrer sous » — tout cela ignore le
// flag. Le bouton « Nouvel onglet » exposait en plus l'URL présignée
// brute au lecteur natif plein écran.
//
// RÉPONSE : rendu CANVAS par pdf.js — le navigateur ne reçoit JAMAIS une
// vue « document PDF » (pas de barre d'outils native, pas de Ctrl+S vers
// le PDF, pas d'URL navigable) :
//   - octets chargés par fetch() sur /api/ouvrages/{id}/flux (MÊME
//     origine — le bucket R2 n'a pas de CORS, et l'API protège la route :
//     RLS + garde anti-navigation Sec-Fetch-Dest) ;
//   - pages rastérisées en <canvas> (une page à la fois, zoom ajusté à
//     la largeur) — clic-droit neutralisé, sélection désactivée ;
//   - impression bloquée (@media print + avertissement beforeprint) ;
//   - la page courante remonte au parent (télémétrie RÉELLE — la
//     déclaration manuelle du marque-page reste pour l'explicit).
//
// Limite honnête (pas de DRM — ADR-0007) : un utilisateur outillé
// (devtools, screenshot page à page) peut toujours extraire ce qu'il
// voit. Ce que ce lecteur garantit : PLUS AUCUN affordance de
// téléchargement pour l'utilisateur ordinaire, et l'ACTE téléchargement
// reste impossible par l'API (403 + attachment jamais émis).
// ════════════════════════════════════════════════════════════════════

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

// ─── Props ───

export interface LecteurSecuriseProps {
  ouvrageId: string
  /** Page courante (1-based) — source de vérité dans le parent. */
  page: number
  /** Notifié à CHAQUE changement de page effectif (nav clavier/boutons). */
  onPageChange: (page: number) => void
}

// ─── Constantes ───

// URL statiques même-origine — assets commités dans public/pdfjs/
// (script scripts/copy-pdfjs-assets.mjs, lancé par postinstall pour
// rester synchronisés avec la version pdfjs-dist de package.json).
const WORKER_SRC = '/pdfjs/pdf.worker.min.mjs'
const CMAP_URL = '/pdfjs/cmaps/'
const STANDARD_FONTS_URL = '/pdfjs/standard_fonts/'

// Bornes de zoom (multiplicateur sur l'échelle « ajusté à la largeur »).
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_PAS = 0.25

// Garde-fou canvas : dimensions max raisonnables (les navigateurs
// plafonnent les canvas — rester très en dessous évite le canvas vide).
const CANVAS_MAX_COTE = 8192

// CSS impression : la zone de lecture sécurisée ne s'imprime pas.
// Complété côté parent (page) par le masquage global + toast beforeprint.
const CSS_IMPRESSION = `
@media print {
  .lecteur-securise-zone { display: none !important; }
}
`

// ─── Composant ───

type EtatChargement = 'octets' | 'analyse' | 'pret' | 'erreur'

export function LecteurSecurise({
  ouvrageId,
  page,
  onPageChange,
}: LecteurSecuriseProps) {
  // ─── État ───
  const [etat, setEtat] = useState<EtatChargement>('octets')
  const [progression, setProgression] = useState(0) // % du téléchargement
  const [nbPages, setNbPages] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1) // 1 = ajusté à la largeur
  const [largeurConteneur, setLargeurConteneur] = useState(0)
  // Bumpé par « Réessayer » : relance le chargement complet.
  const [nonce, setNonce] = useState(0)

  // ─── Refs (hors état : documents/annulations ne rendent pas) ───
  // v6 pdf.js : destroy() vit sur la TÂCHE de chargement (elle détruit
  // le document ET le worker) — le PDFDocumentProxy n'expose que cleanup().
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const chargementRef = useRef<PDFDocumentLoadingTask | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const conteneurRef = useRef<HTMLDivElement>(null)
  const touchXDepart = useRef<number | null>(null)

  // ─── Chargement : octets (/flux, progression) → document pdf.js ───
  useEffect(() => {
    let annule = false
    setEtat('octets')
    setProgression(0)
    setErreur(null)
    setNbPages(null)
    setZoom(1)

    const charger = async () => {
      try {
        const res = await fetch(`/api/ouvrages/${ouvrageId}/flux`, {
          credentials: 'include',
        })
        if (annule) return
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(
            (body as { error?: string })?.error ||
              `Erreur ${res.status} lors du chargement du document`,
          )
        }

        // Progression de lecture du corps (si Content-Length exposé).
        const total = Number(res.headers.get('Content-Length')) || 0
        let octets: Uint8Array
        if (res.body) {
          const lecteur = res.body.getReader()
          const morceaux: Uint8Array[] = []
          let recus = 0
          for (;;) {
            const { done, value } = await lecteur.read()
            if (annule) {
              void lecteur.cancel().catch(() => {})
              return
            }
            if (done) break
            if (value) {
              morceaux.push(value)
              recus += value.length
              if (total > 0) {
                setProgression(
                  Math.min(99, Math.round((recus / total) * 100)),
                )
              }
            }
          }
          octets = new Uint8Array(recus)
          let decalage = 0
          for (const morceau of morceaux) {
            octets.set(morceau, decalage)
            decalage += morceau.length
          }
        } else {
          octets = new Uint8Array(await res.arrayBuffer())
        }
        if (annule) return

        setEtat('analyse')
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC
        const chargement = pdfjs.getDocument({
          data: octets,
          cMapUrl: CMAP_URL,
          cMapPacked: true,
          standardFontDataUrl: STANDARD_FONTS_URL,
        })
        const doc = await chargement.promise
        if (annule) {
          void chargement.destroy().catch(() => {})
          return
        }
        chargementRef.current = chargement
        docRef.current = doc
        setNbPages(doc.numPages)
        setEtat('pret')
      } catch (err) {
        if (annule) return
        setErreur(
          err instanceof Error ? err.message : 'Erreur inconnue',
        )
        setEtat('erreur')
      }
    }

    void charger()

    return () => {
      annule = true
      try {
        renderTaskRef.current?.cancel()
      } catch {
        // déjà terminée/annulée — rien à faire
      }
      renderTaskRef.current = null
      docRef.current = null
      const chargement = chargementRef.current
      chargementRef.current = null
      if (chargement) void chargement.destroy().catch(() => {})
    }
  }, [ouvrageId, nonce])

  // ─── Largeur du conteneur (ajustement + redimensionnement fenêtre) ───
  useEffect(() => {
    const el = conteneurRef.current
    if (!el) return
    const observer = new ResizeObserver((entrees) => {
      for (const entree of entrees) {
        setLargeurConteneur(entree.contentRect.width)
      }
    })
    observer.observe(el)
    setLargeurConteneur(el.clientWidth)
    return () => observer.disconnect()
  }, [etat])

  // ─── Rendu canvas de la page courante ───
  useEffect(() => {
    if (etat !== 'pret' || !nbPages) return
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return

    let annule = false
    // Annule le rendu précédent (changement de page/zoom/dimension).
    try {
      renderTaskRef.current?.cancel()
    } catch {
      // déjà terminée — rien à faire
    }
    renderTaskRef.current = null

    const pageNo = Math.min(Math.max(1, page), nbPages)

    const dessiner = async () => {
      try {
        const pageProxy = await doc.getPage(pageNo)
        if (annule) return

        const base = pageProxy.getViewport({ scale: 1 })
        // Échelle « ajustée » : largeur utile du conteneur / largeur
        // naturelle de la page (padding p-4 → 2×16 px de marge).
        const utile = largeurConteneur > 64 ? largeurConteneur - 32 : base.width
        const ajustee = Math.max(0.1, utile / base.width)

        const dpr = Math.max(1, window.devicePixelRatio || 1)
        let echelleCss = ajustee * zoom
        // Garde canvas : plafonne le côté le plus long (rendu net mais
        // jamais au-delà des capacités du navigateur).
        const facteurMax =
          Math.min(
            CANVAS_MAX_COTE / base.width,
            CANVAS_MAX_COTE / base.height,
          ) / dpr
        if (echelleCss > facteurMax) echelleCss = facteurMax

        const viewport = pageProxy.getViewport({
          scale: echelleCss * dpr,
        })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
        canvas.setAttribute(
          'aria-label',
          `Page ${pageNo} sur ${nbPages} du document`,
        )

        const tache = pageProxy.render({
          canvas,
          viewport,
          background: '#ffffff',
        })
        renderTaskRef.current = tache
        await tache.promise
      } catch (err) {
        if (annule) return
        const nom = (err as { name?: string })?.name
        if (nom === 'RenderingCancelledException') return
        setErreur(
          err instanceof Error
            ? `Rendu de la page impossible : ${err.message}`
            : 'Rendu de la page impossible',
        )
      }
    }

    void dessiner()

    return () => {
      annule = true
    }
    // largeurConteneur : re-rend au redimensionnement (ajustement).
  }, [etat, nbPages, page, zoom, largeurConteneur])

  // ─── Navigation ───
  const naviguer = useCallback(
    (delta: number) => {
      if (!nbPages) return
      const cible = Math.min(Math.max(1, page + delta), nbPages)
      if (cible !== page) onPageChange(cible)
    },
    [nbPages, page, onPageChange],
  )

  const allerPageSaisie = useCallback(
    (valeur: string) => {
      if (!nbPages) return
      const n = parseInt(valeur, 10)
      if (Number.isNaN(n) || n < 1 || n > nbPages) {
        toast.error('Numéro de page invalide', {
          description: `Entrez un numéro entre 1 et ${nbPages}.`,
        })
        return
      }
      if (n !== page) onPageChange(n)
    },
    [nbPages, page, onPageChange],
  )

  // Clavier : ← / PageUp précédent, → / PageDown suivant (sauf saisie).
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null
      if (
        cible &&
        (cible.tagName === 'INPUT' ||
          cible.tagName === 'TEXTAREA' ||
          cible.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        naviguer(-1)
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        naviguer(1)
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [naviguer])

  // Avertissement d'impression (le CSS masque déjà la zone imprimée).
  useEffect(() => {
    const avertir = () => {
      toast.warning('Impression désactivée', {
        description:
          'Ce document est réservé à la lecture en ligne (téléchargement non autorisé par le déposant).',
      })
    }
    window.addEventListener('beforeprint', avertir)
    return () => window.removeEventListener('beforeprint', avertir)
  }, [])

  // ─── Rendu ───

  if (etat === 'erreur') {
    return (
      <ZoneMessage>
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-medium">Lecture impossible</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          {erreur}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setNonce((n) => n + 1)}
        >
          <RotateCcw className="h-4 w-4" />
          Réessayer
        </Button>
      </ZoneMessage>
    )
  }

  if (etat !== 'pret') {
    return (
      <ZoneMessage>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {etat === 'octets'
            ? 'Chargement sécurisé du document…'
            : 'Préparation de l’affichage sécurisé…'}
        </p>
        {etat === 'octets' && progression > 0 && (
          <div className="w-64 max-w-full">
            <Progress value={progression} className="h-2" />
            <p className="mt-1.5 text-xs text-muted-foreground text-center">
              {progression} %
            </p>
          </div>
        )}
      </ZoneMessage>
    )
  }

  return (
    <div className="lecteur-securise-zone h-full w-full flex flex-col min-h-0">
      {/* CSS garde : la zone ne s'imprime pas (SECT-BIBLIO-14). */}
      <style>{CSS_IMPRESSION}</style>

      {/* Barre de navigation/zoom — remplace la barre d'outils du lecteur
          natif (supprimée avec lui : c'était la fuite). */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-1.5 border-b border-border bg-card shrink-0 select-none">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => naviguer(-1)}
            disabled={page <= 1}
            aria-label="Page précédente"
            title="Page précédente (←)"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {page} / {nbPages ?? '…'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => naviguer(1)}
            disabled={!nbPages || page >= nbPages}
            aria-label="Page suivante"
            title="Page suivante (→)"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            max={nbPages ?? undefined}
            className="h-7 w-[70px] text-xs"
            defaultValue={page}
            key={page}
            aria-label="Aller à la page"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                allerPageSaisie((e.target as HTMLInputElement).value)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_PAS))
            }
            disabled={zoom <= ZOOM_MIN}
            aria-label="Réduire le zoom"
            title="Réduire"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">
            {Math.round(zoom * 100)} %
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_PAS))
            }
            disabled={zoom >= ZOOM_MAX}
            aria-label="Agrandir le zoom"
            title="Agrandir"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
            aria-label="Ajuster à la largeur"
            title="Ajuster à la largeur"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Zone de rendu : UNE page en canvas. Pas d'iframe, pas de
          <embed>, pas de vue « document » — le navigateur n'a rien à
          offrir comme bouton « Télécharger ». Clic-droit neutralisé,
          glisser-déposer impossible, sélection désactivée. */}
      <div
        ref={conteneurRef}
        className="flex-1 min-h-0 overflow-auto bg-muted/30 p-4 flex justify-center items-start"
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={(e) => {
          touchXDepart.current =
            e.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          if (touchXDepart.current == null) return
          const dx =
            (e.changedTouches[0]?.clientX ?? 0) - touchXDepart.current
          touchXDepart.current = null
          if (Math.abs(dx) > 60) naviguer(dx > 0 ? -1 : 1)
        }}
      >
        <canvas
          ref={canvasRef}
          className="block bg-white shadow-lg rounded-sm max-w-none"
          draggable={false}
          role="img"
        />
      </div>
    </div>
  )
}

// ─── Zone centrée (chargement / erreur) ───

function ZoneMessage({ children }: { children: ReactNode }) {
  return (
    <div className="lecteur-securise-zone h-full w-full flex flex-col items-center justify-center gap-3 px-6 text-center">
      <style>{CSS_IMPRESSION}</style>
      {children}
    </div>
  )
}
