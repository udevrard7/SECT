// Package http — handlers pour l'audit log scoped par établissement.
//
// SECT-ETABLISSEMENT-AUDIT-1 — le RESPONSABLE peut consulter TOUTES les
// actions d'audit de SON établissement via le endpoint dédié :
//
//	GET /api/etablissements/{id}/audit-logs?action=...&entite=...&dateFrom=...
//	    &dateTo=...&search=...&page=1&limit=20
//
// Defense in depth (ADR-0010, pattern ADR-0009) :
//  1. Le handler exige claims.EtablissementID == URLParam("id") pour TOUS
//     les rôles — l'établissement lu doit être celui des claims. L'ADMIN
//     global (sans établissement) passe par le mode assistance (accès
//     APPROUVE par le RESPONSABLE, max 24 h, audit trail) ; son JWT
//     d'assistance porte l'etablissementId et franchit le check.
//  2. La fonction SQL SECURITY DEFINER etablissement_audit_logs
//     (migration 000131) RÉ-IMPOSE les claims (rôle + égalité etab) —
//     même si le handler était bypassé, le SELECT ne retournerait rien.
//     (La policy AuditLog_select 000083 garde son is_admin() pour la
//     console plateforme /api/logs — vue légitime du propriétaire SaaS.)
//
// Le handler délègue à AuthRepository.ListByEtablissement qui appelle la
// fonction cloisonnée avec filtres + pagination (pattern 000124/000130).
package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/repository"
)

// auditLogItem — shape JSON retournée au frontend. Reflète le type AuditLogItem
// du frontend (logs-page.tsx) étendu avec etablissementId + reason
// (SECT-ETABLISSEMENT-AUDIT-1).
type auditLogItem struct {
	ID              string  `json:"id"`
	UserID          *string `json:"userId,omitempty"`
	UserEmail       *string `json:"userEmail,omitempty"`
	Action          string  `json:"action"`
	Entite          string  `json:"entite"`
	EntiteID        *string `json:"entiteId,omitempty"`
	Details         string  `json:"details,omitempty"`
	AdresseIP       string  `json:"adresseIp,omitempty"`
	EtablissementID *string `json:"etablissementId,omitempty"`
	Reason          string  `json:"reason,omitempty"`
	CreatedAt       string  `json:"createdAt"`
}

// listEtablissementAuditLogs — GET /api/etablissements/{id}/audit-logs
//
// Auth : ADMIN, RESPONSABLE (via middleware.RequireRole dans router.go).
// ADR-0010 : l'établissement lu doit être CELUI des claims pour TOUS les
// rôles — le RESPONSABLE ne voit que SON étab ; l'ADMIN global reçoit 403
// et passe par le mode assistance (JWT avec etablissementId, accès APPROUVE
// par le RESPONSABLE, B-2 : pas d'auto-approbation). La fonction SQL
// etablissement_audit_logs (000131) re-vérifie sur les claims (2e couche).
//
// Query params :
//   - action   : filtre exact sur AuditLog.action (ex: "SIGNUP_LINK_REVOKED")
//   - entite   : filtre exact sur AuditLog.entite (ex: "StudentSignupLink")
//   - dateFrom : filtre inclusif "YYYY-MM-DD" ( borne inférieure createdAt)
//   - dateTo   : filtre inclusif "YYYY-MM-DD" (borne supérieure createdAt + 23:59:59)
//   - search   : ILIKE sur action/entite/userEmail/adresseIp/details
//   - page     : 1-based (default 1)
//   - limit    : default 20, max 100
//
// Réponse : { logs: [...], total: N, page: P, limit: L }
func (s *Server) listEtablissementAuditLogs(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	etabID := chi.URLParam(r, "id")
	if etabID == "" {
		writeJSONError(w, http.StatusBadRequest, "id établissement requis")
		return
	}

	// Defense in depth (ADR-0010, pattern ADR-0009) : l'établissement lu
	// doit être CELUI des claims pour TOUS les rôles. L'ADMIN global (sans
	// établissement) est orienté vers le mode assistance — la voie consentie
	// et tracée (accès APPROUVE par le RESPONSABLE, max 24 h, audit trail).
	// La fonction SQL etablissement_audit_logs (migration 000131) re-vérifie
	// sur les claims : même handler bypassé, 0 ligne rendue.
	if claims.EtablissementID != etabID {
		writeJSONError(w, http.StatusForbidden,
			"journal d'audit limité à votre établissement — l'ADMIN global doit activer le mode assistance (accès à faire approuver par le responsable de l'établissement)")
		return
	}

	// ─── Parse query params ───
	q := r.URL.Query()

	// Pagination : page (1-based) + limit (clamp 1..100, default 20).
	page := 1
	if p := q.Get("page"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n > 0 {
			page = n
		}
	}
	limit := 20
	if l := q.Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	offset := (page - 1) * limit

	// Filtre dates : "YYYY-MM-DD" → time.Time (inclusif).
	// dateFrom → 00:00:00 UTC ; dateTo → 23:59:59 UTC (toute la journée).
	var dateFrom, dateTo *time.Time
	if v := q.Get("dateFrom"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			dateFrom = &t
		}
	}
	if v := q.Get("dateTo"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			// Fin de journée (23:59:59.999999) pour inclure tous les
			// events du jour dateTo.
			eod := t.Add(24*time.Hour - time.Nanosecond)
			dateTo = &eod
		}
	}

	filters := repository.AuditLogFilters{
		Action:   q.Get("action"),
		Entite:   q.Get("entite"),
		DateFrom: dateFrom,
		DateTo:   dateTo,
		Search:   q.Get("search"),
		Limit:    limit,
		Offset:   offset,
	}

	entries, total, err := s.authRepo.ListByEtablissement(r.Context(), etabID, filters)
	if err != nil {
		// L'erreur la plus probable est "unauthenticated — claims requis"
		// (si le middleware RequireAuth était bypassé). Les erreurs DB
		// sont rares (Neon stable) → on retourne 500 générique.
		writeJSONError(w, http.StatusInternalServerError, "erreur lors de la récupération des logs")
		return
	}

	// Convertir []*domain.AuditLogEntry → []auditLogItem (JSON-friendly).
	items := make([]auditLogItem, 0, len(entries))
	for _, e := range entries {
		item := auditLogItem{
			ID:              e.ID,
			UserID:          e.UserID,
			UserEmail:       e.UserEmail,
			Action:          e.Action,
			Entite:          e.Entite,
			EntiteID:        e.EntiteID,
			Details:         e.Details,
			AdresseIP:       e.AdresseIP,
			EtablissementID: e.EtablissementID,
			Reason:          e.Reason,
			CreatedAt:       e.CreatedAt.UTC().Format(time.RFC3339),
		}
		items = append(items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"logs":  items,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}
