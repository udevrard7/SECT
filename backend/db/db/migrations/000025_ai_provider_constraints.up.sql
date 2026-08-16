-- 000025: Contraintes d'intégrité sur AIProviderConfig (ai-providers MEDIUM fixes)
--
-- CONTEXTE : audit ai-providers (bugs MEDIUM #7 + #20).
--
-- Bug #7 : il n'existait aucune contrainte DB empêchant deux providers d'être
-- marqués "isActive = true" simultanément. Le handler POST /activate tente de
-- désactiver les autres en UPDATE, mais une race condition ou un appel direct
-- à la DB pouvait produire plusieurs providers actifs → comportement
-- imprévisible côté worker (getActiveProviderShared renvoie le 1er trouvé par
-- priorité, mais c'est implicite).
--
-- FIX : un PARTIAL UNIQUE INDEX sur "isActive" = true garantit au niveau DB
-- qu'au maximum UNE ligne peut avoir isActive = true à tout moment.
-- L'index utilise une expression constante ((1)) car PostgreSQL exige au
-- moins une colonne dans un index ; on ne veut pas indexer sur la valeur
-- "true" elle-même (uniquement filtrer les lignes actives).
--
-- L'index est créé avec IF NOT EXISTS pour être idempotent.
-- Le handler aiProviderActivate fait déjà "UPDATE ... SET isActive = false"
-- puis "UPDATE ... SET isActive = true WHERE id = $1" dans une transaction,
-- donc cette contrainte ne devrait pas lever d'erreur en usage normal.

CREATE UNIQUE INDEX IF NOT EXISTS "AIProviderConfig_single_active"
  ON "AIProviderConfig" ((1)) WHERE "isActive" = true;
