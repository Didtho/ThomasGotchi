<?php
// Mentions légales (obligatoires en France) et données personnelles. Page en français, quelle que soit la langue.
$h = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
$asset = fn(string $file): string => $file . '?v=' . (@filemtime(__DIR__ . '/' . $file) ?: '0');
header('Cache-Control: no-cache, must-revalidate');
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mentions légales — ThomasGotchi</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="<?= $asset('img/icon.png') ?>">
  <link rel="stylesheet" href="<?= $asset('style.css') ?>">
</head>
<body>
  <header class="top">
    <a class="brand" href="./"><img src="<?= $asset('img/icon.png') ?>" alt="" width="40" height="40"> ThomasGotchi</a>
  </header>

  <main class="section legal">
    <h1>Mentions légales</h1>

    <h2>Éditeur du site</h2>
    <p>
      <strong>DidTech</strong><br>
      SIRET : 102 219 292 00012<br>
      Contact : <a href="mailto:didtech81500@gmail.com">didtech81500@gmail.com</a><br>
      Site : <a href="https://www.didtech.fr/">www.didtech.fr</a>
    </p>
    <p>Directeur de la publication : Didier THOMAS.</p>

    <h2>Hébergement</h2>
    <p>
      <strong>IONOS SARL</strong><br>
      7, place de la Gare, BP 70109, 57201 Sarreguemines Cedex, France<br>
      <a href="https://www.ionos.fr/">www.ionos.fr</a>
    </p>
    <p>Les fichiers d'installation de l'application sont hébergés par GitHub (GitHub, Inc., San Francisco, États-Unis).</p>

    <h2>Données personnelles</h2>
    <p><strong>Sur ce site</strong> : il n'y a ni compte, ni publicité, ni outil de mesure d'audience.</p>
    <ul>
      <li>Le compteur de téléchargements enregistre seulement le nombre de téléchargements par jour et par système (Windows ou Mac). Aucune adresse IP ni aucune donnée personnelle n'est conservée.</li>
      <li>Un petit cookie (<code>tg_lang</code>) retient la langue choisie, pendant un an. Il ne sert à rien d'autre.</li>
      <li>Les polices de caractères (Fredoka et Nunito, sous licence libre SIL Open Font License) sont hébergées sur ce site : aucun service extérieur n'est contacté pour les afficher.</li>
      <li>Les dons passent par PayPal (bouton « Faire un don ») : ce site ne voit et ne garde aucune donnée de paiement.</li>
      <li>La démo jouable fonctionne entièrement dans votre navigateur : les fichiers que vous lui donnez ne sont jamais envoyés, seuls leur nom et leur taille sont lus sur place.</li>
    </ul>
    <p><strong>Dans l'application</strong> : votre animal et vos réglages restent sur votre ordinateur. L'application contacte seulement :</p>
    <ul>
      <li>le service météo public Open-Meteo, avec le nom de la ville indiquée dans les réglages (rien si la ville est vide) ;</li>
      <li>GitHub, pour savoir s'il existe une nouvelle version et la télécharger.</li>
    </ul>
    <p>Les fichiers donnés à manger à l'animal ne sont ni ouverts, ni modifiés, ni supprimés, ni envoyés : seuls leur nom et leur taille sont lus.</p>
    <p><strong>Visites entre amis</strong> (onglet « Amis » des réglages) : rien n'est envoyé tant que cet onglet n'a pas été ouvert. Ensuite, ce site (hébergé par IONOS) enregistre un code ami, le prénom indiqué dans les réglages, l'apparence de l'animal (prénom, espèce, couleur, accessoire), la liste des amis acceptés et l'heure du dernier passage (pour savoir si l'application est ouverte). Les cadeaux et cartes postales envoyés à un ami sont gardés le temps d'être remis (puis effacés après 7 jours) ; le message d'une carte est choisi dans une liste. Il n'y a pas de messages libres entre utilisateurs. Retirer un ami efface votre lien et vos visites ; pour effacer toutes vos données de visites, écrivez à l'adresse ci-dessous.</p>
    <p>Pour toute question sur vos données, ou pour exercer vos droits (accès, rectification, effacement), écrivez à <a href="mailto:didtech81500@gmail.com">didtech81500@gmail.com</a>. Vous pouvez aussi adresser une réclamation à la CNIL (<a href="https://www.cnil.fr/">www.cnil.fr</a>).</p>

    <h2>Propriété intellectuelle</h2>
    <p>ThomasGotchi, ses dessins et ses textes sont une création DidTech. Le code source de l'application est publié sous licence MIT sur <a href="https://github.com/Didtho/ThomasGotchi">GitHub</a>.</p>

    <p class="back"><a href="./">← Retour à l'accueil</a></p>
  </main>

  <footer class="bottom">
    <img src="<?= $asset('img/icon.png') ?>" alt="" width="32" height="32">
    <p>ThomasGotchi · une création <a href="https://www.didtech.fr/">DidTech</a></p>
  </footer>
</body>
</html>
