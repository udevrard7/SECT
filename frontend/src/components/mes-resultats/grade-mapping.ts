// ─────────────────────────────────────────────────────────────
// Mapping StudentSession → GradeEntry (pour le GradeTable DS)
//
// Extrait de mes-resultats-page.tsx (SECT-ANNEE-DETTES-5) pour être
// réutilisé par le « Relevé par année » (groupement multi-années).
//
// Le modèle de données étudiant est centré sur la "session de passation"
// (StudentSession) qui contient l'épreuve, les réponses et le résultat.
// On projette ces données vers le format GradeEntry attendu par le DS :
//
//   GradeEntry.subject     ← session.epreuve.enseignant.name
//                            (l'enseignant est le meilleur proxy de la
//                             "matière" — la filière n'est pas exposée
//                             dans le type StudentSession.epreuve)
//   GradeEntry.examTitle   ← session.epreuve.titre
//   GradeEntry.score       ← session.resultat?.scoreFinal ?? session.score ?? 0
//   GradeEntry.maxScore    ← session.epreuve.noteTotal ?? 20
//   GradeEntry.date        ← session.resultat?.dateCorrection
//                            ?? session.dateFin
//                            ?? session.dateDebut
//                            (fallback now() si toutes null)
//   GradeEntry.coefficient ← non disponible dans le modèle (omis)
//   GradeEntry.comment     ← session.resultat?.commentaires (si non vide)
//
// On ne retient que les sessions ayant un score exploitable
// (RETOURNEE ou CORRIGEE avec scoreFinal/score non null). Les
// sessions SOUMISE (en attente de correction) sont exclues car
// leur score n'est pas encore connu.
// ─────────────────────────────────────────────────────────────

import type { GradeEntry } from '@/components/ds'
import type { StudentSession } from '@/types/resultats'

export function mapSessionToGrade(session: StudentSession): GradeEntry | null {
  const scoreFinal = session.resultat?.scoreFinal
  const rawScore = session.score
  const score = scoreFinal ?? rawScore
  // Skip sessions without a computable score (e.g. SOUMISE)
  if (score === null || score === undefined) return null

  const date =
    session.resultat?.dateCorrection ??
    session.dateFin ??
    session.dateDebut ??
    new Date().toISOString()

  const comment = session.resultat?.commentaires?.trim() || undefined

  return {
    id: session.id,
    subject: session.epreuve.enseignant.name,
    examTitle: session.epreuve.titre,
    score,
    maxScore: session.epreuve.noteTotal ?? 20,
    date,
    // coefficient: non disponible dans StudentSession
    comment,
  }
}

export function mapSessionsToGrades(sessions: StudentSession[]): GradeEntry[] {
  const grades: GradeEntry[] = []
  for (const s of sessions) {
    const g = mapSessionToGrade(s)
    if (g) grades.push(g)
  }
  return grades
}

// ─────────────────────────────────────────────────────────────
// Année académique d'une session (SECT-ANNEE-DETTES-5)
//
// Le backend embarque epreuve.anneeAcademiqueId + epreuve.anneeLibelle
// sur la Branch A. Résolution du libellé affichable :
//   1. anneeLibelle du DTO ;
//   2. fallback : lookup dans la liste des années de l'établissement
//      (le libellé peut manquer si l'année a été supprimée — FK SET NULL
//      rend anneeAcademiqueId NULL, mais par robustesse on garde le
//      lookup) ;
//   3. '' → groupe « Hors année académique » (épreuves legacy non
//      tamponnées, pré-000110).
// ─────────────────────────────────────────────────────────────

export interface AnneeOptionReleve {
  id: string
  libelle: string
  actif: boolean
  dateDebut?: string
}

export function sessionAnneeLibelle(
  session: StudentSession,
  annees: AnneeOptionReleve[]
): string {
  const direct = session.epreuve.anneeLibelle
  if (direct) return direct
  const id = session.epreuve.anneeAcademiqueId
  if (id) {
    const found = annees.find((a) => a.id === id)
    if (found) return found.libelle
    return id
  }
  return ''
}
