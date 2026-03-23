<?php

declare(strict_types=1);

namespace Ozon\Config;

use DateTimeImmutable;
use RuntimeException;

final class AppConfig
{
    /** @var string */
    public $performanceBaseUrl;
    /** @var string */
    public $performanceClientId;
    /** @var string */
    public $performanceClientSecret;
    /** @var string */
    public $sellerBaseUrl;
    /** @var string */
    public $sellerClientId;
    /** @var string */
    public $sellerApiKey;
    /** @var string */
    public $dateFrom;
    /** @var string */
    public $dateTo;
    /** @var int */
    public $analyticsRequestIntervalMs;

    public function __construct(
        $performanceBaseUrl,
        $performanceClientId,
        $performanceClientSecret,
        $sellerBaseUrl,
        $sellerClientId,
        $sellerApiKey,
        $dateFrom,
        $dateTo,
        $analyticsRequestIntervalMs
    ) {
        $this->performanceBaseUrl = $performanceBaseUrl;
        $this->performanceClientId = $performanceClientId;
        $this->performanceClientSecret = $performanceClientSecret;
        $this->sellerBaseUrl = $sellerBaseUrl;
        $this->sellerClientId = $sellerClientId;
        $this->sellerApiKey = $sellerApiKey;
        $this->dateFrom = $dateFrom;
        $this->dateTo = $dateTo;
        $this->analyticsRequestIntervalMs = (int)$analyticsRequestIntervalMs;
    }

    /** @return self */
    public static function fromEnv()
    {
        $cfg = new self(
            self::env('OZON_PERFORMANCE_BASE_URL', 'https://api-performance.ozon.ru'),
            self::envRequired('OZON_PERFORMANCE_CLIENT_ID'),
            self::envRequired('OZON_PERFORMANCE_CLIENT_SECRET'),
            self::env('OZON_SELLER_BASE_URL', 'https://api-seller.ozon.ru'),
            self::envRequired('OZON_SELLER_CLIENT_ID'),
            self::envRequired('OZON_SELLER_API_KEY'),
            self::envRequired('OZON_DATE_FROM'),
            self::envRequired('OZON_DATE_TO'),
            self::env('OZON_ANALYTICS_REQUEST_INTERVAL_MS', '60000')
        );

        $cfg->validate();

        return $cfg;
    }

    private function validate()
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

        if ($this->analyticsRequestIntervalMs < 0) {
            throw new RuntimeException('OZON_ANALYTICS_REQUEST_INTERVAL_MS must be >= 0');
        }
    }

    private static function envRequired($key)
    {
        $value = getenv($key);
        if ($value === false || trim($value) === '') {
            throw new RuntimeException('Missing required env: ' . $key);
        }

        return $value;
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
