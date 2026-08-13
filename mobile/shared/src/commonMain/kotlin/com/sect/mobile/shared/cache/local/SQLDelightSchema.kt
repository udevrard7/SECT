// SECT Mobile — SQLDelight Schema (Phase 2 — Base de données locale SQLite)
// Ce fichier documente le schéma SQLDelight qui sera utilisé en phase 2
// pour remplacer l'OfflineCache in-memory par une vraie DB SQLite native.
//
// Pour activer SQLDelight :
// 1. Ajouter la dépendance dans shared/build.gradle.kts :
//    implementation("app.cash.sqldelight:runtime:2.0.2")
//    implementation("app.cash.sqldelight:coroutines-extensions:2.0.2")
//    // Android
//    implementation("app.cash.sqldelight:android-driver:2.0.2")
//    // iOS
//    implementation("app.cash.sqldelight:native-driver:2.0.2")
//
// 2. Créer les fichiers .sq dans shared/src/commonMain/sqldelight/com/sect/mobile/shared/db/

// ── Schéma SQL (pour référence) ──

/*
-- Cache d'épreuves (pour mode offline)
CREATE TABLE cached_epreuve (
    id TEXT NOT NULL PRIMARY KEY,
    titre TEXT NOT NULL,
    description TEXT,
    duree INTEGER NOT NULL,
    date_debut TEXT NOT NULL,
    date_fin TEXT NOT NULL,
    statut TEXT NOT NULL,
    note_total REAL NOT NULL,
    proctoring_actif INTEGER NOT NULL DEFAULT 0,
    questions_json TEXT NOT NULL,  -- JSON serialized list of questions
    cached_at INTEGER NOT NULL,    -- epoch millis
    expires_at INTEGER NOT NULL    -- cached_at + TTL
);

-- Réponses locales (auto-save + offline)
CREATE TABLE local_reponse (
    session_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    contenu TEXT NOT NULL,
    saved_at INTEGER NOT NULL,     -- epoch millis
    synced INTEGER NOT NULL DEFAULT 0,  -- 0 = pas sync, 1 = sync au backend
    PRIMARY KEY (session_id, question_id)
);

-- Profil utilisateur en cache
CREATE TABLE cached_user (
    id TEXT NOT NULL PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    etablissement_id TEXT,
    filiere_id TEXT,
    user_json TEXT NOT NULL,       -- Full JSON for deserialization
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- Conversations en cache
CREATE TABLE cached_conversation (
    id TEXT NOT NULL PRIMARY KEY,
    type TEXT NOT NULL,
    titre TEXT,
    last_message_json TEXT,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- Messages en cache
CREATE TABLE cached_message (
    id TEXT NOT NULL PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    expediteur_id TEXT NOT NULL,
    contenu TEXT NOT NULL,
    created_at TEXT NOT NULL,
    message_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES cached_conversation(id)
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_local_reponse_session ON local_reponse(session_id);
CREATE INDEX idx_local_reponse_unsynced ON local_reponse(synced) WHERE synced = 0;
CREATE INDEX idx_cached_message_conv ON cached_message(conversation_id);
CREATE INDEX idx_cached_epreuve_expires ON cached_epreuve(expires_at);
*/
