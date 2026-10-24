<?php
// Vérifie que toutes les phrases du site sont traduites.
// Usage : php scripts/site-i18n-check.php en   (puis es, it)
$lang = $argv[1] ?? 'en';
define('TG_LANG', $lang);
$GLOBALS['tg_missing'] = [];
ob_start();
require __DIR__ . '/../site/index.php';
ob_end_clean();
$missing = array_keys($GLOBALS['tg_missing']);
echo $lang . ' : ' . (count($missing) ? count($missing) . ' phrase(s) sans traduction' : 'tout est traduit') . PHP_EOL;
foreach ($missing as $m) {
    echo '   manque : ' . $m . PHP_EOL;
}
