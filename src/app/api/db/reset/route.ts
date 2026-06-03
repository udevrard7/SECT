import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

/**
 * POST /api/db/reset
 * Supprime TOUTES les données de démonstration et crée le compte admin.
 * ⚠️ USAGE UNIQUE — Détruit toutes les données existantes.
 */
export async function POST(request: Request) {
  try {
    // Delete all data in correct order (respect foreign keys)
    await db.aIFailoverEvent.deleteMany()
    await db.monitoringEvent.deleteMany()
    await db.notificationAdmin.deleteMany()
    await db.passwordReset.deleteMany()
    await db.invitation.deleteMany()
    await db.auditLog.deleteMany()
    await db.ipWhitelist.deleteMany()
    await db.securitySettings.deleteMany()
    await db.etablissementAccess.deleteMany()
    await db.soumission.deleteMany()
    await db.grilleEvaluation.deleteMany()
    await db.devoir.deleteMany()
    await db.resultat.deleteMany()
    await db.reponse.deleteMany()
    await db.sessionPassation.deleteMany()
    await db.epreuveQuestion.deleteMany()
    await db.epreuve.deleteMany()
    await db.document.deleteMany()
    await db.question.deleteMany()
    await db.uniteEnseignement.deleteMany()
    await db.enseignantFiliere.deleteMany()
    await db.filiere.deleteMany()
    await db.abonnement.deleteMany()
    await db.facture.deleteMany()
    await db.user.deleteMany()
    await db.etablissement.deleteMany()
    await db.plan.deleteMany()
    await db.platformSettings.deleteMany()

    // ─── Create Admin Account ───
    const adminEmail = 'ulrichdouh@gmail.com'
    const adminPassword = 'sect@2026'
    const hashedPassword = await bcrypt.hash(adminPassword, 10)

    const admin = await db.user.create({
      data: {
        name: 'Administrateur SECT',
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        actif: true,
        mustChangePwd: false,
      },
    })

    // ─── Create Plans in XOF ───
    await db.plan.create({
      data: {
        nom: 'Gratuit', type: 'GRATUIT',
        prixMensuel: 0, prixAnnuel: 0,
        nbEtablissementsMax: 1, nbFilieresMax: 3, nbEnseignantsMax: 10, nbEtudiantsMax: 50,
        nbQuestionsMax: 100, nbEvaluationsMois: 5,
        iaGeneration: false, iaCorrection: false, proctoring: false, exportPDF: true,
        support: 'email', description: 'Découvrez SECT avec ce plan gratuit', actif: true,
      },
    })
    await db.plan.create({
      data: {
        nom: 'Essentiel', type: 'ESSENTIEL',
        prixMensuel: 29900, prixAnnuel: 299000,
        nbEtablissementsMax: 1, nbFilieresMax: 10, nbEnseignantsMax: 50, nbEtudiantsMax: 500,
        nbQuestionsMax: 500, nbEvaluationsMois: 50,
        iaGeneration: true, iaCorrection: false, proctoring: false, exportPDF: true,
        support: 'email', description: 'Idéal pour les petites structures', actif: true,
      },
    })
    await db.plan.create({
      data: {
        nom: 'Professionnel', type: 'PROFESSIONNEL',
        prixMensuel: 89900, prixAnnuel: 899000,
        nbEtablissementsMax: 5, nbFilieresMax: 50, nbEnseignantsMax: 200, nbEtudiantsMax: 2000,
        nbQuestionsMax: 5000, nbEvaluationsMois: 500,
        iaGeneration: true, iaCorrection: true, proctoring: true, exportPDF: true,
        support: 'chat', description: 'Pour les établissements exigeants', actif: true,
      },
    })
    await db.plan.create({
      data: {
        nom: 'Entreprise', type: 'ENTREPRISE',
        prixMensuel: 249000, prixAnnuel: 2490000,
        nbEtablissementsMax: 50, nbFilieresMax: 200, nbEnseignantsMax: 1000, nbEtudiantsMax: 10000,
        nbQuestionsMax: 50000, nbEvaluationsMois: 5000,
        iaGeneration: true, iaCorrection: true, proctoring: true, exportPDF: true,
        support: 'telephone', description: 'Solution complète pour les grands groupes', actif: true,
      },
    })

    // ─── Platform Settings ───
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

    // Audit log for admin creation
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'User',
        entiteId: admin.id,
        details: JSON.stringify({ role: 'ADMIN', email: adminEmail, autoInit: true }),
      },
    })

    return NextResponse.json({
      message: 'Base de données réinitialisée avec succès',
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
      plans: 4,
      devise: 'XOF (Franc CFA)',
      paysDefault: "Côte d'Ivoire",
    })
  } catch (error) {
    console.error('Reset error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la réinitialisation', details: String(error) },
      { status: 500 }
    )
  }
}
