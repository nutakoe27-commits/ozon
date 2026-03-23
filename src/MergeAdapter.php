<?php
declare(strict_types=1);

namespace Ozon;

/**
 * MergeAdapter — склеивает рекламную статистику с органической аналитикой.
 *
 * Если у вас уже есть своя реализация — этот файл не нужен.
 * Если нет — положите рядом с остальными сервисами.
 */
final class MergeAdapter
{
    /**
     * Агрегирует adStats по [sku+day] суммируя дубли из products+orders отчётов.
     *
     * @param  array[] $rows  результат StatisticsService::getProductsStatistics + getOrdersStatistics
     * @return array[]        массив ['sku','day','impressions','clicks','spend','adOrders']
     */
    public function aggregateAdStats(array $rows): array
    {
        $map = [];
        foreach ($rows as $row) {
            $key = $row['sku'] . '|' . $row['day'];
            if (!isset($map[$key])) {
                $map[$key] = [
                    'sku'         => $row['sku'],
                    'day'         => $row['day'],
                    'impressions' => 0.0,
                    'clicks'      => 0.0,
                    'spend'       => 0.0,
                    'adOrders'    => 0.0,
                ];
            }
            $map[$key]['impressions'] += $row['impressions'] ?? 0;
            $map[$key]['clicks']      += $row['clicks']      ?? 0;
            $map[$key]['spend']       += $row['spend']       ?? 0;
            $map[$key]['adOrders']    += $row['orders']      ?? 0;
        }
        return array_values($map);
    }

    /**
     * Объединяет рекламные данные с органической аналитикой по [sku+day].
     *
     * @param  array[] $adStats      из aggregateAdStats()
     * @param  array[] $analyticsRows из AnalyticsService::getAnalyticsBySkuDay()
     * @return array[]
     */
    public function mergeBySku(array $adStats, array $analyticsRows): array
    {
        // Индексируем аналитику по sku|day
        $analyticsMap = [];
        foreach ($analyticsRows as $row) {
            $key = $row['sku'] . '|' . $row['day'];
            $analyticsMap[$key] = $row;
        }

        $result = [];
        foreach ($adStats as $ad) {
            $key      = $ad['sku'] . '|' . $ad['day'];
            $organic  = $analyticsMap[$key] ?? [];
            $result[] = [
                'sku'        => $ad['sku'],
                'day'        => $ad['day'],
                'impressions'=> $ad['impressions'],
                'clicks'     => $ad['clicks'],
                'spend'      => $ad['spend'],
                'adOrders'   => $ad['adOrders'],
                'revenue'    => $organic['revenue']     ?? 0.0,
                'hitsView'   => $organic['hitsView']    ?? 0.0,
                'hitsToCart' => $organic['hitsToCart']  ?? 0.0,
                'convToCart' => $organic['convToCart']  ?? 0.0,
                'sessionView'=> $organic['sessionView'] ?? 0.0,
            ];
        }
        return $result;
    }
}
