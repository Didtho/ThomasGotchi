// Génère les images du site (site/img/*.png) à partir du dessin de l'application,
// ainsi que site/data/app.json (animaux, nombre de pelages…) lu par la page.
// À lancer avec Electron : npm run site-assets
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// Nouveautés de chaque version, lues dans git : étiquettes vX.Y.Z et lignes « - … » du message de leur commit
function changelog() {
  const { execFileSync } = require('child_process');
  // git appelé directement (sans interpréteur de commandes, qui transformerait certains caractères)
  const git = (...args) => execFileSync('git', args, { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  try {
    return git('for-each-ref', '--sort=-creatordate', '--format=%(refname:short) %(creatordate:short)', 'refs/tags')
      .split('\n').filter((l) => /^v\d+\.\d+\.\d+ /.test(l)).slice(0, 40)
      .map((l) => {
        const [tag, date] = l.trim().split(' ');
        const items = git('log', '-1', '--format=%B', tag).split('\n').filter((s) => s.startsWith('- ')).map((s) => s.slice(2).trim());
        return { version: tag.slice(1), date, items };
      })
      .filter((v) => v.items.length);
  } catch {
    return []; // pas de git : la section des nouveautés reste vide
  }
}

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
  data.changelog = changelog();
  fs.mkdirSync(path.join(__dirname, '..', 'site', 'data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'site', 'data', 'app.json'), JSON.stringify(data, null, 1));
  console.log(Object.keys(images).length + 1, 'images générées dans', dir);
  app.quit();
});
