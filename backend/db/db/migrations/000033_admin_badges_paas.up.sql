-- Migration 000033 — Refonte badges ADMIN adaptés PaaS (6 nouveaux badges business)
--
-- CONTEXTE : les 4 badges ADMIN actuels (gardien_plateforme, strategiste, pilote_ia, sensei)
-- sont trop pédagogiques et ne reflètent pas le rôle PaaS de l'ADMIN (propriétaire de la
-- plateforme SaaS). Ils ne mesurent pas la croissance, les revenus, la sécurité ou le scale.
--
-- FIX : désactiver les 4 anciens + créer 6 nouveaux badges ADMIN orientés business PaaS
-- avec paliers progressifs (BRONZE → ARGENT → OR → DIAMANT) :
--
-- 1. pionnier_saas      — Premier établissement client onboardé (PaaS launched)
-- 2. architecte_croissance — Atteindre 5/10/25 établissements actifs (scale)
-- 3. capitaine_industrie — Générer 100K/500K/1M FCFA de revenus (MRR)
-- 4. gardien_securite   — Maintenir score santé ≥ 80% pendant 7/30/90 jours (ops)
-- 5. scale_master       — 50/200/500 utilisateurs actifs (adoption)
-- 6. excellence_ops     — 0 incident critique pendant 7/30/90 jours (reliability)
--
-- Note : la recalculation des badges (valeurActuelle, debloque) est faite côté backend
-- dans le handler badgesList (POST /api/badges). Les niveaux sont stockés comme array
-- de enum NiveauBadge.

-- 1. Désactiver les 4 anciens badges ADMIN (actif=false, conservés pour l'historique)
UPDATE "BadgeDefinition" SET "actif" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "roleCible" = 'ADMIN' AND "cle" IN ('gardien_plateforme', 'strategiste', 'pilote_ia', 'sensei');

-- 2. Insérer les 6 nouveaux badges ADMIN PaaS (ordre 40-45 pour les placer après les anciens)
-- Niveaux : BRONZE (niveau 1), ARGENT (niveau 2), OR (niveau 3), DIAMANT (niveau 4)

INSERT INTO "BadgeDefinition" ("id", "cle", "titre", "description", "icone", "categorie", "roleCible", "niveaux", "actif", "ordre", "createdAt", "updatedAt")
VALUES
('badge-paas-pionnier', 'pionnier_saas', 'Pionnier SaaS',
 'Onboarder le premier établissement client sur la plateforme',
 'Rocket', 'GESTION', 'ADMIN', ARRAY['BRONZE']::"NiveauBadge"[], true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('badge-paas-croissance', 'architecte_croissance', 'Architecte de Croissance',
 'Atteindre 5, 10 puis 25 établissements actifs sur la plateforme',
 'TrendingUp', 'GESTION', 'ADMIN', ARRAY['BRONZE','ARGENT','OR','DIAMANT']::"NiveauBadge"[], true, 41, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('badge-paas-revenus', 'capitaine_industrie', 'Capitaine d''Industrie',
 'Générer 100K, 500K puis 1M de FCFA de revenus cumulés sur la plateforme',
 'Banknote', 'EXCELLENCE', 'ADMIN', ARRAY['BRONZE','ARGENT','OR','DIAMANT']::"NiveauBadge"[], true, 42, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('badge-paas-securite', 'gardien_securite', 'Gardien Sécurité',
 'Maintenir un score de santé plateforme ≥ 80% pendant 7, 30 puis 90 jours consécutifs',
 'ShieldCheck', 'GESTION', 'ADMIN', ARRAY['BRONZE','ARGENT','OR','DIAMANT']::"NiveauBadge"[], true, 43, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('badge-paas-scale', 'scale_master', 'Scale Master',
 'Atteindre 50, 200 puis 500 utilisateurs actifs sur la plateforme',
 'Users', 'ENGAGEMENT', 'ADMIN', ARRAY['BRONZE','ARGENT','OR','DIAMANT']::"NiveauBadge"[], true, 44, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('badge-paas-ops', 'excellence_ops', 'Excellence Ops',
 'Maintenir 0 incident critique pendant 7, 30 puis 90 jours consécutifs',
 'Award', 'EXCELLENCE', 'ADMIN', ARRAY['BRONZE','ARGENT','OR','DIAMANT']::"NiveauBadge"[], true, 45, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
