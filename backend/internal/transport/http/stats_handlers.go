package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
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
//	{
//	  nbDocuments, nbQuestionsTotal, nbEpreuves, nbEpreuvesActives,
//	  nbCorrectionsEnAttente,
//	  pendingCorrections: [{ sessionId, etudiantNom, etudiantEmail,
//	    epreuveTitre, questionType, questionPreview, submittedAt }],
//	  recentEpreuves:    [{ id, titre, statut, nbParticipants, moyenne?, date }],
//	  performanceParEpreuve: [{ titre, moyenne, tauxReussite }],
//	  evolutionMoyennes: [{ mois, moyenne, nbEvaluations }],
//	  epreuvesAVenir:    [{ id, titre, date, dateFin, duree, statut,
//	    nbParticipants }],
//	  badges?: [...]  // ignoré par le frontend (utilise /api/badges)
//	}
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
			       (SELECT AVG(s2.score) / e."noteTotal" * 20 FROM "SessionPassation" s2
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
			       CASE WHEN e."noteTotal" > 0 AND COUNT(s.id) > 0
				    THEN COALESCE(AVG(s.score / e."noteTotal" * 20), 0) / e."noteTotal" * 20
				    ELSE 0 END AS moyenne,
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
			       COALESCE(AVG(s.score / e."noteTotal" * 20), 0) AS moyenne,
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
		http.Error(w, fmt.Sprintf(`{"error":"failed to load teacher stats","detail":"%s"}`, err.Error()), http.StatusInternalServerError)
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
//	{
//	  nbEpreuvesAVenir, nbEpreuvesTerminees, moyenne, meilleureNote,
//	  epreuvesAVenir: [{ id, titre, date, dateFin, duree, enseignant,
//	    nbQuestions, totalPoints }],
//	  resultatsRecents: [{ id, epreuveId, titre, enseignant, date, score,
//	    statut, resultat: { scoreFinal, totalPossible } | null }],
//	  evolutionScores: [{ titre, score, date }],
//	  performanceParType: [{ type, moyenne, nbReponses }],
//	  sessionEnCours: { id, epreuveId, epreuveTitre, dateDebut } | null,
//	  badges?: [...]
//	}
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
		ID           string `json:"id"`
		EpreuveID    string `json:"epreuveId"`
		EpreuveTitre string `json:"epreuveTitre"`
		DateDebut    string `json:"dateDebut"`
	}

	stats := map[string]any{
		"nbEpreuvesAVenir":    0,
		"nbEpreuvesTerminees": 0,
		"moyenne":             0,
		"meilleureNote":       0,
		"epreuvesAVenir":      []epreuveAVenir{},
		"resultatsRecents":    []resultatRecent{},
		"evolutionScores":     []evolutionScore{},
		"performanceParType":  []performanceType{},
		"sessionEnCours":      nil,
		"badges":              []any{},
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

		// Moyenne et meilleure note (normalisées sur /20)
		var moyenne, meilleure pgtype.Float8
		_ = tx.QueryRow(ctx, `
			SELECT COALESCE(AVG(s.score / e."noteTotal" * 20), 0), COALESCE(MAX(s.score / e."noteTotal" * 20), 0)
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE s."etudiantId" = $1 AND s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
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
	// BUGFIX (ADMIN-AUDIT-5) : restriction au rôle ADMIN. Avant ce fix, tout
	// utilisateur authentifié (ENSEIGNANT, ETUDIANT, RESPONSABLE) pouvait
	// appeler cet endpoint et récupérer les compteurs globaux de la plateforme
	// (nb établissements, utilisateurs, épreuves, sessions, abonnements) :
	// fuite d'information. Même classe de bug que stats/responsable (fixé
	// dans ENS-AUDIT-1).
	if claims.Role != string(domain.RoleAdmin) {
		writeJSONError(w, http.StatusForbidden, "réservé au rôle ADMIN")
		return
	}

	ctx := r.Context()

	// Types de réponse (toujours initialisés avec slices vides — JAMAIS nil).
	type planCount struct {
		Plan  string `json:"plan"`
		Count int    `json:"count"`
	}
	type statutCount struct {
		Statut string `json:"statut"`
		Count  int    `json:"count"`
	}
	type responsableRef struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
		Actif bool   `json:"actif"`
	}
	type etablissementOverview struct {
		ID               string          `json:"id"`
		Nom              string          `json:"nom"`
		Ville            *string         `json:"ville"`
		Type             *string         `json:"type"`
		Actif            bool            `json:"actif"`
		AbonnementStatut *string         `json:"abonnementStatut"`
		PlanNom          *string         `json:"planNom"`
		NbUsers          int             `json:"nbUsers"`
		NbFilieres       int             `json:"nbFilieres"`
		ProctoringActif  bool            `json:"proctoringActif"`
		AdminHasAccess   bool            `json:"adminHasAccess"`
		Responsable      *responsableRef `json:"responsable"`
	}

	stats := map[string]any{
		"nbEtablissements":         0,
		"nbAbonnementsActifs":      0,
		"nbAbonnementsEssai":       0,
		"nbAbonnementsExpires":     0,
		"revenuMensuel":            float64(0),
		"revenuAnnuel":             float64(0),
		"repartitionPlans":         []planCount{},
		"etablissementsParStatut":  []statutCount{},
		"nbEtablissementsProteges": 0,
		"nbVerificationIdentite":   0,
		"nbAutorisationsActives":   0,
		"nbAutorisationsEnAttente": 0,
		"etablissementsOverview":   []etablissementOverview{},
	}

	err := appdb.WithTx(ctx, s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. Compteur global établissements
		var nbEtab int
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "Etablissement"`).Scan(&nbEtab)
		stats["nbEtablissements"] = nbEtab

		// 2. Compteurs abonnements par statut
		var nbAboActif, nbAboEssai, nbAboExpire int
		_ = tx.QueryRow(ctx, `
			SELECT
				count(*) FILTER (WHERE statut = 'ACTIF'),
				count(*) FILTER (WHERE statut = 'ESSAI'),
				count(*) FILTER (WHERE statut = 'EXPIRE')
			FROM "Abonnement"
		`).Scan(&nbAboActif, &nbAboEssai, &nbAboExpire)
		stats["nbAbonnementsActifs"] = nbAboActif
		stats["nbAbonnementsEssai"] = nbAboEssai
		stats["nbAbonnementsExpires"] = nbAboExpire

		// 3. Revenus mensuel / annuel (somme des prix des plans pour les
		// abonnements ACTIF ou ESSAI).
		var revenuMensuel, revenuAnnuel float64
		_ = tx.QueryRow(ctx, `
			SELECT COALESCE(sum(p."prixMensuel"), 0)
			FROM "Abonnement" a
			JOIN "Plan" p ON p."id" = a."planId"
			WHERE a.statut IN ('ACTIF', 'ESSAI')
		`).Scan(&revenuMensuel)
		_ = tx.QueryRow(ctx, `
			SELECT COALESCE(sum(p."prixAnnuel"), 0)
			FROM "Abonnement" a
			JOIN "Plan" p ON p."id" = a."planId"
			WHERE a.statut IN ('ACTIF', 'ESSAI')
		`).Scan(&revenuAnnuel)
		stats["revenuMensuel"] = revenuMensuel
		stats["revenuAnnuel"] = revenuAnnuel

		// 4. Répartition des abonnements par plan (tous les plans, même
		// sans abonnement, pour l'affichage du pie chart).
		rowsPlans, qerr := tx.Query(ctx, `
			SELECT COALESCE(p.nom, '—') AS plan, count(a.id) AS count
			FROM "Plan" p
			LEFT JOIN "Abonnement" a ON a."planId" = p."id"
			GROUP BY p.nom
			ORDER BY count DESC
		`)
		if qerr == nil {
			defer rowsPlans.Close()
			rep := []planCount{}
			for rowsPlans.Next() {
				var pc planCount
				if err := rowsPlans.Scan(&pc.Plan, &pc.Count); err == nil {
					rep = append(rep, pc)
				}
			}
			stats["repartitionPlans"] = rep
		}

		// 5. Répartition des abonnements par statut
		rowsStatuts, qerr := tx.Query(ctx, `
			SELECT statut::text, count(*) AS count
			FROM "Abonnement"
			GROUP BY statut
			ORDER BY count DESC
		`)
		if qerr == nil {
			defer rowsStatuts.Close()
			st := []statutCount{}
			for rowsStatuts.Next() {
				var sc statutCount
				if err := rowsStatuts.Scan(&sc.Statut, &sc.Count); err == nil {
					st = append(st, sc)
				}
			}
			stats["etablissementsParStatut"] = st
		}

		// 6. Autorisations EtablissementAccess
		var nbAutActif, nbAutAttente int
		_ = tx.QueryRow(ctx, `
			SELECT
				count(*) FILTER (WHERE statut = 'ACTIF'),
				count(*) FILTER (WHERE statut = 'EN_ATTENTE')
			FROM "EtablissementAccess"
		`).Scan(&nbAutActif, &nbAutAttente)
		stats["nbAutorisationsActives"] = nbAutActif
		stats["nbAutorisationsEnAttente"] = nbAutAttente

		// 7. nbEtablissementsProteges & nbVerificationIdentite
		// Les colonnes proctoringActif/verificationIdentite n'existent PAS
		// directement sur Etablissement (elles vivent sur SecuritySettings,
		// non jointes ici pour rester performant). On retourne 0 par défaut.
		stats["nbEtablissementsProteges"] = 0
		stats["nbVerificationIdentite"] = 0


		return nil
	})

	// BUGFIX (ADMIN-DASHBOARD-FIX-1) : la query etablissementsOverview échoue
	// via WithTx (RLS pose les claims, mais les subqueries sur User sont
	// filtrées). On refait cette query SANS RLS (transaction directe sans
	// claims) — l'admin a le droit de voir tous les établissements + users.
	if err == nil {
		tx2, txErr := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
		if txErr == nil {
			defer tx2.Rollback(ctx)
			tx2.Exec(ctx, "SET row_security = off")

			rowsEtab2, q2err := tx2.Query(ctx, `
				SELECT
					e.id, e.nom, e.ville, e.type, e.actif,
					(SELECT a.statut::text FROM "Abonnement" a
					 WHERE a."etablissementId" = e.id
					 ORDER BY a."dateDebut" DESC LIMIT 1) AS abonnement_statut,
					(SELECT p.nom FROM "Abonnement" a
					 JOIN "Plan" p ON p.id = a."planId"
					 WHERE a."etablissementId" = e.id
					 ORDER BY a."dateDebut" DESC LIMIT 1) AS plan_nom,
					(SELECT count(*) FROM "User" u WHERE u."etablissementId" = e.id) AS nb_users,
					(SELECT count(*) FROM "Filiere" f WHERE f."etablissementId" = e.id) AS nb_filieres,
					(SELECT count(*) FROM "EtablissementAccess" ea
					 WHERE ea."etablissementId" = e.id
					   AND ea."adminId" = $1
					   AND ea.statut = 'ACTIF') AS admin_has_access,
					ru.id, ru.name, ru.email, ru.actif
				FROM "Etablissement" e
				LEFT JOIN LATERAL (
					SELECT u.id, u.name, u.email, u.actif
					FROM "User" u
					WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE'
					LIMIT 1
				) ru ON true
				ORDER BY e.nom ASC
			`, claims.UserID)
			if q2err == nil {
				defer rowsEtab2.Close()
				overviews := []etablissementOverview{}
				for rowsEtab2.Next() {
					var o etablissementOverview
					var respID, respName, respEmail *string
					var respActif *bool
					if err := rowsEtab2.Scan(
						&o.ID, &o.Nom, &o.Ville, &o.Type, &o.Actif,
						&o.AbonnementStatut, &o.PlanNom,
						&o.NbUsers, &o.NbFilieres, &o.AdminHasAccess,
						&respID, &respName, &respEmail, &respActif,
					); err == nil {
						if respID != nil && respName != nil && respEmail != nil && respActif != nil {
							o.Responsable = &responsableRef{
								ID:    *respID,
								Name:  *respName,
								Email: *respEmail,
								Actif: *respActif,
							}
						}
						overviews = append(overviews, o)
					}
				}
				stats["etablissementsOverview"] = overviews
			}
			tx2.Commit(ctx)
		}
	}

	if err != nil {
		http.Error(w, `{"error":"failed to load admin stats"}`, http.StatusInternalServerError)
		return
	}

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
	// BUGFIX (ENS-AUDIT-4) : restriction au rôle RESPONSABLE (et ADMIN).
	if claims.Role != string(domain.RoleResponsable) && claims.Role != string(domain.RoleAdmin) {
		writeJSONError(w, http.StatusForbidden, "réservé au rôle RESPONSABLE")
		return
	}

	ctx := r.Context()
	// BUGFIX (RESP-AUDIT-1) : support du filtre filiereId (rapports-page.tsx).
	filiereID := r.URL.Query().Get("filiereId")
	_ = r.URL.Query().Get("dateDebut")
	_ = r.URL.Query().Get("dateFin")

	// Types de réponse (toujours initialisés avec slices vides — JAMAIS nil)
	type repartitionNote struct {
		Label string `json:"label"`
		Count int    `json:"count"`
	}
	type resultatParMatiere struct {
		Titre          string  `json:"titre"`
		Enseignant     string  `json:"enseignant"`
		Moyenne        float64 `json:"moyenne"`
		TauxReussite   float64 `json:"tauxReussite"`
		NbParticipants int     `json:"nbParticipants"`
	}
	type etudiantParFiliere struct {
		Filiere string `json:"filiere"`
		Count   int    `json:"count"`
	}
	type evolutionMoyenne struct {
		Mois          string  `json:"mois"`
		Moyenne       float64 `json:"moyenne"`
		NbEvaluations int     `json:"nbEvaluations"`
	}
	type topEnseignant struct {
		Nom          string  `json:"nom"`
		NbEpreuves   int     `json:"nbEpreuves"`
		Moyenne      float64 `json:"moyenne"`
		TauxReussite float64 `json:"tauxReussite"`
	}
	type alerteStat struct {
		Type        string `json:"type"`
		Titre       string `json:"titre"`
		Description string `json:"description"`
		Severity    string `json:"severity"`
	}
	type topEtudiant struct {
		ID      string  `json:"id"`
		Nom     string  `json:"nom"`
		Email   string  `json:"email"`
		Moyenne float64 `json:"moyenne"`
		Filiere string  `json:"filiere"`
	}

	stats := map[string]any{
		"nbEtudiants":           0,
		"nbEnseignants":         0,
		"nbEvaluations":         0,
		"tauxReussiteGlobal":    0,
		"moyenneGenerale":       0,
		"repartitionNotes":      []repartitionNote{},
		"resultatsParMatiere":   []resultatParMatiere{},
		"etudiantsParFiliere":   []etudiantParFiliere{},
		"evolutionMoyennes":     []evolutionMoyenne{},
		"topEnseignants":        []topEnseignant{},
		"alertes":               []alerteStat{},
		"topEtudiants":          []topEtudiant{},
		"etudiantsEnDifficulte": []topEtudiant{},
		"badges":                []any{},
	}

	// Clause de filtre filiere optionnelle
	filiereFilter := ""
	if filiereID != "" {
		filiereFilter = fmt.Sprintf(`AND e."filiereId" = '%s'`, filiereID)
	}

	_ = appdb.WithTx(ctx, s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. Compteurs globaux (RLS filtre par établissement)
		var nbEns, nbEtu, nbEpreuves int
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE role = 'ENSEIGNANT' AND actif = true`).Scan(&nbEns)
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE role = 'ETUDIANT' AND actif = true`).Scan(&nbEtu)
		_ = tx.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM "Epreuve" WHERE "deletedAt" IS NULL %s`, filiereFilter)).Scan(&nbEpreuves)
		stats["nbEnseignants"] = nbEns
		stats["nbEtudiants"] = nbEtu
		stats["nbEvaluations"] = nbEpreuves

		// 2. Moyenne générale + taux de réussite global
		var moyenneGen, tauxReuss float64
		_ = tx.QueryRow(ctx, fmt.Sprintf(`
			SELECT COALESCE(AVG(s.score / e."noteTotal" * 20), 0),
			       CASE WHEN count(s.id) > 0
				    THEN (count(s.id) FILTER (WHERE s.score >= e."noteTotal" * 0.5))::float / count(s.id) * 100
				    ELSE 0 END
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			WHERE s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
			  %s
		`, filiereFilter)).Scan(&moyenneGen, &tauxReuss)
		stats["moyenneGenerale"] = moyenneGen
		stats["tauxReussiteGlobal"] = tauxReuss

		// 3. Répartition des notes (6 buckets sur /20)
		rows, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT CASE
				WHEN s.score / e."noteTotal" * 20 < 8 THEN '< 8'
				WHEN s.score / e."noteTotal" * 20 < 10 THEN '8-10'
				WHEN s.score / e."noteTotal" * 20 < 12 THEN '10-12'
				WHEN s.score / e."noteTotal" * 20 < 14 THEN '12-14'
				WHEN s.score / e."noteTotal" * 20 < 16 THEN '14-16'
				ELSE '16-20'
			END AS bucket,
			count(*) AS nb
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			WHERE s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
			  %s
			GROUP BY bucket
			ORDER BY bucket
		`, filiereFilter))
		if err == nil {
			defer rows.Close()
			rep := []repartitionNote{
				{Label: "< 8", Count: 0},
				{Label: "8-10", Count: 0},
				{Label: "10-12", Count: 0},
				{Label: "12-14", Count: 0},
				{Label: "14-16", Count: 0},
				{Label: "16-20", Count: 0},
			}
			for rows.Next() {
				var b string
				var n int
				if err := rows.Scan(&b, &n); err == nil {
					for i := range rep {
						if rep[i].Label == b {
							rep[i].Count = n
						}
					}
				}
			}
			stats["repartitionNotes"] = rep
		}

		// 4. Résultats par matière (top 10 épreuves par moyenne)
		rows2, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT e.titre,
			       COALESCE(u.name, '—') AS enseignant_nom,
			       COALESCE(AVG(s.score / e."noteTotal" * 20), 0) AS moyenne,
			       CASE WHEN count(s.id) > 0
				    THEN (count(s.id) FILTER (WHERE s.score >= e."noteTotal" * 0.5))::float / count(s.id) * 100
				    ELSE 0 END AS taux_reussite,
			       count(s.id) AS nb_participants
			FROM "Epreuve" e
			LEFT JOIN "User" u ON u.id = e."enseignantId"
			LEFT JOIN "SessionPassation" s ON s."epreuveId" = e.id
			  AND s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
			WHERE e."deletedAt" IS NULL %s
			GROUP BY e.id, e.titre, u.name, e."noteTotal"
			ORDER BY moyenne DESC
			LIMIT 10
		`, filiereFilter))
		if err == nil {
			defer rows2.Close()
			mat := []resultatParMatiere{}
			for rows2.Next() {
				var m resultatParMatiere
				if err := rows2.Scan(&m.Titre, &m.Enseignant, &m.Moyenne, &m.TauxReussite, &m.NbParticipants); err == nil {
					mat = append(mat, m)
				}
			}
			stats["resultatsParMatiere"] = mat
		}

		// 5. Étudiants par filière
		rows3, err := tx.Query(ctx, `
			SELECT COALESCE(f.nom, 'Sans filière') AS filiere_nom,
			       count(u.id) AS nb
			FROM "User" u
			LEFT JOIN "Filiere" f ON f.id = u."filiereId"
			WHERE u.role = 'ETUDIANT' AND u.actif = true
			GROUP BY f.nom
			ORDER BY nb DESC
		`)
		if err == nil {
			defer rows3.Close()
			etf := []etudiantParFiliere{}
			for rows3.Next() {
				var e etudiantParFiliere
				if err := rows3.Scan(&e.Filiere, &e.Count); err == nil {
					etf = append(etf, e)
				}
			}
			stats["etudiantsParFiliere"] = etf
		}

		// 6. Évolution des moyennes (6 derniers mois)
		rows4, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT to_char(date_trunc('month', s."updatedAt"), 'YYYY-MM') AS mois,
			       COALESCE(AVG(s.score / e."noteTotal" * 20), 0) AS moyenne,
			       count(*) AS nb_evaluations
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e.id = s."epreuveId"
			WHERE s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
			  AND s."updatedAt" > now() - interval '6 months'
			  %s
			GROUP BY mois
			ORDER BY mois ASC
		`, filiereFilter))
		if err == nil {
			defer rows4.Close()
			evol := []evolutionMoyenne{}
			for rows4.Next() {
				var e evolutionMoyenne
				if err := rows4.Scan(&e.Mois, &e.Moyenne, &e.NbEvaluations); err == nil {
					evol = append(evol, e)
				}
			}
			stats["evolutionMoyennes"] = evol
		}

		// 7. Top enseignants (par moyenne)
		rows5, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT u.name,
			       count(DISTINCT e.id) AS nb_epreuves,
			       COALESCE(AVG(s.score / e."noteTotal" * 20), 0) AS moyenne,
			       CASE WHEN count(s.id) > 0
				    THEN (count(s.id) FILTER (WHERE s.score >= e."noteTotal" * 0.5))::float / count(s.id) * 100
				    ELSE 0 END AS taux_reussite
			FROM "User" u
			JOIN "Epreuve" e ON e."enseignantId" = u.id AND e."deletedAt" IS NULL
			LEFT JOIN "SessionPassation" s ON s."epreuveId" = e.id
			  AND s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
			WHERE u.role = 'ENSEIGNANT' AND u.actif = true %s
			GROUP BY u.id, u.name
			ORDER BY moyenne DESC
			LIMIT 5
		`, filiereFilter))
		if err == nil {
			defer rows5.Close()
			top := []topEnseignant{}
			for rows5.Next() {
				var t topEnseignant
				if err := rows5.Scan(&t.Nom, &t.NbEpreuves, &t.Moyenne, &t.TauxReussite); err == nil {
					top = append(top, t)
				}
			}
			stats["topEnseignants"] = top
		}

		// 8. Top étudiants (par moyenne)
		rows6, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT u.id, u.name, u.email,
			       COALESCE(AVG(s.score / e."noteTotal" * 20), 0) AS moyenne,
			       COALESCE(f.nom, '—') AS filiere_nom
			FROM "User" u
			JOIN "SessionPassation" s ON s."etudiantId" = u.id
			  AND s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
			LEFT JOIN "Filiere" f ON f.id = u."filiereId"
			WHERE u.role = 'ETUDIANT' %s
			GROUP BY u.id, u.name, u.email, f.nom
			ORDER BY moyenne DESC
			LIMIT 5
		`, filiereFilter))
		if err == nil {
			defer rows6.Close()
			topE := []topEtudiant{}
			for rows6.Next() {
				var t topEtudiant
				if err := rows6.Scan(&t.ID, &t.Nom, &t.Email, &t.Moyenne, &t.Filiere); err == nil {
					topE = append(topE, t)
				}
			}
			stats["topEtudiants"] = topE
		}

		// 9. Étudiants en difficulté (moyenne < 8/20)
		rows7, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT u.id, u.name, u.email,
			       COALESCE(AVG(s.score / e."noteTotal" * 20), 0) AS moyenne,
			       COALESCE(f.nom, '—') AS filiere_nom
			FROM "User" u
			JOIN "SessionPassation" s ON s."etudiantId" = u.id
			  AND s.statut IN ('CORRIGEE', 'RETOURNEE') AND s.score IS NOT NULL
			LEFT JOIN "Filiere" f ON f.id = u."filiereId"
			WHERE u.role = 'ETUDIANT' %s
			GROUP BY u.id, u.name, u.email, f.nom
			HAVING AVG(s.score / e."noteTotal" * 20) < 8
			ORDER BY moyenne ASC
			LIMIT 5
		`, filiereFilter))
		if err == nil {
			defer rows7.Close()
			diff := []topEtudiant{}
			for rows7.Next() {
				var t topEtudiant
				if err := rows7.Scan(&t.ID, &t.Nom, &t.Email, &t.Moyenne, &t.Filiere); err == nil {
					diff = append(diff, t)
				}
			}
			stats["etudiantsEnDifficulte"] = diff
		}

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

	ctx := r.Context()

	// Types de réponse (toujours initialisés avec slices vides — JAMAIS nil)
	type niveauSeuil struct {
		Niveau string `json:"niveau"`
		Seuil  int    `json:"seuil"`
	}
	type badgeWithProgress struct {
		ID             string        `json:"id"`
		Cle            string        `json:"cle"`
		Titre          string        `json:"titre"`
		Description    string        `json:"description"`
		Icone          string        `json:"icone"`
		Categorie      string        `json:"categorie"`
		RoleCible      string        `json:"roleCible"`
		NiveauActuel   *string       `json:"niveauActuel"`
		ValeurActuelle int           `json:"valeurActuelle"`
		ValeurPalier   int           `json:"valeurPalier"`
		ValeurProchain *int          `json:"valeurProchain"`
		Debloque       bool          `json:"debloque"`
		DateObtention  *string       `json:"dateObtention,omitempty"`
		Niveaux        []niveauSeuil `json:"niveaux"`
		Progression    float64       `json:"progression"`
	}

	stats := map[string]any{
		"badges":        []badgeWithProgress{},
		"stats":         map[string]any{"total": 0, "unlocked": 0, "locked": 0, "progress": 0},
		"newlyUnlocked": []badgeWithProgress{},
	}

	// POST = recalculer (no-op pour l'instant).
	_ = ctx

	errBadges := appdb.WithTx(ctx, s.dbPool, claims, func(tx pgx.Tx) error {
		// BUGFIX (BADGES-FIX-1) : LEFT JOIN BadgeProgression + array_to_string
		// pour éviter le scan direct de NiveauBadge[] (incompatible pgx).
		rows, err := tx.Query(ctx, `
			SELECT bd."id", bd."cle", bd."titre", bd."description", bd."icone",
			       bd."categorie"::text, trim(bd."roleCible"::text) AS "roleCible",
			       array_to_string(bd."niveaux", ',') AS niveaux_str,
			       bp."niveauActuel"::text, bp."valeurActuelle", bp."valeurPalier",
			       bp."valeurProchain", bp."debloque", bp."dateObtention"
			FROM "BadgeDefinition" bd
			LEFT JOIN "BadgeProgression" bp ON bp."badgeDefinitionId" = bd."id"
			  AND bp."userId" = $1
			WHERE bd."actif" = true
			  AND (bd."roleCible" IS NULL OR trim(bd."roleCible"::text) = $2 OR trim(bd."roleCible"::text) = '')
			ORDER BY bd."ordre" ASC
		`, claims.UserID, claims.Role)
		if err != nil {
			return fmt.Errorf("query badges: %w", err)
		}
		defer rows.Close()

		badges := []badgeWithProgress{}
		unlocked := 0
		for rows.Next() {
			b := badgeWithProgress{Niveaux: []niveauSeuil{}}
			var niveauxStr *string
			var niveauActuel *string
			var valeurProchain *int
			var dateObtention *time.Time
			var valeurActuelle, valeurPalier *int
			var debloque *bool
			err := rows.Scan(
				&b.ID, &b.Cle, &b.Titre, &b.Description, &b.Icone,
				&b.Categorie, &b.RoleCible, &niveauxStr,
				&niveauActuel, &valeurActuelle, &valeurPalier,
				&valeurProchain, &debloque, &dateObtention,
			)
			if err != nil {
				return fmt.Errorf("scan badge: %w", err)
			}
			b.NiveauActuel = niveauActuel
			b.ValeurProchain = valeurProchain
			if valeurActuelle != nil {
				b.ValeurActuelle = *valeurActuelle
			}
			if valeurPalier != nil {
				b.ValeurPalier = *valeurPalier
			}
			if debloque != nil {
				b.Debloque = *debloque
			}
			if dateObtention != nil {
				ts := dateObtention.UTC().Format(time.RFC3339)
				b.DateObtention = &ts
			}

			defaultSeuils := map[string]int{"BRONZE": 1, "ARGENT": 5, "OR": 10, "DIAMANT": 25}
			if niveauxStr != nil && *niveauxStr != "" {
				for _, n := range strings.Split(*niveauxStr, ",") {
					n = strings.TrimSpace(n)
					if n == "" {
						continue
					}
					seuil := defaultSeuils[n]
					if seuil == 0 {
						seuil = 1
					}
					b.Niveaux = append(b.Niveaux, niveauSeuil{Niveau: n, Seuil: seuil})
				}
			}

			if b.ValeurPalier > 0 {
				b.Progression = (float64(b.ValeurActuelle) / float64(b.ValeurPalier)) * 100
				if b.Progression > 100 {
					b.Progression = 100
				}
			} else if b.Debloque {
				b.Progression = 100
			}

			if b.Debloque {
				unlocked++
			}
			badges = append(badges, b)
		}

		stats["badges"] = badges
		total := len(badges)
		locked := total - unlocked
		progress := 0
		if total > 0 {
			progress = (unlocked * 100) / total
		}
		stats["stats"] = map[string]any{
			"total":    total,
			"unlocked": unlocked,
			"locked":   locked,
			"progress": progress,
		}
		return nil
	})
	if errBadges != nil {
		stats["error"] = errBadges.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

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
