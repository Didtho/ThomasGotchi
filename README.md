# ThomasGotchi

Un petit animal façon Tamagotchi qui vit sur le bureau (Windows et Mac), toujours au-dessus des fenêtres.
Il se promène, passe d'un écran à l'autre, grandit, et il faut s'en occuper pour qu'il ne meure pas.

## S'en occuper

- **Survoler** l'animal : affiche ses jauges (faim, soif, énergie, bonheur, propreté, santé) et les boutons.
- **Glisser un fichier** sur lui : il le mange. Le fichier n'est ni modifié ni supprimé, seuls son nom et sa taille comptent.
  Images = friandise, PDF / documents = vrai repas, vidéos = festin, musique = dessert, programmes (.exe…) = mal au ventre !
- 🥤 boire · 🌙 dormir / réveiller · 🎾 jouer · 🛁 laver · 💊 soigner · ⚙️ réglages
- **Clic** : un câlin. **Glisser** : le déplacer. **Clic droit** : réglages.
- **Crottes** 💩 : il fait ses besoins sur le bureau. Cliquer sur une crotte la nettoie (ou le bain pour tout nettoyer).
- L'icône près de l'horloge (barre des menus sur Mac) permet de le cacher, de le ramener ou de quitter.

Ses besoins se lisent sur son visage : langue pendante quand il a soif, bave quand il a faim, thermomètre quand il
est malade, taches et odeurs quand il est sale.

Sans soins, il tient environ 2 à 3 jours. Le temps continue de passer quand l'application est fermée.
Il grandit : œuf → bébé (1er jour) → enfant (jours 2-3) → adulte. Bien soigné, l'adulte gagne une barrette étoile.

## Personnalisation

- Animal : chat, lapin ou ourson
- Style : mignon ou pixel rétro
- Pelage : rose, menthe, ciel, citron, lavande, noir, noir et blanc, roux tigré, gris tacheté

## Développement

```
npm install
npm start          # lancer l'application
npm run dist       # installateur Windows -> dist/
npm run dist:mac   # installateur Mac -> dist/ (à lancer sur un Mac)
```

Le `.dmg` ne peut être fabriqué que sur un Mac. Sans Mac, le workflow `.github/workflows/build.yml` fabrique
les deux versions sur GitHub : onglet **Actions** → **Construire ThomasGotchi** → **Run workflow**, puis
télécharger les fichiers en bas de la page du résultat.

L'application n'est pas signée : au premier lancement sur Mac, faire **clic droit → Ouvrir**. Si macOS dit qu'elle est
« endommagée », taper dans le Terminal : `xattr -cr /Applications/ThomasGotchi.app`.

Sauvegarde : `%APPDATA%\thomasgotchi\pet.json` (Windows) ou `~/Library/Application Support/thomasgotchi/pet.json` (Mac).
