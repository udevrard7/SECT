package http

import (
        "encoding/json"
        "net/http"

        "github.com/udevrard7/sect/backend/internal/middleware"
)

// health handler — vérifie l'état du serveur.
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{
                "status":  "ok",
                "service": "sect-api",
                "version": "0.2.0",
        })
}

// me handler — retourne le profil de l'utilisateur courant.
// Démontre le flux RLS complet : middleware Auth pose claims → repository utilise
// db.WithTx pour poser les claims RLS → Neon filtre automatiquement.
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

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(user)
}
