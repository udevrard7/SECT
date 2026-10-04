// Package domain — entité OuvrageLecture (bibliothèque numérique,
// ADR-0007 P2 : la lecture mesurée).
//
// Une ligne par (ouvrage, utilisateur) — UNIQUE("ouvrageId","userId")
// (migration 000124). La télémétrie est une POSITION de lecture, pas
// une donnée d'évaluation : elle n'entre JAMAIS dans les notes.
package domain

import (
	"context"
	"time"
)

// Bornes anti-abus de la télémétrie (ADR-0007 §P2). La télémétrie est
// TOLÉRANTE : le usecase CLAMPE (jamais de 400 pour un heartbeat
// légèrement hors bornes — une sonde ne doit pas casser la lecture) ;
// la sanitisation DROPPe silencieusement l'invalide (clés non
// numériques, valeurs nulles/négatives).
const (
	// MaxPageOuvrage — borne sur les numéros de page (marque-page et clés
	// de pagesVues). Un PDF de 100 000 pages n'existe pas ; au-delà, c'est
	// de la sonde.
	MaxPageOuvrage = 100000
	// MaxVuesParPage — borne par entrée de pagesVues (clamp).
	MaxVuesParPage = 10000
	// MaxEntreesPagesVues — borne taille de la map pagesVues fusionnée
	// (anti-gonflement de la colonne TEXT-JSON).
	MaxEntreesPagesVues = 5000
	// MaxTempsDeltaSec — un seul flush ne peut ajouter plus d'1 h (le
	// heartbeat client est à 30 s ; un onglet oublié visible compte, un
	// onglet caché ne compte pas — visibilitychange).
	MaxTempsDeltaSec = 3600
	// MaxTempsTotalSec — borne du cumul (~3,2 ans) : marge confortable
	// sous INTEGER (2^31-1 s ≈ 68 ans) même en cas d'abus prolongé.
	MaxTempsTotalSec = 100000000
)

// OuvrageLecture — progression de lecture d'un utilisateur sur un ouvrage.
type OuvrageLecture struct {
	ID                string    `json:"id"`
	OuvrageID         string    `json:"ouvrageId"`
	UserID            string    `json:"userId"`
	DernierePage      int       `json:"dernierePage"`        // marque-page (reprise #page=N)
	PagesVues         *string   `json:"pagesVues,omitempty"` // JSON {"12": 3} (pattern TEXT-JSON)
	TempsTotalSec     int       `json:"tempsTotalSec"`       // cumul visibilité-gated
	DerniereLectureAt time.Time `json:"derniereLectureAt"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// RecordLectureInput — payload PUT /api/ouvrages/{id}/lecture (télémétrie).
//
// Sémantique : TempsDeltaSec est un INCRÉMENT (le client envoie ce qu'il
// a accumulé depuis le dernier flush) ; PagesVues est un DELTA de vues
// (fusionné côté serveur avec l'existant) ; DernierePage est un
// MARQUE-PAGE DÉCLARATIF (nil = ne pas toucher — un heartbeat de temps
// seul ne déplace pas le marque-page, seul un marquage explicite le fait).
type RecordLectureInput struct {
	DernierePage  *int           `json:"dernierePage,omitempty"`
	PagesVues     map[string]int `json:"pagesVues,omitempty"`
	TempsDeltaSec int            `json:"tempsDeltaSec"`
}

// OuvrageActivite — ligne d'agrégat d'activité par ouvrage (fonction
// bibliotheque_activite_etablissement, migration 000124). Agrégats
// UNIQUEMENT — aucune donnée individuelle de lecteur ne sort (exception
// documentée 000097, pattern 000116).
type OuvrageActivite struct {
	OuvrageID        string     `json:"ouvrageId"`
	Titre            string     `json:"titre"`
	Categorie        string     `json:"categorie"` // CategorieOuvrage::text (leçon ENUM-SWEEP)
	NbLecteurs       int64      `json:"nbLecteurs"`
	PagesVuesTotal   int64      `json:"pagesVuesTotal"`
	TempsTotalSec    int64      `json:"tempsTotalSec"`
	DerniereActivite *time.Time `json:"derniereActivite,omitempty"` // NULL = ouvrage sans lecture
}

// OuvrageLectureRepository interface.
type OuvrageLectureRepository interface {
	// GetLecture — la progression de (ouvrage, utilisateur).
	// (nil, nil) = première lecture (aucune ligne) — le handler répond
	// alors {"lecture": null} APRÈS avoir vérifié la visibilité de
	// l'ouvrage (le usecase appelle OuvrageRepository.FindByID pour le
	// 404 d'auto-masquage, cohérent avec GET /api/ouvrages/{id}).
	GetLecture(ctx context.Context, ouvrageID, userID string) (*OuvrageLecture, error)
	// UpsertLecture — read-modify-write sous SELECT FOR UPDATE :
	// la fusion pagesVues et le cumul tempsTotalSec se font côté Go,
	// jamais en SQL assemblé (le JSON n'est pas manipulé en base).
	UpsertLecture(ctx context.Context, ouvrageID, userID string, input RecordLectureInput) (*OuvrageLecture, error)
	// ActiviteEtablissement — agrégats via la fonction SECURITY DEFINER
	// bibliotheque_activite_etablissement (cloisonnée rôle+etab dans la
	// fonction, exécutée sous les claims de l'appelant).
	ActiviteEtablissement(ctx context.Context, etablissementID string) ([]OuvrageActivite, error)
	// SumTempsLectureByUser — secondes de lecture cumulées de l'utilisateur
	// sur TOUS les ouvrages (matière première du badge « lecteur assidu »,
	// ADR-0008 §3). Sous les claims du lecteur : RLS self-only de toute
	// façon (un appelant ne peut sonder que son propre cumul).
	SumTempsLectureByUser(ctx context.Context, userID string) (int64, error)
}
