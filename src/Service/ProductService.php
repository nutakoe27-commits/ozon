<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;

final class ProductService
{
    /** @var HttpClient */
    private $performanceClient;

    public function __construct(HttpClient $performanceClient)
    {
        $this->performanceClient = $performanceClient;
    }

    public function getCampaignProducts($campaignId)
    {
        $campaignId = (int)$campaignId;

        $firstTry = $this->performanceClient->get('/api/client/campaign/' . $campaignId . '/objects');
        $records = isset($firstTry['items']) ? $firstTry['items'] : (isset($firstTry['products']) ? $firstTry['products'] : (isset($firstTry['result']) ? $firstTry['result'] : array()));

        if (is_array($records) && count($records) > 0) {
            return $this->mapProducts($campaignId, $records);
        }

        $fallback = $this->performanceClient->get('/api/client/campaign/' . $campaignId . '/v2/products');
        $fallbackRecords = isset($fallback['items']) ? $fallback['items'] : (isset($fallback['products']) ? $fallback['products'] : (isset($fallback['result']) ? $fallback['result'] : array()));

        return $this->mapProducts($campaignId, is_array($fallbackRecords) ? $fallbackRecords : array());
    }

    private function mapProducts($campaignId, array $rows)
    {
        $out = array();
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $skuSource = isset($row['sku']) ? $row['sku'] : (isset($row['skuId']) ? $row['skuId'] : (isset($row['offer_id']) ? $row['offer_id'] : null));
            $sku = $this->normalizeSku($skuSource);
            if ($sku === null) {
                // TODO(api-doc-gap): confirm exact sku field names for /objects and /v2/products
                continue;
            }

            $row['campaignId'] = (int)$campaignId;
            $row['sku'] = $sku;
            $out[] = $row;
        }

        return $out;
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
}
