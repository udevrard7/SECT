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
	"log/slog"
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

	// SECT-NOTIF-STUDENT-1 : PATCH statut=VALIDE — même garde que
	// validerOuvrage : ne notifier que la transition BROUILLON→VALIDE
	// (pas les re-PATCH idempotents sur un ouvrage déjà validé).
	wasBrouillon := false
	if input.Statut != nil && *input.Statut == domain.StatutOuvrageValide {
		if before, errB := s.ouvrageUC.GetByID(r.Context(), claims, chi.URLParam(r, "id")); errB == nil {
			wasBrouillon = before.Statut == domain.StatutOuvrageBrouillon
		}
	}

	updated, err := s.ouvrageUC.Update(r.Context(), claims, chi.URLParam(r, "id"), input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// SECT-NOTIF-STUDENT-1 : annonce « nouvel ouvrage en bibliothèque »
	// (fire-and-forget — cf. student_notify.go).
	if wasBrouillon && updated != nil && updated.Statut == domain.StatutOuvrageValide {
		s.notifyOuvragePublished(claims, updated)
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
// in-browser du lecteur NATIF. Chaque accès est journalisé (AuditLog
// OUVRAGE_LECTURE).
// SECT-BIBLIO-14 : réservé aux ouvrages telechargementAutorise=true
// (le lecteur natif n'est légitime que si le téléchargement est autorisé) ;
// un ouvrage verrouillé se lit par /flux (rendu canvas sécurisé) — une URL
// présignée collée en barre d'adresse redonnerait le lecteur natif et son
// bouton « Télécharger » : 403 ici, la fuite est fermée aux deux bouts.
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

// getOuvrageFlux — GET /api/ouvrages/{id}/flux (SECT-BIBLIO-14)
// STREAM du PDF, même-origine, pour le lecteur SÉCURISÉ (rendu canvas
// pdf.js côté frontend — ouvrages dont telechargementAutorise=false).
// Sémantique LECTURE : RLS via FindByID (404 si invisible) + audit
// OUVRAGE_LECTURE. Le flag ne bloque PAS ici (ADR-0007 : la consultation
// en ligne est le droit par défaut) — l'ACTE téléchargement vit sur
// /telechargement (403 + attachment jamais émis).
//
// Garde anti-navigation (Sec-Fetch-Dest: document → 403) : ouvrir /flux
// comme un DOCUMENT (onglet, window.open, <a target>) donnerait le
// lecteur PDF NATIF du navigateur et son bouton « Télécharger » — la
// fuite exacte constatée par l'exploitant. fetch()/XHR (Sec-Fetch-Dest:
// empty) passent. L'en-tête est absent des navigateurs anciens → toléré
// (pas de rupture, l'en-tête n'est vérifié que s'il est présent).
func (s *Server) getOuvrageFlux(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Sec-Fetch-Dest") == "document" {
		writeJSONError(w, http.StatusForbidden, "le flux de lecture n'est pas adressable en navigation directe (lecture dans l'application)")
		return
	}
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	ip := middleware.GetClientIP(r)
	flux, err := s.ouvrageUC.GetFluxLecture(r.Context(), claims, chi.URLParam(r, "id"), ip)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	defer func() { _ = flux.Body.Close() }()

	// Inline JAMAIS attachment (l'acte téléchargement est /telechargement).
	// Le nom sanitizé est un repère visuel d'audit si la réponse est
	// observée ; le client fetch() n'utilise pas la disposition.
	w.Header().Set("Content-Type", flux.ContentType)
	w.Header().Set("Content-Disposition", `inline; filename="`+flux.Filename+`"`)
	w.Header().Set("Cache-Control", "no-store, private")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if flux.ContentLength > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(flux.ContentLength, 10))
	}
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, flux.Body); err != nil {
		// Erreur en cours de stream : les en-têtes sont partis —
		// on ne peut que couper la connexion et tracer.
		slog.Warn("bibliothèque: interruption du flux de lecture", "error", err)
	}
}

// getOuvrageTelechargement — GET /api/ouvrages/{id}/telechargement
// (SECT-BIBLIO-13) : URL présignée en disposition ATTACHMENT — le
// navigateur pose le fichier sur disque (nom de fichier dérivé du titre,
// sanitizé) au lieu de l'afficher. C'est la SEULE voie de téléchargement :
// elle vérifie telechargementAutorise côté serveur (403 sinon — l'URL
// n'est jamais émise) et journalise OUVRAGE_TELECHARGEMENT (trace distincte
// de la lecture). Tous rôles authentifiés : l'AUTORISATION est le flag de
// l'ouvrage, pas le rôle de l'appelant (un ADMIN ne « détourne » pas plus
// qu'un étudiant — la politique est par ouvrage, décision du déposant).
func (s *Server) getOuvrageTelechargement(w http.ResponseWriter, r *http.Request) {
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
	url, err := s.ouvrageUC.GetTelechargementURL(r.Context(), claims, chi.URLParam(r, "id"), ip, expiresIn)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"url": url})
}

// getOuvrageLectureVocale — GET /api/ouvrages/{id}/lecture-vocale (SECT-TTS-1)
// Audio de synthèse d'une PAGE d'ouvrage : lecture ORALE, chaîne 0 coût
// (Gemini TTS studio → MeloTTS en dernier secours — clés déjà en base ;
// SECT-TTS-4 : la couche Edge est retirée du système).
//
// Paramètres : page (1-based, défaut 1), voice (voix studio Gemini —
// liste blanche serveur, défaut kore ; une éventuelle valeur
// « edge:xxx » héritée d'un ancien réglage est blanchie vers Kore),
// vitesse (0.75–1.25, défaut 1).
//
// Sémantique LECTURE (comme /flux) : RequireAuth + visibilité RLS
// (404 si invisible), audit OUVRAGE_LECTURE, le flag
// telechargementAutorise ne s'applique pas — l'audio de synthèse n'est
// pas le fichier d'origine. LE TEXTE EXTRAIT NE SORT JAMAIS : seuls des
// octets audio partent (posture BIBLIO-14/15, zéro égress textuel).
//
// En-têtes d'observabilité : X-Sect-Tts-Provider (gemini|melotts),
// X-Sect-Nb-Pages (total du document — avance automatique du lecteur
// côté client), X-Sect-Tts-Model.
func (s *Server) getOuvrageLectureVocale(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	page := 1
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100_000 {
			page = n
		}
	}
	voice := r.URL.Query().Get("voice") // normalisé (liste blanche) côté service
	vitesse := r.URL.Query().Get("vitesse")
	ip := middleware.GetClientIP(r)

	result, err := s.ouvrageUC.GetLectureVocale(r.Context(), claims, chi.URLParam(r, "id"), page, voice, vitesse, ip)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Audio INLINE (jamais attachment : ce n'est pas l'acte
	// téléchargement), no-store (l'audio n'est pas cachetable par un
	// intermédiaire — il est journalisé comme une lecture).
	ext := ".wav"
	if result.ContentType == "audio/mpeg" {
		ext = ".mp3"
	}
	w.Header().Set("Content-Type", result.ContentType)
	w.Header().Set("Content-Disposition", `inline; filename="lecture-page-`+strconv.Itoa(page)+ext+`"`)
	w.Header().Set("Cache-Control", "no-store, private")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Sect-Tts-Provider", result.Provider)
	w.Header().Set("X-Sect-Tts-Model", result.Model)
	if result.NbPages > 0 {
		w.Header().Set("X-Sect-Nb-Pages", strconv.Itoa(result.NbPages))
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(result.Audio)))
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(result.Audio); err != nil {
		// Les en-têtes sont partis — couper proprement et tracer.
		slog.Warn("bibliothèque: interruption du flux vocal", "error", err)
	}
}

// getOuvrageCouverture — GET /api/ouvrages/{id}/couverture (SECT-BIBLIO-12)
// URL présignée courte durée du JPEG de couverture (page 1 rastérisée au
// dépôt). Même chaîne de contrôle que le fichier : FindByID sous RLS →
// ouvrage invisible = 404 (jamais de fuite d'existence). 404 aussi si
// l'ouvrage n'a pas de couverture (déposé avant 000140, échec de
// rastérisation, ou déploiement sans poppler) : le client retombe sur
// l'icône catégorie. PAS d'AuditLog : dérivé visuel, pas une lecture
// (sinon N lignes de bruit par affichage de catalogue).
func (s *Server) getOuvrageCouverture(w http.ResponseWriter, r *http.Request) {
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
	url, err := s.ouvrageUC.GetCouvertureURL(r.Context(), claims, chi.URLParam(r, "id"), expiresIn)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"url": url})
}

// regenererOuvrageCouverture — POST /api/ouvrages/{id}/couverture/regenerer
// (SECT-BIBLIO-12 — ADMIN/RESPONSABLE/ENSEIGNANT dans leur périmètre).
// Rastérise la page 1 du PDF stocké en R2 (stream disque, jamais en RAM)
// et met à jour les colonnes couverture. Utile pour les ouvrages déposés
// AVANT 000140 et les échecs transitoires. Réponse : { ouvrage } à jour.
func (s *Server) regenererOuvrageCouverture(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	o, err := s.ouvrageUC.RegenererCouverture(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ouvrage": o})
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
// SECT-BIBLIO-9 : la réponse inclut aussi « licenceOrigine » (PISTE
// recopiée de la mention © imprimée — la déclaration de droits reste
// un acte humain, garde-fou ADR-0007), « filiere » (discipline en
// texte libre — le CLIENT la rapproche des CUID des filières réelles)
// et « niveau » (code NiveauxEtude validé contre l'enum).
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
	// SECT-NOTIF-STUDENT-1 : lire le statut AVANT validation pour ne
	// notifier la transition BROUILLON→VALIDE qu'une seule fois (l'appel
	// idempotent sur un ouvrage déjà VALIDE ne re-notifie pas).
	wasBrouillon := false
	if before, errB := s.ouvrageUC.GetByID(r.Context(), claims, chi.URLParam(r, "id")); errB == nil {
		wasBrouillon = before.Statut == domain.StatutOuvrageBrouillon
	}

	o, err := s.ouvrageUC.ValiderOuvrage(r.Context(), claims, chi.URLParam(r, "id"))
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// SECT-NOTIF-STUDENT-1 : annonce « nouvel ouvrage en bibliothèque » aux
	// étudiants de la filière recommandée (in-app + SSE + push + email +
	// Telegram, fire-and-forget). Uniquement sur la validation réelle —
	// un BROUILLON est invisible des étudiants (modération 000137).
	if wasBrouillon && o != nil && o.Statut == domain.StatutOuvrageValide {
		s.notifyOuvragePublished(claims, o)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ouvrage": o})
}
