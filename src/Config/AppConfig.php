<?php

declare(strict_types=1);

namespace Ozon\Config;

use DateTimeImmutable;
use RuntimeException;

final class AppConfig
{
    public function __construct(
        public readonly string $performanceBaseUrl,
        public readonly string $performanceClientId,
        public readonly string $performanceClientSecret,
        public readonly string $sellerBaseUrl,
        public readonly string $sellerClientId,
        public readonly string $sellerApiKey,
        public readonly string $dateFrom,
        public readonly string $dateTo,
        public readonly int $analyticsRequestIntervalMs,
    ) {
    }

    public static function fromEnv(): self
    {
        $cfg = new self(
            performanceBaseUrl: self::env('OZON_PERFORMANCE_BASE_URL', 'https://api-performance.ozon.ru'),
            performanceClientId: self::envRequired('OZON_PERFORMANCE_CLIENT_ID'),
            performanceClientSecret: self::envRequired('OZON_PERFORMANCE_CLIENT_SECRET'),
            sellerBaseUrl: self::env('OZON_SELLER_BASE_URL', 'https://api-seller.ozon.ru'),
            sellerClientId: self::envRequired('OZON_SELLER_CLIENT_ID'),
            sellerApiKey: self::envRequired('OZON_SELLER_API_KEY'),
            dateFrom: self::envRequired('OZON_DATE_FROM'),
            dateTo: self::envRequired('OZON_DATE_TO'),
            analyticsRequestIntervalMs: (int)self::env('OZON_ANALYTICS_REQUEST_INTERVAL_MS', '60000'),
        );

        $cfg->validate();

        return $cfg;
    }

    private function validate(): void
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

    private static function envRequired(string $key): string
    {
        $value = getenv($key);
        if ($value === false || trim($value) === '') {
            throw new RuntimeException("Missing required env: {$key}");
        }

        return $value;
    }

    private static function env(string $key, string $default): string
    {
        $value = getenv($key);
        if ($value === false || trim($value) === '') {
            return $default;
        }

        return $value;
    }
}
