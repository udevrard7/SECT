'use client'

// ════════════════════════════════════════════════════════════════════
// LectureVocale — SECT-TTS-1 : lecture ORALE de la bibliothèque.
// ════════════════════════════════════════════════════════════════════
// Synthèse « très humaine » (voix studio Gemini : fidélité studio, jeu
// expressif, stabilité longue durée) servis par le backend en chaîne
// GRATUITE (Gemini TTS → Cloudflare MeloTTS en dernier secours —
// objectif 0 coût : aucune clé nouvelle, aucun fournisseur payant).
//
// SECT-TTS-4 : les voix « Neural » Edge (SECT-TTS-2) sont RETIRÉES —
// leur MP3 48 kbps sonnait robotique dès que le quota Gemini était
// consommé, la bascule serveur substituait silencieusement la voix
// demandée (le changement en cours de lecture paraissait cassé) et le
// moteur lisait le texte littéralement (épellation lettre à lettre).
// Le lecteur ne propose PLUS que les voix studio Gemini : la voix
// choisie est la voix servie.
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
  ouvrageId?: string
  /** SECT-TTS-3 : endpoint TTS COMPLET (ex. /api/exam-prep/documents/{id}/
   *  lecture-vocale) — réutilise ce lecteur hors bibliothèque. Défaut :
   *  l'endpoint ouvrage (ouvrageId requis). */
  endpoint?: string
  /** Nom du paramètre d'unité envoyé à l'API (« page » bibliothèque,
   *  « segment » exam-prep). Défaut : page. */
  paramPage?: string
  /** Libellé de l'unité lue (« page » bibliothèque, « partie » exam-prep). */
  unite?: 'page' | 'partie'
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
  endpoint,
  paramPage,
  unite,
  pageDepart,
  onAllerPage,
}: LectureVocaleProps) {
  // Endpoint effectif : override explicite (exam-prep) sinon bibliothèque.
  const base =
    endpoint ?? `/api/ouvrages/${ouvrageId ?? ''}/lecture-vocale`
  const param = paramPage ?? 'page'
  const labelUnite = unite ?? 'page'
  const cleRessource = endpoint ?? ouvrageId ?? ''

  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Cache des blobs audio, indexé par « voix|vitesse|page » (SECT-TTS-4 :
  // l'indexation par réglages élimine la course où un préchargement en
  // vol avec l'ANCIENNE voix polluait le cache après un changement —
  // le retour-arrière ne re-synthétise jamais ce qui est déjà joué).
  const blobsRef = useRef<Map<string, string>>(new Map())
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

  // Préférences mémorisées (best-effort). SECT-TTS-4 : une ancienne
  // valeur « edge:… » en localStorage ne correspond plus à aucune voix
  // proposée → ignorée, le défaut kore s'applique.
  useEffect(() => {
    try {
      const v = localStorage.getItem(CLE_VOIX)
      if (v && VOIX_STUDIO.some((x) => x.id === v)) setVoix(v)
      const s = localStorage.getItem(CLE_VITESSE)
      if (s && VITESSES.some((x) => x.id === s)) setVitesse(s)
    } catch {
      /* localStorage indisponible — défauts conservés */
    }
  }, [])

  // Libérer les blobs au démontage / changement de ressource.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      blobsRef.current.forEach((url) => URL.revokeObjectURL(url))
      blobsRef.current.clear()
    }
  }, [cleRessource])

  const purgerBlobs = useCallback(() => {
    blobsRef.current.forEach((url) => URL.revokeObjectURL(url))
    blobsRef.current.clear()
  }, [])

  // ─── Récupération d'une page (synthèse côté serveur) ───

  // Réglages explicites : SECT-TTS-4 corrige ici le bug du changement de
  // voix en cours de lecture — l'ancienne version relançait la page via
  // un setTimeout capturant la closure de l'État PRÉCÉDENT (React n'a pas
  // encore re-rendu), donc la re-synthèse partait avec l'ANCIENNE voix.
  // La voix/vitesse demandées passent désormais EXPLICITEMENT en
  // paramètre, indépendamment du cycle de rendu.
  interface Reglages {
    voix?: string
    vitesse?: string
  }

  const chargerPage = useCallback(
    async (page: number, regl?: Reglages): Promise<string> => {
      const vx = regl?.voix ?? voix
      const vt = regl?.vitesse ?? vitesse
      const cle = `${vx}|${vt}|${page}`
      const cache = blobsRef.current.get(cle)
      if (cache) return cache

      const ctl = new AbortController()
      abortRef.current = ctl
      try {
        const res = await fetch(
          `${base}?${param}=${page}&voice=${encodeURIComponent(vx)}&vitesse=${vt}`,
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
        blobsRef.current.set(cle, url)
        return url
      } finally {
        if (abortRef.current === ctl) abortRef.current = null
      }
    },
    [base, param, voix, vitesse],
  )

  // ─── Préchargement silencieux de la page suivante ───

  const precharger = useCallback(
    (page: number) => {
      if (nbPages && page >= nbPages) return
      if (preloadRef.current === page) return
      if (blobsRef.current.has(`${voix}|${vitesse}|${page}`)) return
      preloadRef.current = page
      chargerPage(page)
        .catch(() => {
          /* préchargement best-effort : l'erreur réelle sera celle de la lecture */
        })
        .finally(() => {
          preloadRef.current = null
        })
    },
    [chargerPage, nbPages, voix, vitesse],
  )

  // ─── Lecture d'une page ───

  const lirePage = useCallback(
    async (page: number, regl?: Reglages) => {
      if (demarrageRef.current) return
      demarrageRef.current = true
      setErreur(null)
      setEtat('chargement')
      try {
        const url = await chargerPage(page, regl)
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
        description: 'Tout le document a été lu.',
      })
      return
    }
    void lirePage(courante + 1)
  }, [arreter, lirePage, nbPages, pageLue])

  // Changement de réglages en cours d'écoute : repartir proprement à la
  // page courante avec la nouvelle voix/vitesse. SECT-TTS-4 : la nouvelle
  // valeur passe EXPLICITEMENT à lirePage (plus de closure périmée — le
  // setTimeout ne capturait que l'ancien état, la page repartait avec
  // l'ancienne voix et le changement paraissait sans effet).
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
      setTimeout(() => void lirePage(page, { voix: v }), 0)
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
      setTimeout(() => void lirePage(page, { vitesse: v }), 0)
    },
    [arreter, lirePage, pageDepart, pageLue, purgerBlobs],
  )

  // ─── Statut affiché ───

  const statut =
    etat === 'chargement'
      ? 'Synthèse en cours…'
      : etat === 'lecture'
        ? `Lecture — ${labelUnite} ${pageLue}${nbPages ? ` / ${nbPages}` : ''}`
        : etat === 'pause'
          ? `Pause — ${labelUnite} ${pageLue}`
          : etat === 'erreur'
            ? 'Indisponible'
            : `Prêt — ${labelUnite} ${pageLue ?? '…'}`

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 md:px-5 py-2 bg-card border-b border-border text-xs shrink-0 select-none"
      role="region"
      aria-label="Lecture vocale du document"
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
                : `Écouter cette ${labelUnite} (lecture vocale)`
            }
            title={etat === 'pause' ? 'Reprendre' : `Écouter cette ${labelUnite}`}
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

      {/* Voix (studio Gemini — SECT-TTS-4 : Edge retiré) */}
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
