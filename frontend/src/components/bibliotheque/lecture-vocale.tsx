'use client'

// ════════════════════════════════════════════════════════════════════
// LectureVocale — SECT-TTS-1 : lecture ORALE de la bibliothèque.
// ════════════════════════════════════════════════════════════════════
// Synthèse « très humaine » (voix studio Gemini : fidélité studio, jeu
// expressif, stabilité longue durée) servis par le backend en chaîne
// GRATUITE (Gemini TTS → Edge Neural en complément → Cloudflare
// MeloTTS en dernier secours — objectif 0 coût : aucune clé nouvelle,
// aucun fournisseur payant).
//
// SECT-TTS-2 : en plus des voix studio, le lecteur propose des voix
// NEURAL Azure françaises (Denise, Henri…) via Edge — sans clé et
// sans quota (illimitées). Le choix « edge:… » route directement vers
// cette couche ; en échec, le serveur rebascule sur la chaîne studio :
// l'écoute ne s'arrête jamais.
//
// UX : lire la page courante → avance AUTOMATIQUE page à page (livre
// audio), suivi de défilement (mode sécurisé : la page lue devient la
// page affichée), préchargement de la page suivante pendant l'écoute
// (transition sans trou), choix de voix studio + vitesse (mémoire
// locale), pause/reprise, arrêt.
//
// Sécurité (posture BIBLIO-14/15 inchangée) : l'API ne renvoie que des
// OCTETS audio — le texte extrait du PDF ne quitte jamais le serveur ;
// chaque écoute est journalisée comme une lecture (audit côté API).
//
// Dégradation honnête : si les fournisseurs gratuits sont saturés
// (503), message clair + bouton Réessayer — pas de repli « voix
// machine » : l'exploitant a demandé du très humain, un repli
// robotisé serait une expérience dégradée silencieuse.
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Loader2,
  Pause,
  Play,
  Square,
  Volume2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ─── Props ───

export interface LectureVocaleProps {
  ouvrageId: string
  /** Page de départ de l'écoute (évaluée à chaque démarrage). */
  pageDepart: () => number
  /** Suivi de défilement : appelé quand la lecture passe à la page n
   *  (optionnel — mode sécurisé uniquement ; mode natif : indéfini). */
  onAllerPage?: (page: number) => void
}

// ─── Voix studio (liste blanche serveur — miroir de internal/tts) ───

const VOIX_STUDIO: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'kore', label: 'Kore — posée, claire' },
  { id: 'puck', label: 'Puck — enjouée' },
  { id: 'zephyr', label: 'Zephyr — vive, brillante' },
  { id: 'charon', label: 'Charon — posée, précise' },
  { id: 'leda', label: 'Leda — douce, jeune' },
  { id: 'fenrir', label: 'Fenrir — énergique' },
  { id: 'aoede', label: 'Aoede — chaude, expressive' },
  { id: 'orus', label: 'Orus — ferme' },
  { id: 'callirrhoe', label: 'Callirrhoe — naturelle, facile à l\'oreille' },
  { id: 'sadaltager', label: 'Sadaltager — chaleureuse' },
]

// ─── Voix Neural Edge (SECT-TTS-2 — illimitées, aucune clé) : le
// préfixe edge: route côté serveur vers la couche Azure Neural. ───

const VOIX_EDGE: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'edge:denise', label: 'Denise — douce, claire' },
  { id: 'edge:henri', label: 'Henri — chaleureux' },
  { id: 'edge:eloise', label: 'Éloïse — jeune, amicale' },
  { id: 'edge:vivienne', label: 'Vivienne — expressive' },
  { id: 'edge:remy', label: 'Rémy — posé, naturel' },
]

const VITESSES: ReadonlyArray<{ id: string; label: string }> = [
  { id: '0.85', label: 'Lente' },
  { id: '1', label: 'Normale' },
  { id: '1.15', label: 'Soutenue' },
]

const CLE_VOIX = 'sect-lecture-vocale-voix'
const CLE_VITESSE = 'sect-lecture-vocale-vitesse'

type Etat = 'repos' | 'chargement' | 'lecture' | 'pause' | 'erreur'

// ─── Composant ───

export function LectureVocale({
  ouvrageId,
  pageDepart,
  onAllerPage,
}: LectureVocaleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Cache des blobs audio par page (voix/vitesse courantes) — l'écoute
  // retour-arrière ne re-synthétise rien.
  const blobsRef = useRef<Map<number, string>>(new Map())
  // Annulation des fetch en cours (stop / changement de réglages).
  const abortRef = useRef<AbortController | null>(null)
  // Garde anti-double-démarrage (le bouton reste cliquable pendant le chargement).
  const demarrageRef = useRef(false)
  // Page suivante en préchargement (une seule à la fois).
  const preloadRef = useRef<number | null>(null)

  const [etat, setEtat] = useState<Etat>('repos')
  const [pageLue, setPageLue] = useState<number | null>(null)
  const [nbPages, setNbPages] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [voix, setVoix] = useState('kore')
  const [vitesse, setVitesse] = useState('1')

  // Préférences mémorisées (best-effort).
  useEffect(() => {
    try {
      const v = localStorage.getItem(CLE_VOIX)
      if (v && (VOIX_STUDIO.some((x) => x.id === v) || VOIX_EDGE.some((x) => x.id === v)))
        setVoix(v)
      const s = localStorage.getItem(CLE_VITESSE)
      if (s && VITESSES.some((x) => x.id === s)) setVitesse(s)
    } catch {
      /* localStorage indisponible — défauts conservés */
    }
  }, [])

  // Libérer les blobs au démontage / changement d'ouvrage.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      blobsRef.current.forEach((url) => URL.revokeObjectURL(url))
      blobsRef.current.clear()
    }
  }, [ouvrageId])

  const purgerBlobs = useCallback(() => {
    blobsRef.current.forEach((url) => URL.revokeObjectURL(url))
    blobsRef.current.clear()
  }, [])

  // ─── Récupération d'une page (synthèse côté serveur) ───

  const chargerPage = useCallback(
    async (page: number): Promise<string> => {
      const cache = blobsRef.current.get(page)
      if (cache) return cache

      const ctl = new AbortController()
      abortRef.current = ctl
      try {
        const res = await fetch(
          `/api/ouvrages/${ouvrageId}/lecture-vocale?page=${page}&voice=${encodeURIComponent(voix)}&vitesse=${vitesse}`,
          { credentials: 'include', signal: ctl.signal },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(
            body?.error ||
              `Synthèse indisponible (erreur ${res.status}) — réessayez dans quelques instants`,
          )
        }
        const np = Number(res.headers.get('X-Sect-Nb-Pages'))
        if (Number.isFinite(np) && np > 0) setNbPages(np)

        const blob = await res.blob()
        if (blob.size === 0) {
          throw new Error('Audio vide renvoyé par le serveur')
        }
        const url = URL.createObjectURL(blob)
        blobsRef.current.set(page, url)
        return url
      } finally {
        if (abortRef.current === ctl) abortRef.current = null
      }
    },
    [ouvrageId, voix, vitesse],
  )

  // ─── Préchargement silencieux de la page suivante ───

  const precharger = useCallback(
    (page: number) => {
      if (nbPages && page >= nbPages) return
      if (preloadRef.current === page) return
      if (blobsRef.current.has(page)) return
      preloadRef.current = page
      chargerPage(page)
        .catch(() => {
          /* préchargement best-effort : l'erreur réelle sera celle de la lecture */
        })
        .finally(() => {
          preloadRef.current = null
        })
    },
    [chargerPage, nbPages],
  )

  // ─── Lecture d'une page ───

  const lirePage = useCallback(
    async (page: number) => {
      if (demarrageRef.current) return
      demarrageRef.current = true
      setErreur(null)
      setEtat('chargement')
      try {
        const url = await chargerPage(page)
        const audio = audioRef.current
        if (!audio) return
        audio.src = url
        setPageLue(page)
        await audio.play()
        setEtat('lecture')
        // Suivi de défilement + préchargement du suivant.
        onAllerPage?.(page)
        precharger(page + 1)
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        const message =
          err instanceof Error ? err.message : 'Erreur inconnue'
        setErreur(message)
        setEtat('erreur')
        toast.error('Lecture vocale indisponible', {
          description: message,
        })
      } finally {
        demarrageRef.current = false
      }
    },
    [chargerPage, onAllerPage, precharger],
  )

  const demarrer = useCallback(() => {
    void lirePage(pageDepart())
  }, [lirePage, pageDepart])

  const pauser = useCallback(() => {
    audioRef.current?.pause()
    setEtat('pause')
  }, [])

  const reprendre = useCallback(() => {
    void audioRef.current?.play().then(() => setEtat('lecture')).catch(() => {})
  }, [])

  const arreter = useCallback(() => {
    abortRef.current?.abort()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      // Détacher la src libère le décodeur (une page de 3 min consomme
      // un buffer décodé non négligeable sur mobile).
      audio.removeAttribute('src')
      audio.load()
    }
    setEtat('repos')
    setPageLue(null)
    setErreur(null)
  }, [])

  // Fin naturelle d'une page : avance automatique (livre audio) ou fin
  // du document — l'arrêt est propre et le cache reste pour rejouer.
  const surFin = useCallback(() => {
    const courante = pageLue
    if (courante == null) return arreter()
    if (nbPages != null && courante >= nbPages) {
      arreter()
      toast.success('Fin du document', {
        description: 'Toutes les pages ont été lues.',
      })
      return
    }
    void lirePage(courante + 1)
  }, [arreter, lirePage, nbPages, pageLue])

  // Changement de réglages en cours d'écoute : repartir proprement à la
  // page courante avec la nouvelle voix/vitesse (cache purgé — les blobs
  // précédents correspondent à l'ancienne voix).
  const changerVoix = useCallback(
    (v: string) => {
      setVoix(v)
      try {
        localStorage.setItem(CLE_VOIX, v)
      } catch {
        /* best-effort */
      }
      purgerBlobs()
      const page = pageLue ?? pageDepart()
      arreter()
      setTimeout(() => void lirePage(page), 0)
    },
    [arreter, lirePage, pageDepart, pageLue, purgerBlobs],
  )

  const changerVitesse = useCallback(
    (v: string) => {
      setVitesse(v)
      try {
        localStorage.setItem(CLE_VITESSE, v)
      } catch {
        /* best-effort */
      }
      purgerBlobs()
      const page = pageLue ?? pageDepart()
      arreter()
      setTimeout(() => void lirePage(page), 0)
    },
    [arreter, lirePage, pageDepart, pageLue, purgerBlobs],
  )

  // ─── Statut affiché ───

  const statut =
    etat === 'chargement'
      ? 'Synthèse en cours…'
      : etat === 'lecture'
        ? `Lecture — page ${pageLue}${nbPages ? ` / ${nbPages}` : ''}`
        : etat === 'pause'
          ? `Pause — page ${pageLue}`
          : etat === 'erreur'
            ? 'Indisponible'
            : `Prêt — page ${pageLue ?? '…'}`

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 md:px-5 py-2 bg-card border-b border-border text-xs shrink-0 select-none"
      role="region"
      aria-label="Lecture vocale de l'ouvrage"
    >
      <audio
        ref={audioRef}
        onEnded={surFin}
        preload="auto"
        className="hidden"
      />

      {/* Transport */}
      <div className="flex items-center gap-1">
        {etat === 'lecture' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={pauser}
            aria-label="Mettre en pause la lecture vocale"
            title="Pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={etat === 'pause' ? reprendre : demarrer}
            disabled={etat === 'chargement'}
            aria-label={
              etat === 'pause'
                ? 'Reprendre la lecture vocale'
                : 'Écouter cette page (lecture vocale)'
            }
            title={etat === 'pause' ? 'Reprendre' : 'Écouter cette page'}
          >
            {etat === 'chargement' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={arreter}
          disabled={etat === 'repos' || etat === 'chargement'}
          aria-label="Arrêter la lecture vocale"
          title="Arrêter"
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>

      {/* Statut (live : les lecteurs d'écran suivent l'avancée) */}
      <p
        className="flex items-center gap-1.5 text-muted-foreground tabular-nums whitespace-nowrap"
        aria-live="polite"
      >
        <Volume2 className="h-3.5 w-3.5" />
        {statut}
      </p>

      {/* Voix (studio Gemini + Neural Edge — groupes) */}
      <div className="flex items-center gap-1.5">
        <span className="sr-only" id="sect-vocale-voix-label">
          Voix de lecture
        </span>
        <Select value={voix} onValueChange={changerVoix}>
          <SelectTrigger
            className="h-7 w-[190px] text-xs"
            aria-labelledby="sect-vocale-voix-label"
            title="Voix de lecture"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">
                Voix studio — expressives
              </SelectLabel>
              {VOIX_STUDIO.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">
                Voix Neural — illimitées
              </SelectLabel>
              {VOIX_EDGE.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Vitesse */}
      <div className="flex items-center gap-1.5">
        <span className="sr-only" id="sect-vocale-vitesse-label">
          Vitesse de lecture
        </span>
        <Select value={vitesse} onValueChange={changerVitesse}>
          <SelectTrigger
            className="h-7 w-[110px] text-xs"
            aria-labelledby="sect-vocale-vitesse-label"
            title="Vitesse de lecture"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VITESSES.map((v) => (
              <SelectItem key={v.id} value={v.id} className="text-xs">
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Erreur + réessai (chaîne gratuite saturée : transitoire) */}
      {etat === 'erreur' && erreur && (
        <div className="flex items-center gap-2 text-destructive min-w-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={erreur}>
            {erreur}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs shrink-0"
            onClick={demarrer}
          >
            Réessayer
          </Button>
        </div>
      )}
    </div>
  )
}
