-- 000023 down: supprime les 18 fonctions helper SECURITY DEFINER créées par 000023.
--
-- NOTE IMPORTANTE : les policies recréées dans 000024 dépendent de ces fonctions.
-- Ce down ne doit être appliqué QUE si 000024 a été annulée au préalable (golang-migrate
-- annule dans l'ordre inverse : 000024 down avant 000023 down).
--
-- Les fonctions sont créées via CREATE OR REPLACE, donc on utilise DROP FUNCTION IF EXISTS
-- (safe même si une fonction n'existait pas avant 000023).

-- Fonctions "appartient à mon établissement"
DROP FUNCTION IF EXISTS public.filiere_in_my_etab(text);
DROP FUNCTION IF EXISTS public.user_in_my_etab(text);
DROP FUNCTION IF EXISTS public.epreuve_in_my_etab(text);
DROP FUNCTION IF EXISTS public.ue_in_my_etab(text);
DROP FUNCTION IF EXISTS public.devoir_in_my_etab(text);
DROP FUNCTION IF EXISTS public.session_in_my_etab(text);
DROP FUNCTION IF EXISTS public.soumission_in_my_etab(text);
DROP FUNCTION IF EXISTS public.grille_in_my_etab(text);
DROP FUNCTION IF EXISTS public.affectation_in_my_etab(text);
DROP FUNCTION IF EXISTS public.session_speciale_in_my_etab(text);

-- Fonctions "possédé par moi" (owner checks)
DROP FUNCTION IF EXISTS public.document_owned_by_me(text);
DROP FUNCTION IF EXISTS public.chatthread_owned_by_me(text);
DROP FUNCTION IF EXISTS public.epreuve_owned_by_me(text);
DROP FUNCTION IF EXISTS public.devoir_owned_by_me(text);
DROP FUNCTION IF EXISTS public.session_owned_by_me(text);
DROP FUNCTION IF EXISTS public.session_speciale_has_my_session(text);

-- Fonctions "étudiant voit enseignants de sa filière"
DROP FUNCTION IF EXISTS public.enseignant_in_my_filiere(text);
DROP FUNCTION IF EXISTS public.etudiant_in_my_filiere(text);
