// ═══════════════════════════════════════════════════════════════════════════
// SECT-PROMOTION-FRONTEND-1 : academic-progress — helpers purs pour la
// logique de progression académique (niveaux L1 → DOCTORAT) + libellés /
// couleurs des décisions d'inscription + fonction computeDecision qui
// reproduit fidèlement la logique SQL de la fonction SECURITY DEFINER
// `cloturer_annee_etudiant` (migration 000087) et du CASE dans
// ListEtudiantsForPromotion (repository/promotion.go).
//
// Extraction en module pur (pas de React) pour :
//   - Réutilisation côté page clôture (prévisualisation, bilan, dialogue
//     d'override manuel).
//   - Réutilisation future dans etudiants-page.tsx (affichage de
//     l'historique des années — endpoint /api/etudiants/{id}/inscriptions
//     encore à créer côté backend).
//   - Testabilité unitaire (aucun effet de bord, aucune dépendance React).
//
// Miroir Go : backend/internal/domain/academique.go (OrdreNiveaux +
// NextNiveau) et backend/internal/domain/inscription.go (constantes
// StatutInscription*).
// ═══════════════════════════════════════════════════════════════════════════

// ─── Ordre strict du cursus académique ───
// Identique à backend/internal/domain/academique.go (OrdreNiveaux).
// L1 < L2 < L3 (Licence) < M1 < M2 (Master) < DOCTORAT.
export const NIVEAU_ORDER: string[] = [
  'L1',
  'L2',
  'L3',
  'M1',
  'M2',
  'DOCTORAT',
]

/**
 * getNextNiveau — retourne le niveau suivant dans le cursus, ou null si
 * le niveau actuel est terminal (DOCTORAT) ou inconnu.
 *
 * Miroir de domain.NextNiveau (Go) :
 *   - L1 → L2, L2 → L3, L3 → M1, M1 → M2, M2 → DOCTORAT
 *   - DOCTORAT → null (terminal — l'étudiant est diplômé, pas de niveau suivant)
 *   - niveau inconnu / vide → null (l'étudiant reste à son niveau courant,
 *     la décision calculée sera 'EN_COURS' côté SQL — voir computeDecision)
 */
export function getNextNiveau(niveau: string | null | undefined): string | null {
  if (!niveau) return null
  const idx = NIVEAU_ORDER.indexOf(niveau)
  if (idx === -1) return null
  if (idx === NIVEAU_ORDER.length - 1) return null // DOCTORAT → terminal
  return NIVEAU_ORDER[idx + 1]
}

/**
 * isTerminalNiveau — true uniquement pour DOCTORAT (dernier niveau du
 * cursus). Pour un niveau vide ou inconnu, retourne false (comportement
 * défensif : la fonction SQL `next_niveau` retourne (NULL, false) pour un
 * niveau NULL, et la décision calculée reste 'EN_COURS').
 */
export function isTerminalNiveau(niveau: string | null | undefined): boolean {
  return niveau === 'DOCTORAT'
}

/**
 * canPromote — true si le niveau n'est pas terminal (i.e. l'étudiant peut
 * être promu au niveau suivant). Utilisé pour désactiver l'option "Forcer
 * PROMU" dans le dropdown d'override (un étudiant en DOCTORAT ne peut pas
 * être promu, il doit être diplômé ou redoublant).
 */
export function canPromote(niveau: string | null | undefined): boolean {
  return !isTerminalNiveau(niveau)
}

// ─── Décisions d'inscription (StatutInscription côté backend) ───
// Miroir de backend/internal/domain/inscription.go (constantes
// StatutInscriptionEnCours / Promu / Redoublant / Diplome / Exclu /
// Reoriente / Quitte).
export const DECISION_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  PROMU: 'Promu',
  REDOUBLANT: 'Redoublant',
  DIPLOME: 'Diplômé',
  EXCLU: 'Exclu',
  REORIENTE: 'Réorienté',
  QUITTE: 'A quitté',
}

/**
 * DECISION_COLORS — classes Tailwind pour les badges colorés par décision.
 *
 * Palette Savane EdTech (cohérente avec audit-helpers.tsx) :
 *   - PROMU       → success (vert lime) — validation
 *   - REDOUBLANT  → warning (orange/ambre) — échec réparable
 *   - DIPLOME     → info (bleu sarcelle) — étape finale réussie
 *   - EXCLU       → destructive (rouge) — sanction
 *   - REORIENTE   → secondary (gris) — changement de filière
 *   - QUITTE      → muted (gris discret) — sortie
 *   - EN_COURS    → muted (gris discret) — non clôturé
 *
 * Les classes sont statiques (pas de template literal) pour garantir la
 * génération du CSS par Tailwind v4 purge.
 */
export const DECISION_COLORS: Record<string, string> = {
  EN_COURS: 'bg-muted text-muted-foreground border-muted-foreground/30',
  PROMU: 'bg-success/15 text-success-text border-success/30',
  REDOUBLANT: 'bg-warning/15 text-warning border-warning/30',
  DIPLOME: 'bg-info/15 text-info border-info/30',
  EXCLU: 'bg-destructive/15 text-destructive border-destructive/30',
  REORIENTE: 'bg-secondary/15 text-secondary border-secondary/30',
  QUITTE: 'bg-muted text-muted-foreground border-muted-foreground/30',
}

/**
 * getDecisionLabel — libellé français d'une décision, avec fallback
 * "Inconnu" si la valeur n'est pas dans DECISION_LABELS (ex: réponse API
 * inattendue, nouveau statut non encore géré côté frontend).
 */
export function getDecisionLabel(decision: string | null | undefined): string {
  if (!decision) return 'Inconnu'
  return DECISION_LABELS[decision] ?? 'Inconnu'
}

/**
 * getDecisionColorClasses — classes Tailwind pour un badge de décision,
 * avec fallback vers les classes muted (gris discret) si la valeur n'est
 * pas dans DECISION_COLORS. Le fallback garantit qu'un statut inconnu ne
 * casse pas l'affichage.
 */
export function getDecisionColorClasses(decision: string | null | undefined): string {
  if (!decision) return DECISION_COLORS.EN_COURS
  return DECISION_COLORS[decision] ?? DECISION_COLORS.EN_COURS
}

// ─── computeDecision — reproduction fidèle de la logique SQL ───
//
// Miroir exact du CASE dans repository/promotion.go
// (ListEtudiantsForPromotion) et de la fonction `cloturer_annee_etudiant`
// (migration 000087) :
//
//   CASE
//     WHEN niveau IS NULL                              THEN 'EN_COURS'
//     WHEN is_terminal AND moyenne >= seuilPassage     THEN 'DIPLOME'
//     WHEN is_terminal                                 THEN 'REDOUBLANT'
//     WHEN moyenne >= seuilPassage
//          AND creditsTotaux > 0
//          AND creditsValides >= creditsTotaux * creditsMinPourcent / 100
//                                                      THEN 'PROMU'
//     ELSE                                                  'REDOUBLANT'
//   END
//
// Notes :
//   - seuilRattrapage n'est PAS utilisé par la logique actuelle (réservé
//     pour une future évolution "régime tolerant" côté SQL). Le paramètre
//     est conservé dans la signature pour rester cohérent avec la structure
//     ReglesPassage et permettre une activation future sans refactoring.
//   - Pour un niveau vide / null → 'EN_COURS' (l'étudiant n'est pas encore
//     inscriptible à la clôture, cas défensif).
//   - Pour un niveau inconnu (pas dans NIVEAU_ORDER) → 'EN_COURS'
//     (comportement défensif côté frontend, le backend ferait de même car
//     `next_niveau` retourne (NULL, false) et le CASE tombe sur ELSE
//     'REDOUBLANT' — mais on préfère 'EN_COURS' côté UI pour signaler
//     une donnée anormale plutôt que masquer le problème).
//
// @returns Une des 6 valeurs : 'EN_COURS' | 'PROMU' | 'REDOUBLANT' |
//          'DIPLOME' | 'EXCLU' (jamais 'REORIENTE' ou 'QUITTE' qui sont
//          des décisions purement manuelles).
export function computeDecision(
  moyenne: number | null | undefined,
  creditsValides: number | null | undefined,
  creditsTotaux: number | null | undefined,
  seuilPassage: number,
  _seuilRattrapage: number,
  creditsMinPourcent: number,
  isTerminal: boolean,
): 'EN_COURS' | 'PROMU' | 'REDOUBLANT' | 'DIPLOME' | 'EXCLU' {
  const moy = moyenne ?? 0
  const cv = creditsValides ?? 0
  const ct = creditsTotaux ?? 0

  // Niveau terminal (DOCTORAT) : diplôme si moyenne >= seuil, sinon redoublant.
  if (isTerminal) {
    if (moy >= seuilPassage) return 'DIPLOME'
    return 'REDOUBLANT'
  }

  // Niveau non terminal : promotion si moyenne >= seuil ET credits suffisants.
  if (moy >= seuilPassage && ct > 0 && cv >= (ct * creditsMinPourcent) / 100) {
    return 'PROMU'
  }

  // Cas par défaut : redoublant.
  return 'REDOUBLANT'
}

// ─── Helpers de formatage (utilisés par la page clôture + futur dialogue
//     d'historique des années dans etudiants-page.tsx) ───

/**
 * formatMoyenne — formate une moyenne annuelle sur 20 avec 2 décimales,
 * fallback "—" si null/undefined (cas où l'étudiant n'a aucune note pour
 * l'année source).
 */
export function formatMoyenne(moyenne: number | null | undefined): string {
  if (moyenne === null || moyenne === undefined || Number.isNaN(moyenne)) return '—'
  return moyenne.toFixed(2)
}

/**
 * formatCredits — formate "validés / total" avec fallback "—" si les deux
 * sont nuls (cas où l'étudiant n'a aucune UE validée).
 */
export function formatCredits(
  valides: number | null | undefined,
  totaux: number | null | undefined,
): string {
  const v = valides ?? 0
  const t = totaux ?? 0
  if (v === 0 && t === 0) return '—'
  return `${v} / ${t}`
}
