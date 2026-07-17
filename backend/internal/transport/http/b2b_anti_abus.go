package http

// b2b_anti_abus.go — Endpoints pour l'anti-abus B2B
//
// SECT-B2B-ANTI-ABUS : 3 nouveaux endpoints :
//   GET  /api/b2b/verify-email?token=xxx  — vérification email (clic lien)
//   POST /api/abonnements/b2b/{id}/validate — validation admin (ESSAI démarre)
//   GET  /api/abonnements/pending-b2b      — liste des établissements en attente

import (
        "encoding/json"
        "log/slog"
        "net/http"
        "strings"
        "time"

        "github.com/go-chi/chi/v5"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/emailtpl"
        "github.com/udevrard7/sect/backend/internal/mailer"
)

// verifyB2BEmail — GET /api/b2b/verify-email?token=xxx (PUBLIC)
// Solution 1 : vérification email obligatoire. Le responsable clique sur le lien
// dans l'email pour confirmer son adresse.
func (s *Server) verifyB2BEmail(w http.ResponseWriter, r *http.Request) {
        token := r.URL.Query().Get("token")
        if token == "" {
                writeJSONError(w, http.StatusBadRequest, "token requis")
                return
        }

        var success bool
        var etabID, etabNom, message string
        err := appdb.WithTx(r.Context(), s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                return tx.QueryRow(r.Context(), `
                        SELECT o_success, o_etablissement_id, o_etablissement_nom, o_message
                        FROM verify_b2b_email($1)
                `, token).Scan(&success, &etabID, &etabNom, &message)
        })
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur: "+err.Error())
                return
        }

        if !success {
                writeJSONError(w, http.StatusBadRequest, message)
                return
        }

        slog.Info("B2B email verified", "etabId", etabID, "etabNom", etabNom)

        // TODO : notifier l'admin qu'un nouvel établissement est à valider
        if s.mailer != nil {
                // Email au RESPONSABLE : confirmation
                var respEmail, respName string
                _ = appdb.WithTx(r.Context(), s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                        return tx.QueryRow(r.Context(), `
                                SELECT "email", "name" FROM "User"
                                WHERE "etablissementId" = $1 AND "role" = 'RESPONSABLE' LIMIT 1
                        `, etabID).Scan(&respEmail, &respName)
                })

                if respEmail != "" {
                        _ = s.mailer.Send(mailer.Email{
                                To:      respEmail,
                                Subject: "SECT — Email vérifié pour " + etabNom,
                                Body:    "Bonjour " + respName + ",\n\nVotre email a été vérifié. Notre équipe va valider votre établissement sous 24h. Vous recevrez un email de confirmation.\n\nL'équipe SECT",
                        })
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "success":          true,
                "etablissementId":  etabID,
                "etablissementNom": etabNom,
                "message":          message,
        })
}

// validateB2BEstablishment — POST /api/abonnements/b2b/{id}/validate (ADMIN only)
// Solution 4 : validation admin avant ESSAI. L'admin approuve l'établissement,
// l'ESSAI de 14 jours démarre.
//
// BUGFIX (B2B-VALIDATION-RLS) : utilisation de WithTx + SystemClaims() pour
// bypasser les RLS policies. Avant : s.dbPool.QueryRow() direct → la fonction
// validate_b2b_establishment() est SECURITY DEFINER mais la lecture du User
// pour l'email utilisait aussi le pool direct → RLS pouvait bloquer.
func (s *Server) validateB2BEstablishment(w http.ResponseWriter, r *http.Request) {
        etabID := chi.URLParam(r, "id")
        if etabID == "" {
                writeJSONError(w, http.StatusBadRequest, "id établissement requis")
                return
        }

        var success bool
        var aboID, statut, message string
        var dateFin *string
        err := appdb.WithTx(r.Context(), s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                return tx.QueryRow(r.Context(), `
                        SELECT o_success, o_abonnement_id, o_statut, o_date_fin::text, o_message
                        FROM validate_b2b_establishment($1)
                `, etabID).Scan(&success, &aboID, &statut, &dateFin, &message)
        })
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur: "+err.Error())
                return
        }

        if !success {
                writeJSONError(w, http.StatusConflict, message)
                return
        }

        slog.Info("B2B establishment validated", "etabId", etabID, "aboId", aboID, "statut", statut)

        // Envoyer un email au RESPONSABLE : "Votre établissement est validé, essai démarré"
        // SECT-B2B-EMAIL-1 : remplace le texte brut par le template HTML emailtpl.B2BValidated
        // (thème Savane : palette africaine + motif kente, bouton CTA, carte essai, étapes).
        if s.mailer != nil {
                var respEmail, respName, etabNom, etabType string
                _ = appdb.WithTx(r.Context(), s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                        return tx.QueryRow(r.Context(), `
                                SELECT u."email", u."name", e."nom", e."type"::text
                                FROM "User" u
                                JOIN "Etablissement" e ON e."id" = u."etablissementId"
                                WHERE u."etablissementId" = $1 AND u."role" = 'RESPONSABLE' LIMIT 1
                        `, etabID).Scan(&respEmail, &respName, &etabNom, &etabType)
                })

                if respEmail != "" {
                        // Formater la date de fin d'essai en français (ex: "31 juillet 2026").
                        dateFinStr := ""
                        if dateFin != nil && *dateFin != "" {
                                if t, err := time.Parse(time.RFC3339, *dateFin); err == nil {
                                        dateFinStr = t.Format("2 January 2006")
                                } else if t, err := time.Parse("2006-01-02 15:04:05", *dateFin); err == nil {
                                        dateFinStr = t.Format("2 January 2006")
                                } else {
                                        dateFinStr = strings.TrimSpace(*dateFin)
                                }
                        }

                        data := emailtpl.B2BValidatedData{
                                EtablissementNom:   etabNom,
                                EtablissementType:  etabType,
                                DateFinEssai:       dateFinStr,
                                LoginURL:           s.appBaseURL + "/login",
                                CapitationInfo:     "900 FCFA/étudiant/an, plancher 50 étudiants",
                        }
                        data.RecipientName = respName
                        data.AppURL = s.appBaseURL

                        _ = s.mailer.Send(mailer.Email{
                                To:      respEmail,
                                Subject: "SECT — Votre établissement est validé ! Essai de 14 jours démarré",
                                Body:    emailtpl.B2BValidatedText(data),
                                HTML:    emailtpl.B2BValidatedHTML(data),
                        })
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "success":      success,
                "abonnementId": aboID,
                "statut":       statut,
                "message":      message,
        })
}

// listPendingB2B — GET /api/abonnements/pending-b2b (ADMIN only)
// Liste les établissements EN_ATTENTE_VALIDATION (pour le dashboard admin).
//
// BUGFIX (B2B-VALIDATION-RLS) : utilisation de WithTx + SystemClaims() pour
// bypasser les RLS policies. Avant : s.dbPool.Query() direct → les policies
// RLS sur Etablissement/User/Abonnement filtraient les résultats par
// etablissementId de l'admin (probablement NULL) → 0 lignes retournées →
// onglet "Validation B2B" toujours vide.
func (s *Server) listPendingB2B(w http.ResponseWriter, r *http.Request) {
        type pendingItem struct {
                EtabID         string `json:"etablissementId"`
                EtabNom        string `json:"etablissementNom"`
                EtabType       string `json:"etablissementType"`
                EtabVille      string `json:"ville"`
                EtabPays       string `json:"pays"`
                EtabTel        string `json:"telephone"`
                EmailVerified  bool   `json:"emailVerified"`
                AdminValidated bool   `json:"adminValidated"`
                EmailPro       bool   `json:"emailProfessionnel"`
                CreatedAt      string `json:"createdAt"`
                RespEmail      string `json:"respEmail"`
                RespName       string `json:"respName"`
                AbonnementID   string `json:"abonnementId"`
                NbEtudiants    *int   `json:"nbEtudiants,omitempty"`
        }

        var items []pendingItem
        err := appdb.WithTx(r.Context(), s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                rows, qerr := tx.Query(r.Context(), `
                        SELECT e."id", e."nom", e."type", e."ville", e."pays", e."telephone",
                               e."emailVerified", e."adminValidated", e."emailProfessionnel", e."createdAt"::text,
                               u."email", u."name",
                               a."id", a."nbrEtudiantsPayes"
                        FROM "Etablissement" e
                        JOIN "User" u ON u."etablissementId" = e."id" AND u."role" = 'RESPONSABLE'
                        JOIN "Abonnement" a ON a."etablissementId" = e."id"
                        WHERE a."statut" = 'EN_ATTENTE_VALIDATION'
                          AND a."deletedAt" IS NULL
                        ORDER BY e."createdAt" DESC
                `)
                if qerr != nil {
                        return qerr
                }
                defer rows.Close()

                for rows.Next() {
                        var item pendingItem
                        if serr := rows.Scan(
                                &item.EtabID, &item.EtabNom, &item.EtabType, &item.EtabVille, &item.EtabPays, &item.EtabTel,
                                &item.EmailVerified, &item.AdminValidated, &item.EmailPro, &item.CreatedAt,
                                &item.RespEmail, &item.RespName,
                                &item.AbonnementID, &item.NbEtudiants,
                        ); serr != nil {
                                continue
                        }
                        items = append(items, item)
                }
                return nil
        })
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "pending": items,
                "count":   len(items),
        })
}
