# SECT API — Makefile
# Commandes courantes pour le backend Go

GO ?= go
PORT ?= 8080

.PHONY: help dev build run test lint migrate-up migrate-down migrate-version sqlc-gen tidy clean

help: ## Afficher cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Lancer en développement (hot reload non inclus)
	$(GO) run ./cmd/api

build: ## Compiler le binaire
	$(GO) build -o bin/sect-api ./cmd/api

run: build ## Compiler et lancer
	./bin/sect-api

test: ## Lancer les tests
	$(GO) test ./... -v

lint: ## Linter (golangci-lint)
	golangci-lint run ./...

tidy: ## Tidier les dépendances Go
	$(GO) mod tidy

# --- Migrations (golang-migrate) ---

MIGRATE ?= migrate
MIGRATIONS_DIR ?= db/migrations
DB_URL ?= $(shell echo $$NEON_DIRECT_URL)

migrate-up: ## Appliquer toutes les migrations
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DB_URL)" up

migrate-down: ## Annuler la dernière migration
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DB_URL)" down 1

migrate-version: ## Version de migration courante
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DB_URL)" version

# --- sqlc (génération de code type-safe) ---

sqlc-gen: ## Générer le code Go depuis les requêtes SQL
	sqlc generate

# --- Nettoyage ---

clean: ## Nettoyer les artifacts de build
	rm -rf bin/
