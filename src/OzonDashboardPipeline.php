<?php

declare(strict_types=1);

namespace Ozon;

use RuntimeException;

class OzonDashboardPipeline
{
    /** @var CampaignService   */ private $campaignService;
    /** @var ProductService    */ private $productService;
    /** @var StatisticsService */ private $statisticsService;
    /** @var AnalyticsService  */ private $analyticsService;
    /** @var MergeAdapter      */ private $mergeAdapter;

    public function __construct(
        CampaignService   $campaignService,
        ProductService    $productService,
        StatisticsService $statisticsService,
        AnalyticsService  $analyticsService,
        $mergeAdapter
    ) {
        $this->campaignService   = $campaignService;
        $this->productService    = $productService;
        $this->statisticsService = $statisticsService;
        $this->analyticsService  = $analyticsService;
        $this->mergeAdapter      = $mergeAdapter;
    }

    /**
     * FIX #2 — все исключения теперь перехватываются и возвращаются
     * в поле 'error', а не бросаются наружу → нет 500.
     *
     * @return array{promotedSkus: int[], unified: array[], error: string|null}
     */
    public function run($dateFrom, $dateTo)
    {
        try {
            return $this->execute($dateFrom, $dateTo);
        } catch (RuntimeException $e) {
            // Логируем и возвращаем структурированную ошибку вместо 500
            error_log('[OzonDashboardPipeline] ' . $e->getMessage());
            return array(
                'promotedSkus' => array(),
                'unified'      => array(),
                'error'        => $e->getMessage(),
            );
        }
    }

    // ── private ──────────────────────────────────────────────────────────────

    private function execute($dateFrom, $dateTo)
    {
        // 1. Кампании типа SKU (CPC)
        $cpcCampaigns = $this->campaignService->getCpcCampaigns();
        $campaignIds  = array();
        foreach ($cpcCampaigns as $campaign) {
            if (is_array($campaign) && isset($campaign['id'])) {
                $campaignIds[] = (int)$campaign['id'];
            }
        }

        if (count($campaignIds) === 0) {
            return array('promotedSkus' => array(), 'unified' => array(), 'error' => null);
        }

        // 2. Продукты по кампаниям
        $productsByCampaign = array();
        $validCampaignIds   = array();
        foreach ($campaignIds as $campaignId) {
            $products = $this->productService->getCampaignProducts($campaignId);
            if (count($products) === 0) {
                continue;
            }
            $validCampaignIds[]  = $campaignId;
            $productsByCampaign  = array_merge($productsByCampaign, $products);
        }

        if (count($validCampaignIds) === 0) {
            return array('promotedSkus' => array(), 'unified' => array(), 'error' => null);
        }

        // 3. Уникальные SKU
        $promotedSkus = array();
        foreach ($productsByCampaign as $product) {
            if (is_array($product) && isset($product['sku']) && is_numeric((string)$product['sku'])) {
                $promotedSkus[] = (int)$product['sku'];
            }
        }
        $promotedSkus = array_values(array_unique($promotedSkus));

        // 4. Статистика рекламы (чанки по 10, API-лимит)
        $adStats = array();
        foreach (array_chunk($validCampaignIds, 10) as $chunk) {
            $adStats = array_merge($adStats, $this->statisticsService->getProductsStatistics($chunk, $dateFrom, $dateTo));
            $adStats = array_merge($adStats, $this->statisticsService->getOrdersStatistics($chunk, $dateFrom, $dateTo));
        }
        $adStats = $this->mergeAdapter->aggregateAdStats($adStats);

        // 5. Органическая аналитика
        $analyticsRows = $this->analyticsService->getAnalyticsBySkuDay($promotedSkus, $dateFrom, $dateTo);

        // 6. Merge
        $unified = $this->mergeAdapter->mergeBySku($adStats, $analyticsRows);

        return array(
            'promotedSkus' => $promotedSkus,
            'unified'      => $unified,
            'error'        => null,
        );
    }
}
