import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isSupportedFileType, getMimeType } from '@/lib/text-extraction';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = path.join(process.cwd(), 'upload');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    const ownerId = formData.get('ownerId') as string || 'default-user';

    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        // Validate file type
        if (!isSupportedFileType(file.name)) {
          errors.push({
            filename: file.name,
            error: 'Format non supporté. Formats acceptés: .pdf, .docx, .doc, .pptx, .txt, .md'
          });
          continue;
        }

        // Validate file size (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
          errors.push({
            filename: file.name,
            error: 'Fichier trop volumineux (max 50 Mo)'
          });
          continue;
        }

        // Generate unique filename
        const ext = path.extname(file.name).toLowerCase();
        const uniqueName = `${uuidv4()}${ext}`;
        const filePath = path.join(UPLOAD_DIR, uniqueName);

        // Ensure upload directory exists
        if (!fs.existsSync(UPLOAD_DIR)) {
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }

        // Save file to disk
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        fs.writeFileSync(filePath, buffer);

        // Determine MIME type
        const mimeType = getMimeType(file.name);

        // Create database record with EN_ATTENTE status
        const document = await db.document.create({
          data: {
            nomFichier: file.name,
            cheminStockage: filePath,
            tailleFichier: file.size,
            typeMime: mimeType,
            statutAnalyse: 'EN_ATTENTE',
            ownerId: ownerId,
          }
        });

        results.push({
          id: document.id,
          nomFichier: document.nomFichier,
          typeMime: document.typeMime,
          tailleFichier: document.tailleFichier,
          statutAnalyse: document.statutAnalyse,
        });

      } catch (fileError: any) {
        console.error(`Error uploading file ${file.name}:`, fileError);
        errors.push({
          filename: file.name,
          error: fileError.message || 'Erreur lors du traitement du fichier'
        });
      }
    }

    return NextResponse.json({
      success: true,
      uploaded: results,
      errors: errors.length > 0 ? errors : undefined,
      message: `${results.length} fichier(s) importé(s) avec succès${errors.length > 0 ? `, ${errors.length} erreur(s)` : ''}`
    }, { status: 201 });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({
      error: 'Erreur lors de l\'importation des fichiers',
      details: error.message
    }, { status: 500 });
  }
}
