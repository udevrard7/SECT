// ouvrage_handlers.go — handlers HTTP de la bibliothèque numérique
// (ADR-0007 P1). Routes montées dans router.go : /api/ouvrages.
//
// G1 : mutations réservées à l'ADMIN (router RequireRole + usecase,
// défense en profondeur). Lectures : tous rôles authentifiés — le scoping
// établissement / corbeille / droits expirés est fait par les policies
// RLS Ouvrage_* (000123).
package http

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// listOuvrages — GET /api/ouvrages
// Query : q, categorie, filiereId, niveau, page, limit, includeDeleted
// (includeDeleted : ADMIN uniquement — le usecase le révoque sinon).
func (s *Server) listOuvrages(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	q := r.URL.Query()
	params := domain.OuvrageListParams{
		Search:     strings.TrimSpace(q.Get("q")),
		Categorie:  domain.CategorieOuvrage(q.Get("categorie")),
		FiliereID:  strings.TrimSpace(q.Get("filiereId")),
		Niveau:     strings.TrimSpace(q.Get("niveau")),
		Visibilite: domain.VisibiliteOuvrage(strings.TrimSpace(q.Get("visibility"))),
		Statut:     domain.StatutOuvrage(strings.TrimSpace(q.Get("statut"))),
	}
	if params.Categorie == "" || !domain.IsValidOuvrageCategorie(params.Categorie) {
		params.Categorie = "" // filtre invalide ignoré (c'est un filtre UI, pas une saisie)
	}
	if params.Niveau != "" && !domain.IsValidNiveauEtude(params.Niveau) {
		params.Niveau = ""
	}
	if params.Visibilite != "" && !domain.IsValidVisibiliteOuvrage(params.Visibilite) {
		params.Visibilite = ""
	}
	if params.Statut != "" && params.Statut != domain.StatutOuvrageValide && params.Statut != domain.StatutOuvrageBrouillon {
		params.Statut = ""
	}
	if v := q.Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			params.Page = n
		}
	}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			params.Limit = n
		}
	}
	if v := q.Get("includeDeleted"); v == "true" || v == "1" {
		params.IncludeDeleted = true
	}

	result, err := s.ouvrageUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// getOuvrage — GET /api/ouvrages/{id}
func (s *Server) getOuvrage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	o, err := s.ouvrageUC.GetByID(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ouvrage": o})
}

// uploadOuvrage — POST /api/ouvrages (multipart/form-data ;
// ADMIN/RESPONSABLE/ENSEIGNANT — 000137, le périmètre est DÉRIVÉ DU
// RÔLE côté serveur : le champ etablissementId du formulaire est
// IGNORÉ pour tous les rôles (deriveScope écrase : claims pour
// l'ADMIN en assistance, "" pour l'ADMIN global — catalogue commun
// PLATEFORME). SECT-BIBLIO-8 : le frontend ne l'exige plus du super
// admin et ne l'envoie plus (le champ restait bloquant côté UI alors
// que le serveur l'écrasait — incohérence signalée par l'exploitant).
// Champs : file (PDF, requis) ; titre, categorie, licenceOrigine ;
// auteurs, editeur, edition, anneePublication, isbn, langue, filiereId,
// niveau, themes, description, dateExpirationDroits (RFC3339 ou
// YYYY-MM-DD), telechargementAutorise ; classes (JSON array
// [{"filiereId","niveau"}] — ENSEIGNANT, intersection scellée serveur).
func (s *Server) uploadOuvrage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		writeJSONError(w, http.StatusBadRequest, "fichier trop volumineux ou formulaire invalide (max 100 Mo)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "fichier 'file' requis")
		return
	}
	defer func() { _ = file.Close() }()

	content, err := io.ReadAll(file)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "lecture du fichier échouée")
		return
	}

	strPtr := func(key string) *string {
		v := strings.TrimSpace(r.FormValue(key))
		if v == "" {
			return nil
		}
		return &v
	}
	intPtr := func(key string) *int {
		v := strings.TrimSpace(r.FormValue(key))
		if v == "" {
			return nil
		}
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil
		}
		return &n
	}
	timePtr := func(key string) *time.Time {
		v := strings.TrimSpace(r.FormValue(key))
		if v == "" {
			return nil
		}
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			return &t
		}
		if t, err := time.Parse("2006-01-02", v); err == nil {
			return &t
		}
		return nil
	}
	// classesPtr — ciblage ENSEIGNANT : JSON array [{filiereId, niveau}].
	classesPtr := func() []domain.OuvrageClasseInput {
		v := strings.TrimSpace(r.FormValue("classes"))
		if v == "" {
			return nil
		}
		var classes []domain.OuvrageClasseInput
		if err := json.Unmarshal([]byte(v), &classes); err != nil {
			return nil // mal formé : le usecase exigera ≥ 1 classe légitime
		}
		return classes
	}

	input := domain.CreateOuvrageInput{
		EtablissementID:        strings.TrimSpace(r.FormValue("etablissementId")),
		Titre:                  strings.TrimSpace(r.FormValue("titre")),
		Auteurs:                strPtr("auteurs"),
		Categorie:              domain.CategorieOuvrage(strings.TrimSpace(r.FormValue("categorie"))),
		Editeur:                strPtr("editeur"),
		Edition:                strPtr("edition"),
		AnneePublication:       intPtr("anneePublication"),
		ISBN:                   strPtr("isbn"),
		Langue:                 strPtr("langue"),
		FiliereID:              strPtr("filiereId"),
		Niveau:                 strPtr("niveau"),
		Themes:                 strPtr("themes"),
		Description:            strPtr("description"),
		LicenceOrigine:         strings.TrimSpace(r.FormValue("licenceOrigine")),
		DateExpirationDroits:   timePtr("dateExpirationDroits"),
		NomFichier:             header.Filename,
		TypeMime:               domain.OuvrageMime,
		TelechargementAutorise: r.FormValue("telechargementAutorise") == "true",
		Classes:                classesPtr(),
		CreatedByID:            claims.UserID,
	}

	created, err := s.ouvrageUC.Upload(r.Context(), claims, input, content)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// SECT-BIBLIO-P4 (ADR-0008 §2/§4) : liaison à une proposition
	// ACCEPTEE (champ form propositionId) — l'ouvrage EXISTE déjà, un
	// échec de liaison est un AVERTISSEMENT dans la réponse (jamais
	// une erreur qui ferait croire à un dépôt raté) ; puis notification
	// des veilles matchantes (best-effort total, log-only).
	response := map[string]any{"ouvrage": created}
	if propositionID := strings.TrimSpace(r.FormValue("propositionId")); propositionID != "" {
		if err := s.ouvrageSocialUC.LinkPropositionOuvrage(r.Context(), claims, propositionID, created.ID); err != nil {
			response["avertissement"] = "ouvrage déposé, mais liaison à la proposition impossible : " + err.Error()
		}
	}
	s.ouvrageSocialUC.NotifierVeilles(r.Context(), claims, created)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(response)
}

// patchOuvrageFromRaw — décodage tri-state du PATCH (ADR-0007) :
// champ absent = inchangé ; null = mettre NULL en DB (« toutes filières » /
// « tous niveaux » / « pas d'expiration ») ; valeur = nouvelle valeur.
func patchOuvrageFromRaw(body map[string]json.RawMessage) (domain.UpdateOuvrageInput, error) {
	var out domain.UpdateOuvrageInput

	strPtr := func(raw json.RawMessage) (*string, error) {
		var v *string
		if err := json.Unmarshal(raw, &v); err != nil {
			return nil, err
		}
		return v, nil
	}
	setStr := func(dst **string, unset *bool, raw json.RawMessage) error {
		v, err := strPtr(raw)
		if err != nil {
			return err
		}
		if v == nil {
			*unset = true
		} else {
			*dst = v
		}
		return nil
	}

	for key, raw := range body {
		var err error
		switch key {
		case "titre":
			out.Titre, err = strPtr(raw)
		case "auteurs":
			err = setStr(&out.Auteurs, &out.UnsetAuteurs, raw)
		case "categorie":
			var v *string
			if err = json.Unmarshal(raw, &v); err == nil && v != nil {
				c := domain.CategorieOuvrage(*v)
				out.Categorie = &c
			}
		case "editeur":
			err = setStr(&out.Editeur, &out.UnsetEditeur, raw)
		case "edition":
			err = setStr(&out.Edition, &out.UnsetEdition, raw)
		case "anneePublication":
			var v *int
			if err = json.Unmarshal(raw, &v); err == nil {
				if v == nil {
					out.UnsetAnneePublication = true
				} else {
					out.AnneePublication = v
				}
			}
		case "isbn":
			err = setStr(&out.ISBN, &out.UnsetISBN, raw)
		case "langue":
			err = setStr(&out.Langue, &out.UnsetLangue, raw)
		case "filiereId":
			err = setStr(&out.FiliereID, &out.UnsetFiliere, raw)
		case "niveau":
			err = setStr(&out.Niveau, &out.UnsetNiveau, raw)
		case "themes":
			err = setStr(&out.Themes, &out.UnsetThemes, raw)
		case "description":
			err = setStr(&out.Description, &out.UnsetDescription, raw)
		case "licenceOrigine":
			out.LicenceOrigine, err = strPtr(raw)
		case "dateExpirationDroits":
			var v *time.Time
			if err = json.Unmarshal(raw, &v); err == nil {
				if v == nil {
					out.UnsetDateExpiration = true
				} else {
					out.DateExpirationDroits = v
				}
			} else {
				// tolère "YYYY-MM-DD" en plus du RFC3339
				var s *string
				if err2 := json.Unmarshal(raw, &s); err2 == nil && s != nil {
					if t, err3 := time.Parse("2006-01-02", *s); err3 == nil {
						out.DateExpirationDroits = &t
						err = nil
					}
				}
			}
		case "telechargementAutorise":
			var v *bool
			if err = json.Unmarshal(raw, &v); err == nil && v != nil {
				out.TelechargementAutorise = v
			}
		case "visibility":
			// 000137 : promotion/démotion de périmètre — le
			// usecase la réserve à l'ADMIN (403 sinon).
			var v *string
			if err = json.Unmarshal(raw, &v); err == nil && v != nil {
				vis := domain.VisibiliteOuvrage(*v)
				out.Visibility = &vis
			}
		case "statut":
			// 000137 : modération BROUILLON→VALIDE — le usecase
			// la réserve au RESPONSABLE/ADMIN (403 sinon).
			var v *string
			if err = json.Unmarshal(raw, &v); err == nil && v != nil {
				st := domain.StatutOuvrage(*v)
				out.Statut = &st
			}
		case "classes":
			// 000137 : remplacement du ciblage CLASSE —
			// null = vider, array = nouveau ciblage (l'intersection
			// avec les classes réelles de l'enseignant est scellée
			// serveur dans le usecase).
			var rawClasses []domain.OuvrageClasseInput
			if err = json.Unmarshal(raw, &rawClasses); err == nil {
				out.Classes = rawClasses
			} else {
				var v *json.RawMessage
				if err2 := json.Unmarshal(raw, &v); err2 == nil && v == nil {
					out.UnsetClasses = true
					err = nil
				}
			}
		}
		if err != nil {
			return out, err
		}
	}
	return out, nil
}

// updateOuvrage — PATCH /api/ouvrages/{id} (ADMIN).
func (s *Server) updateOuvrage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	input, err := patchOuvrageFromRaw(body)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "champ mal formé (attendu : valeur, null ou absent)")
		return
	}

	updated, err := s.ouvrageUC.Update(r.Context(), claims, chi.URLParam(r, "id"), input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ouvrage": updated})
}

// deleteOuvrage — DELETE /api/ouvrages/{id} (ADMIN, soft delete).
func (s *Server) deleteOuvrage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if err := s.ouvrageUC.SoftDelete(r.Context(), claims, chi.URLParam(r, "id")); err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Ouvrage déplacé vers la corbeille"})
}

// restoreOuvrage — POST /api/ouvrages/{id}/restore (ADMIN).
func (s *Server) restoreOuvrage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	o, err := s.ouvrageUC.Restore(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ouvrage": o})
}

// getOuvrageFichier — GET /api/ouvrages/{id}/fichier
// URL présignée courte durée (défaut 15 min, max 900 s) pour la lecture
// in-browser. Chaque accès est journalisé (AuditLog OUVRAGE_LECTURE).
func (s *Server) getOuvrageFichier(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	expiresIn := 900
	if v := r.URL.Query().Get("expiresIn"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 900 {
			expiresIn = n
		}
	}
	ip := middleware.GetClientIP(r)
	url, err := s.ouvrageUC.GetFichierURL(r.Context(), claims, chi.URLParam(r, "id"), ip, expiresIn)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"url": url})
}

// analyzeOuvrage — POST /api/ouvrages/analyze (multipart/form-data ;
// ADMIN/RESPONSABLE/ENSEIGNANT — SECT-BIBLIO-5, tâche 2).
// Reçoit le PDF du futur ouvrage, extrait le texte des premières
// pages (lib pure Go) et demande au LLM configuré (failover de
// l'AIService) les métadonnées bibliographiques avec confiance +
// preuve par champ. Le formulaire est PRÉ-REMPLI côté client, puis
// l'HUMAIN valide, complète ou corrige (human-in-the-loop) — aucune
// de ces valeurs n'est persistée sans relecture.
// SECT-BIBLIO-8 : la réponse inclut désormais « categorie » (code de
// la taxonomie ADR-0007, suggestion IA validée contre l'enum — code
// inventé ⇒ absence de suggestion, l'humain tranche).
// Réponse TOUJOURS 200 {disponible:false, raison} si l'analyse est
// impossible (PDF scanné, IA en échec) : la saisie manuelle reste
// possible, l'aide ne doit jamais bloquer le dépôt.
//
// SECT-BIBLIO-6 (E2E prod 12/10) : deux garde-fous de latence —
//  1. BUDGET 75 s sur l'appel IA : sans deadline, attemptCtx no-op → un
//     provider qui pend consomme jusqu'à 5 min (timeout client http IA)
//     et le failover n'a plus de budget pour les suivants. À ≥ 60 s,
//     attemptCtx passe en mode NON-CAPPÉ (politique workers) : chaque
//     provider a le temps QU'IL LUI FAUT, le budget total reste le
//     garde-fou (75 s). Pourquoi pas 40 s ? E2E local : l'extraction de
//     métadonnées sur qwen3.8-27b/OpenRouter prend 12,9 s (instance
//     saine) à >15 s (congestion free-tier variable à la minute) — la
//     part fixe de 15 s coupait la réponse EN COURS du seul provider
//     sain. 75 s tolère la congestion tout en tuant les providers
//     réellement pendus ; les échecs instantanés (402/403, ~0,5 s) ne
//     consomment rien.
//  2. REARM du WriteDeadline (+25 s de marge) : le WriteTimeout global
//     30 s (main.go) est posé à la lecture des headers — sans réarmement,
//     une réponse calculée en 25-30 s est TUÉE EN SILENCE (0 octet écrit,
//     le client reçoit 502 vide — reproduit en prod : 502 à 46 s et 64 s,
//     instance chaude, PDF texte extrait OK). Le réarmement garantit que
//     le handler peut TOUJOURS livrer son {disponible:false, raison}.
const analyzeBudget = 75 * time.Second

func (s *Server) analyzeOuvrage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
	// SECT-BIBLIO-6 : 8 Mo en RAM max (le surplus va en fichiers temporaires
	// — avant : 100 Mo de RAM Render free pour un seul PDF volumineux).
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeJSONError(w, http.StatusBadRequest, "fichier trop volumineux ou formulaire invalide (max 100 Mo)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "fichier 'file' requis")
		return
	}
	defer func() { _ = file.Close() }()

	content, err := io.ReadAll(file)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "lecture du fichier échouée")
		return
	}

	// SECT-BIBLIO-6 : budget + réarmement AVANT l'appel IA (voir doc ci-dessus).
	ctx, cancel := context.WithTimeout(r.Context(), analyzeBudget)
	defer cancel()
	rearmWriteDeadline(w, analyzeBudget+25*time.Second)

	result, err := s.ouvrageUC.Analyze(ctx, claims, content, header.Filename)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// mesClassesOuvrage — GET /api/ouvrages/mes-classes (ENSEIGNANT).
// Les classes (filière × niveau) de l'enseignant courant — pour le
// sélecteur « classes destinataires » du formulaire de dépôt (le
// serveur intersecte de toute façon avec ces classes : usurpation
// impossible, 000137).
func (s *Server) mesClassesOuvrage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	classes, err := s.ouvrageUC.MesClasses(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"classes": classes})
}

// validerOuvrage — POST /api/ouvrages/{id}/valider
// (RESPONSABLE/ADMIN — SECT-BIBLIO-5) : publie un BROUILLON (dépôt
// enseignant) — human-in-the-loop, le responsable modère son
// établissement.
func (s *Server) validerOuvrage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	o, err := s.ouvrageUC.ValiderOuvrage(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ouvrage": o})
}
