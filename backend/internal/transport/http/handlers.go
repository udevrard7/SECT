package http

import (
        "encoding/json"
        "net/http"

        "github.com/udevrard7/sect/backend/internal/domain"
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

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(user)
}
