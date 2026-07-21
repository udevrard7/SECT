// Package http — implémentation des stubs prioritaires (STUBS-FIX-1).
//
// Ces handlers remplacent les stubs qui retournaient [] ou {} par des
// requêtes DB réelles. Pattern : queries directes via appdb.WithTx
// (même approche que statsEnseignant/statsResponsable).
package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// 1. GET /api/logs — AuditLog (601 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) logsListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type logEntry struct {
		ID        string  `json:"id"`
		UserID    *string `json:"userId,omitempty"`
		UserEmail *string `json:"userEmail,omitempty"`
		Action    string  `json:"action"`
		Entite    string  `json:"entite"`
		EntiteID  *string `json:"entiteId,omitempty"`
		Details   *string `json:"details,omitempty"`
		AdresseIP *string `json:"adresseIp,omitempty"`
		CreatedAt string  `json:"createdAt"`
	}

	// LOGS-FIX-L1+L2+L3+L4+L7 : réécriture complète du handler.
	// Avant : seuls search + limit étaient gérés. Les filtres action/entite/
	// dateFrom/dateTo/page étaient ignorés, et total = len(result) au lieu du
	// vrai count. La pagination était absente (pas d'OFFSET).
	search := r.URL.Query().Get("search")
	actionFilter := r.URL.Query().Get("action")
	entiteFilter := r.URL.Query().Get("entite")
	dateFrom := r.URL.Query().Get("dateFrom")
	dateTo := r.URL.Query().Get("dateTo")

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if n, err := parseIntSafe(p); err == nil && n > 0 {
			page = n
		}
	}
	offset := (page - 1) * limit

	// Timestamps inclusifs pour les filtres date.
	var dateFromTs, dateToTs string
	if dateFrom != "" {
		dateFromTs = dateFrom + " 00:00:00"
	}
	if dateTo != "" {
		dateToTs = dateTo + " 23:59:59"
	}

	// Construire la clause WHERE dynamique (partagée par SELECT et COUNT).
	var whereClauses []string
	var args []any
	argIdx := 1

	// L1 : filtre action (égalité exacte).
	if actionFilter != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"action" = $%d`, argIdx))
		args = append(args, actionFilter)
		argIdx++
	}
	// L1 : filtre entite (égalité exacte).
	if entiteFilter != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"entite" = $%d`, argIdx))
		args = append(args, entiteFilter)
		argIdx++
	}
	// L4 : filtre dateFrom.
	if dateFromTs != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"createdAt" >= $%d`, argIdx))
		args = append(args, dateFromTs)
		argIdx++
	}
	// L4 : filtre dateTo.
	if dateToTs != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"createdAt" <= $%d`, argIdx))
		args = append(args, dateToTs)
		argIdx++
	}
	// L7 : search étendu à adresseIp (avant : action/entite/userEmail uniquement).
	// Simple Protocol ne supporte pas les placeholders réutilisés → 4 placeholders distincts.
	if search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(
			`("action" ILIKE $%d OR "entite" ILIKE $%d OR "userEmail" ILIKE $%d OR "adresseIp" ILIKE $%d)`,
			argIdx, argIdx+1, argIdx+2, argIdx+3,
		))
		args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
		argIdx += 4
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	result := []logEntry{}
	var totalCount int

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// L3 : requête COUNT séparée pour le vrai total (pas len(result)).
		countQuery := fmt.Sprintf(`SELECT count(*) FROM "AuditLog" %s`, whereClause)
		_ = tx.QueryRow(r.Context(), countQuery, args...).Scan(&totalCount)

		// L2 : SELECT avec LIMIT + OFFSET (pagination réelle).
		args = append(args, limit, offset)
		query := fmt.Sprintf(`
                        SELECT "id", "userId", "userEmail", "action", "entite", "entiteId",
                               "details", "adresseIp", "createdAt"
                        FROM "AuditLog"
                        %s
                        ORDER BY "createdAt" DESC
                        LIMIT $%d OFFSET $%d
                `, whereClause, argIdx, argIdx+1)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			l := logEntry{}
			var createdAt time.Time
			if err := rows.Scan(&l.ID, &l.UserID, &l.UserEmail, &l.Action, &l.Entite,
				&l.EntiteID, &l.Details, &l.AdresseIP, &createdAt); err != nil {
				return err
			}
			l.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			result = append(result, l)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"logs":  result,
		"total": totalCount,
		"page":  page,
		"limit": limit,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GET /api/ai-providers — AIProviderConfig (5 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) aiProvidersListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	providers, err := s.aiProviderUC.List(r.Context(), claims)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
		return
	}

	result := make([]aiProviderJSON, 0, len(providers))
	for i := range providers {
		result = append(result, providerToJSON(&providers[i], false))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"providers": result,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 3. GET /api/alertes — Alerte (2 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) alertesListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// SURVEILLANCE-FIX-2 S8 : DTO enrichi avec relations imbriquées (filiere,
	// epreuve, user) pour matcher le type AlerteItem côté frontend.
	type alerteRef struct {
		ID  string `json:"id"`
		Nom string `json:"nom,omitempty"`
	}
	type alerteEpreuveRef struct {
		ID    string `json:"id"`
		Titre string `json:"titre,omitempty"`
	}
	type alerteUserRef struct {
		ID    string `json:"id"`
		Name  string `json:"name,omitempty"`
		Email string `json:"email,omitempty"`
	}
	type alerte struct {
		ID          string  `json:"id"`
		Titre       string  `json:"titre"`
		Description string  `json:"description"`
		Severity    string  `json:"severity"`
		Type        string  `json:"type"`
		Lue         bool    `json:"lue"`
		Resolu      bool    `json:"resolu"`
		FiliereID   *string `json:"filiereId,omitempty"`
		EpreuveID   *string `json:"epreuveId,omitempty"`
		UserID      *string `json:"userId,omitempty"`
		CreatedAt   string  `json:"createdAt"`
		// Champs imbriqués (S8) — null si aucune relation.
		Filiere *alerteRef        `json:"filiere"`
		Epreuve *alerteEpreuveRef `json:"epreuve"`
		User    *alerteUserRef    `json:"user"`
	}

	result := []alerte{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		lueParam := r.URL.Query().Get("lue")
		limit := 50
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 200 {
				limit = n
			}
		}

		// N1 FIX (CRITICAL) : defense-in-depth — RBAC scoping explicite.
		// Chaque rôle ne voit que ses alertes personnelles + celles scopées
		// à son périmètre. Empêche la fuite d'alertes d'autres utilisateurs.
		role := claims.Role
		var rbacConds []string
		var args []any
		argIdx := 1

		// Alertes personnelles (toujours visibles par le propriétaire)
		rbacConds = append(rbacConds, fmt.Sprintf(`a."userId" = $%d`, argIdx))
		args = append(args, claims.UserID)
		argIdx++

		// RESPONSABLE : alertes des filières/épreuves de son établissement
		if role == "RESPONSABLE" && claims.EtablissementID != "" {
			rbacConds = append(rbacConds, fmt.Sprintf(`EXISTS (SELECT 1 FROM "Filiere" f WHERE f.id = a."filiereId" AND f."etablissementId" = $%d)`, argIdx))
			args = append(args, claims.EtablissementID)
			argIdx++
			rbacConds = append(rbacConds, fmt.Sprintf(`EXISTS (SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f.id = e."filiereId" WHERE e.id = a."epreuveId" AND f."etablissementId" = $%d)`, argIdx))
			args = append(args, claims.EtablissementID)
			argIdx++
		}

		// ENSEIGNANT : alertes des épreuves qu'il enseigne
		if role == "ENSEIGNANT" {
			rbacConds = append(rbacConds, fmt.Sprintf(`EXISTS (SELECT 1 FROM "Epreuve" e WHERE e.id = a."epreuveId" AND e."enseignantId" = $%d)`, argIdx))
			args = append(args, claims.UserID)
			argIdx++
		}

		// ADMIN : voit TOUTES les alertes (SECT-NOTIF-E2E-VERIFY-1 fix — avant,
		// l'admin ne voyait que les alertes système userId NULL + filiereId NULL
		// + epreuveId NULL. Désormais, l'admin voit toutes les alertes, comme
		// le suggère is_admin() dans la policy RLS Alerte_select).
		if role == "ADMIN" {
			rbacConds = append(rbacConds, `TRUE`)
		}

		// Clause WHERE : (RBAC) AND (filtre lue optionnel)
		whereParts := []string{"(" + strings.Join(rbacConds, " OR ") + ")"}
		if lueParam == "false" {
			whereParts = append(whereParts, `a."lue" = false`)
		} else if lueParam == "true" {
			whereParts = append(whereParts, `a."lue" = true`)
		}
		whereClause := "WHERE " + strings.Join(whereParts, " AND ")

		query := fmt.Sprintf(`
                        SELECT a."id", a."titre", a."description", a."severity"::text, a."type"::text,
                               a."lue", a."resolu", a."filiereId", a."epreuveId", a."userId", a."createdAt",
                               f."id", f."nom",
                               e."id", e."titre",
                               u."id", u."name", u."email"
                        FROM "Alerte" a
                        LEFT JOIN "Filiere" f ON f."id" = a."filiereId"
                        LEFT JOIN "Epreuve" e ON e."id" = a."epreuveId"
                        LEFT JOIN "User" u ON u."id" = a."userId"
                        %s
                        ORDER BY a."createdAt" DESC
                        LIMIT $%d
                `, whereClause, argIdx)
		args = append(args, limit)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			a := alerte{}
			var createdAt time.Time
			var filiereID, filiereNom, epreuveID, epreuveTitre, userID, userName, userEmail *string
			if err := rows.Scan(&a.ID, &a.Titre, &a.Description, &a.Severity, &a.Type,
				&a.Lue, &a.Resolu, &a.FiliereID, &a.EpreuveID, &a.UserID, &createdAt,
				&filiereID, &filiereNom,
				&epreuveID, &epreuveTitre,
				&userID, &userName, &userEmail); err != nil {
				return err
			}
			a.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			if filiereID != nil {
				a.Filiere = &alerteRef{ID: *filiereID, Nom: derefStr(filiereNom)}
			}
			if epreuveID != nil {
				a.Epreuve = &alerteEpreuveRef{ID: *epreuveID, Titre: derefStr(epreuveTitre)}
			}
			if userID != nil {
				a.User = &alerteUserRef{ID: *userID, Name: derefStr(userName), Email: derefStr(userEmail)}
			}
			result = append(result, a)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"alertes": result,
		"total":   len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 4. GET /api/validations-ue — ValidationUE (20 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) validationsUEListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// P2b-CERTIFICATS : DTO enrichi avec uniteEnseignement nested + certificats array.
	// Le frontend mes-certificats-page.tsx (tab "Progression UE") lit
	// v.uniteEnseignement.{code, nom, creditsECTS} et v.certificats[0].id.
	type ueRef struct {
		ID          string `json:"id"`
		Code        string `json:"code"`
		Nom         string `json:"nom"`
		CreditsECTS *int   `json:"creditsECTS,omitempty"`
	}
	type certRef struct {
		ID     string `json:"id"`
		Type   string `json:"type,omitempty"`
		Statut string `json:"statut,omitempty"`
	}
	type validation struct {
		ID                   string   `json:"id"`
		EtudiantID           string   `json:"etudiantId"`
		UniteEnseignementID  string   `json:"uniteEnseignementId"`
		AnneeAcademiqueID    *string  `json:"anneeAcademiqueId,omitempty"`
		Statut               string   `json:"statut"`
		MoyenneUE            float64  `json:"moyenneUE"`
		NoteNormale          *float64 `json:"noteNormale,omitempty"`
		NoteRattrapage       *float64 `json:"noteRattrapage,omitempty"`
		NoteFinale           float64  `json:"noteFinale"`
		NbEpreuvesTotal      int      `json:"nbEpreuvesTotal"`
		NbEpreuvesCompletees int      `json:"nbEpreuvesCompletees"`
		DateValidation       *string  `json:"dateValidation,omitempty"`
		// P2b : relations nested attendues par le frontend
		UniteEnseignement *ueRef    `json:"uniteEnseignement,omitempty"`
		Certificats       []certRef `json:"certificats,omitempty"`
	}

	result := []validation{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		etudiantID := r.URL.Query().Get("etudiantId")
		// For ENSEIGNANT/ETUDIANT, scope to their own validations
		if claims.Role == "ETUDIANT" {
			etudiantID = claims.UserID
		}

		var args []any
		argIdx := 1
		whereClause := ""
		if etudiantID != "" {
			whereClause = fmt.Sprintf(`WHERE v."etudiantId" = $%d`, argIdx)
			args = append(args, etudiantID)
			argIdx++
		}

		// P2b : LEFT JOIN UniteEnseignement pour le nested + LEFT JOIN Certificat
		query := fmt.Sprintf(`
                        SELECT v."id", v."etudiantId", v."uniteEnseignementId", v."anneeAcademiqueId",
                               v."statut"::text, v."moyenneUE", v."noteNormale", v."noteRattrapage",
                               v."noteFinale", v."nbEpreuvesTotal", v."nbEpreuvesCompletees", v."dateValidation",
                               ue."id", ue."code", ue."nom", ue."creditsECTS",
                               c."id", c."type"::text, c."statut"::text
                        FROM "ValidationUE" v
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = v."uniteEnseignementId"
                        LEFT JOIN "Certificat" c ON c."validationUEId" = v."id"
                        %s
                        ORDER BY v."createdAt" DESC
                `, whereClause)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			v := validation{}
			var dateVal *time.Time
			var ueID, ueCode, ueNom *string
			var ueCredits *int
			var certID, certType, certStatut *string
			if err := rows.Scan(&v.ID, &v.EtudiantID, &v.UniteEnseignementID, &v.AnneeAcademiqueID,
				&v.Statut, &v.MoyenneUE, &v.NoteNormale, &v.NoteRattrapage,
				&v.NoteFinale, &v.NbEpreuvesTotal, &v.NbEpreuvesCompletees, &dateVal,
				&ueID, &ueCode, &ueNom, &ueCredits,
				&certID, &certType, &certStatut); err != nil {
				return err
			}
			if dateVal != nil {
				ts := dateVal.UTC().Format(time.RFC3339)
				v.DateValidation = &ts
			}
			// P2b : hydrater uniteEnseignement si le JOIN a matché
			if ueID != nil && ueCode != nil {
				v.UniteEnseignement = &ueRef{
					ID:          *ueID,
					Code:        *ueCode,
					Nom:         derefStr(ueNom),
					CreditsECTS: ueCredits,
				}
			}
			// P2b : hydrater certificats array si le JOIN a matché
			if certID != nil {
				v.Certificats = []certRef{{
					ID:     *certID,
					Type:   derefStr(certType),
					Statut: derefStr(certStatut),
				}}
			} else {
				v.Certificats = []certRef{}
			}
			result = append(result, v)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"validations": result,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 5a. GET /api/abonnements — Abonnement (1 row en DB) + JOIN Etablissement + Plan
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) abonnementsListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type abonnement struct {
		ID                 string  `json:"id"`
		EtablissementID    string  `json:"etablissementId"`
		PlanID             string  `json:"planId"`
		Statut             string  `json:"statut"`
		DateDebut          string  `json:"dateDebut"`
		DateFin            *string `json:"dateFin,omitempty"`
		PeriodeEssaiJours  int     `json:"periodeEssaiJours"`
		ModePaiement       *string `json:"modePaiement,omitempty"`
		ReferencePaiement  *string `json:"referencePaiement,omitempty"`
		MontantPaye        float64 `json:"montantPaye"`
		RenouvellementAuto bool    `json:"renouvellementAuto"`
		Notes              *string `json:"notes,omitempty"`
		// Relations
		Etablissement *struct {
			ID    string  `json:"id"`
			Nom   string  `json:"nom"`
			Type  *string `json:"type,omitempty"`
			Ville *string `json:"ville,omitempty"`
			Actif *bool   `json:"actif,omitempty"`
		} `json:"etablissement,omitempty"`
		Plan *struct {
			ID          string   `json:"id"`
			Nom         string   `json:"nom"`
			Type        string   `json:"type,omitempty"`
			PrixMensuel float64  `json:"prixMensuel"`
			PrixAnnuel  *float64 `json:"prixAnnuel,omitempty"`
		} `json:"plan,omitempty"`
	}

	result := []abonnement{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `
                        SELECT a."id", a."etablissementId", a."planId", a."statut"::text,
                               a."dateDebut", a."dateFin", a."periodeEssaiJours", a."modePaiement",
                               a."referencePaiement", a."montantPaye", a."renouvellementAuto", a."notes",
                               e."id", e."nom", e."type"::text, e."ville", e."actif",
                               p."id", p."nom", p."type"::text, p."prixMensuel", p."prixAnnuel"
                        FROM "Abonnement" a
                        LEFT JOIN "Etablissement" e ON e."id" = a."etablissementId"
                        LEFT JOIN "Plan" p ON p."id" = a."planId"
                        WHERE a."deletedAt" IS NULL
                        ORDER BY a."createdAt" DESC
                `)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			a := abonnement{}
			var dateDebut time.Time
			var dateFin *time.Time
			var etabID, etabNom, etabType, etabVille *string
			var etabActif *bool
			var planID, planNom, planType *string
			var planPrix *float64
			var planAnnuel *float64
			if err := rows.Scan(&a.ID, &a.EtablissementID, &a.PlanID, &a.Statut,
				&dateDebut, &dateFin, &a.PeriodeEssaiJours, &a.ModePaiement,
				&a.ReferencePaiement, &a.MontantPaye, &a.RenouvellementAuto, &a.Notes,
				&etabID, &etabNom, &etabType, &etabVille, &etabActif,
				&planID, &planNom, &planType, &planPrix, &planAnnuel); err != nil {
				return err
			}
			a.DateDebut = dateDebut.UTC().Format(time.RFC3339)
			if dateFin != nil {
				ts := dateFin.UTC().Format(time.RFC3339)
				a.DateFin = &ts
			}
			if etabID != nil && etabNom != nil {
				a.Etablissement = &struct {
					ID    string  `json:"id"`
					Nom   string  `json:"nom"`
					Type  *string `json:"type,omitempty"`
					Ville *string `json:"ville,omitempty"`
					Actif *bool   `json:"actif,omitempty"`
				}{ID: *etabID, Nom: *etabNom, Type: etabType, Ville: etabVille, Actif: etabActif}
			}
			if planID != nil && planNom != nil && planPrix != nil {
				planTypeStr := ""
				if planType != nil {
					planTypeStr = *planType
				}
				a.Plan = &struct {
					ID          string   `json:"id"`
					Nom         string   `json:"nom"`
					Type        string   `json:"type,omitempty"`
					PrixMensuel float64  `json:"prixMensuel"`
					PrixAnnuel  *float64 `json:"prixAnnuel,omitempty"`
				}{ID: *planID, Nom: *planNom, Type: planTypeStr, PrixMensuel: *planPrix, PrixAnnuel: planAnnuel}
			}
			result = append(result, a)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"abonnements": result,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 5b. GET /api/plans — Plan (4 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) plansListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// SECT-ABONNEMENTS-B2B-B2C : filtre optionnel par branche (B2C | B2B).
	// Si absent, tous les plans (actifs ET inactifs pour l'admin).
	brancheFilter := r.URL.Query().Get("branche")

	type plan struct {
		ID                  string   `json:"id"`
		Nom                 string   `json:"nom"`
		Type                string   `json:"type"`
		PrixMensuel         float64  `json:"prixMensuel"`
		PrixAnnuel          *float64 `json:"prixAnnuel,omitempty"`
		NbEtablissementsMax int      `json:"nbEtablissementsMax"`
		NbFilieresMax       int      `json:"nbFilieresMax"`
		NbEnseignantsMax    int      `json:"nbEnseignantsMax"`
		NbEtudiantsMax      int      `json:"nbEtudiantsMax"`
		NbQuestionsMax      int      `json:"nbQuestionsMax"`
		NbEvaluationsMois   int      `json:"nbEvaluationsMois"`
		IaGeneration        bool     `json:"iaGeneration"`
		IaCorrection        bool     `json:"iaCorrection"`
		Proctoring          bool     `json:"proctoring"`
		ExportPDF           bool     `json:"exportPDF"`
		Support             string   `json:"support"`
		Description         *string  `json:"description,omitempty"`
		Actif               bool     `json:"actif"`
		// SECT-ABONNEMENTS-B2B-B2C : nouveaux champs pour la restructuration.
		Branche           *string `json:"branche,omitempty"`           // B2C | B2B
		PrixParEtudiant   bool    `json:"prixParEtudiant"`             // modèle capitation (B2B)
		QuotaIAGeneration *int    `json:"quotaIAGeneration,omitempty"` // null = illimité
		QuotaIACorrection *int    `json:"quotaIACorrection,omitempty"` // null = illimité
		ClasseesMax       *int    `json:"classeesMax,omitempty"`       // B2C : nb classes, null = illimité
		Popular           bool    `json:"popular"`                     // badge "Populaire"
		// ABONNEMENTS-FIX-A7 : _count.abonnements (style Prisma) attendu par le frontend.
		Count *struct {
			Abonnements int `json:"abonnements"`
		} `json:"_count,omitempty"`
	}

	// Construction de la requête avec filtre optionnel.
	query := `
                SELECT "id", "nom", "type"::text, "prixMensuel", "prixAnnuel",
                       "nbEtablissementsMax", "nbFilieresMax", "nbEnseignantsMax",
                       "nbEtudiantsMax", "nbQuestionsMax", "nbEvaluationsMois",
                       "iaGeneration", "iaCorrection", "proctoring", "exportPDF",
                       "support", "description", "actif",
                       "branche", "prixParEtudiant", "quotaIAGeneration", "quotaIACorrection",
                       "classeesMax", "popular",
                       (SELECT count(*) FROM "Abonnement" a WHERE a."planId" = "Plan"."id" AND a."deletedAt" IS NULL) AS count_abonnements
                FROM "Plan"
        `
	var args []any
	if brancheFilter == "B2C" || brancheFilter == "B2B" {
		query += ` WHERE "branche" = $1 AND "actif" = true`
		args = append(args, brancheFilter)
	} else {
		// Sans filtre : tous les plans actifs d'abord, puis inactifs (legacy).
		query += ` ORDER BY "actif" DESC, "branche" NULLS LAST, "prixMensuel" ASC`
	}
	if brancheFilter == "B2C" || brancheFilter == "B2B" {
		query += ` ORDER BY "prixMensuel" ASC`
	}

	result := []plan{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			p := plan{}
			var nbAbo int
			if err := rows.Scan(&p.ID, &p.Nom, &p.Type, &p.PrixMensuel, &p.PrixAnnuel,
				&p.NbEtablissementsMax, &p.NbFilieresMax, &p.NbEnseignantsMax,
				&p.NbEtudiantsMax, &p.NbQuestionsMax, &p.NbEvaluationsMois,
				&p.IaGeneration, &p.IaCorrection, &p.Proctoring, &p.ExportPDF,
				&p.Support, &p.Description, &p.Actif,
				&p.Branche, &p.PrixParEtudiant, &p.QuotaIAGeneration, &p.QuotaIACorrection,
				&p.ClasseesMax, &p.Popular, &nbAbo); err != nil {
				return err
			}
			p.Count = &struct {
				Abonnements int `json:"abonnements"`
			}{Abonnements: nbAbo}
			result = append(result, p)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"plans": result,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 6. GET /api/notifications/admin — NotificationAdmin (1 row en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) notificationsAdminReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type notif struct {
		ID               string  `json:"id"`
		Type             string  `json:"type"`
		Titre            string  `json:"titre"`
		Message          string  `json:"message"`
		DestinataireID   *string `json:"destinataireId,omitempty"`
		DestinataireRole *string `json:"destinataireRole,omitempty"`
		Lu               bool    `json:"lu"`
		ActionURL        *string `json:"actionUrl,omitempty"`
		ActionLabel      *string `json:"actionLabel,omitempty"`
		Priorite         string  `json:"priorite"`
		Categorie        string  `json:"categorie"`
		Icone            *string `json:"icone,omitempty"`
		ExpireLe         *string `json:"expireLe,omitempty"`
		CreatedAt        string  `json:"createdAt"`
	}

	// NOTIFICATIONS-FIX-N4 : filtres type/destinataireRole/categorie + lu.
	luParam := r.URL.Query().Get("lu")
	typeF := r.URL.Query().Get("type")
	roleF := r.URL.Query().Get("destinataireRole")
	categorieF := r.URL.Query().Get("categorie")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	// Construire la clause WHERE dynamique.
	var whereClauses []string
	var args []any
	argIdx := 1

	if luParam == "false" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"lu" = $%d`, argIdx))
		args = append(args, false)
		argIdx++
	} else if luParam == "true" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"lu" = $%d`, argIdx))
		args = append(args, true)
		argIdx++
	}
	if typeF != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"type" = $%d`, argIdx))
		args = append(args, typeF)
		argIdx++
	}
	if roleF != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"destinataireRole" = $%d`, argIdx))
		args = append(args, roleF)
		argIdx++
	}
	if categorieF != "" {
		whereClauses = append(whereClauses, fmt.Sprintf(`"categorie" = $%d`, argIdx))
		args = append(args, categorieF)
		argIdx++
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	result := []notif{}
	var totalCount, unreadCount int

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// NOTIFICATIONS-FIX-N5 : count total + count unread (sans filtres lu/type/etc).
		_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "NotificationAdmin"`).Scan(&totalCount)
		_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "NotificationAdmin" WHERE "lu" = false`).Scan(&unreadCount)

		args = append(args, limit)
		query := fmt.Sprintf(`
                        SELECT "id", "type", "titre", "message", "destinataireId", "destinataireRole",
                               "lu", "actionUrl", "actionLabel", "priorite", "categorie", "icone",
                               "expireLe", "createdAt"
                        FROM "NotificationAdmin"
                        %s
                        ORDER BY "createdAt" DESC
                        LIMIT $%d
                `, whereClause, argIdx)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			n := notif{}
			var createdAt time.Time
			var expireLe *time.Time
			if err := rows.Scan(&n.ID, &n.Type, &n.Titre, &n.Message, &n.DestinataireID,
				&n.DestinataireRole, &n.Lu, &n.ActionURL, &n.ActionLabel,
				&n.Priorite, &n.Categorie, &n.Icone, &expireLe, &createdAt); err != nil {
				return err
			}
			n.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			if expireLe != nil {
				ts := expireLe.UTC().Format(time.RFC3339)
				n.ExpireLe = &ts
			}
			result = append(result, n)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"notifications": result,
		"total":         totalCount,
		"unreadCount":   unreadCount,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 7. GET /api/platform-settings — PlatformSettings (1 row en DB)
// ──────────────────────────────────────────────────────────────────────────

// platformSettingsReal — GET /api/platform-settings
// CONFIGURATION-FIX-C1 : avant, ORDER BY updatedAt DESC LIMIT 1 récupérait la
// ligne la plus récente = "ai_failover_config" (config de failover IA) au lieu
// de "default" (config plateforme). Fix : WHERE id = 'default'.
func (s *Server) platformSettingsReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var settingsJSON *string
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `SELECT "settings" FROM "PlatformSettings" WHERE "id" = 'default'`).Scan(&settingsJSON)
	})

	settings := map[string]any{}
	if settingsJSON != nil {
		_ = json.Unmarshal([]byte(*settingsJSON), &settings)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"settings": settings,
	})
}

// updatePlatformSettings — POST /api/platform-settings
// CONFIGURATION-FIX-C2+C5 : avant, la route POST n'existait pas → sauvegarde
// impossible (405). Implémente un upsert avec MERGE : SELECT les settings
// existants, fusionne les nouveaux champs (écrase seulement les clés fournies),
// puis UPDATE la ligne "default".
func (s *Server) updatePlatformSettings(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input map[string]any
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	merged := map[string]any{}
	success := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. SELECT les settings existants (merge base).
		var existingJSON string
		_ = tx.QueryRow(r.Context(), `SELECT "settings" FROM "PlatformSettings" WHERE "id" = 'default'`).Scan(&existingJSON)
		if existingJSON != "" {
			_ = json.Unmarshal([]byte(existingJSON), &merged)
		}

		// 2. MERGE : écraser seulement les clés fournies (C5).
		for k, v := range input {
			merged[k] = v
		}

		// 3. Sérialiser le merged JSON.
		mergedBytes, err := json.Marshal(merged)
		if err != nil {
			return fmt.Errorf("marshal settings: %w", err)
		}

		// 4. UPSERT : UPDATE si existe, INSERT sinon.
		_, err = tx.Exec(r.Context(), `
                        INSERT INTO "PlatformSettings" ("id", "settings", "updatedAt")
                        VALUES ('default', $1, now())
                        ON CONFLICT ("id") DO UPDATE SET "settings" = $1, "updatedAt" = now()
                `, string(mergedBytes))
		if err != nil {
			return fmt.Errorf("upsert settings: %w", err)
		}
		success = true
		return nil
	})

	if !success {
		writeJSONError(w, http.StatusInternalServerError, "erreur lors de la sauvegarde")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"settings": merged,
		"message":  "Configuration sauvegardée",
	})
}

// ──────────────────────────────────────────────────────────────────────────
// Helper: parseIntSafe
// ──────────────────────────────────────────────────────────────────────────

func parseIntSafe(s string) (int, error) {
	var n int
	_, err := fmt.Sscanf(s, "%d", &n)
	return n, err
}

// ──────────────────────────────────────────────────────────────────────────
// Helper: derefStr — défini dans affectation_handlers.go (réutilisé).
// ──────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/alertes/{id} — marquer lue / résoudre une alerte
//
// SURVEILLANCE-FIX-2 S7 : route manquante implémentée.
// Body : { action: 'marquer_lue' | 'resoudre' }
//   - 'marquer_lue' → UPDATE lue=true
//   - 'resoudre'    → UPDATE resolu=true (et lue=true aussi)
// Retourne l'alerte mise à jour (avec relations imbriquées).
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) alerteUpdate(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	alerteID := chi.URLParam(r, "id")
	if alerteID == "" {
		writeJSONError(w, http.StatusBadRequest, "alerte id required")
		return
	}

	var body struct {
		Action string `json:"action"`
		Lue    *bool  `json:"lue,omitempty"`
		Resolu *bool  `json:"resolu,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid body")
		return
	}

	// Déterminer les champs à updater selon action ou flags explicites.
	setLue := body.Lue
	setResolu := body.Resolu
	switch body.Action {
	case "marquer_lue":
		t := true
		setLue = &t
	case "resoudre":
		t := true
		setLue = &t
		setResolu = &t
	case "":
		// ok — on utilise les flags explicites lue/resolu
	default:
		writeJSONError(w, http.StatusBadRequest, "action invalide (attendu: marquer_lue | resoudre)")
		return
	}

	type alerteRef struct {
		ID  string `json:"id"`
		Nom string `json:"nom,omitempty"`
	}
	type alerteEpreuveRef struct {
		ID    string `json:"id"`
		Titre string `json:"titre,omitempty"`
	}
	type alerteUserRef struct {
		ID    string `json:"id"`
		Name  string `json:"name,omitempty"`
		Email string `json:"email,omitempty"`
	}
	type alerte struct {
		ID          string            `json:"id"`
		Titre       string            `json:"titre"`
		Description string            `json:"description"`
		Severity    string            `json:"severity"`
		Type        string            `json:"type"`
		Lue         bool              `json:"lue"`
		Resolu      bool              `json:"resolu"`
		FiliereID   *string           `json:"filiereId,omitempty"`
		EpreuveID   *string           `json:"epreuveId,omitempty"`
		UserID      *string           `json:"userId,omitempty"`
		CreatedAt   string            `json:"createdAt"`
		Filiere     *alerteRef        `json:"filiere"`
		Epreuve     *alerteEpreuveRef `json:"epreuve"`
		User        *alerteUserRef    `json:"user"`
	}

	var updated alerte
	txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		var sets []string
		var args []any
		argIdx := 1
		if setLue != nil {
			sets = append(sets, fmt.Sprintf(`"lue" = $%d`, argIdx))
			args = append(args, *setLue)
			argIdx++
		}
		if setResolu != nil {
			sets = append(sets, fmt.Sprintf(`"resolu" = $%d`, argIdx))
			args = append(args, *setResolu)
			argIdx++
			// SECT-ALERTES-FIX-1 P4 : resolvedAt + resolvedById quand resolu=true
			if *setResolu {
				sets = append(sets, `"resolvedAt" = NOW()`)
				sets = append(sets, fmt.Sprintf(`"resolvedById" = $%d`, argIdx))
				args = append(args, claims.UserID)
				argIdx++
			} else {
				sets = append(sets, `"resolvedAt" = NULL`, `"resolvedById" = NULL`)
			}
		}
		if len(sets) == 0 {
			return &domain.ValidationError{Field: "action", Message: "aucune action à effectuer"}
		}

		args = append(args, alerteID)

		query := fmt.Sprintf(`
                        UPDATE "Alerte" SET %s WHERE "id" = $%d
                        RETURNING "id", "titre", "description", "severity"::text, "type"::text",
                                  "lue", "resolu", "filiereId", "epreuveId", "userId", "createdAt",
                                  (SELECT "id" FROM "Filiere" WHERE "id" = "Alerte"."filiereId"),
                                  (SELECT "nom" FROM "Filiere" WHERE "id" = "Alerte"."filiereId"),
                                  (SELECT "id" FROM "Epreuve" WHERE "id" = "Alerte"."epreuveId"),
                                  (SELECT "titre" FROM "Epreuve" WHERE "id" = "Alerte"."epreuveId"),
                                  (SELECT "id" FROM "User" WHERE "id" = "Alerte"."userId"),
                                  (SELECT "name" FROM "User" WHERE "id" = "Alerte"."userId"),
                                  (SELECT "email" FROM "User" WHERE "id" = "Alerte"."userId")
                `, strings.Join(sets, ", "), argIdx)

		var createdAt time.Time
		var filiereID, filiereNom, epreuveID, epreuveTitre, userID, userName, userEmail *string
		err := tx.QueryRow(r.Context(), query, args...).Scan(
			&updated.ID, &updated.Titre, &updated.Description, &updated.Severity, &updated.Type,
			&updated.Lue, &updated.Resolu, &updated.FiliereID, &updated.EpreuveID, &updated.UserID, &createdAt,
			&filiereID, &filiereNom,
			&epreuveID, &epreuveTitre,
			&userID, &userName, &userEmail,
		)
		if err != nil {
			return fmt.Errorf("update alerte: %w", err)
		}
		updated.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		if filiereID != nil {
			updated.Filiere = &alerteRef{ID: *filiereID, Nom: derefStr(filiereNom)}
		}
		if epreuveID != nil {
			updated.Epreuve = &alerteEpreuveRef{ID: *epreuveID, Titre: derefStr(epreuveTitre)}
		}
		if userID != nil {
			updated.User = &alerteUserRef{ID: *userID, Name: derefStr(userName), Email: derefStr(userEmail)}
		}
		return nil
	})

	if txErr != nil {
		middleware.MapDomainError(w, txErr)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"alerte":  updated,
		"message": "Alerte mise à jour",
	})
}
