import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAIProvider } from '@/lib/ai-providers'

export const maxDuration = 60

// AI-grade a homework submission
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get the submission with devoir info
    const soumission = await db.soumission.findUnique({
      where: { id },
      include: {
        Devoir: {
          include: {
            GrilleEvaluation: true,
            UniteEnseignement: { select: { code: true, nom: true } },
          },
        },
        User: { select: { id: true, name: true } },
      },
    })

    if (!soumission) {
      return NextResponse.json({ error: 'Soumission non trouvée' }, { status: 404 })
    }

    if (!soumission.contenuTexte && !soumission.fichiersSoumis) {
      return NextResponse.json({ error: 'Aucun contenu à évaluer' }, { status: 400 })
    }

    const noteMax = soumission.Devoir.noteMax || 20

    // Build evaluation prompt
    let criteresStr = ''
    if (soumission.Devoir.GrilleEvaluation?.criteres) {
      try {
        const criteres = typeof soumission.Devoir.GrilleEvaluation.criteres === 'string'
          ? JSON.parse(soumission.Devoir.GrilleEvaluation.criteres)
          : soumission.Devoir.GrilleEvaluation.criteres
        criteresStr = JSON.stringify(criteres, null, 2)
      } catch {
        criteresStr = String(soumission.Devoir.GrilleEvaluation.criteres)
      }
    }

    const prompt = `Tu es un correcteur pédagogique expert pour l'enseignement supérieur. Évalue la soumission d'un étudiant pour un devoir.

Titre du devoir: ${soumission.Devoir.titre}
Description: ${soumission.Devoir.description || 'Non définie'}
Consignes: ${soumission.Devoir.consignes || 'Non définies'}
UE: ${soumission.Devoir.UniteEnseignement?.code} — ${soumission.Devoir.UniteEnseignement?.nom}
Note maximale: ${noteMax}

${criteresStr ? `Grille d'évaluation:\n${criteresStr}` : 'Aucune grille d\'évaluation définie.'}

Contenu soumis par l'étudiant:
${soumission.contenuTexte || '(Contenu textuel non fourni — fichiers soumis)'}

Évalue cette soumission et donne:
1. Une note sur ${noteMax} (nombre décimal possible)
2. Une justification détaillée en français${criteresStr ? ' avec évaluation par critère' : ''}

Réponds UNIQUEMENT en JSON:
{
  "note": nombre_sur_${noteMax},
  "justification": "justification détaillée"
}`

    const aiProvider = await getAIProvider()

    const completion = await aiProvider.chatCompletion({
      messages: [
        {
          role: 'system',
          content: 'Tu es un correcteur pédagogique bienveillant mais rigoureux. Tu évalues les devoirs des étudiants de manière juste et constructive. Tu réponds UNIQUEMENT en JSON valide.'
        },
        { role: 'user', content: prompt }
      ],
    })

    const responseText = completion.choices[0]?.message?.content || ''

    let aiResult
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        aiResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found')
      }
    } catch {
      aiResult = {
        note: noteMax * 0.5,
        justification: 'Évaluation IA non disponible - note moyenne attribuée par défaut',
      }
    }

    const aiNote = Math.max(0, Math.min(noteMax, Number(aiResult.note) || 0))

    // Update the submission with AI proposal (NOT the final note)
    await db.soumission.update({
      where: { id },
      data: {
        noteIA: aiNote,
        justificationIA: aiResult.justification || '',
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'AI_GRADE_HOMEWORK',
        entite: 'Soumission',
        entiteId: id,
        details: `Correction IA devoir — note ${aiNote}/${noteMax}`,
      },
    })

    return NextResponse.json({
      aiGrade: {
        note: aiNote,
        noteMax,
        justification: aiResult.justification,
      },
      message: 'Évaluation IA effectuée',
    })
  } catch (error) {
    console.error('AI grade homework error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'évaluation IA du devoir' },
      { status: 500 }
    )
  }
}
