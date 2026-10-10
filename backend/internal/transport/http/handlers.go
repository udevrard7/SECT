package http

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	db "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// health handler — vérifie l'état du serveur.
// STATIQUE PAR CONCEPTION (ADR-0013 §7) : utilisé par le healthCheckPath
// Render et le HEALTHCHECK Docker (sémantique "process alive") — ne doit
// PAS dépendre de la DB, sinon une panne Neon provoquerait des restart-loops
// de l'orchestrateur (Render/Docker) qui aggraveraient l'incident.
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "sect-api",
		"version": "0.2.0",
	})
}

// healthDB handler — vérifie la dépendance Neon (Ping pgxpool = SELECT vide
// via le pool, donc le VRAI chemin utilisateur : pooler Neon + RLS).
//
// SECT-HEALTH-DB-1 (recommandation ADR-0013 §7) : la sonde externe
// (ops/uptime_probe.sh) pointait sur /health STATIQUE → une panne Neon
// totale laissait la sonde VERTE (trou de garde). Ce endpoint est
// "dependency-aware" : 503 si la DB est injoignable, 200 sinon.
//
// Timeout 2 s : couvre un réveil de compute Neon (suspend → actif,
// ~500 ms-3 s) ; en pratique les workers (10 s-24 h) maintiennent le
// compute actif en continu — le timeout borne surtout les file d'attente
// pool et pannes réseau. Le corps garde le champ "status":"ok" attendu
// par http_probe (ops/uptime_probe.sh) : AUCUN changement requis côté
// sonde au-delà de l'URL.
func (s *Server) healthDB(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	start := time.Now()
	err := s.dbPool.Ping(ctx)
	latency := time.Since(start)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "degraded",
			"service": "sect-api",
			"db":      "down",
		})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":     "ok",
		"service":    "sect-api",
		"db":         "up",
		"latency_ms": latency.Milliseconds(),
	})
}

// me handler — retourne le profil de l'utilisateur courant.
// Démontre le flux RLS complet : middleware Auth pose claims → repository utilise
// db.WithTx pour poser les claims RLS → Neon filtre automatiquement.
//
// ACCESS-ASSISTANCE-FIX : en mode assistance (ADMIN avec etablissementId non vide
// dans le JWT), le User DB a etablissementId=NULL (l'assistance ne modifie que le
// JWT, pas la DB). On overlay le claims.EtablissementID sur la réponse pour que
// le frontend conserve l'état assistance après un reload (sinon syncFromSession
// écrase user.etablissementId=null → frontend/backend desync).
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "no claims")
		return
	}

	// U23 (LOW): utiliser s.userUC (wire dans main.go) au lieu d'instancier un
	// nouveau UserUseCase. Si on ajoute plus tard des dépendances à UserUseCase
	// (ex: authRepo pour U5), le handler /api/me en bénéficiera automatiquement.
	user, err := s.userUC.GetProfile(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// ACCESS-ASSISTANCE-FIX : overlay du etablissementId du JWT quand l'ADMIN est
	// en mode assistance. Sans cela, /api/me retourne etablissementId=null (valeur
	// DB de l'ADMIN) et le frontend perd l'état assistance au reload (F5).
	if claims.Role == string(domain.RoleAdmin) && claims.EtablissementID != "" {
		etabID := claims.EtablissementID
		user.EtablissementID = &etabID
	}

	// SECT-B2C-SELF-SERVICE : populer user.Etablissement (ref avec type) pour que
	// le frontend puisse conditionner l'affichage du menu de gestion aux profs B2C
	// (étab type PERSONNEL). Query directe (bypass RLS via SystemClaims) car le
	// handler /api/me est authentifié mais on veut lire l'étab sans dépendre des
	// policies Etablissement_select (qui peuvent filtrer).
	if user.EtablissementID != nil && *user.EtablissementID != "" && user.Etablissement == nil {
		var etabNom, etabType string
		err := db.WithTx(r.Context(), s.dbPool, db.SystemClaims(), func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(),
				`SELECT "nom", COALESCE("type", '') FROM "Etablissement" WHERE "id" = $1`,
				*user.EtablissementID,
			).Scan(&etabNom, &etabType)
		})
		if err == nil {
			user.Etablissement = &domain.EtablissementRef{
				ID:   *user.EtablissementID,
				Nom:  etabNom,
				Type: etabType,
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}
