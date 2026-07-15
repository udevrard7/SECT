package repository

// quota.go — QuotaRepository : vérification des quotas par établissement.
//
// SECT-QUOTA-GUARDS : empêche un utilisateur de dépasser les limites de son plan.
// Récupère le plan actif (abonnement ACTIF) + compte l'usage actuel.
//
// Règles :
//   - nbEtudiantsMax = 0 → illimité (plans B2B "illimité")
//   - quotaIAGeneration = nil → illimité
//   - Pas d'abonnement actif → pas de limites (legacy/gratuit sans plan)

import (
        "context"
        "fmt"
        "time"

        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// QuotaRepository vérifie les quotas d'un établissement contre son plan actif.
type QuotaRepository struct {
        pool *pgxpool.Pool
}

// NewQuotaRepository crée un nouveau QuotaRepository.
func NewQuotaRepository(pool *pgxpool.Pool) *QuotaRepository {
        return &QuotaRepository{pool: pool}
}

// GetActivePlanLimits récupère les limites du plan actif pour un établissement.
// Retourne nil si aucun abonnement actif (pas de limites).
func (r *QuotaRepository) GetActivePlanLimits(ctx context.Context, etablissementID string) (*domain.PlanLimits, error) {
        // On interroge directement le pool (pas de RLS — on lit Plan + Abonnement
        // qui sont des tables admin/lecture seule côté établissement).
        row := r.pool.QueryRow(ctx, `
                SELECT p."id", p."nom", COALESCE(p."branche", ''),
                       p."nbEtudiantsMax", p."nbEnseignantsMax", p."nbFilieresMax",
                       p."nbEvaluationsMois",
                       p."quotaIAGeneration", p."quotaIACorrection",
                       p."classeesMax"
                FROM "Abonnement" a
                JOIN "Plan" p ON p."id" = a."planId"
                WHERE a."etablissementId" = $1
                  AND a."statut" = 'ACTIF'
                  AND a."deletedAt" IS NULL
                ORDER BY a."createdAt" DESC
                LIMIT 1
        `, etablissementID)

        var p domain.PlanLimits
        err := row.Scan(
                &p.PlanID, &p.PlanNom, &p.Branche,
                &p.NbEtudiantsMax, &p.NbEnseignantsMax, &p.NbFilieresMax,
                &p.NbEvaluationsMois,
                &p.QuotaIAGeneration, &p.QuotaIACorrection,
                &p.ClasseesMax,
        )
        if err == pgx.ErrNoRows {
                return nil, nil // pas d'abonnement actif → pas de limites
        }
        if err != nil {
                return nil, fmt.Errorf("get active plan limits: %w", err)
        }
        return &p, nil
}

// CheckStudentsQuota vérifie si l'établissement peut ajouter un étudiant.
// Retourne nil si OK, *QuotaExceededError si quota dépassé.
func (r *QuotaRepository) CheckStudentsQuota(ctx context.Context, etablissementID string) error {
        plan, err := r.GetActivePlanLimits(ctx, etablissementID)
        if err != nil || plan == nil {
                return nil // pas de plan → pas de limite
        }
        if plan.NbEtudiantsMax == 0 {
                return nil // 0 = illimité
        }
        count, err := r.countUsersByRole(ctx, etablissementID, "ETUDIANT")
        if err != nil {
                return err
        }
        if count >= plan.NbEtudiantsMax {
                return &domain.QuotaExceededError{
                        Resource: "étudiants",
                        Current:  count,
                        Max:      plan.NbEtudiantsMax,
                        PlanNom:  plan.PlanNom,
                }
        }
        return nil
}

// CheckEnseignantsQuota vérifie si l'établissement peut ajouter un enseignant.
func (r *QuotaRepository) CheckEnseignantsQuota(ctx context.Context, etablissementID string) error {
        plan, err := r.GetActivePlanLimits(ctx, etablissementID)
        if err != nil || plan == nil {
                return nil
        }
        if plan.NbEnseignantsMax == 0 {
                return nil
        }
        count, err := r.countUsersByRole(ctx, etablissementID, "ENSEIGNANT")
        if err != nil {
                return err
        }
        if count >= plan.NbEnseignantsMax {
                return &domain.QuotaExceededError{
                        Resource: "enseignants",
                        Current:  count,
                        Max:      plan.NbEnseignantsMax,
                        PlanNom:  plan.PlanNom,
                }
        }
        return nil
}

// CheckFilieresQuota vérifie si l'établissement peut ajouter une filière.
func (r *QuotaRepository) CheckFilieresQuota(ctx context.Context, etablissementID string) error {
        plan, err := r.GetActivePlanLimits(ctx, etablissementID)
        if err != nil || plan == nil {
                return nil
        }
        if plan.NbFilieresMax == 0 {
                return nil
        }
        var count int
        err = r.pool.QueryRow(ctx,
                `SELECT count(*) FROM "Filiere" WHERE "etablissementId" = $1`,
                etablissementID,
        ).Scan(&count)
        if err != nil {
                return fmt.Errorf("count filieres: %w", err)
        }
        if count >= plan.NbFilieresMax {
                return &domain.QuotaExceededError{
                        Resource: "filières",
                        Current:  count,
                        Max:      plan.NbFilieresMax,
                        PlanNom:  plan.PlanNom,
                }
        }
        return nil
}

// CheckEvaluationsQuota vérifie si l'établissement peut créer une évaluation
// ce mois-ci (nbEvaluationsMois).
func (r *QuotaRepository) CheckEvaluationsQuota(ctx context.Context, etablissementID string) error {
        plan, err := r.GetActivePlanLimits(ctx, etablissementID)
        if err != nil || plan == nil {
                return nil
        }
        if plan.NbEvaluationsMois == 0 {
                return nil
        }
        var count int
        err = r.pool.QueryRow(ctx, `
                SELECT count(*) FROM "Epreuve"
                WHERE "etablissementId" = $1
                  AND "createdAt" >= date_trunc('month', now())
        `, etablissementID).Scan(&count)
        if err != nil {
                return fmt.Errorf("count evaluations this month: %w", err)
        }
        if count >= plan.NbEvaluationsMois {
                return &domain.QuotaExceededError{
                        Resource: "évaluations ce mois",
                        Current:  count,
                        Max:      plan.NbEvaluationsMois,
                        PlanNom:  plan.PlanNom,
                }
        }
        return nil
}

// CheckIAGenerationQuota vérifie si l'établissement peut générer une épreuve IA
// ce mois-ci (quotaIAGeneration).
func (r *QuotaRepository) CheckIAGenerationQuota(ctx context.Context, etablissementID string) error {
        plan, err := r.GetActivePlanLimits(ctx, etablissementID)
        if err != nil || plan == nil {
                return nil
        }
        if plan.QuotaIAGeneration == nil {
                return nil // nil = illimité
        }
        count, err := r.countIAUsageThisMonth(ctx, etablissementID, "generation")
        if err != nil {
                return err
        }
        if count >= *plan.QuotaIAGeneration {
                return &domain.QuotaExceededError{
                        Resource: "générations IA ce mois",
                        Current:  count,
                        Max:      *plan.QuotaIAGeneration,
                        PlanNom:  plan.PlanNom,
                }
        }
        return nil
}

// CheckIACorrectionQuota vérifie si l'établissement peut corriger une copie IA
// ce mois-ci (quotaIACorrection).
func (r *QuotaRepository) CheckIACorrectionQuota(ctx context.Context, etablissementID string) error {
        plan, err := r.GetActivePlanLimits(ctx, etablissementID)
        if err != nil || plan == nil {
                return nil
        }
        if plan.QuotaIACorrection == nil {
                return nil
        }
        count, err := r.countIAUsageThisMonth(ctx, etablissementID, "correction")
        if err != nil {
                return err
        }
        if count >= *plan.QuotaIACorrection {
                return &domain.QuotaExceededError{
                        Resource: "corrections IA ce mois",
                        Current:  count,
                        Max:      *plan.QuotaIACorrection,
                        PlanNom:  plan.PlanNom,
                }
        }
        return nil
}

// CheckActiveStudentsUsageQuota (SECT-B2C-EXPIRE Option C) vérifie le nombre
// d'étudiants UNIQUES ayant démarré au moins une session ce mois-ci.
//
// Empêche le contournement du quota par désactivation/réactivation d'étudiants
// en lots de 40 : une fois qu'un étudiant a démarré une session, son userId est
// compté pour le mois, qu'il soit ensuite désactivé ou non.
//
// Si count >= plan.NbEtudiantsMax, retourne QuotaExceededError.
func (r *QuotaRepository) CheckActiveStudentsUsageQuota(ctx context.Context, etablissementID string) error {
        plan, err := r.GetActivePlanLimits(ctx, etablissementID)
        if err != nil || plan == nil {
                return nil // pas de plan → pas de limite
        }
        if plan.NbEtudiantsMax == 0 {
                return nil // 0 = illimité (plans B2B)
        }

        // Compter les étudiants UNIQUES ayant démarré une session ce mois-ci.
        // Epreuve n'a pas d'etablissementId direct → on joint via Filiere.
        // dateDebut IS NOT NULL = session réellement démarrée (pas juste créée).
        var count int
        err = r.pool.QueryRow(ctx, `
                SELECT count(DISTINCT sp."etudiantId")
                FROM "SessionPassation" sp
                JOIN "Epreuve" e ON e."id" = sp."epreuveId"
                JOIN "Filiere" f ON f."id" = e."filiereId"
                WHERE f."etablissementId" = $1
                  AND sp."dateDebut" IS NOT NULL
                  AND date_trunc('month', sp."dateDebut") = date_trunc('month', NOW())
        `, etablissementID).Scan(&count)
        if err != nil {
                return fmt.Errorf("count active students usage: %w", err)
        }

        if count >= plan.NbEtudiantsMax {
                return &domain.QuotaExceededError{
                        Resource: "étudiants ayant composé ce mois",
                        Current:  count,
                        Max:      plan.NbEtudiantsMax,
                        PlanNom:  plan.PlanNom,
                }
        }
        return nil
}

// IncrementIAGeneration incrémente le compteur de génération IA du mois.
func (r *QuotaRepository) IncrementIAGeneration(ctx context.Context, etablissementID string) error {
        return r.incrementIAUsage(ctx, etablissementID, "generation")
}

// IncrementIACorrection incrémente le compteur de correction IA du mois.
func (r *QuotaRepository) IncrementIACorrection(ctx context.Context, etablissementID string) error {
        return r.incrementIAUsage(ctx, etablissementID, "correction")
}

// ─── Helpers privés ───

func (r *QuotaRepository) countUsersByRole(ctx context.Context, etablissementID, role string) (int, error) {
        var count int
        err := r.pool.QueryRow(ctx,
                `SELECT count(*) FROM "User" WHERE "etablissementId" = $1 AND "role" = $2::"Role" AND "actif" = true`,
                etablissementID, role,
        ).Scan(&count)
        if err != nil {
                return 0, fmt.Errorf("count users by role: %w", err)
        }
        return count, nil
}

func (r *QuotaRepository) countIAUsageThisMonth(ctx context.Context, etablissementID, usageType string) (int, error) {
        var count int
        err := r.pool.QueryRow(ctx, `
                SELECT COALESCE(SUM("count"), 0)
                FROM "IAUsage"
                WHERE "etablissementId" = $1
                  AND "type" = $2
                  AND "month" = date_trunc('month', now())
        `, etablissementID, usageType).Scan(&count)
        if err != nil {
                return 0, fmt.Errorf("count IA usage: %w", err)
        }
        return count, nil
}

func (r *QuotaRepository) incrementIAUsage(ctx context.Context, etablissementID, usageType string) error {
        _, err := r.pool.Exec(ctx, `
                INSERT INTO "IAUsage" ("id", "etablissementId", "type", "month", "count", "createdAt", "updatedAt")
                VALUES (gen_random_uuid()::text, $1, $2, date_trunc('month', now()), 1, now(), now())
                ON CONFLICT ("etablissementId", "type", "month")
                DO UPDATE SET "count" = "IAUsage"."count" + 1, "updatedAt" = now()
        `, etablissementID, usageType)
        if err != nil {
                return fmt.Errorf("increment IA usage: %w", err)
        }
        return nil
}

// GetPlanLimitsForUser récupère les limites du plan pour un utilisateur donné
// (via son etablissementId). Utilisé par les handlers IA qui ont claims.UserID
// mais besoin de l'etablissementId.
func (r *QuotaRepository) GetPlanLimitsForUser(ctx context.Context, userID string) (*domain.PlanLimits, string, error) {
        var etablissementID string
        err := r.pool.QueryRow(ctx,
                `SELECT "etablissementId" FROM "User" WHERE "id" = $1`,
                userID,
        ).Scan(&etablissementID)
        if err != nil {
                return nil, "", fmt.Errorf("get user etablissement: %w", err)
        }
        if etablissementID == "" {
                return nil, "", nil // user sans établissement (ADMIN) → pas de limites
        }
        plan, err := r.GetActivePlanLimits(ctx, etablissementID)
        if err != nil {
                return nil, etablissementID, err
        }
        return plan, etablissementID, nil
}

// Unused import guard (time will be used when we add date helpers)
var _ = time.Now
