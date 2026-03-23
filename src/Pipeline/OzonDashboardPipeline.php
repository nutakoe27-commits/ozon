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
    /** @var CampaignService */
    private $campaignService;
    /** @var ProductService */
    private $productService;
    /** @var StatisticsService */
    private $statisticsService;
    /** @var AnalyticsService */
    private $analyticsService;
    /** @var MergeAdapter */
    private $mergeAdapter;

    public function __construct(
        CampaignService $campaignService,
        ProductService $productService,
        StatisticsService $statisticsService,
        AnalyticsService $analyticsService,
        MergeAdapter $mergeAdapter
    ) {
        $this->campaignService = $campaignService;
        $this->productService = $productService;
        $this->statisticsService = $statisticsService;
        $this->analyticsService = $analyticsService;
        $this->mergeAdapter = $mergeAdapter;
    }

    public function run($dateFrom, $dateTo)
    {
        $cpcCampaigns = $this->campaignService->getCpcCampaigns();
        $campaignIds = array();
        foreach ($cpcCampaigns as $campaign) {
            if (is_array($campaign) && isset($campaign['id'])) {
                $campaignIds[] = (int)$campaign['id'];
            }
        }

        if (count($campaignIds) === 0) {
            return array('promotedSkus' => array(), 'unified' => array());
        }

        $productsByCampaign = array();
        $validCampaignIds = array();
        foreach ($campaignIds as $campaignId) {
            $products = $this->productService->getCampaignProducts($campaignId);
            if (count($products) === 0) {
                continue;
            }

            $validCampaignIds[] = $campaignId;
            $productsByCampaign = array_merge($productsByCampaign, $products);
        }

        if (count($validCampaignIds) === 0) {
            return array('promotedSkus' => array(), 'unified' => array());
        }

        $promotedSkus = array();
        foreach ($productsByCampaign as $product) {
            if (is_array($product) && isset($product['sku']) && is_numeric((string)$product['sku'])) {
                $promotedSkus[] = (int)$product['sku'];
            }
        }
        $promotedSkus = array_values(array_unique($promotedSkus));

        $adStats = array();
        foreach (array_chunk($validCampaignIds, 10) as $chunk) {
            $adStats = array_merge($adStats, $this->statisticsService->getProductsStatistics($chunk, $dateFrom, $dateTo));
            $adStats = array_merge($adStats, $this->statisticsService->getOrdersStatistics($chunk, $dateFrom, $dateTo));
        }

        $adStats = $this->mergeAdapter->aggregateAdStats($adStats);

        $analyticsRows = $this->analyticsService->getAnalyticsBySkuDay($promotedSkus, $dateFrom, $dateTo);
        $unified = $this->mergeAdapter->mergeBySku($adStats, $analyticsRows);

        return array(
            'promotedSkus' => $promotedSkus,
            'unified' => $unified,
        );
    }
}
