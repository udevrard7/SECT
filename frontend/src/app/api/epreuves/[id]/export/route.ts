import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { requireAdminEtablissementAccess } from '@/lib/tenant-access'

async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'json'

    // Get epreuve with all sessions and results
    const epreuve = await db.epreuve.findUnique({
      where: { id },
      include: {
        enseignant: { select: { id: true, name: true, email: true, etablissementId: true } },
        questions: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                enonce: true,
                difficulte: true,
              },
            },
          },
          orderBy: { ordre: 'asc' },
        },
        sessions: {
          include: {
            etudiant: { select: { id: true, name: true, email: true, filiere: { select: { id: true, nom: true } } } },
            reponses: true,
            resultat: true,
          },
        },
      },
    })

    if (!epreuve || epreuve.deletedAt) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    // ─── Ownership / authorization checks ───
    // ENSEIGNANT: must be the owner of the epreuve.
    if (user.role === 'ENSEIGNANT') {
      if (epreuve.enseignantId !== user.id) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez exporter que vos propres épreuves.' },
          { status: 403 }
        )
      }
    }

    // RESPONSABLE: must be in the same establishment as the epreuve's enseignant.
    if (user.role === 'RESPONSABLE') {
      const eTab = epreuve.enseignant?.etablissementId
      if (!eTab || eTab !== user.etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez exporter que les épreuves de votre établissement.' },
          { status: 403 }
        )
      }
    }

    // ADMIN: must have an active EtablissementAccess for the epreuve's establishment.
    if (user.role === 'ADMIN') {
      const eTab = epreuve.enseignant?.etablissementId
      if (!eTab) {
        return NextResponse.json(
          { error: 'Accès refusé. Établissement introuvable pour cette épreuve.' },
          { status: 403 }
        )
      }
      const accessError = await requireAdminEtablissementAccess(user, eTab)
      if (accessError) return accessError
    }

    // ETUDIANT: only allowed if they have at least one session for this epreuve.
    if (user.role === 'ETUDIANT') {
      const ownSession = await db.sessionPassation.findFirst({
        where: { epreuveId: id, etudiantId: user.id },
        select: { id: true },
      })
      if (!ownSession) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous n\'avez pas participé à cette épreuve.' },
          { status: 403 }
        )
      }
      // For ETUDIANT, restrict the exported sessions to their own to avoid leaking
      // other students' data. (Admin/Responsable/Enseignant see all sessions.)
      epreuve.sessions = epreuve.sessions.filter((s) => s.etudiantId === user.id)
    }

    // Prepare export data
    const exportData = {
      epreuve: {
        id: epreuve.id,
        titre: epreuve.titre,
        description: epreuve.description,
        duree: epreuve.duree,
        dateDebut: epreuve.dateDebut,
        dateFin: epreuve.dateFin,
        enseignant: epreuve.enseignant?.name || '',
      },
      questions: epreuve.questions.map((eq, index) => ({
        numero: index + 1,
        id: eq.question.id,
        type: eq.question.type,
        enonce: eq.question.enonce.slice(0, 100) + (eq.question.enonce.length > 100 ? '...' : ''),
        bareme: eq.bareme,
      })),
      etudiants: epreuve.sessions.map((session) => ({
        id: session.etudiant.id,
        nom: session.etudiant.name,
        email: session.etudiant.email,
        filiere: session.etudiant.filiere?.nom || null,
        statut: session.statut,
        dateDebut: session.dateDebut,
        dateFin: session.dateFin,
        score: session.score,
        alertes: session.alertes,
        reponses: session.reponses.map((r) => ({
          questionId: r.questionId,
          contenu: r.contenu,
          score: r.score,
          noteIA: r.noteIA,
          commentaire: r.commentaire,
        })),
        resultat: session.resultat ? {
          scoreFinal: session.resultat.scoreFinal,
          dateCorrection: session.resultat.dateCorrection,
        } : null,
      })),
    }

    switch (format) {
      case 'csv':
        return exportCSV(exportData, epreuve.titre)
      case 'json':
        return NextResponse.json(exportData)
      default:
        return NextResponse.json(exportData)
    }
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'export' },
      { status: 500 }
    )
  }
}

function exportCSV(data: Record<string, unknown>, title: string): NextResponse {
  // Build CSV: one row per student with scores per question
  const headers = ['Nom', 'Email', 'Filière', 'Statut', 'Score Total']
  const questions = data.questions as Array<Record<string, unknown>>
  questions.forEach((q, i) => {
    headers.push(`Q${i + 1} (${q.type}/${q.bareme}pts)`)
  })
  headers.push('Alertes')

  const rows = (data.etudiants as Array<Record<string, unknown>>).map((etudiant) => {
    const reponses = etudiant.reponses as Array<Record<string, unknown>>
    const row = [
      etudiant.nom,
      etudiant.email,
      etudiant.filiere || '',
      etudiant.statut,
      etudiant.score ?? '',
    ]
    questions.forEach((q) => {
      const reponse = reponses.find((r) => r.questionId === q.id)
      row.push(reponse ? String(reponse.score ?? '') : '')
    })
    row.push(String(etudiant.alertes || 0))
    return row
  })

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map((v) => escapeCSV(String(v))).join(',')),
  ].join('\n')

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(title)}_resultats.csv"`,
    },
  })
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
