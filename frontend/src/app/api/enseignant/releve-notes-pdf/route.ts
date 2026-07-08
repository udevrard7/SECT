/**
 * GET /api/enseignant/releve-notes-pdf?etudiantId=X
 *
 * Génère un relevé de notes individuel PDF (design institutionnel) pour un
 * étudiant — toutes ses UE/épreuves, pas une seule note.
 *
 * Flow :
 *   1. Lit le cookie access_token (auth httpOnly)
 *   2. GET /api/me → infos enseignant (nom)
 *   3. GET /api/enseignant/etudiants → infos étudiant (nom, matricule, filière, niveau, UEs)
 *   4. GET /api/resultats?etudiantId=X → notes par épreuve
 *   5. GET /api/etablissements/{etabId} → nom + logo + ville/pays
 *   6. Regroupe les notes par UE
 *   7. renderReleveNotesPDF(data) → Buffer PDF
 *
 * Sécurité : le token JWT est forwardé au backend Go qui vérifie l'auth + RLS.
 * L'enseignant ne voit que les étudiants de ses UE affectées.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renderReleveNotesPDF, type ReleveNotesPDFData, type UERelevé, type EpreuveNote } from '@/lib/pdf/releve-notes-pdf-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_URL = 'https://sect-s1pb.onrender.com'

interface SessionResultat {
  id: string
  etudiantId: string
  epreuveId: string
  statut: string
  score: number | null
  dateFin: string | null
  epreuve?: {
    id: string
    titre: string
    noteTotal: number
    duree?: number
    uniteEnseignement?: { id: string; code: string; nom: string; creditsECTS?: number }
    uniteEnseignementId?: string
  }
  sessionType?: string
}

interface EtudiantInfo {
  id: string
  name: string
  email: string
  matricule: string | null
  niveau: string | null
  filiere?: { id: string; nom: string; code: string } | null
  ues?: { id: string; code: string; nom: string; creditsECTS?: number }[]
  etablissementId?: string | null
}

interface MeInfo {
  id: string
  name: string
  email: string
  role: string
  etablissementId?: string | null
}

interface EtablissementInfo {
  id: string
  nom: string
  logo?: string | null
  ville?: string | null
  pays?: string | null
}

export async function GET(req: NextRequest) {
  try {
    const accessToken = req.cookies.get('access_token')?.value
    if (!accessToken) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 })
    }

    const etudiantId = req.nextUrl.searchParams.get('etudiantId')
    if (!etudiantId) {
      return NextResponse.json({ error: 'etudiantId requis' }, { status: 400 })
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Cookie': `access_token=${accessToken}`,
    }

    // 1. Fetch /api/me (infos enseignant)
    const meRes = await fetch(`${BACKEND_URL}/api/me`, { headers, cache: 'no-store' })
    if (!meRes.ok) {
      return NextResponse.json({ error: 'auth échouée' }, { status: 401 })
    }
    const me: MeInfo = await meRes.json()

    // 2. Fetch les étudiants de l'enseignant pour trouver l'étudiant cible
    //    (le backend filtre par RLS — l'enseignant ne voit que ses étudiants)
    //    On doit trouver la filière/niveau de l'étudiant. On essaie d'abord
    //    /api/etudiants (liste globale) puis /api/enseignant/etudiants.
    let etudiant: EtudiantInfo | null = null

    // Essai 1 : /api/etudiants (peut être filtré par RLS selon le rôle)
    const etuRes = await fetch(`${BACKEND_URL}/api/etudiants?limit=1000`, { headers, cache: 'no-store' })
    if (etuRes.ok) {
      const etuData = await etuRes.json()
      const etudiants: EtudiantInfo[] = etuData.etudiants || etuData.users || []
      etudiant = etudiants.find((e) => e.id === etudiantId) || null
    }

    // Essai 2 : si pas trouvé, on construit un étudiant minimal depuis /api/users/{id}
    if (!etudiant) {
      const userRes = await fetch(`${BACKEND_URL}/api/users/${etudiantId}`, { headers, cache: 'no-store' })
      if (userRes.ok) {
        const userData = await userRes.json()
        etudiant = {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          matricule: userData.matricule ?? null,
          niveau: userData.niveau ?? null,
          filiere: userData.filiere || null,
          ues: userData.ues || [],
          etablissementId: userData.etablissementId ?? null,
        }
      }
    }

    if (!etudiant) {
      return NextResponse.json({ error: 'étudiant introuvable ou accès refusé' }, { status: 404 })
    }

    // 3. Fetch les résultats de l'étudiant (notes par épreuve)
    const resultatsRes = await fetch(`${BACKEND_URL}/api/resultats?etudiantId=${etudiantId}`, { headers, cache: 'no-store' })
    if (!resultatsRes.ok) {
      return NextResponse.json({ error: 'impossible de récupérer les notes' }, { status: 502 })
    }
    const resultatsData = await resultatsRes.json()
    const resultats: SessionResultat[] = resultatsData.resultats || []

    // 4. Fetch l'établissement (nom + logo + ville/pays)
    const etabId = etudiant.etablissementId || me.etablissementId
    let etablissement: EtablissementInfo = {
      id: '',
      nom: 'Établissement',
      logo: null,
      ville: null,
      pays: null,
    }
    if (etabId) {
      const etabRes = await fetch(`${BACKEND_URL}/api/etablissements/${etabId}`, { headers, cache: 'no-store' })
      if (etabRes.ok) {
        const etabData = await etabRes.json()
        const e = etabData.etablissement || etabData
        etablissement = {
          id: e.id,
          nom: e.nom || e.name || 'Établissement',
          logo: e.logo || e.logoUrl || null,
          ville: e.ville || null,
          pays: e.pays || null,
        }
      }
    }

    // 5. Regrouper les notes par UE
    const ueMap = new Map<string, UERelevé>()

    // D'abord, initialiser avec les UE de l'étudiant (même sans notes)
    if (etudiant.ues && etudiant.ues.length > 0) {
      for (const ue of etudiant.ues) {
        ueMap.set(ue.id, {
          ueId: ue.id,
          ueCode: ue.code,
          ueNom: ue.nom,
          creditsECTS: ue.creditsECTS ?? null,
          epreuves: [],
        })
      }
    }

    // Ensuite, ajouter les épreuves avec notes (et créer les UE manquantes)
    for (const r of resultats) {
      if (!r.epreuve) continue
      const ueId = r.epreuve.uniteEnseignement?.id || r.epreuve.uniteEnseignementId || 'unknown'
      const ueCode = r.epreuve.uniteEnseignement?.code || '—'
      const ueNom = r.epreuve.uniteEnseignement?.nom || 'Unité d\'enseignement'
      const creditsECTS = r.epreuve.uniteEnseignement?.creditsECTS ?? null

      if (!ueMap.has(ueId)) {
        ueMap.set(ueId, {
          ueId,
          ueCode,
          ueNom,
          creditsECTS,
          epreuves: [],
        })
      }

      const epreuveNote: EpreuveNote = {
        epreuveId: r.epreuve.id,
        epreuveTitre: r.epreuve.titre,
        noteTotal: r.epreuve.noteTotal || 20,
        note: r.score,
        sessionType: r.sessionType || 'NORMALE',
        dateFin: r.dateFin,
      }
      ueMap.get(ueId)!.epreuves.push(epreuveNote)
    }

    const ues = Array.from(ueMap.values())

    // 6. Construire les données du PDF
    const pdfData: ReleveNotesPDFData = {
      etudiantNom: etudiant.name,
      etudiantMatricule: etudiant.matricule,
      etudiantNiveau: etudiant.niveau,
      filiereNom: etudiant.filiere?.nom || '—',
      filiereCode: etudiant.filiere?.code || null,
      etablissementNom: etablissement.nom,
      etablissementLogo: etablissement.logo ?? null,
      etablissementVille: etablissement.ville ?? null,
      etablissementPays: etablissement.pays ?? null,
      enseignantNom: me.name,
      anneeAcademique: null, // TODO: récupérer depuis l'année courante de l'établissement
      dateEmission: new Date().toISOString(),
      ues,
    }

    // 7. Générer le PDF
    const pdfBuffer = await renderReleveNotesPDF(pdfData)

    // 8. Retourner le PDF
    const safeName = etudiant.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="releve_notes_${safeName}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[enseignant/releve-notes-pdf] Error:', err)
    return NextResponse.json(
      { error: 'erreur génération PDF', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
