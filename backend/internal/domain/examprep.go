// Package domain — entités Exam-prep (ReviewItem, StudySession, PracticeAttempt, HelpThread, HelpMessage, Chapter).
package domain

import (
        "context"
        "time"
)

// ============================================================
// CHAPTER
// ============================================================

// Chapter représente un chapitre d'un document.
type Chapter struct {
        ID         string    `json:"id"`
        DocumentID string    `json:"documentId"`
        Titre      string    `json:"titre"`
        Ordre      int       `json:"ordre"`
        Sujets     *string   `json:"sujets,omitempty"` // JSON array
        CreatedAt  time.Time `json:"createdAt"`
}

// ============================================================
// FLASHCARD (HIGHLIGHT-FLASHCARD-1)
// ============================================================

// Flashcard représente une carte de révision générée depuis un passage
// sélectionné dans un document.
//
// HIGHLIGHT-FLASHCARD-1 : la table "Flashcard" n'a PAS de colonne userId.
// L'appartenance est dérivée via ReviewItem : une flashcard appartient à  un
// utilisateur s'il existe un ReviewItem avec questionId = flashcard.id AND
// userId = X. Convention : on réutilise la colonne ReviewItem.questionId
// (qui existe déjà  pour les questions d'entraînement) pour stocker l'ID de
// la flashcard. Pas de migration nécessaire.
type Flashcard struct {
        ID         string    `json:"id"`
        ChapterID  *string   `json:"chapterId,omitempty"`
        DocumentID *string   `json:"documentId,omitempty"`
        Recto      string    `json:"recto"`
        Verso      string    `json:"verso"`
        CreatedAt  time.Time `json:"createdAt"`
}

// CreateFlashcardInput pour créer une flashcard (recto/verso générés par l'IA).
type CreateFlashcardInput struct {
        UserID     string  `json:"-"`
        DocumentID *string `json:"documentId,omitempty"`
        ChapterID  *string `json:"chapterId,omitempty"`
        Recto      string  `json:"recto"`
        Verso      string  `json:"verso"`
}

// ============================================================
// REVIEW ITEM (Spaced Repetition)
// ============================================================

// ReviewItem représente un item de révision espacée.
type ReviewItem struct {
        ID           string     `json:"id"`
        UserID       string     `json:"userId"`
        ChapterID    string     `json:"chapterId"`
        QuestionID   *string    `json:"questionId,omitempty"`
        Interval     int        `json:"interval"`   // jours
        EaseFactor   float64    `json:"easeFactor"` // SM-2
        NextReviewAt time.Time  `json:"nextReviewAt"`
        LastReviewAt *time.Time `json:"lastReviewAt,omitempty"`
        Repetitions  int        `json:"repetitions"`
        CreatedAt    time.Time  `json:"createdAt"`
        UpdatedAt    time.Time  `json:"updatedAt"`
}

// ReviewListParams pour filtrer.
type ReviewListParams struct {
        UserID     string
        DocumentID string
        DueOnly    bool
}

// ============================================================
// STUDY SESSION (Planning)
// ============================================================

// StudySession représente une session de révision planifiée.
type StudySession struct {
        ID         string     `json:"id"`
        UserID     string     `json:"userId"`
        DocumentID *string    `json:"documentId,omitempty"`
        ChapitreID *string    `json:"chapitreId,omitempty"`
        Type       string     `json:"type"` // "lecture", "exercices", "revision"
        DateDebut  time.Time  `json:"dateDebut"`
        DateFin    *time.Time `json:"dateFin,omitempty"`
        Statut     string     `json:"statut"` // "PLANIFIEE", "EN_COURS", "TERMINEE"
        Notes      *string    `json:"notes,omitempty"`
        CreatedAt  time.Time  `json:"createdAt"`
        UpdatedAt  time.Time  `json:"updatedAt"`
}

// CreateStudySessionInput pour créer une session.
type CreateStudySessionInput struct {
        DocumentID *string `json:"documentId,omitempty"`
        ChapitreID *string `json:"chapitreId,omitempty"`
        Type       string  `json:"type"`
        DateDebut  string  `json:"dateDebut"` // ISO
        DateFin    *string `json:"dateFin,omitempty"`
        Notes      *string `json:"notes,omitempty"`
}

// ============================================================
// PRACTICE ATTEMPT
// ============================================================

// PracticeAttempt représente une tentative d'exercice.
type PracticeAttempt struct {
        ID         string    `json:"id"`
        UserID     string    `json:"userId"`
        QuestionID string    `json:"questionId"`
        DocumentID *string   `json:"documentId,omitempty"`
        ChapterID  *string   `json:"chapterId,omitempty"`
        Score      float64   `json:"score"` // 0..1
        Correct    bool      `json:"correct"`
        DureeSec   *int      `json:"dureeSec,omitempty"`
        CreatedAt  time.Time `json:"createdAt"`
}

// SubmitPracticeInput pour soumettre une tentative.
type SubmitPracticeInput struct {
        QuestionID string  `json:"questionId"`
        DocumentID *string `json:"documentId,omitempty"`
        ChapterID  *string `json:"chapterId,omitempty"`
        Score      float64 `json:"score"` // 0..1
        Correct    bool    `json:"correct"`
        DureeSec   *int    `json:"dureeSec,omitempty"`
}

// ============================================================
// HELP THREAD + MESSAGES
// ============================================================

// HelpThread représente un fil d'aide étudiant ↔ enseignant.
//
// BUGFIX (ENS-AUDIT-3) : ajout des relations `Etudiant` et `Document` peuplées
// par ListHelpThreads (LEFT JOIN). Avant ce fix, l'API ne renvoyait que les
// IDs (etudiantId, documentId), ce qui faisait crasher le frontend
// aide-etudiants-page.tsx qui accédait à `t.etudiant.name` (undefined.nom).
type HelpThread struct {
        ID           string       `json:"id"`
        DocumentID   string       `json:"documentId"`
        EtudiantID   string       `json:"etudiantId"`
        EnseignantID *string      `json:"enseignantId,omitempty"`
        Sujet        string       `json:"sujet"`
        Statut       string       `json:"statut"` // "OUVERT", "CLOS"
        CreatedAt    time.Time    `json:"createdAt"`
        UpdatedAt    time.Time    `json:"updatedAt"`
        Etudiant     *UserRef     `json:"etudiant,omitempty"`
        Document     *DocumentRef `json:"document,omitempty"`
}

// HelpMessage représente un message dans un fil d'aide.
type HelpMessage struct {
        ID        string    `json:"id"`
        ThreadID  string    `json:"threadId"`
        AuteurID  string    `json:"auteurId"`
        Contenu   string    `json:"contenu"`
        CreatedAt time.Time `json:"createdAt"`
}

// CreateHelpThreadInput pour créer un fil.
type CreateHelpThreadInput struct {
        DocumentID     string `json:"documentId"`
        Sujet          string `json:"sujet"`
        MessageInitial string `json:"messageInitial"`
}

// CreateHelpMessageInput pour ajouter un message.
type CreateHelpMessageInput struct {
        Contenu string `json:"contenu"`
}

// ============================================================
// DASHBOARD
// ============================================================

// ExamPrepDashboard est le tableau de bord de progression.
type ExamPrepDashboard struct {
        ScoreMoyen         float64           `json:"scoreMoyen"`
        TotalAttempts      int               `json:"totalAttempts"`
        TauxReussite       float64           `json:"tauxReussite"`
        TempsRevision      int               `json:"tempsRevision"`
        SessionsAVenir     int               `json:"sessionsAVenir"`
        ItemsSrs           DashboardSrsStats `json:"itemsSrs"`
        LacunesParChapitre []ChapterLacune   `json:"lacunesParChapitre"`
}

// DashboardSrsStats — stats spaced repetition.
type DashboardSrsStats struct {
        Total         int     `json:"total"`
        DusAujourdhui int     `json:"dusAujourdhui"`
        Masterises    int     `json:"masterises"`
        AvgMastery    float64 `json:"avgMastery"`
}

// ChapterLacune — chapitre en difficulté (avgScore < 0.5).
type ChapterLacune struct {
        ChapterID string  `json:"chapterId"`
        Titre     string  `json:"titre"`
        AvgScore  float64 `json:"avgScore"`
        Attempts  int     `json:"attempts"`
}

// ============================================================
// QUESTION VOTES (QUESTION-BANK-1 — banque collaborative)
// ============================================================

// QuestionVote représente un vote d'un utilisateur sur une question de la
// banque collaborative. value = +1 (upvote) ou -1 (downvote).
//
// QUESTION-BANK-1 : la contrainte UNIQUE("questionId", "userId") garantit
// qu'un utilisateur ne vote qu'une fois par question. Le repository fait
// l'upsert (INSERT → UPDATE sur SQLSTATE 23505).
type QuestionVote struct {
        ID         string    `json:"id"`
        QuestionID string    `json:"questionId"`
        UserID     string    `json:"userId"`
        Value      int       `json:"value"` // +1 or -1
        CreatedAt  time.Time `json:"createdAt"`
        UpdatedAt  time.Time `json:"updatedAt"`
}

// QuestionBankItem est une Question enrichie des stats de vote pour la banque
// collaborative. Les champs propositions/reponseCorrecte/explication/themes
// sont des *string (le SQL les lit en TEXT, NULL → nil) ; le handler les
// parse en json.RawMessage pour la sortie JSON si nécessaire.
//
// QUESTION-BANK-1 : NetVotes = upvotes - downvotes. UserVote est le vote du
// utilisateur courant (nil s'il n'a pas voté). Order by netVotes DESC.
type QuestionBankItem struct {
        ID              string  `json:"id"`
        DocumentID      *string `json:"documentId,omitempty"`
        AuteurID        *string `json:"auteurId,omitempty"`
        Type            string  `json:"type"`
        Enonce          string  `json:"enonce"`
        Propositions    *string `json:"propositions,omitempty"`
        ReponseCorrecte *string `json:"reponseCorrecte,omitempty"`
        Explication     *string `json:"explication,omitempty"`
        Difficulte      string  `json:"difficulte"`
        Themes          *string `json:"themes,omitempty"`
        Validee         bool    `json:"validee"`
        CreatedAt       time.Time `json:"createdAt"`
        // Champs collaboratifs
        NetVotes  int  `json:"netVotes"`
        Upvotes   int  `json:"upvotes"`
        Downvotes int  `json:"downvotes"`
        UserVote  *int `json:"userVote,omitempty"` // vote du user courant (+1/-1/nil)
}

// ============================================================
// DOCUMENT AUDIO (AUDIO-LEARNING-1 — Mode Audio-Learning / Podcasts)
// ============================================================

// DocumentAudio représente un podcast de révision généré par IA à partir
// d'un document. Le worker audio_worker.go :
//  1. lit le contenu textuel du document ;
//  2. demande à l'IA un script de podcast (dialogue Présentateur ↔ Expert) ;
//  3. tente une synthèse audio (TTS) via le provider IA actif (optionnel —
//     fallback gracieux : si le provider ne supporte pas /audio/speech, seul
//     le script textuel est conservé, r2Key = nil) ;
//  4. upload le MP3 sur Cloudflare R2 et stocke la clé R2.
//
// Statuts :
//   - EN_COURS : job en cours (script + audio en génération).
//   - PRET     : script disponible (+ audio mp3 si TTS supporté).
//   - ERREUR   : échec (errorMessage rempli).
//
// AUDIO-LEARNING-1 : le handler POST /documents/{id}/audio crée la ligne
// (status=EN_COURS, script="") puis pousse un AudioGenerationJob dans la queue.
// Le worker remplit le script + (option) r2Key puis passe à PRET.
type DocumentAudio struct {
        ID           string    `json:"id"`
        DocumentID   string    `json:"documentId"`
        UserID       string    `json:"userId"`
        Script       string    `json:"script"`
        R2Key        *string   `json:"r2Key,omitempty"`
        DurationSec  *int      `json:"durationSec,omitempty"`
        Status       string    `json:"status"` // EN_COURS, PRET, ERREUR
        ErrorMessage *string   `json:"errorMessage,omitempty"`
        CreatedAt    time.Time `json:"createdAt"`
        UpdatedAt    time.Time `json:"updatedAt"`
}

// CreateDocumentAudioInput — payload pour créer une ligne DocumentAudio.
// Le script est vide à la création : c'est le worker qui le remplit après
// génération IA. La ligne est créée coté handler avant de pousser le job
// dans AudioGenerationQueue (pour que le frontend puisse poller son statut).
type CreateDocumentAudioInput struct {
        DocumentID string `json:"documentId"`
        UserID     string `json:"userId"`
        Script     string `json:"script"`
}

// ============================================================
// REPOSITORIES
// ============================================================

// ExamPrepRepository interface unifiée pour exam-prep.
type ExamPrepRepository interface {
        // Dashboard
        GetDashboard(ctx context.Context, userID string, documentID string) (*ExamPrepDashboard, error)

        // Documents (student-scoped)
        ListStudentDocuments(ctx context.Context, userID, filiereID, niveau string) ([]*Document, error)
        // GetUserNiveau récupère le niveau d'un utilisateur depuis la table User.
        // EXAM-PREP-NIVEAU-FIX-1 : le JWT SessionClaims n'a pas de champ Niveau,
        // on le récupère depuis la DB. Retourne "" si l'utilisateur n'existe pas.
        GetUserNiveau(ctx context.Context, userID string) (string, error)
        // GetDocumentContent récupère le contenu textuel d'un document.
        // EXAM-PREP-CONNECT-1 — Étape 3 : utilisé par le Q&A RAG.
        GetDocumentContent(ctx context.Context, documentID string) (string, error)
        // HIGHLIGHT-FLASHCARD-1 — DocumentReader: fetch a single document for the reader modal.
        GetDocumentForReader(ctx context.Context, documentID string) (*Document, error)
        // CheckDocumentAccess vérifie qu'un document est accessible à un étudiant
        // (le document appartient à une UE de sa filière + niveau).
        // EXAM-PREP-READER-SECURITY-FIX-1 : empêche un étudiant de lire un document
        // d'une autre filière/niveau en forçant un documentID.
        // Retourne true si l'accès est autorisé, false sinon (pas d'erreur).
        CheckDocumentAccess(ctx context.Context, documentID, filiereID, niveau string) (bool, error)

        // DOC-ANALYZER-2 : méthodes batch pour enrichir la liste de documents
        // (chapitres + UE + propriétaire). RLS désactivé : métadonnées non
        // sensibles ; la liste de documents est déjà student-scoped via
        // ListStudentDocuments.
        ListChaptersByDocumentIDs(ctx context.Context, docIDs []string) (map[string][]*Chapter, error)
        ListUEsByIDs(ctx context.Context, ueIDs []string) (map[string]*UniteEnseignement, error)
        ListUserRefsByIDs(ctx context.Context, userIDs []string) (map[string]*UserRef, error)

        // Review (spaced repetition)
        ListReviewItems(ctx context.Context, params ReviewListParams) ([]*ReviewItem, error)
        MarkReviewed(ctx context.Context, itemID string, quality int) error

        // Planning (study sessions)
        ListStudySessions(ctx context.Context, userID string) ([]*StudySession, error)
        CreateStudySession(ctx context.Context, userID string, input CreateStudySessionInput) (*StudySession, error)
        DeleteStudySession(ctx context.Context, id string) error

        // Practice
        ListPracticeAttempts(ctx context.Context, userID, documentID string) ([]*PracticeAttempt, error)
        SubmitPractice(ctx context.Context, userID string, input SubmitPracticeInput) (*PracticeAttempt, error)

        // Help threads
        ListHelpThreads(ctx context.Context, userID string, role string) ([]*HelpThread, error)
        CreateHelpThread(ctx context.Context, etudiantID string, input CreateHelpThreadInput) (*HelpThread, error)
        CloseHelpThread(ctx context.Context, threadID string) error
        DeleteHelpThread(ctx context.Context, threadID string) error
        ListHelpMessages(ctx context.Context, threadID string) ([]*HelpMessage, error)
        CreateHelpMessage(ctx context.Context, threadID, auteurID, role string, input CreateHelpMessageInput) (*HelpMessage, error)

        // HIGHLIGHT-FLASHCARD-1 â Flashcards générées depuis une sélection de texte.
        // CreateFlashcard insère une Flashcard (RLS off â écriture système).
        CreateFlashcard(ctx context.Context, input CreateFlashcardInput) (*Flashcard, error)
        // ListFlashcards liste les flashcards d'un utilisateur (filtrées par documentId
        // si non vide). Le lien userâflashcard est assuré par JOIN ReviewItem :
        // r.questionId = f.id AND r.userId = $1 (la table Flashcard n'a pas de userId).
        ListFlashcards(ctx context.Context, userID, documentID string) ([]*Flashcard, error)
        // DeleteFlashcard supprime la flashcard ET son ReviewItem associé
        // (le ReviewItem.questionId n'a pas de FK vers Flashcard â cascade manuelle).
        DeleteFlashcard(ctx context.Context, userID, flashcardID string) error
        // CreateFlashcardReviewItem insère un ReviewItem pour une flashcard fraîchement
        // créée. Le champ questionId stocke l'ID de la flashcard (convention
        // HIGHLIGHT-FLASHCARD-1). Defaults SM-2 : interval=0, easeFactor=2.5,
        // repetitions=0, nextReviewAt=now (dû immédiatement).
        CreateFlashcardReviewItem(ctx context.Context, userID, flashcardID string, chapterID *string) error

        // QUESTION-BANK-1 — Banque de questions collaborative + cache pré-généré.
        // VoteQuestion upsert un vote (+1/-1) pour un couple (userID, questionID).
        // Si l'utilisateur a déjà voté, la valeur est mise à jour (INSERT → UPDATE
        // sur SQLSTATE 23505 unique_violation). RLS off : écriture système.
        VoteQuestion(ctx context.Context, userID, questionID string, value int) (*QuestionVote, error)
        // RemoveVote supprime le vote d'un utilisateur sur une question (un-vote).
        // RLS off : écriture système. No-op si le vote n'existait pas.
        RemoveVote(ctx context.Context, userID, questionID string) error
        // ListQuestionBank liste les questions validées d'un document avec les
        // stats de vote agrégées (upvotes/downvotes/netVotes) + le vote du user
        // courant. RLS on : lecture student-scoped. Le paramètre chapterID est
        // accepté mais ignoré en v1 (la table Question n'a pas de chapterId —
        // filtrage par documentId uniquement).
        ListQuestionBank(ctx context.Context, userID, documentID string, chapterID *string, limit, offset int) ([]*QuestionBankItem, error)
        // CountQuestionsByDocument compte les questions validées d'un document.
        // Utilisé par le cache check dans practice/generate. Le paramètre chapterID
        // est ignoré en v1 ; difficulte est appliqué si non-nil.
        CountQuestionsByDocument(ctx context.Context, documentID string, chapterID *string, difficulte *string) (int, error)
        // ListExistingQuestions retourne des questions validées existantes pour
        // servir le cache (sans les joins de vote). Ordonné par createdAt DESC.
        ListExistingQuestions(ctx context.Context, documentID string, chapterID *string, difficulte *string, limit int) ([]*QuestionBankItem, error)
        // AUDIO-LEARNING-1 — Mode Audio-Learning (podcasts de révision).
        // CreateDocumentAudio insère une ligne DocumentAudio (status=EN_COURS, script="").
        // RLS off : écriture système (le worker n'a pas de claims HTTP).
        CreateDocumentAudio(ctx context.Context, input CreateDocumentAudioInput) (*DocumentAudio, error)
        // UpdateDocumentAudioStatus met à jour le statut (+ r2Key/errorMessage si non-nil).
        // RLS off : écriture système. Utilisé par le worker (PRET/ERREUR).
        UpdateDocumentAudioStatus(ctx context.Context, audioID, status string, r2Key *string, errorMessage *string) error
        // UpdateDocumentAudioScript met à jour uniquement le script (avant TTS).
        // RLS off : écriture système.
        UpdateDocumentAudioScript(ctx context.Context, audioID, script string) error
        // ListDocumentAudio liste les audios d'un document (tous utilisateurs confondus,
        // la portée étudiant/enseignant est déjà assurée par le fait que l'utilisateur
        // accède au document via ListStudentDocuments). Ordonné par createdAt DESC.
        // RLS off : lecture système (métadonnées non sensibles).
        ListDocumentAudio(ctx context.Context, documentID string) ([]*DocumentAudio, error)
        // GetDocumentAudio récupère un audio par son ID. RLS off.
        GetDocumentAudio(ctx context.Context, audioID string) (*DocumentAudio, error)
}
