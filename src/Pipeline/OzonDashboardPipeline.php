<?php

declare(strict_types=1);

namespace Ozon\Pipeline;

use Ozon\Adapter\MergeAdapter;
use Ozon\Service\AnalyticsService;
use Ozon\Service\CampaignService;
use Ozon\Service\ProductService;
use Ozon\Service\StatisticsService;

final class OzonDashboardPipeline
{
    public function __construct(
        private readonly CampaignService $campaignService,
        private readonly ProductService $productService,
        private readonly StatisticsService $statisticsService,
        private readonly AnalyticsService $analyticsService,
        private readonly MergeAdapter $mergeAdapter,
    ) {
    }

    /** @return array{promotedSkus: array<int,int>, unified: array<int,array<string,mixed>>} */
    public function run(string $dateFrom, string $dateTo): array
    {
        $cpcCampaigns = $this->campaignService->getCpcCampaigns();
        $campaignIds = array_values(array_map(static fn(array $x): int => (int)$x['id'], $cpcCampaigns));

        if ($campaignIds === []) {
            return ['promotedSkus' => [], 'unified' => []];
        }

        $productsByCampaign = [];
        foreach ($campaignIds as $campaignId) {
            $productsByCampaign = [...$productsByCampaign, ...$this->productService->getCampaignProducts($campaignId)];
        }

        $promotedSkus = [];
        foreach ($productsByCampaign as $product) {
            if (isset($product['sku']) && is_numeric((string)$product['sku'])) {
                $promotedSkus[] = (int)$product['sku'];
            }
        }
        $promotedSkus = array_values(array_unique($promotedSkus));

        $adStats = [];
        foreach (array_chunk($campaignIds, 10) as $chunk) {
            $adStats = [...$adStats, ...$this->statisticsService->getProductsStatistics($chunk, $dateFrom, $dateTo)];
            $adStats = [...$adStats, ...$this->statisticsService->getOrdersStatistics($chunk, $dateFrom, $dateTo)];
        }

        $adStats = $this->mergeAdapter->aggregateAdStats($adStats);

        $analyticsRows = $this->analyticsService->getAnalyticsBySkuDay($promotedSkus, $dateFrom, $dateTo);
        $unified = $this->mergeAdapter->mergeBySku($adStats, $analyticsRows);

        return [
            'promotedSkus' => $promotedSkus,
            'unified' => $unified,
        ];
    }
}
