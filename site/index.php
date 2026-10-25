<?php
require __DIR__ . '/inc/release.php';
require __DIR__ . '/inc/i18n.php';
require __DIR__ . '/inc/db.php';

date_default_timezone_set('Europe/Paris');
define('TG_CURRENT', tg_lang());
$root = TG_CURRENT === 'fr' ? '' : '../'; // chemin vers les images et la feuille de style
$release = tg_latest_release();
$downloads = tg_download_total();
$h = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

// Animaux et chiffres repris de l'application (générés par « npm run site-assets »)
$app = json_decode((string) @file_get_contents(__DIR__ . '/data/app.json'), true) ?: ['species' => [], 'coats' => 0];
$animals = array_column($app['species'], 'name', 'id');

$features = [
    ['🍽️', 'Il mange tes fichiers', 'Glisse une image, un PDF ou une vidéo sur lui : il se régale. Rassure-toi, tes fichiers ne sont jamais effacés.'],
    ['💖', 'Prends soin de lui', 'Faim, soif, sommeil, propreté, câlins… Ses besoins se lisent sur son visage. Sans soins, il tombe malade.'],
    ['🐾', 'Il vit sa vie', 'Il se promène, passe d\'un écran à l\'autre et grimpe sur tes fenêtres : si tu les fermes, il tombe ! Il fait même ses besoins sur le bureau.'],
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
    ['Dans quelles langues existe-t-il ?', 'En français, anglais, espagnol et italien. Il choisit tout seul la langue de ton ordinateur, et tu peux la changer dans ses réglages.'],
];

// Adresse d'un fichier du site avec sa date de modification (?v=…) : le navigateur recharge toujours la dernière version
$asset = fn(string $file): string => $root . $file . '?v=' . (@filemtime(__DIR__ . '/' . $file) ?: '0');

$langUrl = fn(string $code): string => ($code === 'fr' ? ($root ?: './') : $root . $code . '/');

// Référencement : adresses complètes du site en ligne, description et fiche lue par les moteurs de recherche
const TG_SITE_URL = 'https://thomasgotchi.mirimix.fr/';
$absUrl = fn(string $code): string => TG_SITE_URL . ($code === 'fr' ? '' : $code . '/');
$title = tt('ThomasGotchi — un Tamagotchi gratuit sur ton bureau (Windows et Mac)');
$description = tt('ThomasGotchi : un animal virtuel façon Tamagotchi qui vit sur le bureau de ton ordinateur (Windows et Mac). {n} animaux à adopter, nourrir et faire jouer. Gratuit et sans publicité.', ['n' => count($animals)]);
$locales = ['fr' => 'fr_FR', 'en' => 'en_US', 'es' => 'es_ES', 'it' => 'it_IT'];
$jsonLd = [
    [
        '@context' => 'https://schema.org',
        '@type' => 'SoftwareApplication',
        'name' => 'ThomasGotchi',
        'description' => $description,
        'url' => $absUrl(TG_CURRENT),
        'image' => TG_SITE_URL . 'img/partage.png',
        'applicationCategory' => 'GameApplication',
        'operatingSystem' => 'Windows, macOS',
        'inLanguage' => array_keys(TG_LANGS),
        'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'EUR'],
        'downloadUrl' => TG_RELEASES,
        'creator' => ['@type' => 'Organization', 'name' => 'DidTech', 'url' => 'https://www.didtech.fr/'],
    ] + ($release['version'] ? ['softwareVersion' => $release['version']] : []),
    [
        '@context' => 'https://schema.org',
        '@type' => 'FAQPage',
        'mainEntity' => array_map(fn($q) => [
            '@type' => 'Question',
            'name' => tt($q[0]),
            'acceptedAnswer' => ['@type' => 'Answer', 'text' => tt($q[1])],
        ], $faq),
    ],
];
?>
<!doctype html>
<html lang="<?= TG_CURRENT ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $h($title) ?></title>
  <meta name="description" content="<?= $h($description) ?>">
  <link rel="canonical" href="<?= $h($absUrl(TG_CURRENT)) ?>">
  <?php foreach (TG_LANGS as $code => $label): ?>
    <link rel="alternate" hreflang="<?= $code ?>" href="<?= $h($absUrl($code)) ?>">
  <?php endforeach; ?>
  <link rel="alternate" hreflang="x-default" href="<?= TG_SITE_URL ?>">
  <!-- Aperçu quand le lien est partagé (réseaux sociaux, messageries) -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="ThomasGotchi">
  <meta property="og:title" content="<?= $h($title) ?>">
  <meta property="og:description" content="<?= $h($description) ?>">
  <meta property="og:url" content="<?= $h($absUrl(TG_CURRENT)) ?>">
  <meta property="og:image" content="<?= TG_SITE_URL ?>img/partage.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="<?= $locales[TG_CURRENT] ?>">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#ff8fb8">
  <script type="application/ld+json"><?= json_encode($jsonLd, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script>
  <link rel="icon" href="<?= $asset('img/icon.png') ?>">
  <link rel="apple-touch-icon" href="<?= $asset('img/icon.png') ?>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="<?= $asset('style.css') ?>">
</head>
<body>
  <header class="top">
    <a class="brand" href="<?= $h($langUrl(TG_CURRENT)) ?>"><img src="<?= $asset('img/icon.png') ?>" alt="" width="40" height="40"> ThomasGotchi</a>
    <nav>
      <a href="#fonctions"><?= $h(tt('Fonctions')) ?></a>
      <a href="#animaux"><?= $h(tt('Animaux')) ?></a>
      <a href="#installer"><?= $h(tt('Installer')) ?></a>
      <a href="#faq"><?= $h(tt('Questions')) ?></a>
    </nav>
    <div class="langs">
      <?php foreach (TG_LANGS as $code => $label): ?>
        <a href="<?= $h($langUrl($code)) ?>" data-lang="<?= $code ?>" title="<?= $h($label) ?>"<?= $code === TG_CURRENT ? ' class="on"' : '' ?>><?= strtoupper($code) ?></a>
      <?php endforeach; ?>
    </div>
    <a class="btn small" href="#telecharger"><?= $h(tt('Télécharger')) ?></a>
  </header>

  <section class="hero">
    <div class="hero-text">
      <h1><?= tt('Un petit compagnon<br>qui vit sur ton bureau') ?></h1>
      <p class="lead"><?= $h(tt('Nourris-le avec tes fichiers, fais-le boire, joue avec lui et regarde-le se promener entre tes fenêtres. Comme les Tamagotchi des années 80… mais sur ton ordinateur.')) ?></p>
      <div class="downloads" id="telecharger">
        <a class="btn" data-os="windows" href="<?= $root ?>download.php?os=windows">
          <span class="os">⊞</span> <?= $h(tt('Télécharger pour Windows')) ?>
        </a>
        <a class="btn alt" data-os="mac" href="<?= $root ?>download.php?os=mac">
          <span class="os">🍎</span> <?= $h(tt('Télécharger pour Mac')) ?>
        </a>
      </div>
      <?php if ($downloads > 0): ?>
        <p class="counter"><?= $h(tt($downloads > 1 ? 'Déjà {n} téléchargements !' : 'Déjà {n} téléchargement !', ['n' => number_format($downloads, 0, ',', ' ')])) ?></p>
      <?php endif; ?>
      <p class="version">
        <?php if ($release['version']): ?>
          <?= $h(tt('Version {v}', ['v' => $release['version']])) ?><?= $release['date'] ? ' · ' . $h(date('d/m/Y', strtotime($release['date']))) : '' ?> · <?= $h(tt('gratuit · sans publicité')) ?>
        <?php else: ?>
          <?= $h(tt('Gratuit · sans publicité')) ?>
        <?php endif; ?>
      </p>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="window">
        <div class="window-bar"><i></i><i></i><i></i></div>
        <div class="window-body">
          <img class="pet p1" src="<?= $asset('img/chat-simba.png') ?>" alt="">
          <img class="pet p2" src="<?= $asset('img/animal-licorne.png') ?>" alt="">
          <img class="pet p3" src="<?= $asset('img/animal-renard.png') ?>" alt="">
          <span class="bubble"><?= $h(tt('Miam, un PDF ! 😋')) ?></span>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="fonctions">
    <h2><?= $h(tt('Tout ce qu\'il sait faire')) ?></h2>
    <div class="features">
      <?php foreach ($features as [$icon, $title, $text]): ?>
        <article class="feature">
          <div class="feature-icon"><?= $icon ?></div>
          <h3><?= $h(tt($title)) ?></h3>
          <p><?= $h(tt($text)) ?></p>
        </article>
      <?php endforeach; ?>
    </div>
  </section>

  <section class="section tinted" id="animaux">
    <h2><?= $h(tt('Choisis ton compagnon')) ?></h2>
    <p class="section-lead"><?= $h(tt('{n} animaux, {c} pelages, un style mignon ou pixel rétro, et des accessoires à gagner.', ['n' => count($animals), 'c' => (int) $app['coats']])) ?></p>
    <div class="animals">
      <?php foreach ($animals as $id => $name): ?>
        <figure class="animal">
          <img src="<?= $h($asset('img/animal-' . $id . '.png')) ?>" alt="<?= $h(tt($name)) ?>" loading="lazy">
          <figcaption><?= $h(tt($name)) ?></figcaption>
        </figure>
      <?php endforeach; ?>
    </div>
    <div class="house-cats">
      <img src="<?= $asset('img/chat-simba.png') ?>" alt="Simba">
      <img src="<?= $asset('img/chat-snoop.png') ?>" alt="Snoop">
      <img src="<?= $asset('img/chat-grisette.png') ?>" alt="Grisette">
      <p><?= tt('Et les modèles <strong>Simba</strong>, <strong>Snoop</strong> et <strong>Grisette</strong>, dessinés d\'après de vrais chats de la maison.') ?></p>
    </div>
  </section>

  <section class="section" id="moments">
    <h2><?= $h(tt('Une vie pleine de surprises')) ?></h2>
    <div class="moments">
      <?php foreach ($moments as [$img, $caption]): ?>
        <figure class="moment">
          <img src="<?= $h($asset('img/' . $img . '.png')) ?>" alt="<?= $h(tt($caption)) ?>" loading="lazy">
          <figcaption><?= $h(tt($caption)) ?></figcaption>
        </figure>
      <?php endforeach; ?>
    </div>
  </section>

  <section class="section tinted" id="installer">
    <h2><?= $h(tt('Installer ThomasGotchi')) ?></h2>
    <div class="install">
      <article class="install-card">
        <h3>⊞ Windows</h3>
        <ol>
          <li><?= tt('Télécharge le fichier <strong>.exe</strong> ci-dessus.') ?></li>
          <li><?= tt('Lance-le et suis l\'installation. Windows peut afficher un avertissement : clique sur <em>Informations complémentaires</em> puis <em>Exécuter quand même</em>.') ?></li>
          <li><?= tt('Ton œuf apparaît en bas de l\'écran : choisis son prénom, son animal et sa couleur !') ?></li>
        </ol>
        <p class="note"><?= $h(tt('Les nouvelles versions s\'installent ensuite toutes seules.')) ?></p>
      </article>
      <article class="install-card">
        <h3>🍎 Mac</h3>
        <ol>
          <li><?= tt('Télécharge le fichier <strong>.dmg</strong> et ouvre-le.') ?></li>
          <li><?= tt('Glisse ThomasGotchi dans le dossier <strong>Applications</strong>.') ?></li>
          <li><?= tt('La première fois : fais un <strong>clic droit</strong> sur l\'application et choisis <em>Ouvrir</em>. macOS affiche alors un avertissement : confirme avec le bouton <em>Ouvrir</em>.') ?></li>
        </ol>
        <p class="note"><?= $h(tt('Si macOS indique que l\'application est « endommagée », ouvre le Terminal et tape :')) ?><br><code>xattr -cr /Applications/ThomasGotchi.app</code></p>
      </article>
    </div>
  </section>

  <section class="section" id="faq">
    <h2><?= $h(tt('Questions fréquentes')) ?></h2>
    <div class="faq">
      <?php foreach ($faq as [$q, $a]): ?>
        <details>
          <summary><?= $h(tt($q)) ?></summary>
          <p><?= $h(tt($a)) ?></p>
        </details>
      <?php endforeach; ?>
    </div>
  </section>

  <footer class="bottom">
    <img src="<?= $asset('img/icon.png') ?>" alt="" width="32" height="32">
    <p><?= $h(tt('ThomasGotchi · une création')) ?> <a href="https://www.didtech.fr/">DidTech</a> · <a href="https://github.com/<?= $h(TG_REPO) ?>"><?= $h(tt('code source')) ?></a></p>
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
    // Le choix de langue est retenu (on ne redirige plus selon le navigateur)
    document.querySelectorAll('.langs a').forEach((a) => a.addEventListener('click', () => {
      document.cookie = 'tg_lang=' + a.dataset.lang + '; path=/; max-age=31536000; SameSite=Lax';
    }));
  </script>
</body>
</html>
