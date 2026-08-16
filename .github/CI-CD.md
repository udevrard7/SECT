# SECT — CI/CD Pipeline : Du Code au Binaire

## 🔄 Le Pipeline

```
┌──────────────────────┐       ┌──────────────────────────┐       ┌──────────────────────┐
│  1. Votre PC         │       │ 2. GitHub Actions        │       │ 3. Binaires générés  │
│  Vous écrivez du     │──────►│ compile votre code       │──────►│  • app-release.apk   │
│  code source         │ Push  │ sur ses serveurs         │       │  • SECT.app/.ipa     │
│  (Kotlin / Swift)    │       │ Linux + macOS            │       └──────────┬───────────┘
└──────────────────────┘       └──────────────────────────┘                   │
                                                                              ▼
                                                                    4. Test visuel
                                                                    Appetize.io
```

## 📁 Workflows

| Fichier | Trigger | Ce qu'il fait |
|---------|---------|---------------|
| `mobile-ci.yml` | push/PR sur main | Compile shared → APK Android → .app iOS → Appetize |
| `mobile-release.yml` | tag `v*` | Build release signé → GitHub Release avec binaires |
| `backend-ci.yml` | push/PR | Lint Go → Tests → Build binary → Check migrations |
| `frontend-ci.yml` | push/PR | Lint Next.js → Tests → Build |

## 🤖 Comment ça marche concrètement

### Rien à compiler sur votre PC
Vous continuez d'écrire du code sous Windows dans VS Code. **Aucun SDK Android/Xcode requis localement.**

### Compilation dans le Cloud
Quand vous faites `git push`:

1. **GitHub Actions** lit vos fichiers `.github/workflows/*.yml`
2. Il crée des serveurs virtuels temporaires :
   - **Linux (ubuntu-latest)** → compile l'APK Android avec Gradle
   - **macOS (macos-14)** → compile l'app iOS avec Xcode (fourni par GitHub)
3. Chaque étape est visible dans l'onglet **Actions** de GitHub

### Artefacts générés
| Plateforme | Fichier | Serveur | Taille approx. |
|-----------|---------|---------|---------------|
| Android | `app-release.apk` | Linux | ~15-30 MB |
| iOS | `SECT.app` (simulator) | macOS | ~50-100 MB |
| iOS | `SECT.ipa` (device) | macOS | ~30-60 MB |

### Test sur Appetize.io
L'APK est automatiquement uploadé vers Appetize.io. Vous recevez un lien pour tester l'app **dans votre navigateur** sans téléphone.

## 🔑 Secrets GitHub à configurer

Allez dans **GitHub → Settings → Secrets and variables → Actions** :

### Requis (build Android)

| Secret | Description | Comment l'obtenir |
|--------|-------------|-------------------|
| `GOOGLE_SERVICES_JSON_B64` | Firebase Android config | `base64 -i google-services.json` |
| `ANDROID_KEYSTORE_B64` | Keystore release | `base64 -i sect-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Mot de passe keystore | Celui de `keystore.properties` |
| `ANDROID_KEY_ALIAS` | Alias de la clé signing | `sect-release` |
| `ANDROID_KEY_PASSWORD` | Mot de passe de la clé | Celui de `keystore.properties` |

### Requis (build iOS)

| Secret | Description | Comment l'obtenir |
|--------|-------------|-------------------|
| `GOOGLE_SERVICE_INFO_PLIST_B64` | Firebase iOS config | `base64 -i GoogleService-Info.plist` |
| `APPLE_CERT_B64` | Certificat Apple Developer (.p12) | `base64 -i certificate.p12` |
| `APPLE_CERT_PASSWORD` | Mot de passe du .p12 | Celui de Keychain Access |
| `APPLE_PROVISION_PROFILE_B64` | Provisioning profile | `base64 -i sect.mobileprovision` |
| `APPLE_PROVISION_UUID` | UUID du provisioning profile | Dans le fichier .mobileprovision |

### Optionnel

| Secret | Description |
|--------|-------------|
| `APPETIZE_API_TOKEN` | Token API Appetize.io pour test navigateur |

## 🚀 Lancer un Release

```bash
# 1. Taguer une version
git tag v1.0.0
git push origin v1.0.0

# 2. GitHub Actions compile automatiquement
# 3. Une GitHub Release est créée avec l'APK + IPA attachés
# 4. L'APK est uploadé sur Appetize.io pour test
```

## 📊 Monitoring

- **Onglet Actions** sur GitHub → voir les runs en temps réel
- Chaque run affiche : ✅ succès / ❌ échec / ⚠️ warnings
- Les artefacts sont téléchargeables pendant 30 jours (release) ou 7 jours (PR)

## 🔧 Dépannage

| Problème | Solution |
|----------|----------|
| `google-services.json is missing` | Vérifiez que `GOOGLE_SERVICES_JSON_B64` est configuré dans les secrets |
| Keystore not found | Vérifiez `ANDROID_KEYSTORE_B64` + `keystore.properties` |
| iOS build fails | Vérifiez certificat Apple + provisioning profile |
| `APK too large` | Activez R8/ProGuard (déjà configuré) + shrinkResources |
