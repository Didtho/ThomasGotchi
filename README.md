# ThomasGotchi

Un petit animal façon Tamagotchi qui vit sur le bureau (Windows et Mac), toujours au-dessus des fenêtres.
Il se promène, passe d'un écran à l'autre, grandit, et il faut s'en occuper pour qu'il ne meure pas.

## S'en occuper

- **Survoler** l'animal : affiche ses jauges (faim, soif, énergie, bonheur, propreté, santé) et les boutons.
- **Glisser un fichier** sur lui : il le mange. Le fichier n'est ni modifié ni supprimé, seuls son nom et sa taille comptent.
  Images = friandise, PDF / documents = vrai repas, vidéos = festin, musique = dessert, programmes (.exe…) = mal au ventre !
- 🥤 boire · 🌙 dormir / réveiller · 🎾 jouer · 🛁 laver · 💊 soigner · ⚙️ réglages
- **Clic** : un câlin. **Glisser** : le déplacer. **Clic droit** : réglages.
- **Crottes et pipi** 💩💦 : il fait ses besoins sur le bureau (et lève la patte contre le bord de l'écran).
  Cliquer dessus pour nettoyer, ou le bain pour tout nettoyer.
- 🎾 **Mini-jeux** : lancer la balle, attraper les friandises, jeu des gobelets.
- 📖 **Carnet** (dans les réglages) : âge, plat préféré, câlins, souvenirs des anciens compagnons.
- 🎁 **Accessoires** à gagner : nœud papillon, lunettes, fleur, couronne, chapeau de sorcière, bonnet de Noël.
- **Plusieurs animaux** (jusqu'à 5) : « Adopter un autre animal » dans le menu de l'icône. Ils se font un câlin quand ils se croisent.
- L'icône près de l'horloge (barre des menus sur Mac) permet de le cacher, de le ramener, d'en adopter un autre ou de quitter.

Ses besoins se lisent sur son visage : langue pendante quand il a soif, bave quand il a faim, thermomètre quand il
est malade, taches et odeurs quand il est sale.

Sans soins, il tient environ 2 à 3 jours. Le temps continue de passer quand l'application est fermée.
Il se promène (et passe d'un écran à l'autre), court, saute, fait des roulades, suit la souris des yeux,
s'endort le soir avec son bonnet de nuit et se réveille le matin. Si on le secoue, la tête lui tourne !

Il grandit : œuf → bébé (1er jour) → enfant (jours 2-3) → adulte. Bien soigné, l'adulte gagne une barrette étoile.

## Personnalisation

- Animal : chat, lapin ou ourson
- Style : mignon ou pixel rétro
- Pelage : rose, menthe, ciel, citron, lavande, noir, noir et blanc, roux tigré, gris tacheté
- Genre : il ou elle (les phrases s'accordent)
- Modèles prêts à adopter, d'après les chats de la maison : **Simba** (roux crème et blanc),
  **Snoop** (tigrée grise et pêche) et **Grisette** (noire et blanche à poils longs)

## Télécharger

Dernière version : https://github.com/Didtho/ThomasGotchi/releases/latest
(Windows : le fichier `.exe`, Mac : le fichier `.dmg`).
Sur Windows, l'application se met ensuite à jour toute seule. Sur Mac, le menu de l'icône signale les nouvelles versions.

## Développement

```
npm install
npm start          # lancer l'application
npm run dist       # installateur Windows -> dist/
npm run dist:mac   # installateur Mac -> dist/ (à lancer sur un Mac)
```

Publier une nouvelle version : changer "version" dans `package.json`, puis créer et pousser le tag correspondant
(`git tag v1.2.0 && git push origin v1.2.0`). GitHub fabrique alors les deux installateurs et les publie.

L'application n'est pas signée : au premier lancement sur Mac, faire **clic droit → Ouvrir**. Si macOS dit qu'elle est
« endommagée », taper dans le Terminal : `xattr -cr /Applications/ThomasGotchi.app`.

Sauvegarde : `%APPDATA%\thomasgotchi\pet.json` (Windows) ou `~/Library/Application Support/thomasgotchi/pet.json` (Mac).
