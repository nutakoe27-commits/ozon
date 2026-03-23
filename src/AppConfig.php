<?php

declare(strict_types=1);

namespace Ozon;

use DateTimeImmutable;
use RuntimeException;

final class AppConfig
{
    public $performanceBaseUrl;
    public $performanceClientId;
    public $performanceClientSecret;
    public $sellerBaseUrl;
    public $sellerClientId;
    public $sellerApiKey;
    public $dateFrom;
    public $dateTo;
    public $analyticsRequestIntervalMs;

    public $dbHost;
    public $dbPort;
    public $dbName;
    public $dbUser;
    public $dbPassword;

    public function __construct(array $data)
    {
        foreach ($data as $k => $v) {
            $this->{$k} = $v;
        }
    }

    public static function fromEnv()
    {
        $cfg = new self(array(
            'performanceBaseUrl' => self::env('OZON_PERFORMANCE_BASE_URL', 'https://api-performance.ozon.ru'),
            'performanceClientId' => self::env('OZON_PERFORMANCE_CLIENT_ID', ''),
            'performanceClientSecret' => self::env('OZON_PERFORMANCE_CLIENT_SECRET', ''),
            'sellerBaseUrl' => self::env('OZON_SELLER_BASE_URL', 'https://api-seller.ozon.ru'),
            'sellerClientId' => self::env('OZON_SELLER_CLIENT_ID', ''),
            'sellerApiKey' => self::env('OZON_SELLER_API_KEY', ''),
            'dateFrom' => self::env('OZON_DATE_FROM', date('Y-m-d', strtotime('-7 days'))),
            'dateTo' => self::env('OZON_DATE_TO', date('Y-m-d')),
            'analyticsRequestIntervalMs' => (int)self::env('OZON_ANALYTICS_REQUEST_INTERVAL_MS', '60000'),
            'dbHost' => self::env('DB_HOST', '127.0.0.1'),
            'dbPort' => self::env('DB_PORT', '3306'),
            'dbName' => self::env('DB_NAME', 'ozon_dashboard'),
            'dbUser' => self::env('DB_USER', 'root'),
            'dbPassword' => self::env('DB_PASSWORD', ''),
        ));

        $cfg->validateCommon();
        return $cfg;
    }

    public function validateForCliSecrets()
    {
        if ($this->performanceClientId === '' || $this->performanceClientSecret === '' || $this->sellerClientId === '' || $this->sellerApiKey === '') {
            throw new RuntimeException('For CLI mode set OZON_* API credentials in env');
        }
    }

    private function validateCommon()
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $this->dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $this->dateTo)) {
            throw new RuntimeException('OZON_DATE_FROM and OZON_DATE_TO must be in YYYY-MM-DD format');
        }

        $from = new DateTimeImmutable($this->dateFrom . ' 00:00:00');
        $to = new DateTimeImmutable($this->dateTo . ' 00:00:00');
        if ($to < $from) {
            throw new RuntimeException('OZON_DATE_TO must be same or later than OZON_DATE_FROM');
        }

        $days = (int)$from->diff($to)->format('%a') + 1;
        if ($days > 62) {
            throw new RuntimeException('Performance API limit exceeded: period must be <= 62 days');
        }
    }

    private static function env($key, $default)
    {
        $value = getenv($key);
        if ($value === false || trim($value) === '') {
            return $default;
        }
        return $value;
    }
}
