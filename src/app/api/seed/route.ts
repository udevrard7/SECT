import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST() {
  try {
    // Check if users already exist
    const existingUsers = await db.user.count()

    if (existingUsers > 0) {
      return NextResponse.json(
        { message: 'La base de données contient déjà des données', count: existingUsers },
        { status: 200 }
      )
    }

    const saltRounds = 10

    // Create demo etablissements
    const etab1 = await db.etablissement.create({
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

    const etab2 = await db.etablissement.create({
      data: {
        nom: 'École Polytechnique SECT',
        type: 'École d\'ingénieurs',
        ville: 'Lyon',
        pays: 'France',
        email: 'contact@poly-sect.fr',
        telephone: '+33 4 56 78 90 12',
      },
    })

    const etab3 = await db.etablissement.create({
      data: {
        nom: 'Institut SECT',
        type: 'Institut',
        ville: 'Marseille',
        pays: 'France',
        email: 'contact@inst-sect.fr',
      },
    })

    // Create demo filieres
    const filiere1 = await db.filiere.create({
      data: {
        nom: 'Informatique',
        code: 'INFO-L3',
        niveau: 'L3',
        etablissementId: etab1.id,
        description: 'Licence 3 Informatique',
        nbEtudiants: 120,
      },
    })

    const filiere2 = await db.filiere.create({
      data: {
        nom: 'Informatique L2',
        code: 'INFO-L2',
        niveau: 'L2',
        etablissementId: etab1.id,
        description: 'Licence 2 Informatique',
        nbEtudiants: 150,
      },
    })

    const filiere3 = await db.filiere.create({
      data: {
        nom: 'Mathématiques Appliquées',
        code: 'MATH-M1',
        niveau: 'M1',
        etablissementId: etab2.id,
        description: 'Master 1 Mathématiques Appliquées',
        nbEtudiants: 80,
      },
    })

    // Create demo users
    const users = await Promise.all([
      db.user.create({
        data: {
          email: 'admin@sect.fr',
          name: 'Jean Dupont',
          password: await bcrypt.hash('admin123', saltRounds),
          role: 'ADMIN',
          etablissementId: etab1.id,
        },
      }),
      db.user.create({
        data: {
          email: 'responsable@sect.fr',
          name: 'Marie Laurent',
          password: await bcrypt.hash('resp123', saltRounds),
          role: 'RESPONSABLE',
          etablissementId: etab1.id,
          filiereId: filiere1.id,
        },
      }),
      db.user.create({
        data: {
          email: 'enseignant@sect.fr',
          name: 'Pierre Martin',
          password: await bcrypt.hash('ens123', saltRounds),
          role: 'ENSEIGNANT',
          etablissementId: etab1.id,
          filiereId: filiere1.id,
        },
      }),
      db.user.create({
        data: {
          email: 'etudiant@sect.fr',
          name: 'Sophie Bernard',
          password: await bcrypt.hash('etu123', saltRounds),
          role: 'ETUDIANT',
          etablissementId: etab1.id,
          filiereId: filiere2.id,
        },
      }),
    ])

    // Update filiere responsable
    await db.filiere.update({
      where: { id: filiere1.id },
      data: { responsableId: users[1].id },
    })

    // Create some audit logs
    await db.auditLog.createMany({
      data: [
        { userId: users[0].id, userEmail: users[0].email, action: 'LOGIN', entite: 'User', entiteId: users[0].id },
        { userId: users[0].id, userEmail: users[0].email, action: 'CREATE', entite: 'Etablissement', entiteId: etab1.id, details: '{"nom":"Université SECT"}' },
        { userId: users[0].id, userEmail: users[0].email, action: 'CREATE', entite: 'Filiere', entiteId: filiere1.id, details: '{"nom":"Informatique"}' },
        { userId: users[0].id, userEmail: users[0].email, action: 'CREATE', entite: 'User', entiteId: users[1].id, details: '{"name":"Marie Laurent","role":"RESPONSABLE"}' },
        { userId: users[0].id, userEmail: users[0].email, action: 'CREATE', entite: 'User', entiteId: users[2].id, details: '{"name":"Pierre Martin","role":"ENSEIGNANT"}' },
        { userId: users[1].id, userEmail: users[1].email, action: 'LOGIN', entite: 'User', entiteId: users[1].id },
        { userId: users[2].id, userEmail: users[2].email, action: 'LOGIN', entite: 'User', entiteId: users[2].id },
        { userId: users[3].id, userEmail: users[3].email, action: 'LOGIN', entite: 'User', entiteId: users[3].id },
      ],
    })

    // ─── Create Default Plans ───
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

    const planEssentiel = await db.plan.create({
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

    const planProfessionnel = await db.plan.create({
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

    const planEntreprise = await db.plan.create({
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

    // ─── Create Abonnements for Demo Establishments ───
    const now = new Date()
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const sixMonthsFromNow = new Date(now)
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
    const oneYearAgo = new Date(now)
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const fourteenDaysFromNow = new Date(now)
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)

    // etab1 (Université SECT) → Plan Professionnel, ACTIF
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

    // etab2 (École Polytechnique SECT) → Plan Essentiel, ESSAI
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

    // etab3 (Institut SECT) → Plan Gratuit, ACTIF
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

    // ─── Create Security Settings for Demo Establishments ───
    // etab1: proctoring + identity verification enabled
    await db.securitySettings.create({
      data: {
        etablissementId: etab1.id,
        proctoringActif: true,
        verificationIdentite: true,
      },
    })

    // etab2: all defaults (proctoring off)
    await db.securitySettings.create({
      data: {
        etablissementId: etab2.id,
        proctoringActif: false,
      },
    })

    // etab3: all defaults (proctoring off)
    await db.securitySettings.create({
      data: {
        etablissementId: etab3.id,
        proctoringActif: false,
      },
    })

    return NextResponse.json({
      message: 'Données de démonstration créées avec succès',
      users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role })),
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création des données' },
      { status: 500 }
    )
  }
}
