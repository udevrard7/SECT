-- Migration 000030 — Hard-delete des demandes ANNULE/REFUSE (Option B sécurité)
--
-- CONTEXTE : décision de sécurité (Option B) — les demandes d'accès annulées (EN_ATTENTE)
-- ou refusées/révoquées (REFUSE) doivent être HARD-DELETED de la table EtablissementAccess
-- par mesure de sécurité (minimisation des données, réduction de la surface d'attaque).
--
-- Seul l'audit trail des RÉVOCATIONS (APPROUVE → REFUSE) est conservé via la table
-- AuditLog (INSERT avant hard-delete, fait par le repo Delete). Les annulations
-- (EN_ATTENTE → hard-delete) et refus (EN_ATTENTE → REFUSE → hard-delete) ne sont
-- pas loggées car elles ne concernent que des demandes qui n'ont jamais donné lieu
-- à un accès effectif.
--
-- Cette migration nettoie les lignes ANNULE/REFUSE existantes (issues des tests E2E
-- précédents) avant l'activation du nouveau comportement.

-- 1. Hard-delete des lignes ANNULE (issues du soft-delete B-11 précédent)
DELETE FROM "EtablissementAccess" WHERE "statut" = 'ANNULE';

-- 2. Hard-delete des lignes REFUSE (refus/révocation)
-- Note : on ne logge pas ces lignes dans AuditLog car ce sont des données de test
-- et l'audit trail des révocations futures sera fait par le repo Delete à partir
-- de maintenant.
DELETE FROM "EtablissementAccess" WHERE "statut" = 'REFUSE';

-- 3. Vérification : il ne doit rester que des lignes EN_ATTENTE ou APPROUVE
-- (la contrainte d'index partiel 000026 exige déjà que ces statuts soient uniques
-- par (adminId, etablissementId)).
