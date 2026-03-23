<?php

declare(strict_types=1);

namespace Ozon\Adapter;

use Ozon\DTO\UnifiedProductDay;

final class MergeAdapter
{
    /** @param array<int,array<string,mixed>> $rows @return array<int,array<string,mixed>> */
    public function aggregateAdStats(array $rows): array
    {
        $acc = [];

        foreach ($rows as $row) {
            $sku = (int)($row['sku'] ?? 0);
            $day = (string)($row['day'] ?? '');
            if ($sku === 0 || $day === '') {
                continue;
            }

            $key = $sku . ':' . $day;
            if (!isset($acc[$key])) {
                $acc[$key] = [
                    'sku' => $sku,
                    'day' => $day,
                    'impressions' => 0.0,
                    'clicks' => 0.0,
                    'spend' => 0.0,
                    'orders' => 0.0,
                    'revenue' => 0.0,
                ];
            }

            $acc[$key]['impressions'] += (float)($row['impressions'] ?? 0);
            $acc[$key]['clicks'] += (float)($row['clicks'] ?? 0);
            $acc[$key]['spend'] += (float)($row['spend'] ?? 0);
            $acc[$key]['orders'] += (float)($row['orders'] ?? 0);
            $acc[$key]['revenue'] += (float)($row['revenue'] ?? 0);
        }

        return array_values($acc);
    }

    /** @param array<int,array<string,mixed>> $adRows @param array<int,array<string,mixed>> $analyticsRows @return array<int,array<string,mixed>> */
    public function mergeBySku(array $adRows, array $analyticsRows): array
    {
        $analyticsMap = [];
        foreach ($analyticsRows as $row) {
            $key = (string)$row['sku'] . ':' . (string)$row['day'];
            $analyticsMap[$key] = $row;
        }

        $result = [];
        foreach ($adRows as $ad) {
            $key = (string)$ad['sku'] . ':' . (string)$ad['day'];
            $organic = $analyticsMap[$key] ?? [
                'sku' => (int)$ad['sku'],
                'day' => (string)$ad['day'],
                'revenue' => 0.0,
                'orderedUnits' => 0.0,
                'hitsView' => 0.0,
                'hitsToCart' => 0.0,
                'sessionView' => 0.0,
                'convToCart' => 0.0,
            ];

            $spend = (float)($ad['spend'] ?? 0);
            $clicks = (float)($ad['clicks'] ?? 0);
            $impressions = (float)($ad['impressions'] ?? 0);
            $orders = (float)($ad['orders'] ?? 0);
            $revenue = (float)($ad['revenue'] ?? 0);

            $dto = new UnifiedProductDay(
                sku: (int)$ad['sku'],
                day: (string)$ad['day'],
                ad: $ad,
                organic: $organic,
                computed: [
                    'cpc' => $this->safeDivide($spend, $clicks),
                    'ctr' => $this->safeDivide($clicks, $impressions),
                    'roas' => $this->safeDivide($revenue, $spend),
                    'acos' => $this->safeDivide($spend, $revenue),
                    'cr' => $this->safeDivide($orders, $clicks),
                ],
            );

            $result[] = $dto->toArray();
        }

        return $result;
    }

    private function safeDivide(float $a, float $b): float
    {
        if ($b == 0.0) {
            return 0.0;
        }

        return $a / $b;
    }
}
