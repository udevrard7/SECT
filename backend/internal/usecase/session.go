// Package usecase — logique métier Sessions + Resultats + grading.
package usecase

import (
        "context"
        "encoding/json"
        "fmt"
        "time"

        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// ============================================================
// SESSION USECASE
// ============================================================

// SessionUseCase implémente les cas d'usage des sessions.
type SessionUseCase struct {
        sessionRepo  domain.SessionRepository
        resultatRepo domain.ResultatRepository
        epreuveRepo  domain.EpreuveRepository
}

// NewSessionUseCase crée un nouveau SessionUseCase.
func NewSessionUseCase(sessionRepo domain.SessionRepository, resultatRepo domain.ResultatRepository, epreuveRepo domain.EpreuveRepository) *SessionUseCase {
        return &SessionUseCase{
                sessionRepo:  sessionRepo,
                resultatRepo: resultatRepo,
                epreuveRepo:  epreuveRepo,
        }
}

// List liste les sessions (RLS filtre selon le rôle).
func (uc *SessionUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.SessionListParams) ([]*domain.SessionPassation, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant && role != domain.RoleEtudiant {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        // ETUDIANT : force etudiantId = user.id
        if role == domain.RoleEtudiant {
                params.EtudiantID = claims.UserID
        }
        return uc.sessionRepo.List(ctx, params)
}

// GetByID récupère une session par ID.
func (uc *SessionUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.SessionPassation, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant && role != domain.RoleEtudiant {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        sess, err := uc.sessionRepo.FindByID(ctx, id)
        if err != nil {
                return nil, err
        }
        // B8-MES-EPREUVES : hydrater les Reponses pour permettre le resume
        // d'une session EN_COURS (le frontend passation-page restore les
        // réponses sauvegardées via GET /api/sessions/{id}).
        reponses, err := uc.sessionRepo.GetReponses(ctx, id)
        if err == nil {
                sess.Reponses = reponses
        }
        return sess, nil
}

// StartSession démarre ou reprend une session.
func (uc *SessionUseCase) StartSession(ctx context.Context, claims db.SessionClaims, input domain.StartSessionInput) (*domain.SessionPassation, bool, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleEtudiant && role != domain.RoleEnseignant && role != domain.RoleResponsable && role != domain.RoleAdmin {
                return nil, false, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        // ETUDIANT : force etudiantId = user.id
        if role == domain.RoleEtudiant && input.EtudiantID != claims.UserID {
                return nil, false, &domain.UnauthorizedError{Message: "vous ne pouvez démarrer une session que pour vous-même"}
        }
        if input.EtudiantID == "" || input.EpreuveID == "" {
                return nil, false, &domain.ValidationError{Field: "ids", Message: "etudiantId et epreuveId requis"}
        }

        // Vérifier l'épreuve
        epreuve, err := uc.epreuveRepo.FindByID(ctx, input.EpreuveID)
        if err != nil {
                return nil, false, err
        }
        // Vérifier statut épreuve
        if epreuve.Statut == domain.StatutCloturee {
                return nil, false, &domain.UnauthorizedError{Message: "épreuve clôturée"}
        }
        if epreuve.Statut != domain.StatutPlanifiee && epreuve.Statut != domain.StatutEnCours {
                return nil, false, &domain.ValidationError{Field: "epreuve", Message: "épreuve non disponible"}
        }

        // Grace period
        delaiGrace := epreuve.DelaiGrace
        if delaiGrace <= 0 {
                delaiGrace = 3
        }
        gracePeriodEnd := epreuve.DateFin.Add(time.Duration(delaiGrace) * time.Minute)
        if time.Now().After(gracePeriodEnd) {
                return nil, false, &domain.UnauthorizedError{Message: "délai de grâce expiré"}
        }

        // Vérifier session existante
        existing, err := uc.sessionRepo.FindByEtudiantAndEpreuve(ctx, input.EtudiantID, input.EpreuveID)
        if err != nil {
                return nil, false, fmt.Errorf("check existing session: %w", err)
        }
        if existing != nil {
                // Session existe déjà
                if existing.Statut == domain.StatutSessionSoumise ||
                        existing.Statut == domain.StatutSessionCorrigee ||
                        existing.Statut == domain.StatutSessionRetournee {
                        return nil, false, &domain.ValidationError{Field: "session", Message: "vous avez déjà soumis cette épreuve"}
                }
                // Resume
                return existing, true, nil
        }

        // Créer nouvelle session (propositionMappings vide pour l'instant — le shuffling se fait côté frontend)
        sess, err := uc.sessionRepo.Create(ctx, input.EtudiantID, input.EpreuveID, nil)
        if err != nil {
                return nil, false, err
        }

        // Si épreuve était PLANIFIEE, la passer à EN_COURS (best-effort)
        if epreuve.Statut == domain.StatutPlanifiee {
                _, _ = uc.epreuveRepo.Update(ctx, input.EpreuveID, domain.UpdateEpreuveInput{Action: strPtr("lancer")})
        }

        return sess, false, nil
}

// SaveReponse sauvegarde une réponse (auto-save pendant l'examen).
func (uc *SessionUseCase) SaveReponse(ctx context.Context, claims db.SessionClaims, input domain.SaveReponseInput) error {
        role := domain.Role(claims.Role)
        if role != domain.RoleEtudiant && role != domain.RoleEnseignant && role != domain.RoleAdmin {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if input.SessionID == "" || input.QuestionID == "" {
                return &domain.ValidationError{Field: "ids", Message: "sessionId et questionId requis"}
        }

        // Vérifier que la session est EN_COURS
        sess, err := uc.sessionRepo.FindByID(ctx, input.SessionID)
        if err != nil {
                return err
        }
        if sess.Statut != domain.StatutSessionEnCours {
                return &domain.ValidationError{Field: "session", Message: "session non active"}
        }

        // ETUDIANT : doit posséder la session
        if role == domain.RoleEtudiant && sess.EtudiantID != claims.UserID {
                return &domain.UnauthorizedError{Message: "vous ne pouvez modifier que votre propre session"}
        }

        // Sauvegarder la réponse
        if err := uc.sessionRepo.SaveReponse(ctx, input.SessionID, input.QuestionID, input.Contenu); err != nil {
                return err
        }

        // Gérer l'alerte si fournie
        if input.Alerte != nil {
                if err := uc.sessionRepo.AddAlerte(ctx, input.SessionID, input.Alerte.Penalite, *input.Alerte); err != nil {
                        return err
                }
        }

        return nil
}

// AddAlerte logge une alerte anti-fraude sur une session (B2-MES-EPREUVES).
// Vérifie l'ownership (session.etudiantId = claims.UserID pour les étudiants).
func (uc *SessionUseCase) AddAlerte(ctx context.Context, claims db.SessionClaims, sessionID string, penalite float64, alerte domain.AlerteInput) error {
        role := domain.Role(claims.Role)
        if role != domain.RoleEtudiant && role != domain.RoleEnseignant && role != domain.RoleAdmin {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Vérifier ownership
        sess, err := uc.sessionRepo.FindByID(ctx, sessionID)
        if err != nil {
                return err
        }
        if role == domain.RoleEtudiant && sess.EtudiantID != claims.UserID {
                return &domain.UnauthorizedError{Message: "accès refusé à cette session"}
        }

        return uc.sessionRepo.AddAlerte(ctx, sessionID, penalite, alerte)
}

// Submit soumet une session et corrige automatiquement (QCU/QCM).
func (uc *SessionUseCase) Submit(ctx context.Context, claims db.SessionClaims, sessionID string, input domain.SubmitSessionInput) (*domain.SubmitResult, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleEtudiant && role != domain.RoleEnseignant && role != domain.RoleAdmin {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Récupérer la session
        sess, err := uc.sessionRepo.FindByID(ctx, sessionID)
        if err != nil {
                return nil, err
        }
        if sess.Statut != domain.StatutSessionEnCours {
                return nil, &domain.ValidationError{Field: "session", Message: "session déjà soumise"}
        }

        // Récupérer l'épreuve
        epreuve, err := uc.epreuveRepo.FindByID(ctx, sess.EpreuveID)
        if err != nil {
                return nil, err
        }
        if epreuve.Statut == domain.StatutCloturee {
                return nil, &domain.UnauthorizedError{Message: "épreuve clôturée"}
        }

        // Grace period (sauf autoSubmit)
        if !input.AutoSubmit {
                delaiGrace := epreuve.DelaiGrace
                if delaiGrace <= 0 {
                        delaiGrace = 3
                }
                gracePeriodEnd := epreuve.DateFin.Add(time.Duration(delaiGrace) * time.Minute)
                if time.Now().After(gracePeriodEnd) {
                        return nil, &domain.UnauthorizedError{Message: "délai de grâce expiré"}
                }
        }

        // Sauvegarder les réponses finales si fournies
        if len(input.Reponses) > 0 {
                for questionID, contenu := range input.Reponses {
                        if contenu != "" {
                                _ = uc.sessionRepo.SaveReponse(ctx, sessionID, questionID, contenu)
                        }
                }
        }

        // Récupérer les réponses sauvegardées
        reponses, err := uc.sessionRepo.GetReponses(ctx, sessionID)
        if err != nil {
                return nil, fmt.Errorf("get reponses: %w", err)
        }

        // Récupérer les questions de l'épreuve (format EpreuveQuestion avec Question jointe)
        epreuveQuestions, err := uc.epreuveRepo.ListQuestions(ctx, sess.EpreuveID)
        if err != nil {
                return nil, fmt.Errorf("list epreuve questions: %w", err)
        }

        // B6-MES-EPREUVES : récupérer les questions avec reponseCorrecte pour l'auto-grading.
        // ListQuestionsForGrading expose reponseCorrecte (backend only, jamais retourné au frontend).
        questionsForGrading, err := uc.epreuveRepo.ListQuestionsForGrading(ctx, sess.EpreuveID)
        if err != nil {
                return nil, fmt.Errorf("list questions for grading: %w", err)
        }

        // Détecter le scénario (A = 100% auto-gradable, B = mixte)
        qfgValues := make([]domain.QuestionForGrading, len(questionsForGrading))
        for i, q := range questionsForGrading {
                qfgValues[i] = *q
        }
        scenario := domain.DetectGradingScenario(qfgValues)

        // Construire le detailParQuestion
        details := make([]domain.DetailParQuestion, 0, len(epreuveQuestions))
        reponseMap := make(map[string]domain.Reponse)
        for _, r := range reponses {
                reponseMap[r.QuestionID] = r
        }

        rawScore := 0.0
        autoGradedCount := 0
        pendingCount := 0
        totalPossible := 0.0
        autoGradableTotal := 0.0

        // B6-MES-EPREUVES : map pour lookup rapide Type + ReponseCorrecte par questionID
        gradingMap := make(map[string]domain.QuestionForGrading)
        for _, qfg := range questionsForGrading {
                gradingMap[qfg.QuestionID] = *qfg
        }

        for _, eq := range epreuveQuestions {
                rep, repondu := reponseMap[eq.QuestionID]
                qfg, qfgOk := gradingMap[eq.QuestionID]
                detail := domain.DetailParQuestion{
                        QuestionID: eq.QuestionID,
                        Bareme:     eq.Bareme,
                        Repondu:    repondu,
                }

                // B6 : setter le vrai Type depuis la question (au lieu de "QRC" hardcodé)
                if qfgOk {
                        detail.Type = string(qfg.Type)
                } else {
                        detail.Type = "QRC"
                }

                // Si la réponse a déjà un score (manuel), l'utiliser
                if repondu && rep.Score != nil {
                        detail.Score = rep.Score
                        detail.IsAutoGraded = true
                        rawScore += *rep.Score
                        autoGradedCount++
                } else if repondu && qfgOk {
                        // B6 : auto-grading QCU/QCM
                        var studentAnswer string
                        if rep.Contenu != nil {
                                studentAnswer = *rep.Contenu
                        }
                        var score float64
                        switch qfg.Type {
                        case domain.TypeQCU:
                                score = domain.GradeQCU(studentAnswer, qfg.ReponseCorrecte, eq.Bareme)
                                detail.IsAutoGraded = true
                                autoGradedCount++
                        case domain.TypeQCM:
                                score = domain.GradeQCM(studentAnswer, qfg.ReponseCorrecte, eq.Bareme)
                                detail.IsAutoGraded = true
                                autoGradedCount++
                        default:
                                // QRC, CODE, REFLEXION, TRS → pending (manuel ou IA)
                                detail.IsAutoGraded = false
                                pendingCount++
                                totalPossible += eq.Bareme
                                details = append(details, detail)
                                continue
                        }
                        detail.Score = &score
                        rawScore += score
                        // Persister le score calculé en DB (UpdateReponseScore)
                        _ = uc.sessionRepo.UpdateReponseScore(ctx, rep.ID, score)
                } else {
                        // Pas répondu → score 0, pas pending
                        detail.Score = nil
                        detail.IsAutoGraded = false
                        pendingCount++
                }

                totalPossible += eq.Bareme
                details = append(details, detail)
        }

        if totalPossible == 0 {
                totalPossible = epreuve.NoteTotal
        }

        // Appliquer la pénalité
        penalite := sess.Penalite
        scoreAfterPenalty := rawScore - penalite
        if scoreAfterPenalty < 0 {
                scoreAfterPenalty = 0
        }

        // Déterminer le statut final
        var newStatut domain.StatutSession
        var dateCorrection *time.Time
        if scenario.Type == "A" {
                newStatut = domain.StatutSessionCorrigee
                now := time.Now()
                dateCorrection = &now
        } else {
                newStatut = domain.StatutSessionSoumise
        }

        // Mettre à jour la session
        now := time.Now()
        var scorePtr *float64
        if scenario.Type == "A" {
                scorePtr = &scoreAfterPenalty
        }
        if err := uc.sessionRepo.UpdateStatut(ctx, sessionID, newStatut, scorePtr, &now); err != nil {
                return nil, fmt.Errorf("update session statut: %w", err)
        }

        // Construire le detailParQuestion JSON
        detailJSON, _ := json.Marshal(details)

        // Commentaires
        commentaires := ""
        if penalite > 0 {
                commentaires = fmt.Sprintf("Pénalité appliquée: -%.2f points", penalite)
        }
        if scenario.Type == "B" {
                if commentaires != "" {
                        commentaires += " | "
                }
                commentaires += "Correction manuelle en attente pour les questions ouvertes"
        }
        var commentairesPtr *string
        if commentaires != "" {
                commentairesPtr = &commentaires
        }

        // Upsert résultat
        resultat := &domain.Resultat{
                SessionID:         sessionID,
                ScoreFinal:        scoreAfterPenalty,
                DetailParQuestion: detailJSON,
                DateCorrection:    dateCorrection,
                Commentaires:      commentairesPtr,
                TotalPossible:     totalPossible,
        }
        resultat, err = uc.resultatRepo.Upsert(ctx, resultat)
        if err != nil {
                return nil, fmt.Errorf("upsert resultat: %w", err)
        }

        // Récupérer la session mise à jour
        updatedSess, err := uc.sessionRepo.FindByID(ctx, sessionID)
        if err != nil {
                return nil, fmt.Errorf("get updated session: %w", err)
        }

        // Calculer le pourcentage
        percentage := 0
        if totalPossible > 0 {
                percentage = int((scoreAfterPenalty / totalPossible) * 100)
        }

        // Scenario message
        scenarioMessage := fmt.Sprintf("Note: %.2f/%.0f", scoreAfterPenalty, totalPossible)
        if scenario.Type == "B" {
                scenarioMessage = fmt.Sprintf("Note partielle: %.2f/%.0f — correction manuelle en attente", scoreAfterPenalty, totalPossible)
        }

        return &domain.SubmitResult{
                Session:           updatedSess,
                Resultat:          resultat,
                Score:             scoreAfterPenalty,
                RawScore:          rawScore,
                Penalite:          penalite,
                TotalPossible:     totalPossible,
                AutoGradableTotal: autoGradableTotal,
                Percentage:        percentage,
                AutoGraded:        autoGradedCount,
                PendingCorrection: pendingCount,
                Scenario:          scenario.Type,
                ScenarioMessage:   scenarioMessage,
                Message:           "Épreuve soumise avec succès",
        }, nil
}

// ============================================================
// RESULTAT USECASE
// ============================================================

// ResultatUseCase implémente les cas d'usage des résultats.
type ResultatUseCase struct {
        resultatRepo domain.ResultatRepository
}

// NewResultatUseCase crée un nouveau ResultatUseCase.
func NewResultatUseCase(resultatRepo domain.ResultatRepository) *ResultatUseCase {
        return &ResultatUseCase{resultatRepo: resultatRepo}
}

// List liste les résultats (par étudiant ou par épreuve).
func (uc *ResultatUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.ResultatListParams) (any, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant && role != domain.RoleEtudiant {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // ETUDIANT : force etudiantId = user.id
        if role == domain.RoleEtudiant {
                params.EtudiantID = claims.UserID
                params.EpreuveID = ""
        }

        if params.EtudiantID != "" {
                // Branch A : résultats d'un étudiant
                sessions, err := uc.resultatRepo.ListByEtudiant(ctx, params.EtudiantID)
                if err != nil {
                        return nil, err
                }
                return map[string]any{"resultats": sessions}, nil
        }

        if params.EpreuveID != "" {
                // Branch B : résultats d'une épreuve (avec stats)
                page := params.Page
                limit := params.Limit
                if page < 1 {
                        page = 1
                }
                if limit < 1 {
                        limit = 50
                }
                sessions, total, err := uc.resultatRepo.ListByEpreuve(ctx, params.EpreuveID, page, limit)
                if err != nil {
                        return nil, err
                }

                // Calculer les stats
                stats := uc.computeStats(ctx, sessions)

                return map[string]any{
                        "sessions": sessions,
                        "stats":    stats,
                        "pagination": map[string]int{
                                "page":       page,
                                "limit":      limit,
                                "total":      total,
                                "totalPages": (total + limit - 1) / limit,
                        },
                }, nil
        }

        return nil, &domain.ValidationError{Field: "params", Message: "etudiantId ou epreuveId requis"}
}

// GetOverview récupère les analytics cross-exam (ENSEIGNANT/ADMIN).
func (uc *ResultatUseCase) GetOverview(ctx context.Context, claims db.SessionClaims, enseignantID string) (*domain.OverviewResult, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleEnseignant && role != domain.RoleAdmin {
                return nil, &domain.UnauthorizedError{Message: "réservé aux ENSEIGNANT et ADMIN"}
        }
        // ENSEIGNANT : force enseignantId = user.id
        if role == domain.RoleEnseignant {
                enseignantID = claims.UserID
        }
        return uc.resultatRepo.GetOverview(ctx, enseignantID)
}

// GetEtudiantOverview récupère les analytics d'un étudiant (self only).
func (uc *ResultatUseCase) GetEtudiantOverview(ctx context.Context, claims db.SessionClaims) (*domain.EtudiantOverviewResult, error) {
        if claims.Role != string(domain.RoleEtudiant) {
                return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        return uc.resultatRepo.GetEtudiantOverview(ctx, claims.UserID)
}

// computeStats calcule les statistiques à partir des sessions.
func (uc *ResultatUseCase) computeStats(ctx context.Context, sessions []*domain.SessionPassation) map[string]any {
        total := len(sessions)
        if total == 0 {
                return map[string]any{
                        "totalSessions": 0, "soumis": 0, "corriges": 0,
                        "moyenne": 0, "mediane": 0, "min": 0, "max": 0,
                        "tauxReussite": 0, "noteTotal": 20, "moyennePct": 0, "medianePct": 0,
                }
        }

        soumis := 0
        corriges := 0
        var scores []float64
        sum := 0.0
        min := 0.0
        max := 0.0

        for i, s := range sessions {
                if s.Statut == domain.StatutSessionSoumise {
                        soumis++
                }
                if s.Statut == domain.StatutSessionCorrigee || s.Statut == domain.StatutSessionRetournee {
                        corriges++
                }
                if s.Score != nil {
                        score := *s.Score
                        scores = append(scores, score)
                        sum += score
                        if i == 0 || score < min {
                                min = score
                        }
                        if score > max {
                                max = score
                        }
                }
        }

        moyenne := 0.0
        mediane := 0.0
        if len(scores) > 0 {
                moyenne = sum / float64(len(scores))
                // Médiane
                sortedScores := make([]float64, len(scores))
                copy(sortedScores, scores)
                sortFloat64s(sortedScores)
                n := len(sortedScores)
                if n%2 == 0 {
                        mediane = (sortedScores[n/2-1] + sortedScores[n/2]) / 2
                } else {
                        mediane = sortedScores[n/2]
                }
        }

        // BUGFIX (SCORES-NORM-2): récupérer le vrai noteTotal depuis l'épreuve
        // au lieu d'utiliser 20.0 en dur. Les scores en DB sont bruts (ex: /60).
        // note = score obtenu / noteTotal de l'épreuve.
        noteTotal := 20.0
        if len(sessions) > 0 && sessions[0].EpreuveID != "" {
                nt, err := uc.resultatRepo.GetEpreuveNoteTotal(ctx, sessions[0].EpreuveID)
                if err == nil && nt > 0 {
                        noteTotal = nt
                }
        }
        reussis := 0
        for _, sc := range scores {
                if sc >= noteTotal/2 {
                        reussis++
                }
        }
        tauxReussite := 0
        if len(scores) > 0 {
                tauxReussite = int(float64(reussis) / float64(len(scores)) * 100)
        }

        moyennePct := 0.0
        if noteTotal > 0 {
                moyennePct = roundTo1Decimal(moyenne / noteTotal * 100)
        }
        medianePct := 0.0
        if noteTotal > 0 {
                medianePct = roundTo1Decimal(mediane / noteTotal * 100)
        }

        // P2-R6 : normaliser moyenne/mediane/min/max en /20 pour cohérence
        // avec resultatsOverviewRealV2 (qui normalise systématiquement en /20).
        // Les valeurs brutes restent disponibles via moyennePct/medianePct.
        moyOn20 := 0.0
        medOn20 := 0.0
        minOn20 := 0.0
        maxOn20 := 0.0
        if noteTotal > 0 {
                moyOn20 = roundTo2Decimals(moyenne / noteTotal * 20)
                medOn20 = roundTo2Decimals(mediane / noteTotal * 20)
                minOn20 = roundTo2Decimals(min / noteTotal * 20)
                maxOn20 = roundTo2Decimals(max / noteTotal * 20)
        }

        return map[string]any{
                "totalSessions": total,
                "soumis":        soumis,
                "corriges":      corriges,
                "moyenne":       moyOn20,
                "mediane":       medOn20,
                "min":           minOn20,
                "max":           maxOn20,
                "tauxReussite":  tauxReussite,
                "noteTotal":     noteTotal,
                "moyennePct":    moyennePct,
                "medianePct":    medianePct,
                "moyenneBrute":  roundTo2Decimals(moyenne),
                "medianeBrute":  roundTo2Decimals(mediane),
        }
}

// --- Helpers ---

func sortFloat64s(s []float64) {
        for i := 1; i < len(s); i++ {
                for j := i; j > 0 && s[j-1] > s[j]; j-- {
                        s[j-1], s[j] = s[j], s[j-1]
                }
        }
}

func roundTo2Decimals(f float64) float64 {
        return float64(int(f*100)) / 100
}

func roundTo1Decimal(f float64) float64 {
        return float64(int(f*10)) / 10
}
