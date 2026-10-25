<?php
// Plan du site pour les moteurs de recherche (annoncé dans robots.txt) :
// une adresse par langue, chacune avec ses traductions
require __DIR__ . '/inc/i18n.php';

const TG_SITE_URL = 'https://thomasgotchi.mirimix.fr/';
$url = fn(string $code): string => TG_SITE_URL . ($code === 'fr' ? '' : $code . '/');
$updated = date('Y-m-d', (int) @filemtime(__DIR__ . '/index.php'));

header('Content-Type: application/xml; charset=utf-8');
echo '<?xml version="1.0" encoding="UTF-8"?>', "\n";
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<?php foreach (TG_LANGS as $code => $label): ?>
  <url>
    <loc><?= $url($code) ?></loc>
    <lastmod><?= $updated ?></lastmod>
<?php foreach (TG_LANGS as $alt => $altLabel): ?>
    <xhtml:link rel="alternate" hreflang="<?= $alt ?>" href="<?= $url($alt) ?>"/>
<?php endforeach; ?>
    <xhtml:link rel="alternate" hreflang="x-default" href="<?= TG_SITE_URL ?>"/>
  </url>
<?php endforeach; ?>
</urlset>
