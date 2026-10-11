package http

// infra_handlers.go — SECT-INFRA-MONITOR-1 (11 octobre 2026) :
// GET /api/monitoring/infra — l'état de l'INFRASTRUCTURE hybride
// (option C, ADR-0013) pour la console super admin (nouvel onglet
// « Infrastructure »).
//
// CE QUE ÇA MESURE (et ce que ça ne mesure PAS) :
//   - API : runtime Go de CETTE instance ;
//   - VM : /proc + statfs (valeurs hôte — le conteneur est le point
//     de vue le plus honnête sur le maillon fragile) ;
//   - Réplique : cluster local 5433 (RPO vécu = âge de la donnée la
//     plus récente répliquée — 84 tables attendues) ;
//   - Backups : staging /state/backup monté ro (last_success + markers
//     restore-ok-*) ;
//   - Neon : CONTROL PLANE UNIQUEMENT (ne réveille PAS le compute —
//     discipline §13.3), optionnel (NEON_API_KEY + NEON_PROJECT_ID),
//     cache 5 min process-wide ;
//   - Sonde primaire : UNIQUEMENT à la demande explicite de l'admin
//     (?probe=primary) — un ping data par clic, jamais automatique :
//     réveiller le compute au nom du monitoring déferait §13 par
//     construction (leçon de la sonde, §13.3).
//   - DR voie D : synthèse de préparation (réplique pré-positionnée,
//     tables présentes, fraîcheur) — la promotion reste humaine
//     (anti-décision 4).

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/monitoring"
)

// primaryProbe — résultat d'une sonde volontaire du primaire Neon.
type primaryProbe struct {
	At        time.Time `json:"at"`
	Up        bool      `json:"up"`
	LatencyMs int64     `json:"latencyMs"`
	Err       string    `json:"err,omitempty"`
}

// drReadiness — synthèse de la voie D (runbook §3.8-A).
type drReadiness struct {
	VoieD  string `json:"voieD"` // PRETE | PARTIELLE | ABSENTE
	Detail string `json:"detail"`
}

// infraResponse — contrat complet de GET /api/monitoring/infra.
type infraResponse struct {
	GeneratedAt time.Time               `json:"generatedAt"`
	ReadSource  string                  `json:"readSource"`
	API         monitoring.APIInfo      `json:"api"`
	VM          monitoring.VMInfo       `json:"vm"`
	Replica     *monitoring.ReplicaInfo `json:"replica"`
	Backups     *monitoring.BackupInfo  `json:"backups"`
	Neon        *monitoring.NeonStatus  `json:"neon"`
	Primary     *primaryProbe           `json:"primary"`
	DR          drReadiness             `json:"dr"`
}

// monitoringInfra — GET /api/monitoring/infra[?probe=primary]
func (s *Server) monitoringInfra(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	infra := monitoring.CollectInfra(r.Context(), s.replicaPool, claims, s.infraStateDir)

	resp := infraResponse{
		GeneratedAt: time.Now().UTC(),
		ReadSource:  s.replicaReadSource(),
		API:         infra.API,
		VM:          infra.VM,
		Replica:     infra.Replica,
		Backups:     infra.Backups,
		DR:          computeDRReadiness(infra),
	}

	// Neon control plane — optionnel (dégradation affichée sinon).
	if s.neonAPIKey != "" && s.neonProjectID != "" {
		st := monitoring.NeonControlPlane(r.Context(), s.neonAPIKey, s.neonProjectID)
		resp.Neon = &st
	}

	// Sonde primaire — UNIQUEMENT à la demande (voir en-tête du fichier).
	if r.URL.Query().Get("probe") == "primary" {
		p := &primaryProbe{At: time.Now().UTC()}
		pingCtx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		start := time.Now()
		if err := s.dbPool.Ping(pingCtx); err != nil {
			p.Up = false
			p.Err = err.Error()
		} else {
			p.Up = true
			p.LatencyMs = time.Since(start).Milliseconds()
		}
		cancel()
		resp.Primary = p
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Sect-Read-Source", resp.ReadSource)
	_ = json.NewEncoder(w).Encode(resp)
}

// computeDRReadiness — verdict voie D (lecture seule — décision support).
func computeDRReadiness(infra monitoring.InfraSnapshot) drReadiness {
	if infra.Replica == nil {
		return drReadiness{VoieD: "ABSENTE", Detail: "réplique non configurée (REPLICA_DATABASE_URL vide) — voie B (backup) reste le chemin §3.8"}
	}
	if !infra.Replica.Up {
		return drReadiness{VoieD: "PARTIELLE", Detail: "réplique injoignable (cluster 5433) : " + infra.Replica.Err}
	}
	if infra.Replica.TablesApp < 80 {
		return drReadiness{VoieD: "PARTIELLE", Detail: "tables présentes insuffisantes pour la promotion (dr_promote --prepare-publication à rejouer)"}
	}
	// Seuil 90 min = CELUI de la règle système replica-fraicheur (3 fenêtres
	// grille manquées). En dessous, une fraîcheur élevée traduit le plus souvent
	// un SILENCE D'ÉCRITURE (soirée/nuit — mesuré 11/10 : dernière requête à
	// 16:43, grille saine), pas une réplique en retard : seules les données
	// NOUVELLES voyagent. dr_gate.sh (superuser) reste le verdict réel avant
	// toute promotion humaine.
	if infra.Replica.DataFreshnessMin != nil && *infra.Replica.DataFreshnessMin > 90 {
		return drReadiness{VoieD: "PARTIELLE", Detail: "fraîcheur des données > 90 min (règle replica-fraicheur franchie) — grille M1 interrompue OU long silence d'écriture : vérifier sect-replica-sync.timer avant promotion"}
	}
	return drReadiness{VoieD: "PRETE", Detail: "réplique pré-positionnée — promotion par décision humaine (dr_promote --confirm PROMOUVOIR, runbook §3.8-C)"}
}
