// Package http — implémentation des stubs cachés restants (STUBS-FIX-3).
package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// 1. GET /api/notifications — notifications utilisateur (Alerte filtrée par user)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) notificationsListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type notif struct {
		ID          string  `json:"id"`
		Titre       string  `json:"titre"`
		Description string  `json:"description"`
		Severity    string  `json:"severity"`
		Type        string  `json:"type"`
		Lue         bool    `json:"lue"`
		CreatedAt   string  `json:"createdAt"`
	}

	result := []notif{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		limit := 50
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 200 {
				limit = n
			}
		}
		lueParam := r.URL.Query().Get("lue")

		var args []any
		argIdx := 1
		whereClause := fmt.Sprintf(`WHERE "userId" = $%d`, argIdx)
		args = append(args, claims.UserID)
		argIdx++
		if lueParam == "false" {
			whereClause += fmt.Sprintf(` AND "lue" = false`)
		}

		query := fmt.Sprintf(`
			SELECT "id", "titre", "description", "severity"::text, "type"::text,
			       "lue", "createdAt"
			FROM "Alerte"
			%s
			ORDER BY "createdAt" DESC
			LIMIT $%d
		`, whereClause, argIdx)
		args = append(args, limit)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			n := notif{}
			var createdAt time.Time
			if err := rows.Scan(&n.ID, &n.Titre, &n.Description, &n.Severity, &n.Type,
				&n.Lue, &createdAt); err == nil {
				n.CreatedAt = createdAt.UTC().Format(time.RFC3339)
				result = append(result, n)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"notifications": result,
		"total":         len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GET /api/enseignant/context — filieres + niveaux + etudiants de l'enseignant
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) enseignantEtudiantsReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	enseignantID := r.URL.Query().Get("enseignantId")
	if enseignantID == "" {
		enseignantID = claims.UserID
	}

	type etudiant struct {
		ID        string  `json:"id"`
		Name      string  `json:"name"`
		Email     string  `json:"email"`
		Matricule *string `json:"matricule,omitempty"`
		Niveau    *string `json:"niveau,omitempty"`
		FiliereID *string `json:"filiereId,omitempty"`
		Filiere   *struct {
			ID  string `json:"id"`
			Nom string `json:"nom"`
		} `json:"filiere,omitempty"`
	}

	result := []etudiant{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		search := r.URL.Query().Get("search")
		limit := 100
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 500 {
				limit = n
			}
		}

		var args []any
		argIdx := 1
		args = append(args, enseignantID)
		argIdx++

		searchClause := ""
		if search != "" {
			searchClause = fmt.Sprintf(` AND (u."name" ILIKE $%d OR u."email" ILIKE $%d)`, argIdx, argIdx)
			args = append(args, "%"+search+"%")
			argIdx++
		}

		query := fmt.Sprintf(`
			SELECT DISTINCT u."id", u."name", u."email", u."matricule", u."niveau",
			       u."filiereId", f."id", f."nom"
			FROM "User" u
			JOIN "EnseignantFiliere" ef ON ef."filiereId" = u."filiereId"
			LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
			WHERE ef."enseignantId" = $1 AND u."role" = 'ETUDIANT' AND u."actif" = true
			%s
			ORDER BY u."name"
			LIMIT $%d
		`, searchClause, argIdx)
		args = append(args, limit)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			e := etudiant{}
			var filID, filNom *string
			if err := rows.Scan(&e.ID, &e.Name, &e.Email, &e.Matricule, &e.Niveau,
				&e.FiliereID, &filID, &filNom); err == nil {
				if filID != nil && filNom != nil {
					e.Filiere = &struct {
						ID  string `json:"id"`
						Nom string `json:"nom"`
					}{ID: *filID, Nom: *filNom}
				}
				result = append(result, e)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"etudiants": result,
		"total":     len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 4. GET /api/resultats/overview — agregations pour page Résultats
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) resultatsOverviewReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	enseignantID := r.URL.Query().Get("enseignantId")
	if enseignantID == "" && claims.Role == "ENSEIGNANT" {
		enseignantID = claims.UserID
	}

	type overviewEpreuve struct {
		ID            string   `json:"id"`
		Titre         string   `json:"titre"`
		NbParticipants int     `json:"nbParticipants"`
		Moyenne       *float64 `json:"moyenne,omitempty"`
		TauxReussite  float64  `json:"tauxReussite"`
		DateCloture   *string  `json:"dateCloture,omitempty"`
	}
	type overviewEvolution struct {
		Mois          string  `json:"mois"`
		Moyenne       float64 `json:"moyenne"`
		NbEvaluations int     `json:"nbEvaluations"`
	}
	type studentAtRisk struct {
		ID       string  `json:"id"`
		Name     string  `json:"name"`
		Email    string  `json:"email"`
		Moyenne  float64 `json:"moyenne"`
		Filiere  string  `json:"filiere"`
	}
	type topQuestion struct {
		ID            string  `json:"id"`
		Intitule      string  `json:"intitule"`
		TauxReussite  float64 `json:"tauxReussite"`
		NbReponses    int     `json:"nbReponses"`
	}

	epreuves := []overviewEpreuve{}
	evolution := []overviewEvolution{}
	studentsAtRisk := []studentAtRisk{}
	topQuestions := []topQuestion{}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. Épreuves avec stats
		var args []any
		argIdx := 1
		whereE := ""
		if enseignantID != "" {
			whereE = fmt.Sprintf(`WHERE e."enseignantId" = $%d AND e."deletedAt" IS NULL`, argIdx)
			args = append(args, enseignantID)
			argIdx++
		} else {
			whereE = `WHERE e."deletedAt" IS NULL`
		}

		rows, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT e."id", e."titre",
			       (SELECT count(*) FROM "SessionPassation" s WHERE s."epreuveId" = e."id") AS nb_part,
			       (SELECT AVG(s2.score) FROM "SessionPassation" s2
				WHERE s2."epreuveId" = e."id" AND s2.statut IN ('CORRIGEE','RETOURNEE') AND s2.score IS NOT NULL) AS moy,
			       CASE WHEN count(s3.id) > 0
				    THEN (count(s3.id) FILTER (WHERE s3.score >= e."noteTotal" * 0.5))::float / count(s3.id) * 100
				    ELSE 0 END AS taux,
			       e."clotureeAt"
			FROM "Epreuve" e
			LEFT JOIN "SessionPassation" s3 ON s3."epreuveId" = e."id"
			  AND s3.statut IN ('CORRIGEE','RETOURNEE') AND s3.score IS NOT NULL
			%s
			GROUP BY e."id", e."titre", e."noteTotal", e."clotureeAt"
			ORDER BY e."createdAt" DESC
			LIMIT 20
		`, whereE), args...)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				ep := overviewEpreuve{}
				var moy *float64
				var clotureeAt *time.Time
				if err := rows.Scan(&ep.ID, &ep.Titre, &ep.NbParticipants, &moy, &ep.TauxReussite, &clotureeAt); err == nil {
					ep.Moyenne = moy
					if clotureeAt != nil {
						ts := clotureeAt.UTC().Format(time.RFC3339)
						ep.DateCloture = &ts
					}
					epreuves = append(epreuves, ep)
				}
			}
		}

		// 2. Évolution mensuelle (6 derniers mois)
		whereE2 := ""
		args2 := []any{}
		if enseignantID != "" {
			whereE2 = fmt.Sprintf(`AND e."enseignantId" = $1`)
			args2 = append(args2, enseignantID)
		}
		rows2, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT to_char(date_trunc('month', s."updatedAt"), 'YYYY-MM') AS mois,
			       COALESCE(AVG(s.score), 0) AS moyenne,
			       count(*) AS nb_eval
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE s.statut IN ('CORRIGEE','RETOURNEE') AND s.score IS NOT NULL
			  AND s."updatedAt" > now() - interval '6 months'
			  %s
			GROUP BY mois ORDER BY mois ASC
		`, whereE2), args2...)
		if err == nil {
			defer rows2.Close()
			for rows2.Next() {
				ev := overviewEvolution{}
				if err := rows2.Scan(&ev.Mois, &ev.Moyenne, &ev.NbEvaluations); err == nil {
					evolution = append(evolution, ev)
				}
			}
		}

		// 3. Étudiants en difficulté (moyenne < 8/20)
		rows3, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT u."id", u."name", u."email", COALESCE(AVG(s.score), 0) AS moy,
			       COALESCE(f."nom", '—') AS filiere
			FROM "User" u
			JOIN "SessionPassation" s ON s."etudiantId" = u."id"
			  AND s.statut IN ('CORRIGEE','RETOURNEE') AND s.score IS NOT NULL
			LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE u."role" = 'ETUDIANT' %s
			GROUP BY u."id", u."name", u."email", f."nom"
			HAVING AVG(s.score) < 8
			ORDER BY moy ASC LIMIT 10
		`, whereE2), args2...)
		if err == nil {
			defer rows3.Close()
			for rows3.Next() {
				sr := studentAtRisk{}
				if err := rows3.Scan(&sr.ID, &sr.Name, &sr.Email, &sr.Moyenne, &sr.Filiere); err == nil {
					studentsAtRisk = append(studentsAtRisk, sr)
				}
			}
		}

		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"epreuves":       epreuves,
		"evolution":      evolution,
		"studentsAtRisk": studentsAtRisk,
		"topQuestions":   topQuestions,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 5. GET /api/resultats/etudiant-overview — vue étudiant de ses résultats
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) resultatsEtudiantOverviewReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	etudiantID := r.URL.Query().Get("etudiantId")
	if etudiantID == "" {
		etudiantID = claims.UserID
	}

	type evolPoint struct {
		Mois          string  `json:"mois"`
		Moyenne       float64 `json:"moyenne"`
		NbEvaluations int     `json:"nbEvaluations"`
	}
	type perfByType struct {
		Type         string  `json:"type"`
		Moyenne      float64 `json:"moyenne"`
		NbReponses   int     `json:"nbReponses"`
	}
	type distBin struct {
		Label string `json:"label"`
		Count int    `json:"count"`
	}
	type recentResult struct {
		EpreuveTitre string   `json:"epreuveTitre"`
		Score        *float64 `json:"score,omitempty"`
		Statut       string   `json:"statut"`
		Date         string   `json:"date"`
	}

	evolution := []evolPoint{}
	performanceParType := []perfByType{}
	distribution := []distBin{}
	recentResults := []recentResult{}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. Évolution mensuelle
		rows, err := tx.Query(r.Context(), `
			SELECT to_char(date_trunc('month', s."updatedAt"), 'YYYY-MM') AS mois,
			       COALESCE(AVG(s.score), 0), count(*)
			FROM "SessionPassation" s
			WHERE s."etudiantId" = $1 AND s.statut IN ('CORRIGEE','RETOURNEE') AND s.score IS NOT NULL
			  AND s."updatedAt" > now() - interval '6 months'
			GROUP BY mois ORDER BY mois ASC
		`, etudiantID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				ev := evolPoint{}
				if err := rows.Scan(&ev.Mois, &ev.Moyenne, &ev.NbEvaluations); err == nil {
					evolution = append(evolution, ev)
				}
			}
		}

		// 2. Résultats récents
		rows2, err := tx.Query(r.Context(), `
			SELECT e."titre", s."score", s."statut"::text, s."updatedAt"
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE s."etudiantId" = $1 AND s.statut IN ('CORRIGEE','RETOURNEE')
			ORDER BY s."updatedAt" DESC LIMIT 10
		`, etudiantID)
		if err == nil {
			defer rows2.Close()
			for rows2.Next() {
				rr := recentResult{}
				var updatedAt time.Time
				if err := rows2.Scan(&rr.EpreuveTitre, &rr.Score, &rr.Statut, &updatedAt); err == nil {
					rr.Date = updatedAt.UTC().Format(time.RFC3339)
					recentResults = append(recentResults, rr)
				}
			}
		}

		// 3. Distribution des notes
		rows3, err := tx.Query(r.Context(), `
			SELECT CASE
				WHEN s.score / e."noteTotal" * 20 < 8 THEN '< 8'
				WHEN s.score / e."noteTotal" * 20 < 10 THEN '8-10'
				WHEN s.score / e."noteTotal" * 20 < 12 THEN '10-12'
				WHEN s.score / e."noteTotal" * 20 < 14 THEN '12-14'
				WHEN s.score / e."noteTotal" * 20 < 16 THEN '14-16'
				ELSE '16-20'
			END AS bucket, count(*) AS nb
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE s."etudiantId" = $1 AND s.statut IN ('CORRIGEE','RETOURNEE') AND s.score IS NOT NULL
			GROUP BY bucket ORDER BY bucket
		`, etudiantID)
		if err == nil {
			defer rows3.Close()
			dist := []distBin{
				{Label: "< 8", Count: 0}, {Label: "8-10", Count: 0},
				{Label: "10-12", Count: 0}, {Label: "12-14", Count: 0},
				{Label: "14-16", Count: 0}, {Label: "16-20", Count: 0},
			}
			for rows3.Next() {
				var b string
				var n int
				if err := rows3.Scan(&b, &n); err == nil {
					for i := range dist {
						if dist[i].Label == b {
							dist[i].Count = n
						}
					}
				}
			}
			distribution = dist
		}

		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"evolution":          evolution,
		"performanceParType": performanceParType,
		"distribution":       distribution,
		"recentResults":      recentResults,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GET /api/enseignant/context — filieres (avec niveaux[] + UEs) + etudiants
// ──────────────────────────────────────────────────────────────────────────
//
// BUGFIX (EPREUVES-FIX-1) : format adapté pour matcher EnseignantFiliereContext
// attendu par generation-ia-page.tsx et epreuves-page.tsx :
// - filieres[].niveaux: string[] (array, pas string)
// - filieres[].unitesEnseignement: array avec code, nom, niveau, niveaux, typeSeances
// - etudiants: array avec id, name, email, matricule, niveau

func (s *Server) enseignantContextReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	enseignantID := r.URL.Query().Get("enseignantId")
	if enseignantID == "" {
		enseignantID = claims.UserID
	}

	type ueCtx struct {
		ID           string   `json:"id"`
		Code         string   `json:"code"`
		Nom          string   `json:"nom"`
		Niveau       string   `json:"niveau"`
		Niveaux      *string  `json:"niveaux"`
		TypeSeances  []string `json:"typeSeances"`
	}
	type filiereCtx struct {
		ID                  string  `json:"id"`
		Nom                 string  `json:"nom"`
		Code                string  `json:"code"`
		Niveaux             []string `json:"niveaux"`
		UnitesEnseignement  []ueCtx `json:"unitesEnseignement"`
	}
	type etudiantCtx struct {
		ID        string  `json:"id"`
		Name      string  `json:"name"`
		Email     string  `json:"email"`
		Matricule *string `json:"matricule,omitempty"`
		Niveau    *string `json:"niveau,omitempty"`
	}

	filieres := []filiereCtx{}
	etudiants := []etudiantCtx{}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. Filières de l'enseignant avec niveaux
		rows, err := tx.Query(r.Context(), `
			SELECT f."id", f."nom", f."code", ef."niveau"
			FROM "EnseignantFiliere" ef
			JOIN "Filiere" f ON f."id" = ef."filiereId"
			WHERE ef."enseignantId" = $1
			ORDER BY f."nom"
		`, enseignantID)
		if err == nil {
			defer rows.Close()
			filiereMap := map[string]*filiereCtx{}
			var filiereOrder []string
			for rows.Next() {
				var fID, fNom, fCode, niveau string
				if err := rows.Scan(&fID, &fNom, &fCode, &niveau); err == nil {
					if _, exists := filiereMap[fID]; !exists {
						f := filiereCtx{
							ID: fID, Nom: fNom, Code: fCode,
							Niveaux:             []string{},
							UnitesEnseignement:  []ueCtx{},
						}
						filiereMap[fID] = &f
						filiereOrder = append(filiereOrder, fID)
					}
					if niveau != "" {
						found := false
						for _, n := range filiereMap[fID].Niveaux {
							if n == niveau {
								found = true
								break
							}
						}
						if !found {
							filiereMap[fID].Niveaux = append(filiereMap[fID].Niveaux, niveau)
						}
					}
				}
			}
			for _, fID := range filiereOrder {
				filieres = append(filieres, *filiereMap[fID])
			}
		}

		// 2. UEs pour chaque filière de l'enseignant
		if len(filieres) > 0 {
			filiereIDs := make([]string, len(filieres))
			for i, f := range filieres {
				filiereIDs[i] = f.ID
			}
			ueRows, err := tx.Query(r.Context(), `
				SELECT ue."id", ue."code", ue."nom", ue."niveau", ue."niveaux", ue."filiereId"
				FROM "UniteEnseignement" ue
				WHERE ue."filiereId" = ANY($1) AND ue."actif" = true
				ORDER BY ue."nom"
			`, filiereIDs)
			if err == nil {
				defer ueRows.Close()
				for ueRows.Next() {
					ue := ueCtx{TypeSeances: []string{"CM", "TD", "TP"}}
					var filiereID string
					if err := ueRows.Scan(&ue.ID, &ue.Code, &ue.Nom, &ue.Niveau, &ue.Niveaux, &filiereID); err == nil {
						for i := range filieres {
							if filieres[i].ID == filiereID {
								filieres[i].UnitesEnseignement = append(filieres[i].UnitesEnseignement, ue)
								break
							}
						}
					}
				}
			}
		}

		// 3. Étudiants dans les filières de l'enseignant
		if len(filieres) > 0 {
			filiereIDs := make([]string, len(filieres))
			for i, f := range filieres {
				filiereIDs[i] = f.ID
			}
			etuRows, err := tx.Query(r.Context(), `
				SELECT u."id", u."name", u."email", u."matricule", u."niveau"
				FROM "User" u
				WHERE u."role" = 'ETUDIANT' AND u."actif" = true
				  AND u."filiereId" = ANY($1)
				ORDER BY u."name"
				LIMIT 500
			`, filiereIDs)
			if err == nil {
				defer etuRows.Close()
				for etuRows.Next() {
					e := etudiantCtx{}
					if err := etuRows.Scan(&e.ID, &e.Name, &e.Email, &e.Matricule, &e.Niveau); err == nil {
						etudiants = append(etudiants, e)
					}
				}
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"filieres":  filieres,
		"etudiants": etudiants,
	})
}
