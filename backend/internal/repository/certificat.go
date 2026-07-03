// Package repository — implémentation CertificatRepository + CorrectionRepository.
package repository

import (
        "context"
        "fmt"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// ============================================================
// CERTIFICAT REPOSITORY
// ============================================================

// CertificatRepository implémente domain.CertificatRepository.
type CertificatRepository struct {
        pool *pgxpool.Pool
}

// NewCertificatRepository crée un nouveau CertificatRepository.
func NewCertificatRepository(pool *pgxpool.Pool) *CertificatRepository {
        return &CertificatRepository{pool: pool}
}

const columnsCertificat = `"id", "codeVerification", "etudiantId", "validationUEId", "type",
        "intitule", "mention", "noteFinale", "etablissementNom", "etablissementLogo",
        "etablissementVille", "etablissementPays", "filiereNom", "filiereCode",
        "ueCode", "ueNom", "creditsECTS", "etudiantNom", "etudiantMatricule",
        "etudiantNiveau", "sessionType", "anneeAcademique", "dateEmission",
        "emetteParId", "pdfUrl", "statut", "dateRevocation", "raisonRevocation",
        "createdAt", "updatedAt"`

func scanCertificat(s scanner) (*domain.Certificat, error) {
        c := &domain.Certificat{}
        err := s.Scan(
                &c.ID, &c.CodeVerification, &c.EtudiantID, &c.ValidationUEID, &c.Type,
                &c.Intitule, &c.Mention, &c.NoteFinale, &c.EtablissementNom, &c.EtablissementLogo,
                &c.EtablissementVille, &c.EtablissementPays, &c.FiliereNom, &c.FiliereCode,
                &c.UECode, &c.UENom, &c.CreditsECTS, &c.EtudiantNom, &c.EtudiantMatricule,
                &c.EtudiantNiveau, &c.SessionType, &c.AnneeAcademique, &c.DateEmission,
                &c.EmetteParID, &c.PDFUrl, &c.Statut, &c.DateRevocation, &c.RaisonRevocation,
                &c.CreatedAt, &c.UpdatedAt,
        )
        if err != nil {
                return nil, err
        }
        return c, nil
}

// FindByID récupère un certificat par ID (RLS actif).
func (r *CertificatRepository) FindByID(ctx context.Context, id string) (*domain.Certificat, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var c *domain.Certificat
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Certificat" WHERE "id" = $1`, columnsCertificat), id)
                cert, err := scanCertificat(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Certificat", ID: id}
                        }
                        return fmt.Errorf("query certificat: %w", err)
                }
                c = cert
                return nil
        })
        if err != nil {
                return nil, err
        }
        return c, nil
}

// FindByCode récupère un certificat par code de vérification (endpoint public
// de vérification — pas de JWT, pas de claims utilisateur).
//
// BUGFIX (AUDIT-RLS-REPOS-001) : l'ancien code ouvrait une tx SANS SetClaimsTx
// → claims NULL → la policy Certificat_select (qui dépend de current_user_id()/
// is_etudiant()/is_enseignant()/is_responsable()/is_admin()) voyait NULL →
// 0 rows → l'endpoint public /api/certificats/verify/{code} retournait 404
// pour des codes existants (confirmé en production : 14 certificats en DB,
// tous introuvables via l'API).
//
// Fix : utiliser db.WithTx avec db.SystemClaims() (is_system()=true). La
// migration 000050_certificat_select_is_system ajoute `OR is_system()` à la
// policy Certificat_select (cohérent avec Document/Epreuve/Question/
// SessionPassation qui ont tous une policy *_all_system).
func (r *CertificatRepository) FindByCode(ctx context.Context, code string) (*domain.Certificat, error) {
        var c *domain.Certificat
        err := db.WithTx(ctx, r.pool, db.SystemClaims(), func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Certificat" WHERE "codeVerification" = $1`, columnsCertificat), code)
                var err error
                c, err = scanCertificat(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Certificat", ID: code}
                        }
                        return fmt.Errorf("query certificat by code: %w", err)
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return c, nil
}

// List liste les certificats (RLS actif).
func (r *CertificatRepository) List(ctx context.Context, params domain.CertificatListParams) ([]*domain.Certificat, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.Certificat
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if params.EtudiantID != "" {
                        where = append(where, fmt.Sprintf(`"etudiantId" = $%d`, argIdx))
                        args = append(args, params.EtudiantID)
                        argIdx++
                }
                if params.Type != "" {
                        where = append(where, fmt.Sprintf(`"type" = $%d`, argIdx))
                        args = append(args, params.Type)
                        argIdx++
                }
                if params.Statut != "" {
                        where = append(where, fmt.Sprintf(`"statut" = $%d`, argIdx))
                        args = append(args, params.Statut)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                query := fmt.Sprintf(`SELECT %s FROM "Certificat" %s ORDER BY "dateEmission" DESC`, columnsCertificat, whereClause)
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query certificats: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        c, err := scanCertificat(rows)
                        if err != nil {
                                return fmt.Errorf("scan certificat: %w", err)
                        }
                        result = append(result, c)
                }
                if result == nil {
                        result = []*domain.Certificat{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// Create crée un certificat (bypass RLS — émis par enseignant/responsable).
func (r *CertificatRepository) Create(ctx context.Context, c *domain.Certificat) (*domain.Certificat, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if c.ID == "" {
                c.ID = uuid.NewString()
        }
        if c.CodeVerification == "" {
                c.CodeVerification = generateCertCode()
        }
        if c.Statut == "" {
                c.Statut = domain.StatutCertificatEmis
        }
        if c.DateEmission.IsZero() {
                c.DateEmission = time.Now()
        }

        row := tx.QueryRow(ctx, `
                INSERT INTO "Certificat" ("id", "codeVerification", "etudiantId", "validationUEId", "type",
                        "intitule", "mention", "noteFinale", "etablissementNom", "etablissementLogo",
                        "etablissementVille", "etablissementPays", "filiereNom", "filiereCode",
                        "ueCode", "ueNom", "creditsECTS", "etudiantNom", "etudiantMatricule",
                        "etudiantNiveau", "sessionType", "anneeAcademique", "dateEmission",
                        "emetteParId", "pdfUrl", "statut", "dateRevocation", "raisonRevocation",
                        "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING `+columnsCertificat,
                c.ID, c.CodeVerification, c.EtudiantID, c.ValidationUEID, c.Type,
                c.Intitule, nullableStrPtr(c.Mention), c.NoteFinale, c.EtablissementNom, nullableStrPtr(c.EtablissementLogo),
                nullableStrPtr(c.EtablissementVille), nullableStrPtr(c.EtablissementPays), c.FiliereNom, nullableStrPtr(c.FiliereCode),
                c.UECode, c.UENom, nullableIntPtr(c.CreditsECTS), c.EtudiantNom, nullableStrPtr(c.EtudiantMatricule),
                nullableStrPtr(c.EtudiantNiveau), c.SessionType, nullableStrPtr(c.AnneeAcademique), c.DateEmission,
                c.EmetteParID, nullableStrPtr(c.PDFUrl), c.Statut, nullableTimePtr(c.DateRevocation), nullableStrPtr(c.RaisonRevocation))

        cert, err := scanCertificat(row)
        if err != nil {
                return nil, fmt.Errorf("create certificat: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return cert, nil
}

// Revoke révoque un certificat.
func (r *CertificatRepository) Revoke(ctx context.Context, id string, raison string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        tag, err := tx.Exec(ctx, `
                UPDATE "Certificat" SET "statut" = 'REVOQUE', "dateRevocation" = CURRENT_TIMESTAMP,
                        "raisonRevocation" = $2, "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $1
        `, id, raison)
        if err != nil {
                return fmt.Errorf("revoke certificat: %w", err)
        }
        if tag.RowsAffected() == 0 {
                return &domain.NotFoundError{Entity: "Certificat", ID: id}
        }

        return tx.Commit(ctx)
}

// generateCertCode génère un code de vérification format SECT-XXXX-XXXX.
func generateCertCode() string {
        return "SECT-" + strings.ToUpper(uuid.NewString()[:4]) + "-" + strings.ToUpper(uuid.NewString()[:4])
}

// ============================================================
// CORRECTION REPOSITORY
// ============================================================

// CorrectionRepository implémente domain.CorrectionRepository.
type CorrectionRepository struct {
        pool *pgxpool.Pool
}

// NewCorrectionRepository crée un nouveau CorrectionRepository.
func NewCorrectionRepository(pool *pgxpool.Pool) *CorrectionRepository {
        return &CorrectionRepository{pool: pool}
}

// ListSessions liste les sessions à corriger pour un enseignant.
// P1-CORRECTION : enrichi avec Reponses, Resultat, Epreuve.questions, et champs calculés
// (alertes, needsCorrectionCount, allCorrected, autoGradedScore, autoGradedTotal).
func (r *CorrectionRepository) ListSessions(ctx context.Context, params domain.CorrectionListParams) ([]*domain.CorrectionSession, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // CORRECTION-RLS-FIX : poser les claims RLS pour activer SessionPassation_select,
        // Epreuve_select, User_select (l'enseignant voit ses épreuves + les étudiants
        // qui y ont participé). Sans cela, en production (Render sans BYPASSRLS), la
        // query retourne 0 session → /api/correction vide → enseignant ne peut corriger.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return nil, fmt.Errorf("set claims: %w", err)
        }

        var where []string
        var args []any
        argIdx := 1

        where = append(where, fmt.Sprintf(`e."enseignantId" = $%d`, argIdx))
        args = append(args, params.EnseignantID)
        argIdx++

        where = append(where, `s."statut" IN ('SOUMISE', 'CORRIGEE', 'RETOURNEE')`)

        if params.EpreuveID != "" {
                where = append(where, fmt.Sprintf(`s."epreuveId" = $%d`, argIdx))
                args = append(args, params.EpreuveID)
                argIdx++
        }

        whereClause := "WHERE " + strings.Join(where, " AND ")

        // Query 1 : sessions + alertes + subqueries calculés + LEFT JOIN Resultat
        query := fmt.Sprintf(`
                SELECT s."id", s."etudiantId", u."name", u."email",
                       s."epreuveId", e."titre", s."statut", s."dateFin", s."score",
                       s."alertes",
                       COALESCE((SELECT count(*) FROM "Reponse" r WHERE r."sessionId" = s."id" AND r."score" IS NULL), 0) as needs_correction,
                       CASE WHEN (SELECT count(*) FROM "Reponse" r WHERE r."sessionId" = s."id" AND r."score" IS NULL) = 0 THEN true ELSE false END as all_corrected,
                       COALESCE((SELECT sum(r."score") FROM "Reponse" r JOIN "Question" q ON q."id" = r."questionId" WHERE r."sessionId" = s."id" AND q."type" IN ('QCU','QCM')), 0) as auto_score,
                       COALESCE((SELECT sum(eq."bareme") FROM "EpreuveQuestion" eq JOIN "Reponse" rep ON rep."questionId" = eq."questionId" AND eq."epreuveId" = s."epreuveId" JOIN "Question" q ON q."id" = rep."questionId" WHERE rep."sessionId" = s."id" AND q."type" IN ('QCU','QCM')), 0) as auto_total,
                       res."id", res."scoreFinal", res."totalPossible", res."dateCorrection"
                FROM "SessionPassation" s
                JOIN "Epreuve" e ON e."id" = s."epreuveId"
                JOIN "User" u ON u."id" = s."etudiantId"
                LEFT JOIN "Resultat" res ON res."sessionId" = s."id"
                %s
                ORDER BY s."dateFin" ASC
        `, whereClause)

        rows, err := tx.Query(ctx, query, args...)
        if err != nil {
                return nil, fmt.Errorf("query correction sessions: %w", err)
        }
        defer rows.Close()

        var result []*domain.CorrectionSession
        sessionIDs := make([]string, 0)
        epreuveIDs := make(map[string]bool)
        for rows.Next() {
                cs := &domain.CorrectionSession{}
                var rID *string
                var rScoreFinal, rTotalPossible *float64
                var rDateCorrection *time.Time
                if err := rows.Scan(&cs.SessionID, &cs.EtudiantID, &cs.EtudiantNom, &cs.EtudiantEmail,
                        &cs.EpreuveID, &cs.EpreuveTitre, &cs.Statut, &cs.DateFin, &cs.Score,
                        &cs.Alertes, &cs.NeedsCorrectionCount, &cs.AllCorrected, &cs.AutoGradedScore, &cs.AutoGradedTotal,
                        &rID, &rScoreFinal, &rTotalPossible, &rDateCorrection); err != nil {
                        return nil, fmt.Errorf("scan correction session: %w", err)
                }
                cs.ID = cs.SessionID
                cs.Etudiant = &domain.CorrectionEtudiant{
                        ID:    cs.EtudiantID,
                        Name:  cs.EtudiantNom,
                        Email: cs.EtudiantEmail,
                }
                if rID != nil && rScoreFinal != nil {
                        cs.Resultat = &domain.CorrectionResultat{
                                ID:             *rID,
                                ScoreFinal:     *rScoreFinal,
                                TotalPossible:  derefFloat(rTotalPossible),
                                DateCorrection: rDateCorrection,
                        }
                }
                cs.Reponses = []domain.CorrectionReponse{}
                result = append(result, cs)
                sessionIDs = append(sessionIDs, cs.SessionID)
                epreuveIDs[cs.EpreuveID] = true
        }
        if result == nil {
                result = []*domain.CorrectionSession{}
        }

        // Query 2 : batch Reponses pour toutes les sessions (avec JOIN Question + EpreuveQuestion)
        if len(sessionIDs) > 0 {
                reponseQuery := fmt.Sprintf(`
                        SELECT r."id", r."sessionId", r."questionId", r."contenu", r."score",
                               r."commentaire", r."noteIA", r."justificationIA",
                               eq."bareme", eq."ordre", q."type"::text, q."enonce"
                        FROM "Reponse" r
                        LEFT JOIN "EpreuveQuestion" eq ON eq."questionId" = r."questionId" AND eq."epreuveId" = ANY($1)
                        LEFT JOIN "Question" q ON q."id" = r."questionId"
                        WHERE r."sessionId" = ANY($2)
                        ORDER BY eq."ordre" ASC
                `)
                // Note : $1 = epreuveIDs, $2 = sessionIDs
                epreuveIDList := make([]string, 0, len(epreuveIDs))
                for id := range epreuveIDs {
                        epreuveIDList = append(epreuveIDList, id)
                }
                repRows, err := tx.Query(ctx, reponseQuery, epreuveIDList, sessionIDs)
                if err == nil {
                        defer repRows.Close()
                        reponsesBySession := make(map[string][]domain.CorrectionReponse)
                        for repRows.Next() {
                                var rep domain.CorrectionReponse
                                var sessionID string
                                var bareme *float64
                                var ordre *int
                                var qType, qEnonce *string
                                if err := repRows.Scan(&rep.ID, &sessionID, &rep.QuestionID, &rep.Contenu,
                                        &rep.Score, &rep.Commentaire, &rep.NoteIA, &rep.JustificationIA,
                                        &bareme, &ordre, &qType, &qEnonce); err == nil {
                                        if bareme != nil {
                                                rep.Bareme = *bareme
                                        }
                                        if ordre != nil {
                                                rep.Ordre = *ordre
                                        }
                                        rep.Type = derefStr(qType)
                                        rep.Enonce = derefStr(qEnonce)
                                        reponsesBySession[sessionID] = append(reponsesBySession[sessionID], rep)
                                }
                        }
                        for _, cs := range result {
                                if reps, ok := reponsesBySession[cs.SessionID]; ok {
                                        cs.Reponses = reps
                                }
                        }
                }
        }

        // Query 3 : batch EpreuveQuestion + Question pour les épreuves concernées
        if len(epreuveIDs) > 0 {
                epreuveIDList := make([]string, 0, len(epreuveIDs))
                for id := range epreuveIDs {
                        epreuveIDList = append(epreuveIDList, id)
                }
                eqQuery := `
                        SELECT eq."epreuveId", eq."id", eq."questionId", eq."bareme", eq."ordre",
                               q."type"::text, q."enonce"
                        FROM "EpreuveQuestion" eq
                        LEFT JOIN "Question" q ON q."id" = eq."questionId" AND q."deletedAt" IS NULL
                        WHERE eq."epreuveId" = ANY($1)
                        ORDER BY eq."epreuveId", eq."ordre" ASC
                `
                eqRows, err := tx.Query(ctx, eqQuery, epreuveIDList)
                if err == nil {
                        defer eqRows.Close()
                        questionsByEpreuve := make(map[string][]domain.CorrectionQuestion)
                        for eqRows.Next() {
                                var epreuveID string
                                var cq domain.CorrectionQuestion
                                var qType, qEnonce *string
                                if err := eqRows.Scan(&epreuveID, &cq.ID, &cq.QuestionID, &cq.Bareme, &cq.Ordre,
                                        &qType, &qEnonce); err == nil {
                                        cq.Type = derefStr(qType)
                                        cq.Enonce = derefStr(qEnonce)
                                        questionsByEpreuve[epreuveID] = append(questionsByEpreuve[epreuveID], cq)
                                }
                        }
                        for _, cs := range result {
                                if qs, ok := questionsByEpreuve[cs.EpreuveID]; ok {
                                        cs.Epreuve = &domain.CorrectionEpreuve{
                                                ID:        cs.EpreuveID,
                                                Titre:     cs.EpreuveTitre,
                                                Questions: qs,
                                        }
                                }
                        }
                }
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return result, nil
}

// UpdateReponse met à jour le score et commentaire d'une réponse (bypass RLS).
func (r *CorrectionRepository) UpdateReponse(ctx context.Context, reponseID string, input domain.UpdateReponseInput) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // CORRECTION-RLS-FIX : poser les claims RLS pour activer Reponse_modify_enseignant.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return fmt.Errorf("set claims: %w", err)
        }

        var setClauses []string
        var args []any
        argIdx := 1

        if input.Score != nil {
                setClauses = append(setClauses, fmt.Sprintf(`"score" = $%d`, argIdx))
                args = append(args, *input.Score)
                argIdx++
        }
        if input.Commentaire != nil {
                setClauses = append(setClauses, fmt.Sprintf(`"commentaire" = $%d`, argIdx))
                args = append(args, *input.Commentaire)
                argIdx++
        }

        if len(setClauses) == 0 {
                return nil // rien à updater
        }

        // P1d-CORRECTION : toujours updater updatedAt
        setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)

        args = append(args, reponseID)
        updateSQL := fmt.Sprintf(`UPDATE "Reponse" SET %s WHERE "id" = $%d`,
                strings.Join(setClauses, ", "), argIdx)

        tag, err := tx.Exec(ctx, updateSQL, args...)
        if err != nil {
                return fmt.Errorf("update reponse: %w", err)
        }
        if tag.RowsAffected() == 0 {
                return &domain.NotFoundError{Entity: "Reponse", ID: reponseID}
        }

        return tx.Commit(ctx)
}

// RetournerSession marque une session comme RETOURNEE (bypass RLS).
func (r *CorrectionRepository) RetournerSession(ctx context.Context, sessionID string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // CORRECTION-RLS-FIX : poser les claims RLS.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return fmt.Errorf("set claims: %w", err)
        }

        tag, err := tx.Exec(ctx, `
                UPDATE "SessionPassation" SET "statut" = 'RETOURNEE', "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $1 AND "statut" IN ('SOUMISE', 'CORRIGEE')
        `, sessionID)
        if err != nil {
                return fmt.Errorf("retourner session: %w", err)
        }
        if tag.RowsAffected() == 0 {
                return &domain.NotFoundError{Entity: "SessionPassation", ID: sessionID}
        }

        // P2-CORRECTION : marquer le résultat comme retourné (ne plus avaler l'erreur)
        if _, err := tx.Exec(ctx, `UPDATE "Resultat" SET "dateRetour" = CURRENT_TIMESTAMP WHERE "sessionId" = $1`, sessionID); err != nil {
                // Non-fatal : le Resultat peut ne pas exister encore (session non finalisée)
                // On log mais on ne bloque pas le retour.
                // TODO : logger l'erreur
        }

        return tx.Commit(ctx)
}

// RetournerBatch retourne plusieurs sessions en batch (bypass RLS).
func (r *CorrectionRepository) RetournerBatch(ctx context.Context, sessionIDs []string) (int, error) {
        if len(sessionIDs) == 0 {
                return 0, nil
        }

        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return 0, fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return 0, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // CORRECTION-RLS-FIX : poser les claims RLS.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return 0, fmt.Errorf("set claims: %w", err)
        }

        placeholders := make([]string, len(sessionIDs))
        args := make([]any, len(sessionIDs))
        for i, id := range sessionIDs {
                placeholders[i] = fmt.Sprintf("$%d", i+1)
                args[i] = id
        }

        query := fmt.Sprintf(`
                UPDATE "SessionPassation" SET "statut" = 'RETOURNEE', "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" IN (%s) AND "statut" IN ('SOUMISE', 'CORRIGEE')
        `, strings.Join(placeholders, ","))

        tag, err := tx.Exec(ctx, query, args...)
        if err != nil {
                return 0, fmt.Errorf("retourner batch: %w", err)
        }

        // P2-CORRECTION : marquer les résultats comme retournés (ne plus avaler l'erreur)
        if _, err := tx.Exec(ctx, fmt.Sprintf(`UPDATE "Resultat" SET "dateRetour" = CURRENT_TIMESTAMP WHERE "sessionId" IN (%s)`, strings.Join(placeholders, ",")), args...); err != nil {
                // Non-fatal : certains Resultats peuvent ne pas exister encore
                // TODO : logger l'erreur
        }

        if err := tx.Commit(ctx); err != nil {
                return 0, fmt.Errorf("commit: %w", err)
        }
        return int(tag.RowsAffected()), nil
}
