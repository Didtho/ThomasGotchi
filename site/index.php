<?php
require __DIR__ . '/inc/release.php';
require __DIR__ . '/inc/i18n.php';
require __DIR__ . '/inc/db.php';

date_default_timezone_set('Europe/Paris');
// La page change avec chaque version et le compteur : le navigateur doit la redemander à chaque visite
header('Cache-Control: no-cache, must-revalidate');
define('TG_CURRENT', tg_lang());
$root = TG_CURRENT === 'fr' ? '' : '../'; // chemin vers les images et la feuille de style
$release = tg_latest_release();
$downloads = tg_download_total();
$h = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

// Animaux et chiffres repris de l'application (générés par « npm run site-assets »)
$app = json_decode((string) @file_get_contents(__DIR__ . '/data/app.json'), true) ?: ['species' => [], 'coats' => 0];
$animals = array_column($app['species'], 'name', 'id');
$colors = array_column($app['species'], 'color', 'id');
$traits = $app['traits'][TG_CURRENT] ?? $app['traits']['fr'] ?? []; // caractère de chaque espèce, déjà traduit

$features = [
    ['🍽️', 'Il mange tes fichiers', 'Glisse une image, un PDF ou une vidéo sur lui : il se régale. Rassure-toi, tes fichiers ne sont jamais effacés.'],
    ['💖', 'Prends soin de lui', 'Faim, soif, sommeil, propreté, câlins… Ses besoins se lisent sur son visage. Sans soins, il tombe malade.'],
    ['🐾', 'Il vit sa vie', 'Il se promène, passe d\'un écran à l\'autre et grimpe sur tes fenêtres : si tu les fermes, il tombe ! Il fait même ses besoins sur le bureau.'],
    ['🎾', 'Jeux et tours', 'Attrape les friandises, jeu des gobelets, pelote de laine… des tours qu\'il apprend petit à petit, et des trophées à gagner.'],
    ['🎃', 'Fêtes et météo', 'Halloween, Noël et sa soirée magique, Nouvel An, Chandeleur, Pâques, fêtes des mamans et des papas… et la vraie météo de ta ville, avec parapluie et écharpe.'],
    ['💞', 'Plusieurs compagnons', 'Jusqu\'à 5 animaux qui deviennent amis et jouent ensemble… et qui peuvent même rendre visite aux animaux de tes proches, sur leur ordinateur !'],
    ['🗣️', 'Il te parle', 'Il dit ton prénom à voix haute, te souhaite ton anniversaire, te conseille une pause quand tu travailles trop et fait la fête quand tu reviens.'],
    ['🎁', 'Gratuit, sans pub', 'Pas de compte, pas de publicité. Il fonctionne même sans connexion (sauf la météo).'],
];

// Les trois chats de la maison, modèles de pelage dans l'application
$houseCats = [
    ['simba', 'Simba', 'Le roux de la maison : pelage orange rayé et bouille ronde.'],
    ['snoop', 'Snoop', 'Une tigrée grise aux rayures bien dessinées.'],
    ['grisette', 'Grisette', 'Noire et blanche, avec son petit masque.'],
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
    ['Comment mon animal peut-il rendre visite à un ami ?', 'Dans ses réglages, onglet « Amis », tu trouves ton code ami. Donne-le à un proche : il le tape chez lui, et tu acceptes sa demande. Quand vos deux applications sont ouvertes, vos animaux se rendent visite une ou deux fois par jour, ou quand tu cliques sur 🚪 : le tien quitte ton écran, apparaît chez ton ami, joue avec ses animaux puis revient. Ton ami peut même lui donner un fichier à manger : il rentre rassasié !'],
    ['Les fichiers que je lui donne à manger sont-ils supprimés ?', 'Non, jamais. Il regarde seulement leur nom et leur taille pour savoir ce qu\'il mange. Le fichier reste exactement là où il était.'],
    ['Que devient-il quand l\'ordinateur est éteint ?', 'Le temps continue de passer : pense à t\'occuper de lui ! Pour partir en vacances, active la « pause vacances » : il ne vieillit pas et n\'a ni faim ni soif.'],
    ['Il prend beaucoup de place ou de ressources ?', 'Non : il reste discret, les clics passent à travers lui, il se cache tout seul quand une application passe en plein écran (présentation, vidéo, jeu), et Ctrl+Alt+T (Cmd+Option+T sur Mac) le cache ou le fait revenir d\'un coup.'],
    ['Mes données sont-elles envoyées quelque part ?', 'Non. Ton animal est sauvegardé uniquement sur ton ordinateur. Seule la météo interroge un service public (avec le nom de ta ville), et l\'application vérifie s\'il existe une nouvelle version.'],
    ['Comment le donner à quelqu\'un ou le changer d\'ordinateur ?', 'Dans ses réglages, « Exporter » crée un petit fichier. Sur l\'autre ordinateur, « Importer un animal » dans le menu de l\'icône le fait revivre.'],
    ['Dans quelles langues existe-t-il ?', 'En français, anglais, espagnol et italien. Il choisit tout seul la langue de ton ordinateur, et tu peux la changer dans ses réglages.'],
];

// Adresse d'un fichier du site avec sa date de modification (?v=…) : le navigateur recharge toujours la dernière version
$asset = fn(string $file): string => $root . $file . '?v=' . (@filemtime(__DIR__ . '/' . $file) ?: '0');

$langUrl = fn(string $code): string => ($code === 'fr' ? ($root ?: './') : $root . $code . '/');

// Référencement : adresses complètes du site en ligne, description et fiche lue par les moteurs de recherche
const TG_SITE_URL = 'https://thomasgotchi.mirimix.fr/';
const TG_DONATE = 'https://www.paypal.com/donate/?hosted_button_id=63HDAV7NYT3QC'; // bouton de don PayPal de DidTech
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
  <link rel="stylesheet" href="<?= $asset('style.css') ?>">
</head>
<body>
  <div class="fete-banner" hidden></div>
  <header class="top">
    <a class="brand" href="<?= $h($langUrl(TG_CURRENT)) ?>"><img src="<?= $asset('img/icon.png') ?>" alt="" width="40" height="40"> ThomasGotchi</a>
    <nav>
      <a href="#fonctions"><?= $h(tt('Fonctions')) ?></a>
      <a href="#essayer"><?= $h(tt('Essayer')) ?></a>
      <a href="#animaux"><?= $h(tt('Animaux')) ?></a>
      <a href="#installer"><?= $h(tt('Installer')) ?></a>
      <a href="#faq"><?= $h(tt('Questions')) ?></a>
    </nav>
    <div class="langs">
      <?php foreach (TG_LANGS as $code => $label): ?>
        <a href="<?= $h($langUrl($code)) ?>" data-lang="<?= $code ?>" title="<?= $h($label) ?>"<?= $code === TG_CURRENT ? ' class="on"' : '' ?>><?= strtoupper($code) ?></a>
      <?php endforeach; ?>
    </div>
    <!-- Petite pièce dessinée (même trait que les animaux) qui mène à « Soutenir » -->
    <a class="coin" href="#soutenir" title="<?= $h(tt('Soutenir le projet')) ?>" aria-label="<?= $h(tt('Soutenir le projet')) ?>">
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
        <ellipse cx="24" cy="44" rx="13" ry="2.5" fill="rgba(0,0,0,.15)"/>
        <circle cx="24" cy="22" r="19" fill="#f2b632" stroke="#3b2a3a" stroke-width="2.5"/>
        <circle cx="24" cy="22" r="14" fill="#ffd84a" stroke="#d99a1e" stroke-width="2"/>
        <path d="M29.5 15.5a8 8 0 1 0 0 13" fill="none" stroke="#3b2a3a" stroke-width="3" stroke-linecap="round"/>
        <path d="M16.5 20h10M16.5 24.5h9" stroke="#3b2a3a" stroke-width="2.6" stroke-linecap="round"/>
        <ellipse cx="16.5" cy="11.5" rx="4" ry="2.2" fill="#fff" opacity=".75" transform="rotate(-30 16.5 11.5)"/>
      </svg>
    </a>
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
      <p class="install-hint"><?= tt('Sur Mac, une petite manipulation est nécessaire la première fois : <a href="#installer">voir comment</a>.') ?></p>
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
          <img class="pet p1" src="<?= $asset('img/chat-simba.png') ?>" alt="" data-species="chat" data-color="simba">
          <img class="pet p2" src="<?= $asset('img/chat-snoop.png') ?>" alt="" data-species="chat" data-color="snoop">
          <img class="pet p3" src="<?= $asset('img/chat-grisette.png') ?>" alt="" data-species="chat" data-color="grisette">
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

  <section class="section" id="essayer">
    <h2><?= $h(tt('Essaie-le tout de suite !')) ?></h2>
    <p class="section-lead"><?= $h(tt('Glisse un fichier sur lui pour le nourrir (il ne quitte pas ton ordinateur), clique sur lui pour un câlin, et regarde ses jauges.')) ?></p>
    <div class="demo">
      <div class="demo-stage" id="demo-stage">
        <canvas id="demo-canvas" aria-label="<?= $h(tt('Ton compagnon')) ?>"></canvas>
        <div class="demo-bubble" hidden></div>
      </div>
      <div class="demo-side">
        <?php foreach ([['hunger', '🍔', 'Faim'], ['thirst', '💧', 'Soif'], ['fun', '💖', 'Bonheur'], ['clean', '🛁', 'Propreté']] as [$k, $icon, $label]): ?>
          <div class="demo-stat" title="<?= $h(tt($label)) ?>"><span><?= $icon ?></span><div class="bar"><i id="demo-<?= $k ?>"></i></div></div>
        <?php endforeach; ?>
        <div class="demo-actions">
          <button class="btn small" data-demo="feed">🍔 <?= $h(tt('Un fichier')) ?></button>
          <button class="btn small alt" data-demo="drink">💧 <?= $h(tt('À boire')) ?></button>
          <button class="btn small alt" data-demo="play">🎾 <?= $h(tt('Jouer')) ?></button>
          <button class="btn small alt" data-demo="wash">🛁 <?= $h(tt('Laver')) ?></button>
        </div>
        <input type="file" id="demo-file" multiple hidden>
      </div>
    </div>
  </section>

  <section class="section tinted" id="animaux">
    <h2><?= $h(tt('Choisis ton compagnon')) ?></h2>
    <p class="section-lead"><?= $h(tt('{n} animaux, chacun avec son caractère, {c} pelages, un style mignon ou pixel rétro, et des accessoires à gagner.', ['n' => count($animals), 'c' => (int) $app['coats']])) ?></p>
    <p class="section-hint"><?= $h(tt('Clique sur un animal pour l\'entendre 🔊')) ?></p>
    <div class="animals">
      <?php foreach ($animals as $id => $name): $trait = $traits[$id] ?? null; ?>
        <figure class="animal" data-species="<?= $h($id) ?>" data-color="<?= $h($colors[$id] ?? '') ?>" tabindex="0"<?= $trait ? ' title="' . $h($trait['desc']) . '"' : '' ?>>
          <img src="<?= $h($asset('img/animal-' . $id . '.png')) ?>" alt="<?= $h(tt($name)) ?>" loading="lazy">
          <figcaption><?= $h(tt($name)) ?><?php if ($trait): ?><small><?= $h($trait['icon'] . ' ' . $trait['name']) ?></small><?php endif; ?></figcaption>
        </figure>
      <?php endforeach; ?>
    </div>
    <h3 class="house-title"><?= $h(tt('Les chats de la maison')) ?></h3>
    <p class="section-lead"><?= $h(tt('Trois modèles dessinés d\'après les vrais chats du créateur. Choisis leur pelage dans les réglages pour adopter le même !')) ?></p>
    <div class="house-cats">
      <?php foreach ($houseCats as [$id, $name, $text]): ?>
        <article class="house-cat">
          <img src="<?= $asset('img/chat-' . $id . '.png') ?>" alt="<?= $h($name) ?>" loading="lazy">
          <h4><?= $h($name) ?></h4>
          <p><?= $h(tt($text)) ?></p>
        </article>
      <?php endforeach; ?>
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
      <article class="install-card" data-os="windows">
        <h3>⊞ Windows</h3>
        <ol>
          <li><?= tt('Télécharge le fichier <strong>.exe</strong> ci-dessus.') ?></li>
          <li><?= tt('Lance-le et suis l\'installation. Windows peut afficher un avertissement : clique sur <em>Informations complémentaires</em> puis <em>Exécuter quand même</em>.') ?></li>
          <li><?= tt('Ton œuf apparaît en bas de l\'écran : choisis son prénom, son animal et sa couleur !') ?></li>
        </ol>
        <p class="note"><?= $h(tt('Les nouvelles versions s\'installent ensuite toutes seules.')) ?></p>
      </article>
      <article class="install-card" data-os="mac">
        <h3>🍎 Mac</h3>
        <ol>
          <li><?= tt('Télécharge le fichier <strong>.dmg</strong> et ouvre-le.') ?></li>
          <li><?= tt('Glisse ThomasGotchi dans le dossier <strong>Applications</strong>.') ?></li>
          <li><?= tt('Ouvre-la une première fois : macOS affiche un avertissement et refuse de la lancer. C\'est normal, voir l\'encadré ci-dessous.') ?></li>
        </ol>
        <p class="note"><?= $h(tt('L\'application te prévient quand une nouvelle version est disponible.')) ?></p>
      </article>
    </div>
    <!-- Avertissement de macOS (Gatekeeper) : l'application n'est pas signée par Apple -->
    <div class="mac-warning">
      <h3><?= $h(tt('⚠️ L\'avertissement de macOS')) ?></h3>
      <p><?= $h(tt('ThomasGotchi n\'est pas signé par Apple, car cela demande un abonnement payant. L\'application n\'est pas dangereuse : macOS ne la connaît simplement pas. Pour l\'autoriser, une seule fois :')) ?></p>
      <ol>
        <li><?= tt('Ouvre <strong>Réglages Système</strong> → <strong>Confidentialité et sécurité</strong>.') ?></li>
        <li><?= tt('Descends jusqu\'au message sur ThomasGotchi, clique sur <em>Ouvrir quand même</em> et confirme avec ton mot de passe.') ?></li>
      </ol>
      <p><?= tt('Autre solution, valable aussi si macOS dit que l\'application est « endommagée » : ouvre le <strong>Terminal</strong> et tape cette commande, qui retire le blocage.') ?></p>
      <code>xattr -cr /Applications/ThomasGotchi.app</code>
      <p class="note"><?= $h(tt('À refaire après chaque nouvelle version téléchargée.')) ?></p>
    </div>
  </section>

  <?php if (!empty($app['changelog'])): ?>
  <section class="section tinted" id="nouveautes">
    <h2><?= $h(tt('Nouveautés')) ?></h2>
    <p class="section-lead"><?= $h(tt('L\'application s\'améliore souvent, et se met à jour toute seule.')) ?><?php if (TG_CURRENT !== 'fr'): ?> <em><?= $h(tt('(Notes de version en français.)')) ?></em><?php endif; ?></p>
    <div class="changelog">
      <?php foreach ($app['changelog'] as $i => $v): ?>
        <?php if ($i === 5): ?><details class="older"><summary><?= $h(tt('Versions précédentes')) ?></summary><?php endif; ?>
        <article class="release" lang="fr">
          <h3><?= $h(tt('Version {v}', ['v' => $v['version']])) ?> <time datetime="<?= $h($v['date']) ?>"><?= $h(date('d/m/Y', strtotime($v['date']))) ?></time></h3>
          <ul>
            <?php foreach ($v['items'] as $item): ?><li><?= $h($item) ?></li><?php endforeach; ?>
          </ul>
        </article>
      <?php endforeach; ?>
      <?php if (count($app['changelog']) > 5): ?></details><?php endif; ?>
    </div>
  </section>
  <?php endif; ?>

  <!-- Soutenir le projet : don PayPal (même principe que sur jukebox-cab.fr) -->
  <section class="section soutien" id="soutenir">
    <div class="soutien-card">
      <h2><?= $h(tt('Un projet gratuit, fait avec le cœur 💖')) ?></h2>
      <p><?= $h(tt('ThomasGotchi est gratuit, sans publicité, et le restera. Si ton compagnon te fait sourire, tu peux soutenir son développement : cela aide à ajouter des animaux, des fêtes et des surprises, et à garder le projet vivant.')) ?></p>
      <a class="btn" href="<?= $h(TG_DONATE) ?>" target="_blank" rel="noopener"><?= $h(tt('Faire un don avec PayPal')) ?></a>
      <p class="soutien-merci"><?= $h(tt('Merci à celles et ceux qui l\'ont déjà fait !')) ?></p>
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
    <p><?= $h(tt('ThomasGotchi · une création')) ?> <a href="https://www.didtech.fr/">DidTech</a> · <a href="https://github.com/<?= $h(TG_REPO) ?>"><?= $h(tt('code source')) ?></a> · <a href="#soutenir"><?= $h(tt('Soutenir')) ?></a> · <a href="<?= $root ?>mentions-legales.php"><?= $h(tt('Mentions légales')) ?></a></p>
  </footer>

  <!-- Moteur de dessin et bruitages de l'application : animaux animés et cris dans la liste des animaux -->
  <?php foreach (['i18n', 'pet', 'draw', 'species', 'sound', 'seasons'] as $f): ?>
    <script src="<?= $asset("engine/$f.js") ?>"></script>
  <?php endforeach; ?>
  <?php if (TG_CURRENT !== 'fr'): ?>
    <script src="<?= $asset('engine/locales/' . TG_CURRENT . '.js') ?>"></script>
  <?php endif; ?>
  <script src="<?= $asset('animals.js') ?>"></script>
  <script src="<?= $asset('demo.js') ?>"></script>
  <script>
    // Met en avant le bouton correspondant à l'ordinateur du visiteur
    const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
    const first = document.querySelector(`.downloads [data-os="${isMac ? 'mac' : 'windows'}"]`);
    if (first) {
      first.classList.remove('alt');
      first.parentNode.prepend(first);
      document.querySelectorAll('.downloads .btn').forEach((b) => { if (b !== first) b.classList.add('alt'); });
    }
    // Après un clic sur « Télécharger », le téléchargement démarre et la page descend jusqu'aux conseils
    // d'installation du bon système (sur Mac : l'encadré pour passer l'avertissement d'Apple)
    document.querySelectorAll('.downloads [data-os]').forEach((btn) => btn.addEventListener('click', () => {
      const os = btn.dataset.os;
      const target = os === 'mac' ? document.querySelector('.mac-warning') : document.querySelector('.install-card[data-os="windows"]');
      setTimeout(() => {
        document.querySelector('#installer').scrollIntoView({ behavior: 'smooth' });
        document.querySelectorAll('.install-card, .mac-warning').forEach((el) => el.classList.remove('highlight'));
        document.querySelector(`.install-card[data-os="${os}"]`).classList.add('highlight');
        if (target) target.classList.add('highlight');
      }, 400);
    }));
    // Le choix de langue est retenu (on ne redirige plus selon le navigateur)
    document.querySelectorAll('.langs a').forEach((a) => a.addEventListener('click', () => {
      document.cookie = 'tg_lang=' + a.dataset.lang + '; path=/; max-age=31536000; SameSite=Lax';
    }));
  </script>
</body>
</html>
