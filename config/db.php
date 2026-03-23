<?php
// config/db.php — возвращает PDO-соединение
// Замените на свои данные

$dsn  = 'mysql:host=127.0.0.1;dbname=megotim4ya_123;charset=utf8mb4';
$user = 'megotim4ya_123';
$pass = 'Admin123!';

$pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);

return $pdo;
