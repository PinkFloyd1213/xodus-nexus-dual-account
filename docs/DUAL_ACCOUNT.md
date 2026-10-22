# Xodus Nexus — édition double compte

Fork de [domsvoboda/xodus-nexus](https://github.com/domsvoboda/xodus-nexus) qui
reproduit le fonctionnement de Windows avec deux comptes Microsoft :

| Sous Windows | Ici | Sert à |
|---|---|---|
| Compte du Microsoft Store (celui qui a le Game Pass) | **Compte de licence (Store)** | catalogue, bibliothèque, Game Pass, téléchargements, déchiffrement, licences, mises à jour |
| Compte de l'app Xbox (compte perso) | **Compte Xbox (en jeu)** | tout ce que le jeu voit : identité XUser, gamertag, amis, succès, cloud saves, présence, PlayFab ; dans Nexus : gamertag, avatar, succès, temps de jeu |

Les licences Xbox PC sont liées à l'appareil. L'appareil (device token et device
license) est donc **partagé** par les deux comptes, comme sur un PC Windows.

Si aucun compte Xbox n'est connecté, tout retombe sur le compte de licence. Le
comportement est alors exactement celui de Nexus d'origine.

Le backend correspondant est le fork
[xodus-dual-account](https://github.com/PinkFloyd1213/xodus-dual-account)
(branche `dual-account`). Sa documentation détaillée (cartographie, design,
tests) se trouve dans son fichier `docs/dual-account.md`.

## Utilisation

1. Lancer l'AppImage `Xodus-Nexus-Dual-Account-<version>-x86_64.AppImage`.
   Elle partage le même profil (`~/.config/xodus-nexus`) que Nexus d'origine :
   jeux, réglages et runtime sont conservés. Les deux ne peuvent pas tourner en
   même temps.
2. **Settings → Xodus backend → « Use dual-account backend »**. Nexus clone le
   commit Xodus fixé par le lock, applique les 39 patches et compile
   localement. Il faut `git`, `cargo`, `rustc` et `protoc`. Si rustup a la
   version de Rust du lock (`1.99.0`), elle est utilisée automatiquement.
   Compter environ une minute sur une machine récente.
   - Le backend actif juste avant est mémorisé : **« Restore previous backend »**
     y revient, et un nouveau clic revient au backend double compte.
   - L'installation de backends précompilés est désactivée dans cette édition,
     parce qu'ils n'ont pas le double compte.
3. **Compte de licence (Store)** : la connexion habituelle (« Sign in with
   Xodus ») avec le compte qui a le Game Pass. Si tu étais déjà connecté,
   rien à refaire.
4. **Compte Xbox (en jeu)** : « Sign in Xbox account » avec ton compte perso.
   La barre latérale affiche alors ton gamertag et ton avatar, avec le badge
   Game Pass du compte de licence.
5. Lancer un jeu. Si un jeu tournait déjà, le relancer après avoir changé de
   compte Xbox.

« Sign out Xbox account » ne retire que le compte Xbox. Le compte de licence et
l'appareil restent intacts. « Sign out » (compte de licence) a le même
comportement que dans Nexus d'origine et laisse le compte Xbox en place.

## Vérifier quel compte est utilisé

Le journal du jeu (bouton de log de la partie) contient une ligne par type de
requête, réécrite à chaque changement :

```
Xodus account for MsaTokenRequest: play
Xodus account for StoreLicenseTokenRequest: store
Xodus account for StorePackageUpdatesRequest: store
```

`… (play account not set, using the license account)` signifie qu'aucun compte
Xbox n'est connecté. Ces lignes ne contiennent ni identifiant ni token.

## Limites connues

- **Un jeu qui croise le reçu Store avec le joueur.** Les reçus XStore sont émis
  pour le compte de licence, comme sous Windows. Un éditeur qui compare ce reçu
  au joueur côté serveur peut refuser un DLC ou une monnaie virtuelle. Pour
  diagnostiquer : « Sign out Xbox account », relancer le jeu, puis comparer.
- **Sauvegardes locales.** Celles créées avant le passage au compte Xbox sont
  rangées sous l'ancien XUID et ne sont plus vues. Le cloud du compte Xbox
  prend le relais.
- **Mises à jour du launcher.** L'auto-update ne consulte que les releases de
  ce fork, pour qu'une AppImage d'origine ne remplace jamais cette édition.
  Pour la mettre à jour, il faut recompiler (voir plus bas) ou publier une
  release dans le fork.
- **Connexion en terminal.** Le backend est compilé sans webview native,
  comme celui de Nexus. La connexion du compte Xbox passe donc par Nexus.

## Différences avec Nexus d'origine (pour un éventuel merge)

Tout est additif et s'active seulement si le lock contient
`xodus-dual-account.patch` (`DUAL_ACCOUNT_BACKEND`) ou si le backend expose
`login --account` (`capabilities.dualAccount`).

| Fichier | Changement |
|---|---|
| `assets/backend-source.lock.json`, `assets/xodus-dual-account.patch` | patch backend en dernier, `patchId` dédié, `compatibility` inchangé |
| `src/main/backend.ts` | `sourceOnly` (pas de release précompilée), toolchain du lock, `previous.json` + `restorePrevious()`, détection `dualAccount` |
| `src/main/index.ts` | état `auth.play`, `xboxIdentity()`, IPC `login-play`/`logout-play`/`backend-restore-previous` |
| `account-refresh.ts`, `auth-transport.ts`, `account-profile.ts`, `game-achievements.ts`, `game-activity.ts` | arguments `--account play` optionnels |
| `xodus-service.ts` | lignes de rôle du service dans le journal du jeu |
| `src/renderer/App.tsx` | carte « Compte Xbox (en jeu) », boutons du backend double compte |
| `launcher-update.ts` | dépôt des mises à jour = ce fork (`LAUNCHER_REPOSITORY`) |

Pour un merge upstream, il faudrait retirer `launcher-update.ts` et rendre
`sourceOnly` inutile en publiant un backend précompilé qui contient le patch.

## Correctif hors double compte

L'édition corrige aussi un bug de Nexus d'origine : « Last played » était
toujours indisponible, avec le message « Some Xbox activity could not be
retrieved ». Pour le proposer un jour à upstream, voir
[`docs/upstream/ACTIVITY_FIX.md`](upstream/ACTIVITY_FIX.md) : patch autonome,
procédure et texte prêt à publier. Rien n'a été envoyé.

## Maintenance (suivre upstream)

Dans `xodus-backend` (fork Xodus) :

```bash
git -C ../xodus-nexus fetch upstream && git -C ../xodus-nexus merge upstream/main
scripts/nexus-base.sh ../xodus-nexus nexus-base-next
git rebase --onto nexus-base-next nexus-base dual-account
git branch -f nexus-base nexus-base-next && git branch -D nexus-base-next
scripts/dual-account-patch.sh
```

Puis, dans `xodus-nexus` :

1. Copier `xodus-dual-account.patch` dans `assets/`.
2. Le garder **en dernier** dans `patches` avec le nouveau sha256, et garder un
   `patchId` suffixé `-dual-account-N`.
3. Lancer `npx vitest run`, puis `npm run dist`.

Le merge d'upstream peut entrer en conflit sur le lock : reprendre leur version,
puis réappliquer l'étape 2.
