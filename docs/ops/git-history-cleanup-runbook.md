# Runbook — Nettoyage de l'historique git (`git filter-repo`)

> **Statut : PLANIFIÉ, NON EXÉCUTÉ** (décision 2026-09-29).
> Ce runbook rend l'opération exécutable en ~30 min par un mainteneur,
> au moment choisi (fenêtre de maintenance, aucun collaborateur actif).

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

Option renforcée (si l'on veut aussi écraser la chaîne
`***REMOVED***` des messages/contenus historiques, malgré la rotation déjà
faite) :

```bash
git filter-repo --replace-text <(echo '***REMOVED***==***REMOVED***')
```

…à combiner avec les `--path … --invert-paths` ci-dessus en une SEULE
invocation (chaque run de filter-repo repart du résultat du précédent
sur un miroir, mais une seule passe = un seul rewrite = moins de risque).

## 5. Exécution (jour J)

```bash
cd SECT-mirror
# UNE seule invocation : paths + replace-text
git filter-repo --path worklog.md --invert-paths \
                --path skills/ --invert-paths \
                --path-glob 'frontend/.next/*' --invert-paths \
                --path backend/bin/ --invert-paths \
                --path windows-store/ --invert-paths \
                --path verify-sect-landing.png --path verify-login.png \
                --path sect-landing-page.png --invert-paths \
                --force                                   # miroir existant

git for-each-ref                                # vérifier tags réécrits
git log --oneline -5                            # SHAs neufs, messages intacts
git count-objects -vH                           # pack attendu ~12–15 Mio

git push --mirror --force origin
```

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
