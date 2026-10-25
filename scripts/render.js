// Rendu d'images fixes avec le moteur de dessin de l'application (pour le site internet).

// Vue « au repos » d'un animal, complétée par les options données
function view(species, color, extra = {}) {
  return {
    stage: 'adult', species, mood: 'happy', eyes: 'open', mouth: 'smile',
    color: Pet.COLORS[color] || color, coat: Pet.COATS[color] || null, dark: !!(Pet.COATS[color] && Pet.COATS[color].dark),
    care: 0, style: 'cute', t: 1.3, anim: null, animT: 0, facing: 0, lookX: null, lookY: 0.15, walking: false, accessory: null,
    ...extra,
  };
}

// crop : zone de la scène (240 x 300) à garder ; scale : agrandissement pour une image nette
function renderPng(v, crop = { x: 0, y: 0, w: 240, h: 300 }, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = crop.w * scale;
  canvas.height = crop.h * scale;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -crop.x * scale, -crop.y * scale);
  Draw.render(ctx, v);
  return canvas.toDataURL('image/png');
}

const PET = { x: 44, y: 140, w: 152, h: 160 }; // cadre serré autour d'un animal adulte
const DEFAULT_COLOR = { chat: 'rose', lapin: 'ciel', ours: 'citron', panda: 'blanc', pingouin: 'blanc' };

window.renderAll = () => {
  const out = {};
  for (const sp of Pet.SPECIES) out['animal-' + sp.id] = renderPng(view(sp.id, sp.color || DEFAULT_COLOR[sp.id]), PET);
  out['chat-simba'] = renderPng(view('chat', 'simba'), PET);
  out['chat-snoop'] = renderPng(view('chat', 'snoop'), PET);
  out['chat-grisette'] = renderPng(view('chat', 'grisette'), PET);
  // Scènes complètes (décor compris)
  out['scene-pluie'] = renderPng(view('chat', 'simba', { weather: 'rain', gear: 'umbrella', t: 2.1 }));
  out['scene-halloween'] = renderPng(view('chat', 'noir', { decor: 'halloween', decorBack: true, accessory: 'sorciere', night: true, t: 3.2 }));
  out['scene-noel'] = renderPng(view('renard', 'orange', { decor: 'snow', decorBack: true, accessory: 'noel', t: 4 }));
  out['scene-danse'] = renderPng(view('licorne', 'blanc', { anim: 'dance', animT: 0.35, eyes: 'joy', mouth: 'open', t: 5 }));
  out['scene-dodo'] = renderPng(view('panda', 'blanc', { mood: 'sleep', eyes: 'closed', mouth: 'o', nightcap: true, weather: 'clear', isDay: false, t: 6 }));
  out['scene-fete'] = renderPng(view('dragon', 'vert', { decor: 'fireworks', accessory: 'fete', eyes: 'joy', mouth: 'open', t: 7.3 }));
  out['scene-retro'] = renderPng(view('chien', 'marron', { style: 'pixel', t: 2 }));
  out['scene-soif'] = renderPng(view('hamster', 'caramel', { mood: 'sad', eyes: 'sad', mouth: 'tongue', need: 'thirst', t: 3 }));
  return out;
};

// Données reprises par le site : liste des animaux, nombre de pelages et d'accessoires
window.appData = () => ({
  species: Pet.SPECIES.map((s) => ({ id: s.id, name: s.name })),
  coats: Object.keys(Pet.COLORS).length,
  accessories: Pet.ACCESSORIES.length,
  tricks: Pet.TRICKS.length,
});
