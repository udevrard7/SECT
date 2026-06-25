import { NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

/**
 * GET /api/exam-prep/documents
 *
 * Liste les documents de cours accessibles à l'étudiant connecté pour le
 * module Préparation aux examens. Chaque document est renvoyé avec ses
 * chapitres (unité de révision).
 *
 * Scoping (sécurité multi-tenant + pédagogique) :
 *  L'étudiant ne voit QUE les documents liés à une Unité d'Enseignement
 *  (UE) elle-même liée à sa filière ET à son niveau. Les documents sans
 *  UE (ou liés à une UE d'une autre filière/niveau) sont exclus — c'est
 *  volontaire pour ne pas exposer les documents privés des enseignants.
 *
 *  Rôle ETUDIANT uniquement. L'enseignant voit ses documents via
 *  /api/documents (interface enseignant existante).
 *
 *  Réponse :
 *   {
 *     documents: [{
 *       id, nomFichier, typeMime, tailleFichier, statutAnalyse,
 *       themesDetectes, resumeAnalyse, dateUpload,
 *       uniteEnseignement: { id, code, nom, creditsECTS },
 *       owner: { id, name },
 *       chapters: [{ id, titre, ordre, sujets }]
 *     }]
 *   }
 */
async function _GET(_request: Request, context: { params: unknown; user: AuthenticatedUser }) {
  try {
    const { user } = context

    // L'étudiant doit avoir une filière et un niveau pour être scoppé
    if (!user.filiereId || !user.niveau) {
      return NextResponse.json({
        documents: [],
        message: "Aucune filière ou niveau défini sur votre compte. Contactez votre responsable.",
      })
    }

    const filiereId: string = user.filiereId
    const niveau = user.niveau

    // Récupère les UE de la filière+niveau de l'étudiant
    const ues = await withRetry(() =>
      db.uniteEnseignement.findMany({
        where: {
          filiereId,
          actif: true,
          // L'UE peut cibler un niveau unique (champ `niveau`) ou plusieurs
          // niveaux (champ JSON `niveaux`). On retient les UE qui matchent
          // au moins l'un des deux.
          OR: [
            { niveau },
            { niveaux: { contains: niveau } },
          ],
        },
        select: { id: true },
      })
    )

    const ueIds = ues.map((u) => u.id)
    if (ueIds.length === 0) {
      return NextResponse.json({ documents: [] })
    }

    // Documents liés à ces UE, analysés avec succès, non supprimés
    const documents = await withRetry(() =>
      db.document.findMany({
        where: {
          deletedAt: null,
          uniteEnseignementId: { in: ueIds },
          statutAnalyse: 'ANALYSE',
          contenuTexte: { not: null },
        },
        select: {
          id: true,
          nomFichier: true,
          typeMime: true,
          tailleFichier: true,
          statutAnalyse: true,
          themesDetectes: true,
          resumeAnalyse: true,
          dateUpload: true,
          uniteEnseignement: {
            select: { id: true, code: true, nom: true, creditsECTS: true },
          },
          owner: {
            select: { id: true, name: true },
          },
          chapters: {
            select: { id: true, titre: true, ordre: true, sujets: true },
            orderBy: { ordre: 'asc' },
          },
        },
        orderBy: { dateUpload: 'desc' },
      })
    )

    // Parse les champs JSON stringifiés pour le frontend
    const parsed = documents.map((d) => ({
      ...d,
      themesDetectes: d.themesDetectes ? safeJsonParse(d.themesDetectes, []) : [],
      chapters: d.chapters.map((c) => ({
        ...c,
        sujets: c.sujets ? safeJsonParse(c.sujets, []) : [],
      })),
    }))

    return NextResponse.json({ documents: parsed })
  } catch (error) {
    console.error('exam-prep/documents GET error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des documents" },
      { status: 500 }
    )
  }
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const GET = withAuth(_GET, ['ETUDIANT'])
