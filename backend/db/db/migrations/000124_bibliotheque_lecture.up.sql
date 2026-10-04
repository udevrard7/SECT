-- ============================================================
-- Migration 000124 — Bibliothèque numérique P2 : la lecture mesurée
-- (OuvrageLecture + agrégats d'activité).
-- ADR-0007 (docs/desktop/ADR/0007-bibliotheque-numerique.md §P2),
-- décision SECT-BIBLIO-P2.
-- ============================================================
-- OBJET : reprise de lecture à la page exacte + temps de lecture
-- mesuré (visibilité-gated côté client) + agrégats d'activité pour
-- l'enseignant/responsable/admin. La télémétrie est une POSITION de
-- lecture, pas une donnée d'évaluation — elle n'entre JAMAIS dans les
-- notes (invariant ADR-0007 : la bibliothèque référence, I2).
--
-- MODÈLE : une ligne par (ouvrage, utilisateur) — UNIQUE(ouvrageId,
-- userId). pagesVues suit le pattern TEXT-JSON du codebase (pattern
-- Document/Auteur) : {"12": 3} = page 12 vue 3 fois. La fusion des
-- deltas se fait côté Go (read-modify-write SELECT FOR UPDATE) — le
-- JSON n'est jamais assemblé en SQL.
--
-- RLS — DÉLÉGATION À Ouvrage_select (000123) : les policies
-- propriétaire ré-expriment la visibilité de l'ouvrage via
-- EXISTS (SELECT 1 FROM "Ouvrage" o WHERE o."id" = "ouvrageId" AND
-- <mêmes conditions que Ouvrage_select>). Le scoping etab / corbeille /
-- droits expirés vit ainsi à UN SEUL endroit ; un ouvrage masqué ne
-- peut être ni lu, ni repris, ni télémétré (404 partout, cohérent P1).
--
-- Leçons répercutées : RLS dans la MÊME migration que la table (000121) ;
-- TO PUBLIC (sect_app NOBYPASSRLS, pattern 000117) ; RLS évalué AVANT
-- les contraintes sur INSERT → un ouvrage invisible produit 42501 et
-- non 23503 (DTTES-AUDIT-2/P2) ; ASSERTs post-migration (000122) ;
-- aucun paramètre plpgsql — ici tout est typé par les colonnes
-- (ENUM-SWEEP : pas de comparaison text↔enum dans cette migration,
-- categorie::text explicite dans la fonction agrégat).
-- ============================================================

-- 1. La table (DDL strict ADR-0007 §P2)
CREATE TABLE "OuvrageLecture" (
  "id"               TEXT PRIMARY KEY,
  "ouvrageId"        TEXT NOT NULL REFERENCES "Ouvrage"("id") ON DELETE CASCADE,
  "userId"           TEXT NOT NULL REFERENCES "User"("id"),
  "dernierePage"     INTEGER NOT NULL DEFAULT 1,
  "pagesVues"        TEXT,       -- JSON {"12": 3} page → vues (pattern TEXT-JSON)
  "tempsTotalSec"    INTEGER NOT NULL DEFAULT 0,
  "derniereLectureAt" TIMESTAMP NOT NULL DEFAULT now(),
  "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE ("ouvrageId","userId")
);

CREATE INDEX "OuvrageLecture_ouvrage_idx" ON "OuvrageLecture"("ouvrageId");
CREATE INDEX "OuvrageLecture_user_idx" ON "OuvrageLecture"("userId");

-- 2. RLS — même migration que la table (leçon 000121)
ALTER TABLE "OuvrageLecture" ENABLE ROW LEVEL SECURITY;

-- La visibilité de l'ouvrage est DÉLÉGUÉE à la policy Ouvrage_select :
-- EXISTS reprend ses conditions (etab + non-supprimé + droits non
-- expirés pour les lecteurs ; is_admin/is_system voient tout) — un seul
-- endroit définit « un ouvrage visible », les lectures suivent.
DROP POLICY IF EXISTS "OuvrageLecture_select" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_select" ON "OuvrageLecture"
    FOR SELECT TO PUBLIC
    USING (
        "userId" = current_user_id()
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    );

DROP POLICY IF EXISTS "OuvrageLecture_insert" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_insert" ON "OuvrageLecture"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        "userId" = current_user_id()
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    );

DROP POLICY IF EXISTS "OuvrageLecture_update" ON "OuvrageLecture";
CREATE POLICY "OuvrageLecture_update" ON "OuvrageLecture"
    FOR UPDATE TO PUBLIC
    USING (
        "userId" = current_user_id()
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    )
    WITH CHECK (
        "userId" = current_user_id()
        AND EXISTS (
            SELECT 1 FROM "Ouvrage" o
            WHERE o."id" = "ouvrageId"
              AND (
                  is_system()
                  OR is_admin()
                  OR (
                      o."etablissementId" = current_etablissement_id()
                      AND o."deletedAt" IS NULL
                      AND (
                          o."dateExpirationDroits" IS NULL
                          OR o."dateExpirationDroits" > now()
                      )
                  )
              )
        )
    );

-- DELETE : VOLONTAIREMENT AUCUNE policy (deny par défaut, pattern
-- 000121/IAUsage/Ouvrage) — l'historique de lecture ne se supprime pas
-- par l'app ; la purge éventuelle est un job system (qui passe par
-- is_system() si une policy DELETE voit le jour).

-- 3. Agrégats d'activité — fonction ADDITIVE SECURITY DEFINER
-- (pattern 000116 : additive = invisible pour l'ancien code, déploiement
-- sans rupture migration↔Render ; agrégats uniquement, pas d'accès aux
-- données individuelles — exception documentée 000097).
--
-- CLOISONNEMENT DANS LA FONCTION (« rôle+etab dans la fonction ») :
-- SECURITY DEFINER exécute en tant que propriétaire (BYPASSRLS) — la
-- fonction RÉ-IMPOSE donc elle-même le contrôle d'accès sur les claims
-- de la transaction appelante (posés par SetClaimsTx) :
--   - rôle ∈ (ENSEIGNANT, RESPONSABLE, ADMIN), sinon 0 ligne ;
--   - non-ADMIN : uniquement l'établissement de SES claims (un RESP ne
--     peut pas sonder l'activité d'un autre établissement).
-- categorie est retournée ::text (leçon ENUM-SWEEP : jamais d'enum nu
-- en colonne de sortie — CategorieOuvrage serait sinon exposé à des
-- casts implicites text↔enum côté clients).
CREATE FUNCTION public.bibliotheque_activite_etablissement(p_etablissement_id text)
RETURNS TABLE(
    ouvrage_id text,
    titre text,
    categorie text,
    nb_lecteurs bigint,
    pages_vues_total bigint,
    temps_total_sec bigint,
    derniere_activite timestamp
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
      SELECT
        o."id",
        o."titre",
        o."categorie"::text,
        count(l."id"),
        COALESCE(sum(
          (SELECT COALESCE(sum((t.v)::bigint), 0)
           FROM jsonb_each_text(COALESCE(l."pagesVues", '{}')::jsonb) AS t(k, v))
        ), 0),
        COALESCE(sum(l."tempsTotalSec"), 0),
        max(l."derniereLectureAt")
      FROM "Ouvrage" o
      LEFT JOIN "OuvrageLecture" l ON l."ouvrageId" = o."id"
      WHERE o."etablissementId" = p_etablissement_id
        AND o."deletedAt" IS NULL
        AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now())
        -- cloisonnement rôle + etab (cf. ci-dessus)
        AND current_setting('app.claims.role', true)
              IN ('ENSEIGNANT', 'RESPONSABLE', 'ADMIN')
        AND (
            current_setting('app.claims.role', true) = 'ADMIN'
            OR current_setting('app.claims.etablissement_id', true) = p_etablissement_id
        )
      GROUP BY o."id", o."titre", o."categorie"
      ORDER BY max(l."derniereLectureAt") DESC NULLS LAST, o."titre" ASC
    $function$;

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet,
-- pattern 000122/000123)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'OuvrageLecture'
            AND c.relrowsecurity) = 1,
         'RLS doit etre active sur OuvrageLecture';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"OuvrageLecture"'::regclass
            AND polname IN ('OuvrageLecture_select','OuvrageLecture_insert',
                            'OuvrageLecture_update')) = 3,
         'OuvrageLecture doit avoir exactement 3 policies (select/insert/update)';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"OuvrageLecture"'::regclass) = 3,
         'Aucune policy DELETE sur OuvrageLecture (historique non supprimable par l app)';
  ASSERT (SELECT count(*) FROM pg_constraint
          WHERE conrelid = '"OuvrageLecture"'::regclass
            AND contype = 'u') = 1,
         'UNIQUE (ouvrageId, userId) doit exister (une progression par lecteur)';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polrelid = '"OuvrageLecture"'::regclass
            AND p.polname = 'OuvrageLecture_select'
            AND position('current_user_id' in pg_get_expr(p.polqual, p.polrelid)) > 0
            AND position('dateExpirationDroits' in pg_get_expr(p.polqual, p.polrelid)) > 0) = 1,
         'OuvrageLecture_select doit etre proprietaire ET deleguer la visibilite a Ouvrage_select';
  ASSERT (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'bibliotheque_activite_etablissement'
            AND p.prosecdef) = 1,
         'bibliotheque_activite_etablissement doit exister en SECURITY DEFINER';
END $$;
