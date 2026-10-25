<?php
// Base de données (compteur de téléchargements). Les accès sont dans inc/config.local.php,
// absent de GitHub : créé par scripts/deploy-site.js sur le serveur, à la main sur WAMP.
// Sans base disponible, le site fonctionne quand même (le compteur est simplement désactivé).

function tg_db(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    $pdo = null;
    $file = __DIR__ . '/config.local.php';
    if (!is_file($file)) {
        return null;
    }
    $c = require $file;
    try {
        $pdo = new PDO('mysql:host=' . $c['host'] . ';dbname=' . $c['name'] . ';charset=utf8mb4', $c['user'], $c['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 3,
        ]);
        // Un compteur par jour et par système
        $pdo->exec('CREATE TABLE IF NOT EXISTS downloads (
            day DATE NOT NULL,
            os VARCHAR(10) NOT NULL,
            count INT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (day, os)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    } catch (Throwable $e) {
        $pdo = null;
    }
    return $pdo;
}

function tg_count_download(string $os): void
{
    $db = tg_db();
    if (!$db) {
        return;
    }
    try {
        $db->prepare('INSERT INTO downloads (day, os, count) VALUES (CURDATE(), ?, 1) ON DUPLICATE KEY UPDATE count = count + 1')
            ->execute([$os]);
    } catch (Throwable $e) {
        // Le téléchargement passe avant le comptage
    }
}

function tg_download_total(): int
{
    $db = tg_db();
    if (!$db) {
        return 0;
    }
    try {
        return (int) $db->query('SELECT COALESCE(SUM(count), 0) FROM downloads')->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}
