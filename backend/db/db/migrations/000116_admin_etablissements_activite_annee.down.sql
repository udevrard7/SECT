-- 000116 (down) — retire la fonction d'activité académique année courante.
-- Fonction additive : aucun consommateur avant SECT-ANNEE-DETTES-5, aucun
-- objet dépendant (vue/trigger) — le DROP est sûr.

DROP FUNCTION IF EXISTS public.admin_get_etablissements_activite_annee();
