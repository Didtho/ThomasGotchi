// Génère assets/icon.png (512 x 512, taille minimale exigée pour Mac) à partir du dessin de l'animal.
// À lancer avec Electron : npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 512, height: 512, transparent: true });
  await win.loadFile(path.join(__dirname, 'icon.html'));
  const dataUrl = await win.webContents.executeJavaScript('window.iconPng');
  const out = path.join(__dirname, '..', 'assets', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('Icône générée :', out);
  app.quit();
});
