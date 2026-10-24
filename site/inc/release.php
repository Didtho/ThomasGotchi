<?php
// Dernière version publiée sur GitHub (numéro, liens de téléchargement Windows / Mac).
// Mise en cache une heure dans cache/release.json pour ne pas interroger GitHub à chaque visite.

const TG_REPO = 'Didtho/ThomasGotchi';
const TG_RELEASES = 'https://github.com/' . TG_REPO . '/releases/latest';

function tg_latest_release(): array
{
    $cacheFile = __DIR__ . '/../cache/release.json';
    $cached = is_file($cacheFile) ? json_decode((string) file_get_contents($cacheFile), true) : null;
    if ($cached && time() - filemtime($cacheFile) < 3600) {
        return $cached;
    }

    $context = stream_context_create(['http' => [
        'header' => "User-Agent: ThomasGotchi-site\r\nAccept: application/vnd.github+json\r\n",
        'timeout' => 5,
    ]]);
    $json = @file_get_contents('https://api.github.com/repos/' . TG_REPO . '/releases/latest', false, $context);
    $release = $json ? json_decode($json, true) : null;

    if (!$release || empty($release['tag_name'])) {
        // GitHub injoignable : on garde l'ancienne info si on l'a, sinon on renvoie vers la page des versions
        return $cached ?: ['version' => null, 'date' => null, 'windows' => TG_RELEASES, 'mac' => TG_RELEASES];
    }

    $data = [
        'version' => ltrim($release['tag_name'], 'v'),
        'date' => $release['published_at'] ?? null, // heure universelle, convertie à l'affichage
        'windows' => TG_RELEASES,
        'mac' => TG_RELEASES,
    ];
    foreach ($release['assets'] ?? [] as $asset) {
        $name = $asset['name'] ?? '';
        if (str_ends_with($name, '.exe')) {
            $data['windows'] = $asset['browser_download_url'];
        } elseif (str_ends_with($name, '.dmg')) {
            $data['mac'] = $asset['browser_download_url'];
        }
    }

    if (!is_dir(dirname($cacheFile))) {
        @mkdir(dirname($cacheFile), 0755, true);
    }
    @file_put_contents($cacheFile, json_encode($data));
    return $data;
}
