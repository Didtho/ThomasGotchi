// Traductions. Le français est la langue de référence : chaque texte français sert de clé, et
// les fichiers locales/en.js, es.js, it.js donnent sa traduction. Un texte non traduit reste en français.
// Les parties variables s'écrivent {nom} : t('Coucou {name} !', { name: 'Simba' }).

const LANGS = ['fr', 'en', 'es', 'it'];
const I18N = { lang: 'fr' };

function t(text, params) {
  const dict = (window.LOCALES || {})[I18N.lang];
  let s = (I18N.lang !== 'fr' && dict && dict[text]) || text;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
  return s;
}

// Traduit les textes fixes de la page (libellés, boutons, bulles d'aide, champs vides).
// Le texte français d'origine est mémorisé pour pouvoir changer de langue à tout moment.
const i18nSource = new WeakMap();
function translatePage(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!i18nSource.has(node)) {
      if (!node.nodeValue.trim() || node.parentNode.closest('script, style')) continue;
      i18nSource.set(node, node.nodeValue);
    }
    const src = i18nSource.get(node);
    const core = src.trim();
    node.nodeValue = src.replace(core, t(core));
  }
  for (const attr of ['placeholder', 'title']) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const key = 'i18n' + attr;
      if (!el.dataset[key]) el.dataset[key] = el.getAttribute(attr);
      el.setAttribute(attr, t(el.dataset[key]));
    }
  }
}
