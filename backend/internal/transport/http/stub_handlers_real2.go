// Package http — implémentation des stubs restants (STUBS-FIX-2).
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
// 1. GET /api/security-settings — SecuritySettings (1 row en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) securitySettingsGetReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type secSettings struct {
		ID                    string  `json:"id"`
		EtablissementID       string  `json:"etablissementId"`
		ProctoringActif      bool    `json:"proctoringActif"`
		DetectionCopie       bool    `json:"detectionCopie"`
		DetectionOnglet      bool    `json:"detectionOnglet"`
		DetectionFullscreen  bool    `json:"detectionFullscreen"`
		BlocageCopie         bool    `json:"blocageCopie"`
		BlocageClicDroit     bool    `json:"blocageClicDroit"`
		BlocageImpression    bool    `json:"blocageImpression"`
		VerificationIdentite bool    `json:"verificationIdentite"`
		TempsInactiviteMax   int     `json:"tempsInactiviteMax"`
		NbOngletsMax         int     `json:"nbOngletsMax"`
		NbAlertesMax         int     `json:"nbAlertesMax"`
		AutoSubmitOnViolation bool   `json:"autoSubmitOnViolation"`
		CaptureEcran         bool    `json:"captureEcran"`
		RapportFraude        bool    `json:"rapportFraude"`
		SeuilSimilarite      float64 `json:"seuilSimilarite"`
		PenaliteFullscreenExit int   `json:"penaliteFullscreenExit"`
		FullscreenObligatoire bool   `json:"fullscreenObligatoire"`
		IntervalleCaptureEcran int   `json:"intervalleCaptureEcran"`
	}

	result := &secSettings{}
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// Scope par etablissementId si fourni, sinon prendre le 1er
		etabID := r.URL.Query().Get("etablissementId")
		var row pgx.Row
		if etabID != "" {
			row = tx.QueryRow(r.Context(), `
				SELECT "id", "etablissementId", "proctoringActif", "detectionCopie",
				       "detectionOnglet", "detectionFullscreen", "blocageCopie",
				       "blocageClicDroit", "blocageImpression", "verificationIdentite",
				       "tempsInactiviteMax", "nbOngletsMax", "nbAlertesMax",
				       "autoSubmitOnViolation", "captureEcran", "rapportFraude",
				       "seuilSimilarite", "penaliteFullscreenExit", "fullscreenObligatoire",
				       "intervalleCaptureEcran"
				FROM "SecuritySettings" WHERE "etablissementId" = $1
			`, etabID)
		} else {
			row = tx.QueryRow(r.Context(), `
				SELECT "id", "etablissementId", "proctoringActif", "detectionCopie",
				       "detectionOnglet", "detectionFullscreen", "blocageCopie",
				       "blocageClicDroit", "blocageImpression", "verificationIdentite",
				       "tempsInactiviteMax", "nbOngletsMax", "nbAlertesMax",
				       "autoSubmitOnViolation", "captureEcran", "rapportFraude",
				       "seuilSimilarite", "penaliteFullscreenExit", "fullscreenObligatoire",
				       "intervalleCaptureEcran"
				FROM "SecuritySettings" ORDER BY "updatedAt" DESC LIMIT 1
			`)
		}
		err := row.Scan(
			&result.ID, &result.EtablissementID, &result.ProctoringActif, &result.DetectionCopie,
			&result.DetectionOnglet, &result.DetectionFullscreen, &result.BlocageCopie,
			&result.BlocageClicDroit, &result.BlocageImpression, &result.VerificationIdentite,
			&result.TempsInactiviteMax, &result.NbOngletsMax, &result.NbAlertesMax,
			&result.AutoSubmitOnViolation, &result.CaptureEcran, &result.RapportFraude,
			&result.SeuilSimilarite, &result.PenaliteFullscreenExit, &result.FullscreenObligatoire,
			&result.IntervalleCaptureEcran,
		)
		if err == nil {
			found = true
		}
		return nil
	})

	if !found {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"settings": map[string]any{}})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"settings": result})
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GET /api/surveillance/stats — SessionPassation (34 rows en DB)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) surveillanceStatsReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type suspItem struct {
		SessionID    string  `json:"sessionId"`
		EtudiantNom  string  `json:"etudiantNom"`
		EpreuveTitre string  `json:"epreuveTitre"`
		Alertes      int     `json:"alertes"`
		Score        *float64 `json:"score,omitempty"`
	}

	stats := map[string]any{
		"sessionsActives": 0,
		"alertes":         0,
		"suspicious":      []suspItem{},
	}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		var actives, alertes int
		_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "SessionPassation" WHERE statut = 'EN_COURS'`).Scan(&actives)
		_ = tx.QueryRow(r.Context(), `SELECT COALESCE(sum("alertes"), 0) FROM "SessionPassation" WHERE "alertes" > 0`).Scan(&alertes)
		stats["sessionsActives"] = actives
		stats["alertes"] = alertes

		// Sessions suspectes (alertes > 0)
		rows, err := tx.Query(r.Context(), `
			SELECT s."id", u."name", e."titre", s."alertes", s."score"
			FROM "SessionPassation" s
			LEFT JOIN "User" u ON u."id" = s."etudiantId"
			LEFT JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE s."alertes" > 0
			ORDER BY s."alertes" DESC
			LIMIT 20
		`)
		if err != nil {
			return nil
		}
		defer rows.Close()
		susp := []suspItem{}
		for rows.Next() {
			si := suspItem{}
			if err := rows.Scan(&si.SessionID, &si.EtudiantNom, &si.EpreuveTitre, &si.Alertes, &si.Score); err == nil {
				if si.EtudiantNom == "" {
					si.EtudiantNom = "—"
				}
				if si.EpreuveTitre == "" {
					si.EpreuveTitre = "—"
				}
				susp = append(susp, si)
			}
		}
		stats["suspicious"] = susp
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// ──────────────────────────────────────────────────────────────────────────
// 3. GET /api/etudiants — User (ETUDIANT) avec filiere + niveau
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) etudiantsListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type etudiant struct {
		ID          string  `json:"id"`
		Name        string  `json:"name"`
		Email       string  `json:"email"`
		Matricule   *string `json:"matricule,omitempty"`
		Actif       bool    `json:"actif"`
		FiliereID   *string `json:"filiereId,omitempty"`
		Niveau      *string `json:"niveau,omitempty"`
		Filiere     *struct {
			ID  string `json:"id"`
			Nom string `json:"nom"`
		} `json:"filiere,omitempty"`
	}

	result := []etudiant{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		search := r.URL.Query().Get("search")
		filiereID := r.URL.Query().Get("filiereId")
		limit := 100
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 500 {
				limit = n
			}
		}

		var args []any
		argIdx := 1
		var where []string
		where = append(where, `u."role" = 'ETUDIANT'`)
		if search != "" {
			where = append(where, fmt.Sprintf(`(u."name" ILIKE $%d OR u."email" ILIKE $%d OR u."matricule" ILIKE $%d)`, argIdx, argIdx, argIdx))
			args = append(args, "%"+search+"%")
			argIdx++
		}
		if filiereID != "" {
			where = append(where, fmt.Sprintf(`u."filiereId" = $%d`, argIdx))
			args = append(args, filiereID)
			argIdx++
		}

		query := fmt.Sprintf(`
			SELECT u."id", u."name", u."email", u."matricule", u."actif",
			       u."filiereId", u."niveau", f."id", f."nom"
			FROM "User" u
			LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
			WHERE %s
			ORDER BY u."name"
			LIMIT $%d
		`, joinStringsArr(where, " AND "), argIdx)
		args = append(args, limit)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			e := etudiant{}
			var filID, filNom *string
			if err := rows.Scan(&e.ID, &e.Name, &e.Email, &e.Matricule, &e.Actif,
				&e.FiliereID, &e.Niveau, &filID, &filNom); err != nil {
				return err
			}
			if filID != nil && filNom != nil {
				e.Filiere = &struct {
					ID  string `json:"id"`
					Nom string `json:"nom"`
				}{ID: *filID, Nom: *filNom}
			}
			result = append(result, e)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"etudiants": result,
		"total":     len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 4. GET /api/factures — Facture (0 row, mais endpoint réel pour futures données)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) facturesListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type facture struct {
		ID              string   `json:"id"`
		EtablissementID string   `json:"etablissementId"`
		AbonnementID    *string  `json:"abonnementId,omitempty"`
		Montant         float64  `json:"montant"`
		Statut          string   `json:"statut"`
		DateFacture     string   `json:"dateFacture"`
		DatePaiement    *string  `json:"datePaiement,omitempty"`
	}

	result := []facture{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `
			SELECT "id", "etablissementId", "abonnementId", "montant",
			       "statut"::text, "dateFacture", "datePaiement"
			FROM "Facture"
			ORDER BY "dateFacture" DESC
			LIMIT 100
		`)
		if err != nil {
			return nil // table peut ne pas exister ou colonnes différentes
		}
		defer rows.Close()
		for rows.Next() {
			f := facture{}
			var dateFacture time.Time
			var datePaiement *time.Time
			if err := rows.Scan(&f.ID, &f.EtablissementID, &f.AbonnementID, &f.Montant,
				&f.Statut, &dateFacture, &datePaiement); err == nil {
				f.DateFacture = dateFacture.UTC().Format(time.RFC3339)
				if datePaiement != nil {
					ts := datePaiement.UTC().Format(time.RFC3339)
					f.DatePaiement = &ts
				}
				result = append(result, f)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"factures": result,
		"total":    len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 5. GET /api/monitoring — MonitoringEvent (0 row)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) monitoringEventsReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type event struct {
		ID        string  `json:"id"`
		Type      string  `json:"type"`
		Severity  string  `json:"severity"`
		Message   string  `json:"message"`
		Resolved  bool    `json:"resolved"`
		CreatedAt string  `json:"createdAt"`
	}

	result := []event{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `
			SELECT "id", "type"::text, "severity"::text, "message", "resolved", "createdAt"
			FROM "MonitoringEvent"
			ORDER BY "createdAt" DESC
			LIMIT 100
		`)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			e := event{}
			var createdAt time.Time
			if err := rows.Scan(&e.ID, &e.Type, &e.Severity, &e.Message, &e.Resolved, &createdAt); err == nil {
				e.CreatedAt = createdAt.UTC().Format(time.RFC3339)
				result = append(result, e)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"events": result,
		"total":  len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 6. GET /api/ip-whitelist — IpWhitelist (0 row)
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) ipWhitelistListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type ipEntry struct {
		ID          string  `json:"id"`
		AdresseIP   string  `json:"adresseIp"`
		Description *string `json:"description,omitempty"`
		Actif       bool    `json:"actif"`
		CreatedAt   string  `json:"createdAt"`
	}

	result := []ipEntry{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `
			SELECT "id", "adresseIp", "description", "actif", "createdAt"
			FROM "IpWhitelist"
			ORDER BY "createdAt" DESC
		`)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			ip := ipEntry{}
			var createdAt time.Time
			if err := rows.Scan(&ip.ID, &ip.AdresseIP, &ip.Description, &ip.Actif, &createdAt); err == nil {
				ip.CreatedAt = createdAt.UTC().Format(time.RFC3339)
				result = append(result, ip)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ips":   result,
		"total": len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 7. GET /api/corbeille — soft-deleted items (Epreuve + Document + Question)
// ──────────────────────────────────────────────────────────────────────────

// BUGFIX (CORBEILLE-1) : la fonction retournait {items, total} (flat) mais le
// frontend attend {documents, questions, epreuves, devoirs, totalCount}
// (regroupé par type). De plus, la query Question utilisait "intitule"
// (inexistant) au lieu de "enonce" → erreur SQL silencieuse (if err == nil).
// Les Devoirs n'etaient jamais listés. Corrigé : bon contrat, bonnes
// colonnes, devoirs ajoutés, erreurs SQL ne sont plus ignorées.
func (s *Server) corbeilleListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type deletedDocument struct {
		ID            string  `json:"id"`
		NomFichier    string  `json:"nomFichier"`
		TailleFichier *int64  `json:"tailleFichier"`
		TypeMime      *string `json:"typeMime"`
		DateUpload    string  `json:"dateUpload"`
		DeletedAt     string  `json:"deletedAt"`
	}
	type deletedQuestion struct {
		ID          string `json:"id"`
		Type        string `json:"type"`
		Enonce      string `json:"enonce"`
		Difficulte  string `json:"difficulte"`
		Validee     bool   `json:"validee"`
		DeletedAt   string `json:"deletedAt"`
		DocumentID  *string `json:"documentId,omitempty"`
		DocumentNom *string `json:"documentNom,omitempty"`
	}
	type deletedEpreuve struct {
		ID        string `json:"id"`
		Titre     string `json:"titre"`
		Duree     int    `json:"duree"`
		Statut    string `json:"statut"`
		DateDebut string `json:"dateDebut"`
		DateFin   string `json:"dateFin"`
		DeletedAt string `json:"deletedAt"`
	}
	type deletedDevoir struct {
		ID         string  `json:"id"`
		Titre      string  `json:"titre"`
		DateLimite *string `json:"dateLimite"`
		Statut     string  `json:"statut"`
		NoteMax    float64 `json:"noteMax"`
		DeletedAt  string  `json:"deletedAt"`
	}

	var documents []deletedDocument
	var questions []deletedQuestion
	var epreuves []deletedEpreuve
	var devoirs []deletedDevoir

	txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// Epreuves supprimées
		rows, err := tx.Query(r.Context(), `
			SELECT "id", "titre", "duree", "statut", "dateDebut", "dateFin", "deletedAt"
			FROM "Epreuve" WHERE "deletedAt" IS NOT NULL
			ORDER BY "deletedAt" DESC
		`)
		if err != nil {
			return fmt.Errorf("query epreuves corbeille: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var e deletedEpreuve
			var deletedAt time.Time
			if err := rows.Scan(&e.ID, &e.Titre, &e.Duree, &e.Statut, &e.DateDebut, &e.DateFin, &deletedAt); err != nil {
				return fmt.Errorf("scan epreuve corbeille: %w", err)
			}
			e.DeletedAt = deletedAt.UTC().Format(time.RFC3339)
			epreuves = append(epreuves, e)
		}

		// Documents supprimés
		rows2, err := tx.Query(r.Context(), `
			SELECT "id", "nomFichier", "tailleFichier", "typeMime", "dateUpload", "deletedAt"
			FROM "Document" WHERE "deletedAt" IS NOT NULL
			ORDER BY "deletedAt" DESC
		`)
		if err != nil {
			return fmt.Errorf("query documents corbeille: %w", err)
		}
		defer rows2.Close()
		for rows2.Next() {
			var d deletedDocument
			var deletedAt time.Time
			if err := rows2.Scan(&d.ID, &d.NomFichier, &d.TailleFichier, &d.TypeMime, &d.DateUpload, &deletedAt); err != nil {
				return fmt.Errorf("scan document corbeille: %w", err)
			}
			d.DeletedAt = deletedAt.UTC().Format(time.RFC3339)
			documents = append(documents, d)
		}

		// Questions supprimées — BUGFIX: "enonce" (pas "intitule") + LEFT JOIN Document
		rows3, err := tx.Query(r.Context(), `
			SELECT q."id", q."type", q."enonce", q."difficulte", q."validee", q."deletedAt",
			q."documentId", doc."nomFichier"
			FROM "Question" q
			LEFT JOIN "Document" doc ON doc."id" = q."documentId"
			WHERE q."deletedAt" IS NOT NULL
			ORDER BY q."deletedAt" DESC
		`)
		if err != nil {
			return fmt.Errorf("query questions corbeille: %w", err)
		}
		defer rows3.Close()
		for rows3.Next() {
			var q deletedQuestion
			var deletedAt time.Time
			if err := rows3.Scan(&q.ID, &q.Type, &q.Enonce, &q.Difficulte, &q.Validee, &deletedAt, &q.DocumentID, &q.DocumentNom); err != nil {
				return fmt.Errorf("scan question corbeille: %w", err)
			}
			q.DeletedAt = deletedAt.UTC().Format(time.RFC3339)
			questions = append(questions, q)
		}

		// Devoirs supprimés — BUGFIX: table Devoir non listée auparavant
		rows4, err := tx.Query(r.Context(), `
			SELECT "id", "titre", "dateLimite", "statut", "noteMax", "deletedAt"
			FROM "Devoir" WHERE "deletedAt" IS NOT NULL
			ORDER BY "deletedAt" DESC
		`)
		if err != nil {
			return fmt.Errorf("query devoirs corbeille: %w", err)
		}
		defer rows4.Close()
		for rows4.Next() {
			var dv deletedDevoir
			var deletedAt time.Time
			if err := rows4.Scan(&dv.ID, &dv.Titre, &dv.DateLimite, &dv.Statut, &dv.NoteMax, &deletedAt); err != nil {
				return fmt.Errorf("scan devoir corbeille: %w", err)
			}
			dv.DeletedAt = deletedAt.UTC().Format(time.RFC3339)
			devoirs = append(devoirs, dv)
		}
		return nil
	})
	if txErr != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur interne")
		return
	}

	// Si nil, retourner un tableau vide (pas null) pour le frontend
	if documents == nil {
		documents = []deletedDocument{}
	}
	if questions == nil {
		questions = []deletedQuestion{}
	}
	if epreuves == nil {
		epreuves = []deletedEpreuve{}
	}
	if devoirs == nil {
		devoirs = []deletedDevoir{}
	}
	totalCount := len(documents) + len(questions) + len(epreuves) + len(devoirs)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"documents":  documents,
		"questions":  questions,
		"epreuves":   epreuves,
		"devoirs":    devoirs,
		"totalCount": totalCount,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 7b. POST /api/corbeille/restore — Restaurer des éléments supprimés
// ──────────────────────────────────────────────────────────────────────────

// BUGFIX (CORBEILLE-1) : endpoint manquant — le frontend appelait
// POST /api/corbeille/restore qui n'existait pas → 404 → restauration impossible.
func (s *Server) corbeilleRestore(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		Items []struct {
			ID   string `json:"id"`
			Type string `json:"type"` // document | question | epreuve | devoir
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if len(body.Items) == 0 {
		writeJSONError(w, http.StatusBadRequest, "items requis")
		return
	}

	restored := 0
	var errors []string
	txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		for _, item := range body.Items {
			var tableName string
			switch item.Type {
				case "epreuve":
					tableName = "Epreuve"
				case "document":
					tableName = "Document"
				case "question":
					tableName = "Question"
				case "devoir":
					tableName = "Devoir"
				default:
					errors = append(errors, "type inconnu: "+item.Type)
					continue
			}
			// Restore: set deletedAt = NULL. Utiliser fmt.Sprintf pour le nom de table
			// (safe car c'est un switch contrôlé, pas une input utilisateur).
			query := fmt.Sprintf(`UPDATE "%s" SET "deletedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "deletedAt" IS NOT NULL`, tableName)
			tag, err := tx.Exec(r.Context(), query, item.ID)
			if err != nil {
				errors = append(errors, fmt.Sprintf("restore %s %s: %v", item.Type, item.ID, err))
				continue
			}
			if tag.RowsAffected() > 0 {
				restored++
			}
		}
		return nil
	})
	if txErr != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur interne")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message":  fmt.Sprintf("%d élément(s) restauré(s)", restored),
		"restored": restored,
		"errors":   errors,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 7c. DELETE /api/corbeille/purge — Suppression définitive
// ──────────────────────────────────────────────────────────────────────────

// BUGFIX (CORBEILLE-1) : endpoint manquant — le frontend appelait
// DELETE /api/corbeille/purge qui n'existait pas → 404 → purge impossible.
func (s *Server) corbeillePurge(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		Items []struct {
			ID   string `json:"id"`
			Type string `json:"type"` // document | question | epreuve | devoir
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if len(body.Items) == 0 {
		writeJSONError(w, http.StatusBadRequest, "items requis")
		return
	}

	purged := 0
	var errors []string
	txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		for _, item := range body.Items {
			var tableName string
			switch item.Type {
				case "epreuve":
					tableName = "Epreuve"
				case "document":
					tableName = "Document"
				case "question":
					tableName = "Question"
				case "devoir":
					tableName = "Devoir"
				default:
					errors = append(errors, "type inconnu: "+item.Type)
					continue
			}
			// Hard delete: DELETE définitif. Safe (switch contrôlé).
			query := fmt.Sprintf(`DELETE FROM "%s" WHERE "id" = $1 AND "deletedAt" IS NOT NULL`, tableName)
			tag, err := tx.Exec(r.Context(), query, item.ID)
			if err != nil {
				errors = append(errors, fmt.Sprintf("purge %s %s: %v", item.Type, item.ID, err))
				continue
			}
			if tag.RowsAffected() > 0 {
				purged++
			}
		}
		return nil
	})
	if txErr != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur interne")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message": fmt.Sprintf("%d élément(s) supprimé(s) définitivement", purged),
		"purged": purged,
		"errors": errors,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 8. GET /api/devoirs — Devoir (0 row) + LEFT JOIN UE
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) devoirsListReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type devoir struct {
		ID          string  `json:"id"`
		Titre       string  `json:"titre"`
		Description *string `json:"description,omitempty"`
		Statut      string  `json:"statut"`
		DateLimite  *string `json:"dateLimite,omitempty"`
		UEID        *string `json:"uniteEnseignementId,omitempty"`
	}

	result := []devoir{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		enseignantID := r.URL.Query().Get("enseignantId")
		etudiantID := r.URL.Query().Get("etudiantId")

		var args []any
		argIdx := 1
		var where []string
		where = append(where, `d."deletedAt" IS NULL`)
		if enseignantID != "" {
			where = append(where, fmt.Sprintf(`d."enseignantId" = $%d`, argIdx))
			args = append(args, enseignantID)
			argIdx++
		}
		if etudiantID != "" {
			where = append(where, fmt.Sprintf(`d."etudiantId" = $%d`, argIdx))
			args = append(args, etudiantID)
			argIdx++
		}

		query := fmt.Sprintf(`
			SELECT d."id", d."titre", d."description", d."statut"::text,
			       d."dateLimite", d."uniteEnseignementId"
			FROM "Devoir" d
			WHERE %s
			ORDER BY d."createdAt" DESC
			LIMIT 100
		`, joinStringsArr(where, " AND "))

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			d := devoir{}
			var dateLimite *time.Time
			if err := rows.Scan(&d.ID, &d.Titre, &d.Description, &d.Statut, &dateLimite, &d.UEID); err == nil {
				if dateLimite != nil {
					ts := dateLimite.UTC().Format(time.RFC3339)
					d.DateLimite = &ts
				}
				result = append(result, d)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"devoirs": result,
		"total":   len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 9. GET /api/devoirs/stats — Devoir stats
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) devoirsStatsReal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	stats := map[string]any{
		"total":    0,
		"enCours":  0,
		"corriges": 0,
	}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		var total, enCours, corriges int
		_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Devoir" WHERE "deletedAt" IS NULL`).Scan(&total)
		_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Devoir" WHERE "deletedAt" IS NULL AND "statut"::text = 'EN_COURS'`).Scan(&enCours)
		_ = tx.QueryRow(r.Context(), `SELECT count(*) FROM "Devoir" WHERE "deletedAt" IS NULL AND "statut"::text = 'CORRIGE'`).Scan(&corriges)
		stats["total"] = total
		stats["enCours"] = enCours
		stats["corriges"] = corriges
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// ──────────────────────────────────────────────────────────────────────────
// Helper: joinStringsArr (évite conflit avec joinStrings de affectation_handlers.go)
// ──────────────────────────────────────────────────────────────────────────

func joinStringsArr(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}
