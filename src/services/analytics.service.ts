import { HttpClient } from "../http.js";
import type { AnalyticsBySkuDay, DateRange, SKU } from "../types.js";

interface AnalyticsDataResponse {
  data?: Array<Record<string, unknown>>;
  result?: Array<Record<string, unknown>>;
}

function normalizeSku(value: unknown): SKU | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return 0;
}

export class AnalyticsService {
  constructor(private readonly sellerClient: HttpClient) {}

  async getAnalyticsBySkuDay(skus: SKU[], period: DateRange): Promise<AnalyticsBySkuDay[]> {
    const response = await this.sellerClient.post<AnalyticsDataResponse>("/v1/analytics/data", {
      date_from: period.dateFrom,
      date_to: period.dateTo,
      metrics: ["revenue", "ordered_units", "hits_view", "hits_tocart", "session_view", "conv_tocart"],
      dimension: ["sku", "day"],
      filters: skus.length > 0 ? [{ key: "sku", operator: "IN", values: skus }] : [],
      limit: 1000,
      offset: 0
    });

    const rows = response.data ?? response.result ?? [];

    return rows.map((row) => this.mapRow(row)).filter((x): x is AnalyticsBySkuDay => x !== null);
  }

  async getProductQueries(period: DateRange, skus: SKU[]): Promise<unknown> {
    return this.sellerClient.post("/v1/analytics/product-queries", {
      date_from: period.dateFrom,
      date_to: period.dateTo,
      skus
    });
  }

  async getFinanceRealizationByDay(period: DateRange): Promise<unknown> {
    return this.sellerClient.post("/v1/finance/realization/by-day", {
      date_from: period.dateFrom,
      date_to: period.dateTo
    });
  }

  private mapRow(row: Record<string, unknown>): AnalyticsBySkuDay | null {
    const sku = normalizeSku(row.sku ?? row.dimension_sku);
    const dayValue = row.day ?? row.dimension_day ?? row.date;

    if (sku === null || typeof dayValue !== "string") {
      // TODO(api-doc-gap): уточнить точные поля dimension/metrics ответа /v1/analytics/data
      return null;
    }

    return {
      sku,
      day: dayValue,
      revenue: normalizeNumber(row.revenue),
      orderedUnits: normalizeNumber(row.ordered_units),
      hitsView: normalizeNumber(row.hits_view),
      hitsToCart: normalizeNumber(row.hits_tocart),
      sessionView: normalizeNumber(row.session_view),
      convToCart: normalizeNumber(row.conv_tocart)
    };
  }
}
