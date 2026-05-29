import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST() {
  try {
    const existingUsers = await db.user.count()
    const existingPlans = await db.plan.count()
    const existingAbonnements = await db.abonnement.count()
    const existingSecuritySettings = await db.securitySettings.count()
    const existingSessions = await db.sessionPassation.count()
    const existingEpreuves = await db.epreuve.count()
    const existingUEs = await db.uniteEnseignement.count()
    const existingAffectations = await db.affectation.count()

    // If all data (including evaluation, UE, and affectation data) already exists, skip seeding entirely
    if (
      existingUsers > 0 &&
      existingPlans > 0 &&
      existingAbonnements > 0 &&
      existingSecuritySettings > 0 &&
      existingSessions > 0 &&
      existingEpreuves > 0 &&
      existingUEs > 0 &&
      existingAffectations > 0
    ) {
      return NextResponse.json(
        {
          message: 'La base de données contient déjà toutes les données',
          users: existingUsers,
          plans: existingPlans,
          abonnements: existingAbonnements,
          securitySettings: existingSecuritySettings,
          epreuves: existingEpreuves,
          sessions: existingSessions,
          unitesEnseignement: existingUEs,
          affectations: existingAffectations,
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

    // ─── 3b. Create More Demo Student Users (if missing) ───
    const demoStudents = [
      { email: 'lucas.petit@sect.fr', name: 'Lucas Petit', filiereId: filiere1.id },
      { email: 'camille.roux@sect.fr', name: 'Camille Roux', filiereId: filiere1.id },
      { email: 'emma.moreau@sect.fr', name: 'Emma Moreau', filiereId: filiere2.id },
      { email: 'hugo.lefebvre@sect.fr', name: 'Hugo Lefebvre', filiereId: filiere2.id },
      { email: 'chloe.garcia@sect.fr', name: 'Chloé Garcia', filiereId: filiere1.id },
      { email: 'nathan.simon@sect.fr', name: 'Nathan Simon', filiereId: filiere2.id },
    ]

    const studentUsers: { id: string; name: string; email: string }[] = []
    // Always include the original etudiant@sect.fr
    if (etuUser) studentUsers.push({ id: etuUser.id, name: etuUser.name, email: etuUser.email })

    for (const s of demoStudents) {
      let stu = await db.user.findFirst({ where: { email: s.email } })
      if (!stu) {
        stu = await db.user.create({
          data: {
            email: s.email,
            name: s.name,
            password: await bcrypt.hash('etu123', saltRounds),
            role: 'ETUDIANT',
            etablissementId: etab1.id,
            filiereId: s.filiereId,
          },
        })
        result.push(`User: ${s.email}`)
      }
      studentUsers.push({ id: stu.id, name: stu.name, email: stu.email })
    }

    // Update filiere responsable
    if (filiere1 && respUser && !filiere1.responsableId) {
      await db.filiere.update({
        where: { id: filiere1.id },
        data: { responsableId: respUser.id },
      })
    }

    // Also set respUser as responsable of filiere2
    if (filiere2 && respUser && !filiere2.responsableId) {
      await db.filiere.update({
        where: { id: filiere2.id },
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

    // ═══════════════════════════════════════════════════════════════
    // ─── 7. Create Demo Questions (if missing) ───
    // ═══════════════════════════════════════════════════════════════
    const existingQuestions = await db.question.count()

    if (existingQuestions === 0 && ensUser) {
      const questionsData = [
        {
          auteurId: ensUser.id,
          type: 'QCU' as const,
          enonce: 'Quelle est la complexité temporelle de la recherche binaire dans un tableau trié de taille n ?',
          propositions: '["O(n)", "O(log n)", "O(n²)", "O(1)"]',
          reponseCorrecte: '{"answer": "O(log n)"}',
          difficulte: 'MOYEN' as const,
          themes: '["Algorithmique"]',
          tags: '["complexité", "recherche binaire"]',
          explication: 'La recherche binaire divise l\'espace de recherche par 2 à chaque étape, d\'où une complexité logarithmique.',
          validee: true,
          scoreQualite: 85,
        },
        {
          auteurId: ensUser.id,
          type: 'QCU' as const,
          enonce: 'Quel protocole de la couche transport assure une livraison fiable des données ?',
          propositions: '["UDP", "TCP", "ICMP", "ARP"]',
          reponseCorrecte: '{"answer": "TCP"}',
          difficulte: 'FACILE' as const,
          themes: '["Réseaux"]',
          tags: '["protocole", "transport", "fiabilité"]',
          explication: 'TCP (Transmission Control Protocol) assure une livraison fiable avec accusé de réception et retransmission.',
          validee: true,
          scoreQualite: 90,
        },
        {
          auteurId: ensUser.id,
          type: 'QCM' as const,
          enonce: 'Quelles sont les propriétés ACID d\'une transaction dans une base de données ? (Sélectionnez toutes les réponses correctes)',
          propositions: '["Atomicité", "Cohérence", "Isolation", "Durabilité", "Disponibilité"]',
          reponseCorrecte: '{"answers": ["Atomicité", "Cohérence", "Isolation", "Durabilité"]}',
          difficulte: 'MOYEN' as const,
          themes: '["Bases de données"]',
          tags: '["ACID", "transactions", "propriétés"]',
          explication: 'ACID signifie Atomicité, Cohérence, Isolation, Durabilité. La Disponibilité fait partie du théorème CAP, pas d\'ACID.',
          validee: true,
          scoreQualite: 92,
        },
        {
          auteurId: ensUser.id,
          type: 'QRC' as const,
          enonce: 'Expliquez la différence entre une pile (stack) et une file (queue). Donnez un exemple d\'utilisation pour chaque structure.',
          propositions: null,
          reponseCorrecte: '{"answer": "Une pile fonctionne en LIFO (Last In First Out) : le dernier élément ajouté est le premier retiré. Exemple : pile d\'appels de fonctions (call stack). Une file fonctionne en FIFO (First In First Out) : le premier élément ajouté est le premier retiré. Exemple : file d\'attente d\'impression."}',
          difficulte: 'FACILE' as const,
          themes: '["Algorithmique"]',
          tags: '["structures de données", "pile", "file"]',
          explication: 'Les deux sont des structures de données linéaires, mais elles diffèrent par leur politique d\'accès : LIFO vs FIFO.',
          validee: true,
          scoreQualite: 80,
        },
        {
          auteurId: ensUser.id,
          type: 'QCU' as const,
          enonce: 'Dans le modèle relationnel, quelle clause SQL permet de regrouper les lignes ayant les mêmes valeurs ?',
          propositions: '["WHERE", "GROUP BY", "HAVING", "ORDER BY"]',
          reponseCorrecte: '{"answer": "GROUP BY"}',
          difficulte: 'FACILE' as const,
          themes: '["Bases de données"]',
          tags: '["SQL", "GROUP BY", "requêtes"]',
          explication: 'GROUP BY regroupe les lignes ayant les mêmes valeurs dans une ou plusieurs colonnes, souvent utilisé avec des fonctions d\'agrégation.',
          validee: true,
          scoreQualite: 88,
        },
        {
          auteurId: ensUser.id,
          type: 'QCM' as const,
          enonce: 'Quels sont les algorithmes de tri qui ont une complexité moyenne de O(n log n) ? (Sélectionnez toutes les réponses correctes)',
          propositions: '["Tri à bulles", "Tri fusion (Merge Sort)", "Tri rapide (Quick Sort)", "Tri par insertion", "Tri par tas (Heap Sort)"]',
          reponseCorrecte: '{"answers": ["Tri fusion (Merge Sort)", "Tri rapide (Quick Sort)", "Tri par tas (Heap Sort)"]}',
          difficulte: 'DIFFICILE' as const,
          themes: '["Algorithmique"]',
          tags: '["tri", "complexité", "O(n log n)"]',
          explication: 'Le tri fusion, le tri rapide (en moyenne) et le tri par tas ont une complexité moyenne de O(n log n). Le tri à bulles et le tri par insertion sont en O(n²).',
          validee: true,
          scoreQualite: 87,
        },
        {
          auteurId: ensUser.id,
          type: 'QCU' as const,
          enonce: 'Quelle couche du modèle OSI est responsable du routage des paquets entre réseaux ?',
          propositions: '["Couche 1 - Physique", "Couche 2 - Liaison", "Couche 3 - Réseau", "Couche 4 - Transport"]',
          reponseCorrecte: '{"answer": "Couche 3 - Réseau"}',
          difficulte: 'MOYEN' as const,
          themes: '["Réseaux"]',
          tags: '["modèle OSI", "routage", "couche réseau"]',
          explication: 'La couche Réseau (couche 3) du modèle OSI gère l\'adressage logique (IP) et le routage des paquets entre différents réseaux.',
          validee: true,
          scoreQualite: 91,
        },
        {
          auteurId: ensUser.id,
          type: 'QRC' as const,
          enonce: 'Décrivez le principe de la normalisation dans les bases de données relationnelles. Quels sont les trois premiers formes normales (1NF, 2NF, 3NF) ?',
          propositions: null,
          reponseCorrecte: '{"answer": "La normalisation vise à réduire la redondance et les anomalies. 1NF : tous les attributs sont atomiques. 2NF : 1NF + pas de dépendance partielle (tout attribut non-clé dépend de la clé complète). 3NF : 2NF + pas de dépendance transitive (tout attribut non-clé dépend directement de la clé)."}',
          difficulte: 'EXPERT' as const,
          themes: '["Bases de données"]',
          tags: '["normalisation", "formes normales", "modélisation"]',
          explication: 'La normalisation est essentielle pour la conception de schémas relationnels robustes et sans redondance.',
          validee: true,
          scoreQualite: 78,
        },
      ]

      const createdQuestions = []
      for (const q of questionsData) {
        const created = await db.question.create({ data: q })
        createdQuestions.push(created)
      }
      result.push(`Questions: ${createdQuestions.length} créées`)
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── 8. Create Demo Epreuve #1 (TERMINEE) + link questions ───
    // ═══════════════════════════════════════════════════════════════
    let epreuve1 = await db.epreuve.findFirst({ where: { titre: 'Examen Informatique L3 - Session 1' } })

    if (!epreuve1 && ensUser) {
      const now = new Date()
      const examDate = new Date(now)
      examDate.setDate(examDate.getDate() - 7) // 7 days ago
      const examStart = new Date(examDate)
      examStart.setHours(9, 0, 0, 0)
      const examEnd = new Date(examStart)
      examEnd.setHours(examEnd.getHours() + 2) // 2 hours exam

      epreuve1 = await db.epreuve.create({
        data: {
          enseignantId: ensUser.id,
          titre: 'Examen Informatique L3 - Session 1',
          description: 'Examen de fin de module couvrant l\'algorithmique, les bases de données et les réseaux. Licence 3 Informatique.',
          duree: 120,
          dateDebut: examStart,
          dateFin: examEnd,
          melangeQuestions: true,
          melangePropositions: true,
          blocageRetour: false,
          statut: 'TERMINEE',
          groupesCibles: JSON.stringify([filiere1.id, filiere2.id]),
          proctoringActif: true,
          verificationIdentite: true,
        },
      })

      // Link the first 6 questions to this epreuve
      const allQuestions = await db.question.findMany({
        where: { auteurId: ensUser.id },
        take: 6,
        orderBy: { createdAt: 'asc' },
      })

      for (let i = 0; i < allQuestions.length; i++) {
        await db.epreuveQuestion.create({
          data: {
            epreuveId: epreuve1.id,
            questionId: allQuestions[i].id,
            bareme: i < 2 ? 3.0 : i < 4 ? 2.0 : 4.0, // varying scores, total = 18
            ordre: i + 1,
          },
        })
      }

      result.push('Epreuve: Examen Informatique L3 - Session 1 (TERMINEE)')
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── 9. Create Demo Epreuve #2 (PLANIFIEE) ───
    // ═══════════════════════════════════════════════════════════════
    let epreuve2 = await db.epreuve.findFirst({ where: { titre: 'Contrôle Continu - Bases de Données' } })

    if (!epreuve2 && ensUser) {
      const now = new Date()
      const futureDate = new Date(now)
      futureDate.setDate(futureDate.getDate() + 14) // 14 days from now
      const examStart = new Date(futureDate)
      examStart.setHours(14, 0, 0, 0)
      const examEnd = new Date(examStart)
      examEnd.setMinutes(examEnd.getMinutes() + 90)

      epreuve2 = await db.epreuve.create({
        data: {
          enseignantId: ensUser.id,
          titre: 'Contrôle Continu - Bases de Données',
          description: 'Contrôle continu portant sur la modélisation relationnelle, SQL et la normalisation.',
          duree: 90,
          dateDebut: examStart,
          dateFin: examEnd,
          melangeQuestions: true,
          melangePropositions: true,
          blocageRetour: true,
          statut: 'PLANIFIEE',
          groupesCibles: JSON.stringify([filiere1.id]),
          proctoringActif: false,
          verificationIdentite: false,
        },
      })

      // Link the last 2 questions (BD themed) to this epreuve
      const bdQuestions = await db.question.findMany({
        where: {
          auteurId: ensUser.id,
          themes: { contains: 'Bases de données' },
        },
        orderBy: { createdAt: 'asc' },
      })

      for (let i = 0; i < bdQuestions.length; i++) {
        await db.epreuveQuestion.create({
          data: {
            epreuveId: epreuve2.id,
            questionId: bdQuestions[i].id,
            bareme: 5.0,
            ordre: i + 1,
          },
        })
      }

      result.push('Epreuve: Contrôle Continu - Bases de Données (PLANIFIEE)')
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── 10. Create Demo SessionPassation + Resultat ───
    // ═══════════════════════════════════════════════════════════════
    if (existingSessions === 0 && epreuve1 && studentUsers.length > 0) {
      const now = new Date()
      const examStart = new Date(epreuve1.dateDebut)

      // Create sessions for 5 students
      const sessionConfigs = [
        { studentIndex: 0, statut: 'CORRIGEE' as const, score: 14.5, alertes: 0 },
        { studentIndex: 1, statut: 'CORRIGEE' as const, score: 11.0, alertes: 0 },
        { studentIndex: 2, statut: 'CORRIGEE' as const, score: 16.0, alertes: 0 },
        { studentIndex: 3, statut: 'SOUMISE' as const, score: 8.5, alertes: 1 },
        { studentIndex: 4, statut: 'CORRIGEE' as const, score: 12.5, alertes: 0 },
      ]

      for (const config of sessionConfigs) {
        if (config.studentIndex >= studentUsers.length) break

        const student = studentUsers[config.studentIndex]
        const sessionStart = new Date(examStart)
        const sessionEnd = new Date(sessionStart)
        sessionEnd.setMinutes(sessionEnd.getMinutes() + 105 + Math.floor(Math.random() * 15)) // ~105-120 min

        const session = await db.sessionPassation.create({
          data: {
            etudiantId: student.id,
            epreuveId: epreuve1.id,
            statut: config.statut,
            dateDebut: sessionStart,
            dateFin: sessionEnd,
            score: config.score,
            alertes: config.alertes,
            logEvents: JSON.stringify([
              { event: 'SESSION_START', timestamp: sessionStart.toISOString() },
              { event: 'QUESTION_VIEW', questionIndex: 0, timestamp: new Date(sessionStart.getTime() + 30000).toISOString() },
              { event: 'ANSWER_SUBMIT', questionIndex: 0, timestamp: new Date(sessionStart.getTime() + 120000).toISOString() },
              { event: 'SESSION_END', timestamp: sessionEnd.toISOString() },
            ]),
          },
        })

        // Create Resultat for CORRIGEE sessions
        if (config.statut === 'CORRIGEE') {
          const epreuveQuestions = await db.epreuveQuestion.findMany({
            where: { epreuveId: epreuve1.id },
            orderBy: { ordre: 'asc' },
          })

          const detailParQuestion = epreuveQuestions.map((eq, idx) => ({
            questionId: eq.questionId,
            bareme: eq.bareme,
            score: Math.min(eq.bareme, Math.max(0, eq.bareme * (config.score / 18) + (Math.random() - 0.5) * 2)),
          }))

          await db.resultat.create({
            data: {
              sessionId: session.id,
              scoreFinal: config.score,
              detailParQuestion: JSON.stringify(detailParQuestion),
              dateCorrection: new Date(sessionEnd.getTime() + 3600000), // 1h after session end
              commentaires: JSON.stringify({
                general: config.score >= 14 ? 'Bon travail, continuez ainsi.' : config.score >= 10 ? 'Résultat acceptable, des progrès sont possibles.' : 'Des lacunes importantes nécessitent un travail approfondi.',
              }),
            },
          })
        }

        // Create demo Reponses for the session
        const epreuveQuestions = await db.epreuveQuestion.findMany({
          where: { epreuveId: epreuve1.id },
          orderBy: { ordre: 'asc' },
          include: { question: true },
        })

        for (const eq of epreuveQuestions) {
          const question = eq.question
          let contenu: string | null = null
          let reponseScore: number | null = null

          if (question.type === 'QCU') {
            const propositions: string[] = JSON.parse(question.propositions || '[]')
            const correctAnswer = JSON.parse(question.reponseCorrecte || '{}').answer
            // 70% chance of correct answer
            contenu = JSON.stringify({ answer: Math.random() > 0.3 ? correctAnswer : propositions.find(p => p !== correctAnswer) || propositions[0] })
            reponseScore = contenu.includes(correctAnswer) ? eq.bareme : 0
          } else if (question.type === 'QCM') {
            const correctAnswers: string[] = JSON.parse(question.reponseCorrecte || '{}').answers || []
            // Select most correct answers with some variation
            const selected = correctAnswers.filter(() => Math.random() > 0.2)
            contenu = JSON.stringify({ answers: selected })
            const proportion = selected.length / correctAnswers.length
            reponseScore = Math.round(eq.bareme * proportion * 10) / 10
          } else if (question.type === 'QRC') {
            contenu = JSON.stringify({ text: 'Réponse de l\'étudiant avec des éléments partiels sur le sujet demandé.' })
            reponseScore = Math.round(eq.bareme * (0.4 + Math.random() * 0.6) * 10) / 10
          }

          // Check if reponse already exists for this session+question
          const existingReponse = await db.reponse.findFirst({
            where: { sessionId: session.id, questionId: eq.questionId },
          })

          if (!existingReponse) {
            await db.reponse.create({
              data: {
                sessionId: session.id,
                questionId: eq.questionId,
                contenu,
                score: reponseScore,
                commentaire: config.statut === 'CORRIGEE' ? 'Correction automatique' : null,
              },
            })
          }
        }
      }

      result.push('Sessions: 5 créées avec réponses et résultats')
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── 11. Create Additional Enseignant Users (if missing) ───
    // ═══════════════════════════════════════════════════════════════
    const additionalEnseignants = [
      { email: 'prof.gondo@sect.fr', name: 'Prof M Gondo' },
      { email: 'prof.dubois@sect.fr', name: 'Isabelle Dubois' },
      { email: 'prof.konate@sect.fr', name: 'Amadou Konaté' },
      { email: 'prof.petit@sect.fr', name: 'Claire Petit' },
    ]

    const enseignantUsers: { id: string; name: string; email: string }[] = []
    // Always include the original enseignant@sect.fr (Pierre Martin)
    if (ensUser) enseignantUsers.push({ id: ensUser.id, name: ensUser.name, email: ensUser.email })

    for (const e of additionalEnseignants) {
      let ens = await db.user.findFirst({ where: { email: e.email } })
      if (!ens) {
        ens = await db.user.create({
          data: {
            email: e.email,
            name: e.name,
            password: await bcrypt.hash('ens123', saltRounds),
            role: 'ENSEIGNANT',
            etablissementId: etab1.id,
          },
        })
        result.push(`User: ${e.email}`)
      }
      enseignantUsers.push({ id: ens.id, name: ens.name, email: ens.email })
    }

    // Helper: find enseignant by email prefix (e.g. 'prof.gondo')
    const findEnseignant = (emailPrefix: string) => enseignantUsers.find(u => u.email.startsWith(emailPrefix))
    const pierreMartin = findEnseignant('enseignant') // Pierre Martin (original)
    const profGondo = findEnseignant('prof.gondo')
    const isabelleDubois = findEnseignant('prof.dubois')
    const amadouKonate = findEnseignant('prof.konate')
    const clairePetit = findEnseignant('prof.petit')

    // ═══════════════════════════════════════════════════════════════
    // ─── 12. Create Demo UniteEnseignement (if missing) ───
    // ═══════════════════════════════════════════════════════════════
    const ueDefinitions = [
      // Filiere1: Informatique L3
      { code: 'UE-INF301', nom: 'Algorithmique avancée', filiereId: filiere1.id, niveau: 'L3' as const, semestre: 1, creditsECTS: 6, volumeHeuresCM: 30, volumeHeuresTD: 15, volumeHeuresTP: 15 },
      { code: 'UE-INF302', nom: 'Bases de données', filiereId: filiere1.id, niveau: 'L3' as const, semestre: 1, creditsECTS: 6, volumeHeuresCM: 24, volumeHeuresTD: 18, volumeHeuresTP: 12 },
      { code: 'UE-INF303', nom: 'Réseaux informatiques', filiereId: filiere1.id, niveau: 'L3' as const, semestre: 2, creditsECTS: 6, volumeHeuresCM: 30, volumeHeuresTD: 12, volumeHeuresTP: 18 },
      { code: 'UE-INF304', nom: 'Intelligence artificielle', filiereId: filiere1.id, niveau: 'L3' as const, semestre: 2, creditsECTS: 6, volumeHeuresCM: 24, volumeHeuresTD: 15, volumeHeuresTP: 15 },
      { code: 'UE-INF305', nom: 'Programmation web', filiereId: filiere1.id, niveau: 'L3' as const, semestre: 1, creditsECTS: 4, volumeHeuresCM: 18, volumeHeuresTD: 12, volumeHeuresTP: 24 },
      // Filiere2: Informatique L2
      { code: 'UE-INF201', nom: 'Algorithmique', filiereId: filiere2.id, niveau: 'L2' as const, semestre: 1, creditsECTS: 6, volumeHeuresCM: 30, volumeHeuresTD: 18, volumeHeuresTP: 12 },
      { code: 'UE-INF202', nom: 'Structures de données', filiereId: filiere2.id, niveau: 'L2' as const, semestre: 1, creditsECTS: 6, volumeHeuresCM: 24, volumeHeuresTD: 18, volumeHeuresTP: 12 },
      { code: 'UE-INF203', nom: 'Systèmes d\'exploitation', filiereId: filiere2.id, niveau: 'L2' as const, semestre: 2, creditsECTS: 6, volumeHeuresCM: 30, volumeHeuresTD: 15, volumeHeuresTP: 15 },
      // Filiere3: Mathématiques Appliquées M1
      { code: 'UE-MAT401', nom: 'Analyse numérique', filiereId: filiere3.id, niveau: 'M1' as const, semestre: 1, creditsECTS: 6, volumeHeuresCM: 30, volumeHeuresTD: 15, volumeHeuresTP: 15 },
      { code: 'UE-MAT402', nom: 'Probabilités et statistiques', filiereId: filiere3.id, niveau: 'M1' as const, semestre: 1, creditsECTS: 6, volumeHeuresCM: 24, volumeHeuresTD: 18, volumeHeuresTP: 12 },
      { code: 'UE-MAT403', nom: 'Optimisation', filiereId: filiere3.id, niveau: 'M1' as const, semestre: 2, creditsECTS: 6, volumeHeuresCM: 30, volumeHeuresTD: 15, volumeHeuresTP: 15 },
    ]

    // Store created UE references by code for affectation seeding
    const ueByCode: Record<string, { id: string; code: string; nom: string }> = {}

    for (const ueDef of ueDefinitions) {
      let ue = await db.uniteEnseignement.findFirst({ where: { code: ueDef.code, filiereId: ueDef.filiereId } })
      if (!ue) {
        ue = await db.uniteEnseignement.create({ data: ueDef })
        result.push(`UE: ${ueDef.code} - ${ueDef.nom}`)
      }
      ueByCode[ueDef.code] = { id: ue.id, code: ue.code, nom: ue.nom }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── 13. Create Demo Affectations (if missing) ───
    // ═══════════════════════════════════════════════════════════════
    const affectationDefinitions = [
      // Filiere1: Informatique L3
      { enseignant: pierreMartin, ueCode: 'UE-INF301', typeSeance: 'CM' as const, volumeHeures: 30, statut: 'VALIDEE' as const },
      { enseignant: pierreMartin, ueCode: 'UE-INF302', typeSeance: 'CM' as const, volumeHeures: 24, statut: 'VALIDEE' as const },
      { enseignant: profGondo, ueCode: 'UE-INF304', typeSeance: 'CM' as const, volumeHeures: 24, statut: 'PUBLIEE' as const },
      { enseignant: profGondo, ueCode: 'UE-INF305', typeSeance: 'TD' as const, volumeHeures: 12, statut: 'VALIDEE' as const },
      { enseignant: isabelleDubois, ueCode: 'UE-INF303', typeSeance: 'CM' as const, volumeHeures: 30, statut: 'VALIDEE' as const },
      { enseignant: isabelleDubois, ueCode: 'UE-INF301', typeSeance: 'TD' as const, volumeHeures: 15, statut: 'PROVISOIRE' as const },
      { enseignant: amadouKonate, ueCode: 'UE-INF302', typeSeance: 'TD' as const, volumeHeures: 18, statut: 'VALIDEE' as const },
      { enseignant: amadouKonate, ueCode: 'UE-INF303', typeSeance: 'TP' as const, volumeHeures: 18, statut: 'PROVISOIRE' as const },
      { enseignant: clairePetit, ueCode: 'UE-INF304', typeSeance: 'TP' as const, volumeHeures: 15, statut: 'PROVISOIRE' as const },
      { enseignant: clairePetit, ueCode: 'UE-INF305', typeSeance: 'CM' as const, volumeHeures: 18, statut: 'PUBLIEE' as const },
      // Filiere2: Informatique L2
      { enseignant: isabelleDubois, ueCode: 'UE-INF201', typeSeance: 'CM' as const, volumeHeures: 30, statut: 'VALIDEE' as const },
      { enseignant: amadouKonate, ueCode: 'UE-INF202', typeSeance: 'CM' as const, volumeHeures: 24, statut: 'VALIDEE' as const },
      { enseignant: pierreMartin, ueCode: 'UE-INF201', typeSeance: 'TD' as const, volumeHeures: 18, statut: 'PROVISOIRE' as const },
      { enseignant: clairePetit, ueCode: 'UE-INF203', typeSeance: 'CM' as const, volumeHeures: 30, statut: 'PROVISOIRE' as const },
      // Filiere3: Mathématiques M1
      { enseignant: profGondo, ueCode: 'UE-MAT401', typeSeance: 'CM' as const, volumeHeures: 30, statut: 'VALIDEE' as const },
      { enseignant: profGondo, ueCode: 'UE-MAT403', typeSeance: 'CM' as const, volumeHeures: 30, statut: 'PUBLIEE' as const },
      { enseignant: pierreMartin, ueCode: 'UE-MAT402', typeSeance: 'TD' as const, volumeHeures: 18, statut: 'PROVISOIRE' as const },
    ]

    for (const aff of affectationDefinitions) {
      if (!aff.enseignant) continue
      const ue = ueByCode[aff.ueCode]
      if (!ue) continue

      try {
        // Check for existing affectation using unique constraint fields
        const existingAff = await db.affectation.findFirst({
          where: {
            enseignantId: aff.enseignant.id,
            uniteEnseignementId: ue.id,
            typeSeance: aff.typeSeance,
            groupe: null,
            anneeUniversitaire: '2024-2025',
          },
        })

        if (!existingAff) {
          await db.affectation.create({
            data: {
              enseignantId: aff.enseignant.id,
              uniteEnseignementId: ue.id,
              typeSeance: aff.typeSeance,
              groupe: null,
              volumeHeures: aff.volumeHeures,
              anneeUniversitaire: '2024-2025',
              statut: aff.statut,
            },
          })
          result.push(`Affectation: ${aff.enseignant.name} → ${ue.code} (${aff.typeSeance}, ${aff.volumeHeures}h, ${aff.statut})`)
        }
      } catch {
        // Skip if already exists (unique constraint)
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── 14. Create Demo EnseignantFiliere (if missing) ───
    // ═══════════════════════════════════════════════════════════════
    const enseignantFiliereDefinitions = [
      // Pierre Martin → filiere1 (L3), filiere2 (L2), filiere3 (M1)
      { enseignant: pierreMartin, filiereId: filiere1.id, niveau: 'L3' as const },
      { enseignant: pierreMartin, filiereId: filiere2.id, niveau: 'L2' as const },
      { enseignant: pierreMartin, filiereId: filiere3.id, niveau: 'M1' as const },
      // Prof M Gondo → filiere1 (L3), filiere3 (M1)
      { enseignant: profGondo, filiereId: filiere1.id, niveau: 'L3' as const },
      { enseignant: profGondo, filiereId: filiere3.id, niveau: 'M1' as const },
      // Isabelle Dubois → filiere1 (L3), filiere2 (L2)
      { enseignant: isabelleDubois, filiereId: filiere1.id, niveau: 'L3' as const },
      { enseignant: isabelleDubois, filiereId: filiere2.id, niveau: 'L2' as const },
      // Amadou Konaté → filiere1 (L3), filiere2 (L2)
      { enseignant: amadouKonate, filiereId: filiere1.id, niveau: 'L3' as const },
      { enseignant: amadouKonate, filiereId: filiere2.id, niveau: 'L2' as const },
      // Claire Petit → filiere1 (L3), filiere2 (L2)
      { enseignant: clairePetit, filiereId: filiere1.id, niveau: 'L3' as const },
      { enseignant: clairePetit, filiereId: filiere2.id, niveau: 'L2' as const },
    ]

    for (const ef of enseignantFiliereDefinitions) {
      if (!ef.enseignant) continue

      try {
        await db.enseignantFiliere.upsert({
          where: {
            enseignantId_filiereId_niveau: {
              enseignantId: ef.enseignant.id,
              filiereId: ef.filiereId,
              niveau: ef.niveau,
            },
          },
          update: {},
          create: {
            enseignantId: ef.enseignant.id,
            filiereId: ef.filiereId,
            niveau: ef.niveau,
          },
        })
        result.push(`EnseignantFiliere: ${ef.enseignant.name} → ${ef.niveau}`)
      } catch {
        // Skip if already exists
      }
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
