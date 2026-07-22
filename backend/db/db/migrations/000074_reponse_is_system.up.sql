-- 000074_reponse_is_system.up.sql
-- OPT-3 (batch flush) : ajouter OR is_system() aux policies Reponse_select et Reponse_modify.
--
-- Le batch flush (BatchFlushSessions) utilise SystemClaims (is_system()=true) pour
-- persister les réponses de N sessions en 1 seule transaction. Sans ce fix, le
-- system-worker est bloqué par les policies RLS qui ne reconnaissent que
-- is_etudiant(), is_enseignant(), is_responsable() et is_admin().
--
-- Sécurité : is_system() n'est vrai QUE si app.claims.user_id = 'system-worker',
-- ce qui n'arrive jamais via les handlers HTTP (le middleware Auth positionne
-- le vrai user_id du JWT). Le bypass est strictement limité au backend Go.
-- L'ownership a déjà été vérifiée lors du save en cache (OWNERSHIP-CACHE-1/2).

-- Reponse_select : ajouter OR is_system()
DROP POLICY IF EXISTS "Reponse_select" ON "Reponse";
CREATE POLICY "Reponse_select" ON "Reponse" FOR SELECT TO PUBLIC USING (
  is_system()
  OR (is_etudiant() AND session_owned_by_me("sessionId"))
  OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "SessionPassation" sp
      JOIN "Epreuve" e ON e.id = sp."epreuveId"
      WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
  ))
  OR (is_responsable() AND session_in_my_etab("sessionId"))
  OR (is_admin() AND admin_has_etablissement_access(session_etab_id("sessionId")))
);

-- Reponse_modify : ajouter OR is_system()
DROP POLICY IF EXISTS "Reponse_modify" ON "Reponse";
CREATE POLICY "Reponse_modify" ON "Reponse" FOR ALL TO PUBLIC
  USING (
    is_system()
    OR (is_etudiant() AND session_owned_by_me("sessionId"))
    OR (is_enseignant() AND EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        JOIN "Epreuve" e ON e.id = sp."epreuveId"
        WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND session_in_my_etab("sessionId"))
  )
  WITH CHECK (
    is_system()
    OR (is_etudiant() AND session_owned_by_me("sessionId"))
    OR (is_enseignant() AND EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        JOIN "Epreuve" e ON e.id = sp."epreuveId"
        WHERE sp.id = "Reponse"."sessionId" AND e."enseignantId" = current_user_id()
    ))
    OR (is_responsable() AND session_in_my_etab("sessionId"))
  );
