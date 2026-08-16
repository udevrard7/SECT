-- Rollback 000088 : supprime la fonction create_inscription_for_signup.
-- NB : les Inscription créées par le hook ne sont PAS supprimées (elles sont
-- des données métier légitimes — l'étudiant s'est inscrit, l'Inscription trace
-- ce fait). Seule la fonction est dropped.

DROP FUNCTION IF EXISTS public.create_inscription_for_signup(text, text, text, "NiveauEtude");
