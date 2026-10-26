<?php
// Base de données (compteur de téléchargements). Les accès sont dans inc/config.local.php,
// absent de GitHub : créé par scripts/deploy-site.js sur le serveur, à la main sur WAMP.
// Sans base disponible, le site fonctionne quand même (le compteur est simplement désactivé).

// Réglages locaux (base de données, clé itch.io), lus une seule fois
function tg_config(): array
{
    static $c = null;
    if ($c === null) {
        $file = __DIR__ . '/config.local.php';
        $c = is_file($file) ? (array) require $file : [];
    }
    return $c;
}

function tg_db(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    $pdo = null;
    $c = tg_config();
    if (empty($c['host'])) {
        return null;
    }
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
    $total = 0;
    if ($db) {
        try {
            $total = (int) $db->query('SELECT COALESCE(SUM(count), 0) FROM downloads')->fetchColumn();
        } catch (Throwable $e) {
            $total = 0;
        }
    }
    return $total + tg_itch_downloads();
}

// Téléchargements faits depuis la page itch.io (https://didtech.itch.io/thomasgotchi), demandés à itch.io
// au plus une fois par heure (cache/itch.json). Sans clé dans config.local.php : 0.
function tg_itch_downloads(): int
{
    $key = tg_config()['itchKey'] ?? '';
    if ($key === '') {
        return 0;
    }
    $cacheFile = __DIR__ . '/../cache/itch.json';
    $cached = is_file($cacheFile) ? json_decode((string) file_get_contents($cacheFile), true) : null;
    if ($cached && time() - filemtime($cacheFile) < 3600) {
        return (int) ($cached['downloads'] ?? 0);
    }
    $context = stream_context_create(['http' => ['header' => "User-Agent: ThomasGotchi-site\r\n", 'timeout' => 4]]);
    $json = @file_get_contents('https://itch.io/api/1/' . rawurlencode($key) . '/my-games', false, $context);
    $data = $json ? json_decode($json, true) : null;
    if (!is_array($data) || !isset($data['games'])) {
        // itch.io injoignable : on garde l'ancien chiffre (et on réessaiera dans une heure)
        $old = (int) ($cached['downloads'] ?? 0);
        @file_put_contents($cacheFile, json_encode(['downloads' => $old]));
        return $old;
    }
    $n = 0;
    foreach ($data['games'] as $g) {
        if (str_contains((string) ($g['url'] ?? ''), 'thomasgotchi')) {
            $n += (int) ($g['downloads_count'] ?? 0);
        }
    }
    @file_put_contents($cacheFile, json_encode(['downloads' => $n]));
    return $n;
}
