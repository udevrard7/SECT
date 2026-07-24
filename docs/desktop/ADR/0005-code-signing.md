# ADR-0005 : Code signing obligatoire (Windows OV + macOS notarization)

| Champ | Valeur |
|---|---|
| **Statut** | Accepté |
| **Date** | Juillet 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Supersedes** | — |
| **Superseded by** | — |

## Contexte

Sur Windows, un `.exe` non signé déclenche **SmartScreen** (écran bleu "Windows a protégé votre ordinateur"). **80% des utilisateurs abandonnent l'installation**. Sur macOS, un `.app` non signé affiche "Impossible d'ouvrir car le développeur ne peut pas être vérifié" (Gatekeeper). Sans signing, l'adoption desktop est tuée silencieusement.

## Options considérées

### Option A — Pas de signing
- **Avantages** : 0 €, 0 démarche
- **Inconvénients** : SmartScreen bloque 80%, Gatekeeper macOS bloque 100%, perception "malware"

### Option B — Signing Windows uniquement
- **Avantages** : Coût limité (200-300 €/an)
- **Inconvénients** : macOS toujours bloqué (Gatekeeper), adoption Mac nulle

### Option C — Signing Windows OV + Apple Developer ID + notarization
- **Avantages** : Adoption maximale sur les 2 plateformes majeures
- **Inconvénients** : Coût 290-650 €/an, démarches administratives (vérification entreprise)

### Option D — Signing Windows EV + Apple Developer ID + notarization
- **Avantages** : Bypass SmartScreen immédiat (pas de build réputation), adoption maximale
- **Inconvénients** : Coût 450-550 €/an, hardware token USB requis, démarches plus longues

## Décision

**Option C** (signing OV Windows + Apple Developer ID + notarization) en Phase B, avec migration vers **Option D** (EV) si l'adoption le justifie en Phase D.

## Justification

1. **SmartScreen tue l'adoption** : Sans signing, 80% des Windows abandonnent. C'est un must-have, pas un nice-to-have.
2. **Gatekeeper macOS bloque tout** : Sans notarization, l'app est inutilisable sur macOS (sauf clic droit + ouvrir, contre-intuitif).
3. **OV suffisant pour démarrer** : Le certificat OV (Organization Validation) demande une réputation à construire (15-30 installations) avant que SmartScreen ne disparaisse complètement. Acceptable pour Phase B (early adopters).
4. **EV pour scale** : Une fois l'adoption confirmée (Phase D), migrer vers EV pour bypass immédiat. L'EV est plus cher (350-450 €/an) et nécessite un hardware token USB, mais élimine la friction d'installation.

## Conséquences

### Positives
- Adoption desktop non bloquée par les filtres OS
- Perception "logiciel institutionnel" (vs "site web potentiellement dangereux")
- Pré-requis pour déploiement B2B (DSI exigent du signing)

### Négatives
- Coût annuel : 290-650 € (OV + Apple)
- Démarches administratives : vérification entreprise (1-7 jours)
- Hardware token EV : contrainte logistique (USB requis pour signer)

### Mitigation
- Les certificats sont stockés dans GitHub Secrets (base64), jamais dans le repo
- Le signing est automatisé en CI/CD GitHub Actions (pas de poste local)
- Renouvellement anticipé 30j avant expiration

## Budget

| Poste | Coût annuel | Phase |
|---|---|---|
| Certificat Windows OV (Sectigo/DigiCert) | 200-300 € | B (démarrage) |
| Apple Developer Program | 99 $ (~90 €) | B |
| Migration Windows EV (optionnel) | +150 € | D (si adoption justifie) |
| **Total Phase B** | **290-390 €/an** | |
| **Total Phase D (avec EV)** | **440-540 €/an** | |

## Critères de migration OV → EV

Migrer vers EV si :
- ≥ 100 installations desktop actives
- Retours utilisateurs sur avertissement SmartScreen récurrents
- Demande explicite d'un client B2B majeur

## Références

- [Windows Code Signing](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-signing)
- [SmartScreen Reputation](https://learn.microsoft.com/en-us/windows/security/threat-protection/microsoft-defender-smartscreen/microsoft-defender-smartscreen-overview)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Sectigo Code Signing](https://www.sectigo.com/ssl-certificates-tls/code-signing)
