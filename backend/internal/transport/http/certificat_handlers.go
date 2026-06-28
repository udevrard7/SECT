package http

import (
        "encoding/json"
        "fmt"
        "net/http"

        "github.com/go-chi/chi/v5"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/worker"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// certificat_handlers.go — handlers HTTP pour Certificats + Correction.

// ============================================================
// CERTIFICATS
// ============================================================

// listCertificats — GET /api/certificats
func (s *Server) listCertificats(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        params := domain.CertificatListParams{
                EtudiantID: r.URL.Query().Get("etudiantId"),
                Type:       r.URL.Query().Get("type"),
                Statut:     r.URL.Query().Get("statut"),
        }

        certs, err := s.certificatUC.List(r.Context(), claims, params)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"certificats": certs})
}

// getCertificat — GET /api/certificats/{id}
func (s *Server) getCertificat(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        cert, err := s.certificatUC.GetByID(r.Context(), claims, id)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"certificat": cert})
}

// verifyCertificat — GET /api/certificats/verify/{code} (PUBLIC — no auth required)
func (s *Server) verifyCertificat(w http.ResponseWriter, r *http.Request) {
        code := chi.URLParam(r, "code")
        if code == "" {
                writeJSONError(w, http.StatusBadRequest, "code requis")
                return
        }

        cert, err := s.certificatUC.Verify(r.Context(), code)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "valid":      cert.Statut == domain.StatutCertificatEmis,
                "valide":     cert.Statut == domain.StatutCertificatEmis, // rétrocompat
                "certificat": cert,
        })
}

// revokeCertificat — POST /api/certificats/{id}/revoquer
func (s *Server) revokeCertificat(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        var body struct {
                Raison string `json:"raison"`
        }
        _ = json.NewDecoder(r.Body).Decode(&body)

        if err := s.certificatUC.Revoke(r.Context(), claims, id, body.Raison); err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "Certificat révoqué"})
}

// createCertificat — POST /api/certificats (P3c-CERTIFICATS)
// Émet un certificat manuellement (ENSEIGNANT/RESPONSABLE/ADMIN).
// Le body doit contenir les champs dénormalisés (étudiant, UE, établissement, etc.)
// car la table Certificat est un snapshot à l'émission.
func (s *Server) createCertificat(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input struct {
                EtudiantID         string  `json:"etudiantId"`
                ValidationUEID     string  `json:"validationUEId"`
                Type               string  `json:"type"`
                Intitule           string  `json:"intitule"`
                Mention            *string `json:"mention"`
                NoteFinale         float64 `json:"noteFinale"`
                EtablissementNom   string  `json:"etablissementNom"`
                EtablissementLogo  *string `json:"etablissementLogo"`
                EtablissementVille *string `json:"etablissementVille"`
                EtablissementPays  *string `json:"etablissementPays"`
                FiliereNom         string  `json:"filiereNom"`
                FiliereCode        *string `json:"filiereCode"`
                UECode             string  `json:"ueCode"`
                UENom              string  `json:"ueNom"`
                CreditsECTS        *int    `json:"creditsECTS"`
                EtudiantNom        string  `json:"etudiantNom"`
                EtudiantMatricule  *string `json:"etudiantMatricule"`
                EtudiantNiveau     *string `json:"etudiantNiveau"`
                SessionType        string  `json:"sessionType"`
                AnneeAcademique    *string `json:"anneeAcademique"`
        }
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        // Validations
        if input.EtudiantID == "" || input.ValidationUEID == "" {
                writeJSONError(w, http.StatusBadRequest, "etudiantId et validationUEId requis")
                return
        }
        if input.Intitule == "" {
                writeJSONError(w, http.StatusBadRequest, "intitule requis")
                return
        }
        if input.Type == "" {
                input.Type = "STANDARD"
        }
        if !domain.ValidTypesCertificat[domain.TypeCertificat(input.Type)] {
                writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("type invalide (STANDARD/AVANCE/EXPERT attendu, got %s)", input.Type))
                return
        }
        if input.SessionType == "" {
                input.SessionType = "NORMALE"
        }

        cert := &domain.Certificat{
                EtudiantID:         input.EtudiantID,
                ValidationUEID:     input.ValidationUEID,
                Type:               domain.TypeCertificat(input.Type),
                Intitule:           input.Intitule,
                Mention:            input.Mention,
                NoteFinale:         input.NoteFinale,
                EtablissementNom:   input.EtablissementNom,
                EtablissementLogo:  input.EtablissementLogo,
                EtablissementVille: input.EtablissementVille,
                EtablissementPays:  input.EtablissementPays,
                FiliereNom:         input.FiliereNom,
                FiliereCode:        input.FiliereCode,
                UECode:             input.UECode,
                UENom:              input.UENom,
                CreditsECTS:        input.CreditsECTS,
                EtudiantNom:        input.EtudiantNom,
                EtudiantMatricule:  input.EtudiantMatricule,
                EtudiantNiveau:     input.EtudiantNiveau,
                SessionType:        input.SessionType,
                AnneeAcademique:    input.AnneeAcademique,
                EmetteParID:        claims.UserID,
        }

        created, err := s.certificatUC.Create(r.Context(), claims, cert)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{
                "certificat": created,
                "message":    "Certificat émis",
        })
}

// ============================================================
// CORRECTION
// ============================================================

// listCorrectionSessions — GET /api/correction
func (s *Server) listCorrectionSessions(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        params := domain.CorrectionListParams{
                EnseignantID: r.URL.Query().Get("enseignantId"),
                EpreuveID:    r.URL.Query().Get("epreuveId"),
        }

        sessions, err := s.correctionUC.ListSessions(r.Context(), claims, params)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"sessions": sessions})
}

// updateReponse — PATCH /api/correction/reponses/{reponseId}
func (s *Server) updateReponse(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        reponseID := chi.URLParam(r, "reponseId")
        var input domain.UpdateReponseInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        if err := s.correctionUC.UpdateReponse(r.Context(), claims, reponseID, input); err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "Réponse mise à jour"})
}

// retournerSession — POST /api/correction/{sessionId}/retourner
func (s *Server) retournerSession(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        sessionID := chi.URLParam(r, "sessionId")
        if err := s.correctionUC.RetournerSession(r.Context(), claims, sessionID); err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "Session retournée à l'étudiant"})
}

// retournerBatch — POST /api/correction/retourner-batch
func (s *Server) retournerBatch(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // P1c-CORRECTION : accepter soit {sessionIds:[]} soit {epreuveId:""}.
        // Le frontend use-correction.ts envoie {epreuveId} (sans sessionIds).
        // Si epreuveId est fourni, on lookup les sessions CORRIGEE de cet épreuve.
        var body struct {
                SessionIDs []string `json:"sessionIds"`
                EpreuveID  string   `json:"epreuveId"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        sessionIDs := body.SessionIDs

        // Si pas de sessionIds mais epreuveId fourni → lookup sessions CORRIGEE
        if len(sessionIDs) == 0 && body.EpreuveID != "" {
                _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                        rows, err := tx.Query(r.Context(), `
                                SELECT sp."id"
                                FROM "SessionPassation" sp
                                JOIN "Epreuve" e ON e."id" = sp."epreuveId"
                                WHERE sp."epreuveId" = $1 AND sp."statut" = 'CORRIGEE' AND e."enseignantId" = $2
                        `, body.EpreuveID, claims.UserID)
                        if err != nil {
                                return err
                        }
                        defer rows.Close()
                        for rows.Next() {
                                var id string
                                if err := rows.Scan(&id); err == nil {
                                        sessionIDs = append(sessionIDs, id)
                                }
                        }
                        return nil
                })
        }

        count, err := s.correctionUC.RetournerBatch(r.Context(), claims, sessionIDs)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "message": "Sessions retournées",
                "count":   count,
                "returned": count,
                "total":   len(sessionIDs),
        })
}


// aiGradeSession — POST /api/correction/{sessionId}/ai-grade
// IA-CORRECTION-1 : déclenche la correction IA asynchrone pour les QRC/CODE.
// Renvoie 202 Accepted immédiatement. Le worker traite en arrière-plan.
func (s *Server) aiGradeSession(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        sessionID := chi.URLParam(r, "sessionId")

        // 1. Récupérer les réponses QRC/CODE sans noteIA pour cette session
        tx, err := s.dbPool.BeginTx(r.Context(), pgx.TxOptions{})
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }
        defer tx.Rollback(r.Context())

        tx.Exec(r.Context(), "SET LOCAL row_security = off")

        rows, err := tx.Query(r.Context(), `
                SELECT r."id", r."questionId"
                FROM "Reponse" r
                JOIN "Question" q ON q."id" = r."questionId"
                WHERE r."sessionId" = $1
                  AND r."noteIA" IS NULL
                  AND r."contenu" IS NOT NULL
                  AND q."type" IN ('QRC', 'CODE', 'REFLEXION')
        `, sessionID)
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }

        var jobs []worker.CorrectionJob
        for rows.Next() {
                var reponseID, questionID string
                if err := rows.Scan(&reponseID, &questionID); err != nil {
                        continue
                }
                jobs = append(jobs, worker.CorrectionJob{
                        ReponseID:    reponseID,
                        SessionID:    sessionID,
                        QuestionID:   questionID,
                        EnseignantID: claims.UserID,
                })
        }
        rows.Close()
        tx.Commit(r.Context())

        // 2. Pousser les jobs dans la CorrectionQueue
        pushed := 0
        for _, job := range jobs {
                select {
                case worker.CorrectionQueue <- job:
                        pushed++
                default:
                        // Queue pleine — on continue
                }
        }

        // 3. Retourner 202 Accepted
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusAccepted)
        json.NewEncoder(w).Encode(map[string]any{
                "status":       "EN_COURS",
                "message":      fmt.Sprintf("Correction IA lancee pour %d reponse(s).", pushed),
                "jobCount":     pushed,
                "sessionId":    sessionID,
        })
}
