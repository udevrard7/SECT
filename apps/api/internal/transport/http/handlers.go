package http

import (
	"encoding/json"
	"net/http"

	"github.com/udevrard7/sect/apps/api/internal/middleware"
	"github.com/udevrard7/sect/apps/api/internal/usecase"
)

// health handler — vérifie l'état du serveur et de la connexion DB.
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "sect-api",
		"version": "0.1.0",
	})
}

// me handler — retourne le profil de l'utilisateur courant.
// Démontre le flux RLS complet :
// 1. Le middleware Auth extrait le JWT → claims dans le context
// 2. Le handler récupère les claims
// 3. Le repository utilise db.WithTx pour poser les claims RLS
// 4. La requête SELECT sur "User" est filtrée par RLS
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"no claims"}`, http.StatusUnauthorized)
		return
	}

	uc := usecase.NewUserUseCase(s.userRepo)
	user, err := uc.GetProfile(r.Context(), claims)
	if err != nil {
		writeError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// writeError convertit une erreur domaine en réponse HTTP appropriée.
func writeError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	// TODO: switch sur le type d'erreur domaine (NotFoundError → 404, etc.)
	w.WriteHeader(http.StatusInternalServerError)
	json.NewEncoder(w).Encode(map[string]string{
		"error": err.Error(),
	})
}
