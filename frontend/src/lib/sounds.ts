/**
 * Sonification optionnelle — sons courts et discrets pour les micro-interactions.
 *
 * Utilise la Web Audio API (aucune dépendance externe, aucun fichier audio).
 * Les sons sont générés programmatiquement (oscillateurs + enveloppe ADSR).
 *
 * Respect de prefers-reduced-motion : si l'utilisateur a activé "réduire les
 * animations" dans son système, les sons sont aussi désactivés (équivalent
 * audio du reduced-motion).
 *
 * Tons utilisés :
 *   - reward : do-mi-sol montant (accord majeur) ~400ms — succès/récompense
 *   - success : do aigu court ~150ms — validation simple
 *   - error : si bémol descendant ~200ms — erreur
 */

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch {
      return null
    }
  }
  return audioContext
}

/** Vérifie si les sons doivent être joués (respect reduced-motion). */
function shouldPlaySound(): boolean {
  if (typeof window === 'undefined') return false
  // Respect prefers-reduced-motion (équivalent audio)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return true
}

/** Joue une note simple (fréquence + durée + gain). */
function playNote(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  gain: number = 0.15
): void {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = frequency

  // Enveloppe ADSR : Attack 10ms → Decay 50ms → Sustain → Release 100ms
  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gain, startTime + 0.01) // Attack
  env.gain.exponentialRampToValueAtTime(gain * 0.6, startTime + 0.06) // Decay
  env.gain.setValueAtTime(gain * 0.6, startTime + duration - 0.1) // Sustain
  env.gain.exponentialRampToValueAtTime(0.001, startTime + duration) // Release

  osc.connect(env)
  env.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

/**
 * Joue un son de récompense (accord majeur montant : Do-Mi-Sol).
 * Durée ~400ms. Volume discret (15%).
 * Non-bloquant : ignore les erreurs silencieusement.
 */
export function playRewardSound(): void {
  if (!shouldPlaySound()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    // Resume si le context est suspendu (policy autoplay browser)
    if (ctx.state === 'suspended') ctx.resume()

    const now = ctx.currentTime
    // Do5-Mi5-Sol5 montant (523.25, 659.25, 783.99 Hz)
    playNote(ctx, 523.25, now, 0.4, 0.12)        // Do
    playNote(ctx, 659.25, now + 0.08, 0.4, 0.10) // Mi (décalé)
    playNote(ctx, 783.99, now + 0.16, 0.5, 0.10) // Sol (décalé + plus long)
  } catch {
    // Silencieux : le son est optionnel
  }
}

/**
 * Joue un son de succès court (Do aigu ~150ms).
 */
export function playSuccessSound(): void {
  if (!shouldPlaySound()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    playNote(ctx, 880, now, 0.15, 0.10) // La5 aigu
  } catch {
    // Silencieux
  }
}

/**
 * Joue un son d'erreur court (Si bémol descendant ~200ms).
 */
export function playErrorSound(): void {
  if (!shouldPlaySound()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    playNote(ctx, 466.16, now, 0.1, 0.10)       // Bb4
    playNote(ctx, 311.13, now + 0.08, 0.15, 0.10) // Eb4 (descendant)
  } catch {
    // Silencieux
  }
}
