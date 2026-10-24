// Génère les images du site (site/img/*.png) à partir du dessin de l'application.
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
  console.log(Object.keys(images).length + 1, 'images générées dans', dir);
  app.quit();
});
