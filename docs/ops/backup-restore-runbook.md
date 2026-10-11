# Runbook — Backups SECT chiffrés + tests de restauration

**Statut** : livré (SECT-BACKUP-1, ADR-0013 §15) · **Décisions** : D1-D10 validées par l'exploitant le 11/10/2026
**Objectif** : résilience décorrélée de Neon pour ~5 % de l'effort de l'option C complète (ADR-0013 §6 phase 1) — le trou n°1 (aucune sauvegarde décorrélée) est comblé.

```
Neon (source de vérité, eu-central-1)
   │ 03:32 UTC (DANS la fenêtre d'éveil du tick 03:30 grille M1 → CU marginal ≈ 0)
   ▼
pg_dump -Fc + pg_dumpall --globals-only + manifest counts   [VM OCI Marseille]
   ▼
chiffrement age (clé PUBLIQUE seule sur la VM — D2)
   ▼
rclone → Object Storage OCI Always Free (bucket sect-backups, ~20 Go gratuits — D3/D7)
   ▼
rétention : 30 quotidiens + 12 mensuels (D9) · watchdog 12:32 UTC (silence > 36 h)
```

**Ce qui est déjà en place (installer via Actions, §4)** : scripts `ops/backup/`, timers systemd, cluster PG dédié `sect` (5433, 127.0.0.1 — D6), workflow `backup-install.yml` (self-test + install idempotente), workflow `vm-audit.yml` (audit lecture seule).

---

## 1. Ce que chaque décision D1-D10 interdit/implique (rappel express)

| # | Décision | Conséquence |
|---|---|---|
| D1 | `pg_dump -Fc` | seul moteur possible depuis Neon (pas d'accès WAL serveur) ; listing sélectif testable |
| D2 | age client-side + SSE bucket | la clé PRIVÉE ne touche JAMAIS la VM ni le bucket (escrow exploitant, doublé) |
| D3 | rclone | API S3-compat OCI, checksums, prune natif |
| D4 | systemd timer `Persistent=true` | rattrape un run manqué au reboot ; PAS GitHub Actions (schedules cassés, SECT-UPTIME-PROBE-3) |
| D5 | nightly 03:32 UTC | RPO 24 h ; passage horaire = 1 ligne de timer, calée grille (§8) |
| D6 | cluster dédié 5433 | cible des restores ET zone d'atterrissage N3 (jamais le cluster mikcloud 5432) |
| D7 | CSK + policy scopée | l'utilisateur OCI `sect-backup` ne peut RIEN faire hors du bucket |
| D8 | dump + globals + manifest | les 233 policies RLS exigent les rôles ; les counts prouvent le restore |
| D9 | 30 j + 12 mensuels | ~0,5 Go vs ~20 Go gratuits ; capacité de remonter AVANT une corruption tardive |
| D10 | alerte taille base ≥ 60 % | règle système `db-taille-quota` (migration 000135) — le mur 1 GiB est silencieux sinon |

**Preuve d'intégrité (mesurée 11/10/2026, ADR-0013 §15)** : le rôle du DSN direct porte `BYPASSRLS` sur Neon → `pg_dump` capture **toutes** les lignes des tables RLS FORCE (`AlertingRule`=11, `RequestLog`=4 886 comptés sans claims). Un dump amputé par RLS est exclu par construction.

---

## 2. Ordre de mise en service (première fois — ~45 min au total)

> Prérequis : la branche `main` contient `ops/backup/` + les workflows (déjà poussé avec ce runbook).

1. **Audit VM (optionnel mais recommandé, 1 clic)** : Actions → `VM audit (lecture seule)` → Run workflow → lire le rapport dans le log. Vérifier : cluster 18-main sain, disque confortable, reclaim Oracle (§9).
2. **Installer l'outillage** : Actions → `Backup tooling (OCI)` → Run workflow. Le job `install` (SSH) pose scripts + timers + cluster dédié 5433 et **seed** `/opt/sect/backup.env` (chmod 600) depuis l'exemple. Les timers restent **désactivés** tant que §3 n'est pas fait.
3. **§3 — Configurer la console OCI + backup.env** (~15 min, une fois).
4. **§4 — Activer** (systemctl enable --now).
5. **§5 — Premier backup + première preuve de restore** (obligatoires le jour même).
6. **§6 ensuite** : test mensuel (rappel automatique Discord les 1-3 du mois).

---

## 3. Configuration console OCI + backup.env (~15 min, une fois)

### 3.1 Bucket Object Storage
Console OCI → Storage → Buckets → **Create bucket** :
- Name : `sect-backups` · Region : **eu-marseille-1** (même région que la VM → upload LAN-rapide, sortie gratuite intra-région)
- Default encryption : **Encrypt using Oracle-managed keys** (SSE — la couche age est au-dessus, §3.3)

### 3.2 Utilisateur IAM dédié + policy scopée (D7)
1. Identity → Users → **Create user** : `sect-backup` (description : « SECT backups — CSK S3 Object Storage, policy scopée bucket sect-backups »). PAS de mot de passe console.
2. Récupérer le **namespace** de la tenancy : Profile → Tenancy → Object Storage Namespace (chaîne aléatoire).
3. Sous l'utilisateur `sect-backup` : **Customer Secret Keys** → Generate → noter la paire (Access Key + Secret) — le secret n'est plus affiché ensuite.
4. Identity → Policies (root compartment) → **Create policy** :

```
Name: sect-backup-object-storage
Statement: Allow group sect-backup-group to manage objects in compartment id <OCID_ROOT_COMPARTMENT> where target.bucket.name = 'sect-backups'
```
   (+ créer le group `sect-backup-group` et y ajouter l'utilisateur — les policies OCI ciblent des groups, pas des users).

### 3.3 Clé age — génération + escrow DOUBLÉ (D2, ~5 min)
Sur la VM (ou tout machine de confiance) :

```bash
age-keygen -o /tmp/sect-backup-key.txt    # affiche la clé publique age1...
```

- La ligne `# public key: age1...` va dans `backup.env` (§3.4) — la VM ne connaîtra QU'ELLE.
- Le bloc `AGE-SECRET-KEY-1...` = la clé privée :
  1. **Escrow 1** : coffre (password manager) — fichier + passphrase du coffre ;
  2. **Escrow 2** : impression papier OU copie sur clé USB rangée hors site.
  3. **Puis détruire toutes les autres copies** (le /tmp ci-dessus inclus) : `shred -u /tmp/sect-backup-key.txt`
- **Si la clé privée est perdue des DEUX escrows, les backups sont définitivement illisibles.** C'est voulu (confidentialité) — et le test §6 le prouve à chaque fois.

### 3.4 Renseigner `/opt/sect/backup.env` (SSH sur la VM)
```bash
sudo nano /opt/sect/backup.env
```
À renseigner : `NEON_DIRECT_URL` (copier tel quel depuis `/opt/sect/.env` — celui des migrations, SANS `-pooler`), `RCLONE_CONFIG_OCI_ENDPOINT` (`<namespace>.compat.objectstorage.eu-marseille-1.oraclecloud.com`), `RCLONE_CONFIG_OCI_ACCESS_KEY_ID` + `SECRET_ACCESS_KEY` (§3.2-3), `AGE_RECIPIENT` (§3.3), `DISCORD_WEBHOOK_URL` (même webhook que le monitoring backend).
Format : **valeurs sans quotes ni espaces** (lues littéralement — un DSN contient `&`). `chmod 600` déjà posé par l'installateur ; ne JAMAIS committer ce fichier.

---

## 4. Activer les timers

```bash
sudo systemctl start sect-backup.timer sect-backup-watchdog.timer   # OU re-run du workflow install (auto si §3 fait)
systemctl list-timers 'sect-backup*'                                 # vérifier 03:32 / 12:32 UTC
```

## 5. Premier backup + première preuve de restauration (le jour même — ~15 min)

```bash
# 1. Premier backup (annonce le succès sur Discord — --announce)
sudo /opt/sect/backup/sect_backup.sh --announce

# 2. Première preuve de restore (clé escrow requise — c'est LA preuve que l'escrow fonctionne)
sudo /opt/sect/backup/sect_restore_test.sh --identity-file /chemin/vers/sect-backup-key.txt
#   → PASS attendu : checksums OK, déchiffrement OK, counts conformes au manifest
#   → pose le marker restore-ok-<mois> (le rappel mensuel cesse pour ce mois)
```

En cas d'échec : `journalctl -u sect-backup.service -e` (ou la sortie du script restore). Les causes classiques : CSK/policy (§3.2), namespace erroné (§3.2-2), DSN pooler au lieu de direct.

## 6. Test de restauration mensuel (~15 min, rappel auto)

Le watchdog rappelle sur Discord les 1-3 du mois tant que `restore-ok-<mois>` manque. Procédure = §5-2 (avec ou sans `--date`). **Un backup non testé n'existe pas** — c'est la raison d'être du marker.

## 7. Break-glass — « Neon down / corrompu » (RTO ~15-30 min)

> Anti-décision n°4 : JAMAIS d'automatisation — chaque promotion est humaine, approuvée, avec ce runbook.

1. Confirmer l'incident (sonde P1 `/api/health/db` rouge, console Neon).
2. Restaurer le dernier nightly dans le cluster dédié (**--keep** garde la base) :
   ```bash
   sudo /opt/sect/backup/sect_restore_test.sh --identity-file <clé escrow> --keep
   # → base sect_restore_test prête sur 127.0.0.1:5433 (vérifiée contre le manifest)
   ```
3. Basculer l'API dessus (cluster DÉDIÉ, pas mikcloud) :
   ```bash
   # /opt/sect/.env : NEON_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/sect_restore_test
   # (le pooler est sans objet en local ; prévoir un mot de passe pg_hba — §8)
   cd /opt/sect && docker compose up -d
   ```
4. Annoncer (Discord), surveiller, et préparer le RETOUR vers Neon (restore inverse ou fenêtre de re-synchronisation) — miroir des procédures §3.6/§3.7 du runbook hybride.
5. Post-incident : réécrire `NEON_DATABASE_URL` vers Neon au retour, dropper la base de secours.

## 8. Évolutions prévues (1 ligne chacune, déjà cadrées)

- **Horaire (RPO 1 h)** : `OnCalendar=*-*-* *:32:00` dans `sect-backup.timer` — MAIS rester sur les frontières :15 pour chevaucher la grille M1 si un `WORKER_DAY_MIN_INTERVAL` est actif (arithmétique §13.4) ; volume ×24 ≈ 0,3 Go/j.
- **Mot de passe local 5433** : si le break-glass doit durer, `ALTER USER postgres PASSWORD '…'` + `pg_hba` scram — la VM reste 127.0.0.1 uniquement (anti-décision n°3).
- **Rétention longue** : si croissance > prévu, tiering Archive (10 To gratuits, latence de lecture).

## 9. Références

- ADR-0013 §15 (décisions, preuves, calage CU) · §13.4 (grille M1) · §14.4-14.7 (murs Free, déclencheurs)
- Scripts : `ops/backup/*.sh` · Units : `ops/backup/systemd/` · Workflows : `backup-install.yml`, `vm-audit.yml`
- Perte de la clé age → §3.3 : les deux escrows sont la SEULE porte (aucune récupération possible — c'est le design)
