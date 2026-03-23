<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;
use RuntimeException;

final class StatisticsService
{
    public function __construct(private readonly HttpClient $performanceClient)
    {
    }

    /** @param array<int,int> $campaignIds @return array<int,array<string,mixed>> */
    public function getProductsStatistics(array $campaignIds, string $dateFrom, string $dateTo): array
    {
        $reportId = $this->generateReport('/api/client/statistic/products/generate', $campaignIds, $dateFrom, $dateTo);

        return $this->awaitReport($reportId);
    }

    /** @param array<int,int> $campaignIds @return array<int,array<string,mixed>> */
    public function getOrdersStatistics(array $campaignIds, string $dateFrom, string $dateTo): array
    {
        $reportId = $this->generateReport('/api/client/statistic/orders/generate', $campaignIds, $dateFrom, $dateTo);

        return $this->awaitReport($reportId);
    }

    /** @param array<int,int> $campaignIds */
    private function generateReport(string $path, array $campaignIds, string $dateFrom, string $dateTo): string
    {
        if (count($campaignIds) > 10) {
            throw new RuntimeException('Performance API limit: max 10 campaigns per report request');
        }

        $response = $this->performanceClient->post($path, [
            'campaign_ids' => $campaignIds,
            'from' => $dateFrom,
            'to' => $dateTo,
        ]);

        $reportId = $response['uuid'] ?? $response['report_id'] ?? $response['id'] ?? null;
        if (!is_string($reportId) || $reportId === '') {
            // TODO(api-doc-gap): confirm exact generate report response schema
            throw new RuntimeException("Cannot extract report id for {$path}");
        }

        return $reportId;
    }

    /** @return array<int,array<string,mixed>> */
    private function awaitReport(string $reportId): array
    {
        $attempts = 30;

        for ($i = 0; $i < $attempts; $i++) {
            $response = $this->performanceClient->get("/api/client/statistics/{$reportId}");
            $status = $response['state'] ?? $response['status'] ?? null;

            if (in_array($status, ['ready', 'completed', 'success'], true)) {
                $rows = $response['data'] ?? $response['result'] ?? [];

                return $this->mapRows($rows);
            }

            if (in_array($status, ['failed', 'error'], true)) {
                throw new RuntimeException("Statistics report failed: {$reportId}, status={$status}");
            }

            usleep(2_000_000);
        }

        throw new RuntimeException("Timeout while waiting report {$reportId}");
    }

    /** @param array<int,array<string,mixed>> $rows @return array<int,array<string,mixed>> */
    private function mapRows(array $rows): array
    {
        $result = [];
        foreach ($rows as $row) {
            $sku = $this->normalizeSku($row['sku'] ?? $row['skuId'] ?? $row['item_id'] ?? null);
            $day = $row['day'] ?? $row['date'] ?? null;
            if ($sku === null || !is_string($day)) {
                // TODO(api-doc-gap): confirm sku/day field names in statistics payload
                continue;
            }

            $result[] = [
                'sku' => $sku,
                'day' => $day,
                'impressions' => $this->normalizeNumber($row['impressions'] ?? 0),
                'clicks' => $this->normalizeNumber($row['clicks'] ?? 0),
                'spend' => $this->normalizeNumber($row['spend'] ?? 0),
                'orders' => $this->normalizeNumber($row['orders'] ?? 0),
                'revenue' => $this->normalizeNumber($row['revenue'] ?? 0),
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
