# SECT Mobile — Kotlin Multiplatform

## Structure

```
mobile/
├── shared/               # 🧠 Logique partagée Kotlin
│   ├── src/
│   │   ├── commonMain/   # Client Ktor, DTOs, Repository, JWT cache
│   │   ├── androidMain/  # EncryptedSharedPreferences, OkHttp engine
│   │   └── iosMain/      # Keychain/NSUserDefaults, Darwin engine
│   └── build.gradle.kts
│
├── androidApp/           # 📱 UI Android (Jetpack Compose)
│   ├── src/main/
│   │   ├── kotlin/       # Compose screens, navigation, theme
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
│
└── iosApp/               # 🍎 UI iOS (SwiftUI)
    ├── iosApp/
    │   ├── Views/        # Login, Dashboard, Epreuves, etc.
    │   ├── ViewModels/   # AuthViewModel, etc.
    │   └── Utilities/    # Colors, extensions
    └── iosApp.xcodeproj/
```

## Module partagé (`shared/`)

### Dépendances (commonMain)
- **Ktor Client 3.1.3** : communication HTTP avec le backend Go
- **kotlinx.serialization-json 1.8.1** : sérialisation/désérialisation JSON
- **kotlinx-datetime 0.7.0** : gestion des dates/instants
- **kotlinx-coroutines 1.10.1** : programmation asynchrone
- **Koin 4.1** : injection de dépendances

### APIs implémentées
| API | Endpoints | Description |
|-----|-----------|-------------|
| `AuthApi` | login, refresh, logout, password-reset | Authentification JWT |
| `UserApi` | CRUD users, import, reset-password | Gestion utilisateurs |
| `EpreuveApi` | CRUD épreuves, sessions, résultats | Examens |
| `SessionApi` | getOrCreate, submit, saveReponse | Passation d'examens |
| `MessagerieApi` | conversations, messages | Chat temps réel |

### Cache sécurisé
| Plateforme | Implémentation | Stockage |
|---|---|---|
| Android | `EncryptedSharedPreferences` | Fichier chiffré AES256 |
| iOS | `NSUserDefaults` → Keychain | Keychain (production) |

## Développement

### Prérequis
- JDK 17+
- Android Studio (Iguana+) ou IntelliJ IDEA
- Xcode 16+ (pour iOS)
- Android SDK 36 (compileSdk)

### Build Android
```bash
cd mobile
./gradlew :androidApp:assembleDebug
```

### Build iOS Framework
```bash
cd mobile
./gradlew :shared:linkDebugFrameworkIosArm64
# Puis ouvrir iosApp/iosApp.xcodeproj dans Xcode
```

### Tests
```bash
./gradlew :shared:allTests
```

## Correspondance avec le backend Go

| Go Type | Kotlin Type |
|---------|-------------|
| `domain.User` | `com.sect.mobile.shared.domain.model.User` |
| `domain.AuthSession` | `com.sect.mobile.shared.domain.model.AuthSession` |
| `domain.Epreuve` | `com.sect.mobile.shared.domain.model.Epreuve` |
| `domain.Role` | `com.sect.mobile.shared.domain.enum.Role` |
| `domain.StatutEpreuve` | `com.sect.mobile.shared.domain.enum.StatutEpreuve` |
| etc. | Tous les enums et modèles sont mappés 1:1 |

## CI/CD

Le workflow `.github/workflows/mobile-ci.yml` se déclenche automatiquement
sur les push/pull_requests modifiant `mobile/` :

- **android** : Build APK + tests unitaires (ubuntu-latest)
- **ios** : Build Shared.framework + tests (macos-latest)
- **lint** : Detekt (non-blocking en phase initiale)
