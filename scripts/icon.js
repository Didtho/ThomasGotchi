// Dessine l'icône de l'application avec le moteur de dessin de l'animal : Simba assis, tout sourire.
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// Zone de la scène (240 x 300) qui contient le chat adulte assis
const crop = { x: 52, y: 160, size: 136 };
const k = canvas.width / crop.size;
ctx.setTransform(k, 0, 0, k, -crop.x * k, -crop.y * k);

Draw.render(ctx, {
  stage: 'adult', species: 'chat', mood: 'happy', eyes: 'open', mouth: 'smile',
  color: Pet.COLORS.simba, coat: Pet.COATS.simba, dark: false, care: 0, style: 'cute',
  t: 1.3, anim: null, animT: 0, facing: 0, lookX: null, lookY: 0.2, walking: false, accessory: null,
});

window.iconPng = canvas.toDataURL('image/png');
