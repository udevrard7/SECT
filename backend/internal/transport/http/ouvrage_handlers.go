// ouvrage_handlers.go — handlers HTTP de la bibliothèque numérique
// (ADR-0007 P1). Routes montées dans router.go : /api/ouvrages.
//
// G1 : mutations réservées à l'ADMIN (router RequireRole + usecase,
// défense en profondeur). Lectures : tous rôles authentifiés — le scoping
// établissement / corbeille / droits expirés est fait par les policies
// RLS Ouvrage_* (000123).
package http

import (
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
		Search:    strings.TrimSpace(q.Get("q")),
		Categorie: domain.CategorieOuvrage(q.Get("categorie")),
		FiliereID: strings.TrimSpace(q.Get("filiereId")),
		Niveau:    strings.TrimSpace(q.Get("niveau")),
	}
	if params.Categorie == "" || !domain.IsValidOuvrageCategorie(params.Categorie) {
		params.Categorie = "" // filtre invalide ignoré (c'est un filtre UI, pas une saisie)
	}
	if params.Niveau != "" && !domain.IsValidNiveauEtude(params.Niveau) {
		params.Niveau = ""
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

// uploadOuvrage — POST /api/ouvrages (multipart/form-data, ADMIN).
// Champs : file (PDF, requis) ; titre, categorie, licenceOrigine,
// etablissementId (requis) ; auteurs, editeur, edition, anneePublication,
// isbn, langue, filiereId, niveau, themes, description,
// dateExpirationDroits (RFC3339 ou YYYY-MM-DD), telechargementAutorise.
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
