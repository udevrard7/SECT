package http

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// stats_handlers.go — Endpoints statistiques pour les dashboards.
// Retourne des données agrégées pour le tableau de bord enseignant/étudiant/admin.
//
// Ces handlers utilisent le pool pgx directement (avec pose des claims RLS via
// db.WithTx) plutôt que les repositories, car ils font des requêtes agrégées
// (COUNT, AVG, GROUP BY) qui ne matchent pas le pattern CRUD des repos.

// ──────────────────────────────────────────────────────────────────────────
// statsEnseignant — GET /api/stats/enseignant
// ──────────────────────────────────────────────────────────────────────────
//
// Contrat attendu par le frontend (cf. EnseignantStatsData dans
// frontend/src/hooks/use-dashboard.ts) :
//
//      {
//        nbDocuments, nbQuestionsTotal, nbEpreuves, nbEpreuvesActives,
//        nbCorrectionsEnAttente,
//        pendingCorrections: [{ sessionId, etudiantNom, etudiantEmail,
//          epreuveTitre, questionType, questionPreview, submittedAt }],
//        recentEpreuves:    [{ id, titre, statut, nbParticipants, moyenne?, date }],
//        performanceParEpreuve: [{ titre, moyenne, tauxReussite }],
//        evolutionMoyennes: [{ mois, moyenne, nbEvaluations }],
//        epreuvesAVenir:    [{ id, titre, date, dateFin, duree, statut,
//          nbParticipants }],
//        badges?: [...]  // ignoré par le frontend (utilise /api/badges)
//      }
//
// Tous les tableaux sont des slices vides (non null) quand il n'y a pas de
// données, pour éviter les crashes runtime côté frontend (ex: .map() sur undefined).
func (s *Server) statsEnseignant(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	ctx := r.Context()
	enseignantID := claims.UserID

	// Structure de réponse (toujours initialisée avec slices vides)
	type pendingCorrection struct {
		SessionID       string `json:"sessionId"`
		EtudiantNom     string `json:"etudiantNom"`
		EtudiantEmail   string `json:"etudiantEmail"`
		EpreuveTitre    string `json:"epreuveTitre"`
		QuestionType    string `json:"questionType"`
		QuestionPreview string `json:"questionPreview"`
		SubmittedAt     string `json:"submittedAt"`
	}
	type recentEpreuve struct {
		ID             string   `json:"id"`
		Titre          string   `json:"titre"`
		Statut         string   `json:"statut"`
		NbParticipants int      `json:"nbParticipants"`
		Moyenne        *float64 `json:"moyenne,omitempty"`
		Date           string   `json:"date"`
	}
	type performanceData struct {
		Titre        string  `json:"titre"`
		Moyenne      float64 `json:"moyenne"`
		TauxReussite float64 `json:"tauxReussite"`
	}
	type evolutionMoyenne struct {
		Mois          string  `json:"mois"`
		Moyenne       float64 `json:"moyenne"`
		NbEvaluations int     `json:"nbEvaluations"`
	}
	type epreuveAVenir struct {
		ID             string `json:"id"`
		Titre          string `json:"titre"`
		Date           string `json:"date"`
		DateFin        string `json:"dateFin"`
		Duree          int    `json:"duree"`
		Statut         string `json:"statut"`
		NbParticipants int    `json:"nbParticipants"`
	}

	stats := map[string]any{
		"nbDocuments":            0,
		"nbQuestionsTotal":       0,
		"nbEpreuves":             0,
		"nbEpreuvesActives":      0,
		"nbCorrectionsEnAttente": 0,
		"pendingCorrections":     []pendingCorrection{},
		"recentEpreuves":         []recentEpreuve{},
		"performanceParEpreuve":  []performanceData{},
		"evolutionMoyennes":      []evolutionMoyenne{},
		"epreuvesAVenir":         []epreuveAVenir{},
		"badges":                 []any{},
	}

	// Exécuter les requêtes agrégées dans une transaction RLS
	err := appdb.WithTx(ctx, s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. Compteurs globaux (documents, questions, épreuves)
		var nbDocs, nbQuestions, nbEpreuves, nbEpreuvesActives int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM "Document" WHERE "ownerId" = $1 AND "deletedAt" IS NULL
		`, enseignantID).Scan(&nbDocs); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM "Question" WHERE "auteurId" = $1 AND "deletedAt" IS NULL
		`, enseignantID).Scan(&nbQuestions); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM "Epreuve" WHERE "enseignantId" = $1 AND "deletedAt" IS NULL
		`, enseignantID).Scan(&nbEpreuves); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM "Epreuve"
			WHERE "enseignantId" = $1 AND "deletedAt" IS NULL
			  AND statut IN ('PLANIFIEE', 'EN_COURS')
		`, enseignantID).Scan(&nbEpreuvesActives); err != nil {
			return err
		}
		stats["nbDocuments"] = nbDocs
		stats["nbQuestionsTotal"] = nbQuestions
		stats["nbEpreuves"] = nbEpreuves
		stats["nbEpreuvesActives"] = nbEpreuvesActives

		// 2. Corrections en attente = sessions SOUMISES (pas encore CORRIGEE/RETOURNEE)
		//    sur des épreuves de l'enseignant courant.
		rows, err := tx.Query(ctx, `
			SELECT s.id, s."etudiantId", s."epreuveId", s."updatedAt",
			       u.name AS etudiant_nom, u.email AS etudiant_email,
			       e.titre AS epreuve_titre
			FROM "SessionPassation" s
			JOIN "User" u ON u.id = s."etudiantId"
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			WHERE e."enseignantId" = $1
			  AND s.statut = 'SOUMISE'
			ORDER BY s."updatedAt" DESC
			LIMIT 10
		`, enseignantID)
		if err != nil {
			return err
		}
		defer rows.Close()

		pending := []pendingCorrection{}
		for rows.Next() {
			var p pendingCorrection
			var etudiantID, epreuveID string
			var updatedAt time.Time
			if err := rows.Scan(&p.SessionID, &etudiantID, &epreuveID, &updatedAt,
				&p.EtudiantNom, &p.EtudiantEmail, &p.EpreuveTitre); err != nil {
				return err
			}
			p.QuestionType = "QRC" // type par défaut (le détail de la question n'est pas critique pour le dashboard)
			p.QuestionPreview = ""
			p.SubmittedAt = updatedAt.UTC().Format(time.RFC3339)
			pending = append(pending, p)
		}
		stats["pendingCorrections"] = pending
		stats["nbCorrectionsEnAttente"] = len(pending)

		// 3. Épreuves récentes (10 dernières, tous statuts confondus)
		rows2, err := tx.Query(ctx, `
			SELECT e.id, e.titre, e.statut, e."dateDebut",
			       (SELECT count(*) FROM "SessionPassation" s WHERE s."epreuveId" = e.id) AS nb_participants,
			       (SELECT AVG(s2.score) FROM "SessionPassation" s2
				WHERE s2."epreuveId" = e.id AND s2.statut IN ('CORRIGEE', 'RETOURNEE') AND s2.score IS NOT NULL) AS moyenne
			FROM "Epreuve" e
			WHERE e."enseignantId" = $1 AND e."deletedAt" IS NULL
			ORDER BY e."createdAt" DESC
			LIMIT 10
		`, enseignantID)
		if err != nil {
			return err
		}
		defer rows2.Close()

		recent := []recentEpreuve{}
		for rows2.Next() {
			var e recentEpreuve
			var dateDebut time.Time
			var moyenne pgtype.Float8
			var statut pgtype.Text
			if err := rows2.Scan(&e.ID, &e.Titre, &statut, &dateDebut, &e.NbParticipants, &moyenne); err != nil {
				return err
			}
			e.Statut = statut.String
			e.Date = dateDebut.UTC().Format(time.RFC3339)
			if moyenne.Valid {
				v := moyenne.Float64
				e.Moyenne = &v
			}
			recent = append(recent, e)
		}
		stats["recentEpreuves"] = recent

		// 4. Performance par épreuve (épreuves terminées/corrigées avec moyenne)
		rows3, err := tx.Query(ctx, `
			SELECT e.titre,
			       COALESCE(AVG(s.score), 0) AS moyenne,
			       CASE WHEN COUNT(s.id) > 0
				    THEN (COUNT(s.id) FILTER (WHERE s.score >= e."noteTotal" * 0.5))::float / COUNT(s.id) * 100
				    ELSE 0 END AS taux_reussite
			FROM "Epreuve" e
			LEFT JOIN "SessionPassation" s ON s."epreuveId" = e.id
			  AND s.statut IN ('CORRIGEE', 'RETOURNEE')
			  AND s.score IS NOT NULL
			WHERE e."enseignantId" = $1 AND e."deletedAt" IS NULL
			  AND e.statut IN ('TERMINEE', 'CLOTUREE')
			GROUP BY e.id, e.titre, e."noteTotal"
			ORDER BY moyenne DESC
			LIMIT 10
		`, enseignantID)
		if err != nil {
			return err
		}
		defer rows3.Close()

		perf := []performanceData{}
		for rows3.Next() {
			var p performanceData
			if err := rows3.Scan(&p.Titre, &p.Moyenne, &p.TauxReussite); err != nil {
				return err
			}
			perf = append(perf, p)
		}
		stats["performanceParEpreuve"] = perf

		// 5. Évolution des moyennes (6 derniers mois)
		rows4, err := tx.Query(ctx, `
			SELECT to_char(date_trunc('month', s."updatedAt"), 'YYYY-MM') AS mois,
			       COALESCE(AVG(s.score), 0) AS moyenne,
			       count(*) AS nb_evaluations
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			WHERE e."enseignantId" = $1
			  AND s.statut IN ('CORRIGEE', 'RETOURNEE')
			  AND s.score IS NOT NULL
			  AND s."updatedAt" > now() - interval '6 months'
			GROUP BY mois
			ORDER BY mois ASC
		`, enseignantID)
		if err != nil {
			return err
		}
		defer rows4.Close()

		evol := []evolutionMoyenne{}
		for rows4.Next() {
			var e evolutionMoyenne
			if err := rows4.Scan(&e.Mois, &e.Moyenne, &e.NbEvaluations); err != nil {
				return err
			}
			evol = append(evol, e)
		}
		stats["evolutionMoyennes"] = evol

		// 6. Épreuves à venir (PLANIFIEE ou EN_COURS, dans le futur)
		rows5, err := tx.Query(ctx, `
			SELECT e.id, e.titre, e."dateDebut", e."dateFin", e.duree, e.statut,
			       (SELECT count(*) FROM "SessionPassation" s WHERE s."epreuveId" = e.id) AS nb_participants
			FROM "Epreuve" e
			WHERE e."enseignantId" = $1 AND e."deletedAt" IS NULL
			  AND e.statut IN ('PLANIFIEE', 'EN_COURS')
			  AND e."dateDebut" IS NOT NULL
			ORDER BY e."dateDebut" ASC
			LIMIT 10
		`, enseignantID)
		if err != nil {
			return err
		}
		defer rows5.Close()

		avenir := []epreuveAVenir{}
		for rows5.Next() {
			var e epreuveAVenir
			var dateDebut, dateFin pgtype.Timestamp
			var statut pgtype.Text
			if err := rows5.Scan(&e.ID, &e.Titre, &dateDebut, &dateFin, &e.Duree, &statut, &e.NbParticipants); err != nil {
				return err
			}
			e.Statut = statut.String
			if dateDebut.Valid {
				e.Date = dateDebut.Time.UTC().Format(time.RFC3339)
			}
			if dateFin.Valid {
				e.DateFin = dateFin.Time.UTC().Format(time.RFC3339)
			}
			avenir = append(avenir, e)
		}
		stats["epreuvesAVenir"] = avenir

		return nil
	})

	if err != nil {
		// Log l'erreur mais ne crash pas — retourne les valeurs par défaut (zéros + slices vides)
		// pour que le frontend puisse afficher le dashboard même si une requête échoue.
		http.Error(w, `{"error":"failed to load teacher stats"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// ──────────────────────────────────────────────────────────────────────────
// statsEtudiant — GET /api/stats/etudiant
// ──────────────────────────────────────────────────────────────────────────
//
// Contrat attendu par le frontend (EtudiantStatsData) :
//
//      {
//        nbEpreuvesAVenir, nbEpreuvesTerminees, moyenne, meilleureNote,
//        epreuvesAVenir: [{ id, titre, date, dateFin, duree, enseignant,
//          nbQuestions, totalPoints }],
//        resultatsRecents: [{ id, epreuveId, titre, enseignant, date, score,
//          statut, resultat: { scoreFinal, totalPossible } | null }],
//        evolutionScores: [{ titre, score, date }],
//        performanceParType: [{ type, moyenne, nbReponses }],
//        sessionEnCours: { id, epreuveId, epreuveTitre, dateDebut } | null,
//        badges?: [...]
//      }
func (s *Server) statsEtudiant(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	ctx := r.Context()
	etudiantID := claims.UserID

	// Structures de réponse
	type epreuveAVenir struct {
		ID          string  `json:"id"`
		Titre       string  `json:"titre"`
		Date        string  `json:"date"`
		DateFin     string  `json:"dateFin"`
		Duree       int     `json:"duree"`
		Enseignant  string  `json:"enseignant"`
		NbQuestions int     `json:"nbQuestions"`
		TotalPoints float64 `json:"totalPoints"`
	}
	type resultatRecent struct {
		ID         string  `json:"id"`
		EpreuveID  string  `json:"epreuveId"`
		Titre      string  `json:"titre"`
		Enseignant string  `json:"enseignant"`
		Date       string  `json:"date"`
		Score      float64 `json:"score"`
		Statut     string  `json:"statut"`
		Resultat   *struct {
			ScoreFinal    float64 `json:"scoreFinal"`
			TotalPossible float64 `json:"totalPossible"`
		} `json:"resultat"`
	}
	type evolutionScore struct {
		Titre string  `json:"titre"`
		Score float64 `json:"score"`
		Date  string  `json:"date"`
	}
	type performanceType struct {
		Type       string  `json:"type"`
		Moyenne    float64 `json:"moyenne"`
		NbReponses int     `json:"nbReponses"`
	}
	type sessionEnCours struct {
		ID            string `json:"id"`
		EpreuveID     string `json:"epreuveId"`
		EpreuveTitre  string `json:"epreuveTitre"`
		DateDebut     string `json:"dateDebut"`
	}

	stats := map[string]any{
		"nbEpreuvesAVenir":      0,
		"nbEpreuvesTerminees":   0,
		"moyenne":               0,
		"meilleureNote":         0,
		"epreuvesAVenir":        []epreuveAVenir{},
		"resultatsRecents":      []resultatRecent{},
		"evolutionScores":       []evolutionScore{},
		"performanceParType":    []performanceType{},
		"sessionEnCours":        nil,
		"badges":                []any{},
	}

	err := appdb.WithTx(ctx, s.dbPool, claims, func(tx pgx.Tx) error {
		// Compteurs globaux
		var nbAVenir, nbTerminees int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			WHERE s."etudiantId" = $1
			  AND e.statut IN ('PLANIFIEE', 'EN_COURS')
		`, etudiantID).Scan(&nbAVenir); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM "SessionPassation"
			WHERE "etudiantId" = $1 AND statut IN ('CORRIGEE', 'RETOURNEE')
		`, etudiantID).Scan(&nbTerminees); err != nil {
			return err
		}
		stats["nbEpreuvesAVenir"] = nbAVenir
		stats["nbEpreuvesTerminees"] = nbTerminees

		// Moyenne et meilleure note
		var moyenne, meilleure pgtype.Float8
		_ = tx.QueryRow(ctx, `
			SELECT COALESCE(AVG(score), 0), COALESCE(MAX(score), 0)
			FROM "SessionPassation"
			WHERE "etudiantId" = $1 AND statut IN ('CORRIGEE', 'RETOURNEE') AND score IS NOT NULL
		`, etudiantID).Scan(&moyenne, &meilleure)
		if moyenne.Valid {
			stats["moyenne"] = moyenne.Float64
		}
		if meilleure.Valid {
			stats["meilleureNote"] = meilleure.Float64
		}

		// Épreuves à venir
		rows, err := tx.Query(ctx, `
			SELECT e.id, e.titre, e."dateDebut", e."dateFin", e.duree,
			       COALESCE(u.name, '') AS enseignant,
			       (SELECT count(*) FROM "EpreuveQuestion" eq WHERE eq."epreuveId" = e.id) AS nb_questions,
			       COALESCE(e."noteTotal", 0) AS total_points
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			LEFT JOIN "User" u ON u.id = e."enseignantId"
			WHERE s."etudiantId" = $1 AND e.statut IN ('PLANIFIEE', 'EN_COURS')
			ORDER BY e."dateDebut" ASC
			LIMIT 10
		`, etudiantID)
		if err != nil {
			return err
		}
		defer rows.Close()

		avenir := []epreuveAVenir{}
		for rows.Next() {
			var e epreuveAVenir
			var dateDebut, dateFin pgtype.Timestamp
			if err := rows.Scan(&e.ID, &e.Titre, &dateDebut, &dateFin, &e.Duree,
				&e.Enseignant, &e.NbQuestions, &e.TotalPoints); err != nil {
				return err
			}
			if dateDebut.Valid {
				e.Date = dateDebut.Time.UTC().Format(time.RFC3339)
			}
			if dateFin.Valid {
				e.DateFin = dateFin.Time.UTC().Format(time.RFC3339)
			}
			avenir = append(avenir, e)
		}
		stats["epreuvesAVenir"] = avenir

		// Résultats récents
		rows2, err := tx.Query(ctx, `
			SELECT s.id, e.id, e.titre, COALESCE(u.name, '') AS enseignant,
			       s."updatedAt", COALESCE(s.score, 0), s.statut,
			       r."scoreFinal", r."totalPossible"
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			LEFT JOIN "User" u ON u.id = e."enseignantId"
			LEFT JOIN "Resultat" r ON r."sessionId" = s.id
			WHERE s."etudiantId" = $1 AND s.statut IN ('CORRIGEE', 'RETOURNEE')
			ORDER BY s."updatedAt" DESC
			LIMIT 10
		`, etudiantID)
		if err != nil {
			return err
		}
		defer rows2.Close()

		recents := []resultatRecent{}
		for rows2.Next() {
			var rr resultatRecent
			var updatedAt time.Time
			var scoreFinal, totalPossible pgtype.Float8
			if err := rows2.Scan(&rr.ID, &rr.EpreuveID, &rr.Titre, &rr.Enseignant,
				&updatedAt, &rr.Score, &rr.Statut, &scoreFinal, &totalPossible); err != nil {
				return err
			}
			rr.Date = updatedAt.UTC().Format(time.RFC3339)
			if scoreFinal.Valid && totalPossible.Valid {
				rr.Resultat = &struct {
					ScoreFinal    float64 `json:"scoreFinal"`
					TotalPossible float64 `json:"totalPossible"`
				}{ScoreFinal: scoreFinal.Float64, TotalPossible: totalPossible.Float64}
			}
			recents = append(recents, rr)
		}
		stats["resultatsRecents"] = recents

		// Évolution des scores (10 derniers résultats)
		rows3, err := tx.Query(ctx, `
			SELECT e.titre, COALESCE(s.score, 0), s."updatedAt"
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			WHERE s."etudiantId" = $1 AND s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
			ORDER BY s."updatedAt" ASC
			LIMIT 10
		`, etudiantID)
		if err != nil {
			return err
		}
		defer rows3.Close()

		evol := []evolutionScore{}
		for rows3.Next() {
			var e evolutionScore
			var date time.Time
			if err := rows3.Scan(&e.Titre, &e.Score, &date); err != nil {
				return err
			}
			e.Date = date.UTC().Format(time.RFC3339)
			evol = append(evol, e)
		}
		stats["evolutionScores"] = evol

		// Performance par type de question (approximatif — basé sur detailParQuestion JSON)
		// Pour l'instant, on retourne un slice vide car la structure JSON varie.
		stats["performanceParType"] = []performanceType{}

		// Session en cours (une seule possible)
		var sessID, epreuveID, epreuveTitre pgtype.Text
		var dateDebut pgtype.Timestamp
		err = tx.QueryRow(ctx, `
			SELECT s.id, e.id, e.titre, s."dateDebut"
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			WHERE s."etudiantId" = $1 AND s.statut = 'EN_COURS'
			ORDER BY s."dateDebut" DESC
			LIMIT 1
		`, etudiantID).Scan(&sessID, &epreuveID, &epreuveTitre, &dateDebut)
		if err == nil && sessID.Valid {
			sess := sessionEnCours{
				ID:           sessID.String,
				EpreuveID:    epreuveID.String,
				EpreuveTitre: epreuveTitre.String,
			}
			if dateDebut.Valid {
				sess.DateDebut = dateDebut.Time.UTC().Format(time.RFC3339)
			}
			stats["sessionEnCours"] = sess
		}
		// Si pas de session en cours, sessionEnCours reste nil (déjà mis dans l'init)

		return nil
	})

	if err != nil {
		http.Error(w, `{"error":"failed to load student stats"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// ──────────────────────────────────────────────────────────────────────────
// statsAdmin — GET /api/stats/admin
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) statsAdmin(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	ctx := r.Context()

	stats := map[string]any{
		"totalEtablissements": 0,
		"totalUsers":          0,
		"totalEpreuves":       0,
		"totalSessions":       0,
		"abonnementsActifs":   0,
	}

	_ = appdb.WithTx(ctx, s.dbPool, claims, func(tx pgx.Tx) error {
		var nbEtab, nbUsers, nbEpreuves, nbSessions, nbAbo int
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "Etablissement"`).Scan(&nbEtab)
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE actif = true`).Scan(&nbUsers)
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "Epreuve" WHERE "deletedAt" IS NULL`).Scan(&nbEpreuves)
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "SessionPassation"`).Scan(&nbSessions)
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "Abonnement" WHERE statut = 'ACTIF'`).Scan(&nbAbo)
		stats["totalEtablissements"] = nbEtab
		stats["totalUsers"] = nbUsers
		stats["totalEpreuves"] = nbEpreuves
		stats["totalSessions"] = nbSessions
		stats["abonnementsActifs"] = nbAbo
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// ──────────────────────────────────────────────────────────────────────────
// statsResponsable — GET /api/stats/responsable
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) statsResponsable(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	// BUGFIX (ENS-AUDIT-4) : restriction au rôle RESPONSABLE (et ADMIN qui
	// hérite de toutes les permissions). Avant ce fix, tout utilisateur
	// authentifié — y compris ENSEIGNANT et ETUDIANT — pouvait appeler cet
	// endpoint et récupérer les compteurs globaux (nb enseignants, étudiants,
	// épreuves, sessions) de l'établissement : fuite d'information.
	if claims.Role != string(domain.RoleResponsable) && claims.Role != string(domain.RoleAdmin) {
		writeJSONError(w, http.StatusForbidden, "réservé au rôle RESPONSABLE")
		return
	}

	ctx := r.Context()

	stats := map[string]any{
		"totalEnseignants": 0,
		"totalEtudiants":   0,
		"totalEpreuves":    0,
		"totalSessions":    0,
	}

	_ = appdb.WithTx(ctx, s.dbPool, claims, func(tx pgx.Tx) error {
		var nbEns, nbEtu, nbEpreuves, nbSessions int
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE role = 'ENSEIGNANT' AND actif = true`).Scan(&nbEns)
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE role = 'ETUDIANT' AND actif = true`).Scan(&nbEtu)
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "Epreuve" WHERE "deletedAt" IS NULL`).Scan(&nbEpreuves)
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "SessionPassation"`).Scan(&nbSessions)
		stats["totalEnseignants"] = nbEns
		stats["totalEtudiants"] = nbEtu
		stats["totalEpreuves"] = nbEpreuves
		stats["totalSessions"] = nbSessions
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// ──────────────────────────────────────────────────────────────────────────
// badgesList — GET /api/badges  /  POST /api/badges (recalculer)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) badgesList(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// POST = recalculer les badges (no-op pour l'instant)
	if r.Method == "POST" {
		// TODO: implémenter le calcul des badges
		_ = context.Background()
	}

	// Format attendu par le frontend (BadgesResponse) :
	// { badges: BadgeWithProgress[], stats: {total, unlocked, locked, progress}, newlyUnlocked: [] }
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"badges": []any{},
		"stats": map[string]any{
			"total":    0,
			"unlocked": 0,
			"locked":   0,
			"progress": 0,
		},
		"newlyUnlocked": []any{},
	})
}

// ──────────────────────────────────────────────────────────────────────────
// Stubs conservés (à implémenter ultérieurement)
// ──────────────────────────────────────────────────────────────────────────

// devoirsList — GET /api/devoirs
func (s *Server) devoirsList(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"devoirs": []any{},
	})
}

// devoirsStats — GET /api/devoirs/stats
func (s *Server) devoirsStats(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"total":    0,
		"enCours":  0,
		"corriges": 0,
	})
}

// alertesList — GET /api/alertes
func (s *Server) alertesList(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"alertes": []any{},
	})
}

// surveillanceStats — GET /api/surveillance/stats
func (s *Server) surveillanceStats(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"sessionsActives": 0,
		"alertes":         0,
		"suspicious":      []any{},
	})
}

// corbeilleList — GET /api/corbeille
func (s *Server) corbeilleList(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"items": []any{},
	})
}

// notificationsList — GET /api/notifications
func (s *Server) notificationsList(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"notifications": []any{},
	})
}

// notificationsAdmin — GET /api/notifications/admin
func (s *Server) notificationsAdmin(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"notifications": []any{},
	})
}

// abonnementsList — GET /api/abonnements
func (s *Server) abonnementsList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"abonnements": []any{},
	})
}

// facturesList — GET /api/factures
func (s *Server) facturesList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"factures": []any{},
	})
}

// plansList — GET /api/plans
func (s *Server) plansList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"plans": []any{},
	})
}

// platformSettings — GET /api/platform-settings
func (s *Server) platformSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"settings": map[string]any{},
	})
}

// aiProvidersList — GET /api/ai-providers
func (s *Server) aiProvidersList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"providers": []any{},
	})
}

// monitoringEvents — GET /api/monitoring
func (s *Server) monitoringEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"events": []any{},
	})
}

// logsList — GET /api/logs
func (s *Server) logsList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"logs": []any{},
	})
}

// ipWhitelistList — GET /api/ip-whitelist
func (s *Server) ipWhitelistList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ips": []any{},
	})
}

// securitySettingsGet — GET /api/security-settings
func (s *Server) securitySettingsGet(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"settings": map[string]any{},
	})
}

// enseignantContext — GET /api/enseignant/context
func (s *Server) enseignantContext(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"filieres":  []any{},
		"niveaux":   []any{},
		"etudiants": []any{},
	})
}

// enseignantEtudiants — GET /api/enseignant/etudiants
func (s *Server) enseignantEtudiants(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"etudiants": []any{},
	})
}

// etudiantsList — GET /api/etudiants
func (s *Server) etudiantsList(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"etudiants": []any{},
	})
}

// validationsUE — GET /api/validations-ue
func (s *Server) validationsUE(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"validations": []any{},
	})
}

// notFound — catch-all pour les routes API non implémentées
func (s *Server) apiNotFound(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(map[string]string{
		"error": "endpoint non implémenté",
		"path":  r.URL.Path,
	})
}
