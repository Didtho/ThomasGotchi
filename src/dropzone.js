// Zone de dépôt (Mac) : petite fenêtre invisible posée sur le corps de l'animal.
// Elle capte toujours la souris, donc reçoit les fichiers glissés, et transmet clics et mouvements à la fenêtre de l'animal.

for (const type of ['mousedown', 'mouseup', 'mousemove']) {
  addEventListener(type, (e) => zone.mouse(type, e.clientX, e.clientY, e.button, e.detail));
}
addEventListener('contextmenu', (e) => e.preventDefault()); // le clic droit est transmis à l'animal (réglages)
document.addEventListener('mouseenter', () => zone.diag('zone de dépôt : souris dessus'));
document.addEventListener('mouseleave', () => zone.diag('zone de dépôt : souris partie'));

addEventListener('dragenter', (e) => {
  e.preventDefault();
  zone.diag(`zone de dépôt : fichier glissé au-dessus (types : ${[...e.dataTransfer.types].join(', ') || 'aucun'})`);
});

addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy'; // le fichier d'origine n'est jamais déplacé ni supprimé
});

addEventListener('drop', (e) => {
  e.preventDefault();
  // Comme sur l'animal : seuls le nom et la taille sont lus
  const meals = [];
  for (const item of e.dataTransfer.items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    const file = item.getAsFile();
    if (file) meals.push({ name: file.name, size: file.size, isDir: !!(entry && entry.isDirectory) });
  }
  zone.diag(`zone de dépôt : dépôt reçu, ${meals.length} fichier(s)`);
  if (meals.length) zone.feed(meals);
});
