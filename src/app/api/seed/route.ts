import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST() {
  try {
    const existingUsers = await db.user.count()
    const existingPlans = await db.plan.count()
    const existingAbonnements = await db.abonnement.count()
    const existingSecuritySettings = await db.securitySettings.count()

    // If all data already exists, skip seeding entirely
    if (existingUsers > 0 && existingPlans > 0 && existingAbonnements > 0 && existingSecuritySettings > 0) {
      return NextResponse.json(
        {
          message: 'La base de données contient déjà toutes les données',
          users: existingUsers,
          plans: existingPlans,
          abonnements: existingAbonnements,
          securitySettings: existingSecuritySettings,
        },
        { status: 200 }
      )
    }

    const saltRounds = 10
    const result: string[] = []

    // ─── 1. Create Etablissements (if missing) ───
    let etab1 = await db.etablissement.findFirst({ where: { nom: 'Université SECT' } })
    if (!etab1) {
      etab1 = await db.etablissement.create({
        data: {
          nom: 'Université SECT',
          type: 'Université',
          ville: 'Paris',
          pays: 'France',
          email: 'contact@univ-sect.fr',
          telephone: '+33 1 23 45 67 89',
          siteWeb: 'https://univ-sect.fr',
        },
      })
      result.push('Etablissement: Université SECT')
    }

    let etab2 = await db.etablissement.findFirst({ where: { nom: 'École Polytechnique SECT' } })
    if (!etab2) {
      etab2 = await db.etablissement.create({
        data: {
          nom: 'École Polytechnique SECT',
          type: "École d'ingénieurs",
          ville: 'Lyon',
          pays: 'France',
          email: 'contact@poly-sect.fr',
          telephone: '+33 4 56 78 90 12',
        },
      })
      result.push('Etablissement: École Polytechnique SECT')
    }

    let etab3 = await db.etablissement.findFirst({ where: { nom: 'Institut SECT' } })
    if (!etab3) {
      etab3 = await db.etablissement.create({
        data: {
          nom: 'Institut SECT',
          type: 'Institut',
          ville: 'Marseille',
          pays: 'France',
          email: 'contact@inst-sect.fr',
        },
      })
      result.push('Etablissement: Institut SECT')
    }

    // ─── 2. Create Filieres (if missing) ───
    let filiere1 = await db.filiere.findFirst({ where: { nom: 'Informatique', etablissementId: etab1.id } })
    if (!filiere1) {
      filiere1 = await db.filiere.create({
        data: {
          nom: 'Informatique',
          code: 'INFO-L3',
          niveau: 'L3',
          etablissementId: etab1.id,
          description: 'Licence 3 Informatique',
          nbEtudiants: 120,
        },
      })
      result.push('Filière: Informatique')
    }

    let filiere2 = await db.filiere.findFirst({ where: { nom: 'Informatique L2', etablissementId: etab1.id } })
    if (!filiere2) {
      filiere2 = await db.filiere.create({
        data: {
          nom: 'Informatique L2',
          code: 'INFO-L2',
          niveau: 'L2',
          etablissementId: etab1.id,
          description: 'Licence 2 Informatique',
          nbEtudiants: 150,
        },
      })
      result.push('Filière: Informatique L2')
    }

    let filiere3 = await db.filiere.findFirst({ where: { nom: 'Mathématiques Appliquées', etablissementId: etab2.id } })
    if (!filiere3) {
      filiere3 = await db.filiere.create({
        data: {
          nom: 'Mathématiques Appliquées',
          code: 'MATH-M1',
          niveau: 'M1',
          etablissementId: etab2.id,
          description: 'Master 1 Mathématiques Appliquées',
          nbEtudiants: 80,
        },
      })
      result.push('Filière: Mathématiques Appliquées')
    }

    // ─── 3. Create Demo Users (if missing) ───
    let adminUser = await db.user.findFirst({ where: { email: 'admin@sect.fr' } })
    if (!adminUser) {
      adminUser = await db.user.create({
        data: {
          email: 'admin@sect.fr',
          name: 'Jean Dupont',
          password: await bcrypt.hash('admin123', saltRounds),
          role: 'ADMIN',
          etablissementId: etab1.id,
        },
      })
      result.push('User: admin@sect.fr')
    }

    let respUser = await db.user.findFirst({ where: { email: 'responsable@sect.fr' } })
    if (!respUser) {
      respUser = await db.user.create({
        data: {
          email: 'responsable@sect.fr',
          name: 'Marie Laurent',
          password: await bcrypt.hash('resp123', saltRounds),
          role: 'RESPONSABLE',
          etablissementId: etab1.id,
          filiereId: filiere1.id,
        },
      })
      result.push('User: responsable@sect.fr')
    }

    let ensUser = await db.user.findFirst({ where: { email: 'enseignant@sect.fr' } })
    if (!ensUser) {
      ensUser = await db.user.create({
        data: {
          email: 'enseignant@sect.fr',
          name: 'Pierre Martin',
          password: await bcrypt.hash('ens123', saltRounds),
          role: 'ENSEIGNANT',
          etablissementId: etab1.id,
          filiereId: filiere1.id,
        },
      })
      result.push('User: enseignant@sect.fr')
    }

    let etuUser = await db.user.findFirst({ where: { email: 'etudiant@sect.fr' } })
    if (!etuUser) {
      etuUser = await db.user.create({
        data: {
          email: 'etudiant@sect.fr',
          name: 'Sophie Bernard',
          password: await bcrypt.hash('etu123', saltRounds),
          role: 'ETUDIANT',
          etablissementId: etab1.id,
          filiereId: filiere2.id,
        },
      })
      result.push('User: etudiant@sect.fr')
    }

    // Update filiere responsable
    if (filiere1 && respUser && !filiere1.responsableId) {
      await db.filiere.update({
        where: { id: filiere1.id },
        data: { responsableId: respUser.id },
      })
    }

    // Create audit logs (only if none exist)
    const existingLogs = await db.auditLog.count()
    if (existingLogs === 0 && adminUser) {
      await db.auditLog.createMany({
        data: [
          { userId: adminUser.id, userEmail: adminUser.email, action: 'LOGIN', entite: 'User', entiteId: adminUser.id },
          { userId: adminUser.id, userEmail: adminUser.email, action: 'CREATE', entite: 'Etablissement', entiteId: etab1.id, details: '{"nom":"Université SECT"}' },
          { userId: adminUser.id, userEmail: adminUser.email, action: 'CREATE', entite: 'Filiere', entiteId: filiere1.id, details: '{"nom":"Informatique"}' },
        ],
      })
    }

    // ─── 4. Create Plans (if missing) ───
    let planGratuit = await db.plan.findFirst({ where: { type: 'GRATUIT' } })
    if (!planGratuit) {
      planGratuit = await db.plan.create({
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
    }

    let planEssentiel = await db.plan.findFirst({ where: { type: 'ESSENTIEL' } })
    if (!planEssentiel) {
      planEssentiel = await db.plan.create({
        data: {
          nom: 'Essentiel',
          type: 'ESSENTIEL',
          prixMensuel: 49,
          prixAnnuel: 470,
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
    }

    let planProfessionnel = await db.plan.findFirst({ where: { type: 'PROFESSIONNEL' } })
    if (!planProfessionnel) {
      planProfessionnel = await db.plan.create({
        data: {
          nom: 'Professionnel',
          type: 'PROFESSIONNEL',
          prixMensuel: 149,
          prixAnnuel: 1430,
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
    }

    let planEntreprise = await db.plan.findFirst({ where: { type: 'ENTREPRISE' } })
    if (!planEntreprise) {
      planEntreprise = await db.plan.create({
        data: {
          nom: 'Entreprise',
          type: 'ENTREPRISE',
          prixMensuel: 399,
          prixAnnuel: 3830,
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
    }

    // ─── 5. Create Abonnements (if missing) ───
    if (existingAbonnements === 0 && planProfessionnel && planEssentiel && planGratuit) {
      const now = new Date()
      const sixMonthsAgo = new Date(now)
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      const sixMonthsFromNow = new Date(now)
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
      const oneYearAgo = new Date(now)
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const fourteenDaysFromNow = new Date(now)
      fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)

      await db.abonnement.create({
        data: {
          etablissementId: etab1.id,
          planId: planProfessionnel.id,
          statut: 'ACTIF',
          dateDebut: sixMonthsAgo,
          dateFin: sixMonthsFromNow,
          montantPaye: 1430,
          modePaiement: 'virement',
          renouvellementAuto: true,
        },
      })

      await db.abonnement.create({
        data: {
          etablissementId: etab2.id,
          planId: planEssentiel.id,
          statut: 'ESSAI',
          dateDebut: now,
          dateFin: fourteenDaysFromNow,
          periodeEssaiJours: 14,
          montantPaye: 0,
          renouvellementAuto: true,
        },
      })

      await db.abonnement.create({
        data: {
          etablissementId: etab3.id,
          planId: planGratuit.id,
          statut: 'ACTIF',
          dateDebut: oneYearAgo,
          dateFin: null,
          montantPaye: 0,
          renouvellementAuto: false,
        },
      })

      result.push('Abonnements: 3 créés')
    }

    // ─── 6. Create Security Settings (if missing) ───
    if (existingSecuritySettings === 0) {
      await db.securitySettings.create({
        data: {
          etablissementId: etab1.id,
          proctoringActif: true,
          verificationIdentite: true,
        },
      })

      await db.securitySettings.create({
        data: {
          etablissementId: etab2.id,
          proctoringActif: false,
        },
      })

      await db.securitySettings.create({
        data: {
          etablissementId: etab3.id,
          proctoringActif: false,
        },
      })

      result.push('SecuritySettings: 3 créés')
    }

    return NextResponse.json({
      message: result.length > 0 ? 'Données créées/mises à jour avec succès' : 'Toutes les données existent déjà',
      created: result,
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création des données', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
