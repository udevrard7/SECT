// Package repository — implémentation EpreuveRepository.
package repository

import (
        "context"
        "encoding/json"
        "fmt"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// DebugEpreuveList stores debug info from the last List call
var DebugEpreuveList = map[string]any{}

// EpreuveRepository implémente domain.EpreuveRepository.
type EpreuveRepository struct {
        pool *pgxpool.Pool
}

// NewEpreuveRepository crée un nouveau EpreuveRepository.
func NewEpreuveRepository(pool *pgxpool.Pool) *EpreuveRepository {
        return &EpreuveRepository{pool: pool}
}

const columnsEpreuve = `"id", "enseignantId", "titre", "description", "duree", "dateDebut", "dateFin",
        "melangeQuestions", "melangePropositions", "blocageRetour", "statut", "groupesCibles", "contenu",
        "filiereId", "uniteEnseignementId", "niveau", "sessionExamen", "anneeAcademiqueId",
        "createdAt", "updatedAt", "deletedAt", "proctoringActif", "verificationIdentite",
        "generationMode", "isTemplate", "noteTotal", "clotureeAt", "clotureeAutomatiquement",
        "raisonCloture", "clotureePar", "delaiGrace", "etudiantsAutorises", "epreuveOrigineId"`

// columnsEpreuveQualified : mêmes colonnes qualifiées avec "Epreuve". pour
// éviter l'ambiguïté lors d'un LEFT JOIN User (qui a aussi "id", "name").
// BUGFIX (ETU-AUDIT-1b).
const columnsEpreuveQualified = `"Epreuve"."id", "Epreuve"."enseignantId", "Epreuve"."titre", "Epreuve"."description", "Epreuve"."duree", "Epreuve"."dateDebut", "Epreuve"."dateFin",
        "Epreuve"."melangeQuestions", "Epreuve"."melangePropositions", "Epreuve"."blocageRetour", "Epreuve"."statut", "Epreuve"."groupesCibles", "Epreuve"."contenu",
        "Epreuve"."filiereId", "Epreuve"."uniteEnseignementId", "Epreuve"."niveau", "Epreuve"."sessionExamen", "Epreuve"."anneeAcademiqueId",
        "Epreuve"."createdAt", "Epreuve"."updatedAt", "Epreuve"."deletedAt", "Epreuve"."proctoringActif", "Epreuve"."verificationIdentite",
        "Epreuve"."generationMode", "Epreuve"."isTemplate", "Epreuve"."noteTotal", "Epreuve"."clotureeAt", "Epreuve"."clotureeAutomatiquement",
        "Epreuve"."raisonCloture", "Epreuve"."clotureePar", "Epreuve"."delaiGrace", "Epreuve"."etudiantsAutorises", "Epreuve"."epreuveOrigineId"`

// scanEpreuveWithJoins scan une épreuve + les colonnes User/Filiere/UE du LEFT JOIN.
func scanEpreuveWithJoins(s scanner) (*domain.Epreuve, error) {
        e := &domain.Epreuve{}
        var ensID, ensName, ensEmail *string
        var filID, filNom, filCode *string
        var ueID, ueNom, ueCode, ueNiveau *string
        err := s.Scan(
                &e.ID, &e.EnseignantID, &e.Titre, &e.Description, &e.Duree, &e.DateDebut, &e.DateFin,
                &e.MelangeQuestions, &e.MelangePropositions, &e.BlocageRetour, &e.Statut,
                &e.GroupesCibles, &e.Contenu,
                &e.FiliereID, &e.UniteEnseignementID, &e.Niveau, &e.SessionExamen, &e.AnneeAcademiqueID,
                &e.CreatedAt, &e.UpdatedAt, &e.DeletedAt,
                &e.ProctoringActif, &e.VerificationIdentite,
                &e.GenerationMode, &e.IsTemplate, &e.NoteTotal,
                &e.ClotureeAt, &e.ClotureeAutomatiquement, &e.RaisonCloture, &e.ClotureePar,
                &e.DelaiGrace, &e.EtudiantsAutorises, &e.EpreuveOrigineID,
                &ensID, &ensName, &ensEmail,
                &filID, &filNom, &filCode,
                &ueID, &ueNom, &ueCode, &ueNiveau,
        )
        if err != nil {
                return nil, err
        }
        e.GroupesCibles = sanitizeEpreuveRawMessage(e.GroupesCibles)
        e.Contenu = sanitizeEpreuveRawMessage(e.Contenu)
        e.EtudiantsAutorises = sanitizeEpreuveRawMessage(e.EtudiantsAutorises)
        if ensID != nil && ensName != nil {
                e.Enseignant = &domain.UserRef{ID: *ensID, Name: *ensName, Email: derefStr(ensEmail)}
        }
        if filID != nil && filNom != nil {
                e.Filiere = &domain.FiliereRef{ID: *filID, Nom: *filNom, Code: derefStr(filCode)}
        }
        if ueID != nil && ueNom != nil {
                e.UniteEnseignement = &domain.UERef{ID: *ueID, Nom: *ueNom, Code: derefStr(ueCode), Niveau: derefStr(ueNiveau)}
        }
        return e, nil
}

func scanEpreuve(s scanner) (*domain.Epreuve, error) {
        e := &domain.Epreuve{}
        err := s.Scan(
                &e.ID, &e.EnseignantID, &e.Titre, &e.Description, &e.Duree, &e.DateDebut, &e.DateFin,
                &e.MelangeQuestions, &e.MelangePropositions, &e.BlocageRetour, &e.Statut,
                &e.GroupesCibles, &e.Contenu,
                &e.FiliereID, &e.UniteEnseignementID, &e.Niveau, &e.SessionExamen, &e.AnneeAcademiqueID,
                &e.CreatedAt, &e.UpdatedAt, &e.DeletedAt,
                &e.ProctoringActif, &e.VerificationIdentite,
                &e.GenerationMode, &e.IsTemplate, &e.NoteTotal,
                &e.ClotureeAt, &e.ClotureeAutomatiquement, &e.RaisonCloture, &e.ClotureePar,
                &e.DelaiGrace, &e.EtudiantsAutorises, &e.EpreuveOrigineID,
        )
        if err != nil {
                return nil, err
        }
        // Sanitize json.RawMessage fields
        e.GroupesCibles = sanitizeEpreuveRawMessage(e.GroupesCibles)
        e.Contenu = sanitizeEpreuveRawMessage(e.Contenu)
        e.EtudiantsAutorises = sanitizeEpreuveRawMessage(e.EtudiantsAutorises)
        return e, nil
}

// sanitizeEpreuveRawMessage identique à sanitizeRawMessage du package question.
func sanitizeEpreuveRawMessage(raw json.RawMessage) json.RawMessage {
        if len(raw) == 0 || string(raw) == "null" {
                return nil
        }
        var v any
        if err := json.Unmarshal(raw, &v); err != nil {
                return nil
        }
        return raw
}

// FindByID récupère une épreuve par ID (RLS actif, exclut deletedAt).
func (r *EpreuveRepository) FindByID(ctx context.Context, id string) (*domain.Epreuve, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var e *domain.Epreuve
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // P1-E5 : mêmes JOINs que List (User + Filiere + UE)
                row := tx.QueryRow(ctx, fmt.Sprintf(`
                        SELECT %s, u."id", u."name", u."email", f."id", f."nom", f."code", ue."id", ue."nom", ue."code", ue."niveau"
                        FROM "Epreuve"
                        LEFT JOIN "User" u ON u."id" = "Epreuve"."enseignantId"
                        LEFT JOIN "Filiere" f ON f."id" = "Epreuve"."filiereId"
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = "Epreuve"."uniteEnseignementId"
                        WHERE "Epreuve"."id" = $1 AND "Epreuve"."deletedAt" IS NULL
                `, columnsEpreuveQualified), id)
                ep, err := scanEpreuveWithJoins(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Epreuve", ID: id}
                        }
                        return fmt.Errorf("query epreuve: %w", err)
                }
                // P1-E5 : init Sessions à [] (évite null → crash frontend)
                ep.Sessions = []domain.SessionRef{}
                // EVALUATIONS-FIX-EV4 : peupler Questions depuis contenu JSON +
                // compute QuestionCount + TotalPoints. Avant, getEpreuve retournait
                // questions:[] (non hydraté) → dialog détail vide. Désormais on parse
                // contenu.questions et on crée des EpreuveQuestion avec QuestionRef.
                if ep.Contenu != nil && len(ep.Contenu) > 0 {
                        var contenu struct {
                                Questions []struct {
                                        ID           string  `json:"id"`
                                        Type         string  `json:"type"`
                                        Enonce       string  `json:"enonce"`
                                        Bareme       float64 `json:"bareme"`
                                        Difficulte   string  `json:"difficulte"`
                                        Explication  string  `json:"explication"`
                                } `json:"questions"`
                        }
                        if json.Unmarshal(ep.Contenu, &contenu) == nil {
                                qc := len(contenu.Questions)
                                ep.QuestionCount = &qc
                                tp := 0.0
                                eqs := make([]domain.EpreuveQuestion, 0, qc)
                                for i, q := range contenu.Questions {
                                        tp += q.Bareme
                                        eqs = append(eqs, domain.EpreuveQuestion{
                                                ID:         fmt.Sprintf("%s-q%d", ep.ID, i+1),
                                                EpreuveID:  ep.ID,
                                                QuestionID: q.ID,
                                                Bareme:     q.Bareme,
                                                Ordre:      i + 1,
                                                Question: &domain.QuestionRef{
                                                        ID:          q.ID,
                                                        Type:        domain.TypeQuestion(q.Type),
                                                        Enonce:      q.Enonce,
                                                        Difficulte:  domain.Difficulte(q.Difficulte),
                                                },
                                        })
                                }
                                ep.Questions = eqs
                                if tp > 0 {
                                        ep.TotalPoints = &tp
                                }
                        }
                }
                // EVALUATIONS-FIX-EV4 : hydrater les sessions (toutes les
                // SessionPassation de cette épreuve). Avant, Sessions restait [].
                sessRows, err := tx.Query(ctx, `
                        SELECT sp."id", sp."epreuveId", sp."etudiantId", sp."statut", sp."dateDebut", sp."dateFin", sp."score",
                               u."id", u."name", u."email",
                               r."id", r."scoreFinal", r."totalPossible", r."detailParQuestion"
                        FROM "SessionPassation" sp
                        LEFT JOIN "User" u ON u."id" = sp."etudiantId"
                        LEFT JOIN "Resultat" r ON r."sessionId" = sp."id"
                        WHERE sp."epreuveId" = $1
                        ORDER BY sp."createdAt" DESC
                `, id)
                if err == nil {
                        defer sessRows.Close()
                        for sessRows.Next() {
                                sr := domain.SessionRef{}
                                var epreuveID string
                                var etuID, etuName, etuEmail *string
                                var rID *string
                                var rScoreFinal, rTotalPossible *float64
                                var rDetail *string
                                if err := sessRows.Scan(
                                        &sr.ID, &epreuveID, &sr.EtudiantID, &sr.Statut, &sr.DateDebut, &sr.DateFin, &sr.Score,
                                        &etuID, &etuName, &etuEmail,
                                        &rID, &rScoreFinal, &rTotalPossible, &rDetail,
                                ); err == nil {
                                        if etuID != nil && etuName != nil {
                                                sr.Etudiant = &domain.UserRef{
                                                        ID:    *etuID,
                                                        Name:  *etuName,
                                                        Email: derefStr(etuEmail),
                                                }
                                        }
                                        if rID != nil && rScoreFinal != nil {
                                                sr.Resultat = &domain.ResultatRef{
                                                        ID:                *rID,
                                                        ScoreFinal:        *rScoreFinal,
                                                        TotalPossible:     derefFloat(rTotalPossible),
                                                        DetailParQuestion: derefStr(rDetail),
                                                }
                                        }
                                        ep.Sessions = append(ep.Sessions, sr)
                                }
                        }
                }
                e = ep
                return nil
        })
        if err != nil {
                return nil, err
        }
        return e, nil
}

// List liste les épreuves (RLS actif).
// EVALUATIONS-FIX-EV7 : List retourne désormais (epreuves, total, error) pour
// supporter la pagination optionnelle. Si params.Page > 0, ajoute LIMIT/OFFSET
// + un count total séparé. Sinon, total = len(epreuves) (pas de pagination).
func (r *EpreuveRepository) List(ctx context.Context, params domain.EpreuveListParams) ([]*domain.Epreuve, int, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, 0, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.Epreuve
        total := 0
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                // BUGFIX (SESSIONS-SEARCH-1) : qualifier avec "Epreuve". car les LEFT JOINs
                // (Filiere, UniteEnseignement) ont des colonnes homonymes (description, niveau,
                // filiereId) → ambiguous column reference → HTTP 500.
                where = append(where, `"Epreuve"."deletedAt" IS NULL`)

                if params.EnseignantID != "" {
                        where = append(where, fmt.Sprintf(`"Epreuve"."enseignantId" = $%d`, argIdx))
                        args = append(args, params.EnseignantID)
                        argIdx++
                }
                if params.FiliereID != "" {
                        where = append(where, fmt.Sprintf(`"Epreuve"."filiereId" = $%d`, argIdx))
                        args = append(args, params.FiliereID)
                        argIdx++
                }
                if len(params.Statuts) > 0 {
                        placeholders := make([]string, len(params.Statuts))
                        for i, st := range params.Statuts {
                                placeholders[i] = fmt.Sprintf("$%d", argIdx)
                                args = append(args, st)
                                argIdx++
                        }
                        where = append(where, fmt.Sprintf(`"Epreuve"."statut" IN (%s)`, strings.Join(placeholders, ",")))
                }
                if params.Search != "" {
                        // BUGFIX (SESSIONS-SEARCH-1) : pgx Simple Protocol + ILIKE + LEFT JOINs
                        // cause un HTTP 500 (bug d'inlining pgx). Contournement : inliner la
                        // valeur search directement dans la query avec échappement des
                        // guillemets simples. Safe (pas d'injection SQL possible).
                        escapedSearch := strings.ReplaceAll(params.Search, "'", "''")
                        where = append(where, fmt.Sprintf(`("Epreuve"."titre" ILIKE '%%%s%%' OR "Epreuve"."description" ILIKE '%%%s%%')`, escapedSearch, escapedSearch))
                }
                if params.Niveau != "" {
                        where = append(where, fmt.Sprintf(`"Epreuve"."niveau" = $%d`, argIdx))
                        args = append(args, params.Niveau)
                        argIdx++
                }
                if params.SessionExamen != "" {
                        where = append(where, fmt.Sprintf(`"Epreuve"."sessionExamen" = $%d`, argIdx))
                        args = append(args, params.SessionExamen)
                        argIdx++
                }
                if params.AnneeAcademiqueID != "" {
                        where = append(where, fmt.Sprintf(`"Epreuve"."anneeAcademiqueId" = $%d`, argIdx))
                        args = append(args, params.AnneeAcademiqueID)
                        argIdx++
                }
                if params.UniteEnseignementID != "" {
                        where = append(where, fmt.Sprintf(`"Epreuve"."uniteEnseignementId" = $%d`, argIdx))
                        args = append(args, params.UniteEnseignementID)
                        argIdx++
                }
                // EtudiantID : épreuves où l'étudiant a une session
                if params.EtudiantID != "" {
                        where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "SessionPassation" sp WHERE sp."epreuveId" = "Epreuve"."id" AND sp."etudiantId" = $%d)`, argIdx))
                        args = append(args, params.EtudiantID)
                        argIdx++
                }
                // EVALUATIONS-FIX-EV2 (CRITICAL) : ResponsableID — filtrer par les
                // filières dont le responsable est le user. Avant, ResponsableID
                // était passé par handler+usecase mais ignoré par le repo → le
                // responsable voyait toutes les épreuves de son établissement
                // (via RLS) au lieu de seulement celles de ses filières.
                if params.ResponsableID != "" {
                        where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "Filiere" f WHERE f."id" = "Epreuve"."filiereId" AND f."responsableId" = $%d)`, argIdx))
                        args = append(args, params.ResponsableID)
                        argIdx++
                }

                whereClause := "WHERE " + strings.Join(where, " AND ")

                // EVALUATIONS-FIX-EV7 : si pagination active, faire un count
                // séparé AVANT la query paginée. Le count utilise le même
                // whereClause mais sans LEFT JOINs (plus rapide).
                if params.Page > 0 && params.Limit > 0 {
                        countQuery := fmt.Sprintf(`SELECT count(*) FROM "Epreuve" %s`, whereClause)
                        if err := tx.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
                                return fmt.Errorf("count epreuves: %w", err)
                        }
                }

                // EV7 : suffixe pagination (LIMIT/OFFSET) si Page > 0.
                paginationSuffix := ""
                if params.Page > 0 && params.Limit > 0 {
                        offset := (params.Page - 1) * params.Limit
                        paginationSuffix = fmt.Sprintf(` LIMIT %d OFFSET %d`, params.Limit, offset)
                }

                var query string

                // DEBUG: store count from inside the repo's transaction
                var debugCount int
                _ = tx.QueryRow(ctx, fmt.Sprintf(`SELECT count(*)::int FROM "Epreuve" %s`, whereClause), args...).Scan(&debugCount)
                DebugEpreuveList["repoCount"] = debugCount
                DebugEpreuveList["whereClause"] = whereClause
                DebugEpreuveList["argsLen"] = len(args)

                if params.Select == "summary" {
                        // Format léger pour les dropdowns
                        query = fmt.Sprintf(`SELECT "id", "titre", "dateDebut", "dateFin", "statut", "noteTotal" FROM "Epreuve" %s ORDER BY "dateDebut" DESC%s`, whereClause, paginationSuffix)
                        rows, err := tx.Query(ctx, query, args...)
                        if err != nil {
                                return fmt.Errorf("query epreuves summary: %w", err)
                        }
                        defer rows.Close()
                        for rows.Next() {
                                e := &domain.Epreuve{}
                                var filiereNom *string
                                _ = filiereNom
                                if err := rows.Scan(&e.ID, &e.Titre, &e.DateDebut, &e.DateFin, &e.Statut, &e.NoteTotal); err != nil {
                                        return fmt.Errorf("scan epreuve summary: %w", err)
                                }
                                // BUGFIX (ETU-AUDIT-1) : init Sessions à [] pour éviter
                                // null dans le JSON (qui crasherait le frontend).
                                e.Sessions = []domain.SessionRef{}
                                result = append(result, e)
                        }
                } else {
                        // BUGFIX (ETU-AUDIT-1b) : LEFT JOIN User pour peupler la
                        // relation enseignant (UserRef{ID, Name, Email}).
                        // BUGFIX (FILIERE-FIX-1b) : LEFT JOIN Filiere pour peupler la
                        // relation filiere (FiliereRef{ID, Nom, Code}).
                        // BUGFIX (DUPLICATE-UE-1) : LEFT JOIN UniteEnseignement pour peupler
                        // uniteEnseignement (UERef{ID,Code,Nom,Niveau}). Mirroir du pattern
                        // Filiere. Corrige l'affichage du nom/code UE dans les cartes /epreuves
                        // et rend la duplication robuste.
                        query = fmt.Sprintf(`SELECT %s, u."id", u."name", u."email", f."id", f."nom", f."code", ue."id", ue."nom", ue."code", ue."niveau" FROM "Epreuve" LEFT JOIN "User" u ON u."id" = "Epreuve"."enseignantId" LEFT JOIN "Filiere" f ON f."id" = "Epreuve"."filiereId" LEFT JOIN "UniteEnseignement" ue ON ue."id" = "Epreuve"."uniteEnseignementId" %s ORDER BY "Epreuve"."dateDebut" DESC%s`, columnsEpreuveQualified, whereClause, paginationSuffix)
                        rows, err := tx.Query(ctx, query, args...)
                        if err != nil {
                                return fmt.Errorf("query epreuves: %w", err)
                        }
                        defer rows.Close()
                        for rows.Next() {
                                e := &domain.Epreuve{}
                                var ensID, ensName, ensEmail *string
                                var filID, filNom, filCode *string
                                var ueID, ueNom, ueCode, ueNiveau *string
                                err := rows.Scan(
                                        &e.ID, &e.EnseignantID, &e.Titre, &e.Description, &e.Duree, &e.DateDebut, &e.DateFin,
                                        &e.MelangeQuestions, &e.MelangePropositions, &e.BlocageRetour, &e.Statut,
                                        &e.GroupesCibles, &e.Contenu,
                                        &e.FiliereID, &e.UniteEnseignementID, &e.Niveau, &e.SessionExamen, &e.AnneeAcademiqueID,
                                        &e.CreatedAt, &e.UpdatedAt, &e.DeletedAt,
                                        &e.ProctoringActif, &e.VerificationIdentite,
                                        &e.GenerationMode, &e.IsTemplate, &e.NoteTotal,
                                        &e.ClotureeAt, &e.ClotureeAutomatiquement, &e.RaisonCloture, &e.ClotureePar,
                                        &e.DelaiGrace, &e.EtudiantsAutorises, &e.EpreuveOrigineID,
                                        &ensID, &ensName, &ensEmail,
                                        &filID, &filNom, &filCode,
                                        &ueID, &ueNom, &ueCode, &ueNiveau,
                                )
                                if err != nil {
                                        fmt.Printf("DEBUG scan epreuve error: %v\n", err)
                                        return fmt.Errorf("scan epreuve: %w", err)
                                }
                                // Sanitize json.RawMessage fields (reproduit scanEpreuve)
                                e.GroupesCibles = sanitizeEpreuveRawMessage(e.GroupesCibles)
                                e.Contenu = sanitizeEpreuveRawMessage(e.Contenu)
                                e.EtudiantsAutorises = sanitizeEpreuveRawMessage(e.EtudiantsAutorises)
                                if ensID != nil && ensName != nil {
                                        e.Enseignant = &domain.UserRef{
                                                ID:    *ensID,
                                                Name:  *ensName,
                                                Email: derefStr(ensEmail),
                                        }
                                }
                                if filID != nil && filNom != nil {
                                        e.Filiere = &domain.FiliereRef{
                                                ID:   *filID,
                                                Nom:  *filNom,
                                                Code: derefStr(filCode),
                                        }
                                }
                                if ueID != nil && ueNom != nil {
                                        e.UniteEnseignement = &domain.UERef{
                                                ID:     *ueID,
                                                Nom:    *ueNom,
                                                Code:   derefStr(ueCode),
                                                Niveau: derefStr(ueNiveau),
                                        }
                                }
                                // BUGFIX (ETU-AUDIT-1) : init Sessions à [] par défaut.
                                e.Sessions = []domain.SessionRef{}
                                result = append(result, e)
                        }
                }
                if result == nil {
                        result = []*domain.Epreuve{}
                }

                // BUGFIX (ETU-AUDIT-1) : hydratation des sessions pour la vue étudiant.
                // Quand EtudiantID est fourni (vue /mes-epreuves), on fait une requête
                // batch pour récupérer les sessions de passation de cet étudiant pour
                // chaque épreuve. Le frontend utilise ep.sessions.some(s => s.statut === ...)
                // pour filtrer upcoming vs completed — sans cet include, ep.sessions est
                // undefined → TypeError: Cannot read properties of undefined (reading 'some').
                // BUGFIX (EPREUVES-SESSIONS-1): hydrater les sessions aussi pour
                // l'enseignant (vue /epreuves onglet Sessions) et pas seulement
                // pour l'étudiant (vue /mes-epreuves).
                // EVALUATIONS-FIX-EV1 (CRITICAL) : hydrater les sessions aussi pour
                // le responsable (vue /evaluations). Avant, seulement EtudiantID ou
                // EnseignantID déclenchait l'hydratation → le responsable voyait
                // sessions:[] pour toutes les épreuves → "Aucun participant" sur
                // toutes les cartes, stats Alertes=0, dialog Résultats vide.
                if (params.EtudiantID != "" || params.EnseignantID != "" || params.ResponsableID != "") && len(result) > 0 {
                        epreuveIDs := make([]string, len(result))
                        for i, e := range result {
                                epreuveIDs[i] = e.ID
                        }
                        // BUGFIX (EPREUVES-SESSIONS-1): pour l'enseignant, récupérer
                        // TOUTES les sessions de ses épreuves (pas filtré par étudiant).
                        var sessRows pgx.Rows
                        var err2 error
                        if params.EtudiantID != "" {
                                // BUGFIX (SESS-SPECIALE-1) : LEFT JOIN User pour peupler etudiant
                                // (nom + email) + sélectionner etudiantId. Sans cela, le formulaire
                                // Session spéciale étape 2 ne pouvait ni afficher le nom ni sélectionner.
                                sessRows, err2 = tx.Query(ctx, `
                                        SELECT sp."id", sp."epreuveId", sp."etudiantId", sp."statut", sp."dateDebut", sp."dateFin", sp."score",
                                        u."id", u."name", u."email",
                                        r."id", r."scoreFinal", r."totalPossible", r."detailParQuestion"
                                        FROM "SessionPassation" sp
                                        LEFT JOIN "User" u ON u."id" = sp."etudiantId"
                                        LEFT JOIN "Resultat" r ON r."sessionId" = sp."id"
                                        WHERE sp."etudiantId" = $1 AND sp."epreuveId" = ANY($2)
                                        ORDER BY sp."createdAt" DESC`,
                                        params.EtudiantID, epreuveIDs)
                        } else {
                                sessRows, err2 = tx.Query(ctx, `
                                        SELECT sp."id", sp."epreuveId", sp."etudiantId", sp."statut", sp."dateDebut", sp."dateFin", sp."score",
                                        u."id", u."name", u."email",
                                        r."id", r."scoreFinal", r."totalPossible", r."detailParQuestion"
                                        FROM "SessionPassation" sp
                                        LEFT JOIN "User" u ON u."id" = sp."etudiantId"
                                        LEFT JOIN "Resultat" r ON r."sessionId" = sp."id"
                                        WHERE sp."epreuveId" = ANY($1)
                                        ORDER BY sp."createdAt" DESC`,
                                        epreuveIDs)
                        }
                        if err2 != nil {
                                return fmt.Errorf("query epreuve sessions: %w", err2)
                        }
                        defer sessRows.Close()

                        sessionsByEpreuve := make(map[string][]domain.SessionRef)
                        for sessRows.Next() {
                                sr := domain.SessionRef{}
                                var epreuveID string
                                var etuID, etuName, etuEmail *string
                                var rID *string
                                var rScoreFinal, rTotalPossible *float64
                                var rDetail *string
                                if err := sessRows.Scan(&sr.ID, &epreuveID, &sr.EtudiantID, &sr.Statut, &sr.DateDebut, &sr.DateFin, &sr.Score, &etuID, &etuName, &etuEmail, &rID, &rScoreFinal, &rTotalPossible, &rDetail); err != nil {
                                        fmt.Printf("DEBUG scan session ref error: %v\n", err)
                                        return fmt.Errorf("scan session ref: %w", err)
                                }
                                if etuID != nil && etuName != nil {
                                        sr.Etudiant = &domain.UserRef{ID: *etuID, Name: *etuName, Email: derefStr(etuEmail)}
                                }
                                // B1-MES-EPREUVES : hydrater Resultat si présent (LEFT JOIN)
                                if rID != nil && rScoreFinal != nil {
                                        sr.Resultat = &domain.ResultatRef{
                                                ID:                *rID,
                                                ScoreFinal:        *rScoreFinal,
                                                TotalPossible:     derefFloat(rTotalPossible),
                                                DetailParQuestion: derefStr(rDetail),
                                        }
                                }
                                sessionsByEpreuve[epreuveID] = append(sessionsByEpreuve[epreuveID], sr)
                        }
                        for _, e := range result {
                                if sessions, ok := sessionsByEpreuve[e.ID]; ok {
                                        e.Sessions = sessions
                                }
                        }
                }

                // BUGFIX (EPREUVES-SESSIONS-2): peupler QuestionCount et TotalPoints
                // à partir du contenu JSON pour que le frontend affiche le vrai
                // nombre de questions et le barème total (au lieu de "Q" et "pts").
                for _, e := range result {
                        if e.Contenu != nil {
                                var contenu struct {
                                        Questions   []struct {
                                                Bareme float64 `json:"bareme"`
                                        } `json:"questions"`
                                        BaremeTotal float64 `json:"baremeTotal"`
                                }
                                if err := json.Unmarshal(e.Contenu, &contenu); err == nil {
                                        qc := len(contenu.Questions)
                                        e.QuestionCount = &qc
                                        tp := contenu.BaremeTotal
                                        if tp == 0 && len(contenu.Questions) > 0 {
                                                for _, q := range contenu.Questions {
                                                        tp += q.Bareme
                                                }
                                        }
                                        e.TotalPoints = &tp
                                }
                        }
                }
                return nil
        })
        if err != nil {
                return nil, 0, err
        }
        // EV7 : si pagination active, total a été calculé par le count séparé.
        // Sinon, total = len(result).
        if params.Page > 0 && total == 0 {
                total = len(result)
        } else if params.Page == 0 {
                total = len(result)
        }
        return result, total, nil
}

// Create crée une épreuve (bypass RLS). Statut forcé à BROUILLON.
func (r *EpreuveRepository) Create(ctx context.Context, input domain.CreateEpreuveInput) (*domain.Epreuve, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // Parser les dates
        dateDebut, err := time.Parse(time.RFC3339, input.DateDebut)
        if err != nil {
                return nil, &domain.ValidationError{Field: "dateDebut", Message: "format ISO invalide"}
        }
        dateFin, err := time.Parse(time.RFC3339, input.DateFin)
        if err != nil {
                return nil, &domain.ValidationError{Field: "dateFin", Message: "format ISO invalide"}
        }

        id := uuid.NewString()
        noteTotal := 20.0
        if input.NoteTotal != nil && *input.NoteTotal > 0 {
                noteTotal = *input.NoteTotal
        }
        melangeQ := true
        if input.MelangeQuestions != nil {
                melangeQ = *input.MelangeQuestions
        }
        melangeP := true
        if input.MelangePropositions != nil {
                melangeP = *input.MelangePropositions
        }
        blocageR := false
        if input.BlocageRetour != nil {
                blocageR = *input.BlocageRetour
        }
        genMode := input.GenerationMode
        if !domain.ValidModesGeneration[genMode] {
                genMode = domain.ModeManuelle
        }
        sessExam := input.SessionExamen
        if !domain.ValidSessionsExamen[sessExam] {
                sessExam = domain.SessionNormale
        }

        var contenu, groupesCibles any
        // BUGFIX (DUPLICATE-UE-1) : utiliser string (pas []byte) pour les valeurs
        // JSON envoyées aux colonnes jsonb/text. En Simple Query Protocol (pooler
        // Neon PgBouncer — cf. db.go DefaultQueryExecModeSimpleProtocol), pgx ne
        // connaît pas le type de colonne cible et encode []byte avec le codec bytea
        // (hex: \x7b22...) → invalide pour jsonb → HTTP 500. string utilise le codec
        // text qui envoie le JSON brut que Postgres accepte pour jsonb.
        if len(input.Contenu) > 0 && string(input.Contenu) != "null" {
                contenu = string(input.Contenu)
        }
        if len(input.GroupesCibles) > 0 && string(input.GroupesCibles) != "null" {
                groupesCibles = string(input.GroupesCibles)
        }

        row := tx.QueryRow(ctx, `
                INSERT INTO "Epreuve" ("id", "enseignantId", "titre", "description", "duree", "dateDebut", "dateFin",
                        "melangeQuestions", "melangePropositions", "blocageRetour", "statut", "groupesCibles", "contenu",
                        "filiereId", "uniteEnseignementId", "niveau", "sessionExamen", "anneeAcademiqueId",
                        "createdAt", "updatedAt", "deletedAt", "proctoringActif", "verificationIdentite",
                        "generationMode", "isTemplate", "noteTotal", "clotureeAt", "clotureeAutomatiquement",
                        "raisonCloture", "clotureePar", "delaiGrace", "etudiantsAutorises", "epreuveOrigineId")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'BROUILLON', $11, $12,
                        $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, false, false,
                        $18, false, $19, NULL, false, NULL, NULL, 3, NULL, NULL)
                RETURNING `+columnsEpreuve,
                id, input.EnseignantID, input.Titre, nullableStrPtr(input.Description), input.Duree, dateDebut, dateFin,
                melangeQ, melangeP, blocageR, groupesCibles, contenu,
                nullableStrPtr(input.FiliereID), nullableStrPtr(input.UniteEnseignementID), nullableStrPtr(input.Niveau),
                sessExam, nullableStrPtr(input.AnneeAcademiqueID),
                genMode, noteTotal)

        e, err := scanEpreuve(row)
        if err != nil {
                return nil, fmt.Errorf("create epreuve: %w", err)
        }

        // Créer les liaisons EpreuveQuestion (format legacy) si fournies
        if len(input.Questions) > 0 {
                for i, eq := range input.Questions {
                        bareme := eq.Bareme
                        if bareme == 0 {
                                bareme = 1.0
                        }
                        _, err := tx.Exec(ctx, `
                                INSERT INTO "EpreuveQuestion" ("id", "epreuveId", "questionId", "bareme", "ordre")
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT DO NOTHING
                        `, uuid.NewString(), id, eq.QuestionID, bareme, i)
                        if err != nil {
                                return nil, fmt.Errorf("create epreuve question: %w", err)
                        }
                }
        }

        // P1-QUESTIONS-IA : si GenerationMode == IA_ASSISTEE et contenu contient
        // un tableau questions[], parser chaque question IA et créer les rows
        // Question + EpreuveQuestion correspondants dans la même transaction.
        // Sans cela, les questions IA sont stockées dans contenu JSONB mais
        // jamais décomposées en rows relationnels → GET /{id}/questions
        // retourne [] → passation/correction/auto-grading cassés.
        if genMode == domain.ModeIAAssistee && len(input.Contenu) > 0 && string(input.Contenu) != "null" {
                var contenuParsed struct {
                        Questions []struct {
                                ID              string          `json:"id"`
                                Type            string          `json:"type"`
                                Enonce          string          `json:"enonce"`
                                Propositions    json.RawMessage `json:"propositions"`
                                ReponseCorrecte json.RawMessage `json:"reponseCorrecte"`
                                Explication     string          `json:"explication"`
                                Difficulte      string          `json:"difficulte"`
                                Bareme          float64         `json:"bareme"`
                        } `json:"questions"`
                }
                if err := json.Unmarshal(input.Contenu, &contenuParsed); err == nil && len(contenuParsed.Questions) > 0 {
                        for i, q := range contenuParsed.Questions {
                                qID := uuid.NewString()
                                qType := q.Type
                                if !domain.ValidTypesQuestion[domain.TypeQuestion(qType)] {
                                        qType = "QRC"
                                }
                                qDiff := q.Difficulte
                                if !domain.ValidDifficultes[domain.Difficulte(qDiff)] {
                                        qDiff = "MOYEN"
                                }
                                bareme := q.Bareme
                                if bareme == 0 {
                                        bareme = 1.0
                                }

                                // INSERT Question
                                _, err := tx.Exec(ctx, `
                                        INSERT INTO "Question" ("id", "documentId", "auteurId", "type", "enonce",
                                                "propositions", "reponseCorrecte", "explication", "difficulte",
                                                "themes", "tags", "scoreQualite", "validee", "langue",
                                                "createdAt", "updatedAt")
                                        VALUES ($1, NULL, $2, $3::"TypeQuestion", $4,
                                                $5, $6, $7, $8::"Difficulte",
                                                NULL, NULL, NULL, true, 'fr',
                                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                                `, qID, input.EnseignantID, qType, q.Enonce,
                                        string(q.Propositions), string(q.ReponseCorrecte),
                                        strToNullPtr(q.Explication), qDiff)
                                if err != nil {
                                        return nil, fmt.Errorf("create IA question %d: %w", i, err)
                                }

                                // INSERT EpreuveQuestion
                                _, err = tx.Exec(ctx, `
                                        INSERT INTO "EpreuveQuestion" ("id", "epreuveId", "questionId", "bareme", "ordre")
                                        VALUES ($1, $2, $3, $4, $5)
                                        ON CONFLICT DO NOTHING
                                `, uuid.NewString(), id, qID, bareme, i)
                                if err != nil {
                                        return nil, fmt.Errorf("create epreuve question IA %d: %w", i, err)
                                }
                        }
                }
        }

        // Créer les liaisons EpreuveDocument si fournies
        if len(input.DocumentIDs) > 0 {
                for _, docID := range input.DocumentIDs {
                        _, err := tx.Exec(ctx, `
                                INSERT INTO "EpreuveDocument" ("id", "epreuveId", "documentId")
                                VALUES ($1, $2, $3)
                                ON CONFLICT DO NOTHING
                        `, uuid.NewString(), id, docID)
                        if err != nil {
                                return nil, fmt.Errorf("create epreuve document: %w", err)
                        }
                }
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return e, nil
}

// Update met à jour une épreuve (partial update ou action state machine).
func (r *EpreuveRepository) Update(ctx context.Context, id string, input domain.UpdateEpreuveInput) (*domain.Epreuve, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // Gérer les actions (state machine) — P1-E6 : validation de transition
        if input.Action != nil {
                action := *input.Action
                var newStatut domain.StatutEpreuve
                var expectedStatut domain.StatutEpreuve // statut courant requis
                var message string
                now := time.Now()

                switch action {
                case "publier":
                        newStatut = domain.StatutPlanifiee
                        expectedStatut = domain.StatutBrouillon
                        message = "Épreuve publiée"
                case "lancer":
                        newStatut = domain.StatutEnCours
                        expectedStatut = domain.StatutPlanifiee
                        message = "Épreuve lancée"
                case "terminer":
                        newStatut = domain.StatutTerminee
                        expectedStatut = domain.StatutEnCours
                        message = "Épreuve terminée"
                case "cloturer":
                        newStatut = domain.StatutCloturee
                        expectedStatut = domain.StatutTerminee
                        message = "Épreuve clôturée"
                        clotureePar := ""
                        if input.UserID != nil {
                                clotureePar = *input.UserID
                        }
                        // P1-E6 : WHERE statut = expectedStatut (TERMINEE)
                        tag, err := tx.Exec(ctx, `
                                UPDATE "Epreuve" SET "statut" = $2, "clotureeAt" = $3, "clotureeAutomatiquement" = false,
                                        "clotureePar" = $4, "updatedAt" = CURRENT_TIMESTAMP
                                WHERE "id" = $1 AND "deletedAt" IS NULL AND "statut" = $5
                        `, id, newStatut, now, nullableStr(&clotureePar), expectedStatut)
                        if err != nil {
                                return nil, fmt.Errorf("cloturer epreuve: %w", err)
                        }
                        if tag.RowsAffected() == 0 {
                                return nil, &domain.ValidationError{Field: "action", Message: "transition invalide : l'épreuve doit être TERMINEE pour être clôturée"}
                        }
                        if err := tx.Commit(ctx); err != nil {
                                return nil, fmt.Errorf("commit: %w", err)
                        }
                        return r.FindByID(ctx, id)
                default:
                        return nil, &domain.ValidationError{Field: "action", Message: "action invalide (publier, lancer, terminer, cloturer)"}
                }

                // P1-E6 : WHERE statut = expectedStatut
                tag, err := tx.Exec(ctx, `
                        UPDATE "Epreuve" SET "statut" = $2, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1 AND "deletedAt" IS NULL AND "statut" = $3
                `, id, newStatut, expectedStatut)
                if err != nil {
                        return nil, fmt.Errorf("update statut epreuve: %w", err)
                }
                if tag.RowsAffected() == 0 {
                        return nil, &domain.ValidationError{Field: "action", Message: fmt.Sprintf("transition invalide : l'épreuve doit être %s pour l'action %s", expectedStatut, action)}
                }
                _ = message
                if err := tx.Commit(ctx); err != nil {
                        return nil, fmt.Errorf("commit: %w", err)
                }
                return r.FindByID(ctx, id)
        }

        // General update
        var setClauses []string
        var args []any
        argIdx := 1

        addSet := func(col string, val any) {
                setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
                args = append(args, val)
                argIdx++
        }

        if input.Titre != nil {
                addSet("titre", *input.Titre)
        }
        if input.Description != nil {
                addSet("description", nullableStrPtr(input.Description))
        }
        if input.Duree != nil {
                addSet("duree", *input.Duree)
        }
        if input.DateDebut != nil {
                d, err := time.Parse(time.RFC3339, *input.DateDebut)
                if err != nil {
                        return nil, &domain.ValidationError{Field: "dateDebut", Message: "format ISO invalide"}
                }
                addSet("dateDebut", d)
        }
        if input.DateFin != nil {
                d, err := time.Parse(time.RFC3339, *input.DateFin)
                if err != nil {
                        return nil, &domain.ValidationError{Field: "dateFin", Message: "format ISO invalide"}
                }
                addSet("dateFin", d)
        }
        if input.MelangeQuestions != nil {
                addSet("melangeQuestions", *input.MelangeQuestions)
        }
        if input.MelangePropositions != nil {
                addSet("melangePropositions", *input.MelangePropositions)
        }
        if input.BlocageRetour != nil {
                addSet("blocageRetour", *input.BlocageRetour)
        }
        if input.GroupesCibles != nil {
                addSet("groupesCibles", jsonRawOrNull(input.GroupesCibles))
        }
        if input.Statut != nil {
                addSet("statut", *input.Statut)
        }
        if input.Niveau != nil {
                addSet("niveau", nullableStrPtr(input.Niveau))
        }
        if input.SessionExamen != nil {
                addSet("sessionExamen", *input.SessionExamen)
        }
        if input.AnneeAcademiqueID != nil {
                addSet("anneeAcademiqueId", nullableStrPtr(input.AnneeAcademiqueID))
        }
        if input.UniteEnseignementID != nil {
                addSet("uniteEnseignementId", nullableStrPtr(input.UniteEnseignementID))
        }
        if input.FiliereID != nil {
                addSet("filiereId", nullableStrPtr(input.FiliereID))
        }
        if input.EtudiantsAutorises != nil {
                addSet("etudiantsAutorises", jsonRawOrNull(input.EtudiantsAutorises))
        }
        if input.EpreuveOrigineID != nil {
                addSet("epreuveOrigineId", nullableStrPtr(input.EpreuveOrigineID))
        }

        if len(setClauses) == 0 {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Epreuve" WHERE "id" = $1 AND "deletedAt" IS NULL`, columnsEpreuve), id)
                e, err := scanEpreuve(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return nil, &domain.NotFoundError{Entity: "Epreuve", ID: id}
                        }
                        return nil, err
                }
                if err := tx.Commit(ctx); err != nil {
                        return nil, err
                }
                return e, nil
        }

        setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
        args = append(args, id)
        updateSQL := fmt.Sprintf(`UPDATE "Epreuve" SET %s WHERE "id" = $%d AND "deletedAt" IS NULL RETURNING %s`,
                strings.Join(setClauses, ", "), argIdx, columnsEpreuve)

        row := tx.QueryRow(ctx, updateSQL, args...)
        e, err := scanEpreuve(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, &domain.NotFoundError{Entity: "Epreuve", ID: id}
                }
                return nil, fmt.Errorf("update epreuve: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return e, nil
}

// SoftDelete désactive une épreuve (deletedAt = now). Refuse si EN_COURS.
func (r *EpreuveRepository) SoftDelete(ctx context.Context, id string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // Vérifier statut (pas EN_COURS)
        var statut string
        err = tx.QueryRow(ctx, `SELECT "statut" FROM "Epreuve" WHERE "id" = $1 AND "deletedAt" IS NULL`, id).Scan(&statut)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return &domain.NotFoundError{Entity: "Epreuve", ID: id}
                }
                return fmt.Errorf("check statut: %w", err)
        }
        if statut == string(domain.StatutEnCours) {
                return &domain.ValidationError{Field: "statut", Message: "impossible de supprimer une épreuve en cours"}
        }

        _, err = tx.Exec(ctx, `UPDATE "Epreuve" SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, id)
        if err != nil {
                return fmt.Errorf("soft delete epreuve: %w", err)
        }

        return tx.Commit(ctx)
}

// ListQuestions liste les EpreuveQuestion d'une épreuve (RLS actif).
func (r *EpreuveRepository) ListQuestions(ctx context.Context, epreuveID string) ([]*domain.EpreuveQuestion, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.EpreuveQuestion
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // B7-MES-EPREUVES : LEFT JOIN Question pour peupler le champ QuestionRef.
                // Sans cela, le frontend passation-page ne reçoit que la bare liaison.
                rows, err := tx.Query(ctx, `
                        SELECT eq."id", eq."epreuveId", eq."questionId", eq."bareme", eq."ordre",
                               q."id", q."type"::text, q."enonce", q."propositions", q."difficulte"::text, q."themes", q."explication"
                        FROM "EpreuveQuestion" eq
                        LEFT JOIN "Question" q ON q."id" = eq."questionId" AND q."deletedAt" IS NULL
                        WHERE eq."epreuveId" = $1 ORDER BY eq."ordre" ASC
                `, epreuveID)
                if err != nil {
                        return fmt.Errorf("query epreuve questions: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        eq := &domain.EpreuveQuestion{}
                        var qID, qType, qEnonce *string
                        var qProp, qThemes []byte
                        var qDiff *string
                        var qExp *string
                        if err := rows.Scan(&eq.ID, &eq.EpreuveID, &eq.QuestionID, &eq.Bareme, &eq.Ordre, &qID, &qType, &qEnonce, &qProp, &qDiff, &qThemes, &qExp); err != nil {
                                return fmt.Errorf("scan epreuve question: %w", err)
                        }
                        // B7 : hydrater Question si le JOIN a matché
                        if qID != nil && qEnonce != nil {
                                eq.Question = &domain.QuestionRef{
                                        ID:           *qID,
                                        Type:         domain.TypeQuestion(derefStr(qType)),
                                        Enonce:       *qEnonce,
                                        Propositions: sanitizeEpreuveRawMessage(qProp),
                                        Difficulte:   domain.Difficulte(derefStr(qDiff)),
                                        Themes:       sanitizeEpreuveRawMessage(qThemes),
                                        Explication:  qExp,
                                }
                        }
                        result = append(result, eq)
                }
                if result == nil {
                        result = []*domain.EpreuveQuestion{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// ListQuestionsForGrading retourne les questions avec la réponse correcte
// (usage backend uniquement — JAMAIS retourné au frontend étudiant).
// B6-MES-EPREUVES : utilisé par Submit pour l'auto-grading QCU/QCM.
func (r *EpreuveRepository) ListQuestionsForGrading(ctx context.Context, epreuveID string) ([]*domain.QuestionForGrading, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.QuestionForGrading
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, `
                        SELECT eq."questionId", q."type"::text, eq."bareme", eq."ordre", q."reponseCorrecte"::text
                        FROM "EpreuveQuestion" eq
                        JOIN "Question" q ON q."id" = eq."questionId" AND q."deletedAt" IS NULL
                        WHERE eq."epreuveId" = $1 ORDER BY eq."ordre" ASC
                `, epreuveID)
                if err != nil {
                        return fmt.Errorf("query epreuve questions for grading: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        qfg := &domain.QuestionForGrading{}
                        var qType, qCorrect *string
                        if err := rows.Scan(&qfg.QuestionID, &qType, &qfg.Bareme, &qfg.Ordre, &qCorrect); err != nil {
                                return fmt.Errorf("scan question for grading: %w", err)
                        }
                        qfg.Type = domain.TypeQuestion(derefStr(qType))
                        if qCorrect != nil {
                                qfg.ReponseCorrecte = *qCorrect
                        }
                        result = append(result, qfg)
                }
                if result == nil {
                        result = []*domain.QuestionForGrading{}
                }
                return nil
        })
        return result, err
}

// nullableStr convertit une string en *string (NULL si vide).
// strToNullPtr convertit un string en *string (pour nullableStr).
// strToNullPtr convertit un string en *string (nil si vide).
// P2-E12 : retourne nil pour les strings vides (au lieu de &"").
func strToNullPtr(s string) *string {
        if s == "" {
                return nil
        }
        return &s
}

func nullableStr(s *string) any {
        if s == nil || *s == "" {
                return nil
        }
        return *s
}
