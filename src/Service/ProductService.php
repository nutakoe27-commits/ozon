<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;

final class ProductService
{
    public function __construct(private readonly HttpClient $performanceClient)
    {
    }

    /** @return array<int,array<string,mixed>> */
    public function getCampaignProducts(int $campaignId): array
    {
        $firstTry = $this->performanceClient->get("/api/client/campaign/{$campaignId}/objects");
        $records = $firstTry['items'] ?? $firstTry['products'] ?? $firstTry['result'] ?? [];

        if ($records !== []) {
            return $this->mapProducts($campaignId, $records);
        }

        $fallback = $this->performanceClient->get("/api/client/campaign/{$campaignId}/v2/products");
        $fallbackRecords = $fallback['items'] ?? $fallback['products'] ?? $fallback['result'] ?? [];

        return $this->mapProducts($campaignId, $fallbackRecords);
    }

    /** @param array<int,array<string,mixed>> $rows @return array<int,array<string,mixed>> */
    private function mapProducts(int $campaignId, array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            $sku = $this->normalizeSku($row['sku'] ?? $row['skuId'] ?? $row['offer_id'] ?? null);
            if ($sku === null) {
                // TODO(api-doc-gap): confirm exact sku field names for /objects and /v2/products
                continue;
            }

            $row['campaignId'] = $campaignId;
            $row['sku'] = $sku;
            $out[] = $row;
        }

        return $out;
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
}
