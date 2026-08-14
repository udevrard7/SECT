// Package http — implémentation des stubs cachés restants (STUBS-FIX-3).
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
		ID          string `json:"id"`
		Titre       string `json:"titre"`
		Description string `json:"description"`
		Severity    string `json:"severity"`
		Type        string `json:"type"`
		Lue         bool   `json:"lue"`
		CreatedAt   string `json:"createdAt"`
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
			whereClause += ` AND "lue" = false`
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
	_ = json.NewEncoder(w).Encode(map[string]any{
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

	// MES-ETUDIANTS-REFOUND-1 : filière + niveau OBLIGATOIRES.
	// Avant, la liste s'affichait immédiatement (tous les étudiants de
	// l'enseignant). Désormais, l'enseignant doit choisir une filière ET un
	// niveau avant que la liste ne se charge (gate côté frontend + backend).
	filiereID := r.URL.Query().Get("filiereId")
	niveau := r.URL.Query().Get("niveau")
	if filiereID == "" || niveau == "" {
		writeJSONError(w, http.StatusBadRequest, "filiereId et niveau sont requis (sélectionnez une filière et un niveau)")
		return
	}

	// MES-ETUDIANTS-REFOUND-1 : scoping STRICT par UE affectée (Affectation).
	// Avant, le scoping se faisait par filière (JOIN EnseignantFiliere) — trop
	// large : un enseignant voyait TOUS les étudiants de sa filière même s'il
	// n'avait qu'une seule UE affectée. Désormais, un étudiant n'est visible
	// que si son couple (filiereId, niveau) correspond à au moins une UE
	// affectée à l'enseignant via la table Affectation. Les UE multi-niveaux
	// (champ JSON niveaux) et multi-filières (UniteEnseignementFiliere) sont
	// prises en compte.
	type filiereRef struct {
		ID   string `json:"id"`
		Nom  string `json:"nom"`
		Code string `json:"code,omitempty"`
	}
	type ueRef struct {
		ID   string `json:"id"`
		Code string `json:"code"`
		Nom  string `json:"nom"`
	}
	type etudiant struct {
		ID                string      `json:"id"`
		Name              string      `json:"name"`
		Email             string      `json:"email"`
		Matricule         *string     `json:"matricule,omitempty"`
		Niveau            *string     `json:"niveau,omitempty"`
		FiliereID         *string     `json:"filiereId,omitempty"`
		Filiere           *filiereRef `json:"filiere,omitempty"`
		NbEpreuves        int         `json:"nbEpreuves"`
		DerniereConnexion *string     `json:"derniereConnexion,omitempty"`
		UEs               []ueRef     `json:"ues,omitempty"` // UEs de l'enseignant que cet étudiant suit
	}

	result := []etudiant{}
	txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		search := r.URL.Query().Get("search")
		limit := 100
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 500 {
				limit = n
			}
		}

		// Construction des args : $1=enseignantId, $2=filiereId, $3=niveau, puis search/limit
		var args []any
		args = append(args, enseignantID, filiereID, niveau)
		argIdx := 4

		var where []string
		if search != "" {
			where = append(where, fmt.Sprintf(`(u."name" ILIKE $%d OR u."email" ILIKE $%d OR u."matricule" ILIKE $%d)`, argIdx, argIdx, argIdx))
			args = append(args, "%"+search+"%")
			argIdx++
		}

		whereClause := ""
		if len(where) > 0 {
			whereClause = " AND " + strings.Join(where, " AND ")
		}

		// Scoping UE strict : l'étudiant est visible ssi il existe une Affectation
		// de l'enseignant sur une UE dont (filiereId, niveau) matche l'étudiant,
		// soit via l'UE principale (ue.filiereId + ue.niveau/niveaux), soit via
		// une filière secondaire (UniteEnseignementFiliere).
		query := fmt.Sprintf(`
                        SELECT DISTINCT u."id", u."name", u."email", u."matricule", u."niveau",
                               u."filiereId", f."id", f."nom", f."code",
                               COALESCE((SELECT count(DISTINCT s."epreuveId")
                                         FROM "SessionPassation" s
                                         JOIN "Epreuve" e ON e."id" = s."epreuveId"
                                         WHERE s."etudiantId" = u."id" AND e."enseignantId" = $1
                                           AND e."deletedAt" IS NULL), 0) AS nb_epreuves,
                               u."derniereConnexion"
                        FROM "User" u
                        LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
                        WHERE u."role" = 'ETUDIANT' AND u."actif" = true
                          AND u."filiereId" = $2
                          AND u."niveau" = $3
                          AND EXISTS (
                            SELECT 1
                            FROM "Affectation" a
                            JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
                            WHERE a."enseignantId" = $1
                              AND (
                                ue."filiereId" = u."filiereId"
                                OR EXISTS (
                                  SELECT 1 FROM "UniteEnseignementFiliere" uef
                                  WHERE uef."uniteEnseignementId" = ue."id"
                                    AND uef."filiereId" = u."filiereId"
                                )
                              )
                              AND (
                                ue."niveau" = u."niveau"
                                OR ue."niveaux"::jsonb ? u."niveau"::text
                              )
                          )
                          %s
                        ORDER BY u."name"
                        LIMIT $%d
                `, whereClause, argIdx)
		args = append(args, limit)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return fmt.Errorf("query etudiants: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			e := etudiant{}
			var filID, filNom, filCode *string
			var dernConn *time.Time
			if err := rows.Scan(&e.ID, &e.Name, &e.Email, &e.Matricule, &e.Niveau,
				&e.FiliereID, &filID, &filNom, &filCode,
				&e.NbEpreuves, &dernConn); err != nil {
				return fmt.Errorf("scan etudiant: %w", err)
			}
			if filID != nil && filNom != nil {
				e.Filiere = &filiereRef{ID: *filID, Nom: *filNom, Code: derefStr(filCode)}
			}
			if dernConn != nil {
				ts := dernConn.UTC().Format(time.RFC3339)
				e.DerniereConnexion = &ts
			}
			result = append(result, e)
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("rows iter: %w", err)
		}

		// MES-ETUDIANTS-REFOUND-1 : peupler les UEs de l'enseignant pour chaque
		// étudiant (batch query pour éviter N+1). Utilisé par la modale de détail.
		if len(result) > 0 {
			etudiantIDs := make([]string, len(result))
			for i, e := range result {
				etudiantIDs[i] = e.ID
			}
			ueRows, err := tx.Query(r.Context(), `
                                SELECT DISTINCT ue."id", ue."code", ue."nom", u."id" AS etudiantId
                                FROM "User" u
                                JOIN "Affectation" a ON a."enseignantId" = $1
                                JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
                                WHERE u."id" = ANY($2)
                                  AND (
                                    ue."filiereId" = u."filiereId"
                                    OR EXISTS (
                                      SELECT 1 FROM "UniteEnseignementFiliere" uef
                                      WHERE uef."uniteEnseignementId" = ue."id"
                                        AND uef."filiereId" = u."filiereId"
                                    )
                                  )
                                  AND (
                                    ue."niveau" = u."niveau"
                                    OR ue."niveaux"::jsonb ? u."niveau"::text
                                  )
                        `, enseignantID, etudiantIDs)
			if err == nil {
				defer ueRows.Close()
				ueMap := map[string][]ueRef{}
				for ueRows.Next() {
					var ueID, ueCode, ueNom, etuID string
					if err := ueRows.Scan(&ueID, &ueCode, &ueNom, &etuID); err == nil {
						ueMap[etuID] = append(ueMap[etuID], ueRef{ID: ueID, Code: ueCode, Nom: ueNom})
					}
				}
				for i := range result {
					if ues, ok := ueMap[result[i].ID]; ok {
						result[i].UEs = ues
					}
				}
			}
		}
		return nil
	})

	if txErr != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur lors de la récupération des étudiants: "+txErr.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"etudiants": result,
		"total":     len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// MES-ETUDIANTS-REFOUND-1 — GET /api/enseignant/fiche-notes
// Fiche de notes globale : 1 ligne par étudiant, 1 colonne par épreuve de
// l'enseignant (sur la filière + niveau + semestre + année sélectionnés).
// Formats : ?format=csv (téléchargement direct) ou ?format=json (données
// structurées pour génération PDF côté Next.js via jsPDF+autotable).
// Filtres requis : filiereId + niveau. Optionnels : semestre (1|2),
// anneeUniversitaire (ex. "2024-2025"). Si non fournis, tous les semestres/
// années sont inclus.
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) enseignantFicheNotes(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	enseignantID := r.URL.Query().Get("enseignantId")
	if enseignantID == "" {
		enseignantID = claims.UserID
	}

	filiereID := r.URL.Query().Get("filiereId")
	niveau := r.URL.Query().Get("niveau")
	if filiereID == "" || niveau == "" {
		writeJSONError(w, http.StatusBadRequest, "filiereId et niveau sont requis")
		return
	}

	semestre := r.URL.Query().Get("semestre")                     // "1" ou "2" (optionnel)
	anneeUniversitaire := r.URL.Query().Get("anneeUniversitaire") // ex. "2024-2025" (optionnel)
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	type epreuveCol struct {
		ID       string  `json:"id"`
		Titre    string  `json:"titre"`
		NoteMax  float64 `json:"noteMax"`
		UECode   string  `json:"ueCode"`
		UENom    string  `json:"ueNom"`
		Semestre *int    `json:"semestre,omitempty"`
	}
	type etudiantRow struct {
		ID        string              `json:"id"`
		Name      string              `json:"name"`
		Matricule string              `json:"matricule"`
		Email     string              `json:"email"`
		Filiere   string              `json:"filiere"`
		Notes     map[string]*float64 `json:"notes"` // epreuveId -> note/20 (nil = absent)
		Moyenne   *float64            `json:"moyenne,omitempty"`
	}

	epreuves := []epreuveCol{}
	etudiants := []etudiantRow{}

	txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// 1. Récupérer les épreuves de l'enseignant sur cette filière + niveau
		// (avec filtres semestre/année optionnels via UniteEnseignement.semestre
		// et extraction d'année depuis Epreuve.createdAt).
		var argsE []any
		argsE = append(argsE, enseignantID, filiereID, niveau)
		argIdx := 4
		var whereE []string
		whereE = append(whereE, `e."enseignantId" = $1`)
		whereE = append(whereE, `e."filiereId" = $2`)
		whereE = append(whereE, `e."niveau" = $3`)
		whereE = append(whereE, `e."deletedAt" IS NULL`)
		if semestre != "" {
			whereE = append(whereE, fmt.Sprintf(`ue."semestre"::text = $%d`, argIdx))
			argsE = append(argsE, semestre)
			argIdx++
		}
		if anneeUniversitaire != "" {
			// anneeUniversitaire format "2024-2025" : on extrait la 1ère année
			// et on filtre les épreuves dont la date de création tombe dans cette année.
			year := strings.Split(anneeUniversitaire, "-")[0]
			whereE = append(whereE, fmt.Sprintf(`to_char(e."createdAt", 'YYYY') = $%d`, argIdx))
			argsE = append(argsE, year)
		}

		eRows, err := tx.Query(r.Context(), fmt.Sprintf(`
                        SELECT DISTINCT e."id", e."titre", e."noteTotal",
                               COALESCE(ue."code", ''), COALESCE(ue."nom", ''), ue."semestre"
                        FROM "Epreuve" e
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = e."uniteEnseignementId"
                        WHERE %s
                        ORDER BY e."titre" ASC
                `, strings.Join(whereE, " AND ")), argsE...)
		if err != nil {
			return fmt.Errorf("query epreuves: %w", err)
		}
		defer eRows.Close()
		for eRows.Next() {
			ep := epreuveCol{}
			var sem *int
			if err := eRows.Scan(&ep.ID, &ep.Titre, &ep.NoteMax, &ep.UECode, &ep.UENom, &sem); err != nil {
				return fmt.Errorf("scan epreuve: %w", err)
			}
			ep.Semestre = sem
			if ep.NoteMax == 0 {
				ep.NoteMax = 20
			}
			epreuves = append(epreuves, ep)
		}
		if err := eRows.Err(); err != nil {
			return fmt.Errorf("epreuves iter: %w", err)
		}

		// 2. Récupérer les étudiants (même scoping UE strict que enseignantEtudiantsReal)
		argsU := []any{enseignantID, filiereID, niveau}
		uRows, err := tx.Query(r.Context(), `
                        SELECT DISTINCT u."id", u."name", COALESCE(u."matricule",''), COALESCE(u."email",''),
                               COALESCE(f."nom",'')
                        FROM "User" u
                        LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
                        WHERE u."role" = 'ETUDIANT' AND u."actif" = true
                          AND u."filiereId" = $2
                          AND u."niveau" = $3
                          AND EXISTS (
                            SELECT 1
                            FROM "Affectation" a
                            JOIN "UniteEnseignement" ue ON ue."id" = a."uniteEnseignementId"
                            WHERE a."enseignantId" = $1
                              AND (
                                ue."filiereId" = u."filiereId"
                                OR EXISTS (
                                  SELECT 1 FROM "UniteEnseignementFiliere" uef
                                  WHERE uef."uniteEnseignementId" = ue."id"
                                    AND uef."filiereId" = u."filiereId"
                                )
                              )
                              AND (
                                ue."niveau" = u."niveau"
                                OR ue."niveaux"::jsonb ? u."niveau"::text
                              )
                          )
                        ORDER BY u."name"
                `, argsU...)
		if err != nil {
			return fmt.Errorf("query etudiants: %w", err)
		}
		defer uRows.Close()
		for uRows.Next() {
			e := etudiantRow{Notes: map[string]*float64{}}
			if err := uRows.Scan(&e.ID, &e.Name, &e.Matricule, &e.Email, &e.Filiere); err != nil {
				return fmt.Errorf("scan etudiant: %w", err)
			}
			etudiants = append(etudiants, e)
		}
		if err := uRows.Err(); err != nil {
			return fmt.Errorf("etudiants iter: %w", err)
		}

		// 3. Récupérer les notes (SessionPassation.score normalisé /20) pour
		// chaque étudiant × épreuve. RLS SessionPassation_select filtre déjà par
		// enseignant via Epreuve.enseignantId.
		if len(etudiants) > 0 && len(epreuves) > 0 {
			etuIDs := make([]string, len(etudiants))
			for i, e := range etudiants {
				etuIDs[i] = e.ID
			}
			epIDs := make([]string, len(epreuves))
			for i, e := range epreuves {
				epIDs[i] = e.ID
			}
			nRows, err := tx.Query(r.Context(), `
                                SELECT s."etudiantId", s."epreuveId",
                                       CASE WHEN e."noteTotal" > 0
                                            THEN s."score" / e."noteTotal" * 20.0
                                            ELSE s."score" END AS note_sur20
                                FROM "SessionPassation" s
                                JOIN "Epreuve" e ON e."id" = s."epreuveId"
                                WHERE s."etudiantId" = ANY($1)
                                  AND s."epreuveId" = ANY($2)
                                  AND s."statut" IN ('CORRIGEE','RETOURNEE')
                                  AND s."score" IS NOT NULL
                        `, etuIDs, epIDs)
			if err != nil {
				return fmt.Errorf("query notes: %w", err)
			}
			defer nRows.Close()
			noteMap := map[string]map[string]float64{} // etudiantId -> epreuveId -> note
			for nRows.Next() {
				var etuID, epID string
				var note float64
				if err := nRows.Scan(&etuID, &epID, &note); err != nil {
					return fmt.Errorf("scan note: %w", err)
				}
				if _, ok := noteMap[etuID]; !ok {
					noteMap[etuID] = map[string]float64{}
				}
				noteMap[etuID][epID] = note
			}
			// Remplir les notes + calculer la moyenne par étudiant
			for i := range etudiants {
				notes, ok := noteMap[etudiants[i].ID]
				if !ok {
					continue
				}
				sum := 0.0
				count := 0
				for _, ep := range epreuves {
					if note, ok := notes[ep.ID]; ok {
						n := note
						etudiants[i].Notes[ep.ID] = &n
						sum += note
						count++
					}
				}
				if count > 0 {
					moy := sum / float64(count)
					etudiants[i].Moyenne = &moy
				}
			}
		}
		return nil
	})

	if txErr != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur lors de la génération de la fiche de notes: "+txErr.Error())
		return
	}

	// Format CSV : téléchargement direct
	if format == "csv" {
		var sb strings.Builder
		// En-tête
		sb.WriteString("Matricule;Nom;Email;Filiere")
		for _, ep := range epreuves {
			titre := strings.ReplaceAll(ep.Titre, ";", ",")
			sb.WriteString(";" + titre + " (/20)")
		}
		sb.WriteString(";Moyenne (/20)\n")
		// Lignes
		for _, e := range etudiants {
			name := strings.ReplaceAll(e.Name, ";", ",")
			email := strings.ReplaceAll(e.Email, ";", ",")
			filiere := strings.ReplaceAll(e.Filiere, ";", ",")
			fmt.Fprintf(&sb, "%s;%s;%s;%s", e.Matricule, name, email, filiere)
			for _, ep := range epreuves {
				if note, ok := e.Notes[ep.ID]; ok && note != nil {
					fmt.Fprintf(&sb, ";%.2f", *note)
				} else {
					sb.WriteString(";—")
				}
			}
			if e.Moyenne != nil {
				fmt.Fprintf(&sb, ";%.2f", *e.Moyenne)
			} else {
				sb.WriteString(";—")
			}
			sb.WriteString("\n")
		}
		// BOM UTF-8 pour Excel
		body := "\xEF\xBB\xBF" + sb.String()
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="fiche_notes.csv"`)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(body))
		return
	}

	// Format JSON (défaut) : pour génération PDF côté Next.js
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"epreuves":           epreuves,
		"etudiants":          etudiants,
		"filiereId":          filiereID,
		"niveau":             niveau,
		"semestre":           semestre,
		"anneeUniversitaire": anneeUniversitaire,
		"total":              len(etudiants),
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
	// UX-FIX : résoudre l'alias "me" → claims.UserID. Avant, passer
	// enseignantId=me retournait un contexte vide car "me" n'est pas un
	// UUID valide. Le frontend utilise parfois "me" comme alias pratique.
	if enseignantID == "" || enseignantID == "me" {
		enseignantID = claims.UserID
	}

	type ueCtx struct {
		ID          string   `json:"id"`
		Code        string   `json:"code"`
		Nom         string   `json:"nom"`
		Niveau      string   `json:"niveau"`
		Niveaux     *string  `json:"niveaux"`
		TypeSeances []string `json:"typeSeances"`
	}
	type filiereCtx struct {
		ID                 string   `json:"id"`
		Nom                string   `json:"nom"`
		Code               string   `json:"code"`
		Niveaux            []string `json:"niveaux"`
		UnitesEnseignement []ueCtx  `json:"unitesEnseignement"`
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
							Niveaux:            []string{},
							UnitesEnseignement: []ueCtx{},
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
	_ = json.NewEncoder(w).Encode(map[string]any{
		"filieres":  filieres,
		"etudiants": etudiants,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// N2 FIX : GET /api/notifications/me — NotificationAdmin destinées au user courant
// ──────────────────────────────────────────────────────────────────────────
// Avant : NotificationAdmin n'était accessible qu'aux ADMIN (RequireRole("ADMIN")
// sur /api/notifications/admin). Une notif créée par l'ADMIN pour un étudiant
// (destinataireRole=ETUDIANT) était invisible par son destinataire.
// Maintenant : la RLS (migration 000018) + cet endpoint permettent à chaque
// utilisateur de voir les notifs qui lui sont destinées (par userId, par rôle,
// ou broadcast si destinataireId+destinataireRole sont NULL).

func (s *Server) notificationsMeList(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	type notifMe struct {
		ID          string  `json:"id"`
		Type        string  `json:"type"`
		Titre       string  `json:"titre"`
		Message     string  `json:"message"`
		Lu          bool    `json:"lu"`
		ActionURL   *string `json:"actionUrl,omitempty"`
		ActionLabel *string `json:"actionLabel,omitempty"`
		Priorite    string  `json:"priorite"`
		Categorie   string  `json:"categorie"`
		Icone       *string `json:"icone,omitempty"`
		ExpireLe    *string `json:"expireLe,omitempty"`
		CreatedAt   string  `json:"createdAt"`
	}

	result := []notifMe{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		luParam := r.URL.Query().Get("lu")
		limit := 50
		if l := r.URL.Query().Get("limit"); l != "" {
			if n, err := parseIntSafe(l); err == nil && n > 0 && n <= 200 {
				limit = n
			}
		}

		// DEFENSE-IN-DEPTH RBAC : neondb_owner a BYPASSRLS=true (défaut Neon),
		// donc les policies RLS ne filtrent rien. On filtre explicitement par
		// destinataireId (user courant) OR destinataireRole (rôle du user)
		// OR broadcast (destinataireId IS NULL AND destinataireRole IS NULL).
		var whereParts []string
		var args []any
		argIdx := 1

		whereParts = append(whereParts, fmt.Sprintf(`"destinataireId" = $%d`, argIdx))
		args = append(args, claims.UserID)
		argIdx++

		whereParts = append(whereParts, `("destinataireId" IS NULL AND "destinataireRole" IS NULL)`)

		whereParts = append(whereParts, fmt.Sprintf(`"destinataireRole" = $%d`, argIdx))
		args = append(args, claims.Role)
		argIdx++

		switch luParam {
		case "false":
			whereParts = append(whereParts, `"lu" = false`)
		case "true":
			whereParts = append(whereParts, `"lu" = true`)
		}

		whereClause := "WHERE " + strings.Join(whereParts, " AND ")

		query := fmt.Sprintf(`
                        SELECT "id", "type", "titre", "message", "lu",
                               "actionUrl", "actionLabel", "priorite", "categorie",
                               "icone", "expireLe", "createdAt"
                        FROM "NotificationAdmin"
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
			n := notifMe{}
			var createdAt time.Time
			var expireLe *time.Time
			if err := rows.Scan(&n.ID, &n.Type, &n.Titre, &n.Message, &n.Lu,
				&n.ActionURL, &n.ActionLabel, &n.Priorite, &n.Categorie,
				&n.Icone, &expireLe, &createdAt); err != nil {
				return err
			}
			n.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			if expireLe != nil {
				s := expireLe.UTC().Format(time.RFC3339)
				n.ExpireLe = &s
			}
			result = append(result, n)
		}
		return rows.Err()
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"notifications": result,
		"total":         len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// N5 FIX : POST /api/alertes/mark-all-read — batch mark all as read
// ──────────────────────────────────────────────────────────────────────────
// Avant : le frontend faisait Promise.all(N fetches) pour marquer N alertes
// comme lues → N requêtes HTTP (jusqu'à 20). Maintenant : 1 seule requête
// batch UPDATE. Defense-in-depth : filtre par userId (en plus de la RLS).

func (s *Server) alertesMarkAllRead(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var updatedCount int64
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// SECT-ALERTES-FIX-1 P2 : RBAC élargi — le RESPONSABLE doit pouvoir
		// marquer comme lues les alertes scopées à son établissement (pas
		// seulement userId = self). On réutilise les mêmes conditions que
		// alertesListReal (userId = self OR filière/épreuve de son étab).
		// La RLS policy Alerte_update valide aussi ces conditions.
		role := claims.Role
		var whereParts []string
		var args []any
		argIdx := 1

		whereParts = append(whereParts, fmt.Sprintf(`"userId" = $%d`, argIdx))
		args = append(args, claims.UserID)
		argIdx++

		if role == "RESPONSABLE" && claims.EtablissementID != "" {
			whereParts = append(whereParts, fmt.Sprintf(`EXISTS (SELECT 1 FROM "Filiere" f WHERE f.id = "Alerte"."filiereId" AND f."etablissementId" = $%d)`, argIdx))
			args = append(args, claims.EtablissementID)
			argIdx++
			whereParts = append(whereParts, fmt.Sprintf(`EXISTS (SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f.id = e."filiereId" WHERE e.id = "Alerte"."epreuveId" AND f."etablissementId" = $%d)`, argIdx))
			args = append(args, claims.EtablissementID)
		}

		whereParts = append(whereParts, `"lue" = false`)
		whereClause := "WHERE " + strings.Join(whereParts, " OR ")

		tag, err := tx.Exec(r.Context(), fmt.Sprintf(`
                        UPDATE "Alerte" SET "lue" = true, "updatedAt" = CURRENT_TIMESTAMP
                        %s
                `, whereClause), args...)
		if err != nil {
			return fmt.Errorf("mark all read: %w", err)
		}
		updatedCount = tag.RowsAffected()
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": fmt.Sprintf("%d alerte(s) marquée(s) comme lue(s)", updatedCount),
		"updated": updatedCount,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// N2 FIX (suite) : PATCH /api/notifications/me/{id} — marquer une notif comme lue
// ──────────────────────────────────────────────────────────────────────────
// Permet aux non-ADMIN de marquer leurs NotificationAdmin comme lues.
// La RLS (migration 000018, policy NotificationAdmin_update_destinataire)
// garantit qu'un user ne peut modifier que les notifs qui lui sont destinées.

func (s *Server) notificationsMeMarkRead(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	notifID := chi.URLParam(r, "id")
	if notifID == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var updated bool
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		tag, err := tx.Exec(r.Context(), `
                        UPDATE "NotificationAdmin" SET "lu" = true
                        WHERE "id" = $1
                `, notifID)
		if err != nil {
			return fmt.Errorf("mark notif read: %w", err)
		}
		updated = tag.RowsAffected() > 0
		return nil
	})

	if !updated {
		writeJSONError(w, http.StatusNotFound, "notification non trouvée ou non autorisée")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message": "notification marquée comme lue",
	})
}
