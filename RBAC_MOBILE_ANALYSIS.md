# Analyse RBAC Mobile - Système SECT

## État Actuel du Système RBAC

### ✅ Ce qui est déjà implémenté

#### Backend Go
- **4 Rôles définis**: ADMIN, RESPONSABLE, ENSEIGNANT, ETUDIANT
- **Matrice de permissions**: `CanCreate()` dans `user.go`
- **RLS PostgreSQL**: Policies par rôle et établissement
- **Middleware HTTP**: `RequireRole()` pour protéger les endpoints

#### Mobile KMP (Shared)
- **Enum Role** avec méthode `isMobileUser()`:
```kotlin
enum class Role {
    ADMIN, RESPONSABLE, ENSEIGNANT, ETUDIANT;
    
    fun isMobileUser(): Boolean = this == ENSEIGNANT || this == ETUDIANT
}
```

#### Android - Gestion ADMIN/RESPONSABLE
- **WebRedirectScreen**: Redirige ADMIN/RESPONSABLE vers l'interface web
- **AuthViewModel**: Vérifie le rôle après login:
```kotlin
private fun handleAuthSuccess(user: User) {
    val role = user.role
    if (role.name == "ADMIN" || role.name == "RESPONSABLE") {
        _authState.value = AuthState.RedirectToWeb(...)
    } else {
        _authState.value = AuthState.Authenticated(...)
    }
}
```

#### DashboardViewModel
- **Séparation partielle**:
```kotlin
val isEnseignant: Boolean get() = _user.value?.role == Role.ENSEIGNANT
val isEtudiant: Boolean get() = _user.value?.role == Role.ETUDIANT

when (role) {
    Role.ENSEIGNANT -> loadEnseignantDashboard()
    Role.ETUDIANT -> loadEtudiantDashboard()
    else -> { /* ADMIN/RESPONSABLE ne devrait pas être ici */ }
}
```

---

## ❌ Problèmes Identifiés

### 1. **Dashboard Identique pour Enseignant et Étudiant**

**Problème**: Les méthodes `loadEnseignantDashboard()` et `loadEtudiantDashboard()` font **exactement la même chose**:

```kotlin
// Enseignant
private suspend fun loadEnseignantDashboard() {
    val enCours = repository.listEpreuves(..., statut = "EN_COURS", ...)
    val planifiees = repository.listEpreuves(..., statut = "PLANIFIEE", ...)
    _upcomingEpreuves.value = UiState.Success(enCours + planifiees)
    _stats.value = DashboardStats(totalEpreuves = enCours.size + planifiees.size, ...)
}

// Étudiant (CODE IDENTIQUE)
private suspend fun loadEtudiantDashboard() {
    val enCours = repository.listEpreuves(..., statut = "EN_COURS", ...)
    val planifiees = repository.listEpreuves(..., statut = "PLANIFIEE", ...)
    _upcomingEpreuves.value = UiState.Success(enCours + planifiees)
    _stats.value = DashboardStats(totalEpreuves = enCours.size + planifiees.size, ...)
}
```

**Impact**: L'expérience utilisateur n'est pas différenciée selon le rôle.

---

### 2. **iOS N'a Pas de Protection ADMIN/RESPONSABLE**

**Problème**: `AuthViewModel.swift` n'a **aucune vérification de rôle**:

```swift
func login(identifier: String, password: String) async {
    let session = try await repository.login(...)
    currentUser = session.user
    isAuthenticated = true  // ✅ Pas de check de rôle !
}
```

**Impact**: Un ADMIN ou RESPONSABLE peut se connecter à l'app iOS, ce qui ne devrait pas être autorisé.

---

### 3. **Screens.kt Monolithique (1123 lignes)**

**Problème**: Tous les écrans dans un seul fichier rendent difficile:
- La maintenance
- L'ajout de logique spécifique par rôle
- La lisibilité

**Exemple**: `DashboardScreen` mélange la logique d'affichage sans adaptation fine au rôle.

---

### 4. **Fonctionnalités Métier Non-Différenciées**

| Fonctionnalité | Besoin Enseignant | Besoin Étudiant | État Actuel |
|---------------|------------------|-----------------|-------------|
| **Créer épreuve** | ✅ Oui | ❌ Non | ❌ Pas implémenté mobile |
| **Modifier épreuve** | ✅ Oui | ❌ Non | ❌ Pas implémenté mobile |
| **Surveiller session** | ✅ Oui | ❌ Non | ❌ Partiel (proctoring only) |
| **Corriger copies** | ✅ Oui | ❌ Non | ❌ Pas implémenté mobile |
| **Voir résultats perso** | ❌ Non | ✅ Oui | ⚠️ Implémenté mais same view |
| **Passer examen** | ❌ Non | ✅ Oui | ✅ OK |
| **Auto-save réponses** | ❌ Non | ✅ Oui | ✅ OK |
| **Devoirs** | ✅ Créer/Noter | ✅ Soumettre | ❌ Pas implémenté mobile |
| **Stats classe** | ✅ Oui | ❌ Non | ❌ Pas implémenté mobile |

---

## 🎯 Corrections Requises

### Priorité 1: iOS - Bloquer ADMIN/RESPONSABLE

**Fichier**: `/workspace/mobile/iosApp/iosApp/ViewModels/AuthViewModel.swift`

**Ajouter**:
```swift
enum AuthState {
    case checkingToken
    case authenticated(user: User)
    case redirectToWeb(userName: String, role: String)  // NEW
    case unauthenticated
}

func login(identifier: String, password: String) async {
    isLoading = true
    error = nil
    do {
        let session = try await repository.login(identifier: identifier, password: password)
        currentUser = session.user
        
        // ✅ CHECK RÔLE
        if session.user.role.name == "ADMIN" || session.user.role.name == "RESPONSABLE" {
            authState = .redirectToWeb(
                userName: session.user.name,
                role: session.user.role.name
            )
            isLoading = false
            return
        }
        
        currentUser = session.user
        isAuthenticated = true
        authState = .authenticated(user: session.user)
        KoinRepositoryProvider.shared.updateCachedTokens(...)
    } catch {
        self.error = error.localizedDescription
    }
    isLoading = false
}
```

---

### Priorité 2: Dashboard Différencié

**Fichier**: `/workspace/mobile/shared/src/commonMain/kotlin/com/sect/mobile/shared/domain/repository/SECTRepositoryInterface.kt`

**Ajouter endpoints spécifiques**:

```kotlin
interface SECTRepositoryInterface {
    // ... existing methods
    
    // ENSEIGNANT
    suspend fun getEnseignantDashboard(): EnseignantDashboard
    suspend fun listEpreuvesByEnseignant(enseignantId: String): List<Epreuve>
    suspend fun getStatsClasse(epreuveId: String): StatsClasse
    
    // ETUDIANT
    suspend fun getEtudiantDashboard(): EtudiantDashboard
    suspend fun getMesResultats(): List<Resultat>
    suspend fun getProgressionFiliere(): Progression
}

data class EnseignantDashboard(
    val epreuvesEnCours: List<Epreuve>,
    val epreuvesPlanifiees: List<Epreuve>,
    val totalSessions: Int,
    val alertesFraude: Int,
    val moyennesClasses: Map<String, Double>
)

data class EtudiantDashboard(
    val epreuvesAVenir: List<Epreuve>,
    val resultatsRecents: List<Resultat>,
    val moyenneGenerale: Double,
    val certificatsObtenus: Int
)
```

---

### Priorité 3: Navigation Conditionnelle

**Fichier**: `/workspace/mobile/androidApp/src/main/kotlin/com/sect/mobile/android/navigation/Navigation.kt`

**Adapter la bottom nav selon le rôle**:

```kotlin
@Composable
fun BottomNavigationBar(
    currentRoute: String?,
    navController: NavHostController,
    userRole: Role
) {
    val items = when (userRole) {
        Role.ENSEIGNANT -> listOf(
            BottomNavItem(Routes.DASHBOARD, "Accueil", Icons.Default.Dashboard),
            BottomNavItem(Routes.EPREUVES, "Épreuves", Icons.Default.Book),
            BottomNavItem(Routes.SURVEILLANCE, "Surveillance", Icons.Default.Visibility), // NEW
            BottomNavItem(Routes.PROFILE, "Profil", Icons.Default.Person)
        )
        Role.ETUDIANT -> listOf(
            BottomNavItem(Routes.DASHBOARD, "Accueil", Icons.Default.Dashboard),
            BottomNavItem(Routes.EPREUVES, "Épreuves", Icons.Default.Book),
            BottomNavItem(Routes.RESULTATS, "Résultats", Icons.Default.ChartBar), // NEW
            BottomNavItem(Routes.PROFILE, "Profil", Icons.Default.Person)
        )
        else -> bottomNavItems // Fallback
    }
    
    NavigationBar {
        items.forEach { item ->
            NavigationBarItem(
                icon = { Icon(item.icon, contentDescription = item.label) },
                label = { Text(item.label) },
                selected = currentRoute == item.route,
                onClick = {
                    navController.navigate(item.route) {
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                }
            )
        }
    }
}
```

---

### Priorité 4: Écrans Spécifiques par Rôle

#### Pour Enseignant

| Écran | Description | Endpoint Backend |
|-------|-------------|------------------|
| `CreerEpreuveScreen` | Formulaire création épreuve + questions IA | `POST /api/epreuves` |
| `SurveillanceLiveScreen` | Monitoring temps réel des sessions + alertes fraude | `GET /api/surveillance/stream` (SSE) |
| `CorrectionScreen` | Interface correction copies (ouvertes) + validation QCM | `GET /api/sessions/{id}/reponses` |
| `StatsClasseScreen` | Analytics: moyennes, distribution notes, détections fraude | `GET /api/stats/enseignant` |
| `DevoirsScreen` | Créer devoirs, noter soumissions | `POST /api/devoirs`, `PATCH /api/soumissions/{id}` |

#### Pour Étudiant

| Écran | Description | Endpoint Backend |
|-------|-------------|------------------|
| `PassationScreen` | Déjà existant ✅ | `POST /api/sessions` |
| `MesResultatsScreen` | Historique notes + certificats | `GET /api/resultats`, `GET /api/certificats` |
| `RevisionsScreen` | Flashcards, practice IA, planning révisions | `GET /api/examprep/flashcards` |
| `SoumettreDevoirScreen` | Upload fichier + confirmation | `POST /api/soumissions` (R2 presigned URL) |
| `ProgressionScreen` | Suivi compétences, badges | `GET /api/stats/etudiant` |

---

## 📋 Plan d'Action Détaillé

### Semaine 1: Foundation RBAC

#### Jour 1-2: iOS Auth Fix
- [ ] Modifier `AuthViewModel.swift` avec check rôle
- [ ] Créer `WebRedirectView` pour iOS (équivalent Android)
- [ ] Tester connexion ADMIN/RESPONSABLE → rejet

#### Jour 3-4: Repository Interface
- [ ] Ajouter méthodes `getEnseignantDashboard()` / `getEtudiantDashboard()`
- [ ] Implémenter dans `SECTRepositoryImpl`
- [ ] DTOs: `EnseignantDashboardDto`, `EtudiantDashboardDto`

#### Jour 5: Tests Unitaires
- [ ] Tests ViewModels avec différents rôles
- [ ] Mocks repository

---

### Semaine 2: Dashboard & Navigation

#### Jour 1-2: DashboardViewModel Refactor
- [ ] Supprimer code dupliqué
- [ ] Implémenter logique métier distincte:
  - Enseignant: stats classes, alertes fraude, épreuves à surveiller
  - Étudiant: progression personnelle, résultats, épreuves à venir

#### Jour 3-4: Navigation Conditionnelle
- [ ] Modifier `Navigation.kt` avec bottom nav dynamique
- [ ] iOS: adapter `TabView` selon rôle
- [ ] Routes protégées par rôle (ex: `/surveillance` → enseignant only)

#### Jour 5: UI Components
- [ ] `StatCard` adaptatif (label différent selon rôle)
- [ ] `EpreuveCard` avec actions contextuelles (surveiller vs passer)

---

### Semaine 3-4: Écrans Enseignant

#### Écran: Création Épreuve
- [ ] Formulaire: titre, description, durée, date limite
- [ ] Ajout questions manuelles
- [ ] Génération IA (`POST /api/ai/generate-questions`)
- [ ] Preview avant publication

#### Écran: Surveillance Live
- [ ] Connexion SSE (`/api/surveillance/stream`)
- [ ] Liste étudiants en temps réel
- [ ] Alertes fraude (changement onglet, tentative copie)
- [ ] Action: avertir étudiant, terminer session

#### Écran: Correction
- [ ] Liste sessions soumises
- [ ] Affichage réponses par question
- [ ] Saisie note + feedback
- [ ] Validation globale

---

### Semaine 5-6: Écrans Étudiant

#### Écran: Mes Résultats
- [ ] Historique épreuves avec notes
- [ ] Graphique progression
- [ ] Certificats téléchargeables (PDF)
- [ ] Partage LinkedIn

#### Écran: Révisions
- [ ] Flashcards (spaced repetition)
- [ ] Practice mode avec IA
- [ ] Planning de révisions personnalisé
- [ ] Mode offline (SQLDelight cache)

#### Écran: Devoirs
- [ ] Liste devoirs à rendre
- [ ] Upload fichier (R2 presigned URL)
- [ ] Suivi statut (à rendre, noté, retard)
- [ ] Feedback enseignant

---

### Semaine 7-8: Polish & Tests

#### Jours 1-3: Dark Mode & Accessibilité
- [ ] Thème sombre complet
- [ ] TalkBack/VoiceOver labels
- [ ] Contrastes couleurs

#### Jours 4-5: Performance
- [ ] Pagination infinie listes
- [ ] Image caching (Coil/Kingfisher)
- [ ] Prefetching données dashboard

#### Jours 6-7: Beta Testing
- [ ] Test utilisateurs (5 enseignants, 5 étudiants)
- [ ] Collecte feedback
- [ ] Corrections bugs

#### Jour 8: Production
- [ ] Build release
- [ ] Submission App Store / Play Store
- [ ] Documentation mise à jour

---

## 🔐 Matrice de Permissions Finale

| Action | ADMIN | RESPONSABLE | ENSEIGNANT | ETUDIANT |
|--------|-------|-------------|------------|----------|
| **Mobile App** | ❌ Web only | ❌ Web only | ✅ Full | ✅ Full |
| **Créer épreuve** | ✅ | ✅ | ✅ | ❌ |
| **Modifier épreuve** | ✅ | ✅ | ✅ (ses épreuves) | ❌ |
| **Supprimer épreuve** | ✅ | ✅ | ✅ (ses épreuves) | ❌ |
| **Surveiller session** | ✅ | ✅ | ✅ (ses épreuves) | ❌ |
| **Corriger copies** | ✅ | ✅ | ✅ (ses épreuves) | ❌ |
| **Voir stats classe** | ✅ | ✅ | ✅ (ses classes) | ❌ |
| **Créer devoir** | ✅ | ✅ | ✅ | ❌ |
| **Noter devoir** | ✅ | ✅ | ✅ | ❌ |
| **Passer examen** | ❌ | ❌ | ❌ | ✅ |
| **Voir résultats perso** | ❌ | ❌ | ❌ | ✅ |
| **Soumettre devoir** | ❌ | ❌ | ❌ | ✅ |
| **Révisions IA** | ❌ | ❌ | ❌ | ✅ |
| **Télécharger certificat** | ❌ | ❌ | ❌ | ✅ |

---

## 📊 Métriques de Succès

- [ ] **0 connexions ADMIN/RESPONSABLE** sur mobile (tracking analytics)
- [ ] **+30% engagement étudiant** (révisions, résultats)
- [ ] **+50% création épreuves mobile** (enseignants)
- [ ] **-40% temps correction** (interface optimisée)
- [ ] **4.5+ rating** App Store / Play Store

---

## 🚀 Prochaines Étapes Immédiates

1. **Commencer par iOS Auth Fix** (critique: sécurité)
2. **Refactor DashboardViewModel** (impact utilisateur immédiat)
3. **Créer navigation conditionnelle** (foundation pour autres écrans)
4. **Prioriser écrans enseignants** (création épreuve = valeur métier forte)
