-- 000059 down: supprime la table IAUsage (tracking mensuel des quotas IA).
-- Le DROP TABLE supprime automatiquement les indexes et contraintes associés.

DROP TABLE IF EXISTS "IAUsage";
