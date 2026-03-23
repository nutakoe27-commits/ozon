<?php
declare(strict_types=1);

/**
 * Возвращает PDO для MySQL (по env) и автоматически падает на SQLite,
 * если MySQL недоступен. Это позволяет приложению запускаться "из коробки".
 */
$dbHost = getenv('DB_HOST') ?: '127.0.0.1';
$dbPort = getenv('DB_PORT') ?: '3306';
$dbName = getenv('DB_NAME') ?: 'ozon_dashboard';
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASSWORD') ?: '';

$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $mysqlDsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $dbHost, $dbPort, $dbName);
    $pdo = new PDO($mysqlDsn, $dbUser, $dbPass, $options);
} catch (Throwable $e) {
    $sqlitePath = __DIR__ . '/../storage/data/app.sqlite';
    $pdo = new PDO('sqlite:' . $sqlitePath, null, null, $options);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    ');
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            performance_client_id TEXT NOT NULL,
            performance_client_secret TEXT NOT NULL,
            seller_client_id TEXT NOT NULL,
            seller_api_key TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ');
}

return $pdo;
