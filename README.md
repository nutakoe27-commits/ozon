# Ozon Ads + Seller Analytics Pipeline

Production-ready TypeScript skeleton for integrating Ozon Performance API (ads) and Seller API (analytics/finance), then merging data by `sku` for dashboard use.

## Implemented API flow

1. **Auth (Performance API)**
   - `POST /api/client/token`
2. **Campaign list**
   - `GET /api/client/campaign`
   - Filter `advObjectType = SKU` (CPC)
3. **Products in campaign**
   - `GET /api/client/campaign/{campaignId}/objects`
   - Fallback: `GET /api/client/campaign/{campaignId}/v2/products`
4. **Ads statistics (async reports)**
   - `POST /api/client/statistic/products/generate`
   - `POST /api/client/statistic/orders/generate`
   - Poll: `GET /api/client/statistics/{UUID}`
5. **Seller analytics**
   - `POST /v1/analytics/data`
6. **Optional additional endpoints (exposed in service)**
   - `POST /v1/analytics/product-queries`
   - `POST /v1/finance/realization/by-day`
7. **Merge model by SKU**
   - `mergeBySku()` combines ad + organic + computed metrics.

## Project structure

- `src/services/auth.service.ts` — Performance token
- `src/services/campaign.service.ts` — campaigns + CPC filtering
- `src/services/product.service.ts` — campaign products and SKU extraction
- `src/services/statistics.service.ts` — report generation + polling + ad stats mapping
- `src/services/analytics.service.ts` — Seller analytics / optional methods
- `src/adapters/merge.ts` — mappers + merge by SKU + computed metrics
- `src/pipeline/fetch-ozon-dashboard-data.ts` — full pipeline orchestration
- `src/index.ts` — executable entrypoint

## Environment variables

```bash
export OZON_PERFORMANCE_CLIENT_ID="..."
export OZON_PERFORMANCE_CLIENT_SECRET="..."
export OZON_SELLER_CLIENT_ID="..."
export OZON_SELLER_API_KEY="..."

# Optional
export OZON_PERFORMANCE_BASE_URL="https://api-performance.ozon.ru"
export OZON_SELLER_BASE_URL="https://api-seller.ozon.ru"

# Required period
export OZON_DATE_FROM="2024-01-01"
export OZON_DATE_TO="2024-01-31"
```

## Run

```bash
npm install
npm run build
npm start
```

## Notes about API doc gaps

Whenever response schema details are uncertain, code intentionally marks it with:

```ts
// TODO(api-doc-gap)
```

So the implementation does not invent undocumented fields silently.
