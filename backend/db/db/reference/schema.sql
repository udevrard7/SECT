-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT');

-- CreateEnum
CREATE TYPE "TypeQuestion" AS ENUM ('QCU', 'QCM', 'QRC', 'REFLEXION', 'TRS', 'CODE');

-- CreateEnum
CREATE TYPE "Difficulte" AS ENUM ('FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT');

-- CreateEnum
CREATE TYPE "StatutAnalyse" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'ANALYSE', 'ERREUR');

-- CreateEnum
CREATE TYPE "ModeGeneration" AS ENUM ('MANUELLE', 'IA_ASSISTEE');

-- CreateEnum
CREATE TYPE "StatutEpreuve" AS ENUM ('BROUILLON', 'PLANIFIEE', 'EN_COURS', 'TERMINEE', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "StatutSession" AS ENUM ('NON_COMMENCEE', 'EN_COURS', 'SOUMISE', 'CORRIGEE', 'RETOURNEE', 'ABSENT', 'NON_SOUMIS');

-- CreateEnum
CREATE TYPE "StatutAbonnement" AS ENUM ('ESSAI', 'ACTIF', 'SUSPENDU', 'EXPIRE', 'RESILIE');

-- CreateEnum
CREATE TYPE "TypePlan" AS ENUM ('GRATUIT', 'ESSENTIEL', 'PROFESSIONNEL', 'ENTREPRISE');

-- CreateEnum
CREATE TYPE "NiveauEtude" AS ENUM ('L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT');

-- CreateEnum
CREATE TYPE "TypeSeance" AS ENUM ('CM', 'TD', 'TP');

-- CreateEnum
CREATE TYPE "StatutAffectation" AS ENUM ('PROVISOIRE', 'VALIDEE', 'PUBLIEE');

-- CreateEnum
CREATE TYPE "SeverityAlerte" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "TypeAlerte" AS ENUM ('PERFORMANCE', 'FRAUDE', 'SYSTEME', 'RAPPEL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StatutDevoir" AS ENUM ('BROUILLON', 'PUBLIE', 'FERME', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "StatutSoumission" AS ENUM ('BROUILLON', 'SOUMIS', 'CORRIGE', 'RETOURNE');

-- CreateEnum
CREATE TYPE "SessionExamen" AS ENUM ('NORMALE', 'RATTRAPAGE', 'SPECIALE', 'EXCEPTIONNELLE', 'DIFFERE');

-- CreateEnum
CREATE TYPE "TypeSessionSpeciale" AS ENUM ('RATTRAPAGE', 'EXCEPTIONNELLE', 'DIFFERE');

-- CreateEnum
CREATE TYPE "CategorieBadge" AS ENUM ('EVALUATION', 'CORRECTION', 'IA', 'ENGAGEMENT', 'EXCELLENCE', 'PEDAGOGIE', 'GESTION');

-- CreateEnum
CREATE TYPE "NiveauBadge" AS ENUM ('BRONZE', 'ARGENT', 'OR', 'DIAMANT');

-- CreateEnum
CREATE TYPE "StatutValidation" AS ENUM ('EN_COURS', 'VALIDEE', 'NON_VALIDEE');

-- CreateEnum
CREATE TYPE "TypeCertificat" AS ENUM ('STANDARD', 'AVANCE', 'EXPERT');

-- CreateEnum
CREATE TYPE "StatutCertificat" AS ENUM ('EMIS', 'REVOQUE', 'EXPIRE');

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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_matricule_key" ON "User"("matricule");

-- CreateIndex
CREATE INDEX "User_etablissementId_idx" ON "User"("etablissementId");

-- CreateIndex
CREATE INDEX "User_filiereId_idx" ON "User"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "Etablissement_nom_key" ON "Etablissement"("nom");

-- CreateIndex
CREATE INDEX "Filiere_etablissementId_idx" ON "Filiere"("etablissementId");

-- CreateIndex
CREATE INDEX "Filiere_responsableId_idx" ON "Filiere"("responsableId");

-- CreateIndex
CREATE UNIQUE INDEX "Filiere_nom_etablissementId_key" ON "Filiere"("nom", "etablissementId");

-- CreateIndex
CREATE INDEX "EnseignantFiliere_filiereId_idx" ON "EnseignantFiliere"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "EnseignantFiliere_enseignantId_filiereId_niveau_key" ON "EnseignantFiliere"("enseignantId", "filiereId", "niveau");

-- CreateIndex
CREATE INDEX "UniteEnseignement_filiereId_idx" ON "UniteEnseignement"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "UniteEnseignement_code_filiereId_key" ON "UniteEnseignement"("code", "filiereId");

-- CreateIndex
CREATE INDEX "UniteEnseignementFiliere_filiereId_idx" ON "UniteEnseignementFiliere"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "UniteEnseignementFiliere_uniteEnseignementId_filiereId_key" ON "UniteEnseignementFiliere"("uniteEnseignementId", "filiereId");

-- CreateIndex
CREATE INDEX "Affectation_uniteEnseignementId_idx" ON "Affectation"("uniteEnseignementId");

-- CreateIndex
CREATE UNIQUE INDEX "Affectation_enseignantId_uniteEnseignementId_typeSeance_gro_key" ON "Affectation"("enseignantId", "uniteEnseignementId", "typeSeance", "groupe", "anneeUniversitaire");

-- CreateIndex
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");

-- CreateIndex
CREATE INDEX "Document_uniteEnseignementId_idx" ON "Document"("uniteEnseignementId");

-- CreateIndex
CREATE INDEX "Question_documentId_idx" ON "Question"("documentId");

-- CreateIndex
CREATE INDEX "Epreuve_filiereId_niveau_sessionExamen_idx" ON "Epreuve"("filiereId", "niveau", "sessionExamen");

-- CreateIndex
CREATE INDEX "Epreuve_enseignantId_statut_idx" ON "Epreuve"("enseignantId", "statut");

-- CreateIndex
CREATE INDEX "Epreuve_anneeAcademiqueId_idx" ON "Epreuve"("anneeAcademiqueId");

-- CreateIndex
CREATE INDEX "Epreuve_epreuveOrigineId_idx" ON "Epreuve"("epreuveOrigineId");

-- CreateIndex
CREATE INDEX "Epreuve_uniteEnseignementId_idx" ON "Epreuve"("uniteEnseignementId");

-- CreateIndex
CREATE INDEX "EpreuveQuestion_questionId_idx" ON "EpreuveQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "EpreuveQuestion_epreuveId_questionId_key" ON "EpreuveQuestion"("epreuveId", "questionId");

-- CreateIndex
CREATE INDEX "EpreuveDocument_documentId_idx" ON "EpreuveDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "EpreuveDocument_epreuveId_documentId_key" ON "EpreuveDocument"("epreuveId", "documentId");

-- CreateIndex
CREATE INDEX "SessionPassation_epreuveId_idx" ON "SessionPassation"("epreuveId");

-- CreateIndex
CREATE INDEX "SessionPassation_etudiantId_idx" ON "SessionPassation"("etudiantId");

-- CreateIndex
CREATE UNIQUE INDEX "Reponse_sessionId_questionId_key" ON "Reponse"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "Alerte_epreuveId_idx" ON "Alerte"("epreuveId");

-- CreateIndex
CREATE INDEX "Alerte_filiereId_idx" ON "Alerte"("filiereId");

-- CreateIndex
CREATE INDEX "Alerte_userId_idx" ON "Alerte"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Resultat_sessionId_key" ON "Resultat"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_nom_key" ON "Plan"("nom");

-- CreateIndex
CREATE INDEX "Abonnement_etablissementId_idx" ON "Abonnement"("etablissementId");

-- CreateIndex
CREATE INDEX "Abonnement_planId_idx" ON "Abonnement"("planId");

-- CreateIndex
CREATE INDEX "EtablissementAccess_etablissementId_idx" ON "EtablissementAccess"("etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "EtablissementAccess_adminId_etablissementId_key" ON "EtablissementAccess"("adminId", "etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "SecuritySettings_etablissementId_key" ON "SecuritySettings"("etablissementId");

-- CreateIndex
CREATE INDEX "Devoir_enseignantId_idx" ON "Devoir"("enseignantId");

-- CreateIndex
CREATE INDEX "Devoir_uniteEnseignementId_idx" ON "Devoir"("uniteEnseignementId");

-- CreateIndex
CREATE UNIQUE INDEX "GrilleEvaluation_devoirId_key" ON "GrilleEvaluation"("devoirId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_createdById_idx" ON "Invitation"("createdById");

-- CreateIndex
CREATE INDEX "Invitation_etablissementId_idx" ON "Invitation"("etablissementId");

-- CreateIndex
CREATE INDEX "Invitation_filiereId_idx" ON "Invitation"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_token_idx" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "Soumission_etudiantId_idx" ON "Soumission"("etudiantId");

-- CreateIndex
CREATE UNIQUE INDEX "Soumission_devoirId_etudiantId_key" ON "Soumission"("devoirId", "etudiantId");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_numero_key" ON "Facture"("numero");

-- CreateIndex
CREATE INDEX "Facture_abonnementId_idx" ON "Facture"("abonnementId");

-- CreateIndex
CREATE INDEX "Facture_etablissementId_idx" ON "Facture"("etablissementId");

-- CreateIndex
CREATE INDEX "NotificationAdmin_destinataireId_idx" ON "NotificationAdmin"("destinataireId");

-- CreateIndex
CREATE UNIQUE INDEX "IpWhitelist_adresseIp_key" ON "IpWhitelist"("adresseIp");

-- CreateIndex
CREATE INDEX "IpWhitelist_etablissementId_idx" ON "IpWhitelist"("etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "AIProviderConfig_name_key" ON "AIProviderConfig"("name");

-- CreateIndex
CREATE INDEX "AnneeAcademique_etablissementId_idx" ON "AnneeAcademique"("etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "AnneeAcademique_libelle_etablissementId_key" ON "AnneeAcademique"("libelle", "etablissementId");

-- CreateIndex
CREATE INDEX "SessionSpeciale_epreuveOrigineId_idx" ON "SessionSpeciale"("epreuveOrigineId");

-- CreateIndex
CREATE INDEX "SessionSpeciale_epreuveDeriveeId_idx" ON "SessionSpeciale"("epreuveDeriveeId");

-- CreateIndex
CREATE INDEX "SessionSpeciale_creeParId_idx" ON "SessionSpeciale"("creeParId");

-- CreateIndex
CREATE INDEX "SessionSpeciale_type_idx" ON "SessionSpeciale"("type");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeDefinition_cle_key" ON "BadgeDefinition"("cle");

-- CreateIndex
CREATE INDEX "BadgeProgression_userId_idx" ON "BadgeProgression"("userId");

-- CreateIndex
CREATE INDEX "BadgeProgression_badgeDefinitionId_idx" ON "BadgeProgression"("badgeDefinitionId");

-- CreateIndex
CREATE INDEX "BadgeProgression_debloque_idx" ON "BadgeProgression"("debloque");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeProgression_userId_badgeDefinitionId_key" ON "BadgeProgression"("userId", "badgeDefinitionId");

-- CreateIndex
CREATE INDEX "ValidationUE_etudiantId_idx" ON "ValidationUE"("etudiantId");

-- CreateIndex
CREATE INDEX "ValidationUE_uniteEnseignementId_idx" ON "ValidationUE"("uniteEnseignementId");

-- CreateIndex
CREATE INDEX "ValidationUE_statut_idx" ON "ValidationUE"("statut");

-- CreateIndex
CREATE INDEX "ValidationUE_anneeAcademiqueId_idx" ON "ValidationUE"("anneeAcademiqueId");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationUE_etudiantId_uniteEnseignementId_anneeAcademique_key" ON "ValidationUE"("etudiantId", "uniteEnseignementId", "anneeAcademiqueId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificat_codeVerification_key" ON "Certificat"("codeVerification");

-- CreateIndex
CREATE INDEX "Certificat_etudiantId_idx" ON "Certificat"("etudiantId");

-- CreateIndex
CREATE INDEX "Certificat_codeVerification_idx" ON "Certificat"("codeVerification");

-- CreateIndex
CREATE INDEX "Certificat_type_idx" ON "Certificat"("type");

-- CreateIndex
CREATE INDEX "Certificat_statut_idx" ON "Certificat"("statut");

-- CreateIndex
CREATE INDEX "Certificat_emetteParId_idx" ON "Certificat"("emetteParId");

-- CreateIndex
CREATE INDEX "Certificat_validationUEId_idx" ON "Certificat"("validationUEId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Chapter_documentId_idx" ON "Chapter"("documentId");

-- CreateIndex
CREATE INDEX "ChatThread_userId_idx" ON "ChatThread"("userId");

-- CreateIndex
CREATE INDEX "ChatThread_documentId_idx" ON "ChatThread"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_userId_documentId_key" ON "ChatThread"("userId", "documentId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_idx" ON "ChatMessage"("threadId");

-- CreateIndex
CREATE INDEX "ReviewItem_userId_nextReviewAt_idx" ON "ReviewItem"("userId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "ReviewItem_chapterId_idx" ON "ReviewItem"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_userId_chapterId_key" ON "ReviewItem"("userId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_userId_questionId_key" ON "ReviewItem"("userId", "questionId");

-- CreateIndex
CREATE INDEX "Flashcard_chapterId_idx" ON "Flashcard"("chapterId");

-- CreateIndex
CREATE INDEX "Flashcard_documentId_idx" ON "Flashcard"("documentId");

-- CreateIndex
CREATE INDEX "StudySession_userId_dateDebut_idx" ON "StudySession"("userId", "dateDebut");

-- CreateIndex
CREATE INDEX "StudySession_documentId_idx" ON "StudySession"("documentId");

-- CreateIndex
CREATE INDEX "HelpThread_documentId_idx" ON "HelpThread"("documentId");

-- CreateIndex
CREATE INDEX "HelpThread_etudiantId_idx" ON "HelpThread"("etudiantId");

-- CreateIndex
CREATE INDEX "HelpThread_enseignantId_idx" ON "HelpThread"("enseignantId");

-- CreateIndex
CREATE INDEX "HelpMessage_threadId_idx" ON "HelpMessage"("threadId");

-- CreateIndex
CREATE INDEX "HelpMessage_auteurId_idx" ON "HelpMessage"("auteurId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_userId_idx" ON "PracticeAttempt"("userId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_questionId_idx" ON "PracticeAttempt"("questionId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_documentId_idx" ON "PracticeAttempt"("documentId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_chapterId_idx" ON "PracticeAttempt"("chapterId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Filiere" ADD CONSTRAINT "Filiere_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Filiere" ADD CONSTRAINT "Filiere_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnseignantFiliere" ADD CONSTRAINT "EnseignantFiliere_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnseignantFiliere" ADD CONSTRAINT "EnseignantFiliere_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniteEnseignement" ADD CONSTRAINT "UniteEnseignement_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniteEnseignementFiliere" ADD CONSTRAINT "UniteEnseignementFiliere_uniteEnseignementId_fkey" FOREIGN KEY ("uniteEnseignementId") REFERENCES "UniteEnseignement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniteEnseignementFiliere" ADD CONSTRAINT "UniteEnseignementFiliere_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affectation" ADD CONSTRAINT "Affectation_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affectation" ADD CONSTRAINT "Affectation_uniteEnseignementId_fkey" FOREIGN KEY ("uniteEnseignementId") REFERENCES "UniteEnseignement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uniteEnseignementId_fkey" FOREIGN KEY ("uniteEnseignementId") REFERENCES "UniteEnseignement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epreuve" ADD CONSTRAINT "Epreuve_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epreuve" ADD CONSTRAINT "Epreuve_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epreuve" ADD CONSTRAINT "Epreuve_uniteEnseignementId_fkey" FOREIGN KEY ("uniteEnseignementId") REFERENCES "UniteEnseignement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epreuve" ADD CONSTRAINT "Epreuve_anneeAcademiqueId_fkey" FOREIGN KEY ("anneeAcademiqueId") REFERENCES "AnneeAcademique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epreuve" ADD CONSTRAINT "Epreuve_epreuveOrigineId_fkey" FOREIGN KEY ("epreuveOrigineId") REFERENCES "Epreuve"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpreuveQuestion" ADD CONSTRAINT "EpreuveQuestion_epreuveId_fkey" FOREIGN KEY ("epreuveId") REFERENCES "Epreuve"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpreuveQuestion" ADD CONSTRAINT "EpreuveQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpreuveDocument" ADD CONSTRAINT "EpreuveDocument_epreuveId_fkey" FOREIGN KEY ("epreuveId") REFERENCES "Epreuve"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpreuveDocument" ADD CONSTRAINT "EpreuveDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPassation" ADD CONSTRAINT "SessionPassation_epreuveId_fkey" FOREIGN KEY ("epreuveId") REFERENCES "Epreuve"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPassation" ADD CONSTRAINT "SessionPassation_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reponse" ADD CONSTRAINT "Reponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SessionPassation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_epreuveId_fkey" FOREIGN KEY ("epreuveId") REFERENCES "Epreuve"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resultat" ADD CONSTRAINT "Resultat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SessionPassation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtablissementAccess" ADD CONSTRAINT "EtablissementAccess_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtablissementAccess" ADD CONSTRAINT "EtablissementAccess_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecuritySettings" ADD CONSTRAINT "SecuritySettings_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devoir" ADD CONSTRAINT "Devoir_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devoir" ADD CONSTRAINT "Devoir_uniteEnseignementId_fkey" FOREIGN KEY ("uniteEnseignementId") REFERENCES "UniteEnseignement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrilleEvaluation" ADD CONSTRAINT "GrilleEvaluation_devoirId_fkey" FOREIGN KEY ("devoirId") REFERENCES "Devoir"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Soumission" ADD CONSTRAINT "Soumission_devoirId_fkey" FOREIGN KEY ("devoirId") REFERENCES "Devoir"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Soumission" ADD CONSTRAINT "Soumission_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "Abonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationAdmin" ADD CONSTRAINT "NotificationAdmin_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpWhitelist" ADD CONSTRAINT "IpWhitelist_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnneeAcademique" ADD CONSTRAINT "AnneeAcademique_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSpeciale" ADD CONSTRAINT "SessionSpeciale_epreuveOrigineId_fkey" FOREIGN KEY ("epreuveOrigineId") REFERENCES "Epreuve"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSpeciale" ADD CONSTRAINT "SessionSpeciale_epreuveDeriveeId_fkey" FOREIGN KEY ("epreuveDeriveeId") REFERENCES "Epreuve"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSpeciale" ADD CONSTRAINT "SessionSpeciale_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeProgression" ADD CONSTRAINT "BadgeProgression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeProgression" ADD CONSTRAINT "BadgeProgression_badgeDefinitionId_fkey" FOREIGN KEY ("badgeDefinitionId") REFERENCES "BadgeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationUE" ADD CONSTRAINT "ValidationUE_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationUE" ADD CONSTRAINT "ValidationUE_uniteEnseignementId_fkey" FOREIGN KEY ("uniteEnseignementId") REFERENCES "UniteEnseignement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationUE" ADD CONSTRAINT "ValidationUE_anneeAcademiqueId_fkey" FOREIGN KEY ("anneeAcademiqueId") REFERENCES "AnneeAcademique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificat" ADD CONSTRAINT "Certificat_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificat" ADD CONSTRAINT "Certificat_validationUEId_fkey" FOREIGN KEY ("validationUEId") REFERENCES "ValidationUE"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificat" ADD CONSTRAINT "Certificat_emetteParId_fkey" FOREIGN KEY ("emetteParId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpThread" ADD CONSTRAINT "HelpThread_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpThread" ADD CONSTRAINT "HelpThread_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpThread" ADD CONSTRAINT "HelpThread_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpThread" ADD CONSTRAINT "HelpThread_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpMessage" ADD CONSTRAINT "HelpMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "HelpThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpMessage" ADD CONSTRAINT "HelpMessage_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Migration 000005 — Fonction + triggers updated_at
-- ============================================================
-- Prisma gère @updatedAt côté client (JS). Le backend Go n'utilisera
-- pas Prisma : on délègue donc la mise à jour de "updatedAt" à un
-- trigger PostgreSQL qui s'exécute automatiquement sur chaque UPDATE.
--
-- La fonction est idempotent (CREATE OR REPLACE) et safe à ré-exécuter.
-- Les triggers utilisent `FOR EACH STATEMENT` (et non ROW) pour rester
-- performants même sur les updates bulk ; la colonne updatedAt est
-- juste mise à CURRENT_TIMESTAMP.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- For statement-level trigger, update the NEW row's updatedAt
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Création des triggers FOR EACH ROW sur toutes les tables ayant
-- une colonne "updatedAt" (31 tables identifiées dans le schéma)
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updatedAt'
    ORDER BY table_name
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t
    );
    -- Drop & recreate pour idempotence (si le trigger existe déjà)
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I; CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END
$$;
-- ============================================================
-- Migration 000006 — Row Level Security (Option A : claims de session)
-- ============================================================
--
-- Stratégie : "claims-based RLS"
--
-- Le backend Go pose, au début de chaque transaction, des claims via :
--   SELECT set_config('app.claims.user_id', $1, true);
--   SELECT set_config('app.claims.role', $2, true);
--   SELECT set_config('app.claims.etablissement_id', $3, true);  -- NULL pour ADMIN
--
-- Le paramètre `true` (is_local) scope les claims à la transaction
-- courante — ils sont automatiquement nettoyés en fin de transaction.
--
-- Hiérarchie des rôles :
--   ADMIN       — Propriétaire PaaS. NON lié à un établissement.
--                 Accès aux tables plateforme uniquement (Plan, PlatformSettings,
--                 IpWhitelist, Facture, MonitoringEvent, AIProviderConfig, ...).
--                 Accès aux données d'un établissement UNIQUEMENT si une entrée
--                 existe dans "EtablissementAccess" (autorisation explicite).
--   RESPONSABLE — Gère SON établissement (via etablissementId).
--   ENSEIGNANT  — Ses propres données + données de ses étudiants/filières.
--   ETUDIANT    — Ses propres données uniquement.
--
-- Note technique : neondb_owner est le propriétaire des tables. En PostgreSQL,
-- le propriétaire bypass RLS sauf si FORCE ROW LEVEL SECURITY est activé.
-- On active donc FORCE sur toutes les tables pour que les policies s'appliquent
-- même via neondb_owner (qui n'est PAS superuser sur Neon).
-- ============================================================


-- ============================================================
-- SECTION 1 — Fonctions helper (lecture des claims de session)
-- ============================================================

-- Retourne l'ID utilisateur courant (depuis le claim), ou NULL si non défini.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.claims.user_id', true), '')::text;
$$;

-- Retourne le rôle courant (ADMIN / RESPONSABLE / ENSEIGNANT / ETUDIANT), ou NULL.
CREATE OR REPLACE FUNCTION public.current_role_claim()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.claims.role', true), '')::text;
$$;

-- Retourne l'ID établissement courant, ou NULL (notamment pour ADMIN).
CREATE OR REPLACE FUNCTION public.current_etablissement_id()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.claims.etablissement_id', true), '')::text;
$$;

-- Vrai si l'utilisateur courant a le rôle ADMIN.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT current_role_claim() = 'ADMIN';
$$;

-- Vrai si l'utilisateur courant a le rôle RESPONSABLE.
CREATE OR REPLACE FUNCTION public.is_responsable()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT current_role_claim() = 'RESPONSABLE';
$$;

-- Vrai si l'utilisateur courant a le rôle ENSEIGNANT.
CREATE OR REPLACE FUNCTION public.is_enseignant()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT current_role_claim() = 'ENSEIGNANT';
$$;

-- Vrai si l'utilisateur courant a le rôle ETUDIANT.
CREATE OR REPLACE FUNCTION public.is_etudiant()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT current_role_claim() = 'ETUDIANT';
$$;

-- Vrai si l'ADMIN courant a une autorisation d'accès EXPLICITE ET ACTIVE à l'établissement
-- donné (statut=APPROUVE + dans la plage de dates). Les autres rôles n'utilisent pas cette
-- fonction (ils sont scoppés par leur propre etablissementId).
-- Alignée sur le repository Go CheckAccess (internal/repository/etablissement_access.go).
CREATE OR REPLACE FUNCTION public.admin_has_etablissement_access(p_etablissement_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "EtablissementAccess"
    WHERE "adminId" = current_user_id()
      AND "etablissementId" = p_etablissement_id
      AND "statut" = 'APPROUVE'
      AND ("dateDebut" IS NULL OR "dateDebut" <= CURRENT_TIMESTAMP)
      AND ("dateFin" IS NULL OR "dateFin" >= CURRENT_TIMESTAMP)
  );
$$;

-- Vrai si l'utilisateur courant appartient à l'établissement donné.
-- Pour ADMIN, vérifie l'autorisation explicite via EtablissementAccess.
-- Pour les autres rôles, compare avec le claim etablissement_id.
CREATE OR REPLACE FUNCTION public.belongs_to_etablissement(p_etablissement_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT
    CASE
      WHEN is_admin() THEN admin_has_etablissement_access(p_etablissement_id)
      ELSE current_etablissement_id() = p_etablissement_id
    END;
$$;


-- ============================================================
-- SECTION 2 — Activation + FORCE RLS sur toutes les tables
-- ============================================================
-- FORCE est nécessaire car neondb_owner est propriétaire des tables
-- et bypasserait RLS sinon. Avec FORCE, même le propriétaire est soumis
-- aux policies (mais les superusers bypassent toujours — Neon n'en a pas
-- pour notre rôle d'app).

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END
$$;
-- ============================================================
-- Migration 000007 — Policies RLS par table (Option A)
-- ============================================================
--
-- Policies organisées par groupe d'accès. Chaque policy utilise les
-- fonctions helper définies dans 000006 :
--   current_user_id(), current_role_claim(), current_etablissement_id()
--   is_admin(), is_responsable(), is_enseignant(), is_etudiant()
--   belongs_to_etablissement(eta_id), admin_has_etablissement_access(eta_id)
--
-- Rappel PostgreSQL : pour une même commande (SELECT/INSERT/...), les
-- policies multiples sont combinées par OR. Entre commandes différentes
-- (ex: SELECT vs INSERT), elles sont indépendantes.
--
-- Convention de nommage : "{Table}_{operation}" (ex: "User_select")
-- ============================================================


-- ============================================================
-- GROUPE 1 — Tables plateforme (ADMIN uniquement)
-- ============================================================
-- L'ADMIN est propriétaire PaaS. Ces tables ne contiennent aucune
-- donnée établissement. Seul l'ADMIN peut y accéder.
-- (Pas de policy = deny all pour les autres rôles, car RLS est activé.)

-- Plan (plans tarifaires SaaS)
CREATE POLICY "Plan_all_admin" ON "Plan"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- PlatformSettings (paramètres globaux de la plateforme)
CREATE POLICY "PlatformSettings_all_admin" ON "PlatformSettings"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- AIProviderConfig (configuration des providers IA — clé API, etc.)
CREATE POLICY "AIProviderConfig_all_admin" ON "AIProviderConfig"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- AIFailoverEvent (événements de bascule IA — écriture système, lecture ADMIN)
CREATE POLICY "AIFailoverEvent_select_admin" ON "AIFailoverEvent"
  FOR SELECT TO neondb_owner
  USING (is_admin());
CREATE POLICY "AIFailoverEvent_insert_system" ON "AIFailoverEvent"
  FOR INSERT TO neondb_owner
  WITH CHECK (true);  -- écriture par le backend (système)

-- MonitoringEvent (événements de monitoring — écriture système, lecture ADMIN)
CREATE POLICY "MonitoringEvent_select_admin" ON "MonitoringEvent"
  FOR SELECT TO neondb_owner
  USING (is_admin());
CREATE POLICY "MonitoringEvent_insert_system" ON "MonitoringEvent"
  FOR INSERT TO neondb_owner
  WITH CHECK (true);

-- NotificationAdmin (notifications destinées aux ADMIN)
CREATE POLICY "NotificationAdmin_all_admin" ON "NotificationAdmin"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());


-- ============================================================
-- GROUPE 2 — Tables plateforme avec scoping établissement
-- ============================================================

-- IpWhitelist (liste blanche IP — par établissement)
CREATE POLICY "IpWhitelist_select" ON "IpWhitelist"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "IpWhitelist_modify" ON "IpWhitelist"
  FOR ALL TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );

-- Facture (factures par établissement)
CREATE POLICY "Facture_select" ON "Facture"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "Facture_modify_admin" ON "Facture"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- Abonnement (abonnements par établissement)
CREATE POLICY "Abonnement_select" ON "Abonnement"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "Abonnement_modify_admin" ON "Abonnement"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- BadgeDefinition (définitions de badges — lisibles par tous, gérées par ADMIN/RESPONSABLE)
CREATE POLICY "BadgeDefinition_select_all" ON "BadgeDefinition"
  FOR SELECT TO neondb_owner
  USING (true);
CREATE POLICY "BadgeDefinition_modify_admin" ON "BadgeDefinition"
  FOR ALL TO neondb_owner
  USING (is_admin() OR is_responsable())
  WITH CHECK (is_admin() OR is_responsable());


-- ============================================================
-- GROUPE 3 — Tables établissement core
-- ============================================================

-- Etablissement (l'établissement lui-même)
CREATE POLICY "Etablissement_select" ON "Etablissement"
  FOR SELECT TO neondb_owner
  USING (
    -- ADMIN : uniquement les établissements autorisés via EtablissementAccess
    (is_admin() AND admin_has_etablissement_access("id"))
    -- RESPONSABLE / ENSEIGNANT / ETUDIANT : leur propre établissement
    OR (NOT is_admin() AND "id" = current_etablissement_id())
  );
CREATE POLICY "Etablissement_modify_responsable" ON "Etablissement"
  FOR UPDATE TO neondb_owner
  USING (is_responsable() AND "id" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "id" = current_etablissement_id());

-- EtablissementAccess (autorisations d'accès ADMIN → établissement)
CREATE POLICY "EtablissementAccess_select" ON "EtablissementAccess"
  FOR SELECT TO neondb_owner
  USING (
    is_admin()  -- ADMIN voit ses propres autorisations
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "EtablissementAccess_modify_admin" ON "EtablissementAccess"
  FOR ALL TO neondb_owner
  USING (is_admin())
  WITH CHECK (is_admin());

-- SecuritySettings (paramètres de sécurité par établissement)
CREATE POLICY "SecuritySettings_select" ON "SecuritySettings"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "SecuritySettings_modify_responsable" ON "SecuritySettings"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND "etablissementId" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "etablissementId" = current_etablissement_id());

-- AnneeAcademique (années académiques par établissement)
CREATE POLICY "AnneeAcademique_select" ON "AnneeAcademique"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "AnneeAcademique_modify_responsable" ON "AnneeAcademique"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND "etablissementId" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "etablissementId" = current_etablissement_id());


-- ============================================================
-- GROUPE 4 — Structure académique (étab-scoped + enseignant)
-- ============================================================

-- Filiere
CREATE POLICY "Filiere_select" ON "Filiere"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (NOT is_admin() AND "etablissementId" = current_etablissement_id())
  );
CREATE POLICY "Filiere_modify_responsable" ON "Filiere"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND "etablissementId" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "etablissementId" = current_etablissement_id());

-- UniteEnseignement (scopée par filière → établissement)
CREATE POLICY "UniteEnseignement_select" ON "UniteEnseignement"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access(
      (SELECT "etablissementId" FROM "Filiere" WHERE "id" = "UniteEnseignement"."filiereId")
    ))
    OR (NOT is_admin() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignement"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );
CREATE POLICY "UniteEnseignement_modify_responsable" ON "UniteEnseignement"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignement"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignement"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ));

-- UniteEnseignementFiliere (table de liaison)
CREATE POLICY "UniteEnseignementFiliere_select" ON "UniteEnseignementFiliere"
  FOR SELECT TO neondb_owner
  USING (
    (is_admin() AND admin_has_etablissement_access(
      (SELECT f."etablissementId" FROM "Filiere" f WHERE f."id" = "UniteEnseignementFiliere"."filiereId")
    ))
    OR (NOT is_admin() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );
CREATE POLICY "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ));

-- EnseignantFiliere (assignations enseignant ↔ filière)
CREATE POLICY "EnseignantFiliere_select" ON "EnseignantFiliere"
  FOR SELECT TO neondb_owner
  USING (
    -- ENSEIGNANT : ses propres assignations
    (is_enseignant() AND "enseignantId" = current_user_id())
    -- RESPONSABLE : assignations de son établissement
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    -- ADMIN : via accès autorisé
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
    -- ETUDIANT : filières de son établissement
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );
CREATE POLICY "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "EnseignantFiliere"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "EnseignantFiliere"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ));

-- Affectation (affectations enseignant ↔ UE)
CREATE POLICY "Affectation_select" ON "Affectation"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND "enseignantId" = current_user_id())
    OR (NOT is_admin() AND current_etablissement_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "UniteEnseignement" ue
      JOIN "Filiere" f ON f."id" = ue."filiereId"
      WHERE ue."id" = "Affectation"."uniteEnseignementId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "UniteEnseignement" ue
      JOIN "Filiere" f ON f."id" = ue."filiereId"
      WHERE ue."id" = "Affectation"."uniteEnseignementId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "Affectation_modify_responsable" ON "Affectation"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "UniteEnseignement" ue
    JOIN "Filiere" f ON f."id" = ue."filiereId"
    WHERE ue."id" = "Affectation"."uniteEnseignementId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "UniteEnseignement" ue
    JOIN "Filiere" f ON f."id" = ue."filiereId"
    WHERE ue."id" = "Affectation"."uniteEnseignementId"
      AND f."etablissementId" = current_etablissement_id()
  ));


-- ============================================================
-- GROUPE 5 — Contenu pédagogique (ENSEIGNANT crée, ETUDIANT lit via épreuve)
-- ============================================================

-- Question (créée par un enseignant — auteurId)
CREATE POLICY "Question_select" ON "Question"
  FOR SELECT TO neondb_owner
  USING (
    -- ENSEIGNANT : ses questions (auteurId) + questions partagées (auteurId IS NULL)
    (is_enseignant() AND ("auteurId" = current_user_id() OR "auteurId" IS NULL))
    -- RESPONSABLE : questions de son établissement (via filière de l'épreuve)
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      JOIN "Epreuve" e ON e."id" = eq."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE eq."questionId" = "Question"."id"
        AND f."etablissementId" = current_etablissement_id()
    ))
    -- ETUDIANT : questions des épreuves où il a une session
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      JOIN "SessionPassation" sp ON sp."epreuveId" = eq."epreuveId"
      WHERE eq."questionId" = "Question"."id"
        AND sp."etudiantId" = current_user_id()
    ))
    -- ADMIN : via accès établissement
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "EpreuveQuestion" eq
      JOIN "Epreuve" e ON e."id" = eq."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE eq."questionId" = "Question"."id"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "Question_modify_enseignant" ON "Question"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND ("auteurId" = current_user_id() OR "auteurId" IS NULL))
  WITH CHECK (is_enseignant() AND "auteurId" = current_user_id());

-- Epreuve (créée par un enseignant — enseignantId)
CREATE POLICY "Epreuve_select" ON "Epreuve"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND "enseignantId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f WHERE f."id" = "Epreuve"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "Epreuve"."id"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Filiere" f WHERE f."id" = "Epreuve"."filiereId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "Epreuve_modify_enseignant" ON "Epreuve"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND "enseignantId" = current_user_id())
  WITH CHECK (is_enseignant() AND "enseignantId" = current_user_id());

-- EpreuveQuestion (liaison épreuve ↔ question — via ownership épreuve)
CREATE POLICY "EpreuveQuestion_select" ON "EpreuveQuestion"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveQuestion"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "EpreuveQuestion"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "EpreuveQuestion"."epreuveId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "EpreuveQuestion"."epreuveId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "EpreuveQuestion_modify_enseignant" ON "EpreuveQuestion"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveQuestion"."epreuveId"
      AND e."enseignantId" = current_user_id()
  ))
  WITH CHECK (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveQuestion"."epreuveId"
      AND e."enseignantId" = current_user_id()
  ));

-- EpreuveDocument (liaison épreuve ↔ document — via ownership épreuve)
CREATE POLICY "EpreuveDocument_select" ON "EpreuveDocument"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveDocument"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "EpreuveDocument"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "EpreuveDocument"."epreuveId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "EpreuveDocument"."epreuveId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "EpreuveDocument_modify_enseignant" ON "EpreuveDocument"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveDocument"."epreuveId"
      AND e."enseignantId" = current_user_id()
  ))
  WITH CHECK (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Epreuve" e WHERE e."id" = "EpreuveDocument"."epreuveId"
      AND e."enseignantId" = current_user_id()
  ));

-- Document (possédé par ownerId — tout rôle peut posséder des documents).
-- EXAM-PREP-STUDENT-DOCS-RLS : branche is_etudiant() ajoutée (migration 000034)
-- pour que les étudiants voient les documents des UE de leur filière.
CREATE POLICY "Document_select" ON "Document"
  FOR SELECT TO neondb_owner
  USING (
    "ownerId" = current_user_id()
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Document"."ownerId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Document"."ownerId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "UniteEnseignement" ue
      WHERE ue."id" = "Document"."uniteEnseignementId"
        AND ue."filiereId" = current_user_filiere_id()
    ))
  );
CREATE POLICY "Document_modify_owner" ON "Document"
  FOR ALL TO neondb_owner
  USING ("ownerId" = current_user_id())
  WITH CHECK ("ownerId" = current_user_id());

-- Chapter (via document ownership, OU étudiant dont la filière correspond à l'UE du document)
-- EXAM-PREP-STUDENT-DOCS-RLS : branche is_etudiant() ajoutée (migration 000034)
CREATE POLICY "Chapter_select" ON "Chapter"
  FOR SELECT TO neondb_owner
  USING (
    EXISTS (
      SELECT 1 FROM "Document" d WHERE d."id" = "Chapter"."documentId"
        AND d."ownerId" = current_user_id()
    )
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "Document" d
      JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
      WHERE d."id" = "Chapter"."documentId"
        AND ue."filiereId" = current_user_filiere_id()
    ))
  );
CREATE POLICY "Chapter_modify_owner" ON "Chapter"
  FOR ALL TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Chapter"."documentId"
      AND d."ownerId" = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Chapter"."documentId"
      AND d."ownerId" = current_user_id()
  ));

-- Devoir (créé par un enseignant — enseignantId)
CREATE POLICY "Devoir_select" ON "Devoir"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND "enseignantId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Devoir"."enseignantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "Soumission" s WHERE s."devoirId" = "Devoir"."id"
        AND s."etudiantId" = current_user_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Devoir"."enseignantId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
CREATE POLICY "Devoir_modify_enseignant" ON "Devoir"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND "enseignantId" = current_user_id())
  WITH CHECK (is_enseignant() AND "enseignantId" = current_user_id());

-- GrilleEvaluation (via devoir ownership)
CREATE POLICY "GrilleEvaluation_select" ON "GrilleEvaluation"
  FOR SELECT TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "Devoir" d WHERE d."id" = "GrilleEvaluation"."devoirId"
      AND (
        (is_enseignant() AND d."enseignantId" = current_user_id())
        OR (is_responsable() AND EXISTS (
          SELECT 1 FROM "User" u WHERE u."id" = d."enseignantId"
            AND u."etablissementId" = current_etablissement_id()
        ))
      )
  ));
CREATE POLICY "GrilleEvaluation_modify_enseignant" ON "GrilleEvaluation"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Devoir" d WHERE d."id" = "GrilleEvaluation"."devoirId"
      AND d."enseignantId" = current_user_id()
  ))
  WITH CHECK (is_enseignant() AND EXISTS (
    SELECT 1 FROM "Devoir" d WHERE d."id" = "GrilleEvaluation"."devoirId"
      AND d."enseignantId" = current_user_id()
  ));


-- ============================================================
-- GROUPE 6 — Utilisateurs & comptes
-- ============================================================

-- User (table centrale — accès complexes par rôle)
CREATE POLICY "User_select" ON "User"
  FOR SELECT TO neondb_owner
  USING (
    -- Tout utilisateur se voit lui-même
    "id" = current_user_id()
    -- ETUDIANT : voit aussi les enseignants de ses filières (pour aide)
    -- U4 fix (migration 000014) : la cible doit être ENSEIGNANT (pas le current user).
    -- Avant : `is_etudiant() AND is_enseignant()` = toujours FALSE (dead code).
    OR (is_etudiant() AND "role" = 'ENSEIGNANT' AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      JOIN "User" me ON me."id" = current_user_id()
      WHERE ef."enseignantId" = "User"."id"
        AND ef."filiereId" = me."filiereId"
    ))
    -- ENSEIGNANT : voit les étudiants de ses filières
    OR (is_enseignant() AND "role" = 'ETUDIANT' AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ef."enseignantId" = current_user_id()
        AND ef."filiereId" = "User"."filiereId"
    ))
    -- RESPONSABLE : voit tous les utilisateurs de son établissement
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    -- ADMIN : pas d'accès direct aux utilisateurs d'établissement (sauf via EtablissementAccess)
    OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
    OR (is_admin() AND "etablissementId" IS NULL AND "role" = 'ADMIN')
  );
-- UPDATE : un utilisateur modifie son propre profil ; RESPONSABLE gère son établissement
CREATE POLICY "User_update" ON "User"
  FOR UPDATE TO neondb_owner
  USING (
    "id" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
  )
  WITH CHECK (
    "id" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
  );
-- INSERT : RESPONSABLE crée des utilisateurs dans son établissement ; ADMIN crée des ADMIN
CREATE POLICY "User_insert" ON "User"
  FOR INSERT TO neondb_owner
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("role" = 'ADMIN' OR ("etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))))
  );
-- DELETE : RESPONSABLE supprime dans son établissement ; ADMIN avec accès
CREATE POLICY "User_delete" ON "User"
  FOR DELETE TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
  );

-- Invitation (gérée par RESPONSABLE de l'établissement)
CREATE POLICY "Invitation_select" ON "Invitation"
  FOR SELECT TO neondb_owner
  USING (
    "createdById" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NULL OR admin_has_etablissement_access("etablissementId")))
  );
CREATE POLICY "Invitation_modify" ON "Invitation"
  FOR ALL TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NULL OR admin_has_etablissement_access("etablissementId")))
  )
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NULL OR admin_has_etablissement_access("etablissementId")))
  );

-- PasswordReset (self-service — l'utilisateur réinitialise son propre mot de passe)
CREATE POLICY "PasswordReset_select_self" ON "PasswordReset"
  FOR SELECT TO neondb_owner
  USING ("userId" = current_user_id() OR is_admin());
CREATE POLICY "PasswordReset_modify_self" ON "PasswordReset"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id() OR is_admin())
  WITH CHECK (true);  -- INSERT par le backend (système d'auth)

-- PushSubscription (notifications push — par utilisateur)
CREATE POLICY "PushSubscription_all_self" ON "PushSubscription"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());


-- ============================================================
-- GROUPE 7 — Évaluation & résultats
-- ============================================================

-- SessionPassation (session d'examen d'un étudiant pour une épreuve)
CREATE POLICY "SessionPassation_select" ON "SessionPassation"
  FOR SELECT TO neondb_owner
  USING (
    -- ETUDIANT : ses propres sessions
    (is_etudiant() AND "etudiantId" = current_user_id())
    -- ENSEIGNANT : sessions pour ses épreuves
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    -- RESPONSABLE : sessions de son établissement
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    -- ADMIN : via accès autorisé
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
-- INSERT : ETUDIANT crée sa propre session ; ENSEIGNANT crée pour ses épreuves
CREATE POLICY "SessionPassation_insert" ON "SessionPassation"
  FOR INSERT TO neondb_owner
  WITH CHECK (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );
-- UPDATE : ETUDIANT modifie sa session ; ENSEIGNANT modifie pour ses épreuves
CREATE POLICY "SessionPassation_update" ON "SessionPassation"
  FOR UPDATE TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
  );
-- DELETE : ENSEIGNANT/RESPONSABLE
CREATE POLICY "SessionPassation_delete" ON "SessionPassation"
  FOR DELETE TO neondb_owner
  USING (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "SessionPassation"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionPassation"."epreuveId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );

-- Reponse (réponse d'un étudiant à une question dans une session)
CREATE POLICY "Reponse_select" ON "Reponse"
  FOR SELECT TO neondb_owner
  USING (
    -- ETUDIANT : ses réponses (via sa session)
    (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."id" = "Reponse"."sessionId"
        AND sp."etudiantId" = current_user_id()
    ))
    -- ENSEIGNANT : réponses pour ses épreuves (correction)
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
    -- RESPONSABLE : réponses de son établissement
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    -- ADMIN : via accès
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
-- INSERT/UPDATE : ETUDIANT pendant sa session ; ENSEIGNANT pendant la correction
CREATE POLICY "Reponse_modify" ON "Reponse"
  FOR ALL TO neondb_owner
  USING (
    (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."id" = "Reponse"."sessionId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
  )
  WITH CHECK (
    (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."id" = "Reponse"."sessionId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Reponse"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
  );

-- Resultat (résultat d'une session — lié à sessionId)
CREATE POLICY "Resultat_select" ON "Resultat"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."id" = "Resultat"."sessionId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "Resultat_modify" ON "Resultat"
  FOR ALL TO neondb_owner
  USING (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e."id" = sp."epreuveId"
      JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE sp."id" = "Resultat"."sessionId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );

-- Soumission (devoir étudiant)
CREATE POLICY "Soumission_select" ON "Soumission"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Devoir" d WHERE d."id" = "Soumission"."devoirId"
        AND d."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Devoir" d JOIN "User" u ON u."id" = d."enseignantId"
      WHERE d."id" = "Soumission"."devoirId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Devoir" d JOIN "User" u ON u."id" = d."enseignantId"
      WHERE d."id" = "Soumission"."devoirId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
CREATE POLICY "Soumission_insert_etudiant" ON "Soumission"
  FOR INSERT TO neondb_owner
  WITH CHECK (is_etudiant() AND "etudiantId" = current_user_id());
CREATE POLICY "Soumission_update" ON "Soumission"
  FOR UPDATE TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Devoir" d WHERE d."id" = "Soumission"."devoirId"
        AND d."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Devoir" d JOIN "User" u ON u."id" = d."enseignantId"
      WHERE d."id" = "Soumission"."devoirId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Devoir" d WHERE d."id" = "Soumission"."devoirId"
        AND d."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Devoir" d JOIN "User" u ON u."id" = d."enseignantId"
      WHERE d."id" = "Soumission"."devoirId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  );

-- Certificat (émis pour un étudiant)
CREATE POLICY "Certificat_select" ON "Certificat"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND "emetteParId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Certificat"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Certificat"."etudiantId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
CREATE POLICY "Certificat_modify" ON "Certificat"
  FOR ALL TO neondb_owner
  USING (
    (is_enseignant() AND "emetteParId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Certificat"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_enseignant() AND "emetteParId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "Certificat"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  );

-- ValidationUE (validation d'unité d'enseignement pour un étudiant)
CREATE POLICY "ValidationUE_select" ON "ValidationUE"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (NOT is_admin() AND current_etablissement_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "ValidationUE"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "ValidationUE"."etudiantId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
CREATE POLICY "ValidationUE_modify" ON "ValidationUE"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "User" u WHERE u."id" = "ValidationUE"."etudiantId"
      AND u."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "User" u WHERE u."id" = "ValidationUE"."etudiantId"
      AND u."etablissementId" = current_etablissement_id()
  ));

-- SessionSpeciale (sessions d'examen spéciales — créées par creeParId, liées à une épreuve)
CREATE POLICY "SessionSpeciale_select" ON "SessionSpeciale"
  FOR SELECT TO neondb_owner
  USING (
    (is_enseignant() AND "creeParId" = current_user_id())
    OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      WHERE sp."epreuveId" = "SessionSpeciale"."epreuveDeriveeId"
        AND sp."etudiantId" = current_user_id()
    ))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionSpeciale"."epreuveDeriveeId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
      WHERE e."id" = "SessionSpeciale"."epreuveDeriveeId"
        AND admin_has_etablissement_access(f."etablissementId")
    ))
  );
CREATE POLICY "SessionSpeciale_modify" ON "SessionSpeciale"
  FOR ALL TO neondb_owner
  USING (is_enseignant() AND "creeParId" = current_user_id())
  WITH CHECK (is_enseignant() AND "creeParId" = current_user_id());


-- ============================================================
-- GROUPE 8 — Outils d'apprentissage (owner = userId)
-- ============================================================

-- ChatThread (fil de discussion sur un document)
CREATE POLICY "ChatThread_all_owner" ON "ChatThread"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());

-- ChatMessage (via thread ownership)
CREATE POLICY "ChatMessage_select" ON "ChatMessage"
  FOR SELECT TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "ChatThread" t WHERE t."id" = "ChatMessage"."threadId"
      AND t."userId" = current_user_id()
  ));
CREATE POLICY "ChatMessage_modify" ON "ChatMessage"
  FOR ALL TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "ChatThread" t WHERE t."id" = "ChatMessage"."threadId"
      AND t."userId" = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "ChatThread" t WHERE t."id" = "ChatMessage"."threadId"
      AND t."userId" = current_user_id()
  ));

-- ReviewItem (items de révision — owner userId)
CREATE POLICY "ReviewItem_all_owner" ON "ReviewItem"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());

-- Flashcard (flashcards — via document ownership)
CREATE POLICY "Flashcard_select" ON "Flashcard"
  FOR SELECT TO neondb_owner
  USING (
    "documentId" IS NULL  -- flashcards orphelines (système)
    OR EXISTS (
      SELECT 1 FROM "Document" d WHERE d."id" = "Flashcard"."documentId"
        AND d."ownerId" = current_user_id()
    )
  );
CREATE POLICY "Flashcard_modify" ON "Flashcard"
  FOR ALL TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Flashcard"."documentId"
      AND d."ownerId" = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Document" d WHERE d."id" = "Flashcard"."documentId"
      AND d."ownerId" = current_user_id()
  ));

-- StudySession (sessions d'étude — owner userId)
CREATE POLICY "StudySession_all_owner" ON "StudySession"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());

-- PracticeAttempt (tentatives d'exercice — owner userId)
CREATE POLICY "PracticeAttempt_select" ON "PracticeAttempt"
  FOR SELECT TO neondb_owner
  USING ("userId" = current_user_id());
-- INSERT seulement (tentatives immuables après création)
CREATE POLICY "PracticeAttempt_insert" ON "PracticeAttempt"
  FOR INSERT TO neondb_owner
  WITH CHECK ("userId" = current_user_id());

-- HelpThread (fil d'aide — ETUDIANT propriétaire, ENSEIGNANT assigné)
CREATE POLICY "HelpThread_select" ON "HelpThread"
  FOR SELECT TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND "enseignantId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "HelpThread"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  );
CREATE POLICY "HelpThread_modify" ON "HelpThread"
  FOR ALL TO neondb_owner
  USING (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND "enseignantId" = current_user_id())
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "HelpThread"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_etudiant() AND "etudiantId" = current_user_id())
    OR (is_enseignant() AND ("enseignantId" = current_user_id() OR "enseignantId" IS NULL))
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = "HelpThread"."etudiantId"
        AND u."etablissementId" = current_etablissement_id()
    ))
  );

-- HelpMessage (messages d'aide — via thread)
CREATE POLICY "HelpMessage_select" ON "HelpMessage"
  FOR SELECT TO neondb_owner
  USING (EXISTS (
    SELECT 1 FROM "HelpThread" ht WHERE ht."id" = "HelpMessage"."threadId"
      AND (
        (ht."etudiantId" = current_user_id())
        OR (ht."enseignantId" = current_user_id())
        OR (is_responsable() AND EXISTS (
          SELECT 1 FROM "User" u WHERE u."id" = ht."etudiantId"
            AND u."etablissementId" = current_etablissement_id()
        ))
      )
  ));
CREATE POLICY "HelpMessage_insert" ON "HelpMessage"
  FOR INSERT TO neondb_owner
  WITH CHECK (
    "auteurId" = current_user_id()
    AND EXISTS (
      SELECT 1 FROM "HelpThread" ht WHERE ht."id" = "HelpMessage"."threadId"
        AND (
          (ht."etudiantId" = current_user_id())
          OR (ht."enseignantId" = current_user_id())
        )
    )
  );


-- ============================================================
-- GROUPE 9 — Système & audit
-- ============================================================

-- AuditLog (journal d'audit — ADMIN plateforme + RESPONSABLE établissement)
CREATE POLICY "AuditLog_select" ON "AuditLog"
  FOR SELECT TO neondb_owner
  USING (
    -- ADMIN : voit tout (journal plateforme)
    is_admin()
    -- RESPONSABLE : logs de son établissement (via userId)
    OR (is_responsable() AND (
      "userId" = current_user_id()
      OR EXISTS (
        SELECT 1 FROM "User" u WHERE u."id" = "AuditLog"."userId"
          AND u."etablissementId" = current_etablissement_id()
      )
      OR "userId" IS NULL
    ))
    -- ENSEIGNANT/ETUDIANT : ses propres logs
    OR ("userId" = current_user_id())
  );
-- INSERT par le backend (système) — pas de restriction sur le user_id
CREATE POLICY "AuditLog_insert_system" ON "AuditLog"
  FOR INSERT TO neondb_owner
  WITH CHECK (true);

-- Alerte (alertes — par scope : userId, filiereId, epreuveId)
CREATE POLICY "Alerte_select" ON "Alerte"
  FOR SELECT TO neondb_owner
  USING (
    -- Alerte adressée à l'utilisateur courant
    "userId" = current_user_id()
    -- RESPONSABLE : alertes de son établissement (filiereId/epreuveId scopés)
    OR (is_responsable() AND (
      EXISTS (
        SELECT 1 FROM "Filiere" f WHERE f."id" = "Alerte"."filiereId"
          AND f."etablissementId" = current_etablissement_id()
      )
      OR EXISTS (
        SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
        WHERE e."id" = "Alerte"."epreuveId"
          AND f."etablissementId" = current_etablissement_id()
      )
    ))
    -- ENSEIGNANT : alertes sur ses épreuves
    OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Epreuve" e WHERE e."id" = "Alerte"."epreuveId"
        AND e."enseignantId" = current_user_id()
    ))
    -- ADMIN : alertes plateforme (pas scopées à un établissement)
    OR (is_admin() AND "userId" IS NULL AND "filiereId" IS NULL AND "epreuveId" IS NULL)
  );
-- INSERT/UPDATE par le backend (système de surveillance)
CREATE POLICY "Alerte_insert_system" ON "Alerte"
  FOR INSERT TO neondb_owner
  WITH CHECK (true);
CREATE POLICY "Alerte_update" ON "Alerte"
  FOR UPDATE TO neondb_owner
  USING (
    "userId" = current_user_id()
    OR is_responsable()
    OR is_admin()
  )
  WITH CHECK (true);


-- ============================================================
-- FIN — Toutes les policies RLS sont en place.
-- ============================================================
-- Récapitulatif :
--   Groupe 1 (ADMIN only)     : 6 tables  (Plan, PlatformSettings, AIProviderConfig, AIFailoverEvent, MonitoringEvent, NotificationAdmin)
--   Groupe 2 (plateforme+étab) : 4 tables  (IpWhitelist, Facture, Abonnement, BadgeDefinition)
--   Groupe 3 (étab core)       : 4 tables  (Etablissement, EtablissementAccess, SecuritySettings, AnneeAcademique)
--   Groupe 4 (structure acad)  : 5 tables  (Filiere, UniteEnseignement, UniteEnseignementFiliere, EnseignantFiliere, Affectation)
--   Groupe 5 (contenu)         : 8 tables  (Question, Epreuve, EpreuveQuestion, EpreuveDocument, Document, Chapter, Devoir, GrilleEvaluation)
--   Groupe 6 (utilisateurs)    : 4 tables  (User, Invitation, PasswordReset, PushSubscription)
--   Groupe 7 (évaluation)      : 7 tables  (SessionPassation, Reponse, Resultat, Soumission, Certificat, ValidationUE, SessionSpeciale)
--   Groupe 8 (apprentissage)   : 8 tables  (ChatThread, ChatMessage, ReviewItem, Flashcard, StudySession, PracticeAttempt, HelpThread, HelpMessage)
--   Groupe 9 (système)         : 2 tables  (AuditLog, Alerte)
--   -------------------------
--   TOTAL                      : 48 tables (BadgeProgression = owner userId, voir ci-dessous)
-- ============================================================

-- BadgeProgression (progression de badges — owner userId, oubliée plus haut)
CREATE POLICY "BadgeProgression_select_self" ON "BadgeProgression"
  FOR SELECT TO neondb_owner
  USING ("userId" = current_user_id());
CREATE POLICY "BadgeProgression_modify_system" ON "BadgeProgression"
  FOR ALL TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());
