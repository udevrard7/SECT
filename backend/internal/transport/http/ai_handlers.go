// Package http — handlers HTTP pour les endpoints IA consommateurs du
// AIService (AI-CONNECT-1).
//
// Deux endpoints :
//
//      POST /api/ai-assistant      — chat flottant (assistant pédagogique)
//      POST /api/epreuves/generate — génération IA d'épreuves à partir de documents
//
// Le frontend n'appelle jamais les LLM directement : tout passe par le
// backend, qui lit le provider actif dans AIProviderConfig et fait l'appel
// OpenAI-compatible via internal/ai.AIService.
package http

import (
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "strings"
        "time"

        "github.com/udevrard7/sect/backend/internal/ai"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
        "github.com/udevrard7/sect/backend/internal/worker"
)

// ──────────────────────────────────────────────────────────────────────────
// 1. POST /api/ai-assistant — Chat flottant
// ──────────────────────────────────────────────────────────────────────────

// aiAssistantBody est le body attendu par /api/ai-assistant.
type aiAssistantBody struct {
        Message string `json:"message"`
        Context struct {
                Page string `json:"page"`
                Role string `json:"role"`
        } `json:"context"`
}

// aiAssistant handler — reçoit un message utilisateur (+ contexte de page),
// appelle le LLM via AIService, retourne la réponse texte.
//
// Body : { message: string, context?: { page?: string, role?: string } }
// Réponse : { response: string, model?: string }
func (s *Server) aiAssistant(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        var body aiAssistantBody
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        msg := strings.TrimSpace(body.Message)
        if msg == "" {
                writeJSONError(w, http.StatusBadRequest, "message requis")
                return
        }

        // System prompt — assistance pédagogique SECT.
        // On contextualise légèrement avec la page courante et le rôle si fournis.
        systemParts := []string{
                "Tu es un assistant pédagogique pour SECT, une plateforme d'évaluation pour l'enseignement supérieur.",
                "Tu aides les étudiants à comprendre les concepts du cours, à préparer leurs examens, et les enseignants à concevoir des évaluations.",
                "Réponds en français, de façon concise, structurée et bienveillante. Si la question sort du cadre pédagogique, recentre poliment.",
        }
        if body.Context.Page != "" {
                systemParts = append(systemParts, "Page courante de l'utilisateur : "+body.Context.Page+".")
        }
        if body.Context.Role != "" {
                systemParts = append(systemParts, "Rôle de l'utilisateur : "+body.Context.Role+".")
        }
        if claims.Role != "" && body.Context.Role == "" {
                systemParts = append(systemParts, "Rôle de l'utilisateur : "+claims.Role+".")
        }

        messages := []ai.ChatMessage{
                {Role: "system", Content: strings.Join(systemParts, " ")},
                {Role: "user", Content: msg},
        }

        result, err := s.aiService.ChatCompletion(r.Context(), messages)
        if err != nil {
                writeJSONError(w, http.StatusServiceUnavailable, "IA indisponible: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "response": result.Content,
                "model":    result.Model,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 2. POST /api/epreuves/generate — Génération IA d'épreuves
// ──────────────────────────────────────────────────────────────────────────

// epreuvesGenerateConfig est la partie « config » du body envoyé par le
// frontend generation-ia-page.tsx.
type epreuvesGenerateConfig struct {
        Titre          string `json:"titre"`
        Difficulte     string `json:"difficulte"`
        Langue         string `json:"langue"`
        Duree          int    `json:"duree"`
        TypesQuestions struct {
                QCU       int `json:"qcu"`
                QCM       int `json:"qcm"`
                QRC       int `json:"qrc"`
                Reflexion int `json:"reflexion"`
                Code      int `json:"code"`
        } `json:"typesQuestions"`
        Consignes           string  `json:"consignes"`
        NoteTotal           float64 `json:"noteTotal"`
        FiliereID           string  `json:"filiereId"`
        UniteEnseignementID string  `json:"uniteEnseignementId"`
        Niveau              string  `json:"niveau"`
}

// docMaterial est la projection d'un document utilisée pour construire le
// prompt envoyé au LLM (uniquement les champs nécessaires).
type docMaterial struct {
        ID       string
        Filename string
        Content  string
}

// epreuvesGenerateBody est le body attendu par /api/epreuves/generate.
type epreuvesGenerateBody struct {
        DocumentIDs  []string               `json:"documentIds"`
        EnseignantID string                 `json:"enseignantId"`
        Config       epreuvesGenerateConfig `json:"config"`
        Preview      bool                   `json:"preview"`
}

// generatedQuestion est la projection d'une question générée par l'IA,
// alignée sur le shape attendu par le frontend (cf. generation-ia-page.tsx,
// mappe sur ContenuQuestion).
type generatedQuestion struct {
        ID                string           `json:"id"`
        Type              string           `json:"type"`
        Enonce            string           `json:"enonce"`
        Propositions      []map[string]any `json:"propositions,omitempty"`
        ReponseCorrecte   *string          `json:"reponseCorrecte,omitempty"`
        Explication       *string          `json:"explication,omitempty"`
        Difficulte        string           `json:"difficulte"`
        Bareme            float64          `json:"bareme"`
        UECode            *string          `json:"ueCode,omitempty"`
        UENom             *string          `json:"ueNom,omitempty"`
        Langage           *string          `json:"langage,omitempty"`
        CodeInitial       *string          `json:"codeInitial,omitempty"`
        FonctionSignature *string          `json:"fonctionSignature,omitempty"`
        TestsPublics      []map[string]any `json:"testsPublics,omitempty"`
        TestsPrives       []map[string]any `json:"testsPrives,omitempty"`
}

// epreuvesGenerate handler — construit un prompt à partir des documents
// sélectionnés et de la config (nombre de questions par type, difficulté,
// etc.), appelle le LLM via AIService, parse le JSON retourné et retourne
// la structure attendue par le frontend.
//
// Body : { documentIds, enseignantId, config, preview }
// Réponse : { contenu: { questions, consignes, baremeTotal }, autoDetectedUEId? }
func (s *Server) epreuvesGenerate(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // Le rôle ENSEIGNANT est attendu (les étudiants ne génèrent pas d'épreuves).
        // On tolère aussi l'ADMIN pour les tests.
        if claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
                writeJSONError(w, http.StatusForbidden, "rôle non autorisé (ENSEIGNANT requis)")
                return
        }

        // Lire le body (limité à 1 MiB — on ne stocke pas le contenu des documents
        // dans le body, seulement leurs IDs ; le contenu est lu depuis la DB).
        var body epreuvesGenerateBody
        dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
        if err := dec.Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide: "+err.Error())
                return
        }
        if len(body.DocumentIDs) == 0 {
                writeJSONError(w, http.StatusBadRequest, "documentIds requis (au moins 1 document)")
                return
        }

        // 1. Récupérer le contenu textuel de chaque document via documentUC.
        //    documentUC.GetByID applique RLS (ENSEIGNANT/ADMIN only).
        materials := make([]docMaterial, 0, len(body.DocumentIDs))
        totalChars := 0
        const maxTotalChars = 60_000 // ~15k tokens ; on tronque au-delà
        for _, docID := range body.DocumentIDs {
                if docID == "" {
                        continue
                }
                doc, err := s.documentUC.GetByID(r.Context(), claims, docID)
                if err != nil {
                        // On ignore les documents introuvables / non accessibles plutôt
                        // que de fail-fast : l'enseignant peut avoir sélectionné un doc
                        // supprimé entre-temps.
                        continue
                }
                content := ""
                if doc.ContenuTexte != nil {
                        content = *doc.ContenuTexte
                }
                // Tronquer chaque doc à 12k caractères (cohérent avec l'ancien
                // frontend qui tronquait à 12k avant d'appeler l'IA).
                if len(content) > 12_000 {
                        content = content[:12_000] + "\n... [contenu tronqué]"
                }
                materials = append(materials, docMaterial{
                        ID:       doc.ID,
                        Filename: doc.NomFichier,
                        Content:  content,
                })
                totalChars += len(content)
                if totalChars >= maxTotalChars {
                        break
                }
        }
        if len(materials) == 0 {
                writeJSONError(w, http.StatusBadRequest, "aucun document exploitable (contenu texte vide ou introuvable)")
                return
        }

        // 2. Construire le prompt.
        messages := buildEpreuvePrompt(materials, body.Config)

        // P5-IA-WORKER : mode async si preview=false. Le handler crée l'Epreuve
        // (statut EN_COURS), pousse un job dans GeneratorQueue, retourne 202.
        // Le worker IAWorker traite en arrière-plan, met à jour contenu + statut=TERMINE.
        // Le frontend poll GET /api/epreuves/{id}/status jusqu'à TERMINE.
        if !body.Preview && body.Config.Titre != "" {
                // Créer l'Epreuve en DB avec statut EN_COURS
                noteTotal := 20.0
                if body.Config.NoteTotal > 0 {
                        noteTotal = body.Config.NoteTotal
                }
                genMode := domain.ModeIAAssistee
                niveauStr := body.Config.Niveau

                epreuveInput := domain.CreateEpreuveInput{
                        EnseignantID:        body.EnseignantID,
                        Titre:               body.Config.Titre,
                        Duree:               body.Config.Duree,
                        DateDebut:           time.Now().Add(24 * time.Hour).Format(time.RFC3339),
                        DateFin:             time.Now().Add(7 * 24 * time.Hour).Format(time.RFC3339),
                        FiliereID:           &body.Config.FiliereID,
                        UniteEnseignementID: &body.Config.UniteEnseignementID,
                        Niveau:              &niveauStr,
                        GenerationMode:      genMode,
                        NoteTotal:           &noteTotal,
                        DocumentIDs:         body.DocumentIDs,
                }

                epreuve, err := s.epreuveUC.Create(r.Context(), claims, epreuveInput)
                if err != nil {
                        middleware.MapDomainError(w, err)
                        return
                }

                // Construire les messages worker (type worker.ChatMessage)
                workerMessages := make([]worker.ChatMessage, len(messages))
                for i, m := range messages {
                        workerMessages[i] = worker.ChatMessage{Role: m.Role, Content: m.Content}
                }

                // Pousser le job dans GeneratorQueue (non-blocking)
                job := worker.IAJob{
                        EpreuveID:    epreuve.ID,
                        Messages:     workerMessages,
                        EnseignantID: claims.UserID,
                        Config: worker.GenerateConfig{
                                Titre:           body.Config.Titre,
                                Difficulte:      body.Config.Difficulte,
                                TypesQuestions: map[string]int{
                                        "qcu":       body.Config.TypesQuestions.QCU,
                                        "qcm":       body.Config.TypesQuestions.QCM,
                                        "qrc":       body.Config.TypesQuestions.QRC,
                                        "reflexion": body.Config.TypesQuestions.Reflexion,
                                        "code":      body.Config.TypesQuestions.Code,
                                },
                                NoteTotal: noteTotal,
                        },
                }
                select {
                case worker.GeneratorQueue <- job:
                        // OK
                default:
                        // Queue pleine — retourner 503
                        writeJSONError(w, http.StatusServiceUnavailable, "file de génération IA pleine, réessayez")
                        return
                }

                // Retourner 202 Accepted
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusAccepted)
                json.NewEncoder(w).Encode(map[string]any{
                        "status":    "EN_COURS",
                        "epreuveId": epreuve.ID,
                        "message":   "Génération IA lancée. Poll GET /api/epreuves/" + epreuve.ID + "/status pour suivre le statut.",
                })
                return
        }

        // 3. Appel IA synchrone (preview — l'enseignant attend le resultat pour previsualiser).
        result, err := s.aiService.ChatCompletion(r.Context(), messages)
        if err != nil {
                writeJSONError(w, http.StatusServiceUnavailable, "IA indisponible: "+err.Error())
                return
        }

        // 4. Parser la reponse JSON.
        questions, consignes, baremeTotal := parseEpreuveResponse(result.Content)

        // 5. Reponse — strictement alignee sur le shape attendu par
        //    generation-ia-page.tsx (data.contenu.questions, data.contenu.consignes,
        //    data.contenu.baremeTotal, data.autoDetectedUEId?).
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "contenu": map[string]any{
                        "questions":   questions,
                        "consignes":   consignes,
                        "baremeTotal": baremeTotal,
                },
                "autoDetectedUEId": nil,
        })
}

// buildEpreuvePrompt construit les messages (system + user) envoyés au LLM
// pour générer une épreuve à partir des documents fournis.
//
// Le prompt demande une sortie JSON stricte, sans markdown, pour pouvoir
// parser la réponse côté backend.
func buildEpreuvePrompt(materials []docMaterial, cfg epreuvesGenerateConfig) []ai.ChatMessage {
        // Construire la section « documents » du prompt.
        var docsBuf strings.Builder
        for i, m := range materials {
                docsBuf.WriteString(fmt.Sprintf("--- Document %d : %s ---\n", i+1, m.Filename))
                docsBuf.WriteString(m.Content)
                docsBuf.WriteString("\n\n")
        }

        // Construire la consigne sur les types de questions.
        tq := cfg.TypesQuestions
        totalRequested := tq.QCU + tq.QCM + tq.QRC + tq.Reflexion + tq.Code
        typeInstr := fmt.Sprintf(
                "Génère exactement %d questions réparties ainsi : %d QCU, %d QCM, %d QRC, %d questions de réflexion, %d questions de code.",
                totalRequested, tq.QCU, tq.QCM, tq.QRC, tq.Reflexion, tq.Code,
        )

        // Difficulté.
        diffInstr := "de difficultés variées (facile, moyen, difficile, expert)"
        switch strings.ToUpper(cfg.Difficulte) {
        case "FACILE", "MOYEN", "DIFFICILE", "EXPERT":
                diffInstr = "de difficulté " + strings.ToLower(cfg.Difficulte)
        }

        // Langue.
        langInstr := "en français"
        if cfg.Langue != "" {
                langInstr = "en " + cfg.Langue
        }

        system := strings.TrimSpace(`Tu es un enseignant expert en création de questions d'examen pour l'enseignement supérieur.
Ta réponse DOIT être un objet JSON valide, sans texte avant ou après, sans bloc markdown, sans commentaires.
Structure exacte attendue :
{
  "questions": [
    {
      "id": "q1",
      "type": "QCU",
      "enonce": "Texte de la question",
      "propositions": [{"text": "Option A", "isCorrect": false}, {"text": "Option B", "isCorrect": true}, {"text": "Option C", "isCorrect": false}, {"text": "Option D", "isCorrect": false}],
      "reponseCorrecte": "Option B",
      "explication": "Pourquoi la réponse est B",
      "difficulte": "FACILE",
      "bareme": 1,
      "themes": ["thème1", "thème2"]
    }
  ],
  "consignes": "Consignes générales de l'épreuve",
  "baremeTotal": 20
}

Règles :
- Types valides : QCU (choix unique, 4 propositions dont 1 correcte), QCM (choix multiples, 4 propositions dont ≥1 correcte), QRC (réponse courte ouverte, propositions=null), REFLEXION (question ouverte longue, propositions=null, reponseCorrecte=plan de réponse), CODE (question de programmation, ajouter langage, codeInitial, fonctionSignature, testsPublics).
- Pour QRC/REFLEXION : propositions doit être null (omets la clé ou mets null).
- Pour CODE : ajoute les clés "langage" (python|javascript|...), "codeInitial" (squelette de code), "fonctionSignature" (signature de la fonction attendue), "testsPublics" (tableau de {nom, entree, sortieAttendue, description?}).
- Difficultés valides : FACILE, MOYEN, DIFFICILE, EXPERT.
- bareme est un nombre (float). baremeTotal = somme des barèmes.
- Les questions doivent couvrir différents aspects du contenu des documents fournis.`)

        user := fmt.Sprintf(`Génère une épreuve %s.

%s

%s

Difficulté : %s

Documents sources :
%s

Consignes supplémentaires : %s
Note totale visée : %.2f
`, diffInstr, typeInstr, langInstr, strings.ToUpper(cfg.Difficulte), docsBuf.String(), cfg.Consignes, cfg.NoteTotal)

        return []ai.ChatMessage{
                {Role: "system", Content: system},
                {Role: "user", Content: user},
        }
}

// parseEpreuveResponse extrait les questions / consignes / baremeTotal du JSON
// retourné par l'IA. Tolérant : gère le cas où l'IA wrappe la réponse dans un
// bloc markdown ```json ... ```.
func parseEpreuveResponse(raw string) ([]generatedQuestion, string, float64) {
        // 1. Extraire le JSON (bloc markdown ou objet brut).
        jsonStr := extractJSON(raw)
        if jsonStr == "" {
                // Pas de JSON parsable — on retourne une réponse vide plutôt que 500.
                return []generatedQuestion{}, "", 0
        }

        // 2. Décoder la structure attendue.
        var parsed struct {
                Questions   []map[string]any `json:"questions"`
                Consignes   string           `json:"consignes"`
                BaremeTotal float64          `json:"baremeTotal"`
        }
        if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
                return []generatedQuestion{}, "", 0
        }

        // 3. Normaliser chaque question.
        validTypes := map[string]bool{"QCU": true, "QCM": true, "QRC": true, "REFLEXION": true, "CODE": true}
        validDiffs := map[string]bool{"FACILE": true, "MOYEN": true, "DIFFICILE": true, "EXPERT": true}

        out := make([]generatedQuestion, 0, len(parsed.Questions))
        for i, q := range parsed.Questions {
                qType, _ := q["type"].(string)
                if !validTypes[qType] {
                        qType = "QRC"
                }
                diff, _ := q["difficulte"].(string)
                if !validDiffs[diff] {
                        diff = "MOYEN"
                }
                enonce, _ := q["enonce"].(string)
                explication := asStringPtr(q["explication"])
                reponseCorrecte := asStringPtr(q["reponseCorrecte"])

                // Propositions — uniquement pour QCU/QCM.
                var propositions []map[string]any
                if qType == "QCU" || qType == "QCM" {
                        if arr, ok := q["propositions"].([]any); ok {
                                for _, p := range arr {
                                        if m, ok := p.(map[string]any); ok {
                                                text, _ := m["text"].(string)
                                                isCorrect, _ := m["isCorrect"].(bool)
                                                propositions = append(propositions, map[string]any{
                                                        "text":      text,
                                                        "isCorrect": isCorrect,
                                                })
                                        }
                                }
                        }
                }

                // CODE-specific fields.
                langage := asStringPtr(q["langage"])
                codeInitial := asStringPtr(q["codeInitial"])
                fonctionSignature := asStringPtr(q["fonctionSignature"])
                testsPublics := asArrayMap(q["testsPublics"])
                testsPrives := asArrayMap(q["testsPrives"])

                bareme := 1.0
                if b, ok := q["bareme"].(float64); ok {
                        bareme = b
                }

                out = append(out, generatedQuestion{
                        ID:                fmt.Sprintf("q%d", i+1),
                        Type:              qType,
                        Enonce:            enonce,
                        Propositions:      propositions,
                        ReponseCorrecte:   reponseCorrecte,
                        Explication:       explication,
                        Difficulte:        diff,
                        Bareme:            bareme,
                        UECode:            asStringPtr(q["ueCode"]),
                        UENom:             asStringPtr(q["ueNom"]),
                        Langage:           langage,
                        CodeInitial:       codeInitial,
                        FonctionSignature: fonctionSignature,
                        TestsPublics:      testsPublics,
                        TestsPrives:       testsPrives,
                })
        }

        return out, parsed.Consignes, parsed.BaremeTotal
}

// extractJSON tente d'extraire un objet JSON du texte (supporte blocs
// markdown ```json ... ``` et JSON brut).
func extractJSON(text string) string {
        // 1. Bloc markdown.
        if i := strings.Index(text, "```"); i >= 0 {
                rest := text[i+3:]
                // Skip optional "json" language tag.
                rest = strings.TrimPrefix(rest, "json")
                if j := strings.Index(rest, "```"); j >= 0 {
                        return strings.TrimSpace(rest[:j])
                }
        }
        // 2. Objet JSON brut — trouver la première '{' et la dernière '}'.
        start := strings.Index(text, "{")
        if start < 0 {
                return ""
        }
        end := strings.LastIndex(text, "}")
        if end <= start {
                return ""
        }
        return text[start : end+1]
}

// asStringPtr retourne un *string depuis une valeur any (string uniquement).
func asStringPtr(v any) *string {
        if s, ok := v.(string); ok && s != "" {
                return &s
        }
        return nil
}

// asArrayMap convertit un []any (tableau JSON) en []map[string]any.
func asArrayMap(v any) []map[string]any {
        arr, ok := v.([]any)
        if !ok {
                return nil
        }
        out := make([]map[string]any, 0, len(arr))
        for _, e := range arr {
                if m, ok := e.(map[string]any); ok {
                        out = append(out, m)
                }
        }
        return out
}
