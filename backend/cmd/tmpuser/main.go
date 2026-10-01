// Commande temporaire — comptes jetables pour le smoke test SECT-ANNEE-HISTOIRE-2.
// Crée un RESPONSABLE + un ETUDIANT jetables dans l'étab du registrar, avec
// mot de passe connu. Supprimée après le smoke test (pattern cmd/seed).
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "DB_URL requis")
		os.Exit(1)
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "connect:", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	password := "E2e-Annee-H2!2026"
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		fmt.Fprintln(os.Stderr, "bcrypt:", err)
		os.Exit(1)
	}

	etabID := "cmq2dfmg20000lb042tzqdn79"
	filiereID := "cmq2dpi6p0001l104lu5wkwy4"

	// RESPONSABLE jetable
	respID := uuid.NewString()
	_, err = conn.Exec(ctx, `
		INSERT INTO "User" ("id", "email", "password", "name", "role", "etablissementId", "actif", "createdAt", "updatedAt")
		VALUES ($1, 'e2e-annee-h2@sect-test.dev', $2, 'E2E Annee H2 Resp', 'RESPONSABLE', $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT ("email") DO UPDATE SET "password" = EXCLUDED."password", "updatedAt" = CURRENT_TIMESTAMP
		RETURNING "id"`, respID, string(hash), etabID)
	if err != nil {
		// pgx n'a pas RETURNING sur Exec — version QueryRow
		var id string
		err2 := conn.QueryRow(ctx, `
			INSERT INTO "User" ("id", "email", "password", "name", "role", "etablissementId", "actif", "createdAt", "updatedAt")
			VALUES ($1, 'e2e-annee-h2@sect-test.dev', $2, 'E2E Annee H2 Resp', 'RESPONSABLE', $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT ("email") DO UPDATE SET "password" = EXCLUDED."password", "updatedAt" = CURRENT_TIMESTAMP
			RETURNING "id"`, respID, string(hash), etabID).Scan(&id)
		if err2 != nil {
			fmt.Fprintln(os.Stderr, "insert responsable:", err, "|", err2)
			os.Exit(1)
		}
		respID = id
	}

	// ETUDIANT jetable (filière + niveau L1)
	etuID := uuid.NewString()
	var etuIDOut string
	err = conn.QueryRow(ctx, `
		INSERT INTO "User" ("id", "email", "password", "name", "role", "etablissementId", "filiereId", "niveau", "actif", "createdAt", "updatedAt")
		VALUES ($1, 'e2e-annee-h2b@sect-test.dev', $2, 'E2E Annee H2 Etu', 'ETUDIANT', $3, $4, 'L1', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT ("email") DO UPDATE SET "password" = EXCLUDED."password", "updatedAt" = CURRENT_TIMESTAMP
		RETURNING "id"`, etuID, string(hash), etabID, filiereID).Scan(&etuIDOut)
	if err != nil {
		fmt.Fprintln(os.Stderr, "insert etudiant:", err)
		os.Exit(1)
	}

	// ENSEIGNANT jetable (même étab)
	ensID := uuid.NewString()
	var ensIDOut string
	err = conn.QueryRow(ctx, `
		INSERT INTO "User" ("id", "email", "password", "name", "role", "etablissementId", "actif", "createdAt", "updatedAt")
		VALUES ($1, 'e2e-annee-h2c@sect-test.dev', $2, 'E2E Annee H2 Ens', 'ENSEIGNANT', $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT ("email") DO UPDATE SET "password" = EXCLUDED."password", "updatedAt" = CURRENT_TIMESTAMP
		RETURNING "id"`, ensID, string(hash), etabID).Scan(&ensIDOut)
	if err != nil {
		fmt.Fprintln(os.Stderr, "insert enseignant:", err)
		os.Exit(1)
	}

	// Inscription de l'étudiant pour l'année courante (36-2027) pour la cohérence
	_, _ = conn.Exec(ctx, `
		INSERT INTO "Inscription" ("id", "etudiantId", "anneeAcademiqueId", "statut", "dateInscription", "createdAt", "updatedAt")
		VALUES ($1, $2, '381451eb-0044-49f2-b7e3-f812fe7f6e2b', 'EN_COURS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT DO NOTHING`, uuid.NewString(), etuIDOut)

	fmt.Println("RESPONSABLE_ID=" + respID)
	fmt.Println("ETUDIANT_ID=" + etuIDOut)
	fmt.Println("ENSEIGNANT_ID=" + ensIDOut)
	fmt.Println("PASSWORD=" + password)
}
