// Position des fenêtres ouvertes sur Mac, pour que les animaux marchent dessus.
// Ce n'est pas un script de la page : main.js le lance avec « osascript -l JavaScript » (JXA).
// Seules les positions sont lues : macOS ne demande aucune autorisation pour ça
// (les titres des fenêtres, eux, demanderaient l'enregistrement de l'écran).
// Même sortie que windows-watcher.ps1 : une ligne [[id, gauche, haut, droite, bas], ...] par relevé,
// de la fenêtre la plus en avant à la plus en arrière.

ObjC.import('CoreGraphics');
ObjC.import('Foundation');

const me = Number(ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('TG_PID')));
const out = $.NSFileHandle.fileHandleWithStandardOutput;

// Il s'arrête de lui-même après environ 3 minutes et main.js le relance : il ne grossit pas en mémoire
for (let n = 0; n < 600; n++) {
  // 1 : fenêtres visibles seulement ; 16 : sans le bureau
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0))) || [];
  const rows = [];
  for (const w of list) {
    if (w.kCGWindowLayer !== 0) continue;           // barre des menus, Dock, bulles…
    if (w.kCGWindowOwnerPID === me) continue;       // nos propres fenêtres (animaux, crottes)
    if (w.kCGWindowAlpha === 0) continue;           // fenêtres invisibles
    const b = w.kCGWindowBounds;
    if (!b || b.Width < 100 || b.Height < 50) continue;
    rows.push([w.kCGWindowNumber, Math.round(b.X), Math.round(b.Y), Math.round(b.X + b.Width), Math.round(b.Y + b.Height)]);
  }
  out.writeData($(JSON.stringify(rows) + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
  delay(0.3);
}
