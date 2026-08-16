# SECT Desktop — Makefile
# Task ID: SECT-DESKTOP-PHASE-A-1
#
# Commandes courantes pour le développement de SECT Desktop (Wails).

WAILS ?= wails
GO ?= go

.PHONY: help dev build clean vet tidy deps

help: ## Afficher cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

deps: ## Installer les dépendances (Go + frontend)
	$(GO) mod download
	cd frontend && npm install

dev: ## Lancer en mode dev (hot reload, ouvre le webview)
	$(WAILS) dev

build: ## Compiler le binaire production (plateforme courante)
	$(WAILS) build -clean

build-windows: ## Cross-compiler pour Windows (depuis Windows)
	$(WAILS) build -platform windows/amd64 -clean -webview2 embed

build-macos: ## Cross-compiler pour macOS (depuis macOS)
	$(WAILS) build -platform darwin/universal -clean

build-linux: ## Cross-compiler pour Linux (depuis Linux)
	$(WAILS) build -platform linux/amd64 -clean

vet: ## Vérifier le code Go
	$(GO) vet ./...

tidy: ## Tidier les dépendances Go
	$(GO) mod tidy

test: ## Lancer les tests Go
	$(GO) test ./... -v

clean: ## Nettoyer les artifacts de build
	rm -rf build/bin/
	rm -rf frontend/dist/
	cd frontend && rm -rf node_modules/

# --- Info ---

info: ## Afficher les versions
	@$(WAILS) version
	@$(GO) version
	@node --version
