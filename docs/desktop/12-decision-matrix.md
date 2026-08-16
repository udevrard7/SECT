# 12 — Matrice de décisions fonctionnelles

> **Document vivant** — Matrice à valider avant chaque ajout de fonctionnalité desktop.

## 1. Principe

Avant chaque fonctionnalité desktop, on répond à la question :

> **Cette fonctionnalité apporte-t-elle une valeur que le Web ne peut pas offrir ?**

- Si **oui** → implémenter dans le desktop
- Si **non** → implémenter dans le web (ou ne pas implémenter)

Cette matrice évite de développer des fonctionnalités desktop qui n'apportent aucun bénéfice réel.

## 2. Matrice des fonctionnalités

| Fonction | Web | Desktop | Décision | Justification |
|---|---|---|---|---|
| **Passation d'examen** | ✅ | ✅ | Web uniquement | PWA + kiosk mode couvre déjà |
| **Création d'examen (QCU/QCM/QRC/CODE)** | ✅ | ✅ | Web uniquement | Web parfaitement adapté |
| **Correction QCU/QCM (auto-grading)** | ✅ | ✅ | Web uniquement | Auto-grading cloud, pas besoin local |
| **Correction QRC/CODE (IA)** | ✅ | ✅ | Web uniquement | IA cloud (10 providers) |
| **Surveillance temps réel** | ✅ | ✅ | Web uniquement | WebSocket fonctionne en web/PWA |
| **Messagerie** | ✅ | ✅ | Web uniquement | SSE + WebSocket en web |
| **Gestion académique (étab, filières, UE)** | ✅ | ✅ | Web uniquement | CRUD web parfait |
| **Tableaux de bord** | ✅ | ✅ | Web uniquement | Recharts en web |
| **Webcam (photo d'identité)** | ✅ | ✅ | Web uniquement | `getUserMedia` web |
| **Notifications** | ⚠️ | ✅ | **Desktop** | Notifications natives persistantes (Action Center) |
| **Impression PDF (1 document)** | ⚠️ | ✅ | **Desktop** | Impression native silencieuse |
| **Impression en lot (certificats, relevés)** | ❌ | ✅ | **Desktop** | File d'attente impression native |
| **Téléchargement massif de documents** | ⚠️ | ✅ | **Desktop** | Sélection dossier, progress, retry |
| **Drag-drop de fichiers (correction)** | ⚠️ | ✅ | **Desktop** | Multi-fichiers + accès FS complet |
| **Scanner PDF** | ❌ | ✅ | **Desktop** | Accès scanner via OS |
| **Dossiers locaux (lecture/écriture)** | ❌ | ✅ | **Desktop** | Accès FS complet |
| **Mises à jour automatiques** | ⚠️ | ✅ | **Desktop** | Background updater silencieux |
| **Ouvrir URL externe** | ✅ | ✅ | Web (desktop bonus) | `target=_blank` web, natif desktop |
| **Lancement auto au démarrage OS** | ❌ | ✅ | **Desktop** | Option "Lancer SECT au démarrage" |
| **Multi-fenêtres** | ❌ | ✅ | **Desktop (futur)** | Plusieurs fenêtres SECT simultanées |
| **Raccourcis clavier globaux** | ❌ | ✅ | **Desktop (futur)** | Hotkey globale (ex: Ctrl+Shift+S) |

**Légende** :
- ✅ = Fonctionne bien
- ⚠️ = Fonctionne mais limité / dégradé
- ❌ = Ne fonctionne pas ou très mal

## 3. Décisions par fonctionnalité desktop

### 3.1 Notifications (Phase B)

| Critère | Web (Web Push) | Desktop (OS natif) |
|---|---|---|
| Persistance | Disparaît après fermeture navigateur | Persistante (Action Center / Notification Center) |
| Affichage hors app | Non (onglet doit être ouvert) | Oui |
| Son | Limité | Natif OS |
| Actions boutons | Limité | Natif |
| Rate-limit | Navigateur dependent | Aucun |

**Décision** : Implémenter `ShowNotification(title, body)` en desktop. Le web garde Web Push (PWA) pour le fallback.

### 3.2 Impression PDF (Phase B)

| Critère | Web | Desktop |
|---|---|---|
| Dialogue impression | Oui (Ctrl+P) | Silencieux (direct imprimante par défaut) |
| Impression en lot | Non (1 par 1) | Oui (PrintBatch) |
| File d'attente | Non | Oui |
| Sélection imprimante | Oui (dialogue) | Oui (ListPrinters) |

**Décision** : Implémenter `PrintPDF(filePath)` et `PrintBatch(filePaths)` en desktop. Le web garde Ctrl+P pour impression unitaire.

### 3.3 Téléchargement massif (Phase C)

| Critère | Web | Desktop |
|---|---|---|
| Sélection dossier | Non (download navigateur) | Oui (SelectFolder) |
| Progress bar par fichier | Limité | Natif |
| Retry auto | Non | Oui |
| Parallel downloads | Limité | Oui (goroutines) |

**Décision** : Implémenter `DownloadFolder(urls, destDir)` en desktop. Le web garde le download unitaire.

### 3.4 Drag-drop fichiers (Phase C)

| Critère | Web | Desktop |
|---|---|---|
| Drag-drop multi-fichiers | ⚠️ Limité navigateur | ✅ Natif |
| Drag-drop dossier | ❌ | ✅ |
| Accès chemin fichier | ❌ (File API) | ✅ |

**Décision** : Implémenter le drag-drop natif en desktop pour la correction de copies (enseignant glisse plusieurs copies PDF → upload R2).

### 3.5 Webcam (NON desktop)

| Critère | Web | Desktop |
|---|---|---|
| Accès caméra | `getUserMedia` ✅ | ✅ |
| Qualité | Identique | Identique |
| Permissions | Navigateur | OS |

**Décision** : **Pas de fonction webcam desktop**. Le web `getUserMedia` fonctionne parfaitement dans le webview Wails. Aucune valeur ajoutée desktop.

### 3.6 Passation d'examen (NON desktop)

| Critère | Web (PWA kiosk) | Desktop |
|---|---|---|
| Fullscreen | ✅ Chrome --kiosk | ✅ |
| Anti-fraude | ✅ (surveillance SECT) | ✅ |
| Lockdown | ✅ kiosk mode | ✅ |

**Décision** : **Pas de mode examen desktop spécifique**. Le web PWA + kiosk mode (script `.bat`/`.sh` déjà livré dans `/downloads`) couvre le besoin. Le desktop apporterait une complexité supplémentaire sans valeur ajoutée.

## 4. Processus d'ajout d'une fonctionnalité

1. **Demande** : issue GitHub labellisée `desktop-feature`
2. **Analyse matrice** : remplir une ligne dans ce tableau
3. **Décision** :
   - Si `Web uniquement` → fermer l'issue
   - Si `Desktop` → valider avec l'équipe
4. **ADR si logique métier** : si la feature nécessite de la logique métier locale, créer un ADR
5. **Implémentation** : [04 — Native API](./04-native-api.md)
6. **Mise à jour matrice** : ajouter la ligne dans ce fichier

## 5. Références

- [04 — Native API](./04-native-api.md)
- [11 — Governance](./11-governance.md) (principe 3 : valeur ajoutée)
- [10 — Roadmap](./10-roadmap.md) (phases d'implémentation)
