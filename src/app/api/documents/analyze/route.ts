import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAIProvider } from '@/lib/ai-providers';

export const maxDuration = 60;

/**
 * Batch analyze all documents with EN_ATTENTE or ERREUR status.
 * Processes documents synchronously (one by one, awaited) for Vercel serverless compatibility.
 */
export async function POST(request: NextRequest) {
  try {
    // Find all documents that need processing
    const pendingDocs = await db.document.findMany({
      where: {
        statutAnalyse: { in: ['EN_ATTENTE', 'ERREUR'] },
        contenuTexte: { not: null } as any,
        deletedAt: null,
      }
    });

    if (pendingDocs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document en attente d\'analyse',
        processed: 0
      });
    }

    const results: Array<{ id: string; filename: string }> = [];
    const errors: Array<{ id: string; filename: string; error: string }> = [];

    for (const doc of pendingDocs) {
      try {
        // Get extracted text from database
        const extractedText = doc.contenuTexte;

        if (!extractedText || extractedText.length < 50) {
          await db.document.update({
            where: { id: doc.id },
            data: {
              statutAnalyse: 'ERREUR',
              erreurAnalyse: 'Le document ne contient pas assez de texte exploitable.',
            }
          });
          errors.push({ id: doc.id, filename: doc.nomFichier, error: 'Texte insuffisant' });
          continue;
        }

        // Update status to processing
        await db.document.update({
          where: { id: doc.id },
          data: { statutAnalyse: 'EN_COURS', erreurAnalyse: null }
        });

        // Analyze with AI using the active provider
        const aiProvider = await getAIProvider();

        const textForAnalysis = extractedText.slice(0, 10000);

        const completion = await aiProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content: `Tu es un assistant pédagogique expert en analyse de contenu académique pour l'enseignement supérieur. Tu analyses des documents de cours pour préparer la génération de questions d'évaluation. Tu dois répondre UNIQUEMENT en JSON valide, sans texte additionnel ni markdown.`
            },
            {
              role: 'user',
              content: `Analyse le document suivant et identifie les éléments clés pour la génération de questions d'évaluation.

Document:
"""
${textForAnalysis}
"""

Réponds en JSON avec la structure suivante:
{
  "themes": ["thème 1", "thème 2", ...],
  "conceptsCles": ["concept 1", "concept 2", ...],
  "chapitres": [
    { "titre": "Chapitre 1", "sujets": ["sujet A", "sujet B"] }
  ],
  "volumeEstime": {
    "QCU": nombre_estimé,
    "QCM": nombre_estimé,
    "QRC": nombre_estimé,
    "TRS": nombre_estimé
  },
  "niveauDifficulte": "FACILE|MOYEN|DIFFICILE|EXPERT",
  "resumeCourt": "Résumé en 2-3 phrases"
}`
            }
          ],
        });

        const responseText = completion.choices[0]?.message?.content || '';

        // Parse the JSON response
        let analysisResult;
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysisResult = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in AI response');
          }
        } catch {
          // Fallback analysis
          const themes = extractThemesHeuristically(extractedText);
          analysisResult = {
            themes,
            conceptsCles: themes.slice(0, 3),
            chapitres: [],
            volumeEstime: { QCU: 10, QCM: 5, QRC: 3, TRS: 1 },
            niveauDifficulte: 'MOYEN',
            resumeCourt: 'Document analysé avec succès (analyse de secours).',
          };
        }

        // Update document with analysis results
        await db.document.update({
          where: { id: doc.id },
          data: {
            statutAnalyse: 'ANALYSE',
            themesDetectes: JSON.stringify(analysisResult.themes || []),
            conceptsCles: JSON.stringify(analysisResult.conceptsCles || []),
            volumeEstime: JSON.stringify(analysisResult.volumeEstime || {}),
            resumeAnalyse: analysisResult.resumeCourt || null,
          }
        });

        results.push({ id: doc.id, filename: doc.nomFichier });

      } catch (err: any) {
        console.error(`Error processing document ${doc.id}:`, err);
        await db.document.update({
          where: { id: doc.id },
          data: {
            statutAnalyse: 'ERREUR',
            erreurAnalyse: err.message || 'Erreur lors de l\'analyse'
          }
        }).catch(console.error);
        errors.push({ id: doc.id, filename: doc.nomFichier, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${results.length} document(s) analysé(s) avec succès${errors.length > 0 ? `, ${errors.length} erreur(s)` : ''}`
    });

  } catch (error: any) {
    console.error('Batch analyze error:', error);
    return NextResponse.json({
      error: 'Erreur lors de l\'analyse en lot',
      details: error.message
    }, { status: 500 });
  }
}

/**
 * Heuristic theme extraction as fallback
 */
function extractThemesHeuristically(text: string): string[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  const potentialTitles = lines
    .filter(l => l.trim().length < 100 && l.trim().length > 3)
    .filter(l => /^[A-ZÀ-ÿ0-9]/.test(l.trim()))
    .slice(0, 5)
    .map(l => l.trim().replace(/^[#*\-\d.]+\s*/, ''))

  return potentialTitles.length > 0 ? potentialTitles : ['Contenu principal']
}
