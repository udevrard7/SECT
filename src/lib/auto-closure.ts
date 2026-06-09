/**
 * Module de clôture automatique des épreuves
 * 
 * Gère la logique de clôture automatique basée sur :
 * - Condition A : Tous les étudiants inscrits ont soumis (taux de soumission = 100%)
 * - Condition B : La date/heure de fin est atteinte (avec délai de grâce)
 * 
 * Transitions automatiques :
 * - PLANIFIEE → EN_COURS quand dateDebut est atteinte
 * - PLANIFIEE → CLOTUREE quand dateFin + delaiGrace est dépassée (personne n'a commencé)
 * - EN_COURS → CLOTUREE quand tous ont soumis OU dateFin + delaiGrace dépassée
 * - TERMINEE → CLOTUREE (même logique que EN_COURS)
 * 
 * Actions lors de la clôture :
 * - Verrouiller toute nouvelle soumission
 * - Empêcher la modification des compositions déjà soumises
 * - Horodater précisément la clôture (date + heure)
 * - Marquer les étudiants absents comme "ABSENT" ou "NON_SOUMIS"
 * - Envoyer une notification à l'enseignant
 */

import { db } from '@/lib/db'

export type RaisonCloture = 'TOUS_SOUMIS' | 'ECHEANCE_ATTEINTE'

export interface ClosureResult {
  closed: boolean
  raison?: RaisonCloture
  epreuveId: string
  sessionsMarqueesAbsent: number
  sessionsMarqueesNonSoumis: number
  totalSessions: number
  submittedSessions: number
  eligibleStudentCount: number
  message?: string
  transitioned?: boolean
  previousStatut?: string
}

/**
 * Get the number of eligible students for an epreuve based on its filiereId and groupesCibles.
 * This is the authoritative count of students who SHOULD take the exam,
 * NOT just the count of existing SessionPassation records (which are only created on-demand).
 */
async function getEligibleStudentCount(
  filiereId: string | null,
  groupesCibles: string | null,
  _existingSessionCount?: number
): Promise<number> {
  if (!filiereId) {
    // No filiere → can't determine eligible students from DB
    // Return 0 so Condition A (all submitted) cannot trigger incorrectly.
    // Previously, falling back to existingSessionCount caused a critical bug:
    // when only 1 student started & submitted, existingSessionCount = 1 = submittedCount
    // → premature closure. Epreuves without filiere rely on Condition B (deadline) only.
    return 0
  }

  // Parse niveau from groupesCibles if available
  let niveau: string | null = null
  if (groupesCibles) {
    try {
      const parsed = JSON.parse(groupesCibles)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'niveau' in parsed && parsed.niveau) {
        niveau = parsed.niveau
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Count eligible students: active students in the filiere, optionally filtered by niveau
  const where: Record<string, unknown> = {
    role: 'ETUDIANT',
    actif: true,
    filiereId,
  }
  if (niveau) {
    where.niveau = niveau
  }

  const count = await db.user.count({ where })
  return count
}

/**
 * Vérifie si une épreuve doit être clôturée automatiquement
 * et effectue la clôture si les conditions sont remplies.
 * 
 * Gère aussi la transition automatique PLANIFIEE → EN_COURS quand dateDebut est atteinte.
 */
export async function checkAndAutoCloseEpreuve(epreuveId: string): Promise<ClosureResult> {
  const epreuve = await db.epreuve.findUnique({
    where: { id: epreuveId },
    include: {
      sessions: {
        select: {
          id: true,
          etudiantId: true,
          statut: true,
          dateDebut: true,
          dateFin: true,
        },
      },
    },
  })

  if (!epreuve || epreuve.deletedAt) {
    return { closed: false, epreuveId, sessionsMarqueesAbsent: 0, sessionsMarqueesNonSoumis: 0, totalSessions: 0, submittedSessions: 0, eligibleStudentCount: 0 }
  }

  const now = new Date()

  // ─── Déjà clôturée — rien à faire ─────────────────────────────────────
  if (epreuve.statut === 'CLOTUREE') {
    return { closed: false, epreuveId, sessionsMarqueesAbsent: 0, sessionsMarqueesNonSoumis: 0, totalSessions: epreuve.sessions.length, submittedSessions: 0, eligibleStudentCount: 0 }
  }

  // ─── BROUILLON — ne jamais auto-transitionner ─────────────────────────
  if (epreuve.statut === 'BROUILLON') {
    return { closed: false, epreuveId, sessionsMarqueesAbsent: 0, sessionsMarqueesNonSoumis: 0, totalSessions: epreuve.sessions.length, submittedSessions: 0, eligibleStudentCount: 0 }
  }

  // ─── PLANIFIEE — transitions automatiques ──────────────────────────────
  if (epreuve.statut === 'PLANIFIEE') {
    const dateFinWithGrace = new Date(epreuve.dateFin.getTime() + (epreuve.delaiGrace || 3) * 60 * 1000)

    // CAS 1 : dateFin + délai de grâce déjà dépassée → personne n'a commencé, clôturer directement
    if (now >= dateFinWithGrace) {
      return await performClosure(epreuveId, 'ECHEANCE_ATTEINTE', epreuve.sessions, epreuve.enseignantId, 'PLANIFIEE')
    }

    // CAS 2 : dateDebut atteinte → passer en EN_COURS automatiquement
    if (now >= epreuve.dateDebut) {
      await db.epreuve.update({
        where: { id: epreuveId },
        data: { statut: 'EN_COURS' },
      })

      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'AUTO_START_EPREUVE',
          entite: 'Epreuve',
          entiteId: epreuveId,
          details: `Épreuve passée automatiquement en EN_COURS — dateDebut atteinte: ${epreuve.dateDebut.toISOString()}`,
        },
      })

      // Now re-check with EN_COURS status (for closure conditions)
      // But first, let's check closure conditions directly here to avoid re-fetching
      const totalSessions = epreuve.sessions.length
      const submittedStatuses = ['SOUMISE', 'CORRIGEE', 'RETOURNEE']
      const submittedSessions = epreuve.sessions.filter(s => submittedStatuses.includes(s.statut)).length
      const activeSessions = epreuve.sessions.filter(s => s.statut === 'EN_COURS').length
      const eligibleStudentCount = await getEligibleStudentCount(epreuve.filiereId, epreuve.groupesCibles as string | null, totalSessions)

      // Condition A: tous les étudiants ont soumis
      if (eligibleStudentCount > 0 && submittedSessions === eligibleStudentCount && activeSessions === 0) {
        return await performClosure(epreuveId, 'TOUS_SOUMIS', epreuve.sessions, epreuve.enseignantId, 'PLANIFIEE')
      }

      return {
        closed: false,
        epreuveId,
        sessionsMarqueesAbsent: 0,
        sessionsMarqueesNonSoumis: 0,
        totalSessions,
        submittedSessions,
        eligibleStudentCount,
        transitioned: true,
        previousStatut: 'PLANIFIEE',
        message: `Épreuve passée automatiquement de PLANIFIEE → EN_COURS (dateDebut atteinte)`,
      }
    }

    // CAS 3 : dateDebut pas encore atteinte — attendre
    return {
      closed: false,
      epreuveId,
      sessionsMarqueesAbsent: 0,
      sessionsMarqueesNonSoumis: 0,
      totalSessions: epreuve.sessions.length,
      submittedSessions: 0,
      eligibleStudentCount: 0,
      message: `Épreuve PLANIFIEE — dateDebut pas encore atteinte (${epreuve.dateDebut.toISOString()})`,
    }
  }

  // ─── EN_COURS ou TERMINEE — vérifier les conditions de clôture ─────────
  if (!['EN_COURS', 'TERMINEE'].includes(epreuve.statut)) {
    return { closed: false, epreuveId, sessionsMarqueesAbsent: 0, sessionsMarqueesNonSoumis: 0, totalSessions: epreuve.sessions.length, submittedSessions: 0, eligibleStudentCount: 0 }
  }

  const totalSessions = epreuve.sessions.length
  const submittedStatuses = ['SOUMISE', 'CORRIGEE', 'RETOURNEE']
  const submittedSessions = epreuve.sessions.filter(s => submittedStatuses.includes(s.statut)).length
  const activeSessions = epreuve.sessions.filter(s => s.statut === 'EN_COURS').length

  // ─── Condition A : Tous les étudiants inscrits ont soumis ───────────────
  // FIX: Compare against eligible student count, NOT just existing sessions.
  // Sessions are only created when a student starts the exam, so using
  // totalSessions would incorrectly close when only 1 student (who started)
  // submits. We must check against the total eligible student population.
  // SAFETY: Also ensure no sessions are still EN_COURS before closing.
  const eligibleStudentCount = await getEligibleStudentCount(epreuve.filiereId, epreuve.groupesCibles as string | null, totalSessions)

  if (eligibleStudentCount > 0 && submittedSessions === eligibleStudentCount && activeSessions === 0) {
    return await performClosure(epreuveId, 'TOUS_SOUMIS', epreuve.sessions, epreuve.enseignantId, epreuve.statut)
  }

  // ─── Condition B : La date/heure de fin + délai de grâce est atteinte ──
  const dateFinWithGrace = new Date(epreuve.dateFin.getTime() + (epreuve.delaiGrace || 3) * 60 * 1000)
  
  if (now >= dateFinWithGrace) {
    return await performClosure(epreuveId, 'ECHEANCE_ATTEINTE', epreuve.sessions, epreuve.enseignantId, epreuve.statut)
  }

  // Si la dateFin est atteinte mais pas le délai de grâce, on ne clôture pas encore
  // mais on peut forcer la soumission des sessions encore en cours
  if (now >= epreuve.dateFin && now < dateFinWithGrace && activeSessions > 0) {
    // Période de grâce en cours — les étudiants en cours ont encore un peu de temps
    return {
      closed: false,
      epreuveId,
      sessionsMarqueesAbsent: 0,
      sessionsMarqueesNonSoumis: 0,
      totalSessions,
      submittedSessions,
      eligibleStudentCount,
      message: `Période de grâce en cours — ${activeSessions} étudiant(s) encore en train de rédiger`,
    }
  }

  return {
    closed: false,
    epreuveId,
    sessionsMarqueesAbsent: 0,
    sessionsMarqueesNonSoumis: 0,
    totalSessions,
    submittedSessions,
    eligibleStudentCount,
  }
}

/**
 * Effectue la clôture effective de l'épreuve
 */
async function performClosure(
  epreuveId: string,
  raison: RaisonCloture,
  sessions: Array<{ id: string; etudiantId: string; statut: string; dateDebut: string | Date | null }>,
  enseignantId: string,
  previousStatut?: string
): Promise<ClosureResult> {
  const now = new Date()
  const submittedStatuses = ['SOUMISE', 'CORRIGEE', 'RETOURNEE']
  
  let sessionsMarqueesAbsent = 0
  let sessionsMarqueesNonSoumis = 0

  // Traiter les sessions non terminées
  for (const session of sessions) {
    if (submittedStatuses.includes(session.statut)) {
      // Déjà soumise — rien à faire
      continue
    }

    if (session.statut === 'NON_COMMENCEE') {
      // Étudiant qui n'a jamais commencé → ABSENT
      await db.sessionPassation.update({
        where: { id: session.id },
        data: {
          statut: 'ABSENT',
          dateFin: now,
          logEvents: JSON.stringify([
            { type: 'MARKED_ABSENT', timestamp: now.toISOString(), reason: 'Auto-closure: student never started' },
          ]),
        },
      })
      sessionsMarqueesAbsent++
    } else if (session.statut === 'EN_COURS') {
      // Étudiant qui était en train de rédiger → NON_SOUMIS (sauvegarde automatique du brouillon)
      await db.sessionPassation.update({
        where: { id: session.id },
        data: {
          statut: 'NON_SOUMIS',
          dateFin: now,
          logEvents: JSON.stringify([
            { type: 'MARKED_NON_SOUMIS', timestamp: now.toISOString(), reason: 'Auto-closure: grace period expired, draft auto-saved' },
          ]),
        },
      })
      sessionsMarqueesNonSoumis++
    }
  }

  // Mettre à jour l'épreuve
  await db.epreuve.update({
    where: { id: epreuveId },
    data: {
      statut: 'CLOTUREE',
      clotureeAt: now,
      clotureeAutomatiquement: true,
      raisonCloture: raison,
    },
  })

  // Créer une alerte pour l'enseignant
  const raisonLabel = raison === 'TOUS_SOUMIS' 
    ? 'Tous les étudiants ont soumis leur composition' 
    : 'La période de passation est terminée'

  const previousLabel = previousStatut ? ` (était ${previousStatut})` : ''

  await db.alerte.create({
    data: {
      titre: `Épreuve clôturée automatiquement`,
      description: `L'épreuve a été clôturée automatiquement${previousLabel}. Raison : ${raisonLabel}. ${sessionsMarqueesAbsent > 0 ? `${sessionsMarqueesAbsent} étudiant(s) marqué(s) absent(s).` : ''} ${sessionsMarqueesNonSoumis > 0 ? `${sessionsMarqueesNonSoumis} étudiant(s) non soumis (brouillon sauvegardé).` : ''}`,
      severity: 'INFO',
      type: 'SYSTEME',
      epreuveId,
      userId: enseignantId,
    },
  })

  // Audit log
  await db.auditLog.create({
    data: {
      userId: 'system',
      userEmail: 'system',
      action: 'AUTO_CLOSE_EPREUVE',
      entite: 'Epreuve',
      entiteId: epreuveId,
      details: `Clôture automatique${previousLabel} — Raison: ${raison}. Absents: ${sessionsMarqueesAbsent}. Non soumis: ${sessionsMarqueesNonSoumis}.`,
    },
  })

  const totalSubmitted = sessions.filter(s => submittedStatuses.includes(s.statut)).length

  return {
    closed: true,
    raison,
    epreuveId,
    sessionsMarqueesAbsent,
    sessionsMarqueesNonSoumis,
    totalSessions: sessions.length,
    submittedSessions: totalSubmitted,
    eligibleStudentCount: 0, // Not needed in closure result
    previousStatut,
    message: `Épreuve clôturée automatiquement${previousLabel} : ${raisonLabel}`,
  }
}

/**
 * Vérifie le statut de clôture d'une épreuve pour un étudiant
 * Retourne true si l'étudiant ne peut plus soumettre
 */
export async function isEpreuveClosed(epreuveId: string): Promise<{
  closed: boolean
  inGracePeriod: boolean
  gracePeriodEndsAt: Date | null
  clotureeAt: Date | null
  raisonCloture: string | null
}> {
  const epreuve = await db.epreuve.findUnique({
    where: { id: epreuveId },
    select: {
      statut: true,
      dateFin: true,
      delaiGrace: true,
      clotureeAt: true,
      raisonCloture: true,
    },
  })

  if (!epreuve) {
    return { closed: true, inGracePeriod: false, gracePeriodEndsAt: null, clotureeAt: null, raisonCloture: null }
  }

  // Déjà clôturée
  if (epreuve.statut === 'CLOTUREE') {
    return {
      closed: true,
      inGracePeriod: false,
      gracePeriodEndsAt: null,
      clotureeAt: epreuve.clotureeAt,
      raisonCloture: epreuve.raisonCloture,
    }
  }

  const now = new Date()

  // Vérifier si on est dans la période de grâce
  if (now >= epreuve.dateFin) {
    const graceEnd = new Date(epreuve.dateFin.getTime() + (epreuve.delaiGrace || 3) * 60 * 1000)
    if (now < graceEnd) {
      // Période de grâce
      return {
        closed: false,
        inGracePeriod: true,
        gracePeriodEndsAt: graceEnd,
        clotureeAt: null,
        raisonCloture: null,
      }
    }
    // Délai de grâce expiré
    return {
      closed: true,
      inGracePeriod: false,
      gracePeriodEndsAt: null,
      clotureeAt: null,
      raisonCloture: 'ECHEANCE_ATTEINTE',
    }
  }

  return {
    closed: false,
    inGracePeriod: false,
    gracePeriodEndsAt: null,
    clotureeAt: null,
    raisonCloture: null,
  }
}

/**
 * Scanne toutes les épreuves actives et vérifie si elles doivent être :
 * - Transitionnées de PLANIFIEE → EN_COURS (quand dateDebut atteinte)
 * - Clôturées automatiquement (quand conditions remplies)
 * 
 * Utilisé par le Vercel Cron (chaque minute) et par le mini-service de surveillance.
 */
export async function scanAndAutoCloseEpreuves(): Promise<ClosureResult[]> {
  const now = new Date()

  // ─── Étape 1 : Transitionner les PLANIFIEE dont dateDebut est atteinte ──
  const planifieeEpreuves = await db.epreuve.findMany({
    where: {
      statut: 'PLANIFIEE',
      dateDebut: { lte: now },
      deletedAt: null,
    },
    select: { id: true },
  })

  // ─── Étape 2 : Trouver les EN_COURS et TERMINEE à vérifier ─────────────
  const activeEpreuves = await db.epreuve.findMany({
    where: {
      statut: { in: ['EN_COURS', 'TERMINEE'] },
      deletedAt: null,
    },
    select: { id: true },
  })

  // Combiner toutes les épreuves à vérifier (sans doublons)
  const allIds = new Set([
    ...planifieeEpreuves.map(e => e.id),
    ...activeEpreuves.map(e => e.id),
  ])

  const results: ClosureResult[] = []

  for (const epreuveId of allIds) {
    try {
      const result = await checkAndAutoCloseEpreuve(epreuveId)
      results.push(result)
    } catch (error) {
      console.error(`Error auto-closing epreuve ${epreuveId}:`, error)
      results.push({
        closed: false,
        epreuveId,
        sessionsMarqueesAbsent: 0,
        sessionsMarqueesNonSoumis: 0,
        totalSessions: 0,
        submittedSessions: 0,
        eligibleStudentCount: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  return results
}

/**
 * Get the eligible student count for an epreuve (exported for use in API routes).
 */
export { getEligibleStudentCount }
