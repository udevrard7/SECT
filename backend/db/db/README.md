# SECT — Database Migrations

Schéma PostgreSQL canonique pour le backend **Go (Clean Architecture)** du projet SECT.

Ce dossier contient les migrations SQL versionnées (format **golang-migrate**) qui
remplacent l'ancienne gestion Prisma (`prisma db push`). Le backend Go utilisera
`pgx` + `sqlc` pour l'accès données et `golang-migrate` pour appliquer ces
migrations sur **Neon Postgres**.

## Structure

```
db/
├── migrations/                     # Migrations versionnées (golang-migrate)
│   ├── 000001_create_enums.up.sql      # 23 types ENUM
│   ├── 000001_create_enums.down.sql
│   ├── 000002_create_tables.up.sql     # 49 tables (DDL)
│   ├── 000002_create_tables.down.sql
│   ├── 000003_create_indexes.up.sql    # 109 index (uniques + secondaires)
│   ├── 000003_create_indexes.down.sql
│   ├── 000004_add_foreign_keys.up.sql  # 81 contraintes FK
│   ├── 000004_add_foreign_keys.down.sql
│   ├── 000005_create_updated_at_trigger.up.sql  # trigger BEFORE UPDATE
│   └── 000005_create_updated_at_trigger.down.sql
├── rls/                            # Policies RLS (étape 1.B — à venir)
└── reference/
    └── schema.sql                  # Schéma consolidé (concat des up) — lecture seule
```

## Conventions

### Nommage
- **Tables/colonnes** : `camelCase` entre guillemets (ex. `"etablissementId"`) —
  héritage de Prisma, conservé pour compatibilité avec les données existantes
  migrées depuis Supabase.
- **Index** : `{Table}_{colonne}_idx` (secondaire) ou `{Table}_{colonne}_key` (unique).
- **FK** : `{Table}_{colonne}_fkey`.
- **PK** : `{Table}_pkey`.

### Timestamps
- Toutes les colonnes temporelles utilisent `TIMESTAMP(3)` (précision milliseconde).
- `createdAt` : `DEFAULT CURRENT_TIMESTAMP`.
- `updatedAt` : mis à jour automatiquement par le trigger `trg_set_updated_at`
  (BEFORE UPDATE) — ne pas gérer côté application Go.

### Identifiants
- Toutes les PK sont `TEXT` avec valeurs CUID générées par l'application.
- Aucune séquence/SERIAL — les CUID sont insérés par le backend Go (via la lib
  `github.com/lucsky/cuid` ou équivalent).

## Application des migrations

### Avec golang-migrate (CLI)

```bash
# Installer golang-migrate (une fois)
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Appliquer toutes les migrations vers le haut
migrate -path db/migrations \
  -database "postgresql://user:pass@host/db?sslmode=require" \
  up

# Voir l'état courant
migrate -path db/migrations \
  -database "postgresql://..." \
  version

# Rollback d'une migration
migrate -path db/migrations \
  -database "postgresql://..." \
  down 1
```

### Avec Docker (sans installation locale)

```bash
docker run --rm -v $(pwd)/db/migrations:/migrations \
  migrate/migrate \
  -path /migrations \
  -database "postgresql://user:pass@host:5432/db?sslmode=require" \
  up
```

## Vérification du schéma

Après application, vérifier que toutes les tables existent :

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Attendu : 49
```

Vérifier les triggers `updated_at` :

```sql
SELECT count(*) FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_name = 'trg_set_updated_at';
-- Attendu : 31 (tables avec colonne updatedAt)
```

## Notes de migration depuis Supabase

- Les données existantes (1 369 lignes sur 32 tables) seront migrées via
  `pg_dump --data-only` Supabase → `pg_restore` Neon (étape 1.C).
- Les CUID existants sont préservés (ce sont des TEXT).
- Les enums doivent exister AVANT le restore des données (ordre des migrations
  respecté : 000001 enums → 000002 tables → 000004 FK → restore data).
