// Liste toutes les phrases françaises de l'application et signale celles qui manquent
// dans les fichiers de traduction (src/locales/*.js).
//   node scripts/i18n-check.js          -> résumé + phrases manquantes
//   node scripts/i18n-check.js --keys   -> écrit la liste complète dans scripts/i18n-keys.json
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const keys = new Set();

// force : garder aussi les mots isolés en minuscules (sinon pris pour des identifiants du code)
const add = (s, force = false) => {
  s = s.replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
  if (s && /[a-zA-Zàâçéèêëîïôûùüœ]/.test(s) && (force || !/^[a-z0-9_-]+$/.test(s))) keys.add(s);
};

// Chaîne entre apostrophes ou guillemets, avec échappements
const STR = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")`;
const each = (src, re, groups, force = false) => {
  for (const m of src.matchAll(re)) for (const g of groups) if (m[g] !== undefined) add(m[g], force);
};
const rx = (s) => new RegExp(s, 'g');

const jsFiles = ['src/app.js', 'src/pet.js', 'src/games.js', 'src/seasons.js', 'main.js'];
for (const f of jsFiles) {
  const src = read(f);
  // Premier argument texte de t(), tr(), say(), speak() — y compris dans un « condition ? a : b »
  each(src, rx(String.raw`\b(?:t|tr|say|speak)\(\s*` + STR), [1, 2], true);
  each(src, rx(String.raw`\b(?:t|tr|say)\([^'"\n]*?\?\s*` + STR + String.raw`\s*:\s*` + STR), [1, 2, 3, 4], true);
  // Variantes il / elle
  each(src, rx(String.raw`Pet\.g\(\s*\w+\s*,\s*` + STR + String.raw`\s*,\s*` + STR), [1, 2, 3, 4]);
  // Tables de données : messages, noms, astuces, catégories, fêtes
  each(src, rx(String.raw`\b(?:msg|name|hint|say|cat|greeting|label):\s*` + STR), [1, 2], true);
  // Messages choisis par une condition, ou assignés directement
  each(src, rx(String.raw`\bmsg:\s*[^'"\n,]*?\?\s*` + STR + String.raw`\s*:\s*` + STR), [1, 2, 3, 4]);
  each(src, rx(String.raw`\bmsg = ` + STR), [1, 2]);
  // Libellés du carnet
  each(src, rx(String.raw`(?:addRow\(|\[)\s*` + STR + String.raw`\s*,\s*(?:Pet\.|s\.|fav|next|\x60)`), [1, 2]);
  // Listes de phrases (repas, petits numéros, coups de patte, réactions)
  for (const m of src.matchAll(/(?:msgs|say):\s*\[([^\]]*)\]|(?:say|pick)\(\[([^\]]*)\]/g)) {
    each(m[1] || m[2], rx(STR), [1, 2]);
  }
  if (f === 'src/pet.js') {
    // Besoins renvoyés par Pet.need
    const need = src.slice(src.indexOf('  need(s) {'), src.indexOf('  // ---- Actions ----'));
    each(need, rx(String.raw`return\s+` + STR), [1, 2]);
    // Caractères des espèces : noms (masculin, féminin) et descriptions
    const traits = src.slice(src.indexOf('const TRAITS = {'), src.indexOf('// Modèles prêts à adopter'));
    each(traits, rx(String.raw`name:\s*\[\s*` + STR + String.raw`\s*,\s*` + STR), [1, 2, 3, 4], true);
    each(traits, rx(String.raw`desc:\s*` + STR), [1, 2], true);
    // Repas « repu » accordé au féminin
    for (const m of src.matchAll(/'([^']*\brepu\b[^']*)'/g)) add(m[1].replace(/\brepu\b/, 'repue'));
  }
}
// Niveaux d'amitié calculés dans main.js
['connaissances', 'copains', 'meilleurs amis'].forEach((k) => add(k, true));

// Page : textes, champs vides et bulles d'aide
const html = read('src/index.html').replace(/<script[\s\S]*?<\/script>/g, '');
for (const m of html.matchAll(/>([^<>]+)</g)) add(m[1].replace(/\s+/g, ' '));
for (const m of html.matchAll(/(?:placeholder|title)="([^"]+)"/g)) add(m[1]);

const all = [...keys].sort((a, b) => a.localeCompare(b, 'fr'));
if (process.argv.includes('--keys')) {
  fs.writeFileSync(path.join(__dirname, 'i18n-keys.json'), JSON.stringify(all, null, 1));
  console.log(all.length, 'phrases écrites dans scripts/i18n-keys.json');
}

let missingTotal = 0;
for (const lang of ['en', 'es', 'it']) {
  const file = path.join(root, 'src', 'locales', lang + '.js');
  delete require.cache[file];
  const dict = require(file);
  const missing = all.filter((k) => !(k in dict));
  missingTotal += missing.length;
  console.log(`${lang} : ${all.length - missing.length} / ${all.length} traduites`);
  if (missing.length && !process.argv.includes('--keys')) missing.slice(0, 40).forEach((k) => console.log('   manque :', k));
}
process.exitCode = missingTotal ? 1 : 0;
