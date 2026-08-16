// Package domain — entité Invitation + ports (E1-INVITATIONS).
//
// Une Invitation représente un lien à usage unique permettant à un futur
// utilisateur (ETUDIANT / ENSEIGNANT / RESPONSABLE) de créer son compte
// lui-même via /api/invitations/accept. Le token (32 chars hex) sert
// d'authentification : verify/accept sont des endpoints publics (pas de
// RequireAuth) ; la RLS est désactivée pour ces deux opérations car le
// token est l'auth.
package domain

import (
        "context"
        "time"
)

// Invitation représente une ligne de la table "Invitation".
//
// Schéma DB (PascalCase) — NE PAS modifier (déjà en production Neon) :
//   id, token, email, role, name, etablissementId, filiereId, expiresAt,
//   used, usedAt, createdById, createdAt.
//
// RLS policies existantes (Invitation_select / Invitation_modify) gèrent
// le scoping : creator OR responsable same-etab OR admin.
type Invitation struct {
        ID              string     `json:"id"`
        Token           string     `json:"token"`
        Email           string     `json:"email"`
        Role            Role       `json:"role"`
        Name            *string    `json:"name,omitempty"`
        EtablissementID *string    `json:"etablissementId,omitempty"`
        FiliereID       *string    `json:"filiereId,omitempty"`
        ExpiresAt       time.Time  `json:"expiresAt"`
        Used            bool       `json:"used"`
        UsedAt          *time.Time `json:"usedAt,omitempty"`
        CreatedByID     string     `json:"createdById"`
        CreatedAt       time.Time  `json:"createdAt"`
        // Relations (peuplées par List / FindByID pour le frontend)
        // NB : clés PascalCase pour matcher le contrat frontend (InvitationItem).
        Etablissement *EtablissementRef `json:"Etablissement,omitempty"`
        Filiere       *FiliereRef       `json:"Filiere,omitempty"`
        // Relations verify (clés lowercase pour matcher InvitationData côté frontend)
        VerifyEtablissement *InvitationVerifyEtablissement `json:"etablissement,omitempty"`
        VerifyFiliere       *InvitationVerifyFiliere       `json:"filiere,omitempty"`
        VerifyCreatedBy     *InvitationVerifyCreatedBy     `json:"createdBy,omitempty"`
}

// InvitationVerifyEtablissement est la projection Etablissement attendue par
// /api/invitations/verify (frontend accept-invitation-page.tsx InvitationData).
type InvitationVerifyEtablissement struct {
        Nom   string  `json:"nom"`
        Ville *string `json:"ville,omitempty"`
}

// InvitationVerifyFiliere est la projection Filiere attendue par verify.
type InvitationVerifyFiliere struct {
        Nom  string  `json:"nom"`
        Code *string `json:"code,omitempty"`
}

// InvitationVerifyCreatedBy est la projection du créateur attendue par verify.
type InvitationVerifyCreatedBy struct {
        Name string `json:"name"`
}

// InvitationListParams — filtres du GET /api/invitations.
type InvitationListParams struct {
        CreatedByID string
        Used        *bool
        Role        string
        Limit       int
}

// CreateInvitationInput — body du POST /api/invitations.
//
// Token + ExpiresAt sont générés par le usecase (crypto/rand + now+7j) et
// passés au repo. CreatedByID est toujours = claims.UserID (le body du
// client est ignoré pour sécurité).
type CreateInvitationInput struct {
        Email           string
        Role            Role
        Name            *string
        FiliereID       *string
        EtablissementID *string
        CreatedByID     string
        Token           string    // 32 chars hex (généré par le usecase)
        ExpiresAt       time.Time // now + 7 jours (généré par le usecase)
}

// AcceptInvitationInput — body du POST /api/invitations/accept (PUBLIC).
type AcceptInvitationInput struct {
        Token    string
        Password string // déjà hashé par le usecase avant d'atteindre le repo
        Name     string
}

// InvitationRepository définit l'interface d'accès à la table "Invitation".
//
// Méthodes RLS-on (claims requises via db.WithTx) :
//   - FindByID, List, Update, Delete
//
// Méthodes RLS-off (token = auth, endpoints publics verify/accept) :
//   - FindByToken, MarkUsed, AcceptInvitation, UserExistsByEmail
type InvitationRepository interface {
        // FindByID récupère une invitation par ID (RLS via claims).
        FindByID(ctx context.Context, id string) (*Invitation, error)

        // FindByToken récupère une invitation par token (bypass RLS — endpoint public).
        // Retourne nil + NotFoundError si introuvable.
        FindByToken(ctx context.Context, token string) (*Invitation, error)

        // List liste les invitations (RLS via claims). Peuple Etablissement + Filiere.
        List(ctx context.Context, params InvitationListParams) ([]*Invitation, error)

        // Create insère une nouvelle invitation (RLS via claims — Invitation_modify).
        Create(ctx context.Context, input CreateInvitationInput) (*Invitation, error)

        // Update met à jour une invitation — utilisé par "renvoyer" pour régénérer
        // token + expiresAt + reset used/usedAt (RLS via claims — Invitation_modify).
        Update(ctx context.Context, id string, input UpdateInvitationInput) (*Invitation, error)

        // Delete supprime une invitation (hard delete, RLS via claims — Invitation_modify).
        Delete(ctx context.Context, id string) error

        // MarkUsed marque une invitation comme utilisée (used=true, usedAt=now).
        // Bypass RLS — appelé par le endpoint public /accept dans la même tx que
        // la création du User.
        MarkUsed(ctx context.Context, id string, usedAt time.Time) error

        // UserExistsByEmail vérifie si un User avec cet email existe déjà.
        // Bypass RLS — appelé par le endpoint public /verify.
        UserExistsByEmail(ctx context.Context, email string) (bool, error)

        // AcceptInvitation crée le User + marque l'invitation comme utilisée en une
        // seule transaction (bypass RLS — endpoint public /accept). Si role=ETUDIANT,
        // génère un matricule séquentiel au format FIL/LJ/YY/NNN.
        AcceptInvitation(ctx context.Context, invitation *Invitation, input AcceptInvitationInput) (*User, error)
}

// UpdateInvitationInput — partial update (utilisé par "renvoyer").
type UpdateInvitationInput struct {
        Token     *string
        ExpiresAt *time.Time
        Used      *bool
        UsedAt    *time.Time
}

// InvitationStateError indique qu'une invitation ne peut pas être utilisée
// parce qu'elle est déjà utilisée / expirée / ou l'email correspond à un
// compte User déjà existant. Le handler /verify et /accept l'utilise pour
// retourner le code métier attendu par le frontend (ALREADY_USED, EXPIRED,
// USER_EXISTS, NOT_FOUND).
type InvitationStateError struct {
        Code    string // "ALREADY_USED" | "EXPIRED" | "USER_EXISTS" | "NOT_FOUND"
        Message string
}

func (e *InvitationStateError) Error() string { return e.Message }
