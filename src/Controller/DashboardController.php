<?php
declare(strict_types=1);

namespace Ozon\Controller;

use Ozon\HttpClient;
use Ozon\PerformanceAuthService;
use Ozon\CampaignService;
use Ozon\ProductService;
use Ozon\StatisticsService;
use Ozon\AnalyticsService;
use Ozon\OzonDashboardPipeline;
use Ozon\MergeAdapter;
use Ozon\StoreRepository;

/**
 * Два маршрута:
 *   GET  /api/stores             → список магазинов текущего юзера
 *   POST /api/dashboard/refresh  → запустить pipeline и вернуть unified[]
 */
final class DashboardController
{
    /** @var StoreRepository */
    private $storeRepo;

    public function __construct(StoreRepository $storeRepo)
    {
        $this->storeRepo = $storeRepo;
    }

    // ── GET /api/stores ───────────────────────────────────────────────────────
    public function getStores(int $userId): void
    {
        $rows   = $this->storeRepo->allByUser($userId);
        $stores = array_map(function ($r) {
            return ['id' => $r['id'], 'name' => $r['name']];
        }, $rows);
        $this->json(['stores' => $stores]);
    }

    public function createStore(int $userId): void
    {
        $body = $this->parseJsonBody();
        $required = ['name', 'performance_client_id', 'performance_client_secret', 'seller_client_id', 'seller_api_key'];
        foreach ($required as $key) {
            if (trim((string)($body[$key] ?? '')) === '') {
                $this->jsonError($key . ' is required', 400);
                return;
            }
        }

        $storeId = $this->storeRepo->create(
            $userId,
            trim((string)$body['name']),
            trim((string)$body['performance_client_id']),
            trim((string)$body['performance_client_secret']),
            trim((string)$body['seller_client_id']),
            trim((string)$body['seller_api_key'])
        );

        $this->json(['ok' => true, 'store_id' => $storeId]);
    }

    // ── POST /api/dashboard/refresh ───────────────────────────────────────────
    public function refresh(int $userId): void
    {
        $body    = $this->parseJsonBody();
        $storeId = isset($body['store_id']) ? (int)$body['store_id'] : 0;

        if ($storeId === 0) {
            $this->jsonError('store_id is required', 400);
            return;
        }

        // Проверяем владение магазином
        $store = $this->storeRepo->findOwnedById($userId, $storeId);
        if ($store === null) {
            $this->jsonError('Store not found', 404);
            return;
        }

        $dateFrom = $body['date_from'] ?? date('Y-m-d', strtotime('-30 days'));
        $dateTo   = $body['date_to']   ?? date('Y-m-d');

        // Валидация дат
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) ||
            !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            $this->jsonError('Invalid date format, expected YYYY-MM-DD', 400);
            return;
        }

        // ── Сборка зависимостей ───────────────────────────────────────────────

        // 1. Performance API клиент с авторизацией
        $performanceBaseUrl = (string)(getenv('OZON_PERFORMANCE_BASE_URL') ?: 'https://api-performance.ozon.ru');
        $sellerBaseUrl = (string)(getenv('OZON_SELLER_BASE_URL') ?: 'https://api-seller.ozon.ru');

        $authClient = new HttpClient($performanceBaseUrl);
        $authSvc    = new PerformanceAuthService(
            $authClient,
            $store['performance_client_id'],
            $store['performance_client_secret']
        );
        $token = $authSvc->getAccessToken();

        $perfClient = new HttpClient($performanceBaseUrl, [
            'Authorization' => 'Bearer ' . $token,
        ]);

        // 2. Seller API клиент
        $sellerClient = new HttpClient($sellerBaseUrl, [
            'Client-Id' => $store['seller_client_id'],
            'Api-Key'   => $store['seller_api_key'],
        ]);

        // 3. Сервисы
        $campaignSvc   = new CampaignService($perfClient);
        $productSvc    = new ProductService($perfClient);
        $statisticsSvc = new StatisticsService($perfClient);
        $analyticsSvc  = new AnalyticsService($sellerClient);
        $mergeAdapter  = new MergeAdapter();

        // 4. Pipeline
        $pipeline = new OzonDashboardPipeline(
            $campaignSvc,
            $productSvc,
            $statisticsSvc,
            $analyticsSvc,
            $mergeAdapter
        );

        $result = $pipeline->run($dateFrom, $dateTo);

        // Если pipeline вернул ошибку — HTTP 422 (не 500!)
        if (!empty($result['error'])) {
            http_response_code(422);
            $this->json(['error' => $result['error']]);
            return;
        }

        $this->json($result);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private function parseJsonBody(): array
    {
        $raw = file_get_contents('php://input');
        if (!$raw) return [];
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function json(array $data): void
    {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function jsonError(string $message, int $code = 400): void
    {
        http_response_code($code);
        $this->json(['error' => $message]);
    }
}
