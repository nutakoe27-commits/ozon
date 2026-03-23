import { HttpClient, sleep } from "../http.js";
import type { AdStatsBySkuDay, DateRange, SKU } from "../types.js";

interface GenerateReportResponse {
  uuid?: string;
  report_id?: string;
  id?: string;
}

interface StatisticsResultResponse {
  state?: string;
  status?: string;
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

export class StatisticsService {
  constructor(private readonly performanceClient: HttpClient) {}

  async getProductsStatistics(campaignIds: number[], period: DateRange): Promise<AdStatsBySkuDay[]> {
    const reportId = await this.generateReport("/api/client/statistic/products/generate", campaignIds, period);
    return this.awaitReport(reportId);
  }

  async getOrdersStatistics(campaignIds: number[], period: DateRange): Promise<AdStatsBySkuDay[]> {
    const reportId = await this.generateReport("/api/client/statistic/orders/generate", campaignIds, period);
    return this.awaitReport(reportId);
  }

  private async generateReport(path: string, campaignIds: number[], period: DateRange): Promise<string> {
    if (campaignIds.length > 10) {
      throw new Error("Performance API limit: max 10 campaigns per report request");
    }

    const body = {
      campaign_ids: campaignIds,
      from: period.dateFrom,
      to: period.dateTo
    };

    const response = await this.performanceClient.post<GenerateReportResponse>(path, body);
    const reportId = response.uuid ?? response.report_id ?? response.id;

    if (!reportId) {
      // TODO(api-doc-gap): уточнить точный формат ответа /statistic/*/generate
      throw new Error(`Cannot detect report id from ${path}`);
    }

    return reportId;
  }

  private async awaitReport(reportId: string): Promise<AdStatsBySkuDay[]> {
    const maxAttempts = 30;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await this.performanceClient.get<StatisticsResultResponse>(`/api/client/statistics/${reportId}`);
      const status = response.state ?? response.status;

      if (status === "ready" || status === "completed" || status === "success") {
        const rows = response.data ?? response.result ?? [];
        return rows.map((row) => this.mapAdStats(row)).filter((x): x is AdStatsBySkuDay => x !== null);
      }

      if (status === "failed" || status === "error") {
        throw new Error(`Report ${reportId} failed with status=${status}`);
      }

      await sleep(2_000);
    }

    throw new Error(`Timeout while waiting for report ${reportId}`);
  }

  private mapAdStats(row: Record<string, unknown>): AdStatsBySkuDay | null {
    const sku = normalizeSku(row.sku ?? row.skuId ?? row.item_id);
    const dayValue = row.day ?? row.date;
    const day = typeof dayValue === "string" ? dayValue : null;

    if (sku === null || day === null) {
      // TODO(api-doc-gap): уточнить названия полей sku/day в /api/client/statistics/{UUID}
      return null;
    }

    return {
      sku,
      day,
      impressions: normalizeNumber(row.impressions),
      clicks: normalizeNumber(row.clicks),
      spend: normalizeNumber(row.spend),
      orders: normalizeNumber(row.orders),
      revenue: normalizeNumber(row.revenue)
    };
  }
}
