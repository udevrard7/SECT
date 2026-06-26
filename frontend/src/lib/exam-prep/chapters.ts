import { db } from '@/lib/db'

/**
 * Persiste les chapitres d'un document après analyse IA.
 *
 * L'analyse IA (POST /api/documents et POST /api/documents/[id]/analyze)
 * produit déjà un tableau `chapitres: [{ titre, sujets[] }]`, mais ce
 * tableau était JETÉ — seul themes/concepts/volume/resume étaient
 * persistés. Cette fonction crée les enregistrements `Chapter`
 * correspondants pour le module Préparation aux examens (ancrage RAG,
 * génération ciblée, flashcards, SRS, planning).
 *
 * Idempotente : supprime les chapitres existants du document avant de
 * recréer les nouveaux. Sûre pour la ré-analyse.
 *
 * @param documentId  ID du Document analysé
 * @param chapitres   Tableau { titre, sujets[] } issu de l'analyse IA
 */
export async function persistChapters(
  documentId: string,
  chapitres: Array<{ titre?: string; sujets?: string[] }> | undefined | null
): Promise<number> {
  if (!chapitres || !Array.isArray(chapitres) || chapitres.length === 0) {
    // Nettoie quand même les anciens chapitres si l'IA n'en retourne aucun
    await db.chapter.deleteMany({ where: { documentId } })
    return 0
  }

  // Filtre les chapitres valides (titre non vide)
  const valid = chapitres
    .filter((c) => c && typeof c.titre === 'string' && c.titre.trim().length > 0)
    .map((c) => ({
      documentId,
      titre: (c.titre as string).trim().slice(0, 300),
      sujets: Array.isArray(c.sujets) ? JSON.stringify(c.sujets) : null,
      // contenu: non extractible ici (le texte complet est dans Document.contenuTexte,
      // le découpage par chapitre demanderait un post-traitement IA supplémentaire).
    }))

  // Transaction : delete existing + create new (idempotent pour la ré-analyse)
  await db.$transaction([
    db.chapter.deleteMany({ where: { documentId } }),
    ...(valid.length > 0
      ? [db.chapter.createMany({ data: valid, skipDuplicates: true })]
      : []),
  ])

  return valid.length
}
