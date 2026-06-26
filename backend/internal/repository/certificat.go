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

// FindByCode récupère un certificat par code de vérification (bypass RLS — public verify).
func (r *CertificatRepository) FindByCode(ctx context.Context, code string) (*domain.Certificat, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Certificat" WHERE "codeVerification" = $1`, columnsCertificat), code)
	c, err := scanCertificat(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "Certificat", ID: code}
		}
		return nil, fmt.Errorf("query certificat by code: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
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

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	if c.CodeVerification == "" {
		c.CodeVerification = generateCertCode()
	}
	if c.Statut == "" {
		c.Statut = domain.StatutCertificatActif
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

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

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

// ListSessions liste les sessions à corriger pour un enseignant (bypass RLS pour tenant check manuel).
func (r *CorrectionRepository) ListSessions(ctx context.Context, params domain.CorrectionListParams) ([]*domain.CorrectionSession, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
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

	query := fmt.Sprintf(`
		SELECT s."id", s."etudiantId", u."name", u."email",
		       s."epreuveId", e."titre", s."statut", s."dateFin", s."score"
		FROM "SessionPassation" s
		JOIN "Epreuve" e ON e."id" = s."epreuveId"
		JOIN "User" u ON u."id" = s."etudiantId"
		%s
		ORDER BY s."dateFin" ASC
	`, whereClause)

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query correction sessions: %w", err)
	}
	defer rows.Close()

	var result []*domain.CorrectionSession
	for rows.Next() {
		cs := &domain.CorrectionSession{}
		if err := rows.Scan(&cs.SessionID, &cs.EtudiantID, &cs.EtudiantNom, &cs.EtudiantEmail,
			&cs.EpreuveID, &cs.EpreuveTitre, &cs.Statut, &cs.DateFin, &cs.Score); err != nil {
			return nil, fmt.Errorf("scan correction session: %w", err)
		}
		result = append(result, cs)
	}
	if result == nil {
		result = []*domain.CorrectionSession{}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return result, nil
}

// UpdateReponse met à jour le score et commentaire d'une réponse (bypass RLS).
func (r *CorrectionRepository) UpdateReponse(ctx context.Context, reponseID string, input domain.UpdateReponseInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
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
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
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

	// Marquer le résultat comme retourné
	_, _ = tx.Exec(ctx, `UPDATE "Resultat" SET "dateRetour" = CURRENT_TIMESTAMP WHERE "sessionId" = $1`, sessionID)

	return tx.Commit(ctx)
}

// RetournerBatch retourne plusieurs sessions en batch (bypass RLS).
func (r *CorrectionRepository) RetournerBatch(ctx context.Context, sessionIDs []string) (int, error) {
	if len(sessionIDs) == 0 {
		return 0, nil
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return 0, fmt.Errorf("disable rls: %w", err)
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

	// Marquer les résultats comme retournés
	_, _ = tx.Exec(ctx, fmt.Sprintf(`UPDATE "Resultat" SET "dateRetour" = CURRENT_TIMESTAMP WHERE "sessionId" IN (%s)`, strings.Join(placeholders, ",")), args...)

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
