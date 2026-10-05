// ouvrage_lecture_handlers.go — handlers HTTP de la lecture mesurée
// (ADR-0007 P2, SECT-BIBLIO-P2). Routes montées dans router.go :
//
//	GET /api/ouvrages/{id}/lecture                  (tous rôles, propriétaire)
//	PUT /api/ouvrages/{id}/lecture                  (tous rôles, propriétaire)
//	GET /api/etablissements/{id}/bibliotheque-activite (ENS/RESP/ADMIN)
//
// La télémétrie est BEST-EFFORT côté client (heartbeat 30 s + flush
// keepalive) : les réponses restent légères et les erreurs honnêtes.
package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// getOuvrageLecture — GET /api/ouvrages/{id}/lecture
// Répond {"lecture": {...}} ou {"lecture": null} (première lecture).
// 404 si l'ouvrage est invisible (auto-masquage RLS, cohérent P1) —
// jamais de fuite d'existence : un ouvrage invisible sans progression
// répond 404, pas un null.
func (s *Server) getOuvrageLecture(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	lecture, err := s.ouvrageUC.GetLecture(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"lecture": lecture})
}

// putOuvrageLecture — PUT /api/ouvrages/{id}/lecture
// Corps : {"dernierePage": 42, "pagesVues": {"41": 1}, "tempsDeltaSec": 30}
// (tous champs optionnels ; la sémantique de chaque champ est documentée
// dans domain.RecordLectureInput — incrément de temps, delta de vues,
// marque-page déclaratif). Répond la ligne fusionnée {"lecture": {...}}.
func (s *Server) putOuvrageLecture(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input domain.RecordLectureInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	lecture, err := s.ouvrageUC.RecordLecture(r.Context(), claims, chi.URLParam(r, "id"), input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	// SECT-BIBLIO-P4 (ADR-0008 §3) : PAS d'évaluation badge ici — le
	// décerneur vit UNIQUEMENT dans POST /api/badges (dashboard on
	// mount). Évaluer au heartbeat consommerait la montée de niveau et
	// laisserait newlyUnlocked vide au POST : le RewardToast frontend
	// (contrat « recalculer + newlyUnlocked », stack Prisma historique)
	// ne se déclencherait jamais. La cloche reste informée par la
	// notification BADGE_DEBLOQUE émise au POST.
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"lecture": lecture})
}

// getBibliothequeActivite — GET /api/etablissements/{id}/bibliotheque-activite
// Agrégats d'activité par ouvrage (fonction SECURITY DEFINER 000124,
// cloisonnée rôle+etab). ENS/RESP/ADMIN-assistance : LEUR établissement
// uniquement (ADR-0009) — l'ADMIN global passe par le mode assistance.
func (s *Server) getBibliothequeActivite(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	etablissementID := chi.URLParam(r, "id")
	activite, err := s.ouvrageUC.ActiviteEtablissement(r.Context(), claims, etablissementID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"etablissementId": etablissementID,
		"activite":        activite,
	})
}
