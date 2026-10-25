<?php
// Compte un téléchargement puis redirige vers l'installateur publié sur GitHub.
// download.php?os=windows  ou  download.php?os=mac
require __DIR__ . '/inc/release.php';
require __DIR__ . '/inc/db.php';

$os = ($_GET['os'] ?? '') === 'mac' ? 'mac' : 'windows';
$release = tg_latest_release();

// Les robots (moteurs de recherche, aperçus de liens) ne comptent pas
$agent = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
if ($agent !== '' && !preg_match('/bot|crawl|spider|preview|slurp|facebookexternalhit/', $agent)) {
    tg_count_download($os);
}

header('Location: ' . $release[$os], true, 302);
exit;
