# 05 — Sécurité

> **Document vivant** — Modifier ce fichier si la stratégie de sécurité desktop évolue.

## 1. Authentification

### 1.1 Principe : transparence totale

L'utilisateur se connecte **une fois** dans le webview. Sa session (cookies JWT) persiste entre les lancements de l'app. Aucune auth spécifique desktop.

### 1.2 Flux

```
1. Utilisateur lance SECT Desktop
2. Webview charge https://sect-app.vercel.app/login
3. Utilisateur saisit email + mot de passe
4. Next.js POST /api/go-auth/login → Backend Go (Render)
5. Backend pose cookies httpOnly (access_token 15min + refresh_token 7j)
6. Webview stocke les cookies dans son cookie jar persistant
7. Utilisateur navigue → cookies envoyés automatiquement
8. Au prochain lancement : webview charge /dashboard (cookies présents → auth OK)
```

### 1.3 Persistance des cookies

Wails v2 utilise un webview Chromium avec un cookie jar **persistant par défaut** :
- Windows : `%APPDATA%/sect-desktop/`
- macOS : `~/Library/Application Support/sect-desktop/`
- Linux : `~/.config/sect-desktop/`

La session persiste entre lancements. L'utilisateur ne se reconnecte que si le `refresh_token` (7j) expire.

### 1.4 Gestion du refresh

Le proxy Next.js (`proxy.ts`) laisse passer si `access_token` OU `refresh_token` est présent. Le client-side (`auth-store.refreshSession`) fait le refresh automatique. **Ce mécanisme fonctionne tel quel dans le webview** — aucune adaptation nécessaire.

### 1.5 Déconnexion

L'utilisateur se déconnecte via le menu SECT existant. Le backend invalide le refresh token, les cookies sont supprimés du cookie jar.

### 1.6 Multi-comptes (mode assistance)

SECT supporte le "switch account" (ADMIN → mode assistance sur un établissement). Ce mécanisme est **100% web** (store Zustand + API). Fonctionne tel quel dans le webview.

## 2. Stockage des jetons

| Élément | Stockage | Sécurité |
|---|---|---|
| `access_token` (15 min) | Cookie httpOnly webview | httpOnly + Secure + SameSite=Lax |
| `refresh_token` (7j) | Cookie httpOnly webview | httpOnly + Secure + SameSite=Lax |
| Cookies persistants | Cookie jar Chromium webview | Isolé par profil OS |

**Jamais** de token dans localStorage ou sessionStorage (vulnérable XSS).

## 3. Communication TLS

- Toutes les requêtes webview → backend passent par HTTPS (`sect-zead.onrender.com`)
- TLS 1.2+ (configuré Render + Vercel)
- Certificate pinning : non requis (HTTPS standard suffit pour un SaaS B2B/B2C)

## 4. Sécurité des bindings Wails

### 4.1 Risque

Les bindings Wails exposent des fonctions Go au JavaScript. Un XSS dans le webview pourrait appeler des fonctions malveillantes (ex: `PrintPDF` avec un path système).

### 4.2 Mitigations

| Mitigation | Détail |
|---|---|
| Valider inputs | Path canonique, whitelist extensions, length limits |
| Logger appels | Audit trail de tous les appels de bindings |
| Rate-limit | Fonctions coûteuses (PrintBatch, DownloadFolder) |
| Pas de shell brut | Jamais `exec.Command(input_utilisateur)` sans validation |
| CSP strict | Héritée de Next.js, empêche XSS dans webview |

### 4.3 Exemple de validation

```go
func (a *App) PrintPDF(filePath string) error {
    abs, err := filepath.Abs(filePath)         // Path canonique
    if err != nil { return err }
    ext := strings.ToLower(filepath.Ext(abs))  // Whitelist
    if ext != ".pdf" { return fmt.Errorf("only PDF") }
    if _, err := os.Stat(abs); err != nil { return err } // Existence
    slog.Info("PrintPDF called", "file", abs)  // Audit
    return a.printer.Print(abs)
}
```

## 5. Code signing

### 5.1 Pourquoi

| OS | Sans signing | Avec signing |
|---|---|---|
| Windows | SmartScreen bloque 80% | Aucun avertissement |
| macOS | Gatekeeper bloque 100% | "Éditeur vérifié" |
| Linux | Pas de blocage | Recommandé pour dépôts APT/RPM |

→ Voir [ADR-0005 : Code signing](./ADR/0005-code-signing.md)

### 5.2 Stockage des certificats

| Élément | Stockage | Accès |
|---|---|---|
| Certificat Windows `.pfx` | GitHub Secrets (base64) | CI uniquement |
| Mot de passe certificat Windows | GitHub Secrets | CI uniquement |
| Apple Developer ID (clé privée) | GitHub Secrets (base64) | CI uniquement |
| Apple app-specific password | GitHub Secrets | CI uniquement |
| Team ID Apple | GitHub Secrets | CI uniquement |

**Jamais** committer de certificat dans le repo. **Jamais** stocker en clair sur une machine de dev.

## 6. Auto-update sécurisé

### 6.1 Vérification de signature

Chaque binaire publié sur GitHub Releases est accompagné d'un fichier `.sig` (signature Minisign). L'updater vérifie la signature avant d'installer.

```
sect-desktop-1.2.0-windows.exe       ← binaire
sect-desktop-1.2.0-windows.exe.sig   ← signature
```

Si la signature est invalide → abandon + notification erreur.

### 6.2 HTTPS obligatoire

Tous les téléchargements passent par HTTPS (GitHub CDN). Pas de MITM possible.

→ Voir [06 — Auto-update](./06-auto-update.md) pour les détails.

## 7. Matrice des risques sécurité

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| XSS dans webview appelle bindings malveillants | Faible | Élevé | CSP strict + validation inputs Go + rate-limit |
| Vol de cookies (malware local) | Faible | Élevé | Cookies httpOnly + Secure (déjà en place) |
| Certificat signing compromis | Très faible | Critique | Rotation immédiate + revoke + re-release |
| Binaires modifiés (MITM download) | Faible | Élevé | Signature .sig vérifiée par updater |
| Session partagée entre users OS | Très faible | Moyen | Cookie jar isolé par profil OS (Wails default) |
| Token dans logs | Très faible | Moyen | Middleware logging exclut cookies (déjà en place) |

## 8. Références

- [ADR-0005 : Code signing](./ADR/0005-code-signing.md)
- [06 — Auto-update](./06-auto-update.md)
- [07 — Code signing](./07-code-signing.md)
- [Sécurité SECT (README)](../../README.md#sécurité)
