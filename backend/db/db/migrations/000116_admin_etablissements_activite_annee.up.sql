-- ════════════════════════════════════════════════════════════════════════════
-- 000116 — statsAdmin : activité académique SCOPÉE sur l'année courante
--          (SECT-ANNEE-DETTES-5 — dette « statsAdmin non scopée »)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE. SECT-ANNEE-DETTES-4 avait clôturé la dette par une décision
-- « NON SCOPÉ PAR DESIGN » : le dashboard ADMIN est la vue propriétaire PaaS
-- (Abonnement, Facture, Plan, Etablissement, EtablissementAccess,
-- MonitoringEvent) — aucune entité année. SECT-ANNEE-DETTES-5 complète cette
-- décision : on AJOUTE au dashboard une dimension académique, et elle est
-- scopée d'office sur l'année COURANTE de chaque établissement (contrat
-- SECT-ANNEE : défaut = année courante). Sans ce scoping, un compteur
-- d'épreuves/sessions « toutes années » mélangerait les années archivées
-- (ex. démo : 6 épreuves 2024-2025 + 1 en 2025-2026 vs 0 en 2026-2027) et
-- masquerait les établissements réellement inactifs cette année.
--
-- POURQUOI UNE NOUVELLE FONCTION (et pas une extension de
-- admin_get_etablissements_overview) : le handler Go appelle l'ancienne
-- fonction via `SELECT *` + Scan positionnel sensible à la forme. Modifier
-- son ensemble de colonnes créerait une fenêtre de rupture entre l'apply de
-- la migration et le redéploiement Render (l'ancien code scannerait 18
-- colonnes sur 15 retournées → overview vide). Une fonction ADDITIVE est
-- invisible pour l'ancien code : déploiement sans rupture, aucun ordre
-- critique migration↔code.
--
-- Colonnes (une ligne par établissement, mêmes IDs que l'overview) :
--   id                      — ID Etablissement (clé de merge côté Go)
--   annee_courante_libelle  — libellé de l'année ACTIVE (NULL si aucune)
--   nb_epreuves_annee       — épreuves tamponnées sur l'année active
--   nb_sessions_annee       — sessions dont l'épreuve est de l'année active
--
-- Sémantique « année courante » = actif = true (même définition que
-- resolveCurrentAnneeID côté Go / annee_scope.go) ; l'index unique de 000110
-- garantit au plus une année active par établissement (le IN reste robuste).
-- Agrégats uniquement (compteurs) — pas d'accès aux données individuelles,
-- conforme à l'exception documentée dans 000097.

CREATE FUNCTION public.admin_get_etablissements_activite_annee()
RETURNS TABLE(
    id text,
    annee_courante_libelle text,
    nb_epreuves_annee bigint,
    nb_sessions_annee bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
      SELECT
        e.id,
        (SELECT aa."libelle" FROM "AnneeAcademique" aa
         WHERE aa."etablissementId" = e.id AND aa."actif" = true
         ORDER BY aa."dateDebut" DESC LIMIT 1),
        (SELECT count(*) FROM "Epreuve" ep
         WHERE ep."anneeAcademiqueId" IN
            (SELECT aa."id" FROM "AnneeAcademique" aa
             WHERE aa."etablissementId" = e.id AND aa."actif" = true)),
        (SELECT count(*) FROM "SessionPassation" sp
         JOIN "Epreuve" ep ON ep."id" = sp."epreuveId"
         WHERE ep."anneeAcademiqueId" IN
            (SELECT aa."id" FROM "AnneeAcademique" aa
             WHERE aa."etablissementId" = e.id AND aa."actif" = true))
      FROM "Etablissement" e
      ORDER BY e.nom ASC
    $function$;
