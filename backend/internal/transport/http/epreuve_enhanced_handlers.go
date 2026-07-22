// Package http — handlers pour routes epreuves manquantes (P2-E3-EPREUVES).
package http

import (
        "encoding/json"
        "net/http"

        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// P2-E3a : GET /api/epreuves/orphelines — épreuves sans UE assignée
// ──────────────────────────────────────────────────────────────────────────
//
// Le frontend orphan-epreuves-alert.tsx appelle cette route pour détecter
// les épreuves sans uniteEnseignementId. Retourne {orphelines: [...], count: N}.

func (s *Server) listOrphanEpreuves(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        type orphanEpreuve struct {
                ID    string `json:"id"`
                Titre string `json:"titre"`
        }

        result := []orphanEpreuve{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "titre" FROM "Epreuve"
                        WHERE "deletedAt" IS NULL AND "enseignantId" = $1
                          AND ("uniteEnseignementId" IS NULL OR "uniteEnseignementId" = '')
                        ORDER BY "createdAt" DESC
                `, claims.UserID)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        var o orphanEpreuve
                        if err := rows.Scan(&o.ID, &o.Titre); err == nil {
                                result = append(result, o)
                        }
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "orphelines": result,
                "count":      len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// P2-E3b : GET /api/epreuves/session-speciale?epreuveId=X
// ──────────────────────────────────────────────────────────────────────────
//
// Liste les sessions spéciales dérivées d'une épreuve (epreuveOrigineId).
// Le frontend utilise cette route dans le dialog de monitoring.

func (s *Server) listSessionSpeciale(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        epreuveID := r.URL.Query().Get("epreuveId")
        if epreuveID == "" {
                writeJSONError(w, http.StatusBadRequest, "epreuveId requis")
                return
        }

        type specialSession struct {
                ID        string `json:"id"`
                Titre     string `json:"titre"`
                Statut    string `json:"statut"`
                SessionEx string `json:"sessionExamen"`
        }

        result := []specialSession{}
        _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "titre", "statut"::text, "sessionExamen"
                        FROM "Epreuve"
                        WHERE "deletedAt" IS NULL AND "epreuveOrigineId" = $1
                        ORDER BY "createdAt" DESC
                `, epreuveID)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        var ss specialSession
                        if err := rows.Scan(&ss.ID, &ss.Titre, &ss.Statut, &ss.SessionEx); err == nil {
                                result = append(result, ss)
                        }
                }
                return nil
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "sessionsSpeciales": result,
                "count":             len(result),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// P2-E3c : POST /api/epreuves/session-speciale — créer une session spéciale
// ──────────────────────────────────────────────────────────────────────────
//
// Crée une nouvelle épreuve dérivée (epreuveOrigineId = épreuve source).
// Le frontend envoie le body complet (titre, dates, type session, etc.).

func (s *Server) createSessionSpeciale(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }
        if claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
                writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
                return
        }

        var input struct {
                EpreuveOrigineID    string   `json:"epreuveOrigineId"`
                Titre               string   `json:"titre"`
                Description         *string  `json:"description"`
                Duree               int      `json:"duree"`
                DateDebut           string   `json:"dateDebut"`
                DateFin             string   `json:"dateFin"`
                FiliereID           *string  `json:"filiereId"`
                UniteEnseignementID *string  `json:"uniteEnseignementId"`
                Niveau              *string  `json:"niveau"`
                SessionExamen       string   `json:"sessionExamen"`
                NoteTotal           *float64 `json:"noteTotal"`
                AnneeAcademiqueID   *string  `json:"anneeAcademiqueId"`
                Etudiants           []string `json:"etudiants"`
                // UX-FIX : champs envoyés par le frontend mais ignorés avant.
                Type                string   `json:"type"`               // RATTRAPAGE | DIFFERE
                Motif               string   `json:"motif"`              // motif de la session
                Justificatif        string   `json:"justificatif"`       // justificatif optionnel
                EstPartielle        bool     `json:"estPartielle"`       // partie seulement vs complète
                QuestionsSelectionnees []string `json:"questionsSelectionnees"` // si estPartielle=true
                MelangeQuestions    *bool    `json:"melangeQuestions"`
                MelangePropositions *bool    `json:"melangePropositions"`
                BlocageRetour       *bool    `json:"blocageRetour"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if input.EpreuveOrigineID == "" || input.Titre == "" {
                writeJSONError(w, http.StatusBadRequest, "epreuveOrigineId et titre requis")
                return
        }
        if input.SessionExamen == "" {
                input.SessionExamen = "SPECIALE"
        }

        // Récupérer l'épreuve source pour copier contenu + generationMode
        sourceEpreuve, err := s.epreuveUC.GetByID(r.Context(), claims, input.EpreuveOrigineID)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        // Créer la nouvelle épreuve dérivée
        // BUGFIX (E2E-SESSION-SPECIALE) : copier FiliereID, UniteEnseignementID,
        // Niveau, NoteTotal depuis l'épreuve source si non fournis dans l'input.
        // Avant, le usecase Create rejetait avec 'uniteEnseignementId requis'
        // car le frontend ne renvoyait pas ces champs (ils sont optionnels dans
        // le dialog de session spéciale).
        sourceFiliereID := input.FiliereID
        if sourceFiliereID == nil && sourceEpreuve.FiliereID != nil {
                sourceFiliereID = sourceEpreuve.FiliereID
        }
        sourceUEID := input.UniteEnseignementID
        if (sourceUEID == nil || *sourceUEID == "") && sourceEpreuve.UniteEnseignementID != nil {
                sourceUEID = sourceEpreuve.UniteEnseignementID
        }
        sourceNiveau := input.Niveau
        if (sourceNiveau == nil || *sourceNiveau == "") && sourceEpreuve.Niveau != nil {
                sourceNiveau = sourceEpreuve.Niveau
        }
        sourceNoteTotal := input.NoteTotal
        if sourceNoteTotal == nil && sourceEpreuve.NoteTotal > 0 {
                nt := sourceEpreuve.NoteTotal
                sourceNoteTotal = &nt
        }
        createInput := domain.CreateEpreuveInput{
                EnseignantID:        claims.UserID,
                Titre:               input.Titre,
                Description:         input.Description,
                Duree:               input.Duree,
                DateDebut:           input.DateDebut,
                DateFin:             input.DateFin,
                FiliereID:           sourceFiliereID,
                UniteEnseignementID: sourceUEID,
                Niveau:              sourceNiveau,
                SessionExamen:       domain.SessionExamen(input.SessionExamen),
                NoteTotal:           sourceNoteTotal,
                AnneeAcademiqueID:   input.AnneeAcademiqueID,
                GenerationMode:      sourceEpreuve.GenerationMode,
                Contenu:             sourceEpreuve.Contenu,
                // UX-FIX : propager melange/blocage depuis l'input frontend.
                MelangeQuestions:    input.MelangeQuestions,
                MelangePropositions: input.MelangePropositions,
                BlocageRetour:       input.BlocageRetour,
        }
        if createInput.Duree == 0 {
                createInput.Duree = sourceEpreuve.Duree
        }

        created, err := s.epreuveUC.Create(r.Context(), claims, createInput)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        // UX-FIX : la création auto de sessions passation nécessiterait que
        // l'épreuve soit en statut PLANIFIEE (StartSession refuse BROUILLON).
        // Comme il n'y a pas de méthode Publish dans EpreuveUseCase, on laisse
        // l'enseignant publier+ lancer manuellement (2 clics). Amélioration
        // future : ajouter EpreuveUseCase.Publish + créer les sessions auto.

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{
                "epreuve":  created,
                "message":  "Session spéciale créée. Pensez à la publier et lancer la session pour que les étudiants puissent la passer.",
        })
}
