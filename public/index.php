<?php

declare(strict_types=1);

use Ozon\Adapter\MergeAdapter;
use Ozon\Auth\AuthService;
use Ozon\Config\AppConfig;
use Ozon\Database\Database;
use Ozon\Http\HttpClient;
use Ozon\Pipeline\OzonDashboardPipeline;
use Ozon\Repository\StoreRepository;
use Ozon\Repository\UserRepository;
use Ozon\Service\AnalyticsService;
use Ozon\Service\CampaignService;
use Ozon\Service\PerformanceAuthService;
use Ozon\Service\ProductService;
use Ozon\Service\StatisticsService;

require __DIR__ . '/../src/bootstrap.php';

session_start();

$config = AppConfig::fromEnv();
$pdo = Database::pdo($config->dbHost, $config->dbPort, $config->dbName, $config->dbUser, $config->dbPassword);
$userRepo = new UserRepository($pdo);
$storeRepo = new StoreRepository($pdo);
$auth = new AuthService($userRepo);

$error = null;
$success = null;

$action = isset($_POST['action']) ? $_POST['action'] : null;
if ($action === 'register') {
    list($ok, $msg) = $auth->register(trim((string)$_POST['email']), (string)$_POST['password']);
    if (!$ok) { $error = $msg; } else { $success = 'Регистрация успешна'; }
}
if ($action === 'login') {
    list($ok, $msg) = $auth->login(trim((string)$_POST['email']), (string)$_POST['password']);
    if (!$ok) { $error = $msg; } else { $success = 'Вход выполнен'; }
}
if ($action === 'logout') {
    $auth->logout();
}

$user = $auth->currentUser();

if ($user && $action === 'add_store') {
    $name = trim((string)$_POST['name']);
    if ($name === '') {
        $error = 'Название магазина обязательно';
    } else {
        $storeRepo->create(
            (int)$user['id'],
            $name,
            trim((string)$_POST['performance_client_id']),
            trim((string)$_POST['performance_client_secret']),
            trim((string)$_POST['seller_client_id']),
            trim((string)$_POST['seller_api_key'])
        );
        $success = 'Магазин добавлен';
    }
}

$rows = array();
$stores = $user ? $storeRepo->allByUser((int)$user['id']) : array();
$selectedStoreId = isset($_GET['store_id']) ? (int)$_GET['store_id'] : (isset($_POST['store_id']) ? (int)$_POST['store_id'] : 0);

if ($user && $action === 'load_data' && $selectedStoreId > 0) {
    $store = $storeRepo->findOwnedById((int)$user['id'], $selectedStoreId);
    if ($store === null) {
        $error = 'Магазин не найден';
    } else {
        try {
            $dateFrom = isset($_POST['date_from']) && $_POST['date_from'] !== '' ? $_POST['date_from'] : $config->dateFrom;
            $dateTo = isset($_POST['date_to']) && $_POST['date_to'] !== '' ? $_POST['date_to'] : $config->dateTo;

            $authClient = new HttpClient($config->performanceBaseUrl);
            $authService = new PerformanceAuthService($authClient, $store['performance_client_id'], $store['performance_client_secret']);
            $token = $authService->getAccessToken();

            $performanceClient = new HttpClient($config->performanceBaseUrl, array('Authorization' => 'Bearer ' . $token));
            $sellerClient = new HttpClient($config->sellerBaseUrl, array(
                'Client-Id' => $store['seller_client_id'],
                'Api-Key' => $store['seller_api_key'],
            ));

            $pipeline = new OzonDashboardPipeline(
                new CampaignService($performanceClient),
                new ProductService($performanceClient),
                new StatisticsService($performanceClient),
                new AnalyticsService($sellerClient, $config->analyticsRequestIntervalMs),
                new MergeAdapter()
            );

            $result = $pipeline->run($dateFrom, $dateTo);
            $rows = isset($result['unified']) && is_array($result['unified']) ? $result['unified'] : array();

            $dataDir = __DIR__ . '/../storage/data';
            if (!is_dir($dataDir)) { mkdir($dataDir, 0777, true); }
            $path = $dataDir . '/user_' . (int)$user['id'] . '_store_' . (int)$store['id'] . '.json';
            file_put_contents($path, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $success = 'Данные загружены. Записано в ' . basename($path);
        } catch (Exception $e) {
            $error = $e->getMessage();
        }
    }
}

if ($user && $selectedStoreId > 0 && $rows === array()) {
    $path = __DIR__ . '/../storage/data/user_' . (int)$user['id'] . '_store_' . $selectedStoreId . '.json';
    if (is_file($path)) {
        $payload = json_decode((string)file_get_contents($path), true);
        if (is_array($payload) && isset($payload['unified']) && is_array($payload['unified'])) {
            $rows = $payload['unified'];
        }
    }
}
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ozon Ads Dashboard</title>
<style>
body{font-family:Inter,Arial,sans-serif;background:#0b1220;color:#e7eefb;margin:0}
.wrap{max-width:1200px;margin:0 auto;padding:24px}
.card{background:#121a2b;border:1px solid #25314d;border-radius:14px;padding:18px;margin-bottom:16px}
input,button,select{padding:10px;border-radius:10px;border:1px solid #30405f;background:#0f1727;color:#fff}
button{background:#2563eb;border:none;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.table{overflow:auto}
table{width:100%;border-collapse:collapse}
th,td{padding:10px;border-bottom:1px solid #24314b;white-space:nowrap}
.good{color:#7dd3fc}.err{color:#fca5a5}
a{color:#93c5fd}
</style>
</head>
<body>
<div class="wrap">
  <h1>Ozon Dashboard</h1>
  <?php if ($error): ?><div class="card err"><?= htmlspecialchars($error) ?></div><?php endif; ?>
  <?php if ($success): ?><div class="card good"><?= htmlspecialchars($success) ?></div><?php endif; ?>

  <?php if (!$user): ?>
    <div class="card">
      <h2>Вход</h2>
      <form method="post" class="grid">
        <input type="hidden" name="action" value="login">
        <input name="email" type="email" placeholder="Email" required>
        <input name="password" type="password" placeholder="Пароль" required>
        <button type="submit">Войти</button>
      </form>
    </div>
    <div class="card">
      <h2>Регистрация</h2>
      <form method="post" class="grid">
        <input type="hidden" name="action" value="register">
        <input name="email" type="email" placeholder="Email" required>
        <input name="password" type="password" placeholder="Пароль" required>
        <button type="submit">Создать аккаунт</button>
      </form>
    </div>
  <?php else: ?>
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <div>Вы вошли как <b><?= htmlspecialchars($user['email']) ?></b></div>
        <form method="post"><input type="hidden" name="action" value="logout"><button>Выйти</button></form>
      </div>
    </div>

    <div class="card">
      <h2>Добавить магазин (API ключи через интерфейс)</h2>
      <form method="post" class="grid">
        <input type="hidden" name="action" value="add_store">
        <input name="name" placeholder="Название магазина" required>
        <input name="performance_client_id" placeholder="Performance client_id" required>
        <input name="performance_client_secret" placeholder="Performance client_secret" required>
        <input name="seller_client_id" placeholder="Seller Client-Id" required>
        <input name="seller_api_key" placeholder="Seller Api-Key" required>
        <button type="submit">Сохранить магазин</button>
      </form>
    </div>

    <div class="card">
      <h2>Загрузка данных</h2>
      <form method="post" class="grid">
        <input type="hidden" name="action" value="load_data">
        <select name="store_id" required>
          <option value="">Выберите магазин</option>
          <?php foreach ($stores as $s): ?>
            <option value="<?= (int)$s['id'] ?>" <?= $selectedStoreId === (int)$s['id'] ? 'selected' : '' ?>>
              #<?= (int)$s['id'] ?> <?= htmlspecialchars($s['name']) ?>
            </option>
          <?php endforeach; ?>
        </select>
        <input type="date" name="date_from" value="<?= htmlspecialchars($config->dateFrom) ?>">
        <input type="date" name="date_to" value="<?= htmlspecialchars($config->dateTo) ?>">
        <button type="submit">Обновить дашборд</button>
      </form>
    </div>

    <div class="card table">
      <h2>Дашборд</h2>
      <table>
        <thead><tr><th>SKU</th><th>Дата</th><th>Показы</th><th>Клики</th><th>Расход</th><th>Orders</th><th>Revenue</th><th>CTR</th><th>ROAS</th></tr></thead>
        <tbody>
        <?php foreach ($rows as $r): ?>
          <tr>
            <td><?= htmlspecialchars((string)$r['sku']) ?></td>
            <td><?= htmlspecialchars((string)$r['day']) ?></td>
            <td><?= htmlspecialchars((string)$r['ad']['impressions']) ?></td>
            <td><?= htmlspecialchars((string)$r['ad']['clicks']) ?></td>
            <td><?= htmlspecialchars((string)$r['ad']['spend']) ?></td>
            <td><?= htmlspecialchars((string)$r['ad']['orders']) ?></td>
            <td><?= htmlspecialchars((string)$r['ad']['revenue']) ?></td>
            <td><?= htmlspecialchars((string)$r['computed']['ctr']) ?></td>
            <td><?= htmlspecialchars((string)$r['computed']['roas']) ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php if (count($rows) === 0): ?><p>Пока нет данных. Добавьте магазин и нажмите «Обновить дашборд».</p><?php endif; ?>
    </div>
  <?php endif; ?>
</div>
</body>
</html>
