// Package monitoring — Score santé plateforme (ADR-0011).
//
// SECT-MONITORING-ALIGN-1 : le score « Santé plateforme » était calculé
// côté CLIENT (admin-dashboard.tsx) avec deux KPIs hardcodés à 0 côté
// backend (nbEtablissementsProteges/nbVerificationIdentite) → pénalité
// perpétuelle de −20 points. Désormais la formule vit ICI, côté backend,
// et est consommée par /api/monitoring/overview ET /api/stats/admin
// (champ "health") — un seul chiffre, une seule formule, deux niveaux
// de lecture (carte dashboard = score, /monitoring = score + breakdown).
package monitoring

// ScoreInputs — entrées du score (toutes mesurées côté backend).
type ScoreInputs struct {
	CriticalActifs         int   // événements ACTIF sévérité CRITICAL
	ErrorActifs            int   // événements ACTIF sévérité ERROR
	WarningActifs          int   // événements ACTIF sévérité WARNING
	AutorisationsEnAttente int   // EtablissementAccess EN_ATTENTE (backlog admin)
	DBIndisponible         bool  // ping DB échoué
	DBLatencyMs            int64 // latence ping DB
	ProvidersIAActifs      int   // AIProviderConfig isActive
	EtablissementsProteges int   // SecuritySettings.proctoringActif (KPI réel)
}

// ScoreComponent — une ligne du breakdown (transparent, auditable).
type ScoreComponent struct {
	Label   string `json:"label"`   // ex: "Événements critiques actifs"
	Detail  string `json:"detail"`  // ex: "2 × −5 (plafond −30)"
	Penalty int    `json:"penalty"` // pénalité appliquée (négative ou 0)
}

// ScoreResult — score + verdict + décomposition.
type ScoreResult struct {
	Score     int              `json:"score"`   // 0-100
	Verdict   string           `json:"verdict"` // BONNE_SANTE | ATTENTION | URGENT
	Breakdown []ScoreComponent `json:"breakdown"`
}

// Plafonds de pénalité (éviter qu'un incident volumineux masque les
// autres dimensions — un score à 0 doit rester lisible).
const (
	capCritical = 30
	capError    = 20
	capWarning  = 10
	capBacklog  = 10
)

// ComputeScore applique la formule v2 (ADR-0011 §1).
//
//	100
//	  − 5 × CRITICAL actifs   (plafond −30)
//	  − 2 × ERROR actifs      (plafond −20)
//	  − 0,5 × WARNING actifs  (plafond −10, arrondi)
//	  − 1 × autorisations en attente (plafond −10)
//	  − 30 si DB indisponible / −10 si latence DB > 1 s
//	  − 10 si 0 provider IA actif
//	borné [0, 100]
//
// NB : les KPIs SecuritySettings (proctoring/verification) ne pénalisent
// PLUS à vide — ils sont réels et exposés dans le breakdown à titre
// informatif (le choix anti-fraude appartient aux établissements).
func ComputeScore(in ScoreInputs) ScoreResult {
	score := 100
	breakdown := []ScoreComponent{}

	sub := func(label, detail string, penalty, cap int) int {
		if penalty > cap {
			penalty = cap
		}
		if penalty < 0 {
			penalty = 0
		}
		breakdown = append(breakdown, ScoreComponent{Label: label, Detail: detail, Penalty: -penalty})
		return penalty
	}

	score -= sub("Événements critiques actifs",
		itoa(in.CriticalActifs)+" × −5", in.CriticalActifs*5, capCritical)

	score -= sub("Erreurs actives",
		itoa(in.ErrorActifs)+" × −2", in.ErrorActifs*2, capError)

	warnPenalty := (in.WarningActifs + 1) / 2 // 0,5 pt arrondi au supérieur
	score -= sub("Avertissements actifs",
		itoa(in.WarningActifs)+" × −0,5", warnPenalty, capWarning)

	score -= sub("Backlog autorisations",
		itoa(in.AutorisationsEnAttente)+" en attente × −1", in.AutorisationsEnAttente, capBacklog)

	if in.DBIndisponible {
		score -= sub("Base de données", "indisponible", 30, 30)
	} else if in.DBLatencyMs > 1000 {
		score -= sub("Latence base de données", i64toa(in.DBLatencyMs)+" ms > 1 s", 10, 10)
	}

	if in.ProvidersIAActifs == 0 {
		score -= sub("Fournisseurs IA", "aucun provider actif", 10, 10)
	}

	// Composants informatifs (pénalité nulle) — visibilité KPIs réels.
	breakdown = append(breakdown, ScoreComponent{
		Label:   "Établissements avec proctoring",
		Detail:  itoa(in.EtablissementsProteges) + " établissement(s)",
		Penalty: 0,
	})

	if score > 100 {
		score = 100
	}
	if score < 0 {
		score = 0
	}

	verdict := "BONNE_SANTE"
	if score < 80 {
		verdict = "ATTENTION"
	}
	if score < 50 {
		verdict = "URGENT"
	}

	return ScoreResult{Score: score, Verdict: verdict, Breakdown: breakdown}
}

// itoa/i64toa — petits helpers sans import fmt (package utilitaire léger).
func itoa(n int) string {
	return i64toa(int64(n))
}

func i64toa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := [20]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
