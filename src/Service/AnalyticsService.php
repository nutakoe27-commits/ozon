<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;

final class AnalyticsService
{
    /** @var HttpClient */
    private $sellerClient;
    /** @var int */
    private $requestIntervalMs;

    public function __construct(HttpClient $sellerClient, $requestIntervalMs = 60000)
    {
        $this->sellerClient = $sellerClient;
        $this->requestIntervalMs = (int)$requestIntervalMs;
    }

    public function getAnalyticsBySkuDay(array $skus, $dateFrom, $dateTo)
    {
        $limit = 1000;
        $offset = 0;
        $allRows = array();

        while (true) {
            $response = $this->sellerClient->post('/v1/analytics/data', array(
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'metrics' => array('revenue', 'ordered_units', 'hits_view', 'hits_tocart', 'session_view', 'conv_tocart'),
                'dimension' => array('sku', 'day'),
                'filters' => count($skus) > 0 ? array(array('key' => 'sku', 'operator' => 'IN', 'values' => $skus)) : array(),
                'limit' => $limit,
                'offset' => $offset,
            ));

            $batch = isset($response['data']) ? $response['data'] : (isset($response['result']) ? $response['result'] : array());
            if (!is_array($batch)) {
                $batch = array();
            }

            $allRows = array_merge($allRows, $batch);

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

    public function getProductQueries($dateFrom, $dateTo, array $skus)
    {
        return $this->sellerClient->post('/v1/analytics/product-queries', array(
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'skus' => $skus,
        ));
    }

    public function getFinanceRealizationByDay($dateFrom, $dateTo)
    {
        return $this->sellerClient->post('/v1/finance/realization/by-day', array(
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
        ));
    }

    private function mapRows(array $rows)
    {
        $result = array();

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $skuSource = isset($row['sku']) ? $row['sku'] : (isset($row['dimension_sku']) ? $row['dimension_sku'] : null);
            $sku = $this->normalizeSku($skuSource);
            $day = isset($row['day']) ? $row['day'] : (isset($row['dimension_day']) ? $row['dimension_day'] : (isset($row['date']) ? $row['date'] : null));

            if ($sku === null || !is_string($day)) {
                // TODO(api-doc-gap): confirm analytics response dimensions schema
                continue;
            }

            $result[] = array(
                'sku' => $sku,
                'day' => $day,
                'revenue' => $this->normalizeNumber(isset($row['revenue']) ? $row['revenue'] : 0),
                'orderedUnits' => $this->normalizeNumber(isset($row['ordered_units']) ? $row['ordered_units'] : 0),
                'hitsView' => $this->normalizeNumber(isset($row['hits_view']) ? $row['hits_view'] : 0),
                'hitsToCart' => $this->normalizeNumber(isset($row['hits_tocart']) ? $row['hits_tocart'] : 0),
                'sessionView' => $this->normalizeNumber(isset($row['session_view']) ? $row['session_view'] : 0),
                'convToCart' => $this->normalizeNumber(isset($row['conv_tocart']) ? $row['conv_tocart'] : 0),
            );
        }

        return $result;
    }

    private function normalizeSku($value)
    {
        if (is_int($value)) {
            return $value;
        }
        if (is_string($value) && $value !== '' && is_numeric($value)) {
            return (int)$value;
        }

        return null;
    }

    private function normalizeNumber($value)
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
