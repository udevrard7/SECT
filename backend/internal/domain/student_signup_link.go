// Package domain — entité StudentSignupLink + ports (SECT-REG-LINK-B2C-MVP-1).
//
// Un StudentSignupLink représente un lien d'inscription self-service pour les
// étudiants B2C (et B2B). Contrairement à Invitation (qui cible un email précis
// pour un rôle arbitraire), un StudentSignupLink :
//   - ne requiert pas d'email à la génération (l'étudiant saisit le sien au moment
//     de l'inscription),
//   - force le rôle ETUDIANT (créé via la fonction SQL accept_student_signup),
//   - pré-assigne étab/filière/niveau depuis le créateur,
//   - supporte maxUses (NULL = illimité) pour usage multiple (WhatsApp, QR code
//     projeté en amphi, etc.),
//   - a une TTL de 30 jours (vs 7j pour Invitation — pas d'email, partage manuel).
//
// Schéma DB (migration 000079 — déjà appliquée en production Neon) :
//
//      "id"             text PK
//      "token"          text UNIQUE NOT NULL
//      "etablissementId" text NOT NULL → Etablissement (CASCADE)
//      "filiereId"      text NULLABLE → Filiere (SET NULL)
//      "niveau"         NiveauEtude NULLABLE
//      "createdById"    text NOT NULL → User (CASCADE)
//      "expiresAt"      timestamp NOT NULL
//      "maxUses"        int NULL (NULL = illimité)
//      "useCount"       int NOT NULL DEFAULT 0
//      "actif"          boolean NOT NULL DEFAULT true
//      "label"          text NULL
//      "createdAt"      timestamp NOT NULL
//      "updatedAt"      timestamp NOT NULL
//      "deletedAt"      timestamp NULL
//
// RLS policies (StudentSignupLink_select / _insert / _update / _delete) gèrent
// le scoping : owner OR is_responsable same-etab OR is_admin() ; insert exige
// is_responsable OR is_enseignant_in_personal_etab OR is_admin().
//
// Deux fonctions SQL SECURITY DEFINER (bypass RLS car le token EST l'auth sur
// les endpoints publics /verify et /complete) :
//   - find_student_signup_link_by_token(p_token) — retourne 18 colonnes
//   - accept_student_signup(p_token, p_email, p_password, p_name) — retourne 8 colonnes
package domain

import (
        "context"
        "time"
)

// StudentSignupLink représente une ligne de la table "StudentSignupLink".
type StudentSignupLink struct {
        ID              string     `json:"id"`
        Token           string     `json:"token"`
        EtablissementID string     `json:"etablissementId"`
        FiliereID       *string    `json:"filiereId,omitempty"`
        Niveau          *string    `json:"niveau,omitempty"` // "L1"|"L2"|"L3"|"M1"|"M2"|"DOCTORAT"
        CreatedByID     string     `json:"createdById"`
        ExpiresAt       time.Time  `json:"expiresAt"`
        MaxUses         *int       `json:"maxUses,omitempty"` // nil = illimité
        UseCount        int        `json:"useCount"`
        Actif           bool       `json:"actif"`
        Label           *string    `json:"label,omitempty"`
        // SECT-REG-LINK-PHASE2-BACKEND-1 : restriction de domaine email optionnelle
        // (B2B — ex: "univ-ci.edu" pour n'accepter que les emails @univ-ci.edu).
        // nil/empty = pas de restriction. Normalisé lower + trim + sans '@' initial côté usecase.
        EmailDomainRestriction *string `json:"emailDomainRestriction,omitempty"`
        // SECT-REG-LINK-PHASE3-BACKEND-1 : flag anti-spam pour le worker de reminder 24h.
        // Mis à true après envoi de l'email de relance "expire dans 24h" (une seule
        // relance par lien — évite le spam si le worker tourne plusieurs fois dans
        // la fenêtre 24h). Reset implicite à la création (DEFAULT false côté DB).
        ExpiryReminderSent bool `json:"-"`
        // SECT-REG-LINK-PHASE3-BACKEND-1 : message personnalisé du créateur injecté
        // dans l'email de bienvenue envoyé à l'étudiant (ex: "Bienvenue en L1 Info,
        // pensez à apporter votre laptop le premier jour"). nil/empty = pas de message.
        // Max 500 chars (validé côté usecase). HTML-échappé dans le template.
        CustomWelcomeMessage *string `json:"customWelcomeMessage,omitempty"`
        CreatedAt              time.Time `json:"createdAt"`
        UpdatedAt              time.Time `json:"updatedAt"`
        // Relations (peuplées par FindByToken / ListByCreator pour le frontend).
        // NB : ne jamais exposer createdById brut dans les endpoints publics (uniquement
        // creatorName via la relation Creator). Sécurité : anti-énumération de users.
        Etablissement *EtablissementRef `json:"etablissement,omitempty"`
        Filiere       *FiliereRef       `json:"filiere,omitempty"`
        Creator       *UserRef          `json:"creator,omitempty"`
}

// CreateStudentSignupLinkInput — body du POST /api/student-signup-links.
//
// Token + ExpiresAt sont générés par le usecase (crypto/rand + now+TTL) et
// passés au repo séparément (paramètre `token`). CreatedByID + EtablissementID
// sont TOUJOURS forcés depuis les claims JWT côté usecase (le body du client est
// ignoré pour sécurité — on ne fait jamais confiance au client pour l'identité
// du créateur ni le rattachement à un étab).
type CreateStudentSignupLinkInput struct {
        EtablissementID string  // forcé = claims.EtablissementID côté usecase
        FiliereID       *string // optionnel ; nil pour un prof B2C (étab PERSONNEL)
        Niveau          *string // optionnel
        CreatedByID     string  // forcé = claims.UserID côté usecase
        ExpiresAt       time.Time
        MaxUses         *int    // nil = illimité
        Label           *string // optionnel (ex: "Promo L1 2026")
        // SECT-REG-LINK-PHASE2-BACKEND-1 : restriction de domaine email (B2B).
        // nil/empty = pas de restriction. Sinon doit matcher ^[a-zA-Z0-9.-]+$
        // (validé/normalisé côté usecase). Stocké tel quel en DB (text).
        EmailDomainRestriction *string
        // SECT-REG-LINK-PHASE3-BACKEND-1 : message personnalisé du créateur
        // injecté dans l'email de bienvenue étudiant. Optionnel (nil = pas de message).
        // Trim + max 500 chars côté usecase. HTML-échappé dans le template.
        CustomWelcomeMessage *string
        // SECT-REG-LINK-VALIDITY-1 : durée de validité personnalisée demandée par le
        // créateur (en heures). nil = utiliser le TTL par défaut (30 jours). Le usecase
        // valide la plage [signupLinkMinTTLHours, signupLinkMaxTTLHours] puis calcule
        // ExpiresAt = now + ExpiresInHours. Permet au créateur d'ajuster la validité
        // du lien selon le contexte (promo courte, cours d'été, lien permanent, etc.).
        ExpiresInHours *int
}

// AcceptSignupResult — résultat de la fonction SQL accept_student_signup.
//
// Les pointeurs sont nil si la colonne SQL correspondante est NULL (cas d'erreur :
// NOT_FOUND / INACTIVE / EXPIRED / QUOTA_EXCEEDED / USER_EXISTS / DOMAIN_NOT_ALLOWED).
type AcceptSignupResult struct {
        Code             string  // OK|NOT_FOUND|INACTIVE|EXPIRED|QUOTA_EXCEEDED|USER_EXISTS|DOMAIN_NOT_ALLOWED
        UserID           *string
        UserEmail        *string
        UserName         *string
        UserMatricule    *string
        EtablissementNom *string
        FiliereNom       *string
        Message          string
}

// StudentSignupLinkRepository définit l'interface d'accès à la table
// "StudentSignupLink".
//
// Méthodes RLS-on (claims requises via db.WithTx) :
//   - Create, ListByCreator, Revoke
//
// Méthodes RLS-off (token = auth, endpoints publics verify + accept) :
//   - FindByToken (fonction SECURITY DEFINER find_student_signup_link_by_token)
//   - AcceptSignup (fonction SECURITY DEFINER accept_student_signup)
type StudentSignupLinkRepository interface {
        // Create insère un nouveau lien (RLS via claims — StudentSignupLink_insert).
        Create(ctx context.Context, input CreateStudentSignupLinkInput, token string) (*StudentSignupLink, error)

        // FindByToken récupère un lien par token (bypass RLS — endpoint public).
        // Retourne nil + NotFoundError si introuvable.
        FindByToken(ctx context.Context, token string) (*StudentSignupLink, error)

        // ListByCreator liste les liens non supprimés d'un créateur (RLS via claims).
        ListByCreator(ctx context.Context, creatorID string) ([]StudentSignupLink, error)

        // Revoke effectue un soft-delete : actif=false + deletedAt=now (RLS via claims).
        // Idempotent (ne retourne pas d'erreur si déjà supprimé).
        Revoke(ctx context.Context, id string) error

        // AcceptSignup appelle la fonction SQL accept_student_signup (bypass RLS —
        // endpoint public). Crée le User ETUDIANT + incrémente useCount atomiquement.
        AcceptSignup(ctx context.Context, token, email, hashedPassword, name string) (*AcceptSignupResult, error)

        // SECT-REG-LINK-PHASE2-BACKEND-1 : log d'audit des tentatives d'inscription
        // (succès + échec). Appelle la fonction SECURITY DEFINER log_registration_event
        // pour bypass RLS sur INSERT dans "RegistrationEvent" (les clients ne peuvent
        // pas écrire directement dans cette table). Non bloquant côté usecase.
        LogRegistrationEvent(ctx context.Context, linkID, userID, email, ip, userAgent string, success bool, code string) error

        // SECT-REG-LINK-PHASE3-BACKEND-1 : marque le flag expiryReminderSent=true
        // après envoi de l'email de reminder 24h. Idempotent — si l'update échoue,
        // le worker réessaie au prochain tick (acceptable).
        MarkReminderSent(ctx context.Context, linkID string) error
}

// SignupLinkStateError indique qu'un lien ne peut pas être utilisé (introuvable,
// inactif, expiré, quota atteint, domaine non autorisé, ou compte déjà existant).
// Le handler /verify et /accept l'utilise pour retourner le code métier attendu
// par le frontend.
type SignupLinkStateError struct {
        Code    string // "NOT_FOUND"|"INACTIVE"|"EXPIRED"|"QUOTA_EXCEEDED"|"DOMAIN_NOT_ALLOWED"|"USER_EXISTS"|"TURNSTILE_FAILED"
        Message string
}

func (e *SignupLinkStateError) Error() string { return e.Message }

// ──────────────────────────────────────────────────────────────────────────
// SECT-REG-LINK-PHASE3-BACKEND-1 — types pour le endpoint de stats agrégées.
// ──────────────────────────────────────────────────────────────────────────

// StudentSignupLinkStats — agrégats retournés par GET /api/student-signup-links/stats.
//
// Scoping RLS :
//   - ENSEIGNANT : uniquement ses propres liens (createdById = claims.UserID).
//   - RESPONSABLE : tous les liens de son établissement (etablissementId = claims.EtablissementID).
//   - ADMIN : tous les liens (pas de filtre).
//
// Les compteurs sont calculés via une transaction RLS-aware (db.WithTx) — les
// queries COUNT(*) sont automatiquement filtrées par la policy StudentSignupLink_select.
type StudentSignupLinkStats struct {
        Total            int            `json:"total"`
        Active           int            `json:"active"`           // actif=true AND expiresAt > now AND deletedAt IS NULL
        Expired          int            `json:"expired"`          // actif=false (auto-expire) OR expiresAt < now
        Revoked          int            `json:"revoked"`          // deletedAt != NULL (soft-delete manuel)
        TotalUses        int            `json:"totalUses"`        // somme des useCount
        ExpiringSoon     int            `json:"expiringSoon"`     // expiresAt < now + 24h AND actif=true
        SuccessCount     int            `json:"successCount"`     // RegistrationEvent success=true
        FailureCount     int            `json:"failureCount"`     // RegistrationEvent success=false
        TopLinks         []TopLinkStat  `json:"topLinks"`         // top 5 by useCount
        DailyCreations   []DailyCreationStat `json:"dailyCreations"` // last 30 days
        FailureBreakdown map[string]int `json:"failureBreakdown"` // count by code (DOMAIN_NOT_ALLOWED, QUOTA_EXCEEDED, ...)
}

// TopLinkStat — un des top 5 liens par useCount.
type TopLinkStat struct {
        ID        string `json:"id"`
        Label     string `json:"label"`     // "Sans libellé" si NULL
        UseCount  int    `json:"useCount"`
        MaxUses   *int   `json:"maxUses,omitempty"`
        ExpiresAt string `json:"expiresAt"` // ISO 8601
        Actif     bool   `json:"actif"`
}

// DailyCreationStat — nombre de liens créés par jour (YYYY-MM-DD).
type DailyCreationStat struct {
        Day   string `json:"day"`   // YYYY-MM-DD
        Count int    `json:"count"`
}
