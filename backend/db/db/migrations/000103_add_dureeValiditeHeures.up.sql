-- DUREE-VALIDITE-24H-V2 : ajout de la colonne "dureeValiditeHeures" sur EtablissementAccess.
-- Stocke la durée souhaitée par l'ADMIN lors de la demande (1, 2, 3, 4, 6, 8, 12 ou 24 heures).
-- Le RESPONSABLE voit cette durée indicative quand il approuve, puis fixe la durée
-- réellement accordée via dureeAccesHeures (calcul dateFin = now() + heures).
-- La durée d'accès est désormais limitée à 24h max (accès temporaire assistance/audit).
ALTER TABLE "EtablissementAccess" ADD COLUMN "dureeValiditeHeures" INTEGER;

-- Commentaire de colonne pour documentation
COMMENT ON COLUMN "EtablissementAccess"."dureeValiditeHeures" IS 'Durée souhaitée par l''ADMIN en heures (1,2,3,4,6,8,12,24). Limitée à 24h max pour accès temporaire assistance/audit/support.';
