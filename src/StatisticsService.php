<?php

class StatisticsService
{
    /** @var HttpClient */
    private $performanceClient;

    public function __construct(HttpClient $performanceClient)
    {
        $this->performanceClient = $performanceClient;
    }

    public function getProductsStatistics(array $campaignIds, $dateFrom, $dateTo)
    {
        $reportId = $this->generateReport('/api/client/statistic/products/generate', $campaignIds, $dateFrom, $dateTo);
        return $this->awaitReport($reportId);
    }

    public function getOrdersStatistics(array $campaignIds, $dateFrom, $dateTo)
    {
        $reportId = $this->generateReport('/api/client/statistic/orders/generate', $campaignIds, $dateFrom, $dateTo);
        return $this->awaitReport($reportId);
    }

    // ── private ──────────────────────────────────────────────────────────────

    private function generateReport($path, array $campaignIds, $dateFrom, $dateTo)
    {
        if (count($campaignIds) > 10) {
            throw new RuntimeException('Performance API limit: max 10 campaigns per report request');
        }

        $response = $this->performanceClient->post($path, array(
            'campaign_ids' => array_values(array_map('intval', $campaignIds)),
            'from'         => $dateFrom,
            'to'           => $dateTo,
        ));

        $reportId = isset($response['uuid'])
            ? $response['uuid']
            : (isset($response['report_id']) ? $response['report_id']
            : (isset($response['id'])        ? $response['id'] : null));

        if (!is_string($reportId) || $reportId === '') {
            throw new RuntimeException('Cannot extract report id for ' . $path);
        }

        return $reportId;
    }

    /**
     * FIX #1 — PHP timeout (500).
     *  - set_time_limit(0) снимает ограничение скрипта на всё время поллинга.
     *  - Exponential backoff вместо фиксированных 2 с: 0.5 → 1 → 2 → 4 → 8 s (cap).
     *  - Лимит 120 с гарантирует выход без fatal, с читаемым сообщением.
     */
    private function awaitReport($reportId)
    {
        set_time_limit(0); // FIX: снимаем ограничение выполнения

        $deadlineTs  = microtime(true) + 120; // макс. 2 минуты
        $waitMs      = 500;                   // начальный интервал, мс
        $waitCap     = 8000;                  // потолок интервала, мс
        $attempt     = 0;

        while (microtime(true) < $deadlineTs) {
            $attempt++;
            $response = $this->performanceClient->get('/api/client/statistics/' . $reportId);
            $status   = isset($response['state'])
                ? $response['state']
                : (isset($response['status']) ? $response['status'] : null);

            if (in_array($status, array('ready', 'completed', 'success'), true)) {
                $rows = isset($response['data'])
                    ? $response['data']
                    : (isset($response['result']) ? $response['result'] : array());
                return $this->mapRows(is_array($rows) ? $rows : array());
            }

            if (in_array($status, array('failed', 'error'), true)) {
                throw new RuntimeException(
                    'Statistics report failed: ' . $reportId . ', status=' . (string)$status
                );
            }

            usleep($waitMs * 1000);
            $waitMs = min($waitMs * 2, $waitCap); // exponential backoff
        }

        throw new RuntimeException('Timeout (120 s) while waiting report ' . $reportId);
    }

    private function mapRows(array $rows)
    {
        $result = array();
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $skuSource = isset($row['sku'])     ? $row['sku']
                : (isset($row['skuId'])          ? $row['skuId']
                : (isset($row['item_id'])         ? $row['item_id'] : null));
            $sku = $this->normalizeSku($skuSource);

            $day = isset($row['day'])  ? $row['day']
                : (isset($row['date']) ? $row['date'] : null);

            if ($sku === null || !is_string($day)) {
                continue;
            }

            $result[] = array(
                'sku'         => $sku,
                'day'         => $day,
                'impressions' => $this->normalizeNumber(isset($row['impressions']) ? $row['impressions'] : 0),
                'clicks'      => $this->normalizeNumber(isset($row['clicks'])      ? $row['clicks']      : 0),
                'spend'       => $this->normalizeNumber(isset($row['spend'])       ? $row['spend']       : 0),
                'orders'      => $this->normalizeNumber(isset($row['orders'])      ? $row['orders']      : 0),
                'revenue'     => $this->normalizeNumber(isset($row['revenue'])     ? $row['revenue']     : 0),
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
