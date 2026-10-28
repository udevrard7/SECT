'use client'

// ════════════════════════════════════════════════════════════════════
// LecteurSecurise — SECT-BIBLIO-15 : lecteur CANVAS pdf.js à DÉFILEMENT
// CONTINU pour les ouvrages dont telechargementAutorise = false
// ════════════════════════════════════════════════════════════════════
// HISTORIQUE :
//   - SECT-BIBLIO-14 : rendu CANVAS pdf.js (jamais d'iframe, jamais
//     d'URL présignée) — une page à la fois. Corrigeait la fuite du
//     bouton « Télécharger » du lecteur PDF natif.
//   - SECT-BIBLIO-15 (retour exploitant) : « la lecture avec scroll
//     vertical était mieux » — le feuilletage page à page casse le
//     flux de lecture d'un manuel A4 qu'on ÉTUDIE (un geste explicite
//     par page, pas de survol, pas de repère spatial). Le défilement
//     continu devient le mode PAR DÉFAUT ; l'« effet livre numérique »
//     vient de la présentation (pages empilées, ombre portée, numéro
//     de page, sauts fluides, barre de progression), pas d'une
//     pagination contrainte. Le mode page-par-page reste disponible
//     (bascule mémorisée) pour ceux qui zooment fort.
//
// SÉCURITÉ — inchangée et non négociable (SECT-BIBLIO-14) :
//   - octets chargés par fetch() sur /api/ouvrages/{id}/flux (MÊME
//     origine — le bucket R2 n'a pas de CORS, et l'API protège la
//     route : RLS + garde anti-navigation Sec-Fetch-Dest) ;
//   - pages rastérisées en <canvas> — le navigateur ne reçoit JAMAIS
//     une vue « document PDF » (pas de barre d'outils native, pas de
//     Ctrl+S vers le PDF, pas d'URL navigable) ;
//   - clic-droit neutralisé, sélection désactivée, glisser impossible ;
//   - impression bloquée (@media print + avertissement beforeprint).
//
// MÉMOIRE BORNÉE en mode continu (le point délicat) : les pages sont
// rendues PARESSEUSEMENT via IntersectionObserver (rootMargin 75 % →
// ~0,75 viewport au-dessus/en-dessous) — seules 4-6 pages vivent en
// canvas à un instant donné ; celles qui sortent de la zone libèrent
// leur backing store (canvas.width = 0). Un ouvrage de 400 pages
// n'occupe jamais plus de ~6 canvases.
//
// TÉLÉMÉTRIE RÉELLE : la « page courante » = la page sous la ligne de
// lecture (40 % de la hauteur du viewport), rafraîchie à chaque frame
// de défilement ; la remontée parent (onPageChange → pagesVues /
// dernierePage) est engagée après stabilisation (250 ms sans scroll)
// — les pages qui défilent sous les yeux sans s'arrêter ne comptent
// pas comme « vues ». La reprise à l'ouverture défile jusqu'à la page
// enregistrée SANS la compter (comportement BIBLIO-14 conservé).
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type ReactNode,
} from 'react'
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoveVertical,
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
  /** Notifié à CHAQUE changement de page effectif (nav clavier/boutons
   *  en mode paginé ; position de lecture stabilisée en mode continu). */
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

// Mode d'affichage préféré (localStorage, best-effort) — défaut continu.
const CLE_MODE_LECTURE = 'sect-lecteur-mode-affichage'

// ─── Mode continu : géométrie & rendu paresseux ───

// Taille des lots de lecture des dimensions de pages (worker pdf.js).
const TAILLE_LOT_DIMS = 25
// Ligne de lecture : la page « courante » est celle qui chevauche 40 %
// de la hauteur du viewport (où se pose l'œil qui lit).
const LIGNE_LECTURE = 0.4
// Délai de stabilisation du défilement avant de déclarer la page lue.
const DELAI_STABILISATION_MS = 250
// Zone de rendu paresseux : IntersectionObserver avec marge verticale
// de 75 % du conteneur → rend ~0,75 viewport avant/après le visible.
const MARGE_RENDU = '75% 0px'
// Géométrie de l'empilement (doit rester synchronisée avec les classes
// du sizer : my-4 → 16, gap-4 → 16, px-4 → 16 de chaque côté).
const MARGE_V = 16
const ECART_PAGES = 16
const MARGE_H = 16

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
  const [progression, setProgression] = useState(0) // % octets puis % pages
  const [nbPages, setNbPages] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1) // 1 = ajusté à la largeur
  const [largeurConteneur, setLargeurConteneur] = useState(0)
  // Bumpé par « Réessayer » : relance le chargement complet.
  const [nonce, setNonce] = useState(0)
  // SECT-BIBLIO-15 : dimensions de TOUTES les pages (échelle 1) —
  // nécessaires aux placeholders (pas de saut de mise en page quand
  // une page se rastérise), aux offsets de défilement et au scroll-spy.
  const [dimsPages, setDimsPages] = useState<
    ReadonlyArray<{ w: number; h: number }> | null
  >(null)
  // Mode d'affichage : continu (défaut) ou paginé — mémorisé.
  const [modeContinu, setModeContinu] = useState(true)
  // Pages dans la zone de rendu paresseux (IntersectionObserver).
  const [visibilite, setVisibilite] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  )
  // Page courante en mode continu (indicateur live, suit le scroll).
  const [pageLocale, setPageLocale] = useState(1)
  // Progression de lecture en mode continu (% de l'ouvrage défilé).
  const [progr, setProgr] = useState(0)
  // Finesse d'écran (rastérisation nette sur écrans hidpi).
  // ⚠️ SSR-safe : l'initialiseur tourne AUSSI côté serveur au premier
  // rendu (la page du lecteur est server-rendered) — 1 par défaut, la
  // vraie valeur au premier rendu client. Aucun mismatch d'hydratation :
  // dpr n'affecte que les attributs canvas (jamais le HTML rendu).
  const [dpr] = useState(() =>
    typeof window === 'undefined'
      ? 1
      : Math.max(1, window.devicePixelRatio || 1),
  )

  // ─── Refs (hors état : documents/annulations ne rendent pas) ───
  // v6 pdf.js : destroy() vit sur la TÂCHE de chargement (elle détruit
  // le document ET le worker) — le PDFDocumentProxy n'expose que cleanup().
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const chargementRef = useRef<PDFDocumentLoadingTask | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null) // mode paginé
  const canvasRef = useRef<HTMLCanvasElement>(null) // mode paginé
  const conteneurRef = useRef<HTMLDivElement>(null)
  const touchXDepart = useRef<number | null>(null)
  // Mode continu :
  const offsetsRef = useRef<ReadonlyArray<number> | null>(null)
  const pageLocaleRef = useRef(1)
  const pagePropRef = useRef(page)
  const dernierePageNotifieeRef = useRef(1)
  const sautInitialFait = useRef(false)
  const rafDefilementRef = useRef(0)
  const stabilisationRef = useRef(0)

  // ─── Chargement : octets (/flux) → document → dimensions des pages ───
  useEffect(() => {
    let annule = false
    setEtat('octets')
    setProgression(0)
    setErreur(null)
    setNbPages(null)
    setZoom(1)
    setDimsPages(null)
    setVisibilite(new Set<number>())
    setPageLocale(1)
    pageLocaleRef.current = 1
    dernierePageNotifieeRef.current = 1
    sautInitialFait.current = false
    setProgr(0)

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
        setProgression(0)
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

        // SECT-BIBLIO-15 : dimensions de toutes les pages (par lots,
        // worker pdf.js — rapide, aucune rastérisation). Indispensable
        // aux placeholders de hauteur exacte : la barre de défilement
        // est HONNÊTE dès le premier rendu (longueur totale réelle),
        // et les sauts « aller à la page N » tombent juste.
        const dims = new Array<{ w: number; h: number }>(doc.numPages)
        for (let debut = 0; debut < doc.numPages; debut += TAILLE_LOT_DIMS) {
          if (annule) return
          const fin = Math.min(debut + TAILLE_LOT_DIMS, doc.numPages)
          const proxies = await Promise.all(
            Array.from({ length: fin - debut }, (_, k) =>
              doc.getPage(debut + k + 1),
            ),
          )
          if (annule) return
          for (let k = 0; k < proxies.length; k++) {
            const vp = proxies[k].getViewport({ scale: 1 })
            dims[debut + k] = { w: vp.width, h: vp.height }
          }
          setProgression(
            Math.min(99, Math.round((fin / doc.numPages) * 100)),
          )
        }
        if (annule) return

        setDimsPages(dims)
        setNbPages(doc.numPages)
        setEtat('pret')
        setProgression(100)
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

  // Préférence de mode mémorisée (best-effort).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLE_MODE_LECTURE) === 'page') {
        setModeContinu(false)
      }
    } catch {
      // stockage indisponible — défaut : continu
    }
  }, [])

  const basculerMode = useCallback(() => {
    setModeContinu((v) => {
      const suivant = !v
      try {
        window.localStorage.setItem(
          CLE_MODE_LECTURE,
          suivant ? 'continu' : 'page',
        )
      } catch {
        // best-effort uniquement
      }
      return suivant
    })
  }, [])

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
  }, [etat, modeContinu])

  // ─── Géométrie du mode continu (dérivée, jamais en état) ───
  // Largeur CSS d'une page : ajustée à la largeur utile × zoom.
  const largeurUtile = Math.max(240, largeurConteneur - MARGE_H * 2)
  const largeurPage = largeurUtile * zoom
  // offsets[i] = position verticale du HAUT de la page i+1 depuis le
  // début du contenu (padding inclus) — base des sauts et du scroll-spy.
  const offsets = useMemo(() => {
    if (!dimsPages || dimsPages.length === 0) return null
    const offs = new Array<number>(dimsPages.length)
    let acc = MARGE_V
    for (let i = 0; i < dimsPages.length; i++) {
      offs[i] = acc
      acc += (largeurPage * dimsPages[i].h) / dimsPages[i].w + ECART_PAGES
    }
    return offs
  }, [dimsPages, largeurPage])

  // Synchronisation du ref d'offsets AVANT les effets qui l'utilisent
  // (ordre de déclaration = ordre d'exécution).
  useLayoutEffect(() => {
    offsetsRef.current = offsets
  }, [offsets])

  // pagePropRef : valeur de la prop `page` hors cycle de rendu (le saut
  // initial ne doit PAS redéclencher à chaque signalement de position).
  useEffect(() => {
    pagePropRef.current = page
  }, [page])

  // ─── Saut initial / retour en mode continu ───
  // Au premier rendu des pages (document prêt) ou en revenant du mode
  // paginé : positionne le défilement sur la page du parent (reprise),
  // SANS la déclarer comme nouvelle page vue (comportement BIBLIO-14).
  useLayoutEffect(() => {
    if (!modeContinu || !dimsPages) return
    const conteneur = conteneurRef.current
    const offs = offsetsRef.current
    if (!conteneur || !offs || offs.length === 0) return
    const cible = Math.min(Math.max(1, pagePropRef.current), offs.length)
    conteneur.scrollTop = offs[cible - 1] // instantané, sans animation
    pageLocaleRef.current = cible
    setPageLocale(cible)
    dernierePageNotifieeRef.current = cible
    sautInitialFait.current = true
  }, [dimsPages, modeContinu])

  // ─── Rendu paresseux : IntersectionObserver sur les emplacements ───
  useLayoutEffect(() => {
    if (!modeContinu || !dimsPages) return
    const conteneur = conteneurRef.current
    if (!conteneur) return
    const observateur = new IntersectionObserver(
      (entrees) => {
        setVisibilite((prev) => {
          let modifie = false
          const suivant = new Set(prev)
          for (const entree of entrees) {
            const n = Number((entree.target as HTMLElement).dataset.page)
            if (Number.isNaN(n)) continue
            if (entree.isIntersecting) {
              if (!suivant.has(n)) {
                suivant.add(n)
                modifie = true
              }
            } else if (suivant.has(n)) {
              suivant.delete(n)
              modifie = true
            }
          }
          return modifie ? suivant : prev
        })
      },
      { root: conteneur, rootMargin: MARGE_RENDU, threshold: 0 },
    )
    conteneur
      .querySelectorAll<HTMLElement>('[data-page]')
      .forEach((el) => observateur.observe(el))
    return () => {
      observateur.disconnect()
      setVisibilite(new Set<number>())
    }
  }, [dimsPages, modeContinu])

  // ─── Restauration de position après zoom / redimensionnement ───
  // Le haut de la page courante reste ancré en haut du viewport quand
  // la géométrie change (zoom, ouverture du panneau d'annotations…).
  useLayoutEffect(() => {
    if (!modeContinu || !sautInitialFait.current) return
    const conteneur = conteneurRef.current
    const offs = offsetsRef.current
    if (!conteneur || !offs || offs.length === 0) return
    const cible = Math.min(Math.max(1, pageLocaleRef.current), offs.length)
    conteneur.scrollTop = offs[cible - 1]
  }, [largeurPage, largeurConteneur, modeContinu])

  // ─── Navigation externe de la prop page (mode continu) ───
  // « Reprendre au début », marque-page… : la page demandée arrive par
  // le parent → défilement FLUIDE. Les échos de nos propres signalements
  // sont ignorés (dernierePageNotifiee) — pas de boucle, pas de double
  // comptage de télémétrie.
  useEffect(() => {
    if (!modeContinu || etat !== 'pret' || !dimsPages) return
    if (page === dernierePageNotifieeRef.current) return
    const offs = offsetsRef.current
    if (!offs || offs.length === 0) return
    const cible = Math.min(Math.max(1, page), offs.length)
    conteneurRef.current?.scrollTo({
      top: offs[cible - 1],
      behavior: 'smooth',
    })
    pageLocaleRef.current = cible
    setPageLocale(cible)
    dernierePageNotifieeRef.current = cible
  }, [page, modeContinu, etat, dimsPages])

  // ─── Scroll-spy (mode continu) ───
  // À chaque frame de défilement : progression de lecture + page sous
  // la ligne de lecture (recherche dichotomique dans les offsets). La
  // remontée télémétrique n'est engagée qu'après stabilisation (250 ms
  // sans défilement) — survoler un ouvrage ne l'archive pas page à page.
  const surDefilement = useCallback(() => {
    if (rafDefilementRef.current !== 0) return
    rafDefilementRef.current = requestAnimationFrame(() => {
      rafDefilementRef.current = 0
      const conteneur = conteneurRef.current
      const offs = offsetsRef.current
      if (!conteneur || !offs || offs.length === 0) return
      const max = conteneur.scrollHeight - conteneur.clientHeight
      setProgr(
        max > 0
          ? Math.min(100, Math.round((conteneur.scrollTop / max) * 100))
          : 0,
      )
      const ligne = conteneur.scrollTop + conteneur.clientHeight * LIGNE_LECTURE
      let n = 1
      let bas = 0
      let haut = offs.length - 1
      while (bas <= haut) {
        const milieu = (bas + haut) >> 1
        if (offs[milieu] <= ligne) {
          n = milieu + 1
          bas = milieu + 1
        } else {
          haut = milieu - 1
        }
      }
      if (n !== pageLocaleRef.current) {
        pageLocaleRef.current = n
        setPageLocale(n)
      }
      window.clearTimeout(stabilisationRef.current)
      stabilisationRef.current = window.setTimeout(() => {
        if (pageLocaleRef.current !== dernierePageNotifieeRef.current) {
          dernierePageNotifieeRef.current = pageLocaleRef.current
          onPageChange(pageLocaleRef.current)
        }
      }, DELAI_STABILISATION_MS)
    })
  }, [onPageChange])

  // Nettoyage des minuteurs au démontage.
  useEffect(() => {
    return () => {
      if (rafDefilementRef.current !== 0) {
        cancelAnimationFrame(rafDefilementRef.current)
      }
      window.clearTimeout(stabilisationRef.current)
    }
  }, [])

  // ─── Aller à une page par défilement (mode continu) ───
  const allerPageDefile = useCallback((n: number) => {
    const offs = offsetsRef.current
    if (!offs || offs.length === 0) return
    const cible = Math.min(Math.max(1, n), offs.length)
    conteneurRef.current?.scrollTo({
      top: offs[cible - 1],
      behavior: 'smooth',
    })
    if (cible !== pageLocaleRef.current) {
      pageLocaleRef.current = cible
      setPageLocale(cible)
    }
  }, [])

  // ─── SECT-TTS-1 : suivi de la lecture vocale (page changée par le
  // parent SANS que ce soit le lecteur — l'audio avance, le texte suit).
  // Miroir de la reprise initiale : défiler en douceur vers la page,
  // SANS la déclarer comme nouvelle page vue — elle est déjà comptée par
  // l'avancée vocale (onPageChange parental) ; on aligne
  // dernierePageNotifiee pour que le scroll-spy ne la re-compte pas.
  // (Quand c'est le LECTEUR qui signale : page === pageLocale → no-op.)
  useEffect(() => {
    if (!modeContinu || !sautInitialFait.current) return
    if (page === pageLocaleRef.current) return
    const cible = Math.min(Math.max(1, page), nbPages ?? 1)
    allerPageDefile(cible)
    dernierePageNotifieeRef.current = cible
  }, [page, modeContinu, nbPages, allerPageDefile])

  // ─── Rendu canvas de la page courante (MODE PAGINÉ — BIBLIO-14) ───
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

  // ─── Navigation (boutons ‹ › : page ± 1 dans les deux modes) ───
  const naviguer = useCallback(
    (delta: number) => {
      if (!nbPages) return
      if (modeContinu) {
        allerPageDefile(pageLocaleRef.current + delta)
      } else {
        const cible = Math.min(Math.max(1, page + delta), nbPages)
        if (cible !== page) onPageChange(cible)
      }
    },
    [nbPages, modeContinu, page, onPageChange, allerPageDefile],
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
      if (modeContinu) {
        allerPageDefile(n)
      } else if (n !== page) {
        onPageChange(n)
      }
    },
    [nbPages, modeContinu, page, onPageChange, allerPageDefile],
  )

  // Clavier — mode continu : PageUp/PageDown = page précédente/suivante
  // (défilement fluide), Home/End = début/fin ; ↑↓ et la molette restent
  // NATIFS (c'est tout l'intérêt du défilement continu). Mode paginé :
  // ← / → / PageUp / PageDown comme en BIBLIO-14.
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
      if (modeContinu) {
        if (e.key === 'PageDown') {
          e.preventDefault()
          allerPageDefile(pageLocaleRef.current + 1)
        } else if (e.key === 'PageUp') {
          e.preventDefault()
          allerPageDefile(pageLocaleRef.current - 1)
        } else if (e.key === 'Home') {
          e.preventDefault()
          conteneurRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        } else if (e.key === 'End') {
          const conteneur = conteneurRef.current
          if (conteneur) {
            e.preventDefault()
            conteneur.scrollTo({
              top: conteneur.scrollHeight,
              behavior: 'smooth',
            })
          }
        }
      } else {
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault()
          naviguer(-1)
        } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
          e.preventDefault()
          naviguer(1)
        }
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [modeContinu, etat, naviguer, allerPageDefile])

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
        {progression > 0 && (
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

  // Non-null garanti : dimsPages n'est posé qu'après docRef (même
  // transition d'état) — et les pages ne rendent que si dimsPages existe.
  const doc = docRef.current!

  return (
    <div className="lecteur-securise-zone h-full w-full flex flex-col min-h-0">
      {/* CSS garde : la zone ne s'imprime pas (SECT-BIBLIO-14). */}
      <style>{CSS_IMPRESSION}</style>

      {/* Barre de navigation/zoom — remplace la barre d'outils du lecteur
          natif (supprimée avec lui : c'était la fuite). SECT-BIBLIO-15 :
          bascule de mode + progression de lecture en mode continu. */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-1.5 border-b border-border bg-card shrink-0 select-none">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => naviguer(-1)}
            disabled={modeContinu ? pageLocale <= 1 : page <= 1}
            aria-label="Page précédente"
            title="Page précédente (PageUp)"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {modeContinu ? pageLocale : page} / {nbPages ?? '…'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => naviguer(1)}
            disabled={
              modeContinu
                ? !nbPages || pageLocale >= nbPages
                : !nbPages || page >= nbPages
            }
            aria-label="Page suivante"
            title="Page suivante (PageDown)"
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
            defaultValue={modeContinu ? pageLocale : page}
            key={modeContinu ? pageLocale : page}
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
        {/* SECT-BIBLIO-15 : bascule défilement continu ↔ page par page
            (l'icône montre le mode cible — le confort duquel on bascule). */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={basculerMode}
          aria-pressed={modeContinu}
          title={
            modeContinu
              ? 'Passer en affichage page par page'
              : 'Revenir au défilement continu (recommandé pour étudier)'
          }
        >
          {modeContinu ? (
            <BookOpen className="h-4 w-4" />
          ) : (
            <MoveVertical className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Progression de lecture (mode continu) — fine, décorative. */}
      {modeContinu && (
        <div className="h-0.5 shrink-0 bg-border" aria-hidden="true">
          <div
            className="h-full bg-primary/60 transition-[width] duration-150"
            style={{ width: `${progr}%` }}
          />
        </div>
      )}

      {modeContinu ? (
        /* ─── MODE CONTINU (SECT-BIBLIO-15) ───
            Toutes les pages empilées, défilement vertical natif, rendu
            paresseux par IntersectionObserver (mémoire bornée : seules
            les pages proches du viewport vivent en canvas). Pas
            d'iframe, pas de <embed>, pas de vue « document » — le
            navigateur n'a rien à offrir comme bouton « Télécharger ».
            Clic-droit neutralisé, sélection désactivée. */
        <div
          ref={conteneurRef}
          className="lecteur-securise-zone flex-1 min-h-0 overflow-auto bg-muted/30 flex flex-col select-none [scrollbar-gutter:stable]"
          onContextMenu={(e) => e.preventDefault()}
          onScroll={surDefilement}
          role="region"
          aria-label={`Ouvrage en défilement continu — ${nbPages ?? '…'} pages`}
        >
          <div className="mx-auto my-4 w-max px-4 flex flex-col items-center gap-4">
            {dimsPages?.map((d, i) => (
              <PageOuvrage
                key={i + 1}
                doc={doc}
                pageNo={i + 1}
                nbPages={nbPages ?? dimsPages.length}
                largeurCss={largeurPage}
                hauteurCss={(largeurPage * d.h) / d.w}
                dpr={dpr}
                visible={visibilite.has(i + 1)}
              />
            ))}
          </div>
        </div>
      ) : (
        /* ─── MODE PAGINÉ (BIBLIO-14, inchangé) ───
            Une page en canvas. */
        <div
          ref={conteneurRef}
          className="flex-1 min-h-0 overflow-auto bg-muted/30 p-4 flex justify-center items-start select-none"
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={(e) => {
            touchXDepart.current = e.touches[0]?.clientX ?? null
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
      )}
    </div>
  )
}

// ─── Page individuelle (mode continu) ───

interface PageOuvrageProps {
  doc: PDFDocumentProxy
  pageNo: number // 1-based
  nbPages: number
  largeurCss: number
  hauteurCss: number
  dpr: number
  /** Dans la zone de rendu paresseux (IntersectionObserver). */
  visible: boolean
}

// memo : toutes les props sont des primitives (ou la référence stable du
// document) — seules les pages dont la visibilité/geometry change se
// re-rendent, même sur un ouvrage de 400 pages.
const PageOuvrage = memo(function PageOuvrage({
  doc,
  pageNo,
  nbPages,
  largeurCss,
  hauteurCss,
  dpr,
  visible,
}: PageOuvrageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!visible) {
      // Hors zone : libère le backing store — c'est ce qui borne la
      // mémoire (un ouvrage de N pages ne garde que ~6 canvases vivants).
      if (canvas.width !== 0 || canvas.height !== 0) {
        canvas.width = 0
        canvas.height = 0
      }
      return
    }
    let annule = false
    let tache: RenderTask | null = null
    setEnCours(true)
    setEchec(false)
    ;(async () => {
      try {
        const pageProxy = await doc.getPage(pageNo)
        if (annule) return
        const base = pageProxy.getViewport({ scale: 1 })
        const echelle = (largeurCss / base.width) * dpr
        // Garde canvas : plafonne le côté le plus long (zoom extrême sur
        // grande page — rendu légèrement mou plutôt que canvas vide).
        const plafond = CANVAS_MAX_COTE / Math.max(base.width, base.height)
        const viewport = pageProxy.getViewport({
          scale: Math.min(echelle, plafond),
        })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        tache = pageProxy.render({ canvas, viewport, background: '#ffffff' })
        await tache.promise
      } catch (err) {
        if (annule) return
        const nom = (err as { name?: string })?.name
        if (nom === 'RenderingCancelledException') return
        setEchec(true)
      } finally {
        if (!annule) setEnCours(false)
      }
    })()
    return () => {
      annule = true
      try {
        tache?.cancel()
      } catch {
        // déjà terminée/annulée — rien à faire
      }
    }
  }, [doc, pageNo, visible, largeurCss, dpr])

  return (
    <div
      data-page={pageNo}
      className={`relative shrink-0 rounded-[2px] shadow-md ${
        visible ? 'bg-white' : 'bg-muted/40'
      }`}
      style={{ width: largeurCss, height: hauteurCss }}
    >
      <canvas
        ref={canvasRef}
        className="block max-w-none"
        style={{ width: largeurCss, height: hauteurCss }}
        draggable={false}
        role="img"
        aria-label={`Page ${pageNo} sur ${nbPages}`}
      />
      {enCours && !echec && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
        </div>
      )}
      {echec && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <span className="text-[11px] text-muted-foreground">
            Page indisponible
          </span>
        </div>
      )}
      {/* Numéro de page — discret, dans la marge basse droite. */}
      <span
        className="absolute bottom-1 right-1.5 text-[10px] leading-none font-medium text-black/20 select-none pointer-events-none"
        aria-hidden="true"
      >
        {pageNo} / {nbPages}
      </span>
    </div>
  )
})

// ─── Zone centrée (chargement / erreur) ───

function ZoneMessage({ children }: { children: ReactNode }) {
  return (
    <div className="lecteur-securise-zone h-full w-full flex flex-col items-center justify-center gap-3 px-6 text-center">
      <style>{CSS_IMPRESSION}</style>
      {children}
    </div>
  )
}
