import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { requireAdminEtablissementAccess, verifySelfAccess } from '@/lib/tenant-access'

async function _POST(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const body = await request.json()
    let {
      enseignantId,
      titre,
      description,
      duree,
      dateDebut,
      dateFin,
      melangeQuestions,
      melangePropositions,
      blocageRetour,
      groupesCibles,
      questions,
      documentIds,
      generationMode,
      contenu,
      filiereId,
      uniteEnseignementId,
      noteTotal,
      niveau,
      sessionExamen,
      anneeAcademiqueId,
    } = body

    if (!enseignantId || !titre || !duree || !dateDebut || !dateFin) {
      return NextResponse.json(
        { error: 'Enseignant, titre, durée, dates de début et de fin requis' },
        { status: 400 }
      )
    }

    // ─── UE obligatoire pour rattacher l'épreuve à un programme ───
    // Une épreuve sans UE devient orpheline : ses sessions ne produisent
    // ni ValidationUE ni certificat. On exige donc l'UE à la création.
    if (!uniteEnseignementId) {
      return NextResponse.json(
        {
          error: "L'Unité d'Enseignement (UE) est obligatoire. Une épreuve non rattachée à une UE ne peut pas générer de certificats pour les étudiants.",
        },
        { status: 400 }
      )
    }

    // ─── Vérifier que l'UE existe et qu'elle est bien accessible ───
    // (UE principale de la filière OU UE partagée avec la filière via UniteEnseignementFiliere)
    const targetUE = await db.uniteEnseignement.findUnique({
      where: { id: uniteEnseignementId },
      select: { id: true, filiereId: true, actif: true },
    })
    if (!targetUE) {
      return NextResponse.json(
        { error: "L'Unité d'Enseignement sélectionnée est introuvable." },
        { status: 404 }
      )
    }
    if (!targetUE.actif) {
      return NextResponse.json(
        { error: "L'Unité d'Enseignement sélectionnée est désactivée." },
        { status: 400 }
      )
    }
    // Si une filière est fournie, vérifier la cohérence filière↔UE
    if (filiereId) {
      const isOwnedByFiliere = targetUE.filiereId === filiereId
      let isSharedWithFiliere = false
      if (!isOwnedByFiliere) {
        const shared = await db.uniteEnseignementFiliere.findFirst({
          where: { uniteEnseignementId, filiereId },
          select: { id: true },
        })
        isSharedWithFiliere = !!shared
      }
      if (!isOwnedByFiliere && !isSharedWithFiliere) {
        return NextResponse.json(
          {
            error: "L'Unité d'Enseignement sélectionnée n'appartient pas à cette filière (ni comme UE principale, ni comme UE secondaire).",
          },
          { status: 400 }
        )
      }
    }

    // ─── Tenant scoping for POST ───
    if (user.role === 'ENSEIGNANT') {
      // ENSEIGNANT must use their own enseignantId
      if (enseignantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez créer des épreuves qu\'en votre nom.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'RESPONSABLE') {
      // RESPONSABLE: can create epreuves for teachers in their establishment
      const teacher = await db.user.findUnique({
        where: { id: enseignantId },
        select: { etablissementId: true },
      })
      if (teacher?.etablissementId && teacher.etablissementId !== user.etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez créer des épreuves que pour les enseignants de votre établissement.' },
          { status: 403 }
        )
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN: must have EtablissementAccess for the enseignant's establishment
      const teacher = await db.user.findUnique({
        where: { id: enseignantId },
        select: { etablissementId: true },
      })
      if (teacher?.etablissementId) {
        const accessError = await requireAdminEtablissementAccess(user, teacher.etablissementId)
        if (accessError) return accessError
      }
    }

    // Validate generationMode
    const validGenerationModes = ['MANUELLE', 'IA_ASSISTEE']
    const epreuveGenerationMode = generationMode && validGenerationModes.includes(generationMode)
      ? generationMode
      : 'MANUELLE'

    // New format: contenu JSON (Banque d'Épreuves)
    const hasContenu = contenu && typeof contenu === 'object' && contenu.questions && Array.isArray(contenu.questions)
    // Old format: questions array (EpreuveQuestion join table)
    const hasQuestions = questions && Array.isArray(questions) && questions.length > 0

    if (!hasContenu && !hasQuestions) {
      return NextResponse.json(
        { error: 'L\'épreuve doit contenir au moins une question (via contenu ou questions)' },
        { status: 400 }
      )
    }

    // Build create data
    const validSessionExamen = ['NORMALE', 'RATTRAPAGE', 'SPECIALE', 'EXCEPTIONNELLE', 'DIFFERE']
    const createData: Prisma.EpreuveUncheckedCreateInput = {
      enseignantId,
      titre,
      description: description || null,
      duree,
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
      melangeQuestions: melangeQuestions ?? true,
      melangePropositions: melangePropositions ?? true,
      blocageRetour: blocageRetour ?? false,
      groupesCibles: groupesCibles
        ? JSON.stringify({ groupes: Array.isArray(groupesCibles) ? groupesCibles : [], niveau: niveau || null })
        : (niveau ? JSON.stringify({ groupes: [], niveau }) : null),
      statut: 'BROUILLON',
      generationMode: epreuveGenerationMode as 'MANUELLE' | 'IA_ASSISTEE',
      filiereId: filiereId || null,
      uniteEnseignementId: uniteEnseignementId || null,
      noteTotal: typeof noteTotal === 'number' && noteTotal > 0 ? noteTotal : 20,
      niveau: niveau || null,
      sessionExamen: validSessionExamen.includes(sessionExamen) ? sessionExamen : 'NORMALE',
      anneeAcademiqueId: anneeAcademiqueId || null,
    }

    // Handle contenu (new JSONB format)
    if (hasContenu) {
      const contenuQuestions = contenu.questions as Array<Record<string, unknown>>
      const validTypes = ['QCU', 'QCM', 'QRC', 'TRS', 'REFLEXION', 'CODE']
      const validDifficultes = ['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT']

      const sanitizedQuestions = contenuQuestions.map((q, idx) => ({
        id: q.id || `q${idx + 1}`,
        type: validTypes.includes(q.type as string) ? q.type : 'QRC',
        enonce: String(q.enonce || ''),
        propositions: q.propositions || null,
        reponseCorrecte: q.reponseCorrecte || null,
        explication: q.explication || null,
        difficulte: validDifficultes.includes(q.difficulte as string) ? q.difficulte : 'MOYEN',
        bareme: typeof q.bareme === 'number' ? q.bareme : 1,
        ueCode: q.ueCode || null,
        ueNom: q.ueNom || null,
      }))

      createData.contenu = {
        questions: sanitizedQuestions,
        consignes: contenu.consignes || '',
        baremeTotal: contenu.baremeTotal || sanitizedQuestions.reduce((sum: number, q) => sum + (q.bareme as number), 0),
      } as Prisma.InputJsonValue
    }

    // Handle old format: EpreuveQuestion join table
    if (hasQuestions && !hasContenu) {
      createData.questions = {
        create: questions.map((q: { questionId: string; bareme: number; ordre: number }, index: number) => ({
          questionId: q.questionId,
          bareme: q.bareme || 1.0,
          ordre: q.ordre ?? index,
        })),
      }
    }

    // Handle EpreuveDocument links if documentIds provided
    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      createData.sourceDocuments = {
        create: documentIds.map((docId: string) => ({
          documentId: docId,
        })),
      }
    }

    // Create the epreuve
    const epreuve = await db.epreuve.create({
      data: createData,
      include: {
        questions: {
          include: {
            question: true,
          },
        },
        sourceDocuments: {
          include: {
            document: {
              select: {
                id: true,
                nomFichier: true,
                typeMime: true,
                statutAnalyse: true,
                themesDetectes: true,
                resumeAnalyse: true,
              },
            },
          },
        },
        filiere: {
          select: { id: true, nom: true, code: true },
        },
        uniteEnseignement: {
          select: { id: true, nom: true, code: true },
        },
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: enseignantId || 'system',
        userEmail: 'system',
        action: 'CREATE_EPREUVE',
        entite: 'Epreuve',
        entiteId: epreuve.id,
        details: `Épreuve « ${titre} » créée (mode: ${epreuveGenerationMode}, format: ${hasContenu ? 'contenu JSONB' : 'questions relation'})`,
      },
    })

    // Parse JSON string fields for response
    const parsedEpreuve = {
      ...epreuve,
      groupesCibles: epreuve.groupesCibles ? JSON.parse(epreuve.groupesCibles as string) : null,
      questions: epreuve.questions.map((eq) => ({
        ...eq,
        question: {
          ...eq.question,
          propositions: eq.question.propositions ? JSON.parse(eq.question.propositions as string) : null,
          themes: eq.question.themes ? JSON.parse(eq.question.themes as string) : null,
        },
      })),
    }

    return NextResponse.json({
      epreuve: parsedEpreuve,
      message: 'Épreuve créée avec succès',
    })
  } catch (error) {
    console.error('Create epreuve error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'épreuve' },
      { status: 500 }
    )
  }
}

async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const etudiantId = searchParams.get('etudiantId')
    const filiereId = searchParams.get('filiereId')
    const responsableId = searchParams.get('responsableId')
    const statutParam = searchParams.get('statut')
    // ─── Multi-statut support: accept comma-separated values ───
    // e.g. ?statut=TERMINEE,CLOTUREE → statuts: ['TERMINEE', 'CLOTUREE']
    // A single value is also accepted for backward compat.
    const statuts = statutParam
      ? statutParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null
    // Helper to apply the multi-statut filter to a where object.
    const applyStatutFilter = (w: Record<string, unknown>) => {
      if (statuts && statuts.length > 0) {
        w.statut = statuts.length === 1 ? statuts[0] : { in: statuts }
      }
    }
    // ─── Lightweight summary mode (?select=summary) ───
    // When set, the ENSEIGNANT branch returns ONLY minimal fields per epreuve
    // (id, titre, dates, statut, noteTotal, filiere.nom) — no questions, no
    // sessions, no sourceDocuments. Useful for dropdowns / overview lists.
    const selectParam = searchParams.get('select')
    const selectSummary = selectParam === 'summary'
    const search = searchParams.get('search') || ''
    const niveauFilter = searchParams.get('niveau')
    const sessionExamenFilter = searchParams.get('sessionExamen')
    const anneeAcademiqueIdFilter = searchParams.get('anneeAcademiqueId')
    const uniteEnseignementIdFilter = searchParams.get('uniteEnseignementId')

    // ─── ETUDIANT: etudiantId must be their own ID ───
    if (etudiantId && user.role === 'ETUDIANT') {
      const selfCheck = verifySelfAccess(user, etudiantId)
      if (selfCheck) return selfCheck
    }

    // ─── ADMIN: verify EtablissementAccess when specific IDs are provided ───
    if (user.role === 'ADMIN') {
      // When responsableId is provided, verify access to the responsable's establishment
      if (responsableId) {
        const responsable = await db.user.findUnique({
          where: { id: responsableId },
          select: { etablissementId: true },
        })
        if (responsable?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, responsable.etablissementId)
          if (accessError) return accessError
        }
      }
      // When enseignantId is provided, verify access to the enseignant's establishment
      if (enseignantId) {
        const teacher = await db.user.findUnique({
          where: { id: enseignantId },
          select: { etablissementId: true },
        })
        if (teacher?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, teacher.etablissementId)
          if (accessError) return accessError
        }
      }
      // When etudiantId is provided, verify access to the student's establishment
      if (etudiantId) {
        const student = await db.user.findUnique({
          where: { id: etudiantId },
          select: { etablissementId: true },
        })
        if (student?.etablissementId) {
          const accessError = await requireAdminEtablissementAccess(user, student.etablissementId)
          if (accessError) return accessError
        }
      }
      // When no specific ID is provided, ADMIN must specify a scope
      if (!responsableId && !enseignantId && !etudiantId && !filiereId) {
        return NextResponse.json(
          { error: 'Vous devez spécifier un scope (enseignantId, etudiantId, filiereId ou responsableId)' },
          { status: 400 }
        )
      }
    }

    // ─── Responsable mode: fetch epreuves for all filières managed by this responsable ───
    if (responsableId) {
      // Find all filières this responsable manages
      const responsableFilieres = await db.filiere.findMany({
        where: { responsableId },
        select: { id: true, etablissementId: true, nom: true },
      })

      if (responsableFilieres.length === 0) {
        return NextResponse.json({ epreuves: [], filieres: [] })
      }

      const etablissementId = responsableFilieres[0].etablissementId
      const allFiliereIds = responsableFilieres.map((f) => f.id)

      // RESPONSABLE: verify they can only query their own filieres
      if (user.role === 'RESPONSABLE' && user.etablissementId !== etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez accéder qu\'aux épreuves de votre établissement.' },
          { status: 403 }
        )
      }

      // If a specific filiereId is also provided, scope to that (must be one of the responsable's filières)
      const targetFiliereIds = filiereId && allFiliereIds.includes(filiereId)
        ? [filiereId]
        : allFiliereIds

      const whereResp: Record<string, unknown> = { deletedAt: null }
      applyStatutFilter(whereResp)

      whereResp.OR = [
        { sessions: { some: { etudiant: { filiereId: { in: targetFiliereIds } } } } },
        { enseignant: { etablissementId } },
      ]

      const epreuves = await db.epreuve.findMany({
        where: whereResp,
        orderBy: { dateDebut: 'desc' },
        include: {
          enseignant: { select: { id: true, name: true, email: true } },
          questions: { select: { id: true, bareme: true, question: { select: { id: true, type: true, enonce: true, difficulte: true } } } },
          sessions: {
            include: {
              etudiant: { select: { id: true, name: true, email: true } },
            },
          },
          filiere: { select: { id: true, nom: true, code: true } },
        },
      })

      // Deduplicate (OR condition can produce duplicates)
      const seen = new Set<string>()
      const dedupedEpreuves = epreuves.filter((e) => {
        if (seen.has(e.id)) return false
        seen.add(e.id)
        return true
      })

      const parsedEpreuves = dedupedEpreuves.map((e) => {
        const contenuData = e.contenu as Record<string, unknown> | null
        const contenuQuestions = contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)
          ? contenuData.questions as Array<Record<string, unknown>>
          : []
        const relationCount = e.questions.length
        const contenuCount = contenuQuestions.length
        const questionCount = relationCount > 0 ? relationCount : contenuCount
        const totalPoints = relationCount > 0
          ? e.questions.reduce((sum, q) => sum + q.bareme, 0)
          : contenuQuestions.reduce((sum, q) => sum + (typeof q.bareme === 'number' ? q.bareme : 1), 0)
        return {
          ...e,
          groupesCibles: e.groupesCibles ? JSON.parse(e.groupesCibles) : null,
          questionCount,
          totalPoints,
        }
      })

      // Server-side search filter
      const filteredEpreuves = search
        ? parsedEpreuves.filter((e) => {
            const q = search.toLowerCase()
            const matchTitre = e.titre.toLowerCase().includes(q)
            const matchDesc = e.description?.toLowerCase().includes(q) ?? false
            const matchEnseignant = e.enseignant?.name?.toLowerCase().includes(q) ?? false
            const matchFiliere = e.filiere?.nom?.toLowerCase().includes(q) ?? false
            return matchTitre || matchDesc || matchEnseignant || matchFiliere
          })
        : parsedEpreuves

      return NextResponse.json({
        epreuves: filteredEpreuves,
        filieres: responsableFilieres.map((f) => ({ id: f.id, nom: f.nom })),
      })
    }

    if (enseignantId) {
      // ENSEIGNANT: can only query their own epreuves
      if (user.role === 'ENSEIGNANT' && enseignantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez accéder qu\'à vos propres épreuves.' },
          { status: 403 }
        )
      }

      const where: Record<string, unknown> = { enseignantId, deletedAt: null }
      applyStatutFilter(where)
      if (niveauFilter) where.niveau = niveauFilter
      if (sessionExamenFilter) where.sessionExamen = sessionExamenFilter
      if (anneeAcademiqueIdFilter) where.anneeAcademiqueId = anneeAcademiqueIdFilter
      if (uniteEnseignementIdFilter) where.uniteEnseignementId = uniteEnseignementIdFilter

      // ─── Lightweight summary mode (?select=summary) ───
      // Returns ONLY { id, titre, dateDebut, dateFin, statut, noteTotal, filiere: { nom } }
      // per epreuve. Avoids massive over-fetch when the frontend only needs a list
      // for a dropdown selector / overview screen — no questions, sessions, or docs.
      if (selectSummary) {
        const summaryEpreuves = await db.epreuve.findMany({
          where,
          orderBy: { dateDebut: 'desc' },
          select: {
            id: true,
            titre: true,
            dateDebut: true,
            dateFin: true,
            statut: true,
            noteTotal: true,
            filiere: { select: { nom: true } },
          },
        })

        return NextResponse.json({ epreuves: summaryEpreuves })
      }

      const epreuves = await db.epreuve.findMany({
        where,
        orderBy: { dateDebut: 'desc' },
        include: {
          enseignant: { select: { id: true, name: true } },
          questions: { include: { question: true } },
          sessions: {
            include: {
              etudiant: { select: { id: true, name: true, email: true } },
            },
          },
          sourceDocuments: {
            include: {
              document: {
                select: {
                  id: true,
                  nomFichier: true,
                  typeMime: true,
                  statutAnalyse: true,
                  themesDetectes: true,
                  resumeAnalyse: true,
                },
              },
            },
          },
          filiere: {
            select: { id: true, nom: true, code: true },
          },
          uniteEnseignement: {
            select: { id: true, nom: true, code: true },
          },
          anneeAcademique: {
            select: { id: true, libelle: true },
          },
        },
      })

      const parsedEpreuves = epreuves.map((e) => ({
        ...e,
        groupesCibles: e.groupesCibles ? JSON.parse(e.groupesCibles) : null,
        etudiantsAutorises: e.etudiantsAutorises ? JSON.parse(e.etudiantsAutorises as string) : null,
        questions: e.questions.map((eq) => ({
          ...eq,
          question: {
            ...eq.question,
            propositions: eq.question.propositions ? JSON.parse(eq.question.propositions as string) : null,
            themes: eq.question.themes ? JSON.parse(eq.question.themes as string) : null,
          },
        })),
      }))

      return NextResponse.json({ epreuves: parsedEpreuves })
    }

    if (filiereId) {
      const filiere = await db.filiere.findUnique({
        where: { id: filiereId },
        select: { etablissementId: true },
      })

      if (!filiere) {
        return NextResponse.json({ epreuves: [] })
      }

      // RESPONSABLE: verify the filiere belongs to their establishment
      if (user.role === 'RESPONSABLE' && user.etablissementId !== filiere.etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez accéder qu\'aux épreuves de votre établissement.' },
          { status: 403 }
        )
      }

      // ADMIN: verify EtablissementAccess for the filiere's establishment
      if (user.role === 'ADMIN') {
        const accessError = await requireAdminEtablissementAccess(user, filiere.etablissementId)
        if (accessError) return accessError
      }

      const whereFiliere: Record<string, unknown> = { deletedAt: null }
      applyStatutFilter(whereFiliere)

      whereFiliere.OR = [
        { sessions: { some: { etudiant: { filiereId } } } },
        { enseignant: { etablissementId: filiere.etablissementId } },
      ]

      const epreuves = await db.epreuve.findMany({
        where: whereFiliere,
        orderBy: { dateDebut: 'desc' },
        include: {
          enseignant: { select: { id: true, name: true, email: true } },
          questions: { select: { id: true, bareme: true, question: { select: { id: true, type: true, enonce: true, difficulte: true } } } },
          sessions: {
            include: {
              etudiant: { select: { id: true, name: true, email: true } },
            },
          },
        },
      })

      const seen = new Set<string>()
      const dedupedEpreuves = epreuves.filter((e) => {
        if (seen.has(e.id)) return false
        seen.add(e.id)
        return true
      })

      const parsedEpreuves = dedupedEpreuves.map((e) => {
        const contenuData = e.contenu as Record<string, unknown> | null
        const contenuQuestions = contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)
          ? contenuData.questions as Array<Record<string, unknown>>
          : []
        const relationCount = e.questions.length
        const contenuCount = contenuQuestions.length
        const questionCount = relationCount > 0 ? relationCount : contenuCount
        const totalPoints = relationCount > 0
          ? e.questions.reduce((sum, q) => sum + q.bareme, 0)
          : contenuQuestions.reduce((sum, q) => sum + (typeof q.bareme === 'number' ? q.bareme : 1), 0)
        return {
          ...e,
          groupesCibles: e.groupesCibles ? JSON.parse(e.groupesCibles) : null,
          questionCount,
          totalPoints,
        }
      })

      return NextResponse.json({ epreuves: parsedEpreuves })
    }

    if (etudiantId) {
      const now = new Date()

      const student = await db.user.findUnique({
        where: { id: etudiantId },
        select: { filiereId: true, niveau: true },
      })
      const studentFiliereId = student?.filiereId || null
      const studentNiveau = student?.niveau || null

      const filiereFilter = studentFiliereId
        ? {
            OR: [
              { filiereId: null, etudiantsAutorises: null },
              { filiereId: studentFiliereId, etudiantsAutorises: null },
              { etudiantsAutorises: { contains: etudiantId } },  // Sessions spéciales: student is authorized
            ],
          }
        : {
            OR: [
              { etudiantsAutorises: null },
              { etudiantsAutorises: { contains: etudiantId } },
            ],
          }

      const [epreuves, completedEpreuves, absentEpreuves] = await Promise.all([
        db.epreuve.findMany({
          where: {
            deletedAt: null,
            statut: { in: ['PLANIFIEE', 'EN_COURS'] },
            dateFin: { gte: now },
            ...filiereFilter,
          },
          orderBy: { dateDebut: 'asc' },
          include: {
            enseignant: { select: { id: true, name: true } },
            questions: { select: { id: true, bareme: true } },
            sessions: {
              where: { etudiantId },
              select: { id: true, statut: true, score: true, dateDebut: true, dateFin: true, resultat: true },
            },
          },
        }),
        db.epreuve.findMany({
          where: {
            deletedAt: null,
            statut: { in: ['TERMINEE', 'CLOTUREE'] },
            sessions: { some: { etudiantId } },
          },
          orderBy: { dateDebut: 'desc' },
          include: {
            enseignant: { select: { id: true, name: true } },
            questions: { select: { id: true, bareme: true } },
            sessions: {
              where: { etudiantId },
              select: { id: true, statut: true, score: true, dateDebut: true, dateFin: true, resultat: true },
            },
          },
        }),
        db.epreuve.findMany({
          where: {
            deletedAt: null,
            statut: { in: ['TERMINEE', 'CLOTUREE'] },
            sessions: { none: { etudiantId } },
            ...filiereFilter,
          },
          orderBy: { dateDebut: 'desc' },
          include: {
            enseignant: { select: { id: true, name: true } },
            questions: { select: { id: true, bareme: true } },
          },
        }),
      ])

      const filterByNiveau = (epreuve: { groupesCibles: string | null }) => {
        if (!studentNiveau) return true
        if (!epreuve.groupesCibles) return true
        try {
          const parsed = JSON.parse(epreuve.groupesCibles as string)
          if (Array.isArray(parsed)) return true
          if (parsed && typeof parsed === 'object' && 'niveau' in parsed) {
            if (!parsed.niveau) return true
            return parsed.niveau === studentNiveau
          }
          return true
        } catch {
          return true
        }
      }

      const allEpreuves = [
        ...epreuves.filter(filterByNiveau),
        ...completedEpreuves,
        ...absentEpreuves.filter(filterByNiveau).map(ep => ({
          ...ep,
          sessions: [{ id: `absent-${ep.id}`, statut: 'ABSENT', score: null, dateDebut: null, dateFin: null, resultat: null }],
        })),
      ].map((e) => {
        const contenuData = e.contenu as Record<string, unknown> | null
        const contenuQuestions = contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)
          ? contenuData.questions as Array<Record<string, unknown>>
          : []
        const relationCount = e.questions.length
        const contenuCount = contenuQuestions.length
        const questionCount = relationCount > 0 ? relationCount : contenuCount
        const totalPoints = relationCount > 0
          ? e.questions.reduce((sum, q) => sum + q.bareme, 0)
          : contenuQuestions.reduce((sum, q) => sum + (typeof q.bareme === 'number' ? q.bareme : 1), 0)
        return {
          ...e,
          groupesCibles: e.groupesCibles ? JSON.parse(e.groupesCibles) : null,
          questionCount,
          totalPoints,
          noteTotal: e.noteTotal || 20,
        }
      })

      return NextResponse.json({ epreuves: allEpreuves })
    }

    return NextResponse.json({ error: 'enseignantId, etudiantId, filiereId ou responsableId requis' }, { status: 400 })
  } catch (error) {
    console.error('List epreuves error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des épreuves' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_POST, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
