# Runbook — Nettoyage de l'historique git (`git filter-repo`)

> **Statut : ✅ EXÉCUTÉ le 2026-09-29** — post-mortem au §8.
> Ce runbook reste comme référence : il rend l'opération reproductible
> en ~30 min par un mainteneur (fenêtre de maintenance, aucun
> collaborateur actif).

## 1. Contexte et chiffres mesurés (2026-09-29)

Le pack git de `udevrard7/SECT` pèse **113,9 Mio** pour un contenu utile
de ~15 Mio. Mesure par `git cat-file --batch-check` sur tous les blobs
de toutes les révisions :

| Pollueur (historique) | Volume non compressé | Détail |
|---|---|---|
| `worklog.md` (racine, 446 versions) | **279 Mo** | Journal de travail historique, déplacé vers `docs/` mais ~1,5 Mo/version |
| `skills/` (hors apps) | 67 Mo | Templates HTML monofichiers géants + binaire `tectonic` (10,7 Mo) |
| `frontend/.next/` (committé par erreur) | 40 Mo | Build artifacts + sourcemaps 12,7 Mo |
| `backend/bin/` (committé par erreur) | 42 Mo | Binaires Go compilés (2× ~22 Mo) |
| `windows-store/SECT.zip` | 13 Mo | Artefact de packaging |
| Captures `verify-*.png`, `sect-landing-page.png` | ~5 Mo | E2E screenshots historiques |

Après compression pack, la suppression de ces chemins ramènerait le
clone de **~114 Mio → ~12–15 Mio** (à confirmer avec la passe à sec).

⚠️ **Le mot de passe `***REMOVED***` reste dans l'historique des commits
`<e2e-auth-setup-historique>`.** Il a été ROTÉ en production le
2026-09-29 (rotation 2e passe — cf. `docs/worklog.md` Task 11) : le
credential est mort, le risque résiduel est la propreté, pas la
sécurité. Ce nettoyage n'est donc **pas urgent**, c'est de l'hygiène.

## 2. Pourquoi ne PAS le faire à chaud

`git filter-repo` **réécrit tous les SHAs** :

- Tous les déploiements Vercel/Render liés à un SHA historique
  deviennent introuvables (journaux, rollback, debug) — les déploiements
  récents devront être re-déclenchés par un commit de tête.
- Les PRs déjà fusionnées (#1–#22) et les runs GitHub Actions
  historiques pointent vers des SHAs orphelins : les logs échoueront
  « commit not found » (les runs récents re-attachent au SHA réécrit
  équivalent si le contenu est identique — comportement non garanti).
- Les tags (`v0.1.0` posé le 2026-09-29) seront réécrits et devront
  être re-poussés (voir §6).
- Tout collaborateur doit re-cloner (un `pull` classique échoue).
- GitHub garde les refs originales en API pendant ~90 jours (support
  request pour GC immédiat) : le pack dist ne rétrécit pas
  instantanément à l'origine, mais le clone neuf, si.

## 3. Pré-requis (checklist go/no-go)

- [ ] Fenêtre sans push prévu (éviter Dependabot et humains).
- [ ] Aucun PR ouvert (vérifié : 0 le 2026-09-29 ; re-vérifier).
- [ ] Sauvegarde : `git clone --mirror` poussée vers un repo privé
      backup (ex. `udevrard7/SECT-archive`) — le filet de sécurité.
- [ ] `pip install git-filter-repo` (v2.47+ testé) ou package OS.
- [ ] Branche `main` protégée : autoriser temporairement le force-push
      (Settings → Branches) — le révoquer juste après.
- [ ] Prévenir Render/Vercel : les prochains déploiements partiront du
      SHA réécrit de tête ; vérifier `POST /v1/services/{id}/deploys`
      Render et déploiement manuel Vercel après l'opération.

## 4. Passe à sec (aucune écriture)

```bash
git clone --mirror https://github.com/udevrard7/SECT.git SECT-mirror
cd SECT-mirror
git filter-repo --analyze                    # rapport .git/filter-repo/analysis/
git filter-repo --path worklog.md --invert-paths \
                --path skills/ --invert-paths \
                --path-glob 'frontend/.next/*' --invert-paths \
                --path backend/bin/ --invert-paths \
                --path windows-store/ --invert-paths \
                --path verify-sect-landing.png --path verify-login.png \
                --path sect-landing-page.png --invert-paths \
                --dry-run
du -sh .git/objects/pack*                    # estimation du gain
```

Note : `--path worklog.md` supprime TOUTES les versions historiques du
journal racine ; le `docs/worklog.md` actuel n'est PAS touché (chemin
différent). Vérifier dans le rapport d'analyse que rien d'utile n'est
matché (les `.ttf` de polices, `bun.lock`, `package-lock.json` restent).

Option renforcée (appliquée lors de l'exécution) : écraser la chaîne
historique du mot de passe dans les blobs ET les messages de commits.

⚠️ **Piège du séparateur** : le format `--replace-text` exige `==>`
(double égal + chevron). La version initiale de ce runbook écrivait
`Admin2025!==***REMOVED***` (sans `>`) — ligne invalide, remplacement
silencieusement raté. Syntaxe correcte :

```bash
printf 'Admin2025!==>***REMOVED***\n' > replacements.txt
git filter-repo --replace-text replacements.txt \
                --replace-message replacements.txt   # messages de commits aussi
```

Le mot de passe apparaissait dans ~3 messages de commits (docs) en plus
des blobs : sans `--replace-message`, il serait resté dans l'historique.

…à combiner avec les `--path … --invert-paths` ci-dessus en une SEULE
invocation (chaque run de filter-repo repart du résultat du précédent
sur un miroir, mais une seule passe = un seul rewrite = moins de risque).

## 5. Exécution (jour J)

```bash
cd SECT-mirror
# UNE seule invocation : paths + replace-text + replace-message
git filter-repo --path worklog.md --invert-paths \
                --path worklog-phase5.md --invert-paths \
                --path skills/ --invert-paths \
                --path-glob 'frontend/.next/*' --invert-paths \
                --path backend/bin/ --invert-paths \
                --path windows-store/ --invert-paths \
                --path verify-sect-landing.png --path verify-login.png \
                --path sect-landing-page.png --path sect-login-page.png \
                --path audio-delete-ui.png \
                --path etu1-dashboard.png --path etu2-dashboard.png \
                --path etu2-dashboard-fixed.png --invert-paths \
                --replace-text replacements.txt \
                --replace-message replacements.txt \
                --force                                   # miroir existant

git for-each-ref                                # vérifier tags réécrits
git log --oneline -5                            # SHAs neufs, messages intacts
git count-objects -vH                           # pack mesuré : 25,08 Mio (§8)

git push --mirror --force origin
```

(`worklog-phase5.md` et les captures racine supplémentaires ont été
ajoutées à chaud après la passe à sec — cf. §8 : la passe à sec sert
précisément à ça.)

Post-opération immédiate :

1. Retirer l'autorisation de force-push sur `main` (GitHub Settings).
2. Vérifier `git ls-remote origin | wc -l` (branches attendues : main
   + tags réécrits ; les refs PRs `refs/pull/*` de GitHub ne sont pas
   poussables — les PRs fermés gardent leurs SHAs orphelins, sans
   impact fonctionnel).
3. Re-déclencher les déploiements :
   - Render : `POST /v1/services/srv-d9ed5bdaeets73auosj0/deploys`
     (attention : autoDeploy ne surveille que `backend/` — un commit de
     tête quelconque suffit via l'API).
   - Vercel : Deployments → Redeploy (attention au piège
     `commandForIgnoringBuildStep` : le dernier commit doit toucher
     `frontend/`, sinon le déploiement est CANCELED).
4. Vérifier prod : `https://sect.ftci.fr` (login, documents, audio R2),
   `https://sect-zead.onrender.com/health`.
5. Demander à GitHub support le GC des anciens objets (ou attendre ~90 j).
6. Annoncer aux éventuels collaborateurs : **re-clone obligatoire**.

## 6. Tags

`v0.1.0` (posé 2026-09-29) sera réécrit vers un SHA équivalent pointant
le même contenu de tête. `git filter-repo` re-pointe automatiquement les
tags sur les commits réécrits — pas d'action manuelle tant qu'on pousse
le miroir complet (`--mirror`). Vérifier ensuite :
`git tag -l --format='%(refname:short) %(objectname:short)'`.

Les RELEASES GitHub attachées à un tag ne bougent pas (elles référencent
le tag par nom) ; les artefacts uploadés dans les runs d'origine
restent accessibles depuis la release même après rewrite.

## 7. Rollback

Le miroir de sauvegarde (`SECT-archive`) permet de re-pousser
l'historique d'origine à tout moment dans les ~90 jours précédant le GC
GitHub : `git push --mirror --force` depuis l'archive. Les déploiements
Render/Vercel étant immuables côté plateforme, aucun impact rétroactif
sur la prod — seul le repo git revient en arrière.

## 8. Post-mortem — exécution 2026-09-29

**Checklist go/no-go respectée** : 0 PR ouvert (re-vérifié à l'instant du
push), sauvegarde miroir poussée vers le repo privé
`udevrard7/SECT-archive` (main + tag vérifiés), `git-filter-repo` 2.47.0,
`main` non protégée (force-push possible — aucune protection à
retirer/activer ; *recommandation résiduelle : activer une protection de
branche*).

**Passe à sec décisive** — elle a révélé deux écarts vs le plan :
1. `worklog-phase5.md` (journal racine oublié de l'inventaire initial,
   détecté en comparant les lignes `M` des flux fast-export) ;
2. 5 captures racine supplémentaires (`sect-login-page.png`,
   `audio-delete-ui.png`, `etu1-dashboard.png`, `etu2-dashboard.png`,
   `etu2-dashboard-fixed.png`), même classe que les 3 du plan.
Les deux familles ont été ajoutées à chaud. La passe à sec a aussi permis
de valider le format des modes fast-export (`100644`/`100755`, pas
`644`/`755`) — les greps naïfs sous-comptent silencieusement sinon.

**Résultats mesurés** :

| Indicateur | Avant | Après |
|---|---|---|
| Pack (clone neuf) | 115,04 Mio | **25,08 Mio** (−78 %) |
| Commits (main) | 1561 | 1233 (vides purgés) |
| Chemins pollueurs en historique | 5 familles | 0 |
| `Admin2025!` blobs + messages | présent | **0** (pickaxe + grep) |
| Diff arbre HEAD | — | 1 fichier (ce runbook : 3 mentions remplacées) |
| `docs/worklog.md`, polices, `bun.lock` | — | intacts octet par octet |

**Déploiements** : le push forcé a **auto-déclenché** Render
(`trigger: new_commit`, LIVE en ~30 s — contenu identique, cache Docker)
ET Vercel (déploiement BUILDING sur le SHA réécrit, conforme au piège
`commandForIgnoringBuildStep` car le commit de tête touche `frontend/`).
Le déploiement Render API déclenché en parallèle était donc redondant
(mais inoffensif).

**Restes assumés** :
- GitHub conserve les anciens objets ~90 jours (refs `pull/*` cachées,
  API) — GC naturel ; le clone neuf est déjà propre ;
- Les PRs fusionnées #1–#22 référencent des SHAs orphelins (logs CI
  historiques « commit not found ») — sans impact fonctionnel ;
- `upload/pdf-images/` (~0 Mio packé) laissé en place : négligeable.
