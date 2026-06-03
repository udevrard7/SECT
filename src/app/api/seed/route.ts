import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

/**
 * POST /api/seed
 * Initialisation de la base de données.
 * - Crée les plans d'abonnement par défaut en Franc CFA (XOF)
 * - Ne crée AUCUNE donnée de démonstration
 * - L'admin doit être créé manuellement ou via le formulaire d'inscription
 */
export async function POST(request: NextRequest) {
  try {
    // Allow unauthenticated seeding when database is completely empty
    const existingUsers = await db.user.count()
    const existingPlans = await db.plan.count()

    // If plans already exist, DB is seeded
    if (existingPlans > 0) {
      return NextResponse.json(
        {
          message: 'La base de données est déjà initialisée',
          users: existingUsers,
          plans: existingPlans,
        },
        { status: 200 }
      )
    }

    const saltRounds = 10
    const result: string[] = []

    // ─── Create Plans (prices in XOF — Franc CFA) ───
    const planGratuit = await db.plan.create({
      data: {
        nom: 'Gratuit',
        type: 'GRATUIT',
        prixMensuel: 0,
        prixAnnuel: 0,
        nbEtablissementsMax: 1,
        nbFilieresMax: 3,
        nbEnseignantsMax: 10,
        nbEtudiantsMax: 50,
        nbQuestionsMax: 100,
        nbEvaluationsMois: 5,
        iaGeneration: false,
        iaCorrection: false,
        proctoring: false,
        exportPDF: true,
        support: 'email',
        description: 'Découvrez SECT avec ce plan gratuit',
        actif: true,
      },
    })
    result.push('Plan: Gratuit')

    await db.plan.create({
      data: {
        nom: 'Essentiel',
        type: 'ESSENTIEL',
        prixMensuel: 29900, // 29 900 XOF/mois
        prixAnnuel: 299000, // 299 000 XOF/an (≈2 mois offerts)
        nbEtablissementsMax: 1,
        nbFilieresMax: 10,
        nbEnseignantsMax: 50,
        nbEtudiantsMax: 500,
        nbQuestionsMax: 500,
        nbEvaluationsMois: 50,
        iaGeneration: true,
        iaCorrection: false,
        proctoring: false,
        exportPDF: true,
        support: 'email',
        description: 'Idéal pour les petites structures',
        actif: true,
      },
    })
    result.push('Plan: Essentiel')

    await db.plan.create({
      data: {
        nom: 'Professionnel',
        type: 'PROFESSIONNEL',
        prixMensuel: 89900, // 89 900 XOF/mois
        prixAnnuel: 899000, // 899 000 XOF/an (≈2 mois offerts)
        nbEtablissementsMax: 5,
        nbFilieresMax: 50,
        nbEnseignantsMax: 200,
        nbEtudiantsMax: 2000,
        nbQuestionsMax: 5000,
        nbEvaluationsMois: 500,
        iaGeneration: true,
        iaCorrection: true,
        proctoring: true,
        exportPDF: true,
        support: 'chat',
        description: 'Pour les établissements exigeants',
        actif: true,
      },
    })
    result.push('Plan: Professionnel')

    await db.plan.create({
      data: {
        nom: 'Entreprise',
        type: 'ENTREPRISE',
        prixMensuel: 249000, // 249 000 XOF/mois
        prixAnnuel: 2490000, // 2 490 000 XOF/an (≈2 mois offerts)
        nbEtablissementsMax: 50,
        nbFilieresMax: 200,
        nbEnseignantsMax: 1000,
        nbEtudiantsMax: 10000,
        nbQuestionsMax: 50000,
        nbEvaluationsMois: 5000,
        iaGeneration: true,
        iaCorrection: true,
        proctoring: true,
        exportPDF: true,
        support: 'telephone',
        description: 'Solution complète pour les grands groupes',
        actif: true,
      },
    })
    result.push('Plan: Entreprise')

    // ─── Create default PlatformSettings ───
    const existingSettings = await db.platformSettings.count()
    if (existingSettings === 0) {
      await db.platformSettings.create({
        data: {
          id: 'default',
          settings: JSON.stringify({
            maintenanceMode: false,
            maxFileUploadMB: 10,
            allowedFileTypes: ['pdf', 'docx', 'doc', 'txt'],
            devise: 'XOF',
            paysDefault: "Côte d'Ivoire",
          }),
          updatedAt: new Date(),
        },
      })
      result.push('PlatformSettings: créé')
    }

    return NextResponse.json({
      message: 'Base de données initialisée avec succès',
      created: result,
      plans: 4,
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: "Erreur lors de l'initialisation", details: String(error) },
      { status: 500 }
    )
  }
}
