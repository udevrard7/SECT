-- Migration 000089 — AnneeAcademique dateDebut/dateFin TIMESTAMP(3) → DATE
-- SECT-ANNEE-DATE-COLUMN-1
--
-- CONTEXTE : les colonnes dateDebut/dateFin étaient TIMESTAMP(3). Le frontend
-- envoie des dates YYYY-MM-DD (via <input type="date">), stockées comme minuit
-- UTC. L'affichage via toLocaleDateString('fr-FR') peut décaler d'un jour pour
-- les utilisateurs en timezone négative (ex: UTC-5 voit 30/08 au lieu de 31/08).
--
-- FIX : migration vers DATE (sans timezone). L'affichage sera cohérent partout.
-- La conversion USING dateDebut::date est safe (truncate la partie time).
--
-- NB : ValidationUE.anneeAcademiqueId est une FK (text), pas impactée.
-- Epreuve.anneeAcademiqueId aussi. Aucune autre table ne stocke des dates
-- d'année académique.

ALTER TABLE "AnneeAcademique" ALTER COLUMN "dateDebut" TYPE DATE USING "dateDebut"::date;
ALTER TABLE "AnneeAcademique" ALTER COLUMN "dateFin" TYPE DATE USING "dateFin"::date;
