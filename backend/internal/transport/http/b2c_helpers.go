package http

// b2c_helpers.go — Helpers pour le self-service B2C.
//
// SECT-B2C-SELF-SERVICE : un prof B2C (ENSEIGNANT dans un étab PERSONNEL) a des
// droits étendus (créer filières, UE, étudiants) dans SON espace. Ces helpers
// permettent aux handlers de vérifier si l'utilisateur courant est un prof B2C.

import (
	"context"
	"time"

	db "github.com/udevrard7/sect/backend/internal/db"
)

// isB2CSelfService vérifie si l'utilisateur courant est un ENSEIGNANT dans un
// établissement de type PERSONNEL (B2C). Retourne true si oui.
// Query DB (3s timeout) — à n'appeler que si claims.Role == "ENSEIGNANT".
func (s *Server) isB2CSelfService(ctx context.Context, claims db.SessionClaims) (bool, error) {
	if claims.Role != "ENSEIGNANT" || claims.EtablissementID == "" {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var etabType string
	err := s.dbPool.QueryRow(ctx,
		`SELECT "type" FROM "Etablissement" WHERE "id" = $1`,
		claims.EtablissementID,
	).Scan(&etabType)
	if err != nil {
		return false, err
	}
	return etabType == "PERSONNEL", nil
}
