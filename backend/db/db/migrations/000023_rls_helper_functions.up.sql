-- 000023: Refactoring RLS — fonctions helper SECURITY DEFINER + policies non-récursives
--
-- CONTEXTE : avec sect_app (NOBYPASSRLS), les policies avec cross-table subqueries
-- causent une récursion RLS infinie. Exemple : User_select fait JOIN "User" me →
-- déclenche RLS sur User → récursion.
--
-- FIX : créer des fonctions SECURITY DEFINER (SET row_security = off) qui encapsulent
-- chaque pattern de cross-table check. Les policies utilisent ces fonctions au lieu
-- de faire des sous-queries inline.
--
-- Sécurité :
-- - SECURITY DEFINER : s'exécute en tant que neondb_owner (bypass RLS interne)
-- - SET row_security = off : désactive RLS dans la fonction (pas de récursion)
-- - SET search_path = public : anti-hijacking
-- - VOLATILE : empêche le planner d'inliner à plan-time
-- - plpgsql : jamais inliné par le planner

-- ═══════════════════════════════════════════════════════════════
-- FONCTIONS "appartient à mon établissement"
-- ═══════════════════════════════════════════════════════════════

-- Vérifie si une filière appartient à l'établissement courant
CREATE OR REPLACE FUNCTION public.filiere_in_my_etab(p_filiere_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f.id = p_filiere_id AND f."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si un user appartient à l'établissement courant
CREATE OR REPLACE FUNCTION public.user_in_my_etab(p_user_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = p_user_id AND u."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si une épreuve appartient à l'établissement courant (via Filiere)
CREATE OR REPLACE FUNCTION public.epreuve_in_my_etab(p_epreuve_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Epreuve" e
    JOIN "Filiere" f ON f.id = e."filiereId"
    WHERE e.id = p_epreuve_id AND f."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si une UE appartient à l'établissement courant (via Filiere)
CREATE OR REPLACE FUNCTION public.ue_in_my_etab(p_ue_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "UniteEnseignement" ue
    JOIN "Filiere" f ON f.id = ue."filiereId"
    WHERE ue.id = p_ue_id AND f."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si un devoir appartient à l'établissement courant (via enseignantId → User)
CREATE OR REPLACE FUNCTION public.devoir_in_my_etab(p_devoir_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Devoir" d
    JOIN "User" u ON u.id = d."enseignantId"
    WHERE d.id = p_devoir_id AND u."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si une session appartient à l'établissement courant (via Epreuve → Filiere)
CREATE OR REPLACE FUNCTION public.session_in_my_etab(p_session_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "SessionPassation" sp
    JOIN "Epreuve" e ON e.id = sp."epreuveId"
    JOIN "Filiere" f ON f.id = e."filiereId"
    WHERE sp.id = p_session_id AND f."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si une soumission appartient à l'établissement courant (via Devoir → User)
CREATE OR REPLACE FUNCTION public.soumission_in_my_etab(p_soumission_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Soumission" s
    JOIN "Devoir" d ON d.id = s."devoirId"
    JOIN "User" u ON u.id = d."enseignantId"
    WHERE s.id = p_soumission_id AND u."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si une grille d'évaluation appartient à l'établissement courant (via Devoir → User)
CREATE OR REPLACE FUNCTION public.grille_in_my_etab(p_grille_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "GrilleEvaluation" g
    JOIN "Devoir" d ON d.id = g."devoirId"
    JOIN "User" u ON u.id = d."enseignantId"
    WHERE g.id = p_grille_id AND u."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si un affectation appartient à l'établissement courant (via UE → Filiere)
CREATE OR REPLACE FUNCTION public.affectation_in_my_etab(p_affectation_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Affectation" a
    JOIN "UniteEnseignement" ue ON ue.id = a."uniteEnseignementId"
    JOIN "Filiere" f ON f.id = ue."filiereId"
    WHERE a.id = p_affectation_id AND f."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- Vérifie si une session spéciale appartient à l'établissement courant (via epreuveDeriveeId → Epreuve → Filiere)
CREATE OR REPLACE FUNCTION public.session_speciale_in_my_etab(p_session_speciale_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "SessionSpeciale" ss
    JOIN "Epreuve" e ON e.id = ss."epreuveDeriveeId"
    JOIN "Filiere" f ON f.id = e."filiereId"
    WHERE ss.id = p_session_speciale_id AND f."etablissementId" = current_etablissement_id()
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- FONCTIONS "possédé par moi" (owner checks)
-- ═══════════════════════════════════════════════════════════════

-- Vérifie si un document m'appartient
CREATE OR REPLACE FUNCTION public.document_owned_by_me(p_document_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Document" d
    WHERE d.id = p_document_id AND d."ownerId" = current_user_id()
  );
END;
$$;

-- Vérifie si un chat thread m'appartient
CREATE OR REPLACE FUNCTION public.chatthread_owned_by_me(p_thread_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "ChatThread" t
    WHERE t.id = p_thread_id AND t."userId" = current_user_id()
  );
END;
$$;

-- Vérifie si une épreuve est créée par moi (enseignantId)
CREATE OR REPLACE FUNCTION public.epreuve_owned_by_me(p_epreuve_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Epreuve" e
    WHERE e.id = p_epreuve_id AND e."enseignantId" = current_user_id()
  );
END;
$$;

-- Vérifie si un devoir est créé par moi (enseignantId)
CREATE OR REPLACE FUNCTION public.devoir_owned_by_me(p_devoir_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Devoir" d
    WHERE d.id = p_devoir_id AND d."enseignantId" = current_user_id()
  );
END;
$$;

-- Vérifie si une session appartient à l'étudiant courant
CREATE OR REPLACE FUNCTION public.session_owned_by_me(p_session_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "SessionPassation" sp
    WHERE sp.id = p_session_id AND sp."etudiantId" = current_user_id()
  );
END;
$$;

-- Vérifie si une session spéciale a une session dérivée appartenant à l'étudiant courant
CREATE OR REPLACE FUNCTION public.session_speciale_has_my_session(p_session_speciale_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "SessionPassation" sp
    JOIN "SessionSpeciale" ss ON ss."epreuveDeriveeId" = sp."epreuveId"
    WHERE ss.id = p_session_speciale_id AND sp."etudiantId" = current_user_id()
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- FONCTIONS "étudiant voit enseignants de sa filière"
-- ═══════════════════════════════════════════════════════════════

-- Vérifie si un enseignant (p_enseignant_id) enseigne dans la filière de l'étudiant courant
CREATE OR REPLACE FUNCTION public.enseignant_in_my_filiere(p_enseignant_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "EnseignantFiliere" ef
    WHERE ef."enseignantId" = p_enseignant_id
      AND ef."filiereId" = current_user_filiere_id()
  );
END;
$$;

-- Vérifie si un étudiant (p_etudiant_id) est dans une filière où j'enseigne
CREATE OR REPLACE FUNCTION public.etudiant_in_my_filiere(p_etudiant_id text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "EnseignantFiliere" ef
    JOIN "User" u ON u."filiereId" = ef."filiereId"
    WHERE ef."enseignantId" = current_user_id()
      AND u.id = p_etudiant_id
  );
END;
$$;

-- Grant EXECUTE à PUBLIC sur toutes les nouvelles fonctions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
