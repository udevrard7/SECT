-- Rollback : supprimer la table MessageHiddenByUser.

DROP POLICY IF EXISTS "MessageHiddenByUser_select" ON "MessageHiddenByUser";
DROP POLICY IF EXISTS "MessageHiddenByUser_insert" ON "MessageHiddenByUser";
DROP POLICY IF EXISTS "MessageHiddenByUser_delete" ON "MessageHiddenByUser";
DROP TABLE IF EXISTS "MessageHiddenByUser";
