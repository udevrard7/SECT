package http

// b2b_payment.go — Paiement B2B via Wave (capitation)
//
// SECT-B2B-FACTURATION (Priorité 4) : permet au RESPONSABLE de payer la capitation
// B2B via Wave. Le montant = max(nbEtudiants, 50) × 900 FCFA (calculé par
// calculate_b2b_capitation).
//
// Flux :
// 1. RESPONSABLE appelle POST /api/subscriptions/b2b/{id}/initiate-payment
// 2. Backend calcule le montant capitation + crée paiement Wave via GeniusPay
// 3. RESPONSABLE paie sur Wave → webhook → activate_b2b_subscription (ESSAI→ACTIF)
// 4. create_b2b_facture (déjà implémenté) + email

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/geniuspay"
	"github.com/jackc/pgx/v5"
)

// b2bInitiatePaymentRequest — body du POST initiate-payment B2B.
type b2bInitiatePaymentRequest struct {
	CustomerPhone string `json:"customerPhone"`
	CustomerName  string `json:"customerName"`
}

// b2bInitiatePaymentResponse — réponse 200.
type b2bInitiatePaymentResponse struct {
	AbonnementID string `json:"abonnementId"`
	Reference    string `json:"reference"`
	PaymentURL   string `json:"paymentUrl"`
	Amount       int    `json:"amount"`
	NbEtudiants  int    `json:"nbEtudiants"`
	Currency     string `json:"currency"`
	Status       string `json:"status"`
}

// initiateB2BPayment — POST /api/subscriptions/b2b/{id}/initiate-payment
//
// PUBLIC (pas d'auth) — le RESPONSABLE reçoit l'email de relance/expiration
// avec le lien contenant l'abonnement ID.
func (s *Server) initiateB2BPayment(w http.ResponseWriter, r *http.Request) {
	aboID := chi.URLParam(r, "id")
	if aboID == "" {
		writeJSONError(w, http.StatusBadRequest, "id abonnement requis")
		return
	}

	var req b2bInitiatePaymentRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if !validateWavePhone(req.CustomerPhone) {
		writeJSONError(w, http.StatusBadRequest, "téléphone client requis (format international +225...)")
		return
	}

	ctx := r.Context()

	// 1. Vérifier l'abonnement + récupérer l'étab + le statut
	var etabID, statut string
	err := appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT "etablissementId", "statut"::text
			FROM "Abonnement" WHERE "id" = $1
		`, aboID).Scan(&etabID, &statut)
	})
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "abonnement introuvable")
		return
	}

	// 2. Vérifier GeniusPay configuré
	if s.geniusPay == nil || !s.geniusPay.IsConfigured() {
		writeJSONError(w, http.StatusServiceUnavailable, "paiement GeniusPay non configuré")
		return
	}

	// 3. Calculer le montant capitation
	var montantHT, montantTTC float64
	var nbEtudiants int
	var prixParEtudiant float64
	var planNom string
	err = appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT o_montant_ht, o_montant_ttc, o_nb_etudiants, o_prix_par_etudiant, o_plan_nom
			FROM calculate_b2b_capitation($1)
		`, etabID).Scan(&montantHT, &montantTTC, &nbEtudiants, &prixParEtudiant, &planNom)
	})
	if err != nil || montantTTC == 0 {
		writeJSONError(w, http.StatusInternalServerError, "erreur calcul capitation")
		return
	}

	// 4. Créer le paiement Wave
	amount := int(montantTTC)
	successURL := s.appBaseURL + "/paiement/succes?abo=" + aboID
	errorURL := s.appBaseURL + "/paiement/erreur?abo=" + aboID

	gpReq := geniuspay.CreatePaymentRequest{
		Amount:        amount,
		Currency:      "XOF",
		PaymentMethod: "wave_ci",
		CustomerPhone: req.CustomerPhone,
		CustomerName:  req.CustomerName,
		Description:   "SECT Institutionnel (B2B) — Capitation " + planNom,
		SuccessURL:    successURL,
		ErrorURL:      errorURL,
		Metadata: map[string]string{
			"abonnement_id":    aboID,
			"etablissement_id": etabID,
			"b2b_capitation":   "true",
			"nb_etudiants":     string(rune(nbEtudiants)),
		},
	}

	gpResp, err := s.geniusPay.CreatePayment(ctx, gpReq)
	if err != nil {
		slog.Error("initiateB2BPayment: GeniusPay failed", "aboId", aboID, "error", err.Error())
		writeJSONError(w, http.StatusBadGateway, "GeniusPay indisponible: "+err.Error())
		return
	}

	// 5. Stocker la référence
	err = appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE "Abonnement" SET "geniuspayReference" = $1, "geniuspayPaymentUrl" = $2, "updatedAt" = NOW()
			WHERE "id" = $3
		`, gpResp.Reference, gpResp.PaymentURL, aboID)
		return err
	})

	slog.Info("B2B payment initiated",
		"aboId", aboID, "reference", gpResp.Reference,
		"amount", amount, "nbEtudiants", nbEtudiants)

	resp := b2bInitiatePaymentResponse{
		AbonnementID: aboID,
		Reference:    gpResp.Reference,
		PaymentURL:   gpResp.PaymentURL,
		Amount:       amount,
		NbEtudiants:  nbEtudiants,
		Currency:     "XOF",
		Status:       gpResp.Status,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
