# Correctif « Last played » — à proposer à Nexus upstream (optionnel)

> **Statut : non publié.** Le correctif est intégré à l'édition double compte
> (dans `assets/xodus-dual-account.patch`, `patchId`
> `linux-run-v38-dual-account-2` ou plus). Ce dossier sert seulement si tu
> décides un jour de le proposer à
> [domsvoboda/xodus-nexus](https://github.com/domsvoboda/xodus-nexus).
> Rien n'a été envoyé.

## Le bug (présent dans Nexus d'origine)

Sur la fiche d'un jeu, **Last played** est toujours indisponible, et Nexus
affiche *« Some Xbox activity could not be retrieved »*. Pour un jeu sans temps
de jeu enregistré, aucune activité ne s'affiche.

Les deux causes se trouvent dans `assets/xodus-game-activity.patch` (fichier
`crates/xodus-cli/src/commands/game_activity.rs`) :

1. **La requête titlehub ne peut pas renvoyer la date.**
   - Sans en-tête `Accept-Language`, titlehub répond **HTTP 400**.
   - Même avec cet en-tête, la décoration `detail` renvoie `titleHistory: null`.
     Seule la décoration `titlehistory` contient `lastTimePlayed`.
2. **Une statistique sans valeur est traitée comme une erreur.** Quand un jeu
   n'a pas encore de temps enregistré, userstats renvoie `MinutesPlayed` sans
   `value`. Le parseur échoue sur ce cas au lieu de le traiter comme une
   absence de donnée.

Ce bug a été vérifié le 22.10.2026 sur un vrai compte, avec Star Trucker,
Minecraft Dungeons et BALL x PIT. Une fois corrigé, le temps de jeu et la date
de dernière partie s'affichent, et l'activité n'est plus marquée partielle.

## Fichiers prêts

- [`xodus-activity-history.patch`](xodus-activity-history.patch)
  (sha256 `919eb1d002f594a5c3d727968de48a85ada0081278a91c3337f0e9c6ba717d04`).
  C'est le correctif seul, avec son test unitaire, **sans** le double compte ni
  la ligne de diagnostic. Il s'applique après tous les patches du lock
  upstream (vérifié contre le commit `53ea781` + les 38 patches de
  `linux-run-v38`), et les 76 tests de `xodus-cli` passent.

## Comment le proposer

### Sur GitHub : un seul fork par compte

GitHub ne permet qu'**un fork d'un même dépôt par compte**. Si tu veux une PR
qui ne se mélange pas avec l'édition double compte, tu as deux options :

- **Échanger les rôles.** Renommer le fork `xodus-nexus-dual-account` en
  `xodus-nexus` pour les contributions, puis recréer
  `xodus-nexus-dual-account` comme dépôt **indépendant** (pas un fork, il peut
  être privé). Le code du launcher n'a pas à changer, puisque le nom est
  conservé.
- **Utiliser une organisation GitHub gratuite.** Il faut la créer à la main
  sur github.com, puis forker dedans :
  `gh repo fork domsvoboda/xodus-nexus --org <org>`.

Le plus simple reste d'ouvrir **un ticket seul**, avec le texte ci-dessous.
Aucun fork n'est nécessaire.

### Préparer la PR (en local)

`CONTRIBUTING.md` de Nexus demande une branche `fix/…` qui cible `develop`.

```bash
git fetch upstream
git switch -c fix/activity-last-played upstream/develop
cp docs/upstream/xodus-activity-history.patch assets/   # depuis la branche dual-account
```

Dans `assets/backend-source.lock.json` :

1. Ajouter `{ "file": "xodus-activity-history.patch", "sha256": "<sha256 du fichier>" }`
   **en dernier** dans `patches`.
2. Incrémenter `patchId` (par exemple `linux-run-v39`). Ne pas toucher à
   `compatibility`.

Vérifier que le lock de `develop` est toujours au commit `53ea781` avec les
mêmes patches. Si ce n'est plus le cas, régénérer le patch : depuis
`xodus-backend`, lancer `scripts/nexus-base.sh` sur le nouveau lock, réappliquer
le changement à la main, puis `git diff -- crates`.

Ensuite, lancer les vérifications demandées par Nexus :

```bash
npm ci && npm run build && npm run test:ci-tools
node scripts/build-backend.mjs --work /tmp/nexus-backend-build --output /tmp/nexus-backend-release
```

`build-backend.mjs` exige `rustc 1.99.0` : lance-le depuis un dossier où
`rustup override set 1.99.0` est actif, ou avec `RUSTUP_TOOLCHAIN=1.99.0`.

## Texte du ticket / de la PR (anglais)

**Title:** Game activity: "Last played" is always unavailable and "Some Xbox activity could not be retrieved" is shown

### Summary

On a game's details page, **Last played** is always unavailable, and the page
shows *"Some Xbox activity could not be retrieved"*. This happens even for
titles the account played recently on Xbox or Windows. Time played does show
up for those titles. For titles with no recorded play time yet, both reads
fail and no activity is shown.

### Environment

- Xodus Nexus 0.3.10, managed backend 0.2.10 (`linux-run-v38`, commit `53ea781`)
- Fedora/Nobara, signed-in Microsoft account
- Reproduced with Star Trucker, Minecraft Dungeons and BALL x PIT

### Steps to reproduce

1. Sign in, then open the details page of an installed game the account has
   played before. Alternatively, run
   `xodus-cli game-activity <decimal TitleId> --json`.
2. **Expected:** `lastPlayed` is set and `partial` is `false`.
3. **Actual:** `lastPlayed` is `null` and `partial` is `true`. For a title with
   no recorded play time, the command fails with `activity-unavailable`.

### Root cause

Both bugs are in `assets/xodus-game-activity.patch`, file
`crates/xodus-cli/src/commands/game_activity.rs`.

1. **The titlehub request never returns history.** It requests
   `…/titles/titleid({title_id})/decoration/detail` without `Accept-Language`.
   Titlehub answers HTTP 400 without the header. Even with it, the `detail`
   decoration returns `titleHistory: null`. Only the `titlehistory` decoration
   fills `{ lastTimePlayed, visible, canHide }`, and it is also a much smaller
   response.
2. **A stat without a value is treated as an error.** userstats returns the
   `MinutesPlayed` stat without a `value` when the title has no recorded play
   time. `stat["value"].as_str().ok_or("stats-value")?` turns that into an
   error, and when both reads fail the lookup returns `activity-unavailable`.

### Fix

The fix is a new `assets/xodus-activity-history.patch`, applied after the
existing patches:

- the history read uses the `titlehistory` decoration and sends
  `Accept-Language: en-US`;
- a missing or `null` stat value is "no data" instead of an error;
- a unit test covers both the missing and the `null` value.

`last_played()` is unchanged: it already reads
`titles[0].titleHistory.lastTimePlayed` and `visible`.

### Test results

| Title | Time played | Last played | `partial` |
|---|---|---|---|
| Star Trucker | ✓ | ✓ | `false` |
| Minecraft Dungeons | ✓ | ✓ | `false` |
| BALL x PIT (no recorded time yet) | — | — | `false`, no error |

The `-p xodus-cli` suite passes (76 tests).
