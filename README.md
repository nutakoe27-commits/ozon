# Ozon Dashboard (PHP 7.1 + MySQL)

Теперь это веб-приложение с:

- авторизацией пользователей (регистрация/логин),
- MySQL-хранилищем,
- созданием магазинов через интерфейс,
- добавлением Ozon API-ключей через интерфейс,
- запуском pipeline по выбранному магазину и отображением данных в дашборде.

## 1) Требования

- PHP 7.1+
- MySQL 5.7+/8+
- Расширения PHP: `pdo_mysql`, `curl`, `json`, `mbstring`

## 2) Настройка БД

Создайте БД и выполните SQL:

```bash
mysql -u root -p ozon_dashboard < storage/schema.sql
```

## 3) Переменные окружения

```bash
# DB
export DB_HOST="127.0.0.1"
export DB_PORT="3306"
export DB_NAME="ozon_dashboard"
export DB_USER="root"
export DB_PASSWORD=""

# Ozon base urls
export OZON_PERFORMANCE_BASE_URL="https://api-performance.ozon.ru"
export OZON_SELLER_BASE_URL="https://api-seller.ozon.ru"

# Defaults for UI period
export OZON_DATE_FROM="2024-01-01"
export OZON_DATE_TO="2024-01-31"
export OZON_ANALYTICS_REQUEST_INTERVAL_MS="60000"
```

> Для CLI (`bin/run.php`) дополнительно нужны `OZON_PERFORMANCE_CLIENT_ID`, `OZON_PERFORMANCE_CLIENT_SECRET`, `OZON_SELLER_CLIENT_ID`, `OZON_SELLER_API_KEY`.

## 4) Запуск веба

```bash
php -S 0.0.0.0:8080 index.php
```

Откройте: `http://localhost:8080`

## 5) Как пользоваться интерфейсом

1. Зарегистрируйтесь.
2. Войдите в аккаунт.
3. Добавьте магазин (имя + API-ключи Ozon).
4. Выберите магазин и период.
5. Нажмите «Обновить дашборд».

Результат сохраняется в `storage/data/user_<id>_store_<id>.json`.

## 6) CLI режим (опционально)

```bash
php bin/run.php
```

Сохраняет результат в `storage/data/unified.json`.

## Покрытие API

- `POST /api/client/token`
- `GET /api/client/campaign` (фильтр CPC: `advObjectType=SKU`)
- `GET /api/client/campaign/{campaignId}/objects`
- `GET /api/client/campaign/{campaignId}/v2/products`
- `POST /api/client/statistic/products/generate`
- `POST /api/client/statistic/orders/generate`
- `GET /api/client/statistics/{UUID}`
- `POST /v1/analytics/data`
- `POST /v1/analytics/product-queries`
- `POST /v1/finance/realization/by-day`

## Troubleshooting

- `HTTP 404 ... campaign not found` при загрузке товаров кампании теперь обрабатывается безопасно: такие кампании автоматически пропускаются (часто это удалённые/чужие/недоступные в токене кампании).

- При ошибках на шаге «Обновить дашборд» UI теперь показывает текст исключения на странице вместо HTTP 500.

- На shared-хостинге при `Обновить дашборд` возможен таймаут (500) из-за долгих API-операций. В web UI для аналитики используется интервал 0ms между страницами, чтобы не упираться в лимит времени запроса.
