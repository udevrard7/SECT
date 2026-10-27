// Package http — SECT-NOTIF-STUDENT-1 : notifications étudiantes multi-canaux.
//
// Trois annonces pédagogiques fanoutées vers les ÉTUDIANTS concernés via le
// dispatcher central (in-app + SSE + web push + email + FCM + Instagram DM) :
//
//  1. EPREUVE_DISPONIBLE — une évaluation est disponible : publication
//     d'une épreuve (action « publier », BROUILLON → PLANIFIEE). Cible :
//     les étudiants actifs de la filière de l'épreuve (fallback :
//     établissement du publicateur si l'épreuve n'a pas de filière).
//
//  2. DOCUMENT_PUBLIE — un nouveau document (support de cours) est déposé
//     par un enseignant. Cible : les étudiants actifs de la filière de
//     l'UE rattachée au document (fallback : établissement).
//
//  3. OUVRAGE_PUBLIE — un nouvel ouvrage validé arrive en bibliothèque
//     (modération 000137 : la notification part à la VALIDATION
//     BROUILLON→VALIDE, pas au dépôt enseignant — un brouillon est
//     invisible des étudiants). Cible : les étudiants actifs de la
//     filière recommandée de l'ouvrage (fallback : établissement).
//
// Design (pattern fanoutSegmentNotification / promotion UC) :
//   - fire-and-forget : goroutine + context.Background() — la mutation
//     métier ne doit JAMAIS échouer ni être retardée par une notification ;
//   - lecture des destinataires via claims système (bypass RLS, service) ;
//   - Dispatch par étudiant : le dispatcher décide des canaux selon les
//     préférences (pushEnabled / emailEnabled / instagramEnabled) et la
//     disponibilité (handle Instagram renseigné, VAPID, FCM, mailer).
package http

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/emailtpl"
	"github.com/udevrard7/sect/backend/internal/notification"
)

// notifyStudentsOfFiliere — fanout d'une annonce vers les étudiants actifs
// d'une filière (fallback établissement si la filière est inconnue/absente).
// buildEvent reçoit le nom de l'étudiant (personnalisation email/DM) et
// retourne l'Event complet (Type/Titre/Message/Email/…) ; le UserID est
// écrasé par le destinataire. Fire-and-forget : les callers lancent cette
// méthode en goroutine (elle vit sa propre vie après la réponse HTTP).
func (s *Server) notifyStudentsOfFiliere(filiereID *string, etablissementID string, buildEvent func(name string) notification.Event) {
	if s.notifDispatcher == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	query := `SELECT u."id", u."name"
	          FROM "User" u
	          WHERE u."role" = 'ETUDIANT' AND u."actif" = true AND u."deletedAt" IS NULL`
	var args []any
	if filiereID != nil && *filiereID != "" {
		query += ` AND u."filiereId" = $1`
		args = append(args, *filiereID)
	} else if etablissementID != "" {
		query += ` AND u."etablissementId" = $1`
		args = append(args, etablissementID)
	} else {
		return // ni filière ni établissement → aucune cible déterminable
	}

	type rcpt struct{ userID, name string }
	var recipients []rcpt
	err := appdb.WithSystemTx(ctx, s.dbPool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r rcpt
			if err := rows.Scan(&r.userID, &r.name); err != nil {
				continue
			}
			recipients = append(recipients, r)
		}
		return rows.Err()
	})
	if err != nil {
		slog.Warn("notifyStudentsOfFiliere: query failed", "error", err)
		return
	}

	count := 0
	for _, r := range recipients {
		event := buildEvent(r.name)
		event.UserID = r.userID
		s.notifDispatcher.Dispatch(ctx, event)
		count++
	}
	slog.Info("student announcement fanout completed",
		"filiereId", derefStr(filiereID), "etablissementId", etablissementID, "recipients", count)
}

// ──────────────────────────────────────────────────────────────────────
// 1. EPREUVE_DISPONIBLE — publication d'une évaluation (action publier).
// ──────────────────────────────────────────────────────────────────────

// notifyEvaluationPublished fanoute l'annonce « une évaluation est
// disponible » aux étudiants de la filière de l'épreuve. Appelé par le
// handler updateEpreuve quand l'action « publier » réussit (BROUILLON →
// PLANIFIEE). Fire-and-forget.
func (s *Server) notifyEvaluationPublished(claims appdb.SessionClaims, e *domain.Epreuve) {
	if e == nil {
		return
	}
	titre := strings.TrimSpace(e.Titre)
	if titre == "" {
		titre = "Évaluation sans titre"
	}
	fenetre := formatFenetreFR(e.DateDebut, e.DateFin)
	filiereNom := s.filiereName(derefStr(e.FiliereID))

	go s.notifyStudentsOfFiliere(e.FiliereID, claims.EtablissementID, func(name string) notification.Event {
		data := emailtpl.StudentAnnouncementData{
			EmailData:   emailtpl.DefaultData(name, s.appBaseURL),
			Titre:       "Une évaluation est disponible",
			Intro:       "une nouvelle évaluation vient d'être publiée sur SECT et vous êtes concerné(e).",
			ActionLabel: "Voir mes épreuves",
			ActionPath:  "/mes-epreuves",
		}
		data.Details = [][2]string{
			{"Évaluation", titre},
			{"Durée", fmt.Sprintf("%d minutes", e.Duree)},
			{"Fenêtre de passation", fenetre},
		}
		if filiereNom != "" {
			data.Details = append(data.Details, [2]string{"Filière", filiereNom})
		}
		if e.Niveau != nil && *e.Niveau != "" {
			data.Details = append(data.Details, [2]string{"Niveau", *e.Niveau})
		}

		return notification.Event{
			Type:      "EPREUVE_DISPONIBLE",
			Titre:     "Une évaluation est disponible",
			Message:   fmt.Sprintf("« %s » — %d min, du %s", titre, e.Duree, fenetre),
			Categorie: "evaluation",
			Priorite:  "info",
			ActionURL: "/mes-epreuves",
			Icone:     "FileCheck",
			FiliereID: derefStr(e.FiliereID),
			Email: &notification.EmailContent{
				Subject: emailtpl.StudentAnnouncementSubject(data),
				Body:    emailtpl.StudentAnnouncementText(data),
				HTML:    emailtpl.StudentAnnouncementHTML(data),
			},
		}
	})
}

// ──────────────────────────────────────────────────────────────────────
// 2. DOCUMENT_PUBLIE — dépôt d'un nouveau document (support de cours).
// ──────────────────────────────────────────────────────────────────────

// notifyDocumentPublished fanoute l'annonce « nouveau document » aux
// étudiants de la filière de l'UE rattachée. Appelé par le handler
// uploadDocument après le 201. Fire-and-forget.
func (s *Server) notifyDocumentPublished(claims appdb.SessionClaims, doc *domain.Document) {
	if doc == nil {
		return
	}
	// Résoudre l'UE (code, nom, filière) du document — lecture système,
	// une seule fois par annonce (pas par destinataire).
	var ueCode, ueNom, filiereID, filiereNom string
	if doc.UniteEnseignementID != nil && *doc.UniteEnseignementID != "" {
		_ = appdb.WithSystemTx(context.Background(), s.dbPool, func(tx pgx.Tx) error {
			return tx.QueryRow(context.Background(), `
				SELECT ue."code", COALESCE(ue."nom", ''), COALESCE(ue."filiereId", ''), COALESCE(f."nom", '')
				FROM "UniteEnseignement" ue
				LEFT JOIN "Filiere" f ON f."id" = ue."filiereId"
				WHERE ue."id" = $1`, *doc.UniteEnseignementID).
				Scan(&ueCode, &ueNom, &filiereID, &filiereNom)
		})
	}

	nomDoc := strings.TrimSpace(doc.NomFichier)
	if nomDoc == "" {
		nomDoc = "Support de cours"
	}
	ueLabel := ueCode
	if ueNom != "" {
		ueLabel = ueCode + " — " + ueNom
	}

	var filierePtr *string
	if filiereID != "" {
		filierePtr = &filiereID
	}

	go s.notifyStudentsOfFiliere(filierePtr, claims.EtablissementID, func(name string) notification.Event {
		data := emailtpl.StudentAnnouncementData{
			EmailData:   emailtpl.DefaultData(name, s.appBaseURL),
			Titre:       "Un nouveau document de cours est disponible",
			Intro:       "votre enseignant vient de déposer un nouveau support de cours sur SECT.",
			ActionLabel: "Réviser (préparation examens)",
			ActionPath:  "/exam-prep",
		}
		data.Details = [][2]string{{"Document", nomDoc}}
		if ueLabel != "" {
			data.Details = append(data.Details, [2]string{"Unité d'enseignement", ueLabel})
		}
		if filiereNom != "" {
			data.Details = append(data.Details, [2]string{"Filière", filiereNom})
		}

		return notification.Event{
			Type:      "DOCUMENT_PUBLIE",
			Titre:     "Un nouveau document de cours est disponible",
			Message:   nomDoc + suffixUE(ueLabel),
			Categorie: "pedagogique",
			Priorite:  "info",
			ActionURL: "/exam-prep",
			Icone:     "BookOpen",
			FiliereID: filiereID,
			Email: &notification.EmailContent{
				Subject: emailtpl.StudentAnnouncementSubject(data),
				Body:    emailtpl.StudentAnnouncementText(data),
				HTML:    emailtpl.StudentAnnouncementHTML(data),
			},
		}
	})
}

// suffixUE — suffixe lisible « (UE...) » pour le message in-app court.
func suffixUE(ueLabel string) string {
	if ueLabel == "" {
		return ""
	}
	return " (" + ueLabel + ")"
}

// ──────────────────────────────────────────────────────────────────────
// 3. OUVRAGE_PUBLIE — validation d'un ouvrage en bibliothèque.
// ──────────────────────────────────────────────────────────────────────

// notifyOuvragePublished fanoute l'annonce « nouvel ouvrage en
// bibliothèque » aux étudiants de la filière recommandée de l'ouvrage
// (fallback : établissement). Appelé par les handlers validerOuvrage et
// updateOuvrage (PATCH statut=VALIDE) UNIQUEMENT sur la transition
// BROUILLON→VALIDE — un dépôt BROUILLON est invisible des étudiants
// (000137), notifier à la validation uniquement évite les fausses annonces.
// Fire-and-forget.
func (s *Server) notifyOuvragePublished(claims appdb.SessionClaims, o *domain.Ouvrage) {
	if o == nil {
		return
	}
	titre := strings.TrimSpace(o.Titre)
	if titre == "" {
		titre = "Ouvrage sans titre"
	}
	auteurs := derefStr(o.Auteurs)
	filiereNom := s.filiereName(derefStr(o.FiliereID))

	go s.notifyStudentsOfFiliere(o.FiliereID, firstNonEmpty(o.EtablissementID, claims.EtablissementID), func(name string) notification.Event {
		data := emailtpl.StudentAnnouncementData{
			EmailData:   emailtpl.DefaultData(name, s.appBaseURL),
			Titre:       "Un nouvel ouvrage est disponible en bibliothèque",
			Intro:       "un nouvel ouvrage lié à votre filière vient d'être ajouté à la bibliothèque SECT.",
			ActionLabel: "Ouvrir la bibliothèque",
			ActionPath:  "/bibliotheque",
		}
		data.Details = [][2]string{{"Ouvrage", titre}}
		if auteurs != "" {
			data.Details = append(data.Details, [2]string{"Auteurs", auteurs})
		}
		if filiereNom != "" {
			data.Details = append(data.Details, [2]string{"Filière", filiereNom})
		}

		return notification.Event{
			Type:      "OUVRAGE_PUBLIE",
			Titre:     "Un nouvel ouvrage est disponible en bibliothèque",
			Message:   "« " + titre + " »" + suffixAuteurs(auteurs),
			Categorie: "pedagogique",
			Priorite:  "info",
			ActionURL: "/bibliotheque",
			Icone:     "Library",
			FiliereID: derefStr(o.FiliereID),
			Email: &notification.EmailContent{
				Subject: emailtpl.StudentAnnouncementSubject(data),
				Body:    emailtpl.StudentAnnouncementText(data),
				HTML:    emailtpl.StudentAnnouncementHTML(data),
			},
		}
	})
}

// suffixAuteurs — suffixe lisible « — Auteurs » pour le message court.
func suffixAuteurs(auteurs string) string {
	if auteurs == "" {
		return ""
	}
	return " — " + auteurs
}

// ──────────────────────────────────────────────────────────────────────
// Helpers communs
// ──────────────────────────────────────────────────────────────────────

// filiereName résout le nom d'une filière (lecture système — appelé une
// fois par annonce, pas par destinataire : pas besoin de cache).
func (s *Server) filiereName(filiereID string) string {
	if filiereID == "" {
		return ""
	}
	var nom string
	_ = appdb.WithSystemTx(context.Background(), s.dbPool, func(tx pgx.Tx) error {
		return tx.QueryRow(context.Background(),
			`SELECT COALESCE("nom", '') FROM "Filiere" WHERE "id" = $1`, filiereID).Scan(&nom)
	})
	return nom
}

// formatFenetreFR formate la fenêtre de passation en français compact.
func formatFenetreFR(debut, fin time.Time) string {
	if debut.IsZero() && fin.IsZero() {
		return "à planifier"
	}
	const layout = "02/01/2006 15h04"
	if fin.IsZero() {
		return "dès le " + debut.Format(layout)
	}
	if debut.IsZero() {
		return "jusqu'au " + fin.Format(layout)
	}
	return debut.Format(layout) + " → " + fin.Format(layout)
}

// firstNonEmpty retourne le premier string non vide.
func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
