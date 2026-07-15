package domain

import (
        "context"
        "fmt"
)

// PlanLimits contient les limites d'un plan applicables à un établissement.
// Récupéré depuis l'abonnement actif + le plan associé.
type PlanLimits struct {
        PlanID            string
        PlanNom           string
        Branche           string // B2C | B2B | "" (legacy)
        NbEtudiantsMax    int    // 0 = illimité (pour les plans B2B "illimité")
        NbEnseignantsMax  int
        NbFilieresMax     int
        NbEvaluationsMois int
        QuotaIAGeneration *int // nil = illimité, sinon nb/mois
        QuotaIACorrection *int // nil = illimité, sinon nb/mois
        ClasseesMax       *int // B2C : nb classes, nil = illimité
}

// QuotaExceededError est retourné quand un quota est dépassé.
// Le frontend peut afficher le message tel quel (clair et actionable).
type QuotaExceededError struct {
        Resource string // "étudiants", "enseignants", "filières", "évaluations", "IA génération", "IA correction"
        Current  int    // utilisation actuelle
        Max      int    // limite du plan
        PlanNom  string // nom du plan pour le message
}

func (e *QuotaExceededError) Error() string {
        return fmt.Sprintf(
                "quota %s dépassé : %d/%d atteint (plan %s). Passez à un plan supérieur ou contactez votre administrateur.",
                e.Resource, e.Current, e.Max, e.PlanNom,
        )
}

// IsQuotaExceeded retourne true si err est une *QuotaExceededError.
func IsQuotaExceeded(err error) bool {
        _, ok := err.(*QuotaExceededError)
        return ok
}

// QuotaChecker définit les méthodes de vérification des quotas.
// Implémenté par repository.QuotaRepository.
type QuotaChecker interface {
        CheckStudentsQuota(ctx context.Context, etablissementID string) error
        CheckEnseignantsQuota(ctx context.Context, etablissementID string) error
        CheckFilieresQuota(ctx context.Context, etablissementID string) error
        CheckEvaluationsQuota(ctx context.Context, etablissementID string) error
        CheckIAGenerationQuota(ctx context.Context, etablissementID string) error
        CheckIACorrectionQuota(ctx context.Context, etablissementID string) error
        // SECT-B2C-EXPIRE (Option C) : vérifie le nombre d'étudiants UNIQUES ayant
        // démarré au moins une session ce mois-ci. Empêche le contournement du quota
        // par désactivation/réactivation d'étudiants en lots.
        CheckActiveStudentsUsageQuota(ctx context.Context, etablissementID string) error
        IncrementIAGeneration(ctx context.Context, etablissementID string) error
        IncrementIACorrection(ctx context.Context, etablissementID string) error
        GetPlanLimitsForUser(ctx context.Context, userID string) (*PlanLimits, string, error)
}
