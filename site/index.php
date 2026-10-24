<?php
require __DIR__ . '/inc/release.php';

date_default_timezone_set('Europe/Paris');
$release = tg_latest_release();
$h = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

$animals = [
    'chat' => 'Chat', 'lapin' => 'Lapin', 'ours' => 'Ourson', 'chien' => 'Chien',
    'renard' => 'Renard', 'panda' => 'Panda', 'pingouin' => 'Pingouin', 'hamster' => 'Hamster',
    'koala' => 'Koala', 'grenouille' => 'Grenouille', 'licorne' => 'Licorne', 'dragon' => 'Petit dragon',
];

$features = [
    ['🍽️', 'Il mange tes fichiers', 'Glisse une image, un PDF ou une vidéo sur lui : il se régale. Rassure-toi, tes fichiers ne sont jamais effacés.'],
    ['💖', 'Prends soin de lui', 'Faim, soif, sommeil, propreté, câlins… Ses besoins se lisent sur son visage. Sans soins, il tombe malade.'],
    ['🐾', 'Il vit sa vie', 'Il se promène, court, fait des roulades et passe d\'un écran à l\'autre. Il fait même ses besoins sur le bureau !'],
    ['🎾', 'Jeux et tours', 'Attrape les friandises, jeu des gobelets, pelote de laine… et des tours qu\'il apprend petit à petit.'],
    ['🎃', 'Fêtes et météo', 'Halloween, Noël, Nouvel An, Pâques… et la vraie météo de ta ville, avec parapluie et écharpe.'],
    ['💞', 'Plusieurs compagnons', 'Jusqu\'à 5 animaux qui deviennent amis, jouent à chat, se font la toilette et se chamaillent.'],
    ['🗣️', 'Il te parle', 'Il dit ton prénom à voix haute, te conseille une pause quand tu travailles trop et fait la fête quand tu reviens.'],
    ['🎁', 'Gratuit, sans pub', 'Pas de compte, pas de publicité. Il fonctionne même sans connexion (sauf la météo).'],
];

$moments = [
    ['scene-pluie', 'Il sort son parapluie quand il pleut chez toi'],
    ['scene-halloween', 'Citrouille et chauves-souris pour Halloween'],
    ['scene-noel', 'Neige, sapin et cadeau à ouvrir à Noël'],
    ['scene-danse', 'La licorne a appris à danser'],
    ['scene-dodo', 'Au lit à 22 h, avec son bonnet de nuit'],
    ['scene-fete', 'Feux d\'artifice pour la nouvelle année'],
    ['scene-soif', 'Langue pendante : il a soif !'],
    ['scene-retro', 'Style pixel rétro, comme dans les années 80'],
];

$faq = [
    ['Est-ce vraiment gratuit ?', 'Oui, entièrement : pas d\'abonnement, pas de publicité, pas de compte à créer.'],
    ['Les fichiers que je lui donne à manger sont-ils supprimés ?', 'Non, jamais. Il regarde seulement leur nom et leur taille pour savoir ce qu\'il mange. Le fichier reste exactement là où il était.'],
    ['Que devient-il quand l\'ordinateur est éteint ?', 'Le temps continue de passer : pense à t\'occuper de lui ! Pour partir en vacances, active la « pause vacances » : il ne vieillit pas et n\'a ni faim ni soif.'],
    ['Il prend beaucoup de place ou de ressources ?', 'Non : il reste discret, les clics passent à travers lui, et le mode « ne pas déranger » le rend muet et immobile pendant une réunion ou un film.'],
    ['Mes données sont-elles envoyées quelque part ?', 'Non. Ton animal est sauvegardé uniquement sur ton ordinateur. Seule la météo interroge un service public (avec le nom de ta ville), et l\'application vérifie s\'il existe une nouvelle version.'],
    ['Comment le donner à quelqu\'un ou le changer d\'ordinateur ?', 'Dans ses réglages, « Exporter » crée un petit fichier. Sur l\'autre ordinateur, « Importer un animal » dans le menu de l\'icône le fait revivre.'],
];
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ThomasGotchi — un petit compagnon sur ton bureau</title>
  <meta name="description" content="ThomasGotchi : un petit animal façon Tamagotchi qui vit sur le bureau de ton ordinateur (Windows et Mac). Gratuit et sans publicité.">
  <link rel="icon" href="img/icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="top">
    <a class="brand" href="#"><img src="img/icon.png" alt="" width="40" height="40"> ThomasGotchi</a>
    <nav>
      <a href="#fonctions">Fonctions</a>
      <a href="#animaux">Animaux</a>
      <a href="#installer">Installer</a>
      <a href="#faq">Questions</a>
    </nav>
    <a class="btn small" href="#telecharger">Télécharger</a>
  </header>

  <section class="hero">
    <div class="hero-text">
      <h1>Un petit compagnon<br>qui vit sur ton bureau</h1>
      <p class="lead">Nourris-le avec tes fichiers, fais-le boire, joue avec lui et regarde-le se promener entre tes fenêtres. Comme les Tamagotchi des années 80… mais sur ton ordinateur.</p>
      <div class="downloads" id="telecharger">
        <a class="btn" data-os="windows" href="<?= $h($release['windows']) ?>">
          <span class="os">⊞</span> Télécharger pour Windows
        </a>
        <a class="btn alt" data-os="mac" href="<?= $h($release['mac']) ?>">
          <span class="os">🍎</span> Télécharger pour Mac
        </a>
      </div>
      <p class="version">
        <?php if ($release['version']): ?>
          Version <?= $h($release['version']) ?><?= $release['date'] ? ' · ' . $h(date('d/m/Y', strtotime($release['date']))) : '' ?> · gratuit · sans publicité
        <?php else: ?>
          Gratuit · sans publicité
        <?php endif; ?>
      </p>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="window">
        <div class="window-bar"><i></i><i></i><i></i></div>
        <div class="window-body">
          <img class="pet p1" src="img/chat-simba.png" alt="">
          <img class="pet p2" src="img/animal-licorne.png" alt="">
          <img class="pet p3" src="img/animal-renard.png" alt="">
          <span class="bubble">Miam, un PDF ! 😋</span>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="fonctions">
    <h2>Tout ce qu'il sait faire</h2>
    <div class="features">
      <?php foreach ($features as [$icon, $title, $text]): ?>
        <article class="feature">
          <div class="feature-icon"><?= $icon ?></div>
          <h3><?= $h($title) ?></h3>
          <p><?= $h($text) ?></p>
        </article>
      <?php endforeach; ?>
    </div>
  </section>

  <section class="section tinted" id="animaux">
    <h2>Choisis ton compagnon</h2>
    <p class="section-lead">12 animaux, 18 pelages, un style mignon ou pixel rétro, et des accessoires à gagner.</p>
    <div class="animals">
      <?php foreach ($animals as $id => $name): ?>
        <figure class="animal">
          <img src="img/animal-<?= $h($id) ?>.png" alt="<?= $h($name) ?>" loading="lazy">
          <figcaption><?= $h($name) ?></figcaption>
        </figure>
      <?php endforeach; ?>
    </div>
    <div class="house-cats">
      <img src="img/chat-simba.png" alt="Simba">
      <img src="img/chat-snoop.png" alt="Snoop">
      <img src="img/chat-grisette.png" alt="Grisette">
      <p>Et les modèles <strong>Simba</strong>, <strong>Snoop</strong> et <strong>Grisette</strong>, dessinés d'après de vrais chats de la maison.</p>
    </div>
  </section>

  <section class="section" id="moments">
    <h2>Une vie pleine de surprises</h2>
    <div class="moments">
      <?php foreach ($moments as [$img, $caption]): ?>
        <figure class="moment">
          <img src="img/<?= $h($img) ?>.png" alt="<?= $h($caption) ?>" loading="lazy">
          <figcaption><?= $h($caption) ?></figcaption>
        </figure>
      <?php endforeach; ?>
    </div>
  </section>

  <section class="section tinted" id="installer">
    <h2>Installer ThomasGotchi</h2>
    <div class="install">
      <article class="install-card">
        <h3>⊞ Windows</h3>
        <ol>
          <li>Télécharge le fichier <strong>.exe</strong> ci-dessus.</li>
          <li>Lance-le et suis l'installation. Windows peut afficher un avertissement : clique sur <em>Informations complémentaires</em> puis <em>Exécuter quand même</em>.</li>
          <li>Ton œuf apparaît en bas de l'écran : choisis son prénom, son animal et sa couleur !</li>
        </ol>
        <p class="note">Les nouvelles versions s'installent ensuite toutes seules.</p>
      </article>
      <article class="install-card">
        <h3>🍎 Mac</h3>
        <ol>
          <li>Télécharge le fichier <strong>.dmg</strong> et ouvre-le.</li>
          <li>Glisse ThomasGotchi dans le dossier <strong>Applications</strong>.</li>
          <li>La première fois : <strong>clic droit</strong> sur l'application → <em>Ouvrir</em> → <em>Ouvrir</em>.</li>
        </ol>
        <p class="note">Si macOS indique que l'application est « endommagée », ouvre le Terminal et tape :<br><code>xattr -cr /Applications/ThomasGotchi.app</code></p>
      </article>
    </div>
  </section>

  <section class="section" id="faq">
    <h2>Questions fréquentes</h2>
    <div class="faq">
      <?php foreach ($faq as [$q, $a]): ?>
        <details>
          <summary><?= $h($q) ?></summary>
          <p><?= $h($a) ?></p>
        </details>
      <?php endforeach; ?>
    </div>
  </section>

  <footer class="bottom">
    <img src="img/icon.png" alt="" width="32" height="32">
    <p>ThomasGotchi · fait avec amour par Didtho · <a href="https://github.com/<?= $h(TG_REPO) ?>">code source</a></p>
  </footer>

  <script>
    // Met en avant le bouton correspondant à l'ordinateur du visiteur
    const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
    const first = document.querySelector(`.downloads [data-os="${isMac ? 'mac' : 'windows'}"]`);
    if (first) {
      first.classList.remove('alt');
      first.parentNode.prepend(first);
      document.querySelectorAll('.downloads .btn').forEach((b) => { if (b !== first) b.classList.add('alt'); });
    }
  </script>
</body>
</html>
