import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'json'

    // Get epreuve with all sessions and results
    const epreuve = await db.epreuve.findUnique({
      where: { id },
      include: {
        enseignant: { select: { id: true, name: true, email: true } },
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
            reponses: {
              include: {
                question: { select: { id: true, type: true, enonce: true } },
              },
            },
            resultat: true,
          },
        },
      },
    })

    if (!epreuve) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
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
        enseignant: epreuve.enseignant.name,
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
          type: r.question.type,
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
