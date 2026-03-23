<?php

declare(strict_types=1);

namespace Ozon\Adapter;

use Ozon\DTO\UnifiedProductDay;

final class MergeAdapter
{
    public function aggregateAdStats(array $rows)
    {
        $acc = array();

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $sku = isset($row['sku']) ? (int)$row['sku'] : 0;
            $day = isset($row['day']) ? (string)$row['day'] : '';
            if ($sku === 0 || $day === '') {
                continue;
            }

            $key = $sku . ':' . $day;
            if (!isset($acc[$key])) {
                $acc[$key] = array(
                    'sku' => $sku,
                    'day' => $day,
                    'impressions' => 0.0,
                    'clicks' => 0.0,
                    'spend' => 0.0,
                    'orders' => 0.0,
                    'revenue' => 0.0,
                );
            }

            $acc[$key]['impressions'] += isset($row['impressions']) ? (float)$row['impressions'] : 0.0;
            $acc[$key]['clicks'] += isset($row['clicks']) ? (float)$row['clicks'] : 0.0;
            $acc[$key]['spend'] += isset($row['spend']) ? (float)$row['spend'] : 0.0;
            $acc[$key]['orders'] += isset($row['orders']) ? (float)$row['orders'] : 0.0;
            $acc[$key]['revenue'] += isset($row['revenue']) ? (float)$row['revenue'] : 0.0;
        }

        return array_values($acc);
    }

    public function mergeBySku(array $adRows, array $analyticsRows)
    {
        $analyticsMap = array();
        foreach ($analyticsRows as $row) {
            if (!is_array($row) || !isset($row['sku']) || !isset($row['day'])) {
                continue;
            }
            $key = (string)$row['sku'] . ':' . (string)$row['day'];
            $analyticsMap[$key] = $row;
        }

        $result = array();
        foreach ($adRows as $ad) {
            if (!is_array($ad) || !isset($ad['sku']) || !isset($ad['day'])) {
                continue;
            }

            $key = (string)$ad['sku'] . ':' . (string)$ad['day'];
            $organic = isset($analyticsMap[$key]) ? $analyticsMap[$key] : array(
                'sku' => (int)$ad['sku'],
                'day' => (string)$ad['day'],
                'revenue' => 0.0,
                'orderedUnits' => 0.0,
                'hitsView' => 0.0,
                'hitsToCart' => 0.0,
                'sessionView' => 0.0,
                'convToCart' => 0.0,
            );

            $spend = isset($ad['spend']) ? (float)$ad['spend'] : 0.0;
            $clicks = isset($ad['clicks']) ? (float)$ad['clicks'] : 0.0;
            $impressions = isset($ad['impressions']) ? (float)$ad['impressions'] : 0.0;
            $orders = isset($ad['orders']) ? (float)$ad['orders'] : 0.0;
            $revenue = isset($ad['revenue']) ? (float)$ad['revenue'] : 0.0;

            $dto = new UnifiedProductDay(
                (int)$ad['sku'],
                (string)$ad['day'],
                $ad,
                $organic,
                array(
                    'cpc' => $this->safeDivide($spend, $clicks),
                    'ctr' => $this->safeDivide($clicks, $impressions),
                    'roas' => $this->safeDivide($revenue, $spend),
                    'acos' => $this->safeDivide($spend, $revenue),
                    'cr' => $this->safeDivide($orders, $clicks),
                )
            );

            $result[] = $dto->toArray();
        }

        return $result;
    }

    private function safeDivide($a, $b)
    {
        if ((float)$b == 0.0) {
            return 0.0;
        }

        return (float)$a / (float)$b;
    }
}
