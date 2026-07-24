# ADR-0004 : GitHub Releases comme serveur d'auto-update

| Champ | Valeur |
|---|---|
| **Statut** | Accepté |
| **Date** | Juillet 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Supersedes** | — |
| **Superseded by** | — |

## Contexte

L'application desktop SECT doit proposer des mises à jour automatiques. Il faut un serveur de releases pour héberger les binaires versionnés + un manifest d'update. Plusieurs options existent.

## Options considérées

### Option A — Serveur custom (VPS Render + CDN)
- **Avantages** : Contrôle total, métriques custom
- **Inconvénients** : Coût (VPS + CDN), maintenance, auth à gérer, point de défaillance

### Option B — Service commercial (Squirrel.Mac, UpdateEngine, electron-updater)
- **Avantages** : Prêt à l'emploi
- **Inconvénients** : Coût récurrent, lock-in, souvent lié à Electron

### Option C — GitHub Releases
- **Avantages** : Gratuit, CDN global, versioning natif (tags Git), pas de maintenance, déjà utilisé pour le code source
- **Inconvénients** : Binaires publics (pas de secret dedans), rate-limit API GitHub (60 req/h anonyme, 5000 req/h authentifié)

### Option D — Backblaze B2 + Cloudflare CDN
- **Avantages** : Très bon marché, contrôle total
- **Inconvénients** : Plus complexe à mettre en place, pas de versioning natif

## Décision

**GitHub Releases** (Option C).

## Justification

1. **Gratuit** : Inclus dans le plan GitHub gratuit de SECT
2. **CDN global** : GitHub cache les releases partout dans le monde
3. **Versioning natif** : Tags Git = versions release, pas de système à inventer
4. **Intégration CI/CD** : GitHub Actions peut uploader directement vers GitHub Releases (`softprops/action-gh-release`)
5. **Pas de maintenance** : Pas de VPS à gérer, pas d'auth à développer
6. **Rate-limit acceptable** : L'auto-update fait ~1 req/jour/user. Avec 1000 users = 1000 req/j, largement sous la limite (5000 req/h authentifié)

## Conséquences

### Positives
- Coût : 0 €
- Maintenance : 0
- Déploiement : Automatisé via GitHub Actions
- Versioning : Natif

### Négatives
- Binaires publics : n'importe qui peut télécharger l'exe. **Mitigation** : aucun secret dans le binaire (les credentials sont saisis par l'utilisateur au login, stockés dans le cookie jar webview)
- Rate-limit : 60 req/h anonyme. **Mitigation** : l'app desktop peut s'authentifier avec un token GitHub public (lecture seule, scope `public_repo`) pour passer à 5000 req/h

### Format du manifest

Wails updater attend un fichier `latest.json` à une URL fixe. On l'héberge comme asset de la release `latest` :

```
https://github.com/udevrard7/SECT/releases/latest/download/latest.json
```

Format :
```json
{
  "version": "1.2.0",
  "notes": "...",
  "pub_date": "2026-07-23T10:00:00Z",
  "platforms": {
    "windows-x86_64": { "signature": "...", "url": "..." },
    "darwin-aarch64": { "signature": "...", "url": "..." },
    "linux-x86_64":   { "signature": "...", "url": "..." }
  }
}
```

## Critères de réévaluation

Réévaluer si :
- Trafic auto-update > 100 000 req/jour (limite GitHub)
- Besoin de métriques téléchargement détaillées par pays/user
- Besoin de canaux privés (ex: beta fermée payante)

Dans ce cas, migrer vers Option D (B2 + Cloudflare) ou un service commercial.

## Références

- [GitHub Releases API](https://docs.github.com/en/rest/releases/releases)
- [Wails updater documentation](https://wails.io/docs/guides/updater)
