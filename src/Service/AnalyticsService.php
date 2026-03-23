<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;

final class AnalyticsService
{
    public function __construct(
        private readonly HttpClient $sellerClient,
        private readonly int $requestIntervalMs = 60000,
    ) {
    }

    /** @param array<int,int> $skus @return array<int,array<string,mixed>> */
    public function getAnalyticsBySkuDay(array $skus, string $dateFrom, string $dateTo): array
    {
        $limit = 1000;
        $offset = 0;
        $allRows = [];

        while (true) {
            $response = $this->sellerClient->post('/v1/analytics/data', [
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'metrics' => ['revenue', 'ordered_units', 'hits_view', 'hits_tocart', 'session_view', 'conv_tocart'],
                'dimension' => ['sku', 'day'],
                'filters' => $skus !== [] ? [['key' => 'sku', 'operator' => 'IN', 'values' => $skus]] : [],
                'limit' => $limit,
                'offset' => $offset,
            ]);

            $batch = $response['data'] ?? $response['result'] ?? [];
            if (!is_array($batch)) {
                $batch = [];
            }

            $allRows = [...$allRows, ...$batch];

            if (count($batch) < $limit) {
                break;
            }

            $offset += $limit;
            if ($this->requestIntervalMs > 0) {
                usleep($this->requestIntervalMs * 1000);
            }
        }

        return $this->mapRows($allRows);
    }

    /** @param array<int,int> $skus */
    public function getProductQueries(string $dateFrom, string $dateTo, array $skus): array
    {
        return $this->sellerClient->post('/v1/analytics/product-queries', [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'skus' => $skus,
        ]);
    }

    public function getFinanceRealizationByDay(string $dateFrom, string $dateTo): array
    {
        return $this->sellerClient->post('/v1/finance/realization/by-day', [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
        ]);
    }

    /** @param array<int,array<string,mixed>> $rows @return array<int,array<string,mixed>> */
    private function mapRows(array $rows): array
    {
        $result = [];

        foreach ($rows as $row) {
            $sku = $this->normalizeSku($row['sku'] ?? $row['dimension_sku'] ?? null);
            $day = $row['day'] ?? $row['dimension_day'] ?? $row['date'] ?? null;

            if ($sku === null || !is_string($day)) {
                // TODO(api-doc-gap): confirm analytics response dimensions schema
                continue;
            }

            $result[] = [
                'sku' => $sku,
                'day' => $day,
                'revenue' => $this->normalizeNumber($row['revenue'] ?? 0),
                'orderedUnits' => $this->normalizeNumber($row['ordered_units'] ?? 0),
                'hitsView' => $this->normalizeNumber($row['hits_view'] ?? 0),
                'hitsToCart' => $this->normalizeNumber($row['hits_tocart'] ?? 0),
                'sessionView' => $this->normalizeNumber($row['session_view'] ?? 0),
                'convToCart' => $this->normalizeNumber($row['conv_tocart'] ?? 0),
            ];
        }

        return $result;
    }

    private function normalizeSku(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }
        if (is_string($value) && $value !== '' && is_numeric($value)) {
            return (int)$value;
        }

        return null;
    }

    private function normalizeNumber(mixed $value): float
    {
        if (is_int($value) || is_float($value)) {
            return (float)$value;
        }
        if (is_string($value) && $value !== '' && is_numeric($value)) {
            return (float)$value;
        }

        return 0.0;
    }
}
