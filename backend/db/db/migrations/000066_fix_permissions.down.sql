-- Rollback : pas besoin de revoke (les fonctions sont droppées par les migrations précédentes)
-- Cette migration ne fait que des GRANT, idempotents.
SELECT 1;
