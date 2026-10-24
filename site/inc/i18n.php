<?php
// Langues du site. Le français sert de clé : tt('Texte français') renvoie sa traduction
// (fichiers lang/en.php, es.php, it.php), ou le français s'il n'y en a pas.

const TG_LANGS = ['fr' => 'Français', 'en' => 'English', 'es' => 'Español', 'it' => 'Italiano'];

// Langue de la page : imposée par le dossier (/en/, /es/, /it/), sinon français.
// À la racine, un visiteur qui n'a jamais choisi est envoyé vers la langue de son navigateur.
function tg_lang(): string
{
    if (defined('TG_LANG')) {
        return TG_LANG;
    }
    if (empty($_COOKIE['tg_lang'])) {
        $wanted = strtolower(substr($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? 'fr', 0, 2));
        if ($wanted !== 'fr' && isset(TG_LANGS[$wanted])) {
            header('Location: ' . $wanted . '/', true, 302);
            exit;
        }
    }
    return 'fr';
}

function tt(string $text, array $params = []): string
{
    static $dict = null;
    if ($dict === null) {
        $file = __DIR__ . '/../lang/' . TG_CURRENT . '.php';
        $dict = TG_CURRENT !== 'fr' && is_file($file) ? require $file : [];
    }
    if (TG_CURRENT !== 'fr' && !isset($dict[$text])) {
        $GLOBALS['tg_missing'][$text] = true; // relevé par scripts/site-i18n-check.php
    }
    $s = $dict[$text] ?? $text;
    foreach ($params as $k => $v) {
        $s = str_replace('{' . $k . '}', (string) $v, $s);
    }
    return $s;
}
