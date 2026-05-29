import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractText } from '@/lib/text-extraction';

/**
 * Batch analyze all documents with EN_ATTENTE or ERREUR status.
 * Called by the frontend after uploading multiple files.
 */
export async function POST(request: NextRequest) {
  try {
    // Find all documents that need processing
    const pendingDocs = await db.document.findMany({
      where: {
        statutAnalyse: { in: ['EN_ATTENTE', 'ERREUR'] }
      }
    });

    if (pendingDocs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document en attente d\'analyse',
        processed: 0
      });
    }

    const results = [];
    const errors = [];

    for (const doc of pendingDocs) {
      try {
        // Update status to processing
        await db.document.update({
          where: { id: doc.id },
          data: { statutAnalyse: 'EN_COURS', erreurAnalyse: null }
        });

        // Extract text
        let content = doc.contenuTexte;
        if (!content) {
          const extraction = await extractText(doc.cheminStockage);
          content = extraction.text;

          if (!content || extraction.wordCount === 0) {
            await db.document.update({
              where: { id: doc.id },
              data: {
                statutAnalyse: 'ERREUR',
                erreurAnalyse: 'Impossible d\'extraire le texte du document.',
              }
            });
            errors.push({ id: doc.id, filename: doc.nomFichier, error: 'Texte vide' });
            continue;
          }

          await db.document.update({
            where: { id: doc.id },
            data: { contenuTexte: content }
          });
        }

        // Analyze with AI
        const { analyzeDocument } = await import('@/lib/ai-analyzer');
        const analysis = await analyzeDocument(content, doc.nomFichier);

        await db.document.update({
          where: { id: doc.id },
          data: {
            statutAnalyse: 'ANALYSE',
            resumeAnalyse: analysis.resume,
            themesDetectes: JSON.stringify(analysis.themesCles),
            conceptsCles: JSON.stringify(analysis.conceptsCles),
            volumeEstime: analysis.volumeEstime,
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
