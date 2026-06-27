// Package http — rewrite complet de resultatsOverviewReal (RESULTATS-FIX-2).
package http

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// resultatsOverviewRealV2 — remplace resultatsOverviewReal avec les bons
// champs pour matcher OverviewEpreuve et EvolutionPoint du frontend.
func (s *Server) resultatsOverviewRealV2(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	enseignantID := r.URL.Query().Get("enseignantId")
	if enseignantID == "" && claims.Role == "ENSEIGNANT" {
		enseignantID = claims.UserID
	}

	// Types correspondant EXACTEMENT à types/resultats.ts
	type overviewEpreuve struct {
		ID           string  `json:"id"`
		Titre        string  `json:"titre"`
		DateDebut    string  `json:"dateDebut"`
		DateFin      string  `json:"dateFin"`
		Statut       string  `json:"statut"`
		NoteTotal    float64 `json:"noteTotal"`
		NbSessions   int     `json:"nbSessions"`
		NbCorrigees  int     `json:"nbCorrigees"`
		Moyenne      float64 `json:"moyenne"`
		TauxReussite float64 `json:"tauxReussite"`
		Mediane      float64 `json:"mediane"`
	}
	type evolutionPoint struct {
		Mois    string  `json:"mois"`
		Moyenne float64 `json:"moyenne"`
		Count   int     `json:"count"`
	}
	type studentAtRisk struct {
		EtudiantID    string  `json:"etudiantId"`
		EtudiantName  string  `json:"etudiantName"`
		EtudiantEmail string  `json:"etudiantEmail"`
		NbExamens     int     `json:"nbExamens"`
		Moyenne       float64 `json:"moyenne"`
		DerniereNote  float64 `json:"derniereNote"`
	}
	type topQuestion struct {
		EpreuveID    string  `json:"epreuveId"`
		EpreuveTitre string  `json:"epreuveTitre"`
		QuestionIndex int    `json:"questionIndex"`
		Enonce       string  `json:"enonce"`
		Type         string  `json:"type"`
		TauxReussite float64 `json:"tauxReussite"`
		Count        int     `json:"count"`
	}

	epreuves := []overviewEpreuve{}
	evolution := []evolutionPoint{}
	studentsAtRisk := []studentAtRisk{}
	topQuestions := []topQuestion{}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
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

		// 1. Épreuves avec stats complètes
		rows, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT e."id", e."titre", e."dateDebut"::text, e."dateFin"::text,
			       e."statut"::text, e."noteTotal",
			       (SELECT count(*) FROM "SessionPassation" s WHERE s."epreuveId" = e."id") AS nb_sessions,
			       (SELECT count(*) FROM "SessionPassation" s WHERE s."epreuveId" = e."id"
				AND s.statut IN ('CORRIGEE','RETOURNEE') AND s.score IS NOT NULL) AS nb_corrigees,
			       COALESCE((SELECT AVG(s2.score / e."noteTotal" * 20) FROM "SessionPassation" s2
				WHERE s2."epreuveId" = e."id" AND s2.statut IN ('CORRIGEE','RETOURNEE') AND s2.score IS NOT NULL), 0) AS moyenne,
			       COALESCE((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s3.score / e."noteTotal" * 20)
				FROM "SessionPassation" s3
				WHERE s3."epreuveId" = e."id" AND s3.statut IN ('CORRIGEE','RETOURNEE') AND s3.score IS NOT NULL), 0) AS mediane,
			       CASE WHEN (SELECT count(*) FROM "SessionPassation" s4 WHERE s4."epreuveId" = e."id"
				AND s4.statut IN ('CORRIGEE','RETOURNEE') AND s4.score IS NOT NULL) > 0
				    THEN (SELECT count(*) FILTER (WHERE s5.score >= e."noteTotal" * 0.5)::float
				     FROM "SessionPassation" s5 WHERE s5."epreuveId" = e."id"
				     AND s5.statut IN ('CORRIGEE','RETOURNEE') AND s5.score IS NOT NULL) /
				     (SELECT count(*) FROM "SessionPassation" s6 WHERE s6."epreuveId" = e."id"
				     AND s6.statut IN ('CORRIGEE','RETOURNEE') AND s6.score IS NOT NULL) * 100
				    ELSE 0 END AS taux
			FROM "Epreuve" e
			%s
			ORDER BY e."createdAt" DESC
			LIMIT 20
		`, whereE), args...)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				ep := overviewEpreuve{}
				if err := rows.Scan(&ep.ID, &ep.Titre, &ep.DateDebut, &ep.DateFin,
					&ep.Statut, &ep.NoteTotal, &ep.NbSessions, &ep.NbCorrigees,
					&ep.Moyenne, &ep.Mediane, &ep.TauxReussite); err == nil {
					epreuves = append(epreuves, ep)
				}
			}
		}

		// 2. Évolution mensuelle (avg de scores normalisés /20)
		whereE2 := ""
		args2 := []any{}
		if enseignantID != "" {
			whereE2 = `AND e."enseignantId" = $1`
			args2 = append(args2, enseignantID)
		}
		rows2, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT to_char(date_trunc('month', s."updatedAt"), 'YYYY-MM') AS mois,
			       COALESCE(AVG(s.score / e."noteTotal" * 20), 0) AS moyenne,
			       count(*) AS nb_eval
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE s.statut IN ('CORRIGEE','RETOURNEE') AND s.score IS NOT NULL
			  AND s."updatedAt" > now() - interval '12 months'
			  %s
			GROUP BY mois ORDER BY mois ASC
		`, whereE2), args2...)
		if err == nil {
			defer rows2.Close()
			for rows2.Next() {
				ev := evolutionPoint{}
				var nbEval int
				if err := rows2.Scan(&ev.Mois, &ev.Moyenne, &nbEval); err == nil {
					ev.Count = nbEval
					evolution = append(evolution, ev)
				}
			}
		}

		// 3. Étudiants en difficulté (moyenne /20 < 8)
		rows3, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT u."id", u."name", u."email", count(*) AS nb_exam,
			       COALESCE(AVG(s.score / e."noteTotal" * 20), 0) AS moy,
			       COALESCE(MAX(s.score / e."noteTotal" * 20), 0) AS derniere
			FROM "User" u
			JOIN "SessionPassation" s ON s."etudiantId" = u."id"
			  AND s.statut IN ('CORRIGEE','RETOURNEE') AND s.score IS NOT NULL
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE u."role" = 'ETUDIANT' %s
			GROUP BY u."id", u."name", u."email"
			HAVING AVG(s.score / e."noteTotal" * 20) < 8
			ORDER BY moy ASC LIMIT 10
		`, whereE2), args2...)
		if err == nil {
			defer rows3.Close()
			for rows3.Next() {
				sr := studentAtRisk{}
				if err := rows3.Scan(&sr.EtudiantID, &sr.EtudiantName, &sr.EtudiantEmail,
					&sr.NbExamens, &sr.Moyenne, &sr.DerniereNote); err == nil {
					studentsAtRisk = append(studentsAtRisk, sr)
				}
			}
		}

		// 4. Top questions difficiles (via Resultat.detailParQuestion JSON)
		rows4, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT e."id" AS epreuve_id, e."titre" AS epreuve_titre,
			       q."id" AS question_id, q."intitule", q."type"::text,
			       count(r."id") AS nb_reponses,
			       COALESCE(avg(
				 (r."detailParQuestion"::jsonb -> q."id" ->> 'pointsObtenus')::float /
				 NULLIF((r."detailParQuestion"::jsonb -> q."id" ->> 'pointsMax')::float, 0) * 100
			       ), 0) AS taux_reussite
			FROM "Resultat" r
			JOIN "SessionPassation" s ON s."id" = r."sessionId"
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			JOIN "Question" q ON q."id" IN (
			  SELECT je->>'questionId' FROM jsonb_array_elements(e."contenu"::jsonb -> 'questions') je
			)
			WHERE r."detailParQuestion" IS NOT NULL %s
			GROUP BY e."id", e."titre", q."id", q."intitule", q."type"
			ORDER BY taux_reussite ASC
			LIMIT 10
		`, whereE2), args2...)
		if err == nil {
			defer rows4.Close()
			for rows4.Next() {
				tq := topQuestion{}
				if err := rows4.Scan(&tq.EpreuveID, &tq.EpreuveTitre, &tq.QuestionIndex,
					&tq.Enonce, &tq.Type, &tq.Count, &tq.TauxReussite); err == nil {
					topQuestions = append(topQuestions, tq)
				}
			}
		}

		return nil
	})

	// KPIs scalaires
	totalEpreuves := len(epreuves)
	totalSessions := 0
	totalCorrigees := 0
	var globalMoy float64
	var globalTaux float64
	for _, ep := range epreuves {
		totalSessions += ep.NbSessions
		totalCorrigees += ep.NbCorrigees
		globalMoy += ep.Moyenne
		globalTaux += ep.TauxReussite
	}
	if totalEpreuves > 0 {
		globalMoy /= float64(totalEpreuves)
		globalTaux /= float64(totalEpreuves)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"totalEpreuves":      totalEpreuves,
		"totalSessions":      totalSessions,
		"totalCorrigees":     totalCorrigees,
		"globalMoyenne":      globalMoy,
		"globalTauxReussite": globalTaux,
		"epreuves":           epreuves,
		"evolution":          evolution,
		"studentsAtRisk":     studentsAtRisk,
		"topQuestions":       topQuestions,
	})
}
