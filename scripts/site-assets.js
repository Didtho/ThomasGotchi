// Génère les images du site (site/img/*.png) à partir du dessin de l'application,
// ainsi que site/data/app.json (animaux, nombre de pelages…) lu par la page.
// À lancer avec Electron : npm run site-assets
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 300, height: 300, transparent: true });
  await win.loadFile(path.join(__dirname, 'render.html'));
  const images = await win.webContents.executeJavaScript('window.renderAll()');
  const dir = path.join(__dirname, '..', 'site', 'img');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, dataUrl] of Object.entries(images)) {
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  fs.copyFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), path.join(dir, 'icon.png'));
  // Moteur de dessin et bruitages de l'application, pour les animaux animés du site (site/animals.js)
  const engine = path.join(__dirname, '..', 'site', 'engine');
  fs.mkdirSync(engine, { recursive: true });
  for (const f of ['i18n.js', 'pet.js', 'draw.js', 'species.js', 'sound.js', 'seasons.js']) {
    fs.copyFileSync(path.join(__dirname, '..', 'src', f), path.join(engine, f));
  }
  // Traductions de l'application : messages des fêtes affichés en bannière sur le site
  fs.mkdirSync(path.join(engine, 'locales'), { recursive: true });
  for (const lang of ['en', 'es', 'it']) {
    fs.copyFileSync(path.join(__dirname, '..', 'src', 'locales', lang + '.js'), path.join(engine, 'locales', lang + '.js'));
  }
  const data = await win.webContents.executeJavaScript('window.appData()');
  fs.mkdirSync(path.join(__dirname, '..', 'site', 'data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'site', 'data', 'app.json'), JSON.stringify(data, null, 1));
  console.log(Object.keys(images).length + 1, 'images générées dans', dir);
  app.quit();
});
