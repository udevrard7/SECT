// Commande seed — peuplement / réparation de la base Neon (SECT).
//
// RÔLE
//
//      Complète le jeu de données de démonstration sans détruire les données
//      réelles (comptes créés via l'appli, epreuve IA, refresh tokens…).
//      Quatre phases :
//
//        1. RÉPARATION  — comble les incohérences du peuplement initial :
//           banque de questions q1..q25 manquante (597 réponses orphelines),
//           liens EpreuveQuestion, lignes DocumentAudio (userId orphelin),
//           drapeaux établissement, niveaux d'UE (visibilité étudiants).
//        2. COMPLÉTION  — alimente les modules vides : accès admin PaaS,
//           révisions SRS (ReviewItem), flashcards, sessions de travail,
//           tentatives d'entraînement, aide documentaire, devoirs + soumissions.
//        3. MOTS DE PASSE (option --reset-passwords) — mots de passe démo connus.
//        4. R2          — téléverse les fichiers réels sur Cloudflare R2 :
//           PDF des documents (reconstitués depuis contenuTexte), podcasts MP3,
//           fichiers de soumissions. Met à jour tailles / clés / durées.
//
// UTILISATION
//
//      go run ./cmd/seed                        # tout (réparation+complétion+R2)
//      go run ./cmd/seed --skip-r2              # base uniquement
//      go run ./cmd/seed --reset-passwords      # + mots de passe démo connus
//      go run ./cmd/seed --audio-dir /tmp/sect-seed-audio
//
//      Variables d'environnement (.env chargé via godotenv) :
//      NEON_DIRECT_URL (requis) — connexion DIRECTE (jamais le pooler PgBouncer)
//      R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME
//      R2_ENDPOINT (optionnel)
//
// IDEMPOTENCE
//
//      Toutes les insertions utilisent ON CONFLICT (id) DO NOTHING ou
//      INSERT … WHERE NOT EXISTS → rejouable sans doublon. Les UPDATE sont
//      intrinsèquement idempotents. Les uploads R2 écrasent les objets.
//
// RLS
//
//      La connexion NEON_DIRECT_URL utilise neondb_owner (BYPASSRLS sur Neon),
//      mais l'outil pose néanmoins les app.claims.* par transaction — comme le
//      backend — pour rester exact et portable sur un rôle non privilégié.
package main

import (
        "context"
        "encoding/json"
        "flag"
        "fmt"
        "os"
        "sort"
        "strconv"
        "strings"
        "time"

        "github.com/jackc/pgx/v5"
        "github.com/joho/godotenv"
        "golang.org/x/crypto/bcrypt"

        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/storage"
)

// ─────────────────────────────────────────────────────────────────────────────
// Types internes
// ─────────────────────────────────────────────────────────────────────────────

type seedClaims struct {
        userID, role, etabID, filiereID string
}

func systemClaims() seedClaims {
        return seedClaims{userID: "system-worker", role: "ADMIN"}
}

type chapterRef struct {
        id, docID, titre string
        ordre            int
}

type audioRow struct {
        id, docID, script, r2Key string
}

type docRow struct {
        id, nomFichier, cheminStockage, contenuTexte string
        taille                                       int
}

type seedContext struct {
        etabID, adminID, respID, profID string
        filiereINFO, filiereSEG         string
        ueGL, uePython                  string
        students                        map[string]string // email → id (INFO L2)
        allStudents                     map[string]string // email → id
        docs                            []docRow
        docByUE                         map[string][]docRow
        chapters                        map[string][]chapterRef // docID → chapitres
        audios                          []audioRow
        epreuvesCloturees               []string
        iaQuestions                     []string
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

func main() {
        skipR2 := flag.Bool("skip-r2", false, "ne pas toucher à R2 (base uniquement)")
        resetPasswords := flag.Bool("reset-passwords", false, "réinitialiser les mots de passe des comptes de démonstration")
        demoPassword := flag.String("demo-password", "SectDemo2026!", "mot de passe de démonstration (avec --reset-passwords)")
        audioDir := flag.String("audio-dir", "/tmp/sect-seed-audio", "répertoire des MP3 de podcasts pré-générés")
        flag.Parse()

        _ = godotenv.Load()

        directURL := os.Getenv("NEON_DIRECT_URL")
        if directURL == "" {
                fmt.Println("❌ NEON_DIRECT_URL requis (connexion directe, pas le pooler)")
                os.Exit(1)
        }

        ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
        defer cancel()

        conn, err := pgx.Connect(ctx, directURL)
        if err != nil {
                fmt.Println("❌ connexion Neon:", err)
                os.Exit(1)
        }
        defer func() { _ = conn.Close(ctx) }()

        fmt.Println("════════════════════════════════════════════════════════════════")
        fmt.Println(" SECT — seed de démonstration (Neon + Cloudflare R2)")
        fmt.Println("════════════════════════════════════════════════════════════════")

        sc, err := loadContext(ctx, conn)
        if err != nil {
                fmt.Println("❌ lecture du contexte:", err)
                os.Exit(1)
        }
        printContext(sc)

        fmt.Println("\n── Phase 1 · RÉPARATION ─────────────────────────────────────────")
        if err := phaseRepair(ctx, conn, sc); err != nil {
                fmt.Println("❌ réparation:", err)
                os.Exit(1)
        }

        fmt.Println("\n── Phase 2 · COMPLÉTION ─────────────────────────────────────────")
        if err := phaseComplete(ctx, conn, sc); err != nil {
                fmt.Println("❌ complétion:", err)
                os.Exit(1)
        }

        if *resetPasswords {
                fmt.Println("\n── Phase 3 · MOTS DE PASSE DÉMO ─────────────────────────────────")
                if err := phasePasswords(ctx, conn, sc, *demoPassword); err != nil {
                        fmt.Println("❌ mots de passe:", err)
                        os.Exit(1)
                }
        }

        var r2c *storage.R2Client
        if !*skipR2 {
                fmt.Println("\n── Phase 4 · R2 (fichiers réels) ─────────────────────────────────")
                r2c, err = storage.NewR2Client(ctx,
                        os.Getenv("R2_ACCOUNT_ID"), os.Getenv("R2_ACCESS_KEY_ID"),
                        os.Getenv("R2_SECRET_ACCESS_KEY"), os.Getenv("R2_BUCKET_NAME"),
                        os.Getenv("R2_ENDPOINT"))
                if err != nil {
                        fmt.Println("⚠️  R2 indisponible (" + err.Error() + ") — poursuite sans stockage")
                } else if err := phaseR2(ctx, conn, sc, r2c, *audioDir); err != nil {
                        fmt.Println("❌ R2:", err)
                        os.Exit(1)
                }
        }

        printReport(ctx, conn, sc, r2c)
}

// ─────────────────────────────────────────────────────────────────────────────
// Chargement du contexte (IDs existants — rien n'est inventé ici)
// ─────────────────────────────────────────────────────────────────────────────

func loadContext(ctx context.Context, conn *pgx.Conn) (*seedContext, error) {
        sc := &seedContext{
                students:    map[string]string{},
                allStudents: map[string]string{},
                chapters:    map[string][]chapterRef{},
                docByUE:     map[string][]docRow{},
        }

        err := conn.QueryRow(ctx, `SELECT id FROM "Etablissement" WHERE nom='The University of Abidjan'`).Scan(&sc.etabID)
        if err != nil {
                return nil, fmt.Errorf("établissement introuvable: %w", err)
        }
        for email, dst := range map[string]*string{
                "ulrichdouh@gmail.com":     &sc.adminID,
                "registrar@uniabidjan.com": &sc.respID,
                "prof01@uniabidjan.com":    &sc.profID,
        } {
                if err := conn.QueryRow(ctx, `SELECT id FROM "User" WHERE email=$1`, email).Scan(dst); err != nil {
                        return nil, fmt.Errorf("user %s introuvable: %w", email, err)
                }
        }

        err = conn.QueryRow(ctx, `SELECT id FROM "Filiere" WHERE code='INFO' AND "etablissementId"=$1`, sc.etabID).Scan(&sc.filiereINFO)
        if err != nil {
                return nil, fmt.Errorf("filière INFO introuvable: %w", err)
        }
        _ = conn.QueryRow(ctx, `SELECT id FROM "Filiere" WHERE code='SEG' AND "etablissementId"=$1`, sc.etabID).Scan(&sc.filiereSEG)

        for code, dst := range map[string]*string{
                "UE-INFO-L204": &sc.ueGL,
                "UE-INFO-L203": &sc.uePython,
        } {
                if err := conn.QueryRow(ctx, `SELECT id FROM "UniteEnseignement" WHERE code=$1`, code).Scan(dst); err != nil {
                        return nil, fmt.Errorf("UE %s introuvable: %w", code, err)
                }
        }

        // Étudiants
        rows, err := conn.Query(ctx, `
                SELECT u.email, u.id, COALESCE(u.niveau::text,''), COALESCE(u."filiereId",'')
                FROM "User" u
                WHERE u.role='ETUDIANT' AND u."deletedAt" IS NULL AND u.email LIKE '%@uniabidjan.com'`)
        if err != nil {
                return nil, err
        }
        for rows.Next() {
                var email, id, niveau, fid string
                if err := rows.Scan(&email, &id, &niveau, &fid); err != nil {
                        rows.Close()
                        return nil, err
                }
                sc.allStudents[email] = id
                if niveau == "L2" && fid == sc.filiereINFO {
                        sc.students[email] = id
                }
        }
        rows.Close()
        if len(sc.students) < 4 {
                return nil, fmt.Errorf("attendu ≥4 étudiants INFO L2, trouvé %d", len(sc.students))
        }

        // Documents + UE
        rows, err = conn.Query(ctx, `
                SELECT d.id, COALESCE(d."nomFichier",''), COALESCE(d."cheminStockage",''),
                       COALESCE(d."contenuTexte",''), COALESCE(d."tailleFichier",0), COALESCE(d."uniteEnseignementId",'')
                FROM "Document" d WHERE d."deletedAt" IS NULL ORDER BY d."createdAt"`)
        if err != nil {
                return nil, err
        }
        for rows.Next() {
                d := docRow{}
                var ue string
                if err := rows.Scan(&d.id, &d.nomFichier, &d.cheminStockage, &d.contenuTexte, &d.taille, &ue); err != nil {
                        rows.Close()
                        return nil, err
                }
                sc.docs = append(sc.docs, d)
                sc.docByUE[ue] = append(sc.docByUE[ue], d)
        }
        rows.Close()

        // Chapitres
        rows, err = conn.Query(ctx, `
                SELECT c.id, c."documentId", COALESCE(c.titre,''), COALESCE(c.ordre,0)
                FROM "Chapter" c JOIN "Document" d ON d.id=c."documentId"
                WHERE d."deletedAt" IS NULL ORDER BY c."documentId", c.ordre`)
        if err != nil {
                return nil, err
        }
        for rows.Next() {
                c := chapterRef{}
                if err := rows.Scan(&c.id, &c.docID, &c.titre, &c.ordre); err != nil {
                        rows.Close()
                        return nil, err
                }
                sc.chapters[c.docID] = append(sc.chapters[c.docID], c)
        }
        rows.Close()

        // Audios
        rows, err = conn.Query(ctx, `
                SELECT id, COALESCE("documentId",''), COALESCE(script,''), COALESCE("r2Key",'')
                FROM "DocumentAudio" ORDER BY id`)
        if err != nil {
                return nil, err
        }
        for rows.Next() {
                a := audioRow{}
                if err := rows.Scan(&a.id, &a.docID, &a.script, &a.r2Key); err != nil {
                        rows.Close()
                        return nil, err
                }
                sc.audios = append(sc.audios, a)
        }
        rows.Close()

        // Épreuves CLOTUREE
        rows, err = conn.Query(ctx, `SELECT id FROM "Epreuve" WHERE statut='CLOTUREE' ORDER BY "dateDebut"`)
        if err != nil {
                return nil, err
        }
        for rows.Next() {
                var id string
                if err := rows.Scan(&id); err != nil {
                        rows.Close()
                        return nil, err
                }
                sc.epreuvesCloturees = append(sc.epreuvesCloturees, id)
        }
        rows.Close()

        // Questions IA réelles (épreuve PLANIFIEE)
        rows, err = conn.Query(ctx, `
                SELECT q.id FROM "Question" q
                JOIN "EpreuveQuestion" eq ON eq."questionId"=q.id
                WHERE q."deletedAt" IS NULL ORDER BY q.id LIMIT 3`)
        if err != nil {
                return nil, err
        }
        for rows.Next() {
                var id string
                if err := rows.Scan(&id); err != nil {
                        rows.Close()
                        return nil, err
                }
                sc.iaQuestions = append(sc.iaQuestions, id)
        }
        rows.Close()

        return sc, nil
}

func printContext(sc *seedContext) {
        fmt.Printf("Établissement : %s (The University of Abidjan)\n", short(sc.etabID))
        fmt.Printf("ADMIN/RESPONSABLE/ENSEIGNANT : %s / %s / %s\n", short(sc.adminID), short(sc.respID), short(sc.profID))
        fmt.Printf("Filières : INFO=%s SEG=%s | UE GL=%s Python=%s\n", short(sc.filiereINFO), short(sc.filiereSEG), short(sc.ueGL), short(sc.uePython))
        fmt.Printf("Documents : %d | chapitres : %d | audios : %d | épreuves CLOTUREE : %d\n",
                len(sc.docs), countChapters(sc), len(sc.audios), len(sc.epreuvesCloturees))
        fmt.Printf("Étudiants INFO L2 : %d\n", len(sc.students))
}

func countChapters(sc *seedContext) int {
        n := 0
        for _, cs := range sc.chapters {
                n += len(cs)
        }
        return n
}

func short(id string) string {
        if len(id) <= 8 {
                return id
        }
        return id[:8] + "…"
}

func short6(id string) string {
        if len(id) <= 6 {
                return id
        }
        return id[len(id)-6:]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper transactions + claims RLS (réplique de db.SetClaimsTx)
// ─────────────────────────────────────────────────────────────────────────────

func pgEscape(s string) string {
        return strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `'`, `''`)
}

func withClaims(ctx context.Context, conn *pgx.Conn, c seedClaims, fn func(tx pgx.Tx) error) error {
        tx, err := conn.Begin(ctx)
        if err != nil {
                return err
        }
        defer func() { _ = tx.Rollback(ctx) }() // no-op si commit

        setters := []string{
                fmt.Sprintf("SET LOCAL app.claims.user_id = '%s'", pgEscape(c.userID)),
                fmt.Sprintf("SET LOCAL app.claims.role = '%s'", pgEscape(c.role)),
                fmt.Sprintf("SET LOCAL app.claims.etablissement_id = '%s'", pgEscape(c.etabID)),
        }
        if c.filiereID != "" {
                setters = append(setters, fmt.Sprintf("SET LOCAL app.claims.filiere_id = '%s'", pgEscape(c.filiereID)))
        }
        for _, s := range setters {
                if _, err := tx.Exec(ctx, s); err != nil {
                        return fmt.Errorf("set claims: %w", err)
                }
        }
        if err := fn(tx); err != nil {
                return err
        }
        return tx.Commit(ctx)
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — RÉPARATION
// ─────────────────────────────────────────────────────────────────────────────

type qStat struct {
        oldID, newID, qtype, difficulte, reponseCorrecte string
        n                                                int
}

func phaseRepair(ctx context.Context, conn *pgx.Conn, sc *seedContext) error {
        // 1a. Classification des questions orphelines d'après les réponses réelles
        stats, err := classifyQuestions(ctx, conn)
        if err != nil {
                return err
        }
        fmt.Printf("questions orphelines détectées : %d (%s…)\n", len(stats), strings.Join(firstN(stats, 5), ", "))

        // 1b. Remap des réponses qN → seedq_NNN (idempotent : le regex ne rematch plus)
        ct, err := conn.Exec(ctx, `
                UPDATE "Reponse" SET "questionId" = 'seedq_' || lpad(substring("questionId" from 2), 3, '0')
                WHERE "questionId" ~ '^q[0-9]+$'`)
        if err != nil {
                return fmt.Errorf("remap Reponse: %w", err)
        }
        fmt.Printf("réponses remappées qN → seedq_NNN : %d lignes\n", ct.RowsAffected())

        // 1c. Banque de questions (idempotent)
        sys := systemClaims()
        err = withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                for _, st := range stats {
                        qc := buildQuestionContent(st)
                        var propositions, reponseCorrecte any
                        if qc.propositionsJSON != "" {
                                propositions = qc.propositionsJSON
                        }
                        if st.reponseCorrecte != "" {
                                reponseCorrecte = st.reponseCorrecte
                        }
                        _, err := tx.Exec(ctx, `
                                INSERT INTO "Question" ("id","type","enonce","propositions","reponseCorrecte","explication",
                                        "difficulte","auteurId","validee","langue","createdAt","updatedAt")
                                VALUES ($1,$2::"TypeQuestion",$3,$4,$5,$6,$7::"Difficulte",$8,true,'fr',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                                ON CONFLICT (id) DO NOTHING`,
                                st.newID, st.qtype, qc.enonce, propositions, reponseCorrecte, qc.explication,
                                st.difficulte, sc.profID)
                        if err != nil {
                                return fmt.Errorf("insert question %s: %w", st.newID, err)
                        }
                }
                return nil
        })
        if err != nil {
                return err
        }
        fmt.Printf("banque de questions créée : %d questions (QCU/QCM/QRC)\n", len(stats))

        // 1d. Liens EpreuveQuestion (visibilité des questions pour les étudiants)
        nLinks := 0
        baremeByType := map[string]float64{"QRC": 2.0, "QCU": 1.0, "QCM": 1.0}
        err = withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                for _, ep := range sc.epreuvesCloturees {
                        rows, err := tx.Query(ctx, `
                                SELECT DISTINCT r."questionId" FROM "Reponse" r
                                JOIN "SessionPassation" sp ON sp.id=r."sessionId"
                                WHERE sp."epreuveId"=$1 AND r."questionId" ~ '^seedq_[0-9]{3}$'`, ep)
                        if err != nil {
                                return err
                        }
                        var qids []string
                        for rows.Next() {
                                var q string
                                if err := rows.Scan(&q); err != nil {
                                        rows.Close()
                                        return err
                                }
                                qids = append(qids, q)
                        }
                        rows.Close()
                        sort.Strings(qids)
                        for i, q := range qids {
                                n, _ := strconv.Atoi(q[len(q)-3:])
                                bareme := 1.0
                                for _, st := range stats {
                                        if st.n == n {
                                                bareme = baremeByType[st.qtype]
                                        }
                                }
                                ct, err := tx.Exec(ctx, `
                                        INSERT INTO "EpreuveQuestion" ("id","epreuveId","questionId","bareme","ordre")
                                        SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (
                                                SELECT 1 FROM "EpreuveQuestion" WHERE "epreuveId"=$2 AND "questionId"=$3)`,
                                        fmt.Sprintf("seed_epq_%s_%s", short6(ep), q), ep, q, bareme, i+1)
                                if err != nil {
                                        return fmt.Errorf("insert EpreuveQuestion: %w", err)
                                }
                                nLinks += int(ct.RowsAffected())
                        }
                }
                return nil
        })
        if err != nil {
                return err
        }
        fmt.Printf("liens EpreuveQuestion créés : %d (épreuves CLOTUREE)\n", nLinks)

        // 1e. DocumentAudio : userId orphelin → prof01
        err = withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                ct, err := tx.Exec(ctx, `UPDATE "DocumentAudio" SET "userId"=$1, "updatedAt"=CURRENT_TIMESTAMP
                        WHERE "userId" NOT IN (SELECT id FROM "User")`, sc.profID)
                if err != nil {
                        return err
                }
                fmt.Printf("DocumentAudio.userId orphelins corrigés : %d\n", ct.RowsAffected())
                return nil
        })
        if err != nil {
                return fmt.Errorf("repair DocumentAudio: %w", err)
        }

        // 1f. Établissement : drapeaux de validation (démo prête)
        err = withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                _, err := tx.Exec(ctx, `UPDATE "Etablissement" SET "emailVerified"=true, "adminValidated"=true,
                        "updatedAt"=CURRENT_TIMESTAMP WHERE id=$1`, sc.etabID)
                return err
        })
        if err != nil {
                return fmt.Errorf("drapeaux établissement: %w", err)
        }
        fmt.Println("établissement : emailVerified + adminValidated → true")

        // 1g. UE : niveaux étendus L2+L3 (visibilité des documents)
        err = withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                ct, err := tx.Exec(ctx, `UPDATE "UniteEnseignement" SET niveaux='["L2","L3"]', "updatedAt"=CURRENT_TIMESTAMP
                        WHERE niveaux IS NULL AND niveau='L2'`)
                if err != nil {
                        return err
                }
                fmt.Printf("UE élargies aux niveaux L2+L3 : %d\n", ct.RowsAffected())
                return nil
        })
        return err
}

func classifyQuestions(ctx context.Context, conn *pgx.Conn) ([]qStat, error) {
        rows, err := conn.Query(ctx, `
                SELECT "questionId", COALESCE(contenu,''), COALESCE(score,0)
                FROM "Reponse" WHERE "questionId" ~ '^q[0-9]+$'`)
        if err != nil {
                return nil, err
        }
        defer rows.Close()

        type agg struct {
                isArray, isLetter, isText bool
                best                      string
                bestSum                   float64
        }
        byQ := map[string]*agg{}
        for rows.Next() {
                var qid, contenu string
                var score float64
                if err := rows.Scan(&qid, &contenu, &score); err != nil {
                        return nil, err
                }
                a := byQ[qid]
                if a == nil {
                        a = &agg{}
                        byQ[qid] = a
                }
                c := strings.TrimSpace(contenu)
                switch {
                case strings.HasPrefix(c, "["):
                        a.isArray = true
                case len(c) == 1 && strings.Contains("ABCDE", c):
                        a.isLetter = true
                default:
                        a.isText = true
                }
                if score > a.bestSum {
                        a.bestSum = score
                        a.best = c
                }
        }

        var stats []qStat
        for qid, a := range byQ {
                n, _ := strconv.Atoi(qid[1:])
                st := qStat{oldID: qid, newID: fmt.Sprintf("seedq_%03d", n), n: n}
                switch {
                case a.isArray:
                        st.qtype = "QCM"
                        letters := parseLetters(a.best)
                        if len(letters) == 0 {
                                letters = []string{"A", "C"}
                        }
                        b, _ := json.Marshal(letters)
                        st.reponseCorrecte = string(b)
                case a.isLetter:
                        st.qtype = "QCU"
                        st.reponseCorrecte = a.best
                        if st.reponseCorrecte == "" || !strings.Contains("ABCDE", st.reponseCorrecte) {
                                st.reponseCorrecte = "B"
                        }
                default:
                        st.qtype = "QRC"
                }
                switch {
                case n <= 10:
                        st.difficulte = "FACILE"
                case n <= 20:
                        st.difficulte = "MOYEN"
                default:
                        st.difficulte = "DIFFICILE"
                }
                stats = append(stats, st)
        }
        sort.Slice(stats, func(i, j int) bool { return stats[i].n < stats[j].n })
        return stats, nil
}

func parseLetters(s string) []string {
        var arr []string
        if err := json.Unmarshal([]byte(s), &arr); err != nil {
                return nil
        }
        var out []string
        for _, l := range arr {
                l = strings.TrimSpace(strings.ToUpper(l))
                if len(l) == 1 && strings.Contains("ABCDE", l) {
                        out = append(out, l)
                }
        }
        return out
}

func firstN(stats []qStat, n int) []string {
        var out []string
        for i, s := range stats {
                if i >= n {
                        break
                }
                out = append(out, s.oldID)
        }
        return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Banque de contenus (français, transversale — cohérente avec les réponses)
// ─────────────────────────────────────────────────────────────────────────────

type qContent struct {
        enonce           string
        propositionsJSON string
        explication      string
}

type bankEntry struct {
        enonce      string
        correct     string   // QCU
        corrects    []string // QCM
        distractors []string
        explication string
}

func buildQuestionContent(st qStat) qContent {
        if st.qtype == "QRC" {
                c := qrcBank[(st.n-1)%len(qrcBank)]
                return qContent{enonce: c.enonce, explication: c.explication}
        }
        if st.qtype == "QCM" {
                c := qcmBank[(st.n-1)%len(qcmBank)]
                letters := parseLetters(st.reponseCorrecte)
                if len(letters) == 0 {
                        letters = []string{"A", "C"}
                }
                props := make([]map[string]any, 0, 5)
                usedCorrect := 0
                for _, l := range "ABCDE" {
                        isCorrect := false
                        for _, bl := range letters {
                                if string(bl) == string(l) {
                                        isCorrect = true
                                }
                        }
                        text := ""
                        if isCorrect {
                                if usedCorrect < len(c.corrects) {
                                        text = c.corrects[usedCorrect]
                                } else {
                                        text = "Cette pratique est effectivement recommandée par la méthodologie"
                                }
                                usedCorrect++
                        } else {
                                idx := 0
                                for _, dl := range letters {
                                        if string(dl) < string(l) {
                                                idx++
                                        }
                                }
                                if idx < len(c.distractors) {
                                        text = c.distractors[idx]
                                } else {
                                        text = "Aucune de ces affirmations n'est exacte"
                                }
                        }
                        props = append(props, map[string]any{"isCorrect": isCorrect, "text": text})
                }
                b, _ := json.Marshal(props)
                return qContent{enonce: c.enonce, propositionsJSON: string(b), explication: c.explication}
        }
        // QCU
        c := qcuBank[(st.n-1)%len(qcuBank)]
        letter := st.reponseCorrecte
        if letter == "" {
                letter = "B"
        }
        idx := int(letter[0] - 'A')
        if idx < 0 || idx > 3 {
                idx = 1
        }
        props := make([]map[string]any, 0, 4)
        usedD := 0
        for i := 0; i < 4; i++ {
                text := ""
                isCorrect := i == idx
                if isCorrect {
                        text = c.correct
                } else {
                        if usedD < len(c.distractors) {
                                text = c.distractors[usedD]
                                usedD++
                        } else {
                                text = "Aucune de ces réponses n'est pertinente"
                        }
                }
                props = append(props, map[string]any{"isCorrect": isCorrect, "text": text})
        }
        b, _ := json.Marshal(props)
        return qContent{enonce: c.enonce, propositionsJSON: string(b), explication: c.explication}
}

var qcuBank = []bankEntry{
        {enonce: "Avant de commencer un exercice, quelle étape garantit une réponse adaptée ?",
                correct:     "Lire attentivement l'énoncé et identifier les mots-clés",
                distractors: []string{"Répondre immédiatement par intuition", "Recopier un exercice similaire", "Passer directement à la question suivante"},
                explication: "L'analyse de l'énoncé conditionne toute la démarche : mots-clés, contraintes et attendus."},
        {enonce: "Que signifie analyser un document de cours de façon critique ?",
                correct:     "Distinguer les faits des opinions et vérifier les sources",
                distractors: []string{"Accepter tout le contenu sans le questionner", "Rechercher uniquement les définitions", "Mémoriser le texte mot à mot"},
                explication: "L'esprit critique croise les affirmations avec des sources fiables avant de les adopter."},
        {enonce: "Quelle pratique améliore durablement la mémorisation ?",
                correct:     "La répétition espacée dans le temps",
                distractors: []string{"La relecture intensive la veille de l'examen", "Le surlignage systématique du cours", "L'écoute passive du cours enregistré"},
                explication: "Les répétitions espacées consolident la trace mémoire (courbe de l'oubli)."},
        {enonce: "Dans un raisonnement structuré, à quoi sert la conclusion ?",
                correct:     "À synthétiser les arguments et répondre au problème posé",
                distractors: []string{"À introduire un nouvel argument", "À répéter intégralement l'introduction", "À lister les sources utilisées"},
                explication: "La conclusion répond à la question initiale sans introduire d'idée nouvelle."},
        {enonce: "Comment gérer au mieux son temps pendant une évaluation ?",
                correct:     "Traiter d'abord les questions maîtrisées puis revenir sur les autres",
                distractors: []string{"Consacrer tout le temps à la première question", "Répondre au hasard aux questions difficiles", "Recopier l'énoncé avant chaque réponse"},
                explication: "Sécuriser les points acquis avant d'investir le temps restant sur les difficultés."},
        {enonce: "Un classement pertinent d'éléments repose sur…",
                correct:     "des critères clairs, mutuellement exclusifs et exhaustifs",
                distractors: []string{"l'ordre d'apparition dans le document", "la longueur des éléments", "des préférences personnelles"},
                explication: "De bons critères évitent les chevauchements et couvrent tous les cas."},
        {enonce: "Que doit contenir une bonne prise de notes ?",
                correct:     "Les idées structurées avec des exemples et des repères",
                distractors: []string{"La transcription intégrale du cours", "Uniquement les titres des chapitres", "Les remarques hors sujet du professeur"},
                explication: "Une note utile hiérarchise l'information et l'illustre d'exemples."},
        {enonce: "En travail de groupe, la répartition des rôles sert surtout à…",
                correct:     "clarifier les responsabilités et éviter les doublons",
                distractors: []string{"décider qui aura la meilleure note", "réduire la communication entre membres", "éviter de se réunir"},
                explication: "Des rôles explicites augmentent l'efficacité et la redevabilité du groupe."},
        {enonce: "Face à un résultat surprenant, l'attitude scientifique consiste à…",
                correct:     "vérifier les données et chercher une explication avant de conclure",
                distractors: []string{"rejeter le résultat sans l'examiner", "modifier les données pour confirmer l'hypothèse", "conclure immédiatement à une erreur d'énoncé"},
                explication: "La vérification précède toute interprétation : rigueur d'abord."},
        {enonce: "Un plan dialectique suit quelle progression ?",
                correct:     "Thèse, antithèse, synthèse",
                distractors: []string{"Introduction, liste, conclusion", "Cause, effet, répétition", "Exemple, définition, exercice"},
                explication: "Le plan dialectique confronte les points de vue avant de les dépasser."},
        {enonce: "Laquelle de ces sources est la plus fiable pour un travail académique ?",
                correct:     "Un article évalué par les pairs dans une revue scientifique",
                distractors: []string{"Un forum de discussion anonyme", "Une page de réseau social", "Un blog personnel sans référence"},
                explication: "La révision par les pairs reste le gold standard de la fiabilité académique."},
        {enonce: "Traduire un problème en étapes résolubles s'appelle…",
                correct:     "la décomposition du problème",
                distractors: []string{"la mémorisation du problème", "la reformulation du problème", "la simplification de la réponse"},
                explication: "Décomposer permet de traiter chaque sous-problème isolément."},
}

var qcmBank = []bankEntry{
        {enonce: "Quelles pratiques préparent efficacement un examen ? (plusieurs réponses)",
                corrects:    []string{"Établir un plan de révision étalé dans le temps", "S'auto-évaluer avec des exercices types", "Alternér les matières lors des sessions"},
                distractors: []string{"Relire le cours une seule fois la veille", "Éviter les exercices pour ne pas se décourager"},
                explication: "Espacement, auto-évaluation et alternance sont les trois leviers cognitifs validés."},
        {enonce: "Un bon compte rendu doit être… (plusieurs réponses)",
                corrects:    []string{"Objectif et factuel", "Structuré en parties claires"},
                distractors: []string{"Subjectif et impressionniste", "Exhaustif au point de noyer l'essentiel"},
                explication: "Le compte rendu restitue fidèlement, sans jugement personnel superflu."},
        {enonce: "Quels éléments renforcent la crédibilité d'une argumentation ? (plusieurs réponses)",
                corrects:    []string{"Des données vérifiables", "Des sources citées précisément", "Des exemples concrets"},
                distractors: []string{"Un vocabulaire soutenu hors sujet", "Des affirmations répétées avec insistance"},
                explication: "La preuve prime sur la rhétorique : données, sources, exemples."},
        {enonce: "La recherche documentaire efficace combine… (plusieurs réponses)",
                corrects:    []string{"Des mots-clés pertinents", "Le croisement de plusieurs sources"},
                distractors: []string{"Le premier résultat trouvé", "Une lecture uniquement en diagonale"},
                explication: "Croiser les sources limite les biais et affine la recherche."},
        {enonce: "Quelles stratégies aident à comprendre un concept difficile ? (plusieurs réponses)",
                corrects:    []string{"Le reformuler avec ses propres mots", "Chercher un exemple d'application", "L'expliquer à un camarade"},
                distractors: []string{"Le réciter sans le comprendre", "Éviter les exercices sur ce concept"},
                explication: "Réformulation, application et enseignement sont des techniques actives éprouvées."},
}

var qrcBank = []bankEntry{
        {enonce: "Expliquez la différence entre mémoriser et comprendre.", explication: "Comprendre permet de reconstituer et transférer ; mémoriser ne restitue que."},
        {enonce: "Décrivez votre méthode pour réviser un chapitre difficile.", explication: "Attente : décomposition, espacement, auto-test, retour sur erreurs."},
        {enonce: "Pourquoi est-il utile de reformuler un concept avec ses propres mots ?", explication: "La reformulation révèle les angles morts et ancre la compréhension."},
        {enonce: "Donnez un exemple où la rigueur méthodologique a évité une erreur.", explication: "Exemple type : vérification d'une donnée douteuse avant conclusion."},
        {enonce: "Quels critères utilisez-vous pour juger la qualité d'une source ?", explication: "Autorité, date, provenance, recoupement."},
        {enonce: "Expliquez l'intérêt de faire des exercices variés plutôt que répétés.", explication: "La variété développe le transfert et la reconnaissance des contextes."},
        {enonce: "Comment le travail en équipe influence-t-il l'apprentissage ?", explication: "Explication mutuelle, conflits sociocognitifs, redevabilité."},
        {enonce: "Décrivez les étapes entre la lecture d'un énoncé et la rédaction de la réponse.", explication: "Analyse, plan, traitement, vérification, rédaction."},
        {enonce: "En quoi l'auto-évaluation améliore-t-elle les résultats ?", explication: "Elle génère un feedback interne et oriente les révisions."},
        {enonce: "Expliquez ce que « distinguer l'essentiel de l'accessoire » signifie dans un cours.", explication: "Hiérarchiser selon les objectifs et les notions structurantes."},
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — COMPLÉTION
// ─────────────────────────────────────────────────────────────────────────────

func phaseComplete(ctx context.Context, conn *pgx.Conn, sc *seedContext) error {
        sys := systemClaims()

        // Étudiants impliqués (ordre stable)
        var stuEmails []string
        for e := range sc.students {
                stuEmails = append(stuEmails, e)
        }
        sort.Strings(stuEmails)
        demoStudents := stuEmails[:4] // zougmore, sambake, assielou.tanoh, aka.ncho (ordre alpha)

        // 2a. EtablissementAccess : accès APPROUVE pour l'ADMIN PaaS
        err := withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                ct, err := tx.Exec(ctx, `
                        INSERT INTO "EtablissementAccess" ("id","adminId","etablissementId","motif","statut",
                                "dateDebut","approuvePar","commentaire","createdAt","updatedAt")
                        SELECT $1,$2,$3,$4,'APPROUVE',CURRENT_TIMESTAMP - interval '30 days',$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
                        WHERE NOT EXISTS (SELECT 1 FROM "EtablissementAccess" WHERE "adminId"=$2 AND "etablissementId"=$3)`,
                        "seed_eaccess_01", sc.adminID, sc.etabID,
                        "Accès support — suivi du paramétrage de l'établissement (démo)",
                        sc.respID, "Validé par le registrar lors de la mise en route.")
                if err != nil {
                        return err
                }
                fmt.Printf("EtablissementAccess (APPROUVE) : %d ligne\n", ct.RowsAffected())
                return nil
        })
        if err != nil {
                return fmt.Errorf("etablissement access: %w", err)
        }

        // 2b. ReviewItems (SRS) — claims ETUDIANT par étudiant
        type srsState struct {
                interval  int
                ease      float64
                reps      int
                mastery   float64
                lastDays  int // 0 = jamais
                nextShift int // heures relatives à maintenant
        }
        states := []srsState{
                {interval: 1, ease: 2.3, reps: 2, mastery: 0.25, lastDays: -2, nextShift: -2},
                {interval: 1, ease: 2.5, reps: 1, mastery: 0.10, lastDays: -1, nextShift: 0}, // légèrement dû
                {interval: 6, ease: 2.6, reps: 4, mastery: 0.65, lastDays: -3, nextShift: 72},
                {interval: 21, ease: 2.8, reps: 7, mastery: 0.92, lastDays: -9, nextShift: 288},
                {interval: 0, ease: 2.5, reps: 0, mastery: 0.0, lastDays: 0, nextShift: 1},
                {interval: 10, ease: 2.55, reps: 5, mastery: 0.80, lastDays: -4, nextShift: 168},
        }
        nSRS := 0
        for si, email := range demoStudents {
                uid := sc.students[email]
                // 6 chapitres de 6 documents différents (rotation)
                var chapters []chapterRef
                for di, d := range sc.docs {
                        cs := sc.chapters[d.id]
                        if len(cs) == 0 {
                                continue
                        }
                        pick := (si + di) % len(cs)
                        chapters = append(chapters, cs[pick])
                        if len(chapters) == len(states) {
                                break
                        }
                }
                etud := seedClaims{userID: uid, role: "ETUDIANT", etabID: sc.etabID, filiereID: sc.filiereINFO}
                err := withClaims(ctx, conn, etud, func(tx pgx.Tx) error {
                        for i, st := range states {
                                if i >= len(chapters) {
                                        break
                                }
                                ch := chapters[i]
                                var lastReviewed any
                                if st.lastDays != 0 {
                                        lastReviewed = time.Now().AddDate(0, 0, st.lastDays)
                                }
                                next := time.Now().Add(time.Duration(st.nextShift) * time.Hour)
                                ct, err := tx.Exec(ctx, `
                                        INSERT INTO "ReviewItem" ("id","userId","chapterId","interval","easeFactor","repetitions",
                                                "lastReviewedAt","nextReviewAt","masteryLevel","createdAt","updatedAt")
                                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                                        ON CONFLICT (id) DO NOTHING`,
                                        fmt.Sprintf("seedrev_%s_%02d", short6(uid), i), uid, ch.id,
                                        st.interval, st.ease, st.reps, lastReviewed, next, st.mastery)
                                if err != nil {
                                        return err
                                }
                                nSRS += int(ct.RowsAffected())
                        }
                        return nil
                })
                if err != nil {
                        return fmt.Errorf("review items (%s): %w", email, err)
                }
        }
        fmt.Printf("ReviewItem (révisions SRS) : %d items — %d étudiants (2 dus, 2 maîtrisés)\n", nSRS, len(demoStudents))

        // 2c. Flashcards — claims ENSEIGNANT prof01 (les flashcards appartiennent au propriétaire du document)
        type flashCard struct{ recto, verso string }
        glCards := []flashCard{
                {"Quelle est la différence entre couplage et cohésion ?", "Le couplage mesure la dépendance ENTRE modules (à minimiser) ; la cohésion mesure la focalisation d'un module sur UNE responsabilité (à maximiser)."},
                {"Qu'est-ce que la dette technique ?", "Le coût différé des raccourcis de conception/implémentation, remboursé par du travail de refactoring ultérieur."},
                {"Que décrit le cycle en V ?", "La correspondance entre chaque phase de spécification (branche descendante) et sa phase de vérification (branche ascendante) : exigences↔tests d'acceptation, conception↔tests intégration…"},
                {"Rôle d'un test unitaire ?", "Vérifier une unité de code isolée (fonction/classe) avec des dépendances contrôlées, pour détecter les régressions tôt."},
                {"Différence entre validation et vérification ?", "Vérification : « construit-on le produit correctement ? » (conforme au cahier des charges). Validation : « construit-on le bon produit ? » (conforme au besoin réel)."},
                {"Qu'est-ce qu'une exigence fonctionnelle ?", "Un comportement attendu du système, exprimé de façon testable (ex : « l'utilisateur peut réinitialiser son mot de passe »)."},
        }
        pyCards := []flashCard{
                {"Quelle est la convention de nommage PEP 8 pour une variable ?", "snake_case en minuscules, explicite (ex : prix_unitaire)."},
                {"Différence entre liste et tuple ?", "Liste : muable, crochets []. Tuple : immuable, parenthèses () — utilisable comme clé de dictionnaire."},
                {"Que renvoie range(2, 10, 3) ?", "2, 5, 8 — début inclus, fin exclue, pas de 3."},
                {"Pourquoi préférer une compréhension de liste ?", "Plus concise et lisible pour transformer/filtrer une séquence : [x*2 for x in lst if x > 0]."},
                {"Qu'est-ce qu'une variable locale non déclarée génère ?", "Une NameError à l'exécution si elle est lue avant toute affectation dans la portée."},
                {"Différence entre = et == ?", "= affecte une valeur à un nom ; == compare l'égalité des valeurs et renvoie un booléen."},
        }
        nFlash := 0
        profClaims := seedClaims{userID: sc.profID, role: "ENSEIGNANT", etabID: sc.etabID}
        err = withClaims(ctx, conn, profClaims, func(tx pgx.Tx) error {
                sets := []struct {
                        ue    string
                        cards []flashCard
                }{{sc.ueGL, glCards}, {sc.uePython, pyCards}}
                idx := 0
                for _, set := range sets {
                        docs := sc.docByUE[set.ue]
                        for ci, card := range set.cards {
                                doc := docs[ci%len(docs)]
                                chs := sc.chapters[doc.id]
                                var chID any
                                if len(chs) > 0 {
                                        chID = chs[ci%len(chs)].id
                                }
                                ct, err := tx.Exec(ctx, `
                                        INSERT INTO "Flashcard" ("id","chapterId","documentId","recto","verso","createdAt")
                                        VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
                                        ON CONFLICT (id) DO NOTHING`,
                                        fmt.Sprintf("seedflash_%03d", idx+1), chID, doc.id, card.recto, card.verso)
                                if err != nil {
                                        return err
                                }
                                nFlash += int(ct.RowsAffected())
                                idx++
                        }
                }
                return nil
        })
        if err != nil {
                return fmt.Errorf("flashcards: %w", err)
        }
        fmt.Printf("Flashcard : %d cartes (Génie Logiciel + Python, prof01)\n", nFlash)

        // 2d. StudySessions — 2 par étudiant (1 passée TERMINEE, 1 future PLANIFIEE)
        nSess := 0
        for si, email := range demoStudents {
                uid := sc.students[email]
                docs := sc.docs
                d1 := docs[si%len(docs)]
                d2 := docs[(si+3)%len(docs)]
                type sessDef struct {
                        id, statut string
                        start      time.Time
                        duree      int
                }
                defs := []sessDef{
                        {id: fmt.Sprintf("seedsess_%s_1", short6(uid)), statut: "TERMINEE", start: time.Now().Add(-48 * time.Hour), duree: 45},
                        {id: fmt.Sprintf("seedsess_%s_2", short6(uid)), statut: "PLANIFIEE", start: time.Now().Add(48 * time.Hour), duree: 60},
                }
                var chIds []string
                for _, c := range sc.chapters[d1.id][:2] {
                        chIds = append(chIds, c.id)
                }
                chJSON, _ := json.Marshal(chIds)
                etud := seedClaims{userID: uid, role: "ETUDIANT", etabID: sc.etabID, filiereID: sc.filiereINFO}
                err := withClaims(ctx, conn, etud, func(tx pgx.Tx) error {
                        for i, def := range defs {
                                doc := d1
                                if i == 1 {
                                        doc = d2 // session planifiée sur un autre document
                                }
                                titre := fmt.Sprintf("Révision — %s", strings.TrimSuffix(doc.nomFichier, ".pdf"))
                                ct, err := tx.Exec(ctx, `
                                        INSERT INTO "StudySession" ("id","userId","documentId","chapterIds","titre","dateDebut","dureeMin","statut","createdAt","updatedAt")
                                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                                        ON CONFLICT (id) DO NOTHING`,
                                        def.id, uid, doc.id, string(chJSON), titre, def.start, def.duree, def.statut)
                                if err != nil {
                                        return err
                                }
                                nSess += int(ct.RowsAffected())
                        }
                        return nil
                })
                if err != nil {
                        return fmt.Errorf("study sessions (%s): %w", email, err)
                }
        }
        fmt.Printf("StudySession : %d sessions (passées + à venir)\n", nSess)

        // 2e. PracticeAttempts — avec lacunes volontaires sur 2 chapitres
        type paDef struct {
                id, qid, docID, chID, reponse, feedback string
                score                                   float64
                correct                                 bool
                duree                                   int
                createdDays                             int
        }
        var paDefs []paDef
        // questions QCU de la banque (seedq_001, seedq_003) + QRC (seedq_017)
        qcu1, qcu2, qrc1 := "seedq_001", "seedq_003", "seedq_017"
        if len(sc.iaQuestions) > 0 {
                _ = sc.iaQuestions[0]
        }
        for si, email := range demoStudents {
                uid := sc.students[email]
                docs := sc.docs
                dWeak := docs[(si+2)%len(docs)] // document « faible » → lacune
                chsWeak := sc.chapters[dWeak.id]
                dGood := docs[(si+4)%len(docs)]
                chsGood := sc.chapters[dGood.id]
                if len(chsWeak) == 0 || len(chsGood) == 0 {
                        continue
                }
                chWeak := chsWeak[si%len(chsWeak)]
                chGood := chsGood[si%len(chsGood)]
                base := fmt.Sprintf("seedpa_%s", short6(uid))
                // 2 tentatives faibles sur le même chapitre → lacune (avg < 0.5)
                if si < 2 {
                        paDefs = append(paDefs,
                                paDef{id: base + "_1", qid: qcu1, docID: dWeak.id, chID: chWeak.id, reponse: "A",
                                        score: 0.0, correct: false, duree: 95, createdDays: -6, feedback: "Réponse incorrecte — relisez la méthode d'analyse de l'énoncé."},
                                paDef{id: base + "_2", qid: qcu2, docID: dWeak.id, chID: chWeak.id, reponse: "C",
                                        score: 0.3, correct: false, duree: 140, createdDays: -4, feedback: "Réponse partielle — la distinction faits/opinions mérite d'être approfondie."})
                }
                // 2 bonnes + 1 QRC sur le chapitre maîtrisé
                paDefs = append(paDefs,
                        paDef{id: base + "_3", qid: qcu1, docID: dGood.id, chID: chGood.id, reponse: "B",
                                score: 1.0, correct: true, duree: 40, createdDays: -3, feedback: "Exact ! L'analyse des mots-clés est la première étape."},
                        paDef{id: base + "_4", qid: qcu2, docID: dGood.id, chID: chGood.id, reponse: "B",
                                score: 1.0, correct: true, duree: 55, createdDays: -3, feedback: "Parfait — l'esprit critique vérifie toujours les sources."},
                        paDef{id: base + "_5", qid: qrc1, docID: dGood.id, chID: chGood.id, reponse: "Mémoriser restitue, comprendre permet de reconstituer et d'appliquer.",
                                score: 0.8, correct: false, duree: 210, createdDays: -2, feedback: "Bonne distinction — illustrez avec un exemple pour aller plus loin."})
        }
        nPA := 0
        for _, email := range demoStudents {
                uid := sc.students[email]
                etud := seedClaims{userID: uid, role: "ETUDIANT", etabID: sc.etabID, filiereID: sc.filiereINFO}
                err := withClaims(ctx, conn, etud, func(tx pgx.Tx) error {
                        for _, p := range paDefs {
                                if !strings.HasPrefix(p.id, "seedpa_"+short6(uid)) {
                                        continue
                                }
                                created := time.Now().AddDate(0, 0, p.createdDays)
                                ct, err := tx.Exec(ctx, `
                                        INSERT INTO "PracticeAttempt" ("id","userId","questionId","documentId","chapterId","reponse","score","feedback","correct","dureeSec","createdAt")
                                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                                        ON CONFLICT (id) DO NOTHING`,
                                        p.id, uid, p.qid, p.docID, p.chID, p.reponse, p.score, p.feedback, p.correct, p.duree, created)
                                if err != nil {
                                        return err
                                }
                                nPA += int(ct.RowsAffected())
                        }
                        return nil
                })
                if err != nil {
                        return fmt.Errorf("practice attempts (%s): %w", email, err)
                }
        }
        fmt.Printf("PracticeAttempt : %d tentatives (dont lacunes volontaires)\n", nPA)

        // 2f. HelpThread + HelpMessage (zougmore — document Python)
        if uid, ok := sc.students["zougmore.maimounata@uniabidjan.com"]; ok {
                pyDocs := sc.docByUE[sc.uePython]
                if len(pyDocs) > 0 && len(sc.chapters[pyDocs[0].id]) > 1 {
                        doc := pyDocs[0]
                        ch1 := sc.chapters[doc.id][0]
                        ch2 := sc.chapters[doc.id][1]
                        etud := seedClaims{userID: uid, role: "ETUDIANT", etabID: sc.etabID, filiereID: sc.filiereINFO}
                        err = withClaims(ctx, conn, etud, func(tx pgx.Tx) error {
                                if _, err := tx.Exec(ctx, `
                                        INSERT INTO "HelpThread" ("id","documentId","chapterId","etudiantId","enseignantId","statut","sujet","passageContext","createdAt","updatedAt")
                                        VALUES ('seedhelp_001',$1,$2,$3,NULL,'OUVERT',$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                                        ON CONFLICT (id) DO NOTHING`,
                                        doc.id, ch1.id, uid, "Différence entre liste et tuple ?",
                                        "Le polycopié dit que les tuples sont immuables, mais je ne vois pas pourquoi choisir un tuple plutôt qu'une liste."); err != nil {
                                        return err
                                }
                                if _, err := tx.Exec(ctx, `
                                        INSERT INTO "HelpMessage" ("id","threadId","auteurId","role","content","createdAt")
                                        VALUES ('seedhelpmsg_001','seedhelp_001',$1,'ETUDIANT',$2,CURRENT_TIMESTAMP)
                                        ON CONFLICT (id) DO NOTHING`,
                                        uid, "Bonjour Monsieur, quand doit-on privilégier un tuple au lieu d'une liste ? Merci."); err != nil {
                                        return err
                                }
                                if _, err := tx.Exec(ctx, `
                                        INSERT INTO "HelpThread" ("id","documentId","chapterId","etudiantId","enseignantId","statut","sujet","passageContext","createdAt","updatedAt")
                                        VALUES ('seedhelp_002',$1,$2,$3,$4,'RESOLU',$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                                        ON CONFLICT (id) DO NOTHING`,
                                        doc.id, ch2.id, uid, sc.profID, "Portée des variables dans une fonction",
                                        "Je ne comprends pas pourquoi ma variable définie dans la fonction n'est pas visible à l'extérieur."); err != nil {
                                        return err
                                }
                                if _, err := tx.Exec(ctx, `
                                        INSERT INTO "HelpMessage" ("id","threadId","auteurId","role","content","createdAt")
                                        VALUES ('seedhelpmsg_002','seedhelp_002',$1,'ETUDIANT',$2,CURRENT_TIMESTAMP)
                                        ON CONFLICT (id) DO NOTHING`,
                                        uid, "Ma variable x est définie dans ma fonction mais print(x) échoue dehors. Pourquoi ?"); err != nil {
                                        return err
                                }
                                return nil
                        })
                        if err == nil {
                                err = withClaims(ctx, conn, profClaims, func(tx pgx.Tx) error {
                                        if _, err := tx.Exec(ctx, `
                                                INSERT INTO "HelpMessage" ("id","threadId","auteurId","role","content","createdAt")
                                                VALUES ('seedhelpmsg_003','seedhelp_002',$1,'ENSEIGNANT',$2,CURRENT_TIMESTAMP)
                                                ON CONFLICT (id) DO NOTHING`,
                                                sc.profID, "Une variable assignée dans une fonction est LOCALE : elle n'existe que pendant l'exécution de la fonction. Pour l'utiliser dehors, il faut la retourner (return x) ou la déclarer globale — mais retourner reste la bonne pratique."); err != nil {
                                                return err
                                        }
                                        return nil
                                })
                        }
                        if err != nil {
                                return fmt.Errorf("help threads: %w", err)
                        }
                        fmt.Println("HelpThread/HelpMessage : 2 fils (1 OUVERT, 1 RESOLU avec réponse enseignant)")
                }
        }

        // 2g. Devoirs + grilles + soumissions
        return seedDevoirs(ctx, conn, sc, demoStudents)
}

// ─────────────────────────────────────────────────────────────────────────────
// Devoirs, grilles, soumissions
// ─────────────────────────────────────────────────────────────────────────────

type subFile struct {
        key, filename, contentType, content string
}

func seedDevoirs(ctx context.Context, conn *pgx.Conn, sc *seedContext, demoStudents []string) error {
        profClaims := seedClaims{userID: sc.profID, role: "ENSEIGNANT", etabID: sc.etabID}

        grilleJSON := `[{"nom":"Exactitude des résultats","description":"Les réponses fournies sont correctes et justifiées","poids":2.0},
{"nom":"Qualité du code","description":"Lisibilité, nommage, respect des conventions (PEP 8 / style du cours)","poids":1.0},
{"nom":"Complétude","description":"Tous les exercices sont traités, y compris les questions bonus signalées","poids":1.0}]`

        type devoirDef struct {
                id, titre, ue, statut, consignes, rendu string
                pub, limite                             time.Time
        }
        defs := []devoirDef{
                {id: "seed_devoir_1", titre: "TP — Modélisation d'un besoin logiciel", ue: sc.ueGL, statut: "PUBLIE",
                        consignes: "À partir de l'énoncé distribué en cours : 1) identifier les acteurs et les cas d'utilisation, 2) dessiner le diagramme de cas d'utilisation, 3) rédiger les exigences fonctionnelles au format testable. Rendu individuel.",
                        rendu:     `[".pdf",".md",".zip"]`,
                        pub:       time.Now().AddDate(0, 0, -5), limite: time.Now().AddDate(0, 0, 7)},
                {id: "seed_devoir_2", titre: "Exercices Python — Structures de données", ue: sc.uePython, statut: "FERME",
                        consignes: "Séries d'exercices sur listes, tuples et dictionnaires (feuille TP n°3). Rédigez pour chaque exercice : le code, un jeu d'essai, et une phrase d'explication.",
                        rendu:     `[".md",".txt",".py"]`,
                        pub:       time.Now().AddDate(0, 0, -20), limite: time.Now().AddDate(0, 0, -6)},
        }

        err := withClaims(ctx, conn, profClaims, func(tx pgx.Tx) error {
                for _, d := range defs {
                        if _, err := tx.Exec(ctx, `
                                INSERT INTO "Devoir" ("id","titre","description","consignes","uniteEnseignementId","enseignantId",
                                        "typeSeance","datePublication","dateLimite","noteMax","renduFichiers","soumissionGroupe",
                                        "nbMaxFichiers","tailleMaxFichier","statut","anneeUniversitaire","createdAt","updatedAt")
                                VALUES ($1,$2,$3,$4,$5,$6,'TD',$7,$8,20,$9,false,10,52428800,$10::"StatutDevoir",'2025-2026',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                                ON CONFLICT (id) DO NOTHING`,
                                d.id, d.titre, d.titre, d.consignes, d.ue, sc.profID, d.pub, d.limite, d.rendu, d.statut); err != nil {
                                return fmt.Errorf("insert devoir %s: %w", d.id, err)
                        }
                        if _, err := tx.Exec(ctx, `
                                INSERT INTO "GrilleEvaluation" ("id","devoirId","criteres","createdAt","updatedAt")
                                VALUES ($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                                ON CONFLICT (id) DO NOTHING`,
                                "seed_grille_"+d.id[len(d.id)-1:], d.id, grilleJSON); err != nil {
                                return fmt.Errorf("insert grille %s: %w", d.id, err)
                        }
                }
                return nil
        })
        if err != nil {
                return fmt.Errorf("devoirs: %w", err)
        }
        fmt.Println("Devoir : 2 créés (PUBLIE + FERME) avec grilles d'évaluation")

        // Soumissions (devoir FERME — 4 étudiants + 1 sur le PUBLIE)
        baseMillis := int64(1789000000000) // déterministe → clés R2 stables entre 2 exécutions
        var subFiles []subFile
        type soumDef struct {
                id, student, devoir, statut, statutIA, commentaireE, justificationIA string
                note, noteIA                                                         float64
                hasNote                                                              bool
                hasNoteIA                                                            bool
                renduDays                                                            int
                fileIdx                                                              int
        }
        soums := []soumDef{
                {id: "seed_soum_01", student: demoStudents[0], devoir: "seed_devoir_2", statut: "CORRIGE", statutIA: "TERMINE",
                        hasNote: true, note: 15.5, hasNoteIA: true, noteIA: 14.0,
                        commentaireE:    "Très bon travail d'ensemble. Les jeux d'essai sont pertinents ; soignez les docstrings.",
                        justificationIA: "Réponses correctes sur 7 exercices sur 8. Code conforme PEP 8 (2 écarts mineurs de nommage). Le jeu d'essai de l'exercice 5 ne couvre pas le cas limite de liste vide.",
                        renduDays:       -7, fileIdx: 0},
                {id: "seed_soum_02", student: demoStudents[1], devoir: "seed_devoir_2", statut: "RETOURNE", statutIA: "TERMINE",
                        hasNote: true, note: 12.0, hasNoteIA: true, noteIA: 12.5,
                        commentaireE:    "Ensemble correct mais l'exercice 6 (dictionnaires imbriqués) est incomplet. Voir mes annotations.",
                        justificationIA: "5 exercices complets sur 8. Nommage hétérogène (mélange camelCase/snake_case). Explications présentes mais parfois trop laconiques.",
                        renduDays:       -7, fileIdx: 1},
                {id: "seed_soum_03", student: demoStudents[2], devoir: "seed_devoir_2", statut: "CORRIGE", statutIA: "TERMINE",
                        hasNote: true, note: 17.0, hasNoteIA: true, noteIA: 16.0,
                        commentaireE:    "Excellent — notamment la gestion élégante du cas limite à l'exercice 5. Bravo.",
                        justificationIA: "7,5 exercices sur 8. Code idiomatique, jeux d'essai exhaustifs, explications claires. Un seul point mineur : une variable non utilisée exercice 2.",
                        renduDays:       -8, fileIdx: 2},
                {id: "seed_soum_04", student: demoStudents[3], devoir: "seed_devoir_2", statut: "SOUMIS", statutIA: "EN_ATTENTE",
                        hasNote: false, hasNoteIA: false,
                        renduDays: -6, fileIdx: 3},
                {id: "seed_soum_05", student: demoStudents[0], devoir: "seed_devoir_1", statut: "SOUMIS", statutIA: "EN_ATTENTE",
                        hasNote: false, hasNoteIA: false,
                        renduDays: -2, fileIdx: 4},
        }
        nSoum := 0
        for _, s := range soums {
                uid := sc.students[s.student]
                etud := seedClaims{userID: uid, role: "ETUDIANT", etabID: sc.etabID, filiereID: sc.filiereINFO}
                // fichier de soumission (contenu réaliste)
                var content string
                var fname string
                if s.devoir == "seed_devoir_2" {
                        fname = "exercices_python_tp3.md"
                        content = pythonHomework(uid, s.fileIdx)
                } else {
                        fname = "tp_modelisation_besoin.md"
                        content = glHomework()
                }
                millis := baseMillis + int64(s.fileIdx)*7919
                key := fmt.Sprintf("soumissions/%s/%d_%s", uid, millis, fname)
                subFiles = append(subFiles, subFile{key: key, filename: fname, contentType: "text/markdown; charset=utf-8", content: content})

                filesJSON, _ := json.Marshal([]map[string]string{
                        {"key": key, "filename": fname, "contentType": "text/markdown; charset=utf-8"},
                })
                var note, noteIA any
                if s.hasNote {
                        note = s.note
                }
                if s.hasNoteIA {
                        noteIA = s.noteIA
                }
                var commentaireE, justificationIA, statutIA any
                if s.commentaireE != "" {
                        commentaireE = s.commentaireE
                }
                if s.justificationIA != "" {
                        justificationIA = s.justificationIA
                }
                if s.statutIA != "" {
                        statutIA = s.statutIA
                }
                rendu := time.Now().AddDate(0, 0, s.renduDays)
                err := withClaims(ctx, conn, etud, func(tx pgx.Tx) error {
                        ct, err := tx.Exec(ctx, `
                                INSERT INTO "Soumission" ("id","devoirId","etudiantId","fichiersSoumis","commentaireEtudiant",
                                        "statut","renduAt","note","commentaireEnseignant","noteIA","justificationIA","statutIA","createdAt","updatedAt")
                                SELECT $1,$2,$3,$4,$5,$6::"StatutSoumission",$7,$8,$9,$10,$11,$12::"StatutIASoumission",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
                                WHERE NOT EXISTS (SELECT 1 FROM "Soumission" WHERE "devoirId"=$2 AND "etudiantId"=$3)`,
                                s.id, s.devoir, uid, string(filesJSON), "Rendu dans les délais.", s.statut, rendu,
                                note, commentaireE, noteIA, justificationIA, statutIA)
                        if err != nil {
                                return err
                        }
                        nSoum += int(ct.RowsAffected())
                        return nil
                })
                if err != nil {
                        return fmt.Errorf("soumission %s: %w", s.id, err)
                }
        }

        // Persiste la liste des fichiers pour la phase R2
        if err := saveSubFiles(subFiles); err != nil {
                return err
        }
        fmt.Printf("Soumission : %d créées (CORRIGE/RETOURNE/SOUMIS) + fichiers R2 en attente d'upload\n", nSoum)
        return nil
}

// fence — triple backtick : interdit dans une raw string Go, d'où l'interpolation.
const fence = "```"

func pythonHomework(uid string, idx int) string {
        variants := []string{`# Exercices Python — TP n°3 (structures de données)

## Exercice 1 — Listes
Énoncé : fusionner deux listes triées en une seule triée.

` + fence + `python
def fusion(a, b):
    resultat = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            resultat.append(a[i]); i += 1
        else:
            resultat.append(b[j]); j += 1
    resultat.extend(a[i:]); resultat.extend(b[j:])
    return resultat

# Jeu d'essai
assert fusion([1, 3, 5], [2, 4, 6]) == [1, 2, 3, 4, 5, 6]
assert fusion([], [1]) == [1]
` + fence + `
Explication : on avance sur la liste dont l'élément courant est le plus petit (fusion de l'algorithme de tri fusion).

## Exercice 2 — Tuples
Énoncé : écrire une fonction point(x, y) renvoyant un tuple et calculer la distance à l'origine.

` + fence + `python
import math
def distance(p):
    x, y = p          # déballage de tuple
    return math.hypot(x, y)

assert distance((3, 4)) == 5.0
` + fence + `
Explication : le tuple permet un déballage élégant et garantit l'immuabilité du point.

## Exercice 5 — Cas limite
Le jeu d'essai initial oubliait la liste vide :
` + fence + `python
assert fusion([], []) == []
` + fence + `
Corrigé après remarque du professeur.
`, `# Exercices Python — TP n°3 (structures de données)

## Exercice 1 — Listes
` + fence + `python
def fusion(a, b):
    return sorted(a + b)
` + fence + `
Version simple (mais O((n+m) log(n+m)) contre O(n+m) pour la fusion manuelle).

## Exercice 6 — Dictionnaires imbriqués (incomplet)
Énoncé : compter les mots par longueur dans un texte.
` + fence + `python
def compte_par_longueur(texte):
    compteur = {}
    for mot in texte.split():
        # TODO : gérer la ponctuation et l'imbrication demandée
        compteur[len(mot)] = compteur.get(len(mot), 0) + 1
    return compteur
` + fence + `
Je n'ai pas eu le temps de traiter la variante imbriquée demandée.

## Remarques
Les exercices 2 à 5 sont traités dans les sections précédentes (rendu partiel).
`, `# Exercices Python — TP n°3 (structures de données)

## Exercice 1 — Listes (fusion triée, O(n+m))
` + fence + `python
def fusion(a, b):
    resultat, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            resultat.append(a[i]); i += 1
        else:
            resultat.append(b[j]); j += 1
    return resultat + a[i:] + b[j:]
` + fence + `

## Exercice 5 — Cas limite liste vide
` + fence + `python
assert fusion([], []) == []
assert fusion([2], []) == [2]
` + fence + `
Ajouté dès la première version — un jeu d'essai sans cas limite n'est pas un jeu d'essai.

## Exercice 8 — Bonus (générateur)
` + fence + `python
def couples(lst):
    for i in range(len(lst)):
        for j in range(i + 1, len(lst)):
            yield (lst[i], lst[j])
` + fence + `
Explication : yield produit les couples sans matérialiser la liste complète en mémoire.
`, `# Exercices Python — TP n°3 (structures de données)

## Exercice 1 — Listes
` + fence + `python
def fusion(a, b):
    out = []
    while a and b:
        out.append(a.pop(0) if a[0] <= b[0] else b.pop(0))
    return out + a + b
` + fence + `
(Note : pop(0) est en O(n), la version à index est meilleure.)

## Exercice 2 — Tuples
Point représenté par tuple, distance via math.hypot. Voir cours.

Rendu dans les délais (jour J), en attente de correction.
`}
        if idx >= len(variants) {
                idx = idx % len(variants)
        }
        return variants[idx]
}

func glHomework() string {
        return `# TP — Modélisation d'un besoin logiciel

## 1. Acteurs
- **Étudiant** : consulte ses résultats, s'inscrit aux évaluations
- **Enseignant** : crée les évaluations, corrige
- **Responsable pédagogique** : valide le paramétrage, accède aux statistiques

## 2. Cas d'utilisation (extraits)
- UC1 — S'authentifier (étudiant, enseignant, responsable)
- UC2 — Passer une évaluation (étudiant) [inclut UC3]
- UC3 — Répondre à une question (étudiant)
- UC4 — Créer une évaluation (enseignant) [étend UC5]
- UC5 — Sélectionner des questions (enseignant)

## 3. Exigences fonctionnelles (format testable)
- REQ-01 : le système doit permettre à un étudiant authentifié de soumettre ses réponses en moins de 60 secondes par question.
- REQ-02 : le système doit refuser la soumission après la date de fin + délai de grâce.
- REQ-03 : chaque évaluation doit exiger entre 1 et 50 questions.

Rendu individuel — diagramme complet en annexe PDF.
`
}

// saveSubFiles mémorise les fichiers à téléverser (phase R2).
var pendingSubFiles []subFile

func saveSubFiles(files []subFile) error {
        pendingSubFiles = files
        return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Mots de passe de démonstration
// ─────────────────────────────────────────────────────────────────────────────

func phasePasswords(ctx context.Context, conn *pgx.Conn, sc *seedContext, password string) error {
        hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
        if err != nil {
                return err
        }
        emails := []string{
                "registrar@uniabidjan.com", "prof01@uniabidjan.com", "prof.b2c.test@sect-mvp.dev",
        }
        for e := range sc.allStudents {
                emails = append(emails, e)
        }
        sort.Strings(emails)
        sys := systemClaims()
        n := 0
        err = withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                for _, e := range emails {
                        // mustChangePwd=false : les comptes de démo doivent être utilisables
                        // immédiatement (le drapeau bloque TOUTES les routes métier).
                        ct, err := tx.Exec(ctx, `UPDATE "User" SET password=$1, "mustChangePwd"=false, "updatedAt"=CURRENT_TIMESTAMP WHERE email=$2`, string(hash), e)
                        if err != nil {
                                return err
                        }
                        n += int(ct.RowsAffected())
                }
                return nil
        })
        if err != nil {
                return err
        }
        fmt.Printf("mots de passe réinitialisés : %d comptes → « %s » (bcrypt coût 10)\n", n, password)
        fmt.Println("⚠️  ulrichdouh@gmail.com (ADMIN réel) volontairement NON modifié")
        return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — R2 (fichiers réels)
// ─────────────────────────────────────────────────────────────────────────────

func phaseR2(ctx context.Context, conn *pgx.Conn, sc *seedContext, r2c *storage.R2Client, audioDir string) error {
        sys := systemClaims()

        // 4a. Documents → PDF reconstitués → upload sous la clé existante
        nDoc := 0
        for _, d := range sc.docs {
                if d.cheminStockage == "" || d.contenuTexte == "" {
                        continue
                }
                pdf := buildPDF(d.nomFichier, d.contenuTexte)
                if _, err := r2c.Upload(ctx, storageObject(d.cheminStockage, pdf, "application/pdf")); err != nil {
                        return fmt.Errorf("upload doc %s: %w", d.nomFichier, err)
                }
                if err := withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                        _, err := tx.Exec(ctx, `UPDATE "Document" SET "tailleFichier"=$1, "updatedAt"=CURRENT_TIMESTAMP WHERE id=$2`, len(pdf), d.id)
                        return err
                }); err != nil {
                        return err
                }
                nDoc++
                fmt.Printf("  ⬆ %-52s %6d o\n", d.cheminStockage, len(pdf))
        }
        fmt.Printf("documents PDF téléversés : %d\n", nDoc)

        // 4b. Podcasts MP3 (pré-générés via TTS) → audio/{id}.mp3
        durations := readDurations(audioDir + "/durations.json")
        nAudio := 0
        for _, a := range sc.audios {
                path := audioDir + "/" + a.id + ".mp3"
                content, err := os.ReadFile(path)
                if err != nil {
                        fmt.Printf("  ⚠️  audio %s absent (%v) — ignoré\n", a.id, err)
                        continue
                }
                key := fmt.Sprintf("audio/%s.mp3", a.id)
                if _, err := r2c.Upload(ctx, storageObject(key, content, "audio/mpeg")); err != nil {
                        return fmt.Errorf("upload audio %s: %w", a.id, err)
                }
                dur := durations[a.id]
                if dur == 0 {
                        dur = int(float64(len(content)) * 8 / 48000) // CBR 48 kbps
                }
                if err := withClaims(ctx, conn, sys, func(tx pgx.Tx) error {
                        _, err := tx.Exec(ctx, `UPDATE "DocumentAudio" SET "r2Key"=$1, "durationSec"=$2, status='PRET',
                                "errorMessage"=NULL, "updatedAt"=CURRENT_TIMESTAMP WHERE id=$3`, key, dur, a.id)
                        return err
                }); err != nil {
                        return err
                }
                nAudio++
                fmt.Printf("  ⬆ %-52s %6d o (%ds)\n", key, len(content), dur)
        }
        fmt.Printf("podcasts MP3 téléversés : %d\n", nAudio)

        // 4c. Fichiers de soumissions (.md — contenus écrits en phase 2)
        nSub := 0
        for _, f := range pendingSubFiles {
                if _, err := r2c.Upload(ctx, storageObject(f.key, []byte(f.content), f.contentType)); err != nil {
                        return fmt.Errorf("upload soumission %s: %w", f.key, err)
                }
                nSub++
                fmt.Printf("  ⬆ %-70s %5d o\n", f.key, len(f.content))
        }
        fmt.Printf("fichiers de soumissions téléversés : %d\n", nSub)
        return nil
}

func readDurations(path string) map[string]int {
        out := map[string]int{}
        b, err := os.ReadFile(path)
        if err != nil {
                return out
        }
        var m map[string]float64
        if json.Unmarshal(b, &m) == nil {
                for k, v := range m {
                        out[k] = int(v)
                }
        }
        return out
}

func storageObject(key string, content []byte, contentType string) domain.StorageObject {
        return domain.StorageObject{Key: key, Content: content, ContentType: contentType, ContentLength: int64(len(content))}
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapport final
// ─────────────────────────────────────────────────────────────────────────────

func printReport(ctx context.Context, conn *pgx.Conn, sc *seedContext, r2c *storage.R2Client) {
        fmt.Println("\n════════════════════════════════════════════════════════════════")
        fmt.Println(" RAPPORT — état de la base")
        fmt.Println("════════════════════════════════════════════════════════════════")
        for _, t := range []string{"User", "Document", "Chapter", "DocumentAudio", "Question", "EpreuveQuestion",
                "ReviewItem", "Flashcard", "StudySession", "PracticeAttempt", "HelpThread", "HelpMessage",
                "Devoir", "Soumission", "EtablissementAccess"} {
                var n int
                if err := conn.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM "%s"`, t)).Scan(&n); err == nil {
                        fmt.Printf("  %-22s %d\n", t, n)
                }
        }
        var orphans int
        _ = conn.QueryRow(ctx, `SELECT count(*) FROM "Reponse" r WHERE NOT EXISTS (SELECT 1 FROM "Question" q WHERE q.id=r."questionId")`).Scan(&orphans)
        fmt.Printf("  %-22s %d (attendu 0)\n", "réponses orphelines", orphans)

        if r2c != nil && len(sc.docs) > 0 {
                url, err := r2c.PresignURL(ctx, sc.docs[0].cheminStockage, 3600)
                if err == nil {
                        fmt.Println("\nExemple d'URL présignée R2 (1 h) :")
                        fmt.Println("  " + url)
                }
        }
        fmt.Println("\n✅ seed terminé")
}
