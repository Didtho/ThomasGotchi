<?php
// Visites entre ordinateurs : codes amis, amitiés acceptées des deux côtés, et visites d'un animal chez un ami.
// L'application appelle ce fichier en POST avec du JSON ({ action, secret, … }).
// Seuls passent : le prénom du maître et l'apparence de l'animal. Pas de messages libres.
require __DIR__ . '/../inc/db.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

$db = tg_db();
if (!$db || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    out(['error' => 'indisponible'], 503);
}
$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) {
    out(['error' => 'requête'], 400);
}

$db->exec('CREATE TABLE IF NOT EXISTS tg_players (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code CHAR(9) NOT NULL UNIQUE,
    secret CHAR(64) NOT NULL UNIQUE,
    owner VARCHAR(20) NOT NULL DEFAULT \'\',
    pet TEXT,
    open TINYINT NOT NULL DEFAULT 1,
    last_seen DATETIME NOT NULL,
    created DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
$db->exec('CREATE TABLE IF NOT EXISTS tg_friends (
    a INT UNSIGNED NOT NULL,
    b INT UNSIGNED NOT NULL,
    accepted TINYINT NOT NULL DEFAULT 0,
    created DATETIME NOT NULL,
    PRIMARY KEY (a, b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
$db->exec('CREATE TABLE IF NOT EXISTS tg_visits (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guest INT UNSIGNED NOT NULL,
    host INT UNSIGNED NOT NULL,
    pet TEXT,
    owner VARCHAR(20) NOT NULL DEFAULT \'\',
    state VARCHAR(8) NOT NULL,
    played VARCHAR(40) NOT NULL DEFAULT \'\',
    updated DATETIME NOT NULL,
    KEY (host, state),
    KEY (guest, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

const ONLINE = 90; // secondes : au-delà, l'application de l'ami est considérée comme fermée

// Textes et apparence de l'animal : seulement des champs connus, raccourcis
function clean(string $s, int $max): string
{
    return mb_substr(trim(strip_tags($s)), 0, $max);
}
function cleanPet($pet): string
{
    $pet = is_array($pet) ? $pet : [];
    $word = fn($v, $max) => preg_match('/^[#a-z0-9]{1,' . $max . '}$/i', (string) $v) ? (string) $v : '';
    return json_encode([
        'name' => clean((string) ($pet['name'] ?? ''), 14),
        'species' => $word($pet['species'] ?? 'chat', 12) ?: 'chat',
        'color' => $word($pet['color'] ?? 'rose', 20) ?: 'rose',
        'gender' => ($pet['gender'] ?? 'm') === 'f' ? 'f' : 'm',
        'accessory' => $word($pet['accessory'] ?? '', 12),
        'style' => ($pet['style'] ?? '') === 'pixel' ? 'pixel' : 'cute',
    ], JSON_UNESCAPED_UNICODE);
}
function me(PDO $db, array $in): array
{
    $st = $db->prepare('SELECT * FROM tg_players WHERE secret = ?');
    $st->execute([hash('sha256', (string) ($in['secret'] ?? ''))]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        out(['error' => 'inconnu'], 403);
    }
    return $row;
}
function byCode(PDO $db, string $code): ?array
{
    $st = $db->prepare('SELECT * FROM tg_players WHERE code = ?');
    $st->execute([strtoupper(trim($code))]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}
// Lien d'amitié entre deux joueurs, dans un sens ou dans l'autre
function friendLink(PDO $db, int $x, int $y): ?array
{
    $st = $db->prepare('SELECT * FROM tg_friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)');
    $st->execute([$x, $y, $y, $x]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

switch ((string) ($in['action'] ?? '')) {
    // Nouvelle installation : un code ami à partager et un secret gardé par l'application
    case 'register':
        $letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans les caractères faciles à confondre (0/O, 1/I)
        for ($try = 0; $try < 5; $try++) {
            $code = '';
            for ($i = 0; $i < 8; $i++) {
                $code .= $letters[random_int(0, strlen($letters) - 1)] . ($i === 3 ? '-' : '');
            }
            $secret = bin2hex(random_bytes(16));
            try {
                $db->prepare('INSERT INTO tg_players (code, secret, last_seen, created) VALUES (?, ?, NOW(), NOW())')
                    ->execute([$code, hash('sha256', $secret)]);
                out(['code' => $code, 'secret' => $secret]);
            } catch (Throwable $e) {
                // code déjà pris : on en tire un autre
            }
        }
        out(['error' => 'code'], 500);

    // Toutes les 30 s : on donne de ses nouvelles et on reçoit amis, visiteurs et retours de visite
    case 'sync':
        $me = me($db, $in);
        $db->prepare('UPDATE tg_players SET owner = ?, pet = ?, open = ?, last_seen = NOW() WHERE id = ?')
            ->execute([clean((string) ($in['owner'] ?? ''), 16), cleanPet($in['pet'] ?? []), empty($in['open']) ? 0 : 1, $me['id']]);
        // Visite jamais arrivée (ami parti entre-temps) ou trop longue : l'animal rentre
        $db->exec("UPDATE tg_visits SET state = 'back', updated = NOW() WHERE state = 'going' AND updated < NOW() - INTERVAL 2 MINUTE");
        $db->exec("UPDATE tg_visits SET state = 'back', updated = NOW() WHERE state = 'here' AND updated < NOW() - INTERVAL 20 MINUTE");
        $st = $db->prepare('SELECT f.a, f.b, f.accepted, p.code, p.owner, p.pet, p.open,
            (p.last_seen > NOW() - INTERVAL ' . ONLINE . ' SECOND) AS online
            FROM tg_friends f JOIN tg_players p ON p.id = IF(f.a = ?, f.b, f.a) WHERE f.a = ? OR f.b = ?');
        $st->execute([$me['id'], $me['id'], $me['id']]);
        $friends = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $f) {
            $friends[] = [
                'code' => $f['code'], 'owner' => $f['owner'], 'pet' => json_decode((string) $f['pet'], true),
                'online' => (bool) $f['online'] && (bool) $f['open'],
                'status' => $f['accepted'] ? 'ok' : ((int) $f['a'] === (int) $me['id'] ? 'sent' : 'received'),
            ];
        }
        $visits = fn(string $sql) => (function () use ($db, $sql, $me) {
            $q = $db->prepare($sql);
            $q->execute([$me['id']]);
            return $q->fetchAll(PDO::FETCH_ASSOC);
        })();
        $incoming = array_map(fn($v) => ['id' => (int) $v['id'], 'owner' => $v['owner'], 'pet' => json_decode((string) $v['pet'], true)],
            $visits("SELECT * FROM tg_visits WHERE host = ? AND state = 'going'"));
        $back = array_map(fn($v) => ['id' => (int) $v['id'], 'played' => $v['played'], 'owner' => $v['hostOwner']],
            $visits("SELECT v.id, v.played, p.owner AS hostOwner FROM tg_visits v JOIN tg_players p ON p.id = v.host WHERE v.guest = ? AND v.state = 'back'"));
        out(['code' => $me['code'], 'friends' => $friends, 'incoming' => $incoming, 'back' => $back]);

    // Demande d'amitié par code ; si l'autre l'avait déjà demandée, l'amitié est acceptée
    case 'friend-add':
        $me = me($db, $in);
        $other = byCode($db, (string) ($in['code'] ?? ''));
        if (!$other) {
            out(['error' => 'code']);
        }
        if ((int) $other['id'] === (int) $me['id']) {
            out(['error' => 'soi']);
        }
        $l = friendLink($db, (int) $me['id'], (int) $other['id']);
        if (!$l) {
            $db->prepare('INSERT INTO tg_friends (a, b, created) VALUES (?, ?, NOW())')->execute([$me['id'], $other['id']]);
            out(['status' => 'sent']);
        }
        if (!$l['accepted'] && (int) $l['b'] === (int) $me['id']) {
            $db->prepare('UPDATE tg_friends SET accepted = 1 WHERE a = ? AND b = ?')->execute([$l['a'], $l['b']]);
            out(['status' => 'ok']);
        }
        out(['status' => $l['accepted'] ? 'ok' : 'sent']);

    case 'friend-accept':
        $me = me($db, $in);
        $other = byCode($db, (string) ($in['code'] ?? ''));
        if ($other) {
            $db->prepare('UPDATE tg_friends SET accepted = 1 WHERE a = ? AND b = ?')->execute([$other['id'], $me['id']]);
        }
        out(['status' => 'ok']);

    // Retirer un ami : le lien et les visites en cours entre les deux disparaissent
    case 'friend-remove':
        $me = me($db, $in);
        $other = byCode($db, (string) ($in['code'] ?? ''));
        if ($other) {
            $db->prepare('DELETE FROM tg_friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)')->execute([$me['id'], $other['id'], $other['id'], $me['id']]);
            $db->prepare('DELETE FROM tg_visits WHERE (guest = ? AND host = ?) OR (guest = ? AND host = ?)')->execute([$me['id'], $other['id'], $other['id'], $me['id']]);
        }
        out(['status' => 'ok']);

    // Départ en visite : seulement chez un ami accepté, dont l'application est ouverte et accepte les visites
    case 'visit-start':
        $me = me($db, $in);
        $other = byCode($db, (string) ($in['code'] ?? ''));
        $l = $other ? friendLink($db, (int) $me['id'], (int) $other['id']) : null;
        if (!$l || !$l['accepted']) {
            out(['error' => 'ami']);
        }
        if (!$other['open'] || strtotime($other['last_seen']) < time() - ONLINE) {
            out(['error' => 'absent']);
        }
        $st = $db->prepare("SELECT COUNT(*) FROM tg_visits WHERE (guest = ? AND state IN ('going', 'here', 'back')) OR (host = ? AND state IN ('going', 'here'))");
        $st->execute([$me['id'], $other['id']]);
        if ($st->fetchColumn() > 0) {
            out(['error' => 'occupe']);
        }
        $db->prepare("INSERT INTO tg_visits (guest, host, pet, owner, state, updated) VALUES (?, ?, ?, ?, 'going', NOW())")
            ->execute([$me['id'], $other['id'], cleanPet($in['pet'] ?? []), clean((string) ($in['owner'] ?? ''), 16)]);
        out(['id' => (int) $db->lastInsertId(), 'owner' => $other['owner']]);

    // Chez l'ami : le visiteur est arrivé, puis repart (avec le prénom de l'animal avec qui il a joué)
    case 'visit-arrived':
        $me = me($db, $in);
        $db->prepare("UPDATE tg_visits SET state = 'here', updated = NOW() WHERE id = ? AND host = ? AND state = 'going'")
            ->execute([(int) ($in['id'] ?? 0), $me['id']]);
        out(['status' => 'ok']);

    case 'visit-end':
        $me = me($db, $in);
        $db->prepare("UPDATE tg_visits SET state = 'back', played = ?, updated = NOW() WHERE id = ? AND host = ? AND state IN ('going', 'here')")
            ->execute([clean((string) ($in['played'] ?? ''), 40), (int) ($in['id'] ?? 0), $me['id']]);
        out(['status' => 'ok']);

    // De retour à la maison
    case 'visit-home':
        $me = me($db, $in);
        $db->prepare("UPDATE tg_visits SET state = 'done', updated = NOW() WHERE id = ? AND guest = ?")
            ->execute([(int) ($in['id'] ?? 0), $me['id']]);
        $db->exec("DELETE FROM tg_visits WHERE state = 'done' AND updated < NOW() - INTERVAL 1 DAY");
        out(['status' => 'ok']);

    // Tout effacer pour cette installation (code, amis, visites)
    case 'forget':
        $me = me($db, $in);
        $db->prepare('DELETE FROM tg_friends WHERE a = ? OR b = ?')->execute([$me['id'], $me['id']]);
        $db->prepare('DELETE FROM tg_visits WHERE guest = ? OR host = ?')->execute([$me['id'], $me['id']]);
        $db->prepare('DELETE FROM tg_players WHERE id = ?')->execute([$me['id']]);
        out(['status' => 'ok']);
}
out(['error' => 'action'], 400);
