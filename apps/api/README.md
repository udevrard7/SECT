# SECT API — Backend Go (Clean Architecture)

Backend Go du projet SECT, connecté à **Neon Postgres** avec **RLS** (Row Level Security).

## Architecture

```
apps/api/
├── cmd/api/main.go              # Point d'entrée
├── internal/
│   ├── config/                  # Chargement .env
│   ├── db/                      # pgxpool + helpers RLS (SetClaimsTx, WithTx)
│   ├── domain/                  # Entités métier + interfaces repository
│   ├── usecase/                 # Logique métier (orchestre les repositories)
│   ├── repository/              # Implémentations pgx (UserRepository, ...)
│   ├── transport/http/          # Routeur chi + handlers HTTP
│   └── middleware/              # Auth JWT, RLS claims, logging
├── db/queries/                  # Requêtes SQL pour sqlc
├── sqlc.yaml                    # Config sqlc (génération code type-safe)
├── go.mod
└── Makefile
```

### Flux RLS (Row Level Security)

```
Request HTTP
  → Middleware Auth (extrait JWT → claims dans context)
    → Handler (récupère claims depuis context)
      → UseCase (appelle repository avec context)
        → Repository (extrait claims, appelle db.WithTx)
          → db.WithTx (BeginTx + SetClaimsTx → pose app.claims.* sur la transaction)
            → pgx Query (Neon RLS filtre automatiquement les lignes)
          → Commit (claims nettoyés automatiquement)
```

## Démarrage rapide

```bash
# Variables d'environnement requises
export NEON_DATABASE_URL="postgresql://..."  # Neon poolé
export JWT_SECRET="..."

# Lancer en développement
make dev

# Ou compiler + lancer
make build && ./bin/sect-api
```

## Endpoints

| Méthode | Path | Auth | Description |
|---------|------|------|-------------|
| GET | `/health` | Non | Health check |
| GET | `/api/me` | Oui | Profil utilisateur courant (démo RLS) |

## Migrations

Les migrations SQL sont partagées avec le frontend (dossier `../../db/migrations/`).

```bash
make migrate-up       # Appliquer toutes les migrations
make migrate-down     # Annuler la dernière
make migrate-version  # Version courante
```

## sqlc (génération code type-safe)

```bash
make sqlc-gen  # Génère internal/repository/sqlcgen/ depuis db/queries/*.sql
```

## Stack technique

- **Go 1.23** avec `pgx/v5` (pool PostgreSQL)
- **chi/v5** (routeur HTTP léger, compatible net/http)
- **slog** (logging structuré, stdlib Go 1.21+)
- **golang-migrate** (migrations versionnées)
- **sqlc** (génération de code type-safe depuis SQL)
- **Neon Postgres** avec RLS (Option A : claims de session)
