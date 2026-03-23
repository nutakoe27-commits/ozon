# Ozon API Pipeline (PHP)

Полная перепись проекта на **PHP 8.1+**.

## Что реализовано

1. Auth Performance API:
   - `POST /api/client/token`
2. Кампании:
   - `GET /api/client/campaign`
   - фильтр CPC: `advObjectType=SKU`
3. Товары кампаний:
   - `GET /api/client/campaign/{campaignId}/objects`
   - fallback: `GET /api/client/campaign/{campaignId}/v2/products`
4. Рекламная статистика (async):
   - `POST /api/client/statistic/products/generate`
   - `POST /api/client/statistic/orders/generate`
   - polling: `GET /api/client/statistics/{UUID}`
5. Seller analytics:
   - `POST /v1/analytics/data` (pagination + interval)
6. Дополнительно:
   - `POST /v1/analytics/product-queries`
   - `POST /v1/finance/realization/by-day`
7. Merge по `sku+day` + метрики:
   - `cpc`, `ctr`, `roas`, `acos`, `cr`

## Структура

- `src/Config/AppConfig.php` — env-конфиг + валидация ограничений
- `src/Http/HttpClient.php` — HTTP клиент на cURL
- `src/Service/*` — сервисы API
- `src/Adapter/MergeAdapter.php` — агрегация и merge
- `src/Pipeline/OzonDashboardPipeline.php` — orchestration
- `bin/run.php` — запуск pipeline и сохранение JSON
- `public/index.php` — простой PHP-дашборд
- `storage/data/unified.json` — результат pipeline

## ENV

```bash
export OZON_PERFORMANCE_CLIENT_ID="..."
export OZON_PERFORMANCE_CLIENT_SECRET="..."
export OZON_SELLER_CLIENT_ID="..."
export OZON_SELLER_API_KEY="..."

export OZON_PERFORMANCE_BASE_URL="https://api-performance.ozon.ru"
export OZON_SELLER_BASE_URL="https://api-seller.ozon.ru"
export OZON_ANALYTICS_REQUEST_INTERVAL_MS="60000"

export OZON_DATE_FROM="2024-01-01"
export OZON_DATE_TO="2024-01-31"
```

## Запуск pipeline

```bash
php bin/run.php
```

JSON будет записан в `storage/data/unified.json`.

## Локальный запуск веб-интерфейса

```bash
php -S 0.0.0.0:8080 -t public
```

Открыть: `http://localhost:8080`

## Примечания

Если в ответах API не хватает точной структуры, в коде есть пометки:

```php
// TODO(api-doc-gap)
```
