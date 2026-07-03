# Réconciliation des migrations — 2025-01

## Contexte

Un audit de la base Neon de production a révélé 3 anomalies sur les migrations :

1. **Doublons de numéros** dans `backend/db/db/migrations/` :
   - 2 fichiers portaient le numéro `000039` (`document_audio_delete_student` + `fix_participant_insert_direct`)
   - 2 fichiers portaient le numéro `000040` (`etablissement_access_roles_public` + `fix_conversation_insert_etudiant`)
   - `golang-migrate` ne tolère pas les numéros dupliqués → `migrate up` échouait.

2. **Dérive `schema_migrations`** : 8 migrations (38, 40, 41, 42, 43, 44, 45, 47-renumérotée, 48-renumérotée) étaient appliquées en DB (effets vérifiés) mais **non enregistrées** dans la table `schema_migrations`. La migration **46** n'était quant à elle **pas appliquée**.

3. **Makefile** : `MIGRATIONS_DIR ?= db/migrations` alors que les fichiers sont dans `db/db/migrations/` → `make migrate-up` échouait (chemin inexistant).

## Décisions

### Renumérotation (Action 1.1)

Pour ne pas perdre l'historique Git, les doublons ont été **renumérotés** (pas fusionnés) :

| Avant | Après | Sujet |
|-------|-------|-------|
| `000039_document_audio_delete_student` | `000039_document_audio_delete_student` *(inchangé)* | Policy DocumentAudio_delete étudiant |
| `000039_fix_participant_insert_direct` | **`000047_fix_participant_insert_direct`** | Policy Participant_insert (DM) |
| `000040_etablissement_access_roles_public` | `000040_etablissement_access_roles_public` *(inchangé)* | Policies EtablissementAccess roles={public} |
| `000040_fix_conversation_insert_etudiant` | **`000048_fix_conversation_insert_etudiant`** | Policy Conversation_insert étudiants (CLASSE/PROMO) |

**Justification du choix 39a/40a gardés** :
- `000039_document_audio_delete_student` était déjà enregistré dans `schema_migrations` comme version 39.
- `000040_etablissement_access_roles_public` est la migration référencée dans le `worklog.md` comme « migration 000040 ».

### Réparation Makefile (Action 1.2)

```makefile
- MIGRATIONS_DIR ?= db/migrations
+ MIGRATIONS_DIR ?= db/db/migrations
```

### Réconciliation Neon (Actions 2 & 3 — exécutées via psql sur le pooler)

Les migrations 38→45 + 47 + 48 ayant leurs **effets déjà présents en DB** (vérifiés par audit policy par policy), seules les lignes de `schema_migrations` ont été insérées (dirty=false) :

```sql
INSERT INTO schema_migrations (version, dirty) VALUES
  ('38', false), ('40', false), ('41', false), ('42', false),
  ('43', false), ('44', false), ('45', false),
  ('47', false), ('48', false)
ON CONFLICT (version) DO NOTHING;
```

La migration **46** (`signalement_delete_responsable_purge`) était réellement **non appliquée** — son SQL a été exécuté puis la version enregistrée :

```sql
-- 1. Appliquer le SQL de 000046_signalement_delete_responsable_purge.up.sql
-- 2. INSERT INTO schema_migrations (version, dirty) VALUES ('46', false);
```

## État final attendu

- `backend/db/db/migrations/` : 48 numéros uniques (1→48), sans doublon.
- `schema_migrations` : 48 versions (1→48), `dirty=false` partout.
- `make migrate-version` retourne `48`.
- `make migrate-up` : no-op (tout est appliqué).
- La policy `Signalement_delete` autorise désormais le responsable à purger les signalements RESOLU/REJETE de +7 jours.

## Note pour les futurs développeurs

- **Toujours** numéroter les nouvelles migrations avec un numéro strictement supérieur au max actuel (`SELECT max(version) FROM schema_migrations`).
- **Ne jamais** réutiliser un numéro de migration déjà poussé, même si la migration précédente a été rollbackée.
- Le backend Go **ne lance pas** les migrations au démarrage (le Dockerfile ne contient que le binaire). Les migrations sont **manuelles**. Utiliser :
  ```bash
  cd backend
  # URL DIRECTE Neon requise (pas le pooler — golang-migrate utilise advisory locks)
  NEON_DIRECT_URL="postgresql://...?sslmode=require" make migrate-up
  ```
