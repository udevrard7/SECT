package http

import (
        "encoding/json"
        "log/slog"
        "net/http"

        "github.com/go-chi/chi/v5"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// dbgErrToString convertit une erreur en string pour le debug endpoint.
func dbgErrToString(err error) string {
        if err == nil {
                return ""
        }
        return err.Error()
}

// txErrToString convertit une erreur de transaction en string.
func txErrToString(err error) string {
        if err == nil {
                return ""
        }
        return err.Error()
}

// firstRecordID retourne l'ID du premier record ou "" si vide.
func firstRecordID(records []*domain.EtablissementAccess) string {
        if len(records) == 0 {
                return ""
        }
        return records[0].ID
}

// access_handlers.go — handlers HTTP pour EtablissementAccess.

// listAccess — GET /api/etablissement-access
func (s *Server) listAccess(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // DEBUG-ACCESS : log les claims pour diagnostiquer pourquoi le responsable
        // ne voit pas les demandes (accessRecords: null).
        slog.Info("listAccess claims debug",
                "userID", claims.UserID,
                "role", claims.Role,
                "etablissementID", claims.EtablissementID,
                "etablissementID_len", len(claims.EtablissementID),
        )

        params := domain.AccessListParams{
                AdminID:         r.URL.Query().Get("adminId"),
                Statut:          r.URL.Query().Get("statut"),
                EtablissementID: r.URL.Query().Get("etablissementId"),
        }

        // DEBUG-ACCESS-2 : si query param ?debug=1, retourner les claims + count via repo.
        if r.URL.Query().Get("debug") == "1" {
                // Tester current_etablissement_id() et is_responsable() DANS une tx avec claims.
                var dbEtabID, dbIsResp string
                _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                        row := tx.QueryRow(r.Context(), `SELECT current_etablissement_id()::text, is_responsable()::text`)
                        if err := row.Scan(&dbEtabID, &dbIsResp); err != nil {
                                return err
                        }
                        return nil
                })
                // Tester la comparaison exacte de la policy.
                var etabIdInRow, policyEval, currentEtabInSameQuery string
                tx3, tx3Err := s.dbPool.BeginTx(r.Context(), pgx.TxOptions{})
                if tx3Err == nil {
                        tx3.Exec(r.Context(), "SELECT set_config('app.claims.user_id', $1, true)", claims.UserID)
                        tx3.Exec(r.Context(), "SELECT set_config('app.claims.role', $1, true)", claims.Role)
                        tx3.Exec(r.Context(), "SELECT set_config('app.claims.etablissement_id', $1, true)", claims.EtablissementID)
                        // Query qui retourne current_etablissement_id() ET etablissementId dans la MEME query.
                        _ = tx3.QueryRow(r.Context(), `SELECT current_etablissement_id()::text, "etablissementId"::text FROM "EtablissementAccess" LIMIT 1`).Scan(&currentEtabInSameQuery, &etabIdInRow)
                        // Query la policy evaluation directement.
                        _ = tx3.QueryRow(r.Context(), `SELECT (is_responsable() AND ("etablissementId" = current_etablissement_id()))::text FROM "EtablissementAccess" LIMIT 1`).Scan(&policyEval)
                        tx3.Rollback(r.Context())
                }
                // Tester AVEC le LEFT JOIN User.
                var countWithJoin int
                _ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                        row := tx.QueryRow(r.Context(), `SELECT count(*) FROM "EtablissementAccess" ea LEFT JOIN "User" u ON u."id" = ea."adminId" WHERE ea."statut" = $1 AND ea."etablissementId" = $2`, params.Statut, claims.EtablissementID)
                        if err := row.Scan(&countWithJoin); err != nil {
                                return err
                        }
                        return nil
                })
                // Appeler le repo List directement pour voir ce qu'il retourne.
                dbgParams := domain.AccessListParams{
                        Statut:          params.Statut,
                        EtablissementID: claims.EtablissementID, // forcer pour responsable
                }
                dbgRecords, dbgErr := s.accessUC.List(r.Context(), claims, dbgParams)
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]any{
                        "claims": map[string]any{
                                "userID":          claims.UserID,
                                "role":            claims.Role,
                                "etablissementID": claims.EtablissementID,
                                "etabLen":         len(claims.EtablissementID),
                        },
                        "dbCheck": map[string]any{
                                "current_etablissement_id":      dbEtabID,
                                "currentEtabInSameQuery":        currentEtabInSameQuery,
                                "is_responsable":                dbIsResp,
                                "etabIdInRow":                   etabIdInRow,
                                "policyEval":                    policyEval,
                                "countWithJoin":                 countWithJoin,
                                "tx3Err":                        txErrToString(tx3Err),
                        },
                        "params":  dbgParams,
                        "count":   len(dbgRecords),
                        "error":   dbgErrToString(dbgErr),
                        "firstID": firstRecordID(dbgRecords),
                })
                return
        }

        records, err := s.accessUC.List(r.Context(), claims, params)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"accessRecords": records})
}

// createAccess — POST /api/etablissement-access
func (s *Server) createAccess(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var input domain.CreateAccessInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        access, err := s.accessUC.Create(r.Context(), claims, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{"accessRecord": access})
}

// updateAccess — PATCH /api/etablissement-access/{id}
func (s *Server) updateAccess(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        var input domain.UpdateAccessInput
        if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        access, err := s.accessUC.Update(r.Context(), claims, id, input)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"accessRecord": access})
}

// deleteAccess — DELETE /api/etablissement-access/{id}
// ACCES-ETABLISSEMENTS-FIX-AE1 : annule (supprime) une demande d'accès.
// Le usecase vérifie l'ownership (adminId == claims.UserID pour ADMIN) et
// le statut (EN_ATTENTE uniquement).
func (s *Server) deleteAccess(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        if err := s.accessUC.Delete(r.Context(), claims, id); err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"message": "demande d'accès annulée"})
}

// checkAccess — GET /api/etablissement-access/check?etablissementId=...
func (s *Server) checkAccess(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        etabID := r.URL.Query().Get("etablissementId")
        if etabID == "" {
                writeJSONError(w, http.StatusBadRequest, "etablissementId requis")
                return
        }

        access, err := s.accessUC.CheckAccess(r.Context(), claims, etabID)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "hasAccess":    access != nil,
                "accessRecord": access,
        })
}

// authorizedEtablissements — GET /api/etablissement-access/authorized-etablissements
func (s *Server) authorizedEtablissements(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        etabs, err := s.accessUC.ListAuthorizedEtablissements(r.Context(), claims)
        if err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"etablissements": etabs})
}
