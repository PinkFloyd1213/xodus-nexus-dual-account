# Automatisation GitHub (édition double compte)

Deux dépôts :

- [PinkFloyd1213/xodus-nexus-dual-account](https://github.com/PinkFloyd1213/xodus-nexus-dual-account)
  (launcher)
- [PinkFloyd1213/xodus-dual-account](https://github.com/PinkFloyd1213/xodus-dual-account)
  (backend)

Dans les deux, la branche de travail et la branche par défaut est
`dual-account`. `main` reste une copie exacte d'upstream.

## Ce qui tourne tout seul

| Workflow | Dépôt | Quand | Effet |
|---|---|---|---|
| `dual-account-release.yml` | launcher | push sur `dual-account` (hors docs) | tests, AppImage, release `v<version>-dual.<n>` ; la mise à jour intégrée du launcher la propose |
| `dual-account-checks.yml` | launcher | PR vers `dual-account` | tests du launcher ; recette backend complète (clone, 39 patches, build, tests) |
| `upstream-sync.yml` | launcher | chaque jour à 05:17 UTC, ou à la main | aligne `main` sur domsvoboda, puis ouvre une PR `upstream-sync` → `dual-account` s'il y a du nouveau |
| `claude-pr.yml` | launcher | chaque PR vers `dual-account` (et les PR de synchro) | Claude relit, merge `dual-account` si besoin, rebase le patch backend si le lock a changé, corrige les tests, pousse sur la branche de la PR, résume en français. **Ne merge jamais.** |
| `claude-mention.yml` | launcher | commentaire `@claude …` de ta part | Claude fait ce que tu demandes sur la PR ou l'issue |
| `upstream-mirror.yml` | backend | chaque jour à 05:07 UTC | aligne `main` sur xodus-gaming/xodus, pour que le commit fixé par le lock reste récupérable |
| `dual-account.yml` | backend | push ou PR sur `dual-account` | build et tests du backend double compte |

Les workflows d'upstream qui ne servent qu'à leurs releases (`backend.yml`,
`runtime.yml`, `release.yml`, `wiki.yml`, `rust.yml`) sont **désactivés** dans
les forks, via les réglages Actions et sans modifier les fichiers.

Le backend vient de **ton** dépôt : `assets/backend-source.lock.json` →
`repository` = `xodus-dual-account`. Quand le lock change (nouvelle AppImage),
Nexus marque le backend local comme périmé et affiche
**« Update dual-account backend »**.

## À faire une fois, de ton côté

L'agent Claude a besoin de deux choses que je ne peux pas faire à ta place :

1. **Installer l'app GitHub Claude** sur `xodus-nexus-dual-account` :
   https://github.com/apps/claude. Tu peux aussi lancer `/install-github-app`
   dans un terminal `claude`. Sans l'app, Claude ne peut pas pousser ses
   correctifs de façon à relancer la CI.
2. **Créer le jeton** sur ta machine :

   ```bash
   claude setup-token
   ```

   Puis l'ajouter comme secret du dépôt launcher, sous le nom
   `CLAUDE_CODE_OAUTH_TOKEN` :

   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN -R PinkFloyd1213/xodus-nexus-dual-account
   ```

   Colle le jeton quand la commande le demande. Ne le mets jamais dans un
   fichier du dépôt. L'utilisation compte sur ton abonnement Claude.

Optionnel : **`SYNC_TOKEN`**, un jeton GitHub *fine-grained* avec Contents,
Pull requests et Workflows en écriture, limité aux deux dépôts. Ajoute-le
comme secret dans **les deux** dépôts. Sans lui, la synchro échoue avec un
message clair les jours où upstream modifie ses propres workflows. Il suffit
alors de cliquer « Sync fork » sur GitHub, ou d'ajouter ce jeton. Avec lui,
les PR de synchro déclenchent aussi la CI d'elles-mêmes.

## Au quotidien

- **Tu modifies le code :** push sur `dual-account`. Une release arrive environ
  10 minutes plus tard, et le launcher la propose dans Settings → Check for
  updates.
- **Upstream bouge :** une PR « Sync upstream Nexus » apparaît, les checks et
  Claude passent dessus, puis le résumé de Claude est posté sur la PR. Tu
  merges quand c'est vert et que le résumé te convient. Le merge déclenche une
  nouvelle release.
- **Le backend change** (patch ou lock) : après la mise à jour de l'AppImage,
  clique « Update dual-account backend » dans Settings.

## Garde-fous

- Claude ne peut ni merger, ni forcer un push, ni utiliser `gh`. Ses commandes
  sont limitées à une liste fixe dans le workflow.
- Les PR venant d'autres forks ne reçoivent aucun secret, et Claude ne s'y
  lance pas. `@claude` ne répond qu'à toi (`OWNER`).
- Protège `dual-account` si tu veux imposer les PR : Settings → Branches →
  « Require a pull request ».
