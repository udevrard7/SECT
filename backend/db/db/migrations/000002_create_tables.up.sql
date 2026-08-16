-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ETUDIANT',
    "etablissementId" TEXT,
    "filiereId" TEXT,
    "image" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "derniereConnexion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "matricule" TEXT,
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT false,
    "niveau" "NiveauEtude",

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etablissement" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT,
    "ville" TEXT,
    "pays" TEXT DEFAULT 'France',
    "adresse" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "siteWeb" TEXT,
    "logo" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "exempleMatricule" TEXT,
    "formatMatricule" TEXT,
    "regexMatricule" TEXT,
    "certWatermarkText" TEXT DEFAULT 'ORIGINAL',
    "certWatermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "certWatermarkOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.04,
    "certWatermarkColor" TEXT DEFAULT '#1B3A5C',
    "certWatermarkPattern" TEXT DEFAULT 'diamond',

    CONSTRAINT "Etablissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filiere" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "code" TEXT,
    "etablissementId" TEXT NOT NULL,
    "responsableId" TEXT,
    "description" TEXT,
    "nbEtudiants" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Filiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnseignantFiliere" (
    "id" TEXT NOT NULL,
    "enseignantId" TEXT NOT NULL,
    "filiereId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "niveau" "NiveauEtude" NOT NULL,

    CONSTRAINT "EnseignantFiliere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniteEnseignement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "filiereId" TEXT NOT NULL,
    "niveau" "NiveauEtude" NOT NULL,
    "niveaux" TEXT,
    "semestre" INTEGER,
    "creditsECTS" INTEGER,
    "volumeHeuresCM" INTEGER NOT NULL DEFAULT 0,
    "volumeHeuresTD" INTEGER NOT NULL DEFAULT 0,
    "volumeHeuresTP" INTEGER NOT NULL DEFAULT 0,
    "obligatoire" BOOLEAN NOT NULL DEFAULT true,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniteEnseignement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniteEnseignementFiliere" (
    "id" TEXT NOT NULL,
    "uniteEnseignementId" TEXT NOT NULL,
    "filiereId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniteEnseignementFiliere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affectation" (
    "id" TEXT NOT NULL,
    "enseignantId" TEXT NOT NULL,
    "uniteEnseignementId" TEXT NOT NULL,
    "typeSeance" "TypeSeance" NOT NULL DEFAULT 'CM',
    "groupe" TEXT,
    "volumeHeures" DOUBLE PRECISION NOT NULL,
    "anneeUniversitaire" TEXT NOT NULL DEFAULT '2024-2025',
    "statut" "StatutAffectation" NOT NULL DEFAULT 'PROVISOIRE',
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT,
    "details" TEXT,
    "adresseIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "cheminStockage" TEXT NOT NULL,
    "tailleFichier" INTEGER,
    "typeMime" TEXT,
    "statutAnalyse" "StatutAnalyse" NOT NULL DEFAULT 'EN_ATTENTE',
    "themesDetectes" TEXT,
    "conceptsCles" TEXT,
    "volumeEstime" TEXT,
    "contenuTexte" TEXT,
    "dateUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "erreurAnalyse" TEXT,
    "resumeAnalyse" TEXT,
    "uniteEnseignementId" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "auteurId" TEXT,
    "type" "TypeQuestion" NOT NULL,
    "enonce" TEXT NOT NULL,
    "propositions" TEXT,
    "reponseCorrecte" TEXT,
    "explication" TEXT,
    "difficulte" "Difficulte" NOT NULL DEFAULT 'MOYEN',
    "themes" TEXT,
    "tags" TEXT,
    "scoreQualite" DOUBLE PRECISION,
    "validee" BOOLEAN NOT NULL DEFAULT false,
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epreuve" (
    "id" TEXT NOT NULL,
    "enseignantId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "duree" INTEGER NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "melangeQuestions" BOOLEAN NOT NULL DEFAULT true,
    "melangePropositions" BOOLEAN NOT NULL DEFAULT true,
    "blocageRetour" BOOLEAN NOT NULL DEFAULT false,
    "statut" "StatutEpreuve" NOT NULL DEFAULT 'BROUILLON',
    "groupesCibles" TEXT,
    "contenu" JSONB,
    "filiereId" TEXT,
    "uniteEnseignementId" TEXT,
    "niveau" "NiveauEtude",
    "sessionExamen" "SessionExamen" NOT NULL DEFAULT 'NORMALE',
    "anneeAcademiqueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "proctoringActif" BOOLEAN NOT NULL DEFAULT false,
    "verificationIdentite" BOOLEAN NOT NULL DEFAULT false,
    "generationMode" "ModeGeneration" NOT NULL DEFAULT 'MANUELLE',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "noteTotal" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "clotureeAt" TIMESTAMP(3),
    "clotureeAutomatiquement" BOOLEAN NOT NULL DEFAULT false,
    "raisonCloture" TEXT,
    "clotureePar" TEXT,
    "delaiGrace" INTEGER NOT NULL DEFAULT 3,
    "etudiantsAutorises" TEXT,
    "epreuveOrigineId" TEXT,

    CONSTRAINT "Epreuve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpreuveQuestion" (
    "id" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "bareme" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EpreuveQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpreuveDocument" (
    "id" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "EpreuveDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionPassation" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "statut" "StatutSession" NOT NULL DEFAULT 'NON_COMMENCEE',
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "logEvents" TEXT,
    "alertes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propositionMappings" TEXT,
    "penalite" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SessionPassation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reponse" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "contenu" TEXT,
    "score" DOUBLE PRECISION,
    "commentaire" TEXT,
    "noteIA" DOUBLE PRECISION,
    "justificationIA" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerte" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "SeverityAlerte" NOT NULL DEFAULT 'INFO',
    "type" "TypeAlerte" NOT NULL DEFAULT 'CUSTOM',
    "lue" BOOLEAN NOT NULL DEFAULT false,
    "resolu" BOOLEAN NOT NULL DEFAULT false,
    "filiereId" TEXT,
    "epreuveId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alerte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resultat" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "scoreFinal" DOUBLE PRECISION NOT NULL,
    "detailParQuestion" TEXT,
    "dateCorrection" TIMESTAMP(3),
    "dateRetour" TIMESTAMP(3),
    "commentaires" TEXT,
    "exporte" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalPossible" DOUBLE PRECISION NOT NULL DEFAULT 20,

    CONSTRAINT "Resultat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypePlan" NOT NULL,
    "prixMensuel" DOUBLE PRECISION NOT NULL,
    "prixAnnuel" DOUBLE PRECISION,
    "nbEtablissementsMax" INTEGER NOT NULL,
    "nbFilieresMax" INTEGER NOT NULL,
    "nbEnseignantsMax" INTEGER NOT NULL,
    "nbEtudiantsMax" INTEGER NOT NULL,
    "nbQuestionsMax" INTEGER NOT NULL,
    "nbEvaluationsMois" INTEGER NOT NULL,
    "iaGeneration" BOOLEAN NOT NULL DEFAULT true,
    "iaCorrection" BOOLEAN NOT NULL DEFAULT false,
    "proctoring" BOOLEAN NOT NULL DEFAULT false,
    "exportPDF" BOOLEAN NOT NULL DEFAULT true,
    "support" TEXT NOT NULL DEFAULT 'email',
    "description" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abonnement" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "statut" "StatutAbonnement" NOT NULL DEFAULT 'ESSAI',
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "periodeEssaiJours" INTEGER NOT NULL DEFAULT 14,
    "modePaiement" TEXT,
    "referencePaiement" TEXT,
    "montantPaye" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "renouvellementAuto" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtablissementAccess" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "approuvePar" TEXT,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtablissementAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecuritySettings" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "proctoringActif" BOOLEAN NOT NULL DEFAULT false,
    "detectionCopie" BOOLEAN NOT NULL DEFAULT true,
    "detectionOnglet" BOOLEAN NOT NULL DEFAULT true,
    "detectionFullscreen" BOOLEAN NOT NULL DEFAULT true,
    "blocageCopie" BOOLEAN NOT NULL DEFAULT true,
    "blocageClicDroit" BOOLEAN NOT NULL DEFAULT true,
    "blocageImpression" BOOLEAN NOT NULL DEFAULT true,
    "verificationIdentite" BOOLEAN NOT NULL DEFAULT false,
    "tempsInactiviteMax" INTEGER NOT NULL DEFAULT 120,
    "nbOngletsMax" INTEGER NOT NULL DEFAULT 3,
    "nbAlertesMax" INTEGER NOT NULL DEFAULT 5,
    "autoSubmitOnViolation" BOOLEAN NOT NULL DEFAULT false,
    "captureEcran" BOOLEAN NOT NULL DEFAULT false,
    "rapportFraude" BOOLEAN NOT NULL DEFAULT true,
    "seuilSimilarite" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "penaliteFullscreenExit" INTEGER NOT NULL DEFAULT 5,
    "fullscreenObligatoire" BOOLEAN NOT NULL DEFAULT true,
    "intervalleCaptureEcran" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuritySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devoir" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "consignes" TEXT,
    "uniteEnseignementId" TEXT NOT NULL,
    "enseignantId" TEXT NOT NULL,
    "typeSeance" "TypeSeance" NOT NULL DEFAULT 'TD',
    "datePublication" TIMESTAMP(3),
    "dateLimite" TIMESTAMP(3) NOT NULL,
    "noteMax" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "renduFichiers" TEXT,
    "soumissionGroupe" BOOLEAN NOT NULL DEFAULT false,
    "nbMaxFichiers" INTEGER NOT NULL DEFAULT 10,
    "tailleMaxFichier" INTEGER NOT NULL DEFAULT 52428800,
    "statut" "StatutDevoir" NOT NULL DEFAULT 'BROUILLON',
    "anneeUniversitaire" TEXT NOT NULL DEFAULT '2024-2025',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Devoir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrilleEvaluation" (
    "id" TEXT NOT NULL,
    "devoirId" TEXT NOT NULL,
    "criteres" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrilleEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT,
    "etablissementId" TEXT,
    "filiereId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "settings" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Soumission" (
    "id" TEXT NOT NULL,
    "devoirId" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "groupeId" TEXT,
    "contenuTexte" TEXT,
    "fichiersSoumis" TEXT,
    "commentaireEtudiant" TEXT,
    "statut" "StatutSoumission" NOT NULL DEFAULT 'BROUILLON',
    "renduAt" TIMESTAMP(3),
    "note" DOUBLE PRECISION,
    "commentaireEnseignant" TEXT,
    "noteIA" DOUBLE PRECISION,
    "justificationIA" TEXT,
    "rapportPlagiat" TEXT,
    "historiqueVersions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Soumission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "abonnementId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "montantHt" DOUBLE PRECISION NOT NULL,
    "tva" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "montantTtc" DOUBLE PRECISION NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateEcheance" TIMESTAMP(3) NOT NULL,
    "datePaiement" TIMESTAMP(3),
    "modePaiement" TEXT,
    "referencePaiement" TEXT,
    "lignes" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationAdmin" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "destinataireId" TEXT,
    "destinataireRole" TEXT,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "priorite" TEXT NOT NULL DEFAULT 'NORMALE',
    "categorie" TEXT NOT NULL DEFAULT 'SYSTEME',
    "icone" TEXT,
    "expireLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severite" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "details" TEXT,
    "source" TEXT,
    "duree" INTEGER,
    "statut" TEXT NOT NULL DEFAULT 'ACTIF',
    "resoluLe" TIMESTAMP(3),
    "resoluPar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpWhitelist" (
    "id" TEXT NOT NULL,
    "adresseIp" TEXT NOT NULL,
    "description" TEXT,
    "etablissementId" TEXT,
    "creePar" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProviderConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT,
    "apiKey" TEXT,
    "model" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 99,
    "extraConfig" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnneeAcademique" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnneeAcademique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSpeciale" (
    "id" TEXT NOT NULL,
    "epreuveOrigineId" TEXT NOT NULL,
    "epreuveDeriveeId" TEXT NOT NULL,
    "type" "TypeSessionSpeciale" NOT NULL,
    "motif" TEXT NOT NULL,
    "justificatif" TEXT,
    "etudiantsCibles" TEXT NOT NULL,
    "estPartielle" BOOLEAN NOT NULL DEFAULT false,
    "questionsSelectionnees" TEXT,
    "creeParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSpeciale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeDefinition" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icone" TEXT NOT NULL,
    "categorie" "CategorieBadge" NOT NULL,
    "roleCible" "Role",
    "niveaux" "NiveauBadge"[],
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeProgression" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeDefinitionId" TEXT NOT NULL,
    "niveauActuel" "NiveauBadge" NOT NULL DEFAULT 'BRONZE',
    "valeurActuelle" INTEGER NOT NULL DEFAULT 0,
    "valeurPalier" INTEGER NOT NULL DEFAULT 1,
    "valeurProchain" INTEGER,
    "debloque" BOOLEAN NOT NULL DEFAULT false,
    "dateObtention" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeProgression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationUE" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "uniteEnseignementId" TEXT NOT NULL,
    "anneeAcademiqueId" TEXT,
    "statut" "StatutValidation" NOT NULL DEFAULT 'EN_COURS',
    "moyenneUE" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noteNormale" DOUBLE PRECISION,
    "noteRattrapage" DOUBLE PRECISION,
    "noteFinale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nbEpreuvesTotal" INTEGER NOT NULL DEFAULT 0,
    "nbEpreuvesCompletees" INTEGER NOT NULL DEFAULT 0,
    "dateValidation" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationUE_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificat" (
    "id" TEXT NOT NULL,
    "codeVerification" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "validationUEId" TEXT NOT NULL,
    "type" "TypeCertificat" NOT NULL,
    "intitule" TEXT NOT NULL,
    "mention" TEXT,
    "noteFinale" DOUBLE PRECISION NOT NULL,
    "etablissementNom" TEXT NOT NULL,
    "etablissementLogo" TEXT,
    "etablissementVille" TEXT,
    "etablissementPays" TEXT,
    "filiereNom" TEXT NOT NULL,
    "filiereCode" TEXT,
    "ueCode" TEXT NOT NULL,
    "ueNom" TEXT NOT NULL,
    "creditsECTS" INTEGER,
    "etudiantNom" TEXT NOT NULL,
    "etudiantMatricule" TEXT,
    "etudiantNiveau" TEXT,
    "sessionType" TEXT NOT NULL DEFAULT 'NORMALE',
    "anneeAcademique" TEXT,
    "dateEmission" TIMESTAMP(3) NOT NULL,
    "emetteParId" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "statut" "StatutCertificat" NOT NULL DEFAULT 'EMIS',
    "dateRevocation" TIMESTAMP(3),
    "raisonRevocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIFailoverEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "providerName" TEXT,
    "eventType" TEXT NOT NULL,
    "fromProvider" TEXT,
    "toProvider" TEXT,
    "reason" TEXT NOT NULL,
    "errorDetails" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIFailoverEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "contenu" TEXT,
    "sujets" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT,
    "questionId" TEXT,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "masteryLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT,
    "documentId" TEXT,
    "recto" TEXT NOT NULL,
    "verso" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "chapterIds" TEXT,
    "titre" TEXT,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dureeMin" INTEGER NOT NULL DEFAULT 30,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "rappelEnvoye" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpThread" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chapterId" TEXT,
    "etudiantId" TEXT NOT NULL,
    "enseignantId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'OUVERT',
    "sujet" TEXT NOT NULL,
    "passageContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "documentId" TEXT,
    "chapterId" TEXT,
    "reponse" TEXT,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "correct" BOOLEAN,
    "dureeSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

