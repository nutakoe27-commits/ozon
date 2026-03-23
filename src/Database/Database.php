<?php

declare(strict_types=1);

namespace Ozon\Database;

use PDO;

final class Database
{
    /** @var PDO|null */
    private static $pdo = null;

    /** @return PDO */
    public static function pdo($host, $port, $dbName, $user, $password)
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $dsn = 'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $dbName . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $user, $password, array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ));

        self::$pdo = $pdo;
        return self::$pdo;
    }
}
