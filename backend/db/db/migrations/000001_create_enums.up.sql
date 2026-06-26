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

