package http

// geniuspay_handlers.go — Endpoints GeniusPay pour le paiement Wave B2C.
//
// SECT-GENIUSPAY-WAVE : 3 endpoints PUBLICS (pas d'auth, comme /confirm-payment) :
//
//   POST /api/subscriptions/b2c/{id}/initiate-payment
//     Crée un paiement Wave chez GeniusPay, stocke la référence sur l'abonnement,
//     retourne l'URL de checkout Wave (paymentUrl) pour redirection frontend.
//
//   GET /api/subscriptions/b2c/{id}/payment-status
//     Polling frontend après retour Wave. Interroge l'API GeniusPay pour le
//     statut réel du paiement, et si completed → active l'abonnement via
//     confirm_b2c_payment (double-check sécurité, indépendant du webhook).
//
//   POST /api/webhooks/geniuspay
//     Reçoit les webhooks GeniusPay (payment.success/failed). Vérifie la
//     signature HMAC-SHA256, parse le payload, active l'abonnement sur
//     payment.success. Idempotent (basé sur statut abonnement).

import (
        "context"
        "encoding/json"
        "io"
        "log/slog"
        "net/http"
        "strings"

        "github.com/go-chi/chi/v5"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/geniuspay"
)

// --- Request/Response types ---

// initiatePaymentRequest — body du POST initiate-payment.
type initiatePaymentRequest struct {
        CustomerPhone string `json:"customerPhone"` // requis, format +225...
        CustomerName  string `json:"customerName"`  // optionnel
}

// initiatePaymentResponse — réponse 200.
type initiatePaymentResponse struct {
        AbonnementID string `json:"abonnementId"`
        Reference    string `json:"reference"`   // MTX-XXXXXX
        PaymentURL   string `json:"paymentUrl"`  // URL checkout Wave
        Amount       int    `json:"amount"`
        Currency     string `json:"currency"`
        Status       string `json:"status"` // pending
}

// paymentStatusResponse — réponse 200 du GET payment-status.
type paymentStatusResponse struct {
        AbonnementID     string  `json:"abonnementId"`
        AbonnementStatut string  `json:"abonnementStatut"` // EN_ATTENTE_PAIEMENT | ACTIF
        PaymentStatus    *string `json:"paymentStatus"`    // pending|completed|failed|cancelled|null
        Reference        *string `json:"reference"`        // MTX-XXX ou null
        Amount           float64 `json:"amount"`
        Message          string  `json:"message"`
}

// --- Helpers ---

// validateWavePhone valide un numéro de téléphone au format international.
// Accepte +225XXXXXXXXX (10 chiffres après +225) ou formats proches.
func validateWavePhone(phone string) bool {
        phone = strings.TrimSpace(phone)
        if !strings.HasPrefix(phone, "+") {
                return false
        }
        // Au moins 8 chiffres après l'indicatif (formats CI: +225 + 10 chiffres)
        digits := 0
        for _, r := range phone[1:] {
                if r >= '0' && r <= '9' {
                        digits++
                }
        }
        return digits >= 8
}

// --- Handler 1 : POST /api/subscriptions/b2c/{id}/initiate-payment ---

func (s *Server) initiateB2CPayment(w http.ResponseWriter, r *http.Request) {
        aboID := chi.URLParam(r, "id")
        if aboID == "" {
                writeJSONError(w, http.StatusBadRequest, "id abonnement requis")
                return
        }

        var req initiatePaymentRequest
        _ = json.NewDecoder(r.Body).Decode(&req)
        req.CustomerPhone = strings.TrimSpace(req.CustomerPhone)
        req.CustomerName = strings.TrimSpace(req.CustomerName)

        if !validateWavePhone(req.CustomerPhone) {
                writeJSONError(w, http.StatusBadRequest, "téléphone client requis (format international +225...)")
                return
        }

        // 1. Vérifier que l'abonnement existe + est EN_ATTENTE_PAIEMENT + récupérer montant
        ctx := r.Context()
        var aboStatut, planID, etabID, existingRef string
        var planPrix float64
        err := appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT a."statut"::text, a."planId", a."etablissementId",
                               COALESCE(a."geniuspayReference", ''), p."prixMensuel"
                        FROM "Abonnement" a
                        JOIN "Plan" p ON p."id" = a."planId"
                        WHERE a."id" = $1
                `, aboID).Scan(&aboStatut, &planID, &etabID, &existingRef, &planPrix)
        })
        if err != nil {
                if strings.Contains(err.Error(), "no rows") {
                        writeJSONError(w, http.StatusNotFound, "abonnement introuvable")
                        return
                }
                slog.Error("initiateB2CPayment: query abonnement failed", "aboId", aboID, "error", err.Error())
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }

        if aboStatut != "EN_ATTENTE_PAIEMENT" {
                writeJSONError(w, http.StatusConflict, "abonnement non en attente de paiement (statut: "+aboStatut+")")
                return
        }

        // 2. Vérifier que le client GeniusPay est configuré
        if s.geniusPay == nil || !s.geniusPay.IsConfigured() {
                writeJSONError(w, http.StatusServiceUnavailable, "paiement GeniusPay non configuré sur le serveur")
                return
        }

        // 3. Construire les URLs de retour (success/error) vers le frontend
        // On ajoute ?abo=aboID pour que la page de retour puisse récupérer l'abonnement.
        successURL := s.appBaseURL + "/paiement/succes?abo=" + aboID
        errorURL := s.appBaseURL + "/paiement/erreur?abo=" + aboID

        // 4. Créer le paiement Wave chez GeniusPay
        amount := int(planPrix) // 4900 pour Prof Premium
        gpReq := geniuspay.CreatePaymentRequest{
                Amount:        amount,
                Currency:      "XOF",
                PaymentMethod: "wave_ci",
                CustomerPhone: req.CustomerPhone,
                CustomerName:  req.CustomerName,
                Description:   "SECT Prof Premium - 1 mois",
                SuccessURL:    successURL,
                ErrorURL:      errorURL,
                Metadata: map[string]string{
                        "abonnement_id": aboID,
                        "plan_id":       planID,
                        "etablissement_id": etabID,
                },
        }

        gpResp, err := s.geniusPay.CreatePayment(ctx, gpReq)
        if err != nil {
                slog.Error("initiateB2CPayment: GeniusPay CreatePayment failed",
                        "aboId", aboID, "phone", req.CustomerPhone, "error", err.Error())
                writeJSONError(w, http.StatusBadGateway, "GeniusPay indisponible: "+err.Error())
                return
        }

        // 5. Stocker la référence + paymentUrl sur l'abonnement (pour reprise + polling)
        err = appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                _, err := tx.Exec(ctx, `
                        UPDATE "Abonnement"
                        SET "geniuspayReference" = $1, "geniuspayPaymentUrl" = $2, "updatedAt" = NOW()
                        WHERE "id" = $3
                `, gpResp.Reference, gpResp.PaymentURL, aboID)
                return err
        })
        if err != nil {
                slog.Error("initiateB2CPayment: failed to store reference", "aboId", aboID, "ref", gpResp.Reference, "error", err.Error())
                // Non fatal : le paiement est créé chez GeniusPay, on peut quand même retourner l'URL
                // (le webhook de confirmation retrouvera l'abonnement via metadata.abonnement_id)
        }

        slog.Info("B2C payment initiated via GeniusPay/Wave",
                "aboId", aboID, "reference", gpResp.Reference, "amount", amount, "phone", req.CustomerPhone)

        // 6. Retourner l'URL de paiement au frontend
        resp := initiatePaymentResponse{
                AbonnementID: aboID,
                Reference:    gpResp.Reference,
                PaymentURL:   gpResp.PaymentURL,
                Amount:       amount,
                Currency:     "XOF",
                Status:       gpResp.Status,
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(resp)
}

// --- Handler 2 : GET /api/subscriptions/b2c/{id}/payment-status ---

func (s *Server) getB2CPaymentStatus(w http.ResponseWriter, r *http.Request) {
        aboID := chi.URLParam(r, "id")
        if aboID == "" {
                writeJSONError(w, http.StatusBadRequest, "id abonnement requis")
                return
        }

        ctx := r.Context()
        var aboStatut, geniusRef string
        var planPrix float64

        err := appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT a."statut"::text, COALESCE(a."geniuspayReference", ''), p."prixMensuel"
                        FROM "Abonnement" a
                        JOIN "Plan" p ON p."id" = a."planId"
                        WHERE a."id" = $1
                `, aboID).Scan(&aboStatut, &geniusRef, &planPrix)
        })
        if err != nil {
                if strings.Contains(err.Error(), "no rows") {
                        writeJSONError(w, http.StatusNotFound, "abonnement introuvable")
                        return
                }
                slog.Error("getB2CPaymentStatus: query failed", "aboId", aboID, "error", err.Error())
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }

        resp := paymentStatusResponse{
                AbonnementID:     aboID,
                AbonnementStatut: aboStatut,
                Amount:           planPrix,
        }

        // Si pas de référence GeniusPay stockée → pas de paiement initié
        if geniusRef == "" {
                resp.PaymentStatus = nil
                resp.Reference = nil
                resp.Message = "Aucun paiement initié"
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(resp)
                return
        }

        resp.Reference = &geniusRef

        // Si déjà ACTIF, pas besoin d'interroger GeniusPay
        if aboStatut == "ACTIF" {
                completed := "completed"
                resp.PaymentStatus = &completed
                resp.Message = "Paiement confirmé"
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(resp)
                return
        }

        // Interroger GeniusPay pour le statut réel (double-check sécurité)
        if s.geniusPay == nil || !s.geniusPay.IsConfigured() {
                pending := "pending"
                resp.PaymentStatus = &pending
                resp.Message = "Vérification GeniusPay non disponible"
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(resp)
                return
        }

        gpResp, err := s.geniusPay.GetPayment(ctx, geniusRef)
        if err != nil {
                slog.Warn("getB2CPaymentStatus: GeniusPay GetPayment failed, returning pending",
                        "aboId", aboID, "ref", geniusRef, "error", err.Error())
                pending := "pending"
                resp.PaymentStatus = &pending
                resp.Message = "Vérification en cours..."
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(resp)
                return
        }

        status := gpResp.Status // pending, completed, failed, cancelled
        resp.PaymentStatus = &status

        // Si completed → activer l'abonnement (idempotent : confirm_b2c_payment
        // vérifie que statut = EN_ATTENTE_PAIEMENT avant d'activer)
        if gpResp.Status == "completed" && aboStatut == "EN_ATTENTE_PAIEMENT" {
                var success bool
                var newStatut string
                err := s.dbPool.QueryRow(ctx, `
                        SELECT o_success, o_statut FROM confirm_b2c_payment($1, $2, $3)
                `, aboID, "wave", geniusRef).Scan(&success, &newStatut)
                if err != nil {
                        slog.Error("getB2CPaymentStatus: confirm_b2c_payment failed",
                                "aboId", aboID, "ref", geniusRef, "error", err.Error())
                } else if success {
                        resp.AbonnementStatut = "ACTIF"
                        resp.Message = "Paiement confirmé"
                        slog.Info("B2C abonnement activated via payment-status poll",
                                "aboId", aboID, "ref", geniusRef)
                        // Envoyer l'email de bienvenue Premium (synchrone, comme confirmB2CPayment)
                        go s.sendB2CPremiumWelcomeEmail(aboID)
                        // SECT-FACTURE-EMAIL : créer la facture + envoyer email
                        go s.createAndSendFacture(context.Background(), aboID)
                }
        } else if gpResp.Status == "failed" || gpResp.Status == "cancelled" {
                resp.Message = "Paiement " + gpResp.Status
        } else {
                resp.Message = "Paiement en cours..."
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(resp)
}

// --- Handler 3 : POST /api/webhooks/geniuspay ---

func (s *Server) geniuspayWebhook(w http.ResponseWriter, r *http.Request) {
        // 1. Lire le body brut (requis pour la vérification HMAC)
        rawPayload, err := io.ReadAll(r.Body)
        if err != nil {
                slog.Error("geniuspayWebhook: read body failed", "error", err.Error())
                w.WriteHeader(http.StatusOK) // 200 pour ne pas trigger de retry GeniusPay
                json.NewEncoder(w).Encode(map[string]bool{"received": true})
                return
        }

        sig := r.Header.Get("X-Webhook-Signature")
        ts := r.Header.Get("X-Webhook-Timestamp")
        event := r.Header.Get("X-Webhook-Event")

        // 2. Vérifier la signature (sauf si webhook secret non configuré → mode dev,
        // on accepte mais on log un warning)
        webhookSecret := s.geniusPayWebhookSecret
        if webhookSecret == "" {
                slog.Warn("geniuspayWebhook: WEBHOOK_SECRET non configuré — acceptation sans vérif (dev only)",
                        "event", event)
        } else {
                if err := geniuspay.VerifySignature(string(rawPayload), sig, ts, webhookSecret); err != nil {
                        slog.Warn("geniuspayWebhook: signature invalide, rejet",
                                "event", event, "error", err.Error())
                        // Retourner 200 quand même pour ne pas leak d'info (un attaquant ne doit
                        // pas savoir si la signature a été vérifiée). Mais ne pas traiter.
                        w.WriteHeader(http.StatusOK)
                        json.NewEncoder(w).Encode(map[string]bool{"received": true})
                        return
                }
        }

        // 3. Parser le payload
        var payload geniuspay.WebhookPayload
        if err := json.Unmarshal(rawPayload, &payload); err != nil {
                slog.Error("geniuspayWebhook: unmarshal failed", "error", err.Error(),
                        "body", string(rawPayload)[:min(200, len(rawPayload))])
                w.WriteHeader(http.StatusOK)
                json.NewEncoder(w).Encode(map[string]bool{"received": true})
                return
        }

        slog.Info("GeniusPay webhook received",
                "event", payload.Event,
                "reference", payload.Data.Reference,
                "amount", payload.Data.Amount,
                "environment", payload.Environment,
        )

        // 4. Traiter selon l'événement
        switch payload.Event {
        case "payment.success":
                s.handleGeniusPaySuccess(r.Context(), payload)
        case "payment.failed", "payment.cancelled":
                slog.Info("GeniusPay payment failed/cancelled",
                        "reference", payload.Data.Reference, "event", payload.Event)
        default:
                slog.Info("GeniusPay webhook ignored", "event", payload.Event)
        }

        // 5. Toujours répondre 200 rapidement (< 5-10s, doc GeniusPay)
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(map[string]bool{"received": true})
}

// handleGeniusPaySuccess active l'abonnement lié à la référence du paiement.
// Idempotent : si l'abonnement est déjà ACTIF, confirm_b2c_payment retourne
// success=false et on log simplement (pas d'erreur).
func (s *Server) handleGeniusPaySuccess(ctx context.Context, payload geniuspay.WebhookPayload) {
        ref := payload.Data.Reference
        if ref == "" {
                slog.Error("handleGeniusPaySuccess: webhook sans référence")
                return
        }

        // L'abonnement_id vient soit des metadata (priorité), soit d'une lookup par référence
        aboID := payload.Data.Metadata["abonnement_id"]
        if aboID == "" {
                // Fallback : lookup par geniuspayReference
                err := s.dbPool.QueryRow(ctx, `
                        SELECT "id" FROM "Abonnement" WHERE "geniuspayReference" = $1
                `, ref).Scan(&aboID)
                if err != nil {
                        slog.Error("handleGeniusPaySuccess: abonnement non trouvé par référence",
                                "ref", ref, "error", err.Error())
                        return
                }
        }

        // Vérifier le montant attendu vs montant payé (sécurité doc GeniusPay)
        var expectedAmount float64
        _ = s.dbPool.QueryRow(ctx, `
                SELECT p."prixMensuel" FROM "Abonnement" a
                JOIN "Plan" p ON p."id" = a."planId"
                WHERE a."id" = $1
        `, aboID).Scan(&expectedAmount)
        if expectedAmount > 0 && payload.Data.Amount > 0 && payload.Data.Amount != expectedAmount {
                slog.Error("handleGeniusPaySuccess: montant mismatch — ABANDON",
                        "aboId", aboID, "ref", ref,
                        "expected", expectedAmount, "received", payload.Data.Amount)
                return // Ne pas activer — possible tentative de fraude
        }

        // Activer l'abonnement via la fonction SECURITY DEFINER (idempotente).
        // SECT-FACTURE-EMAIL : si metadata.renewal=true, appeler renew_b2c_subscription
        // (prolonge la dateFin au lieu d'exiger EN_ATTENTE_PAIEMENT).
        isRenewal := payload.Data.Metadata["renewal"] == "true"
        var success bool
        var statut string
        if isRenewal {
                err := s.dbPool.QueryRow(ctx, `
                        SELECT o_success, o_statut FROM renew_b2c_subscription($1, $2, $3)
                `, aboID, "wave", ref).Scan(&success, &statut)
                if err != nil {
                        slog.Error("handleGeniusPaySuccess: renew_b2c_subscription failed",
                                "aboId", aboID, "ref", ref, "error", err.Error())
                        return
                }
        } else {
                err := s.dbPool.QueryRow(ctx, `
                        SELECT o_success, o_statut FROM confirm_b2c_payment($1, $2, $3)
                `, aboID, "wave", ref).Scan(&success, &statut)
                if err != nil {
                        slog.Error("handleGeniusPaySuccess: confirm_b2c_payment failed",
                                "aboId", aboID, "ref", ref, "error", err.Error())
                        return
                }
        }

        if success {
                slog.Info("B2C abonnement activated via GeniusPay webhook",
                        "aboId", aboID, "ref", ref)
                // Email de bienvenue Premium synchrone (dans une goroutine pour répondre
                // le webhook rapidement, mais avec timeout interne de 30s)
                go s.sendB2CPremiumWelcomeEmail(aboID)
                // SECT-FACTURE-EMAIL : créer la facture + envoyer email
                go s.createAndSendFacture(ctx, aboID)
        } else {
                // success=false = déjà ACTIF ou statut inattendu — idempotence normale
                slog.Info("GeniusPay webhook: abonnement déjà traité",
                        "aboId", aboID, "ref", ref, "statut", statut)
        }
}

func min(a, b int) int {
        if a < b {
                return a
        }
        return b
}

// downgradeB2CToSolo — POST /api/subscriptions/b2c/{id}/downgrade
//
// SECT-B2C-EXPIRE : rétrograde un abonnement Premium EXPIRE vers Prof Solo
// gratuit. Le prof peut ainsi continuer à utiliser SECT en mode limité (2 classes,
// 40 étudiants, 3 épreuves IA/mois) sans payer.
//
// PUBLIC (pas d'auth) — l'utilisateur clique sur le lien dans l'email d'expiration,
// il n'est pas forcément connecté (son login est bloqué justement).
func (s *Server) downgradeB2CToSolo(w http.ResponseWriter, r *http.Request) {
        aboID := chi.URLParam(r, "id")
        if aboID == "" {
                writeJSONError(w, http.StatusBadRequest, "id abonnement requis")
                return
        }

        ctx := r.Context()

        // Appeler la fonction SQL downgrade_b2c_to_solo (idempotente + checks)
        var success bool
        var newPlanID, newPlanNom, message string
        err := s.dbPool.QueryRow(ctx, `
                SELECT o_success, o_abonnement_id, o_new_plan_id, o_new_plan_nom, o_message
                FROM downgrade_b2c_to_solo($1)
        `, aboID).Scan(&success, &aboID, &newPlanID, &newPlanNom, &message)
        if err != nil {
                slog.Error("downgradeB2CToSolo: SQL failed", "aboId", aboID, "error", err.Error())
                writeJSONError(w, http.StatusInternalServerError, "erreur interne: "+err.Error())
                return
        }

        if !success {
                // Abonnement non expiré, déjà Solo, ou introuvable
                slog.Info("downgradeB2CToSolo: rejected", "aboId", aboID, "message", message)
                writeJSONError(w, http.StatusConflict, message)
                return
        }

        slog.Info("B2C abonnement downgraded to Solo",
                "aboId", aboID, "newPlan", newPlanNom)

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(map[string]any{
                "success":       true,
                "abonnementId":  aboID,
                "newPlanId":     newPlanID,
                "newPlanNom":    newPlanNom,
                "message":       message,
                "loginUrl":      "/login",
        })
}

// renewB2CPayment — POST /api/subscriptions/b2c/{id}/renew
//
// SECT-FACTURE-EMAIL (Étape 3) : initie un paiement Wave pour renouveler un
// abonnement B2C qui arrive à expiration. Le paiement Wave prolonge l'abonnement
// de 30 jours après confirmation (via le même flux webhook/polling que l'initial).
//
// Le handler reset aussi relanceEnvoyee=false pour permettre une nouvelle relance
// au cycle suivant.
//
// PUBLIC (pas d'auth) — l'utilisateur reçoit l'email de relance avec le lien
// contenant l'abonnement ID, il n'est pas forcément connecté.
func (s *Server) renewB2CPayment(w http.ResponseWriter, r *http.Request) {
        aboID := chi.URLParam(r, "id")
        if aboID == "" {
                writeJSONError(w, http.StatusBadRequest, "id abonnement requis")
                return
        }

        var req initiatePaymentRequest
        _ = json.NewDecoder(r.Body).Decode(&req)
        req.CustomerPhone = strings.TrimSpace(req.CustomerPhone)
        req.CustomerName = strings.TrimSpace(req.CustomerName)

        if !validateWavePhone(req.CustomerPhone) {
                writeJSONError(w, http.StatusBadRequest, "téléphone client requis (format international +225...)")
                return
        }

        ctx := r.Context()

        // 1. Vérifier que l'abonnement existe + est ACTIF (renouvelable)
        var aboStatut, planID, etabID string
        var planPrix float64
        err := appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT a."statut"::text, a."planId", a."etablissementId", p."prixMensuel"
                        FROM "Abonnement" a
                        JOIN "Plan" p ON p."id" = a."planId"
                        WHERE a."id" = $1
                `, aboID).Scan(&aboStatut, &planID, &etabID, &planPrix)
        })
        if err != nil {
                if strings.Contains(err.Error(), "no rows") {
                        writeJSONError(w, http.StatusNotFound, "abonnement introuvable")
                        return
                }
                slog.Error("renewB2CPayment: query failed", "aboId", aboID, "error", err.Error())
                writeJSONError(w, http.StatusInternalServerError, "erreur interne")
                return
        }

        if aboStatut != "ACTIF" {
                writeJSONError(w, http.StatusConflict, "abonnement non actif (statut: "+aboStatut+")")
                return
        }

        if s.geniusPay == nil || !s.geniusPay.IsConfigured() {
                writeJSONError(w, http.StatusServiceUnavailable, "paiement GeniusPay non configuré sur le serveur")
                return
        }

        // 2. Créer le paiement Wave (même flux que initiate-payment)
        successURL := s.appBaseURL + "/paiement/succes?abo=" + aboID
        errorURL := s.appBaseURL + "/paiement/erreur?abo=" + aboID

        amount := int(planPrix)
        gpReq := geniuspay.CreatePaymentRequest{
                Amount:        amount,
                Currency:      "XOF",
                PaymentMethod: "wave_ci",
                CustomerPhone: req.CustomerPhone,
                CustomerName:  req.CustomerName,
                Description:   "SECT Prof Premium - Renouvellement 1 mois",
                SuccessURL:    successURL,
                ErrorURL:      errorURL,
                Metadata: map[string]string{
                        "abonnement_id":    aboID,
                        "plan_id":          planID,
                        "etablissement_id": etabID,
                        "renewal":          "true",
                },
        }

        gpResp, err := s.geniusPay.CreatePayment(ctx, gpReq)
        if err != nil {
                slog.Error("renewB2CPayment: GeniusPay CreatePayment failed",
                        "aboId", aboID, "error", err.Error())
                writeJSONError(w, http.StatusBadGateway, "GeniusPay indisponible: "+err.Error())
                return
        }

        // 3. Mettre à jour l'abonnement avec la nouvelle référence GeniusPay
        // (l'ancienne est écrasée — c'est intentionnel, le renouvellement remplace
        // le paiement en cours). Reset relanceEnvoyee=false.
        err = appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                _, err := tx.Exec(ctx, `
                        UPDATE "Abonnement"
                        SET "geniuspayReference" = $1, "geniuspayPaymentUrl" = $2,
                            "relanceEnvoyee" = false, "updatedAt" = NOW()
                        WHERE "id" = $3
                `, gpResp.Reference, gpResp.PaymentURL, aboID)
                return err
        })
        if err != nil {
                slog.Error("renewB2CPayment: failed to update abonnement", "aboId", aboID, "error", err.Error())
        }

        slog.Info("B2C renewal payment initiated",
                "aboId", aboID, "reference", gpResp.Reference, "amount", amount)

        resp := initiatePaymentResponse{
                AbonnementID: aboID,
                Reference:    gpResp.Reference,
                PaymentURL:   gpResp.PaymentURL,
                Amount:       amount,
                Currency:     "XOF",
                Status:       gpResp.Status,
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(resp)
}
