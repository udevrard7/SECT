package http

// downgrade_email.go — Email de rétrogradation avec récapitulatif des données en surplus.
//
// SECT-B2C-EXPIRE (Option C) : quand un prof Premium est rétrogradé en Solo, on
// lui envoie un email expliquant :
//   1. Les données existantes sont conservées (filières, UE, étudiants, épreuves)
//   2. Les quotas Solo s'appliquent aux nouvelles créations (5 filières, 40 étudiants, 3 épreuves IA/mois)
//   3. Les étudiants ne peuvent plus passer d'épreuves si le nombre d'étudiants actifs > 40
//   4. Il peut renouveler Premium à tout moment

import (
        "context"
        "fmt"
        "log/slog"

        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/mailer"
)

// surplusData — comptes des données existantes vs limites Solo.
type surplusData struct {
        Filieres    int
        Etudiants   int
        Epreuves    int
        FilieresMax int // 5 pour Solo
        EtudiantsMax int // 40 pour Solo
}

// sendDowngradeEmail envoie l'email de rétrogradation avec récapitulatif.
func (s *Server) sendDowngradeEmail(ctx context.Context, aboID string) {
        if s.mailer == nil {
                return
        }

        // 1. Récupérer les infos (user + etab + counts)
        var userEmail, userName, etabID string
        err := appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT u."email", u."name", a."etablissementId"
                        FROM "Abonnement" a
                        JOIN "User" u ON u."etablissementId" = a."etablissementId" AND u."role" = 'ENSEIGNANT'
                        WHERE a."id" = $1
                        LIMIT 1
                `, aboID).Scan(&userEmail, &userName, &etabID)
        })
        if err != nil {
                slog.Error("sendDowngradeEmail: failed to get user", "aboId", aboID, "error", err.Error())
                return
        }

        // 2. Compter les données existantes
        var surplus surplusData
        surplus.FilieresMax = 5   // Solo
        surplus.EtudiantsMax = 40 // Solo

        err = appdb.WithTx(ctx, s.dbPool, appdb.SystemClaims(), func(tx pgx.Tx) error {
                tx.QueryRow(ctx, `SELECT count(*) FROM "Filiere" WHERE "etablissementId" = $1 AND "actif" = true`, etabID).Scan(&surplus.Filieres)
                tx.QueryRow(ctx, `SELECT count(*) FROM "User" WHERE "etablissementId" = $1 AND "role" = 'ETUDIANT' AND "actif" = true`, etabID).Scan(&surplus.Etudiants)
                tx.QueryRow(ctx, `SELECT count(*) FROM "Epreuve" WHERE "etablissementId" = $1`, etabID).Scan(&surplus.Epreuves)
                return nil
        })
        if err != nil {
                slog.Error("sendDowngradeEmail: failed to count data", "aboId", aboID, "error", err.Error())
                return
        }

        // 3. Construire le message
        subject := "Rétrogradation en Prof Solo — Récapitulatif de vos données"

        body := fmt.Sprintf(`Bonjour %s,

Votre abonnement a été rétrogradé en Prof Solo (gratuit).

VOS DONNÉES SONT CONSERVÉES
───────────────────────────
Vous gardez l'accès à toutes vos données existantes :
  • %d filière(s) active(s)
  • %d étudiant(s) actif(s)
  • %d épreuve(s) créée(s)

LIMITES DU PLAN SOLO
─────────────────────
  • Filieres : %d max (vous en avez %d)
  • Étudiants : %d max (vous en avez %d)
  • Génération IA : 3/mois
  • Correction IA : 3/mois

IMPORTANT — PASSATION D'ÉPREUVES
────────────────────────────────
Votre plan Solo permet à %d étudiants de composer par mois (tous examens
confondus). Une fois cette limite atteinte, aucun étudiant ne pourra plus
démarrer de session d'examen ce mois-ci — même si vous désactivez/réactivez
des étudiants. Pour permettre à plus d'étudiants de composer :
  1. Attendre le mois suivant (le compteur se réinitialise), OU
  2. Renouveler votre abonnement Premium

RENOUVELLER PREMIUM
───────────────────
Connectez-vous et rendez-vous dans votre espace pour renouveler :
%s/login

L'équipe SECT`,
                userName,
                surplus.Filieres, surplus.Etudiants, surplus.Epreuves,
                surplus.FilieresMax, surplus.Filieres,
                surplus.EtudiantsMax, surplus.Etudiants,
                surplus.EtudiantsMax,
                s.appBaseURL,
        )

        // 4. Envoyer l'email (synchrone)
        if err := s.mailer.Send(mailer.Email{
                To:      userEmail,
                Subject: subject,
                Body:    body,
        }); err != nil {
                slog.Error("sendDowngradeEmail: failed to send", "aboId", aboID, "email", userEmail, "error", err.Error())
        } else {
                slog.Info("Downgrade email sent",
                        "aboId", aboID, "email", userEmail,
                        "filieres", surplus.Filieres, "etudiants", surplus.Etudiants, "epreuves", surplus.Epreuves)
        }
}
