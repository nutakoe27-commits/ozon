#!/usr/bin/env php
<?php

declare(strict_types=1);

use Ozon\MergeAdapter;
use Ozon\AppConfig;
use Ozon\HttpClient;
use Ozon\OzonDashboardPipeline;
use Ozon\AnalyticsService;
use Ozon\CampaignService;
use Ozon\PerformanceAuthService;
use Ozon\ProductService;
use Ozon\StatisticsService;

require __DIR__ . '/../src/bootstrap.php';

$config = AppConfig::fromEnv();
$config->validateForCliSecrets();

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
