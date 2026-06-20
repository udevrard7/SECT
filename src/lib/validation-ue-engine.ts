/**
 * Validation UE Engine
 *
 * Computes validation status for UE (Unités d'Enseignement) based on
 * student exam results, and generates certificates when applicable.
 */

import { db, withRetry } from '@/lib/db'

// ─── Types ───

export interface ValidationComputeResult {
  validationUE: {
    id: string
    etudiantId: string
    uniteEnseignementId: string
    anneeAcademiqueId: string | null
    statut: string
    moyenneUE: number
    noteNormale: number | null
    noteRattrapage: number | null
    noteFinale: number
    nbEpreuvesTotal: number
    nbEpreuvesCompletees: number
    dateValidation: Date | null
  }
  certificatsCrees: Array<{
    id: string
    type: string
    codeVerification: string
  }>
}

// ─── Helpers ───

/**
 * Determine the mention based on the final grade.
 */
function getMention(noteFinale: number): string | null {
  if (noteFinale >= 16) return 'Très Bien'
  if (noteFinale >= 14) return 'Bien'
  if (noteFinale >= 12) return 'Assez Bien'
  if (noteFinale >= 10) return 'Passable'
  return null
}

/**
 * Determine the certificate type based on the final grade and validation status.
 */
function getCertificateType(noteFinale: number, statut: string): string | null {
  if (statut !== 'VALIDEE') return null
  if (noteFinale >= 16) return 'EXCELLENCE'
  if (noteFinale >= 10) return 'ACCOMPLISSEMENT'
  return null
}

/**
 * Generate a verification code for a certificate.
 * Format: SECT-XXXX-XXXX (8 alphanumeric chars in 2 groups of 4)
 */
function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `SECT-${segment()}-${segment()}`
}

/**
 * Get the intitulé for a certificate type.
 */
function getIntitule(type: string): string {
  switch (type) {
    case 'EXCELLENCE':
      return "Certificat d'Excellence"
    case 'ACCOMPLISSEMENT':
      return "Certificat d'Accomplissement"
    case 'PARTICIPATION':
      return 'Certificat de Participation'
    default:
      return 'Certificat'
  }
}

// ─── Core Engine ───

/**
 * Compute validation status for a single student across all their UEs.
 *
 * For each UE the student is enrolled in, this function:
 * 1. Gathers all exam results (sessions) for that UE
 * 2. Calculates the average (moyenneUE) from completed exams
 * 3. Determines validation status (VALIDEE if noteFinale >= 10, NON_VALIDEE otherwise)
 * 4. Updates or creates the ValidationUE record
 *
 * Returns the list of updated/created ValidationUE records.
 */
export async function computeValidationsForStudent(etudiantId: string): Promise<ValidationComputeResult[]> {
  const results: ValidationComputeResult[] = []

  // Get the student with their filiere
  const etudiant = await withRetry(() =>
    db.user.findUnique({
      where: { id: etudiantId },
      select: {
        id: true,
        filiereId: true,
        etablissementId: true,
        niveau: true,
      },
    })
  )

  if (!etudiant || !etudiant.filiereId) {
    return results
  }

  // Get all UEs for the student's filiere
  const ues = await withRetry(() =>
    db.uniteEnseignement.findMany({
      where: {
        filiereId: etudiant.filiereId!,
        actif: true,
      },
      include: {
        epreuves: {
          where: { deletedAt: null },
          select: {
            id: true,
            noteTotal: true,
            sessions: {
              where: {
                etudiantId,
                statut: { in: ['CORRIGEE', 'RETOURNEE'] },
              },
              select: {
                id: true,
                score: true,
                statut: true,
              },
            },
          },
        },
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
            etablissementId: true,
            etablissement: {
              select: {
                id: true,
                nom: true,
                ville: true,
                pays: true,
                logo: true,
              },
            },
          },
        },
      },
    })
  )

  // Also get UEs shared with the student's filiere
  const sharedUEs = await withRetry(() =>
    db.uniteEnseignementFiliere.findMany({
      where: { filiereId: etudiant.filiereId! },
      include: {
        uniteEnseignement: {
          include: {
            epreuves: {
              where: { deletedAt: null },
              select: {
                id: true,
                noteTotal: true,
                sessions: {
                  where: {
                    etudiantId,
                    statut: { in: ['CORRIGEE', 'RETOURNEE'] },
                  },
                  select: {
                    id: true,
                    score: true,
                    statut: true,
                  },
                },
              },
            },
            filiere: {
              select: {
                id: true,
                nom: true,
                code: true,
                etablissementId: true,
                etablissement: {
                  select: {
                    id: true,
                    nom: true,
                    ville: true,
                    pays: true,
                    logo: true,
                  },
                },
              },
            },
          },
        },
      },
    })
  )

  // Merge UEs (deduplicate by id)
  const seen = new Set<string>()
  const allUEs = [
    ...ues,
    ...sharedUEs.map((s) => s.uniteEnseignement),
  ].filter((ue) => {
    if (seen.has(ue.id)) return false
    seen.add(ue.id)
    return true
  })

  // Get the current active academic year for the student's establishment
  const now = new Date()
  const anneeAcademique = await withRetry(() =>
    db.anneeAcademique.findFirst({
      where: {
        etablissementId: etudiant.etablissementId!,
        dateDebut: { lte: now },
        dateFin: { gte: now },
        actif: true,
      },
    })
  )

  for (const ue of allUEs) {
    // Calculate average from all completed exam sessions
    const allSessions = ue.epreuves.flatMap((ep) => ep.sessions)
    const nbEpreuvesTotal = ue.epreuves.length
    const nbEpreuvesCompletees = allSessions.length

    let moyenneUE = 0
    let noteNormale: number | null = null
    let noteRattrapage: number | null = null

    if (allSessions.length > 0) {
      const totalScore = allSessions.reduce((sum, s) => sum + (s.score ?? 0), 0)
      moyenneUE = totalScore / allSessions.length
    }

    // Use the moyenneUE as the noteFinale
    const noteFinale = moyenneUE
    noteNormale = allSessions.length > 0 ? moyenneUE : null

    // Determine validation status
    const statut = nbEpreuvesCompletees === 0
      ? 'EN_COURS'
      : noteFinale >= 10
        ? 'VALIDEE'
        : 'NON_VALIDEE'

    const dateValidation = statut === 'VALIDEE' ? new Date() : null

    // Find existing validation or create a new one
    const existingValidation = await withRetry(() =>
      db.validationUE.findFirst({
        where: {
          etudiantId,
          uniteEnseignementId: ue.id,
          ...(anneeAcademique?.id
            ? { anneeAcademiqueId: anneeAcademique.id }
            : { anneeAcademiqueId: null }),
        },
      })
    )

    let validationUE

    if (existingValidation) {
      validationUE = await withRetry(() =>
        db.validationUE.update({
          where: { id: existingValidation.id },
          data: {
            moyenneUE,
            noteNormale,
            noteRattrapage,
            noteFinale,
            nbEpreuvesTotal,
            nbEpreuvesCompletees,
            statut,
            dateValidation,
          },
        })
      )
    } else {
      validationUE = await withRetry(() =>
        db.validationUE.create({
          data: {
            etudiantId,
            uniteEnseignementId: ue.id,
            anneeAcademiqueId: anneeAcademique?.id ?? null,
            moyenneUE,
            noteNormale,
            noteRattrapage,
            noteFinale,
            nbEpreuvesTotal,
            nbEpreuvesCompletees,
            statut,
            dateValidation,
          },
        })
      )
    }

    results.push({
      validationUE: {
        id: validationUE.id,
        etudiantId: validationUE.etudiantId,
        uniteEnseignementId: validationUE.uniteEnseignementId,
        anneeAcademiqueId: validationUE.anneeAcademiqueId,
        statut: validationUE.statut,
        moyenneUE: validationUE.moyenneUE,
        noteNormale: validationUE.noteNormale,
        noteRattrapage: validationUE.noteRattrapage,
        noteFinale: validationUE.noteFinale,
        nbEpreuvesTotal: validationUE.nbEpreuvesTotal,
        nbEpreuvesCompletees: validationUE.nbEpreuvesCompletees,
        dateValidation: validationUE.dateValidation,
      },
      certificatsCrees: [],
    })
  }

  return results
}

/**
 * Compute validations for a student AND generate certificates for newly validated UEs.
 *
 * This is the main entry point for the certificate system:
 * 1. Computes all validations via computeValidationsForStudent
 * 2. For each VALIDEE result that doesn't already have a certificate, generates one
 * 3. Returns both the validations and any newly created certificates
 */
export async function computeAndGenerateForStudent(
  etudiantId: string
): Promise<ValidationComputeResult[]> {
  // Step 1: Compute validations
  const results = await computeValidationsForStudent(etudiantId)

  // Step 2: Generate certificates for newly validated UEs
  for (const result of results) {
    if (result.validationUE.statut !== 'VALIDEE') continue

    // Check if a certificate already exists for this validation
    const existingCert = await withRetry(() =>
      db.certificat.findFirst({
        where: {
          validationUEId: result.validationUE.id,
          statut: 'EMIS',
        },
      })
    )

    if (existingCert) continue

    // Determine certificate type
    const type = getCertificateType(result.validationUE.noteFinale, result.validationUE.statut)
    if (!type) continue

    // Fetch student and UE details for certificate snapshots
    const [etudiant, validationWithDetails] = await Promise.all([
      withRetry(() =>
        db.user.findUnique({
          where: { id: etudiantId },
          select: {
            id: true,
            name: true,
            matricule: true,
            niveau: true,
            filiere: {
              select: {
                id: true,
                nom: true,
                code: true,
                etablissement: {
                  select: {
                    id: true,
                    nom: true,
                    ville: true,
                    pays: true,
                    logo: true,
                  },
                },
              },
            },
          },
        })
      ),
      withRetry(() =>
        db.validationUE.findUnique({
          where: { id: result.validationUE.id },
          include: {
            uniteEnseignement: {
              select: { id: true, code: true, nom: true, creditsECTS: true },
            },
            anneeAcademique: {
              select: { id: true, libelle: true },
            },
          },
        })
      ),
    ])

    if (!etudiant || !validationWithDetails) continue

    const etablissement = etudiant.filiere?.etablissement
    const ue = validationWithDetails.uniteEnseignement
    const annee = validationWithDetails.anneeAcademique

    // Generate verification code (ensure uniqueness)
    let codeVerification = generateVerificationCode()
    const existingCode = await withRetry(() =>
      db.certificat.findUnique({ where: { codeVerification } })
    )
    if (existingCode) {
      codeVerification = generateVerificationCode()
    }

    // Create the certificate with snapshot data
    const certificat = await withRetry(() =>
      db.certificat.create({
        data: {
          codeVerification,
          etudiantId,
          validationUEId: result.validationUE.id,
          type,
          intitule: getIntitule(type),
          mention: getMention(result.validationUE.noteFinale),
          noteFinale: result.validationUE.noteFinale,
          etablissementNom: etablissement?.nom ?? 'Établissement',
          etablissementLogo: etablissement?.logo ?? null,
          etablissementVille: etablissement?.ville ?? null,
          etablissementPays: etablissement?.pays ?? null,
          filiereNom: etudiant.filiere?.nom ?? '',
          filiereCode: etudiant.filiere?.code ?? null,
          ueCode: ue.code,
          ueNom: ue.nom,
          creditsECTS: ue.creditsECTS ?? null,
          etudiantNom: etudiant.name,
          etudiantMatricule: etudiant.matricule ?? null,
          etudiantNiveau: etudiant.niveau ?? null,
          sessionType: result.validationUE.noteRattrapage !== null ? 'RATTRAPAGE' : 'NORMALE',
          anneeAcademique: annee?.libelle ?? null,
          dateEmission: new Date(),
          emetteParId: etudiantId, // Self-generated by the system
        },
      })
    )

    result.certificatsCrees.push({
      id: certificat.id,
      type: certificat.type,
      codeVerification: certificat.codeVerification,
    })
  }

  return results
}
