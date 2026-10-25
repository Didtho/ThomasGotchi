# ThomasGotchi

Petit animal façon Tamagotchi qui vit sur le bureau (Windows et Mac). Application Electron sans framework,
avec un site de présentation en PHP. L'utilisateur parle français : répondre en français.

## Structure

- `main.js` : processus principal. Une fenêtre transparente par animal (jusqu'à 5), menu de l'icône,
  crottes et cadeaux (petites fenêtres), pelote de laine, gamelle, amitié entre animaux, météo (Open-Meteo),
  voix (synthèse du système), mises à jour (electron-updater), langue de l'interface (`tr()`).
- `preload*.js` : ponts sécurisés (`desk`, `poop`, `yarnApi`, `furn`) entre fenêtres et processus principal.
- `src/` (page d'un animal, scripts classiques sans modules, chargés dans cet ordre par `index.html`) :
  - `i18n.js` puis `locales/*.js` : traductions (`t()`, `translatePage()`) ;
  - `pet.js` : logique pure (jauges, besoins, actions, tours, accessoires, espèces, pelages) ;
  - `draw.js` + `species.js` : tout le dessin en canvas, détails propres à chaque espèce dans `species.js` ;
  - `sound.js` (bruitages synthétisés), `seasons.js` (fêtes), `app.js` (boucle, souris, fenêtres),
    `games.js` (mini-jeux, carnet).
- `site/` : site PHP (`index.php`, `lang/*.php`, `en|es|it/index.php`, `img/` et `data/app.json` générés).
- `scripts/` : icône, images du site, vérification des traductions.

## Commandes

```
npm start                          # lancer l'application en développement
npm run icon                       # régénérer assets/icon.png (Electron)
npm run site-assets                # régénérer site/img/*.png et site/data/app.json depuis le moteur de dessin
node scripts/i18n-check.js         # phrases de l'application sans traduction (doit donner N / N partout)
php scripts/site-i18n-check.php en # idem pour le site (en, es, it) ; PHP de WAMP : C:/wamp64/bin/php/php8.3.14/php.exe
```

Depuis le terminal de Claude, `ELECTRON_RUN_AS_NODE=1` est hérité de VS Code : le retirer avant de lancer
Electron, sinon il démarre comme Node (`Remove-Item Env:ELECTRON_RUN_AS_NODE`).

## Règles du projet

- **Commits** : auteur Didtho seul, **jamais** de ligne `Co-Authored-By`. Titre court : `Version X.Y.Z`
  (détails dans le corps), ou un titre descriptif pour ce qui n'est pas une version (ex. « Site internet »).
- **Publier une version** : changer `version` dans `package.json`, committer, puis
  `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z`. GitHub Actions fabrique le `.exe` et le
  `.dmg` et les publie (Releases) ; les PC se mettent à jour tout seuls. Suivre la fabrication via l'API publique
  (`api.github.com/repos/Didtho/ThomasGotchi/actions/runs`).
- **Site toujours à jour avec l'application** : après chaque ajout, `npm run site-assets`, adapter les textes de
  `site/index.php` (et `site/lang/*.php`), puis redéployer sur WAMP :
  `robocopy site C:\wamp64\www\thomasgotchi /MIR /XD cache` et vérifier http://localhost/thomasgotchi/.
  Supprimer `C:\wamp64\www\thomasgotchi\cache\release.json` pour afficher tout de suite une nouvelle version.
- **Crédit** : le site est signé « une création DidTech » (lien https://www.didtech.fr/), pas « par Didtho ».
- **Mise en ligne chez IONOS** (PHP + MariaDB, FTP) seulement quand l'utilisateur le décidera ; ne jamais
  enregistrer d'identifiants FTP dans le dépôt.
- **Traductions** : le français est la langue de référence et sert de clé. Tout nouveau texte affiché passe par
  `t()` (renderer), `tr()` (main.js) ou `tt()` (site), avec `{nom}` pour les parties variables ; les bulles
  `say()` sont traduites automatiquement. Pour un texte genré, écrire les deux variantes françaises avec
  `Pet.g(state, 'masculin', 'féminin')`. Ajouter les traductions en/es/it puis lancer les deux vérifications.
- **Style du code** : commentaires et noms en français, densité de commentaires actuelle, pas de dépendance
  inutile. Les éléments de jeu (fêtes, météo, crottes) doivent rester discrets (l'utilisateur a fait retirer la
  pluie qui tombe et la litière).

## Vérifier un changement visuel

Les fenêtres sont transparentes : pour voir le rendu, utiliser un script Electron jetable (dans le dossier
scratchpad) qui charge `src/index.html` avec un `preload` factice (objet `desk` simulé, y compris
`lang: { setting, lang }`), exécute une scène via `executeJavaScript` (créer `state` avec `Pet.create`, appeler
`play()`, `openSettings()`…) puis `capturePage()`. Une fenêtre cachée fige les animations CSS : utiliser
`show: true` si besoin. Pour tester en vrai sans toucher aux animaux de l'utilisateur, lancer
`electron . --user-data-dir=<dossier de test>` avec des fichiers `pet.json` préparés.

**Ne jamais toucher aux fenêtres ni aux programmes de l'utilisateur pendant un test** (ni les déplacer, ni les
fermer, ni les capturer à l'écran) : le Bloc-notes de Windows 11 regroupe tous ses onglets dans un seul processus,
et un test a déjà fermé de force les notes de l'utilisateur. Pour tester la marche sur les fenêtres, créer sa
propre fenêtre (par exemple une `BrowserWindow` d'un script Electron jetable), et ne capturer que la zone de test.

Éviter de faire passer du code JavaScript contenant des apostrophes échappées par un heredoc du terminal
(les `\'` sont perdus) : écrire plutôt le script dans un fichier avec l'outil d'écriture.
