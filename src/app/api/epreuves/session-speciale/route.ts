import { NextRequest, NextResponse } from 'next/server'
import { Prisma, SessionExamen } from '@prisma/client'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { requireAdminEtablissementAccess } from '@/lib/tenant-access'

// ─── POST: Create a special exam session ───
// Clones an existing epreuve with modified parameters for selected students
async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    const {
      epreuveOrigineId,
      type,
      motif,
      justificatif,
      etudiantsCibles,    // string[] — student IDs
      estPartielle,       // boolean
      questionsSelectionnees, // string[] — question IDs (if partial)
      // Overridable parameters
      duree,
      dateDebut,
      dateFin,
      delaiGrace,
      titre,
      melangeQuestions,
      melangePropositions,
      blocageRetour,
    } = body

    // ─── Validation ───
    if (!epreuveOrigineId) {
      return NextResponse.json({ error: 'L\'ID de l\'épreuve d\'origine est requis' }, { status: 400 })
    }
    if (!type || !['RATTRAPAGE', 'EXCEPTIONNELLE', 'DIFFERE'].includes(type)) {
      return NextResponse.json({ error: 'Type de session spéciale invalide (RATTRAPAGE, EXCEPTIONNELLE ou DIFFERE)' }, { status: 400 })
    }
    if (!motif || motif.trim().length < 5) {
      return NextResponse.json({ error: 'Le motif est requis (min. 5 caractères)' }, { status: 400 })
    }
    if (!etudiantsCibles || !Array.isArray(etudiantsCibles) || etudiantsCibles.length === 0) {
      return NextResponse.json({ error: 'Au moins un étudiant doit être sélectionné' }, { status: 400 })
    }
    if (!dateDebut || !dateFin) {
      return NextResponse.json({ error: 'Les dates de début et de fin sont requises' }, { status: 400 })
    }

    // Date validation
    const debut = new Date(dateDebut)
    const fin = new Date(dateFin)
    if (debut >= fin) {
      return NextResponse.json({ error: 'La date de début doit être antérieure à la date de fin' }, { status: 400 })
    }

    // ─── Fetch original epreuve ───
    const epreuveOrigine = await db.epreuve.findUnique({
      where: { id: epreuveOrigineId },
      include: {
        questions: { include: { question: true } },
        sourceDocuments: true,
        enseignant: { select: { id: true, etablissementId: true } },
      },
    })

    if (!epreuveOrigine || epreuveOrigine.deletedAt) {
      return NextResponse.json({ error: 'Épreuve d\'origine non trouvée' }, { status: 404 })
    }

    // ─── Tenant scoping ───
    if (user.role === 'ENSEIGNANT') {
      if (epreuveOrigine.enseignantId !== user.id) {
        return NextResponse.json({ error: 'Accès refusé. Vous ne pouvez créer une session spéciale que pour vos propres épreuves.' }, { status: 403 })
      }
    } else if (user.role === 'RESPONSABLE') {
      if (epreuveOrigine.enseignant.etablissementId !== user.etablissementId) {
        return NextResponse.json({ error: 'Accès refusé. Vous ne pouvez agir que sur les épreuves de votre établissement.' }, { status: 403 })
      }
    } else if (user.role === 'ADMIN') {
      if (!epreuveOrigine.enseignant.etablissementId) {
        return NextResponse.json({ error: 'Accès refusé. L\'épreuve d\'origine n\'est rattachée à aucun établissement.' }, { status: 403 })
      }
      const accessError = await requireAdminEtablissementAccess(user, epreuveOrigine.enseignant.etablissementId)
      if (accessError) return accessError
    }

    // ─── Verify students exist and are in the right establishment ───
    const students = await db.user.findMany({
      where: {
        id: { in: etudiantsCibles },
        role: 'ETUDIANT',
        actif: true,
      },
      select: { id: true, name: true, email: true, filiereId: true, niveau: true },
    })

    if (students.length !== etudiantsCibles.length) {
      const foundIds = students.map((s) => s.id)
      const missingIds = etudiantsCibles.filter((id: string) => !foundIds.includes(id))
      return NextResponse.json(
        { error: `Certains étudiants n'ont pas été trouvés ou sont inactifs: ${missingIds.join(', ')}` },
        { status: 400 }
      )
    }

    // ─── Build derived epreuve content ───
    let contenu = epreuveOrigine.contenu as Record<string, unknown> | null

    if (estPartielle && questionsSelectionnees && Array.isArray(questionsSelectionnees) && questionsSelectionnees.length > 0) {
      // Filter contenu questions
      if (contenu && typeof contenu === 'object' && Array.isArray(contenu.questions)) {
        const filteredQuestions = (contenu.questions as Array<Record<string, unknown>>).filter(
          (q) => questionsSelectionnees.includes(String(q.id))
        )
        const filteredBaremeTotal = filteredQuestions.reduce(
          (sum, q) => sum + (typeof q.bareme === 'number' ? q.bareme : 1), 0
        )
        contenu = {
          ...contenu,
          questions: filteredQuestions,
          baremeTotal: filteredBaremeTotal,
        }
      }
    }

    // ─── Determine sessionExamen for the derived epreuve ───
    const sessionExamenMap: Record<string, SessionExamen> = {
      RATTRAPAGE: 'RATTRAPAGE',
      EXCEPTIONNELLE: 'EXCEPTIONNELLE',
      DIFFERE: 'DIFFERE',
    }

    // ─── Create derived epreuve ───
    const derivedTitre = titre || `[${type}] ${epreuveOrigine.titre}`
    const derivedDuree = duree || epreuveOrigine.duree

    const createData: Prisma.EpreuveUncheckedCreateInput = {
      enseignantId: epreuveOrigine.enseignantId,
      titre: derivedTitre,
      description: epreuveOrigine.description,
      duree: derivedDuree,
      dateDebut: debut,
      dateFin: fin,
      melangeQuestions: melangeQuestions ?? epreuveOrigine.melangeQuestions,
      melangePropositions: melangePropositions ?? epreuveOrigine.melangePropositions,
      blocageRetour: blocageRetour ?? epreuveOrigine.blocageRetour,
      statut: 'BROUILLON',
      generationMode: epreuveOrigine.generationMode,
      filiereId: epreuveOrigine.filiereId,
      uniteEnseignementId: epreuveOrigine.uniteEnseignementId,
      niveau: epreuveOrigine.niveau,
      sessionExamen: sessionExamenMap[type] || 'SPECIALE',
      anneeAcademiqueId: epreuveOrigine.anneeAcademiqueId,
      noteTotal: epreuveOrigine.noteTotal,
      delaiGrace: delaiGrace ?? epreuveOrigine.delaiGrace,
      proctoringActif: epreuveOrigine.proctoringActif,
      verificationIdentite: epreuveOrigine.verificationIdentite,
      epreuveOrigineId: epreuveOrigineId,
      etudiantsAutorises: JSON.stringify(etudiantsCibles),
      // Copy contenu (filtered if partial)
      contenu: (contenu as Prisma.InputJsonValue) || undefined,
    }

    // Copy source documents
    if (epreuveOrigine.sourceDocuments.length > 0) {
      createData.sourceDocuments = {
        create: epreuveOrigine.sourceDocuments.map((doc) => ({
          documentId: doc.documentId,
        })),
      }
    }

    // Copy EpreuveQuestion relations (only if no contenu format)
    const isContenuFormat = contenu && typeof contenu === 'object' && Array.isArray((contenu as Record<string, unknown>).questions) && ((contenu as Record<string, unknown>).questions as unknown[]).length > 0

    if (!isContenuFormat && epreuveOrigine.questions.length > 0) {
      let questionsToCopy = epreuveOrigine.questions
      if (estPartielle && questionsSelectionnees && questionsSelectionnees.length > 0) {
        questionsToCopy = questionsToCopy.filter((eq) =>
          questionsSelectionnees.includes(eq.questionId)
        )
      }
      createData.questions = {
        create: questionsToCopy.map((eq) => ({
          questionId: eq.questionId,
          bareme: eq.bareme,
          ordre: eq.ordre,
        })),
      }
    }

    const derivedEpreuve = await db.epreuve.create({
      data: createData,
    })

    // ─── Create SessionSpeciale record ───
    const sessionSpeciale = await db.sessionSpeciale.create({
      data: {
        epreuveOrigineId,
        epreuveDeriveeId: derivedEpreuve.id,
        type,
        motif: motif.trim(),
        justificatif: justificatif || null,
        etudiantsCibles: JSON.stringify(etudiantsCibles),
        estPartielle: estPartielle || false,
        questionsSelectionnees: estPartielle && questionsSelectionnees
          ? JSON.stringify(questionsSelectionnees)
          : null,
        creeParId: user.id,
      },
    })

    // ─── Create AuditLog ───
    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'CREATE_SESSION_SPECIALE',
        entite: 'SessionSpeciale',
        entiteId: sessionSpeciale.id,
        details: `Session spéciale (${type}) créée pour l'épreuve « ${epreuveOrigine.titre} » — ${etudiantsCibles.length} étudiant(s) ciblé(s)${estPartielle ? ' (partielle)' : ''}. Motif: ${motif}`,
      },
    })

    return NextResponse.json({
      sessionSpeciale,
      epreuve: {
        ...derivedEpreuve,
        groupesCibles: derivedEpreuve.groupesCibles ? JSON.parse(derivedEpreuve.groupesCibles as string) : null,
        etudiantsAutorises: JSON.parse(derivedEpreuve.etudiantsAutorises as string),
      },
      message: `Session spéciale (${type}) créée avec succès pour ${etudiantsCibles.length} étudiant(s)`,
    })
  } catch (error) {
    console.error('Create session spéciale error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de la session spéciale' },
      { status: 500 }
    )
  }
}

// ─── GET: List special sessions for an epreuve ───
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const epreuveId = searchParams.get('epreuveId')

    if (!epreuveId) {
      return NextResponse.json({ error: 'epreuveId requis' }, { status: 400 })
    }

    const epreuve = await db.epreuve.findUnique({
      where: { id: epreuveId },
      select: { enseignantId: true, enseignant: { select: { etablissementId: true } } },
    })

    if (!epreuve) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    // Tenant scoping
    if (user.role === 'ENSEIGNANT' && epreuve.enseignantId !== user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (user.role === 'RESPONSABLE' && epreuve.enseignant.etablissementId !== user.etablissementId) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (user.role === 'ADMIN') {
      if (!epreuve.enseignant.etablissementId) {
        return NextResponse.json({ error: 'Accès refusé. L\'épreuve n\'est rattachée à aucun établissement.' }, { status: 403 })
      }
      const accessError = await requireAdminEtablissementAccess(user, epreuve.enseignant.etablissementId)
      if (accessError) return accessError
    }

    // Get special sessions where this epreuve is the origin
    const sessionsSpeciales = await db.sessionSpeciale.findMany({
      where: { epreuveOrigineId: epreuveId },
      include: {
        epreuveDerivee: {
          select: {
            id: true,
            titre: true,
            statut: true,
            dateDebut: true,
            dateFin: true,
            duree: true,
            sessionExamen: true,
          },
        },
        creePar: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const parsed = sessionsSpeciales.map((ss) => ({
      ...ss,
      etudiantsCibles: JSON.parse(ss.etudiantsCibles),
      questionsSelectionnees: ss.questionsSelectionnees ? JSON.parse(ss.questionsSelectionnees) : null,
    }))

    return NextResponse.json({ sessionsSpeciales: parsed })
  } catch (error) {
    console.error('Get sessions spéciales error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des sessions spéciales' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
