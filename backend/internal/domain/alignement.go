// Package domain — AlignementOuvrage : la déclaration support ↔ ouvrage
// (ADR-0007 §P3, migration 000126). C'est « la déclaration des 5 minutes » :
// au dépôt de son support, l'enseignant déclare quels ouvrages de la
// bibliothèque normative couvrent son cours — l'IA PROPOSE (retrieval sur
// les thèmes), l'enseignant DÉCIDE (autorité de la transposition didactique,
// invariant P3).
//
// Sous-produits sans saisie additionnelle : bibliographie automatique sur
// la fiche du support, carte d'alignement, indicateur de conformité par
// épreuve (questions via chapterId P2.5 → chapitres → sujets vs thèmes des
// REFERENTIEL_OFFICIEL), audit de direction.
//
// Invariants I1/I2 (ADR-0007) : le livre ne génère JAMAIS de questions ;
// les alignements nourrissent la bibliographie et la conformité — jamais
// la génération.
package domain

import (
	"context"
	"time"
)

// AlignementOuvrage — une déclaration (support, ouvrage, ± section).
// UNIQUE NULLS NOT DISTINCT (documentId, ouvrageId, ouvrageSectionId) :
// (doc, ouvrage, NULL) + (doc, ouvrage, section A) coexistent — citer
// l'ouvrage entier ET un chapitre ciblé sont deux citations distinctes.
type AlignementOuvrage struct {
	ID               string    `json:"id"`
	DocumentID       string    `json:"documentId"`
	OuvrageID        string    `json:"ouvrageId"`
	OuvrageSectionID *string   `json:"ouvrageSectionId,omitempty"`
	DeclareParID     string    `json:"declareParId"`
	Note             *string   `json:"note,omitempty"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
	// Enrichis (LEFT JOIN) pour la bibliographie et le dialog enseignant.
	Ouvrage *Ouvrage        `json:"ouvrage,omitempty"`
	Section *OuvrageSection `json:"section,omitempty"`
}

// CreateAlignementInput — POST /api/documents/{id}/alignements (owner ENS).
type CreateAlignementInput struct {
	OuvrageID        string  `json:"ouvrageId"`
	OuvrageSectionID *string `json:"ouvrageSectionId,omitempty"`
	Note             *string `json:"note,omitempty"`
}

// OuvrageSuggestion — une proposition IA (flux P3 §1 : retrieval).
// Score = 2×thèmes recoupés + 1×sujets de chapitres recoupés (recoupement
// textuel contains/contained-in, casse ignorée — P3 v1, aucun embedding).
type OuvrageSuggestion struct {
	Ouvrage       *Ouvrage `json:"ouvrage"`
	Score         int      `json:"score"`
	ThemesCommuns []string `json:"themesCommuns"`
	DejaAligne    bool     `json:"dejaAligne"`
}

// AlignementMateriau — matières premières du retrieval (repo → usecase) :
// l'usecase calcule le scoring (métier), le repo collecte (données).
type AlignementMateriau struct {
	NomFichier      string     // Document.nomFichier (fiche + bibliographie)
	OwnerID         string     // Document.ownerId (gating enseignant)
	EtablissementID string     // etab du propriétaire (catalogue ouvrages)
	ThemesSupport   []string   // Document.themesDetectes (titres de chapitres)
	SujetsSupport   []string   // Chapter.sujets concaténés (mots-clés)
	Ouvrages        []*Ouvrage // visibles pour l'étab du propriétaire
	DejaAligneIDs   []string   // ouvrageId déjà déclarés pour CE support
}

// ConformiteEpreuve — conformité d'une épreuve qui évalue un support :
// % de questions (issues du support) rattachées à un chapitre (P2.5) dont
// un sujet recoupe un thème d'un référentiel officiel aligné au support.
type ConformiteEpreuve struct {
	EpreuveID            string `json:"epreuveId"`
	Titre                string `json:"titre"`
	NbQuestions          int    `json:"nbQuestions"`
	NbQuestionsConformes int    `json:"nbQuestionsConformes"`
	TauxConformite       int    `json:"tauxConformite"`
}

// ConformiteSupport — ligne d'audit de direction (« le cours de M. X couvre
// N % du référentiel officiel »). Miroir de la sortie SQL
// conformite_referentiels_etablissement (000126).
type ConformiteSupport struct {
	DocumentID               string              `json:"documentId"`
	NomFichier               string              `json:"nomFichier"`
	Enseignant               string              `json:"enseignant"`
	UECode                   *string             `json:"ueCode,omitempty"`
	NbChapitres              int                 `json:"nbChapitres"`
	NbQuestions              int                 `json:"nbQuestions"`
	NbQuestionsAlignees      int                 `json:"nbQuestionsAlignees"`
	NbAlignements            int                 `json:"nbAlignements"`
	NbAlignementsReferentiel int                 `json:"nbAlignementsReferentiel"`
	TauxCouverture           int                 `json:"tauxCouverture"`
	DernierAlignementAt      *time.Time          `json:"dernierAlignementAt,omitempty"`
	Epreuves                 []ConformiteEpreuve `json:"epreuves"`
}

// BibliographieReference — une référence générée depuis les alignements
// (fiche du support, exportable — ADR-0007 §P3 flux 3).
type BibliographieReference struct {
	AlignementID string          `json:"alignementId"`
	Note         *string         `json:"note,omitempty"`
	Ouvrage      *Ouvrage        `json:"ouvrage"`
	Section      *OuvrageSection `json:"section,omitempty"`
	CreeLe       time.Time       `json:"creeLe"`
}

// BibliographieResult — GET /api/documents/{id}/bibliographie.
type BibliographieResult struct {
	DocumentID string                   `json:"documentId"`
	NomFichier string                   `json:"nomFichier"`
	References []BibliographieReference `json:"references"`
}

// AlignementRepository interface (000126).
type AlignementRepository interface {
	// ListByDocument — déclarations d'un support + ouvrage + section
	// (RLS : EXISTS sur les DEUX parents, etab-scoped).
	ListByDocument(ctx context.Context, documentID string) ([]*AlignementOuvrage, error)
	// Create — owner ENS (policy insert : ownerId = current_user_id() OU
	// admin/system ; ouvrage visible). 23505 → doublon, 23503/42501 → refs.
	Create(ctx context.Context, documentID string, input CreateAlignementInput, declareParID string) (*AlignementOuvrage, error)
	// Delete — owner/admin (policy delete). 0 ligne → NotFound.
	Delete(ctx context.Context, documentID, alignementID string) error
	// MateriauPourSuggestions — collecte pour le retrieval (usecase score).
	MateriauPourSuggestions(ctx context.Context, documentID string) (*AlignementMateriau, error)
	// ConformiteEtablissement — appel de la fonction SECURITY DEFINER
	// conformite_referentiels_etablissement (cloisonnée rôle+etab en SQL ;
	// le usecase double-vérifie, defense in depth pattern 000124).
	ConformiteEtablissement(ctx context.Context, etablissementID string) ([]*ConformiteSupport, error)
}
