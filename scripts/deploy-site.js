// Envoie le site (dossier site/) chez l'hébergeur par SFTP.
//   npm run deploy-site            -> envoi complet
//   npm run deploy-site -- --list  -> affiche les dossiers du serveur (pour trouver remoteDir)
// Les accès sont lus dans deploy.local.json (fichier local, exclu de GitHub). Les mots de passe ne sont jamais affichés.
// Le fichier de connexion à la base (inc/config.local.php) est créé directement sur le serveur.
const fs = require('fs');
const path = require('path');
const SftpClient = require('ssh2-sftp-client');

const root = path.join(__dirname, '..');
const cfgFile = path.join(root, 'deploy.local.json');
if (!fs.existsSync(cfgFile)) {
  console.error('deploy.local.json introuvable à la racine du projet.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const { sftp: s, db } = cfg;
if (!s || !s.password) {
  console.error('Mot de passe SFTP manquant : remplir "sftp.password" dans deploy.local.json.');
  process.exit(1);
}

// Fichiers à ne pas envoyer : cache du serveur et réglages locaux de WAMP
const SKIP = [/^cache(\/|$)/, /^inc\/config\.local\.php$/];

function listFiles(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (SKIP.some((re) => re.test(rel))) continue;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

const phpString = (v) => "'" + String(v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

(async () => {
  const client = new SftpClient();
  try {
    await client.connect({ host: s.host, port: s.port || 22, username: s.username, password: s.password, readyTimeout: 20000 });

    if (process.argv.includes('--list') || !s.remoteDir) {
      const dir = s.remoteDir || '.';
      console.log(`Contenu de « ${dir} » sur le serveur :`);
      for (const f of await client.list(dir)) console.log(`  ${f.type === 'd' ? '[dossier]' : '         '} ${f.name}`);
      if (!s.remoteDir) console.log('\nIndiquer le dossier du site dans "sftp.remoteDir" de deploy.local.json, puis relancer.');
      return;
    }

    const remote = s.remoteDir.replace(/\/+$/, '');
    const files = listFiles(path.join(root, 'site'));
    const dirs = [...new Set(files.map((f) => path.posix.dirname(f)).filter((d) => d !== '.'))];
    for (const d of dirs) await client.mkdir(`${remote}/${d}`, true);
    await client.mkdir(`${remote}/cache`, true);

    let n = 0;
    for (const f of files) {
      await client.put(path.join(root, 'site', f), `${remote}/${f}`);
      n++;
      process.stdout.write(`\rEnvoi : ${n} / ${files.length}`);
    }
    process.stdout.write('\n');

    // Connexion à la base de données, écrite uniquement sur le serveur
    if (db && db.password) {
      const php = `<?php\n// Créé par scripts/deploy-site.js : accès à la base de données (ne pas mettre sur GitHub)\nreturn [\n`
        + `    'host' => ${phpString(db.host)},\n    'name' => ${phpString(db.name)},\n`
        + `    'user' => ${phpString(db.user)},\n    'password' => ${phpString(db.password)},\n];\n`;
      await client.put(Buffer.from(php, 'utf8'), `${remote}/inc/config.local.php`);
      console.log('Connexion à la base de données configurée sur le serveur.');
    } else {
      console.log('Pas de mot de passe de base de données : le compteur de téléchargements restera désactivé en ligne.');
    }
    console.log(`Site envoyé. Vérifier : ${cfg.url || remote}`);
  } catch (err) {
    console.error('Échec de l\'envoi :', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();
