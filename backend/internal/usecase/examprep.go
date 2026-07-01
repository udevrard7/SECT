// Package usecase — logique métier Exam-prep.
package usecase

import (
        "context"
        "fmt"

        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// ExamPrepUseCase implémente les cas d'usage exam-prep.
//
// AUDIO-LEARNING-1 : le champ storage (Cloudflare R2) est ajouté pour
// permettre la génération d'URLs présignées vers les MP3 des podcasts.
// Peut être nil si R2 est désactivé (le frontend affichera le script seul).
type ExamPrepUseCase struct {
        repo    domain.ExamPrepRepository
        storage domain.StorageClient
}

// NewExamPrepUseCase crée un nouveau ExamPrepUseCase.
//
// AUDIO-LEARNING-1 : le paramètre storageClient est ajouté pour supporter
// les podcasts audio (génération d'URLs présignées R2). Peut être nil si
// R2 est désactivé — les podcasts seront PRET avec script seul (r2Key=nil).
func NewExamPrepUseCase(repo domain.ExamPrepRepository, storageClient domain.StorageClient) *ExamPrepUseCase {
        return &ExamPrepUseCase{repo: repo, storage: storageClient}
}

// GetDashboard récupère le tableau de bord de progression.
func (uc *ExamPrepUseCase) GetDashboard(ctx context.Context, claims db.SessionClaims, documentID string) (*domain.ExamPrepDashboard, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants et enseignants"}
        }
        return uc.repo.GetDashboard(ctx, claims.UserID, documentID)
}

// ListDocuments liste les documents accessibles (ETUDIANT via filière+niveau).
func (uc *ExamPrepUseCase) ListDocuments(ctx context.Context, claims db.SessionClaims) ([]*domain.Document, error) {
        if claims.Role != string(domain.RoleEtudiant) {
                return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        // EXAM-PREP-STUDENT-DOCS-RLS : avant on retournait silencieusement [] quand
        // l'étudiant n'avait pas de filière → le frontend affichait "Aucun support
        // de cours disponible" sans explication, et l'étudiant pensait que ses profs
        // n'avaient rien uploadé. On lève maintenant une erreur explicite (403) avec
        // un message orientant l'étudiant vers son responsable d'établissement.
        if claims.FiliereID == "" {
                return nil, &domain.UnauthorizedError{Message: "aucune filière associée à votre compte — contactez votre responsable d'établissement pour configurer votre filière"}
        }
        // EXAM-PREP-NIVEAU-FIX-1 : récupérer le niveau réel de l'étudiant depuis la DB
        // (le JWT SessionClaims n'a pas de champ Niveau). Si introuvable, fallback "L1".
        niveau, err := uc.repo.GetUserNiveau(ctx, claims.UserID)
        if err != nil {
                return nil, fmt.Errorf("get user niveau: %w", err)
        }
        if niveau == "" {
                niveau = "L1" // fallback sécurisé
        }
        return uc.repo.ListStudentDocuments(ctx, claims.UserID, claims.FiliereID, niveau)
}

// ExamPrepDocumentList est la liste enrichie de documents pour l'UI exam-prep.
// Contient les documents (avec chapitres attachés) + les maps batch pour UE
// et propriétaire, prêtes à être consommées par le handler pour construire
// le DTO JSON attendu par le frontend.
type ExamPrepDocumentList struct {
        Documents []*domain.Document
        UEs       map[string]*domain.UniteEnseignement
        Owners    map[string]*domain.UserRef
}

// ListDocumentsWithChapters récupère les documents accessibles à l'étudiant
// et les enrichit en batch avec leurs chapitres, leur UE et leur propriétaire.
//
// DOC-ANALYZER-2 : le frontend exam-prep accède à doc.chapters.length,
// doc.uniteEnseignement.code et doc.owner.name SANS optional chaining —
// ces champs doivent donc toujours être présents (non-null) dans la réponse.
func (uc *ExamPrepUseCase) ListDocumentsWithChapters(ctx context.Context, claims db.SessionClaims) (*ExamPrepDocumentList, error) {
        docs, err := uc.ListDocuments(ctx, claims)
        if err != nil {
                return nil, err
        }

        result := &ExamPrepDocumentList{
                Documents: docs,
                UEs:       make(map[string]*domain.UniteEnseignement),
                Owners:    make(map[string]*domain.UserRef),
        }

        if len(docs) == 0 {
                return result, nil
        }

        // 1. Chapitres par documentId (batch).
        docIDs := make([]string, 0, len(docs))
        for _, d := range docs {
                docIDs = append(docIDs, d.ID)
        }
        chaptersByDoc, err := uc.repo.ListChaptersByDocumentIDs(ctx, docIDs)
        if err != nil {
                return nil, err
        }

        // 2. UEs par ID (batch) — collecte des IDs non-nil.
        ueIDSet := make(map[string]struct{})
        for _, d := range docs {
                if d.UniteEnseignementID != nil && *d.UniteEnseignementID != "" {
                        ueIDSet[*d.UniteEnseignementID] = struct{}{}
                }
        }
        ueIDs := make([]string, 0, len(ueIDSet))
        for id := range ueIDSet {
                ueIDs = append(ueIDs, id)
        }
        ues, err := uc.repo.ListUEsByIDs(ctx, ueIDs)
        if err != nil {
                return nil, err
        }

        // 3. Propriétaires par ID (batch) — collecte des ownerIDs.
        ownerIDSet := make(map[string]struct{})
        for _, d := range docs {
                if d.OwnerID != "" {
                        ownerIDSet[d.OwnerID] = struct{}{}
                }
        }
        ownerIDs := make([]string, 0, len(ownerIDSet))
        for id := range ownerIDSet {
                ownerIDs = append(ownerIDs, id)
        }
        owners, err := uc.repo.ListUserRefsByIDs(ctx, ownerIDs)
        if err != nil {
                return nil, err
        }

        // 4. Attacher les chapitres (slice non-nil pour le frontend).
        for _, d := range docs {
                chs := chaptersByDoc[d.ID]
                if chs == nil {
                        chs = []*domain.Chapter{}
                }
                d.Chapters = chs
        }

        result.UEs = ues
        result.Owners = owners
        return result, nil
}

// GetDocumentContentForQA récupère le contenu textuel d'un document pour le
// Q&A RAG (EXAM-PREP-CONNECT-1 — Étape 3).
//
// Rôles autorisés : ETUDIANT, ENSEIGNANT. L'étudiant peut poser une question
// sur un document de son filière (le scoping strict est assuré côté frontend
// via ListStudentDocuments ; le backend trust le documentID passé).
func (uc *ExamPrepUseCase) GetDocumentContentForQA(ctx context.Context, claims db.SessionClaims, documentID string) (string, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return "", &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if documentID == "" {
                return "", &domain.ValidationError{Field: "documentId", Message: "requis"}
        }

        // EXAM-PREP-READER-SECURITY-FIX-1 : un étudiant ne peut consulter le
        // contenu que des documents de sa filière + niveau.
        if claims.Role == string(domain.RoleEtudiant) {
                if claims.FiliereID == "" {
                        return "", &domain.ValidationError{Field: "filiereId", Message: "filière requise"}
                }
                niveau, err := uc.repo.GetUserNiveau(ctx, claims.UserID)
                if err != nil {
                        return "", fmt.Errorf("get user niveau: %w", err)
                }
                if niveau == "" {
                        niveau = "L1"
                }
                allowed, err := uc.repo.CheckDocumentAccess(ctx, documentID, claims.FiliereID, niveau)
                if err != nil {
                        return "", fmt.Errorf("check document access: %w", err)
                }
                if !allowed {
                        return "", &domain.UnauthorizedError{Message: "vous n'avez pas accès à ce document"}
                }
        }

        return uc.repo.GetDocumentContent(ctx, documentID)
}

// GetDocumentForReader récupère un document complet pour le lecteur modal
// (HIGHLIGHT-FLASHCARD-1). Rôles : ETUDIANT, ENSEIGNANT.
func (uc *ExamPrepUseCase) GetDocumentForReader(ctx context.Context, claims db.SessionClaims, documentID string) (*domain.Document, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if documentID == "" {
                return nil, &domain.ValidationError{Field: "documentId", Message: "requis"}
        }

        // EXAM-PREP-READER-SECURITY-FIX-1 : un étudiant ne peut lire que les
        // documents de sa filière + niveau (uploadés par ses enseignants).
        // L'enseignant n'est pas restreint (il peut lire ses propres documents).
        if claims.Role == string(domain.RoleEtudiant) {
                if claims.FiliereID == "" {
                        return nil, &domain.ValidationError{Field: "filiereId", Message: "filière requise"}
                }
                niveau, err := uc.repo.GetUserNiveau(ctx, claims.UserID)
                if err != nil {
                        return nil, fmt.Errorf("get user niveau: %w", err)
                }
                if niveau == "" {
                        niveau = "L1"
                }
                allowed, err := uc.repo.CheckDocumentAccess(ctx, documentID, claims.FiliereID, niveau)
                if err != nil {
                        return nil, fmt.Errorf("check document access: %w", err)
                }
                if !allowed {
                        return nil, &domain.UnauthorizedError{Message: "vous n'avez pas accès à ce document"}
                }
        }

        return uc.repo.GetDocumentForReader(ctx, documentID)
}

// ListUEsByIDs expose le batch lookup des UEs (HIGHLIGHT-FLASHCARD-1 — utilisé
// par readExamPrepDocument pour résoudre l'UE du document).
func (uc *ExamPrepUseCase) ListUEsByIDs(ctx context.Context, ueIDs []string) (map[string]*domain.UniteEnseignement, error) {
        return uc.repo.ListUEsByIDs(ctx, ueIDs)
}

// ListUserRefsByIDs expose le batch lookup des users (HIGHLIGHT-FLASHCARD-1 —
// utilisé par readExamPrepDocument pour résoudre le propriétaire du document).
func (uc *ExamPrepUseCase) ListUserRefsByIDs(ctx context.Context, userIDs []string) (map[string]*domain.UserRef, error) {
        return uc.repo.ListUserRefsByIDs(ctx, userIDs)
}

// ListReviewItems liste les items de révision.
func (uc *ExamPrepUseCase) ListReviewItems(ctx context.Context, claims db.SessionClaims, documentID string, dueOnly bool) ([]*domain.ReviewItem, error) {
        if claims.Role != string(domain.RoleEtudiant) {
                return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        return uc.repo.ListReviewItems(ctx, domain.ReviewListParams{
                UserID:     claims.UserID,
                DocumentID: documentID,
                DueOnly:    dueOnly,
        })
}

// MarkReviewed marque un item comme révisé.
func (uc *ExamPrepUseCase) MarkReviewed(ctx context.Context, claims db.SessionClaims, itemID string, quality int) error {
        if claims.Role != string(domain.RoleEtudiant) {
                return &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        if quality < 0 || quality > 5 {
                quality = 3
        }
        return uc.repo.MarkReviewed(ctx, itemID, quality)
}

// ListStudySessions liste les sessions de révision planifiées.
func (uc *ExamPrepUseCase) ListStudySessions(ctx context.Context, claims db.SessionClaims) ([]*domain.StudySession, error) {
        if claims.Role != string(domain.RoleEtudiant) {
                return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        return uc.repo.ListStudySessions(ctx, claims.UserID)
}

// CreateStudySession crée une session.
func (uc *ExamPrepUseCase) CreateStudySession(ctx context.Context, claims db.SessionClaims, input domain.CreateStudySessionInput) (*domain.StudySession, error) {
        if claims.Role != string(domain.RoleEtudiant) {
                return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        if input.Type == "" {
                return nil, &domain.ValidationError{Field: "type", Message: "requis"}
        }
        if input.DateDebut == "" {
                return nil, &domain.ValidationError{Field: "dateDebut", Message: "requis"}
        }
        return uc.repo.CreateStudySession(ctx, claims.UserID, input)
}

// DeleteStudySession supprime une session.
func (uc *ExamPrepUseCase) DeleteStudySession(ctx context.Context, claims db.SessionClaims, id string) error {
        if claims.Role != string(domain.RoleEtudiant) {
                return &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        return uc.repo.DeleteStudySession(ctx, id)
}

// ListPracticeAttempts liste les tentatives.
func (uc *ExamPrepUseCase) ListPracticeAttempts(ctx context.Context, claims db.SessionClaims, documentID string) ([]*domain.PracticeAttempt, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.repo.ListPracticeAttempts(ctx, claims.UserID, documentID)
}

// SubmitPractice enregistre une tentative.
func (uc *ExamPrepUseCase) SubmitPractice(ctx context.Context, claims db.SessionClaims, input domain.SubmitPracticeInput) (*domain.PracticeAttempt, error) {
        if claims.Role != string(domain.RoleEtudiant) {
                return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        if input.QuestionID == "" {
                return nil, &domain.ValidationError{Field: "questionId", Message: "requis"}
        }
        if input.Score < 0 || input.Score > 1 {
                return nil, &domain.ValidationError{Field: "score", Message: "doit être entre 0 et 1"}
        }
        return uc.repo.SubmitPractice(ctx, claims.UserID, input)
}

// ListHelpThreads liste les fils d'aide.
func (uc *ExamPrepUseCase) ListHelpThreads(ctx context.Context, claims db.SessionClaims) ([]*domain.HelpThread, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.repo.ListHelpThreads(ctx, claims.UserID, claims.Role)
}

// CreateHelpThread crée un fil d'aide (ETUDIANT only).
func (uc *ExamPrepUseCase) CreateHelpThread(ctx context.Context, claims db.SessionClaims, input domain.CreateHelpThreadInput) (*domain.HelpThread, error) {
        if claims.Role != string(domain.RoleEtudiant) {
                return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        if input.DocumentID == "" || input.Sujet == "" {
                return nil, &domain.ValidationError{Field: "documentId+sujet", Message: "requis"}
        }
        return uc.repo.CreateHelpThread(ctx, claims.UserID, input)
}

// CloseHelpThread ferme un fil (ETUDIANT propriétaire ou ENSEIGNANT).
func (uc *ExamPrepUseCase) CloseHelpThread(ctx context.Context, claims db.SessionClaims, threadID string) error {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.repo.CloseHelpThread(ctx, threadID)
}

// DeleteHelpThread supprime un fil clôturé (étudiant: ses propres fils, enseignant: fils de ses documents).
func (uc *ExamPrepUseCase) DeleteHelpThread(ctx context.Context, claims db.SessionClaims, threadID string) error {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Récupérer le thread pour vérifier ownership + statut CLOS
        threads, err := uc.repo.ListHelpThreads(ctx, claims.UserID, claims.Role)
        if err != nil {
                return err
        }
        var found bool
        for _, t := range threads {
                if t.ID == threadID {
                        found = true
                        if t.Statut != "CLOS" {
                                return &domain.ValidationError{Field: "statut", Message: "seuls les fils clôturés peuvent être supprimés"}
                        }
                        break
                }
        }
        if !found {
                return &domain.UnauthorizedError{Message: "accès refusé à ce fil"}
        }

        return uc.repo.DeleteHelpThread(ctx, threadID)
}

// ListHelpMessages liste les messages d'un fil.
func (uc *ExamPrepUseCase) ListHelpMessages(ctx context.Context, claims db.SessionClaims, threadID string) ([]*domain.HelpMessage, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.repo.ListHelpMessages(ctx, threadID)
}

// CreateHelpMessage ajoute un message.
func (uc *ExamPrepUseCase) CreateHelpMessage(ctx context.Context, claims db.SessionClaims, threadID string, input domain.CreateHelpMessageInput) (*domain.HelpMessage, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if input.Contenu == "" {
                return nil, &domain.ValidationError{Field: "contenu", Message: "requis"}
        }
        return uc.repo.CreateHelpMessage(ctx, threadID, claims.UserID, claims.Role, input)
}

// ============================================================
// FLASHCARDS (HIGHLIGHT-FLASHCARD-1)
// ============================================================

// CreateFlashcard crée une flashcard (recto/verso déjà générés par l'IA
// côté handler) puis crée le ReviewItem associé (SM-2 init, dû immédiatement).
//
// Rôle : ETUDIANT seulement. Le chapterId est optionnel (la flashcard peut
// être rattachée à un chapitre si l'étudiant était positionné sur un chapitre
// précis dans le lecteur).
func (uc *ExamPrepUseCase) CreateFlashcard(ctx context.Context, claims db.SessionClaims, input domain.CreateFlashcardInput) (*domain.Flashcard, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        input.UserID = claims.UserID
        if input.Recto == "" || input.Verso == "" {
                return nil, &domain.ValidationError{Field: "recto/verso", Message: "requis"}
        }

        f, err := uc.repo.CreateFlashcard(ctx, input)
        if err != nil {
                return nil, err
        }

        // Best-effort : si la création du ReviewItem échoue, la flashcard existe
        // déjà mais ne sera pas dans la file SRS. On ne fait pas échouer l'opération
        // (la flashcard est quand même utilisable via l'onglet Flashcards).
        _ = uc.repo.CreateFlashcardReviewItem(ctx, claims.UserID, f.ID, input.ChapterID)

        return f, nil
}

// ListFlashcards liste les flashcards de l'utilisateur (filtrées par documentId
// si non vide).
func (uc *ExamPrepUseCase) ListFlashcards(ctx context.Context, claims db.SessionClaims, documentID string) ([]*domain.Flashcard, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.repo.ListFlashcards(ctx, claims.UserID, documentID)
}

// DeleteFlashcard supprime une flashcard (ETUDIANT propriétaire seulement).
func (uc *ExamPrepUseCase) DeleteFlashcard(ctx context.Context, claims db.SessionClaims, flashcardID string) error {
        if claims.Role != string(domain.RoleEtudiant) {
                return &domain.UnauthorizedError{Message: "réservé aux étudiants"}
        }
        if flashcardID == "" {
                return &domain.ValidationError{Field: "id", Message: "requis"}
        }
        return uc.repo.DeleteFlashcard(ctx, claims.UserID, flashcardID)
}

var _ = fmt.Sprintf


// ============================================================
// QUESTION BANK — votes + cache (QUESTION-BANK-1)
// ============================================================

// VoteQuestion upsert le vote d'un utilisateur sur une question.
// value doit être +1 (upvote) ou -1 (downvote). Rôles : ETUDIANT, ENSEIGNANT.
func (uc *ExamPrepUseCase) VoteQuestion(ctx context.Context, claims db.SessionClaims, questionID string, value int) (*domain.QuestionVote, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if questionID == "" {
                return nil, &domain.ValidationError{Field: "questionId", Message: "requis"}
        }
        if value != 1 && value != -1 {
                return nil, &domain.ValidationError{Field: "value", Message: "doit être +1 ou -1"}
        }
        return uc.repo.VoteQuestion(ctx, claims.UserID, questionID, value)
}

// RemoveVote supprime le vote d'un utilisateur sur une question (un-vote).
// Rôles : ETUDIANT, ENSEIGNANT.
func (uc *ExamPrepUseCase) RemoveVote(ctx context.Context, claims db.SessionClaims, questionID string) error {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if questionID == "" {
                return &domain.ValidationError{Field: "questionId", Message: "requis"}
        }
        return uc.repo.RemoveVote(ctx, claims.UserID, questionID)
}

// ListQuestionBank liste les questions validées d'un document avec les stats
// de vote. Rôles : ETUDIANT, ENSEIGNANT. Le chapterID est accepté mais ignoré
// en v1 (filtrage par documentId uniquement).
func (uc *ExamPrepUseCase) ListQuestionBank(ctx context.Context, claims db.SessionClaims, documentID string, chapterID *string, limit, offset int) ([]*domain.QuestionBankItem, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if documentID == "" {
                return nil, &domain.ValidationError{Field: "documentId", Message: "requis"}
        }
        return uc.repo.ListQuestionBank(ctx, claims.UserID, documentID, chapterID, limit, offset)
}

// GetCachedQuestions vérifie si la banque contient déjà assez de questions
// validées pour répondre à la demande. Si oui, retourne les questions + true
// (cache hit → le handler répond 200 PRET, pas de génération IA). Sinon,
// retourne (nil, false, nil) (cache miss → le handler pousse un job IA + 202).
//
// La stratégie de cache est volontairement simple : on compte les questions
// validées du document (filtrage difficulte optionnel). Si count >= requestedCount,
// on récupère les `requestedCount` plus récentes. Le chapterID est ignoré en v1.
//
// QUESTION-BANK-1 : c'est l'optimisation principale — le premier étudiant paie
// le coût IA, les suivants obtiennent les questions instantanément (200 PRET).
func (uc *ExamPrepUseCase) GetCachedQuestions(ctx context.Context, claims db.SessionClaims, documentID string, chapterID *string, difficulte *string, requestedCount int) ([]*domain.QuestionBankItem, bool, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) && claims.Role != string(domain.RoleAdmin) {
                return nil, false, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if documentID == "" {
                return nil, false, &domain.ValidationError{Field: "documentId", Message: "requis"}
        }
        if requestedCount <= 0 {
                return nil, false, &domain.ValidationError{Field: "requestedCount", Message: "doit être > 0"}
        }

        count, err := uc.repo.CountQuestionsByDocument(ctx, documentID, chapterID, difficulte)
        if err != nil {
                return nil, false, err
        }
        if count < requestedCount {
                return nil, false, nil
        }

        questions, err := uc.repo.ListExistingQuestions(ctx, documentID, chapterID, difficulte, requestedCount)
        if err != nil {
                return nil, false, err
        }
        return questions, true, nil
}

// ============================================================
// AUDIO-LEARNING-1 — Mode Audio-Learning (podcasts de révision)
// ============================================================

// GenerateAudio crée une ligne DocumentAudio (status=EN_COURS, script="") pour
// le document donné. La ligne est créée AVANT de pousser le job dans la queue
// pour que le frontend puisse poller son statut immédiatement. Le handler est
// responsable de pousser le AudioGenerationJob dans worker.AudioGenerationQueue
// (la usecase ne dépend pas du package worker — clean architecture).
//
// Rôles : ETUDIANT, ENSEIGNANT. L'étudiant doit avoir accès au document via
// ListStudentDocuments (le scoping strict est assuré côté frontend ; le backend
// trust le documentID passé par un utilisateur authentifié).
func (uc *ExamPrepUseCase) GenerateAudio(ctx context.Context, claims db.SessionClaims, documentID string) (*domain.DocumentAudio, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if documentID == "" {
                return nil, &domain.ValidationError{Field: "documentId", Message: "requis"}
        }
        input := domain.CreateDocumentAudioInput{
                DocumentID: documentID,
                UserID:     claims.UserID,
                Script:     "",
        }
        return uc.repo.CreateDocumentAudio(ctx, input)
}

// ListAudio liste les podcasts d'un document, ordonnés par createdAt DESC.
// Rôles : ETUDIANT, ENSEIGNANT. Les podcasts sont partagés entre étudiants
// d'une même filière (comme les questions de la banque collaborative).
func (uc *ExamPrepUseCase) ListAudio(ctx context.Context, claims db.SessionClaims, documentID string) ([]*domain.DocumentAudio, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if documentID == "" {
                return nil, &domain.ValidationError{Field: "documentId", Message: "requis"}
        }
        return uc.repo.ListDocumentAudio(ctx, documentID)
}

// GetAudio récupère un podcast par son ID. Rôles : ETUDIANT, ENSEIGNANT.
// Ne génère PAS l'URL présignée — utiliser GetAudioURL pour cela.
func (uc *ExamPrepUseCase) GetAudio(ctx context.Context, claims db.SessionClaims, audioID string) (*domain.DocumentAudio, error) {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if audioID == "" {
                return nil, &domain.ValidationError{Field: "audioId", Message: "requis"}
        }
        return uc.repo.GetDocumentAudio(ctx, audioID)
}

// MarkAudioError marque un audio en ERREUR avec un message. Utilisé par le
// handler generateAudio quand la queue est pleine (job non poussé → la ligne
// reste EN_COURS sinon, ce qui ferait poller le frontend indéfiniment).
//
// Rôles : ETUDIANT, ENSEIGNANT, ADMIN. RLS off : écriture système.
func (uc *ExamPrepUseCase) MarkAudioError(ctx context.Context, claims db.SessionClaims, audioID, errorMessage string) error {
        if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) && claims.Role != string(domain.RoleAdmin) {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        if audioID == "" {
                return &domain.ValidationError{Field: "audioId", Message: "requis"}
        }
        return uc.repo.UpdateDocumentAudioStatus(ctx, audioID, "ERREUR", nil, &errorMessage)
}

// GetAudioURL génère une URL présignée R2 (15 min de validité) pour télécharger
// le MP3 d'un podcast. Retourne une erreur si storage est nil (R2 désactivé)
// ou si la présignature échoue. À appeler seulement si audio.R2Key est non-nil.
//
// AUDIO-LEARNING-1 : la durée de validité est de 15 minutes (900s) — suffisant
// pour écouter un podcast de 5 min, et limite le risque de partage d'URL.
func (uc *ExamPrepUseCase) GetAudioURL(ctx context.Context, r2Key string) (string, error) {
        if r2Key == "" {
                return "", &domain.ValidationError{Field: "r2Key", Message: "requis"}
        }
        if uc.storage == nil {
                return "", fmt.Errorf("storage client not configured")
        }
        return uc.storage.PresignURL(ctx, r2Key, 900) // 15 minutes
}
