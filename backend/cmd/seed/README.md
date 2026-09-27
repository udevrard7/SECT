# cmd/seed — peuplement de démonstration (Neon + R2)

Outil de peuplement **réparable et idempotent** du jeu de données de démo.
Il ne crée ni établissement ni comptes : il complète le peuplement initial
(The University of Abidjan) et répare ses incohérences.

## Usage

```bash
# depuis backend/ (.env chargé via godotenv)
go run ./cmd/seed                       # réparation + complétion + R2
go run ./cmd/seed --skip-r2             # base uniquement
go run ./cmd/seed --reset-passwords     # + mots de passe démo (SectDemo2026!)
go run ./cmd/seed --demo-password "…"   # mot de passe personnalisé
go run ./cmd/seed --audio-dir /tmp/sect-seed-audio
```

Variables requises : `NEON_DIRECT_URL` (jamais le pooler), et pour la phase
R2 : `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`, `R2_ENDPOINT` (optionnel).

## Ce que fait le seed

| Phase | Action | Détail |
|---|---|---|
| 1. Réparation | Banque de questions `seedq_001..025` | Les 597 `Reponse` du peuplement initial référencent des questions `q1..q25` jamais créées → création de la banque (typage dérivé des réponses : QCU/QCM/QRC) + remap + liens `EpreuveQuestion` (visibilité étudiants) |
| 1. Réparation | `DocumentAudio.userId` | Les 3 podcasts pointaient vers un user supprimé → prof01 |
| 1. Réparation | Établissement | `emailVerified` + `adminValidated` (démo prête) |
| 1. Réparation | UE `niveaux` | `["L2","L3"]` — les étudiants L3 voient aussi les documents |
| 2. Complétion | `EtablissementAccess` | Accès APPROUVE pour l'ADMIN PaaS (dashboard admin) |
| 2. Complétion | `ReviewItem` ×24 | États SM-2 variés : dus aujourd'hui / à venir / maîtrisés (écran Révisions) |
| 2. Complétion | `Flashcard` ×12 | Génie Logiciel + Python (owner prof01, cf. policy RLS) |
| 2. Complétion | `StudySession` ×8 | Passées TERMINEE + futures PLANIFIEE |
| 2. Complétion | `PracticeAttempt` ×18 | Dont lacunes volontaires (score < 0.5) pour le dashboard |
| 2. Complétion | `HelpThread/Message` ×2 | 1 OUVERT, 1 RESOLU (réponse enseignant) |
| 2. Complétion | `Devoir` ×2 + grilles | PUBLIE + FERME, soumissions CORRIGE/RETOURNE/SOUMIS |
| 3. Mots de passe | `--reset-passwords` | Comptes @uniabidjan + prof B2C → bcrypt(10). **ulrichdouh@gmail.com jamais modifié** |
| 4. R2 | Documents ×10 | PDF reconstitués depuis `contenuTexte` (générateur maison, WinAnsi) → upload sous la clé `cheminStockage` existante + `tailleFichier` réel |
| 4. R2 | Podcasts ×3 | MP3 (TTS) → `audio/{id}.mp3` + `durationSec` + status PRET |
| 4. R2 | Soumissions ×5 | `.md` réalistes → `soumissions/{userId}/…` |

## Génération des podcasts MP3 (une fois)

Les scripts podcasts sont lus depuis `DocumentAudio.script`, nettoyés du
markdown, découpés en morceaux ≤ 950 caractères, synthétisés en WAV puis
concaténés en MP3 CBR 48 kbps (durée dérivable de la taille) :

```bash
# 1. extraire les scripts (depuis la base) vers /tmp/sect-seed-audio/{id}.txt
# 2. synthèse + assemblage
z-ai tts -i "$(cat chunk.txt)" -o chunk.wav
ffmpeg -i chunk.wav -b:a 48k -ar 24000 -ac 1 chunk.mp3
cat chunk_*.mp3 > {id}.mp3   # + ffprobe → durations.json
```

## Idempotence

- `INSERT … ON CONFLICT (id) DO NOTHING` partout où la PK le permet ;
- `INSERT … WHERE NOT EXISTS` sinon (EpreuveQuestion, Soumission) ;
- UPDATEs naturellement idempotents ;
- uploads R2 écrasent les objets (clés déterministes pour les soumissions).

## RLS

La connexion `NEON_DIRECT_URL` utilise `neondb_owner` (BYPASSRLS sur Neon),
mais chaque transaction pose les `app.claims.*` exacts (réplique de
`db.SetClaimsTx`) : l'outil reste portable sur un rôle non privilégié et
documente l'intention (réparation = claims système, données étudiantes =
claims ETUDIANT, etc.).
