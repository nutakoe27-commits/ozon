<?php
declare(strict_types=1);

/**
 * index.php — точка входа
 *
 * Маршруты:
 *   GET  /              → dashboard.html  (требует авторизации)
 *   GET  /login         → login.html
 *   POST /login         → AuthController::loginSubmit
 *   POST /register      → AuthController::register
 *   POST /logout        → AuthController::logout
 *   GET  /api/stores              → DashboardController::getStores
 *   POST /api/dashboard/refresh   → DashboardController::refresh
 */

// ── Автозагрузка ──────────────────────────────────────────────────────────────
spl_autoload_register(function (string $class): void {
    $prefix = 'Ozon\\';
    if (str_starts_with($class, $prefix)) {
        $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
        $file = __DIR__ . '/src/' . $relative . '.php';
        if (file_exists($file)) require_once $file;
    }
});

// ── Сессия ────────────────────────────────────────────────────────────────────
session_start();
$userId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;

// ── Роутинг ───────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$path   = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path   = rtrim($path, '/') ?: '/';

// ── Авторизация ───────────────────────────────────────────────────────────────
if (in_array($path, ['/login'], true) || in_array($path, ['/login', '/register'], true)) {
    $pdo      = require __DIR__ . '/config/db.php';
    $userRepo = new \Ozon\UserRepository($pdo);
    $auth     = new \Ozon\Controller\AuthController($userRepo);

    if ($path === '/login' && $method === 'GET')    { $auth->loginPage();    exit; }
    if ($path === '/login' && $method === 'POST')   { $auth->loginSubmit();  exit; }
    if ($path === '/register' && $method === 'POST'){ $auth->register();     exit; }
}

if ($path === '/logout' && $method === 'POST') {
    $pdo      = require __DIR__ . '/config/db.php';
    $userRepo = new \Ozon\UserRepository($pdo);
    $auth     = new \Ozon\Controller\AuthController($userRepo);
    $auth->logout();
    exit;
}

// ── Защищённые маршруты (требуют сессии) ──────────────────────────────────────
if ($userId === null) {
    // API → 401 JSON
    if (str_starts_with($path, '/api/')) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    // Всё остальное → редирект на логин
    header('Location: /login');
    exit;
}

// ── Dashboard (главная) ───────────────────────────────────────────────────────
if ($path === '/' && $method === 'GET') {
    readfile(__DIR__ . '/dashboard.html');
    exit;
}

// ── API маршруты ──────────────────────────────────────────────────────────────
if (str_starts_with($path, '/api/')) {
    $pdo        = require __DIR__ . '/config/db.php';
    $storeRepo  = new \Ozon\StoreRepository($pdo);
    $controller = new \Ozon\Controller\DashboardController($storeRepo);

    if ($path === '/api/stores' && $method === 'GET') {
        $controller->getStores($userId);
        exit;
    }
    if ($path === '/api/dashboard/refresh' && $method === 'POST') {
        $controller->refresh($userId);
        exit;
    }

    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
    exit;
}

http_response_code(404);
echo '404';
