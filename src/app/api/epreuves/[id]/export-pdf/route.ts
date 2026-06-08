import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedHandler } from '@/lib/auth-session'
import {
  generateSujetPDF,
  generateCorrigePDF,
  generateFeuilleReponsesPDF,
  getPDFFilename,
  type EpreuvePDFData,
  type PDFQuestion,
} from '@/lib/pdf/epreuve-pdf'

export type ExportType = 'sujet' | 'corrige' | 'feuille-reponses'

const VALID_EXPORT_TYPES: ExportType[] = ['sujet', 'corrige', 'feuille-reponses']

async function handler(
  request: NextRequest,
  context: { params: any; user: { id: string; email: string; name: string | null; role: string; actif: boolean; etablissementId: string | null; filiereId: string | null } }
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const exportType = (searchParams.get('type') || 'sujet') as ExportType

    // Validate export type
    if (!VALID_EXPORT_TYPES.includes(exportType)) {
      return NextResponse.json(
        { error: `Type d'export invalide. Types valides : ${VALID_EXPORT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Fetch epreuve with all related data
    const epreuve = await db.epreuve.findUnique({
      where: { id },
      include: {
        enseignant: {
          select: {
            id: true,
            name: true,
            email: true,
            etablissementId: true,
            etablissement: {
              select: {
                id: true,
                nom: true,
                logo: true,
                ville: true,
                pays: true,
              },
            },
          },
        },
        questions: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                enonce: true,
                propositions: true,
                reponseCorrecte: true,
                explication: true,
                difficulte: true,
              },
            },
          },
          orderBy: { ordre: 'asc' },
        },
        filiere: {
          select: { id: true, nom: true, code: true },
        },
        uniteEnseignement: {
          select: { id: true, nom: true, code: true },
        },
      },
    })

    if (!epreuve || epreuve.deletedAt) {
      return NextResponse.json({ error: 'Épreuve non trouvée' }, { status: 404 })
    }

    // Authorization check: only the owner teacher, ADMIN, or RESPONSABLE can export
    const isOwner = epreuve.enseignantId === context.user.id
    const isAdmin = context.user.role === 'ADMIN'
    const isResponsable = context.user.role === 'RESPONSABLE'
    // For corrigé, restrict to teachers and admins only (not students)
    if (exportType === 'corrige' && context.user.role === 'ETUDIANT') {
      return NextResponse.json(
        { error: 'Accès refusé. Le corrigé est réservé aux enseignants et administrateurs.' },
        { status: 403 }
      )
    }

    if (!isOwner && !isAdmin && !isResponsable) {
      return NextResponse.json(
        { error: 'Accès refusé. Vous n\'êtes pas autorisé à exporter cette épreuve.' },
        { status: 403 }
      )
    }

    // Build unified questions array (handle both contenu JSONB and old format)
    let questions: PDFQuestion[] = []
    let consignes: string | null = null
    let baremeTotal = 0

    if (epreuve.contenu && typeof epreuve.contenu === 'object') {
      const contenu = epreuve.contenu as {
        questions?: Array<{
          id: string
          type: string
          enonce: string
          propositions?: Array<{ id: string; text: string }> | null
          reponseCorrecte?: string | string[] | null
          explication?: string | null
          difficulte?: string
          bareme: number
        }>
        consignes?: string
        baremeTotal?: number
      }

      consignes = contenu.consignes || null
      baremeTotal = contenu.baremeTotal || 0

      if (contenu.questions && Array.isArray(contenu.questions)) {
        questions = contenu.questions.map((q) => ({
          id: q.id,
          type: (['QCU', 'QCM', 'QRC', 'REFLEXION'].includes(q.type) ? q.type : 'QRC') as PDFQuestion['type'],
          enonce: q.enonce || '',
          propositions: q.propositions || null,
          reponseCorrecte: q.reponseCorrecte || null,
          explication: q.explication || null,
          difficulte: q.difficulte || 'MOYEN',
          bareme: q.bareme || 1,
        }))

        if (baremeTotal === 0) {
          baremeTotal = questions.reduce((sum, q) => sum + q.bareme, 0)
        }
      }
    }

    // Fallback to old format if no contenu questions
    if (questions.length === 0 && epreuve.questions.length > 0) {
      questions = epreuve.questions.map((eq) => {
        const q = eq.question
        // Parse JSON fields from old format
        let propositions: Array<{ id: string; text: string }> | null = null
        if (q.propositions) {
          try {
            const parsed = JSON.parse(q.propositions)
            if (Array.isArray(parsed)) {
              propositions = parsed.map((p: any, idx: number) => ({
                id: p.id || String(idx),
                text: typeof p === 'string' ? p : p.text || p.label || '',
              }))
            }
          } catch {
            // ignore parse errors
          }
        }

        let reponseCorrecte: string | string[] | null = null
        if (q.reponseCorrecte) {
          try {
            const parsed = JSON.parse(q.reponseCorrecte)
            reponseCorrecte = Array.isArray(parsed) ? parsed : String(parsed)
          } catch {
            reponseCorrecte = q.reponseCorrecte
          }
        }

        return {
          id: q.id,
          type: (['QCU', 'QCM', 'QRC', 'REFLEXION'].includes(q.type) ? q.type : 'QRC') as PDFQuestion['type'],
          enonce: q.enonce || '',
          propositions,
          reponseCorrecte,
          explication: q.explication || null,
          difficulte: q.difficulte || 'MOYEN',
          bareme: eq.bareme || 1,
        }
      })

      baremeTotal = questions.reduce((sum, q) => sum + q.bareme, 0)
    }

    // Build etablissement info
    const etablissement = epreuve.enseignant.etablissement || {
      id: '',
      nom: 'Établissement non renseigné',
      logo: null,
      ville: null,
      pays: null,
    }

    // Build the PDF data
    const pdfData: EpreuvePDFData = {
      id: epreuve.id,
      titre: epreuve.titre,
      description: epreuve.description,
      duree: epreuve.duree,
      dateDebut: epreuve.dateDebut,
      dateFin: epreuve.dateFin,
      noteTotal: epreuve.noteTotal || 20,
      etablissement: {
        nom: etablissement.nom,
        logo: etablissement.logo,
        ville: etablissement.ville,
        pays: etablissement.pays,
      },
      filiere: epreuve.filiere ? {
        nom: epreuve.filiere.nom,
        code: epreuve.filiere.code,
      } : null,
      uniteEnseignement: epreuve.uniteEnseignement ? {
        nom: epreuve.uniteEnseignement.nom,
        code: epreuve.uniteEnseignement.code,
      } : null,
      questions,
      consignes,
      baremeTotal,
    }

    // Generate the PDF
    let doc
    switch (exportType) {
      case 'corrige':
        doc = generateCorrigePDF(pdfData)
        break
      case 'feuille-reponses':
        doc = generateFeuilleReponsesPDF(pdfData)
        break
      case 'sujet':
      default:
        doc = generateSujetPDF(pdfData)
        break
    }

    // Get PDF as buffer
    const pdfBuffer = doc.output('arraybuffer')

    // Build filename
    const filename = getPDFFilename(epreuve.titre, exportType)

    // Return PDF as response
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[export-pdf] Error generating PDF:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la génération du PDF' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handler, ['ENSEIGNANT', 'ADMIN', 'RESPONSABLE'])
