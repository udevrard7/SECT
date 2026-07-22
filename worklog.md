---
Task ID: SECU-SYNC-FIX
Agent: Main Agent
Task: Fix Admin /securite ↔ Responsable /parametres Sécurité synchronization and save error (403)

Work Log:
- Investigated Admin /securite page (securite-page.tsx) and Responsable /parametres Sécurité tab (responsable-parametres-page.tsx)
- Investigated backend endpoints: GET /api/security-settings, GET /api/security-settings/etablissement/{id}, PATCH /api/security-settings/etablissement/{id}
- Identified 3 root causes: RLS blocking ADMIN, GET returning single object instead of array, TanStack Query cache not synchronized
- Created DB migration 000102: SecuritySettings RLS policies aligned with Etablissement model (ADMIN = full access without etablissement_access condition)
- Fixed backend PATCH handler: removed admin_has_etablissement_access check for ADMIN (SECU-SYNC-FIX)
- Fixed backend GET /api/security-settings: now returns ALL settings as array with JOINed establishment info
- Fixed frontend securite-page.tsx: cross-invalidate ['responsable-security-settings', etabId] after save
- Fixed frontend responsable-parametres-page.tsx: cross-invalidate ['security-settings'] after save
- Applied DB migration 000102 to Neon database (version 101 → 102)
- Rebuilt backend binary and restarted
- Verified with Agent Browser: PATCH now returns 200 (was 403 before), overview table populated with data
- Pushed commit ae29688 to GitHub (main branch)

Stage Summary:
- Admin /securite page now works: can select establishment, load settings, toggle options, and save successfully
- Overview table shows all establishments' security settings with correct data
- Both pages (admin and responsable) will invalidate each other's cache on save → synchronization
- RLS policies aligned: ADMIN has full access to all SecuritySettings (like Etablissement_select)

---
Task ID: EPREUVES-DATES-FIX
Agent: Main Agent (Z.ai Code — tuteur Ulrich EVRARD)
Task: /epreuves onglet « Sessions » — erreur « impossible de modifier les dates et heures d'une épreuve avant de lancer » + amélioration/automatisation du formulaire de modification

Work Log:
- Reproduit le bug : le dialog « Modifier les dates » (SessionsTab, bouton « Dates ») envoie la valeur brute d'un <input type="datetime-local"> (format `YYYY-MM-DDTHH:mm`, sans secondes ni timezone) au backend PATCH /api/epreuves/{id}
- Côté Go, `time.Parse(time.RFC3339, "2025-01-15T14:30")` échoue → renvoie ValidationError 422 « format ISO invalide » → le frontend affiche le toast « Erreur lors de la mise à jour des dates ». Cause racine confirmée par un test Go isolé (`go run datetest.go`)
- Analyse de la state machine : Epreuve_Update (repository) autorise la modification des dates dans tous les statuts via le path « general update » (pas de guard sur le statut). Le bouton « Dates » n'était exposé que pour PLANIFIEE, pas pour BROUILLON — ajouté sur BROUILLON également (cas « avant de lancer »)

Backend (backend/internal/repository/epreuve.go) :
- Ajout fonction `parseEpreuveDate(field, raw)` : parser tolérant qui accepte RFC3339 strict, `2006-01-02T15:04:05` et `2006-01-02T15:04` (datetime-local HTML), interprété en temps local du serveur. Defense-in-depth : même si un client envoie le mauvais format, le backend l'accepte
- Remplacement des 2 `time.Parse(time.RFC3339, ...)` du path Update par `parseEpreuveDate(...)`
- Ajout validation métier : `dateFin` doit être strictement postérieure à `dateDebut` (si l'une des deux est modifiée, on compare avec la valeur existante en DB quand besoin). Renvoie ValidationError clair sinon

Frontend (frontend/src/components/epreuves/epreuves-page.tsx) :
- Correction racine : ajout fonction `toRFC3339()` qui convertit la valeur datetime-local en ISO string UTC via `new Date(value).toISOString()` avant l'envoi API. Le payload PATCH envoie désormais du RFC3339 valide
- Refonte complète du dialog « Modifier les dates » :
  * Header enrichi : titre + description avec le nom de l'épreuve ciblée
  * Badge statut (BROUILLON/PLANIFIEE/EN_COURS/TERMINEE/CLOTUREE) + badge durée configurée
  * Encadré « Actuellement » affichant les dates existantes pour référence
  * 5 presets de démarrage rapide : Maintenant, Dans 1 h, Demain 08 h, Demain 14 h, Lundi 08 h (calculent début + fin = début + durée originelle)
  * Auto-calc : modifier le début décale automatiquement la fin pour préserver la durée (checkbox « Ajuster automatiquement la fin » activée par défaut, désactivée si l'utilisateur touche manuellement à la fin)
  * Validation temps réel via `useMemo` : vérifie fin > début, calcule la durée en minutes, affiche un encart succès (vert) avec la nouvelle durée ou un encart erreur (rouge) avec le motif
  * Warning si la nouvelle durée diffère de la durée configurée
  * Bouton Enregistrer désactivé tant que le formulaire est invalide, avec spinner de chargement (state `dateEditSaving`)
  * Gestion d'erreur : affiche le message renvoyé par le backend (extraction error/message du JSON) au lieu d'un toast générique
  * Toast de succès avec les nouvelles dates formatées
- Ajout du bouton « Dates » (CalendarDays) sur le statut BROUILLON en plus de PLANIFIEE (couvre tout le cas « avant de lancer »)

Vérifications qualité :
- Backend : `go build ./cmd/api` → OK (binaire 27 MB) ; `go vet ./...` → 0 erreur
- Frontend : `tsc --noEmit` → 0 erreur sur epreuves-page.tsx (1 erreur TS préexistante dans acces-etablissements-page.tsx non liée) ; `eslint` sur le fichier → 0 erreur 0 warning
- Pas de migration DB nécessaire (changement purement code + tolérance parser)

Stage Summary:
- Bug « impossible de modifier les dates » résolu : le frontend envoie désormais du RFC3339 valide ET le backend tolère les formats datetime-local
- UX fortement améliorée : presets rapides, auto-calc de la fin, validation temps réel, affichage de la durée calculée, gestion d'erreur précise, bouton sur BROUILLON + PLANIFIEE
- Aucun risque de régression : le parser tolérant est strictement plus permissif (RFC3339 continue de fonctionner), la validation dateFin>dateDebut est nouvelle mais n'impacte que les cas autrefois silencieusement inconsistants

---
Task ID: EPREUVES-DATES-FIX-V2
Agent: Main Agent (Z.ai Code — tuteur Ulrich EVRARD)
Task: Correction sémantique du dialog de modification des dates — la date de début/fin définit la FENÊTRE D'OUVERTURE (période de disponibilité avant clôture auto), PAS la durée de passation (qui est fixée à la création de l'épreuve)

Contexte métier (correction apportée par Ulrich) :
- `dateDebut` + `dateFin` = fenêtre d'ouverture de l'épreuve (période pendant laquelle les étudiants peuvent y accéder). Clôture automatique à `dateFin`.
- `duree` = durée de passation par étudiant (temps accordé une fois qu'il démarre), définie à la création de l'épreuve, NON modifiée par le dialog de modification des dates.
- La V1 (EPREUVES-DATES-FIX) avait un auto-calc "préserver la durée" qui mélangeait les deux concepts → confusion UX.

Frontend (frontend/src/components/epreuves/epreuves-page.tsx) :
- Renommage buildDatePresets → buildStartPresets (presets de début d'ouverture uniquement : Maintenant, Dans 1h, Demain 08h/14h, Lundi 08h)
- Nouveau buildWindowPresets : presets de durée de fenêtre (+1h, +2h, +4h, +1 jour, +3 jours, +1 semaine) appliqués à fin = début + durée
- Nouveau applyWindowPreset(windowMs) : calcule la fin depuis le début courant
- Renommage applyDatePreset → applyStartPreset : préserve la fenêtre d'ouverture originelle (pas la durée de passation)
- handleDebutChange : auto-calc préserve la fenêtre originelle (écart debut→fin), PAS la durée de passation
- dateEditValidation : renomme dureeMin → windowMin, ne compare JAMAIS à la durée de passation
- Nouveau formatWindow(minutes) : affiche "1 h 30", "1 jour 3 h", "2 jours"
- Refonte UI du dialog :
  * Titre : "Fenêtre d'ouverture de l'épreuve" (au lieu de "Modifier les dates et heures")
  * Description : clarifie que c'est la période d'accès, clôture automatique à la fin
  * Badge "Passation : X min/étudiant" (au lieu de "Durée configurée") avec title explicatif
  * Encadré "Fenêtre actuelle" affiche les dates + la durée de fenêtre calculée
  * Section "Démarrage rapide — ouverture" (presets de début)
  * Label "Date et heure d'ouverture" + texte d'aide "Moment à partir duquel les étudiants peuvent démarrer"
  * Checkbox "Conserver la même durée de fenêtre quand je change l'ouverture" (au lieu de "préserver la durée")
  * Label "Date et heure de clôture automatique" + texte d'aide sur la clôture auto
  * Section "Durée de la fenêtre (depuis l'ouverture)" avec 6 presets (+1h à +1 semaine)
  * Encart succès : "Fenêtre d'ouverture : Xh Ymin — accessible du ... au ..." (sans comparaison avec la durée de passation)
  * Encart erreur : "La clôture doit être après l'ouverture"
  * Note pédagogique (encart info) : explique clairement la différence fenêtre d'ouverture vs durée de passation, avec la durée de passation réelle de l'épreuve
- Suppression du warning "diffère de la durée configurée" (comparaison non pertinente)

Vérifications qualité :
- Frontend : tsc --noEmit → 0 erreur sur epreuves-page.tsx ; eslint → 0 erreur 0 warning
- Backend : inchangé (le fix parser tolérant + validation dateFin>dateDebut de la V1 reste valable et correct)
- Pas de migration DB

Stage Summary:
- Sémantique métier correcte : le dialog modifie la fenêtre d'ouverture, pas la durée de passation
- UX clarifiée : labels, descriptions, note pédagogique, presets séparés (début vs durée de fenêtre)
- Auto-calc corrigé : préserve la fenêtre originelle (pas la durée de passation)
- Aucune régression : le fix backend (parser tolérant + validation fin>début) de la V1 reste en place
