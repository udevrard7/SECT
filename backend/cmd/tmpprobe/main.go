package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
)

func main() {
	url := os.Getenv("DATABASE_URL")
	pool, err := appdb.New(url)
	if err != nil {
		fmt.Println("POOL ERR:", err)
		return
	}
	defer pool.Close()

	claims := appdb.SessionClaims{
		UserID:          "smoke_resp_notifdiff1",
		Role:            "RESPONSABLE",
		EtablissementID: "cmq2dfmg20000lb042tzqdn79",
	}

	runCase := func(name string, role *string, segment *string) {
		etab := "cmq2dfmg20000lb042tzqdn79"
		var expireArg any
		var actionURL, actionLabel, icone any

		err := appdb.WithTx(context.Background(), pool, claims, func(tx pgx.Tx) error {
			row := tx.QueryRow(context.Background(), `
				INSERT INTO "NotificationAdmin" ("id", "type", "titre", "message",
					"destinataireId", "destinataireRole",
					"destinataireSegment", "destinataireEtablissementId",
					"lu", "actionUrl", "actionLabel",
					"priorite", "categorie", "icone", "expireLe", "createdAt")
				VALUES ($1, 'BROADCAST', $2, $3, NULL, $4, $5, $6, false, $7, $8, $9, $10, $11, $12, now())
				RETURNING "id", "type", "titre", "message", "destinataireId", "destinataireRole",
					"destinataireSegment", "destinataireEtablissementId",
					"lu", "actionUrl", "actionLabel", "priorite", "categorie", "icone",
					"expireLe", "createdAt"
			`,
				"probe_notif_"+name, "PROBE-"+name, "probe msg",
				role, segment, &etab,
				actionURL, actionLabel,
				"HAUTE", "pedagogique", icone, expireArg,
			)
			// EXACT replica of scanNotifAdmin destinations
			var ID, Type, Titre, Message string
			var DestinataireID, DestinataireRole, DestinataireSegment, DestinataireEtablissementID *string
			var Lu bool
			var ActionURL, ActionLabel, Icone *string
			var Priorite, Categorie string
			var expireLe *time.Time
			var createdAt time.Time
			scanErr := row.Scan(&ID, &Type, &Titre, &Message, &DestinataireID, &DestinataireRole,
				&DestinataireSegment, &DestinataireEtablissementID,
				&Lu, &ActionURL, &ActionLabel,
				&Priorite, &Categorie, &Icone, &expireLe, &createdAt)
			if scanErr != nil {
				return fmt.Errorf("SCAN: %w", scanErr)
			}
			fmt.Printf("  SCANNED OK: id=%s role=%v segment=%v etab=%v\n", ID, DestinataireRole, DestinataireSegment, DestinataireEtablissementID != nil)
			return fmt.Errorf("FORCE ROLLBACK")
		})
		fmt.Printf("%s → WithTx err: %v\n", name, err)
	}

	roleEtu := "ETUDIANT"
	segEtab := "ETABLISSEMENT"
	runCase("ETUDIANTS", &roleEtu, nil)
	runCase("TOUS", nil, &segEtab)
}
