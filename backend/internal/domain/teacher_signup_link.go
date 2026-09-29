// Package domain — entité TeacherSignupLink + ports (SECT-TEACHER-REG-LINK-1).
//
// Réplication du pattern StudentSignupLink (SECT-REG-LINK-B2C-MVP-1) pour la
// page /enseignants : un RESPONSABLE génère un lien d'inscription self-service
// enseignant, le partage (WhatsApp, QR code projeté), les enseignants
// s'auto-onboardent via /inscription-enseignant?token=xxx.
//
// Différences vs StudentSignupLink :
//   - Rôle forcé ENSEIGNANT (créé via la fonction SQL accept_teacher_signup)
//   - PAS de filiereId/niveau pré-assignés (les affectations filières se gèrent
//     APRÈS embauche via /api/affectations par le RESPONSABLE)
//   - PAS de requireMatricule (les enseignants n'ont pas de matricule)
//   - Création réservée RESPONSABLE/ADMIN (un ENSEIGNANT ne peut pas inviter
//     d'autres enseignants — cohérent avec POST /api/invitations)
//
// Schéma DB (migration 000107) :
//
//	"id"             text PK
//	"token"          text UNIQUE NOT NULL
//	"etablissementId" text NOT NULL → Etablissement (CASCADE)
//	"createdById"    text NOT NULL → User (CASCADE)
//	"expiresAt"      timestamp NOT NULL
//	"maxUses"        int NULL (NULL = illimité)
//	"useCount"       int NOT NULL DEFAULT 0
//	"actif"          boolean NOT NULL DEFAULT true
//	"label"          text NULL
//	"emailDomainRestriction" text NULL (B2B)
//	"customWelcomeMessage"   text NULL (email de bienvenue)
//	"expiryReminderSent"     boolean NOT NULL DEFAULT false (worker)
//	"createdAt"      timestamp NOT NULL
//	"updatedAt"      timestamp NOT NULL
//	"deletedAt"      timestamp NULL
//
// RLS policies (TeacherSignupLink_select / _insert / _update / _delete) :
// select : owner OR is_responsable same-etab OR is_admin() ;
// insert : is_responsable same-etab OR is_admin() (PAS les ENSEIGNANT) ;
// update/delete : owner OR is_responsable same-etab OR is_admin().
//
// Fonctions SQL SECURITY DEFINER (bypass RLS car le token EST l'auth sur les
// endpoints publics /verify et /complete) :
//   - find_teacher_signup_link_by_token(p_token) — retourne 17 colonnes
//   - accept_teacher_signup(p_token, p_email, p_password, p_name) — 6 colonnes
//   - expire_teacher_signup_links() — worker
//   - log_teacher_registration_event(...) — audit (TeacherRegistrationEvent)
package domain

import (
	"context"
	"time"
)

// TeacherSignupLink représente une ligne de la table "TeacherSignupLink".
type TeacherSignupLink struct {
	ID              string    `json:"id"`
	Token           string    `json:"token"`
	EtablissementID string    `json:"etablissementId"`
	CreatedByID     string    `json:"createdById"`
	ExpiresAt       time.Time `json:"expiresAt"`
	MaxUses         *int      `json:"maxUses,omitempty"` // nil = illimité
	UseCount        int       `json:"useCount"`
	Actif           bool      `json:"actif"`
	Label           *string   `json:"label,omitempty"`
	// B2B — restriction de domaine email optionnelle (ex: "univ-ci.edu").
	// nil/empty = pas de restriction. Normalisé lower + trim + sans '@' initial
	// côté usecase. Vérifié defense in depth : usecase + SQL atomique.
	EmailDomainRestriction *string `json:"emailDomainRestriction,omitempty"`
	// Message personnalisé du créateur injecté dans l'email de bienvenue
	// envoyé à l'enseignant. nil/empty = pas de message. Max 500 chars.
	// HTML-échappé dans le template.
	CustomWelcomeMessage *string `json:"customWelcomeMessage,omitempty"`
	// Flag anti-spam pour le worker de reminder 24h (une seule relance par lien).
	// Jamais exposé au frontend (json:"-").
	ExpiryReminderSent bool      `json:"-"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
	// Relations (peuplées par FindByToken pour le frontend).
	// NB : ne jamais exposer createdById brut dans les endpoints publics
	// (uniquement creatorName via la relation Creator).
	Etablissement *EtablissementRef `json:"etablissement,omitempty"`
	Creator       *UserRef          `json:"creator,omitempty"`
}

// CreateTeacherSignupLinkInput — body du POST /api/teacher-signup-links.
//
// Token + ExpiresAt sont générés par le usecase (crypto/rand + now+TTL) et
// passés au repo séparément (paramètre `token`). CreatedByID + EtablissementID
// sont TOUJOURS forcés depuis les claims JWT côté usecase (le body du client
// est ignoré pour sécurité).
type CreateTeacherSignupLinkInput struct {
	EtablissementID string // forcé = claims.EtablissementID côté usecase
	CreatedByID     string // forcé = claims.UserID côté usecase
	ExpiresAt       time.Time
	MaxUses         *int    // nil = illimité
	Label           *string // optionnel (ex: "Vacataires Maths 2026")
	// B2B — restriction de domaine email. nil/empty = pas de restriction.
	// Sinon doit matcher ^[a-zA-Z0-9.-]+$ (validé/normalisé côté usecase).
	EmailDomainRestriction *string
	// Message personnalisé du créateur injecté dans l'email de bienvenue
	// enseignant. Optionnel (nil = pas de message). Trim + max 500 chars.
	CustomWelcomeMessage *string
	// Durée de validité personnalisée demandée par le créateur (en heures).
	// nil = TTL par défaut (30 jours). Validé [1h, 8760h] côté usecase.
	ExpiresInHours *int
}

// AcceptTeacherSignupResult — résultat de la fonction SQL accept_teacher_signup.
//
// Les pointeurs sont nil si la colonne SQL correspondante est NULL (cas
// d'erreur : NOT_FOUND / INACTIVE / EXPIRED / QUOTA_EXCEEDED / USER_EXISTS /
// DOMAIN_NOT_ALLOWED).
type AcceptTeacherSignupResult struct {
	Code             string // OK|NOT_FOUND|INACTIVE|EXPIRED|QUOTA_EXCEEDED|USER_EXISTS|DOMAIN_NOT_ALLOWED
	UserID           *string
	UserEmail        *string
	UserName         *string
	EtablissementNom *string
	Message          string
}

// TeacherSignupLinkRepository définit l'interface d'accès à la table
// "TeacherSignupLink".
//
// Méthodes RLS-on (claims requises via db.WithTx) :
//   - Create, ListByCreator, Revoke
//
// Méthodes RLS-off (token = auth, endpoints publics verify + accept) :
//   - FindByToken (SECURITY DEFINER find_teacher_signup_link_by_token)
//   - AcceptSignup (SECURITY DEFINER accept_teacher_signup)
type TeacherSignupLinkRepository interface {
	// Create insère un nouveau lien (RLS via claims — TeacherSignupLink_insert).
	Create(ctx context.Context, input CreateTeacherSignupLinkInput, token string) (*TeacherSignupLink, error)

	// FindByToken récupère un lien par token (bypass RLS — endpoint public).
	// Retourne nil + NotFoundError si introuvable.
	FindByToken(ctx context.Context, token string) (*TeacherSignupLink, error)

	// ListByCreator liste les liens non supprimés d'un créateur (RLS via claims).
	ListByCreator(ctx context.Context, creatorID string) ([]TeacherSignupLink, error)

	// Revoke effectue un soft-delete : actif=false + deletedAt=now (RLS via claims).
	// Idempotent (ne retourne pas d'erreur si déjà supprimé).
	Revoke(ctx context.Context, id string) error

	// AcceptSignup appelle la fonction SQL accept_teacher_signup (bypass RLS —
	// endpoint public). Crée le User ENSEIGNANT + incrémente useCount atomiquement.
	AcceptSignup(ctx context.Context, token, email, hashedPassword, name string) (*AcceptTeacherSignupResult, error)

	// Log d'audit des tentatives d'inscription (succès + échec). Appelle la
	// fonction SECURITY DEFINER log_teacher_registration_event pour bypass RLS
	// sur INSERT dans "TeacherRegistrationEvent". Non bloquant côté usecase.
	LogRegistrationEvent(ctx context.Context, linkID, userID, email, ip, userAgent string, success bool, code string) error

	// Marque le flag expiryReminderSent=true après envoi de l'email de reminder
	// 24h. Idempotent — si l'update échoue, le worker réessaie au prochain tick.
	MarkReminderSent(ctx context.Context, linkID string) error
}

// ──────────────────────────────────────────────────────────────────────────
// Stats agrégées — types pour GET /api/teacher-signup-links/stats.
// (Même structure que StudentSignupLinkStats — scoping RLS identique.)
// ──────────────────────────────────────────────────────────────────────────

// TeacherSignupLinkStats — agrégats retournés par GET /api/teacher-signup-links/stats.
//
// Scoping RLS :
//   - RESPONSABLE : tous les liens de son établissement.
//   - ADMIN : tous les liens (pas de filtre).
type TeacherSignupLinkStats struct {
	Total            int                 `json:"total"`
	Active           int                 `json:"active"`
	Expired          int                 `json:"expired"`
	Revoked          int                 `json:"revoked"`
	TotalUses        int                 `json:"totalUses"`
	ExpiringSoon     int                 `json:"expiringSoon"`
	SuccessCount     int                 `json:"successCount"`
	FailureCount     int                 `json:"failureCount"`
	TopLinks         []TopLinkStat       `json:"topLinks"`
	DailyCreations   []DailyCreationStat `json:"dailyCreations"`
	FailureBreakdown map[string]int      `json:"failureBreakdown"`
}
