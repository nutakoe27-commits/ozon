#!/usr/bin/env php
<?php

declare(strict_types=1);

use Ozon\Adapter\MergeAdapter;
use Ozon\Config\AppConfig;
use Ozon\Http\HttpClient;
use Ozon\Pipeline\OzonDashboardPipeline;
use Ozon\Service\AnalyticsService;
use Ozon\Service\CampaignService;
use Ozon\Service\PerformanceAuthService;
use Ozon\Service\ProductService;
use Ozon\Service\StatisticsService;

require __DIR__ . '/../src/bootstrap.php';

$config = AppConfig::fromEnv();

$authClient = new HttpClient($config->performanceBaseUrl);
$authService = new PerformanceAuthService($authClient, $config->performanceClientId, $config->performanceClientSecret);
$accessToken = $authService->getAccessToken();

$performanceClient = new HttpClient($config->performanceBaseUrl, array(
    'Authorization' => 'Bearer ' . $accessToken
));

$sellerClient = new HttpClient($config->sellerBaseUrl, array(
    'Client-Id' => $config->sellerClientId,
    'Api-Key' => $config->sellerApiKey
));

$pipeline = new OzonDashboardPipeline(
    new CampaignService($performanceClient),
    new ProductService($performanceClient),
    new StatisticsService($performanceClient),
    new AnalyticsService($sellerClient, $config->analyticsRequestIntervalMs),
    new MergeAdapter()
);

$result = $pipeline->run($config->dateFrom, $config->dateTo);

$dataDir = __DIR__ . '/../storage/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

file_put_contents(
    $dataDir . '/unified.json',
    json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
);

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
