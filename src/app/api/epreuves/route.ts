import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

async function _POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
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
    } = body

    if (!enseignantId || !titre || !duree || !dateDebut || !dateFin) {
      return NextResponse.json(
        { error: 'Enseignant, titre, durée, dates de début et de fin requis' },
        { status: 400 }
      )
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
    const createData: Record<string, unknown> = {
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
      }
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

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const etudiantId = searchParams.get('etudiantId')
    const filiereId = searchParams.get('filiereId')
    const responsableId = searchParams.get('responsableId')
    const statut = searchParams.get('statut')
    const search = searchParams.get('search') || ''

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

      // If a specific filiereId is also provided, scope to that (must be one of the responsable's filières)
      const targetFiliereIds = filiereId && allFiliereIds.includes(filiereId)
        ? [filiereId]
        : allFiliereIds

      const whereResp: Record<string, unknown> = { deletedAt: null }
      if (statut) whereResp.statut = statut

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
      const where: Record<string, unknown> = { enseignantId, deletedAt: null }
      if (statut) where.statut = statut

      const epreuves = await db.epreuve.findMany({
        where,
        orderBy: { dateDebut: 'desc' },
        include: {
          enseignant: { select: { id: true, name: true } },
          questions: { include: { question: true } },
          sessions: {
            select: { id: true, statut: true, score: true, etudiantId: true },
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

      const parsedEpreuves = epreuves.map((e) => ({
        ...e,
        groupesCibles: e.groupesCibles ? JSON.parse(e.groupesCibles) : null,
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

      const whereFiliere: Record<string, unknown> = { deletedAt: null }
      if (statut) whereFiliere.statut = statut

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
              { filiereId: null },
              { filiereId: studentFiliereId },
            ],
          }
        : {}

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
