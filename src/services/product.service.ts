import { HttpClient } from "../http.js";
import type { CampaignProduct, SKU } from "../types.js";

interface CampaignObjectsResponse {
  items?: Array<Record<string, unknown>>;
  products?: Array<Record<string, unknown>>;
  result?: Array<Record<string, unknown>>;
}

function normalizeSku(value: unknown): SKU | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }

  return null;
}

export class ProductService {
  constructor(private readonly performanceClient: HttpClient) {}

  async getCampaignProducts(campaignId: number): Promise<CampaignProduct[]> {
    const firstTry = await this.performanceClient.get<CampaignObjectsResponse>(`/api/client/campaign/${campaignId}/objects`);
    const records = firstTry.items ?? firstTry.products ?? firstTry.result ?? [];

    if (records.length > 0) {
      return records
        .map((row) => this.mapCampaignProduct(campaignId, row))
        .filter((x): x is CampaignProduct => x !== null);
    }

    const fallback = await this.performanceClient.get<CampaignObjectsResponse>(
      `/api/client/campaign/${campaignId}/v2/products`
    );

    const fallbackRecords = fallback.items ?? fallback.products ?? fallback.result ?? [];
    return fallbackRecords
      .map((row) => this.mapCampaignProduct(campaignId, row))
      .filter((x): x is CampaignProduct => x !== null);
  }

  private mapCampaignProduct(campaignId: number, row: Record<string, unknown>): CampaignProduct | null {
    const sku = normalizeSku(row.sku ?? row.skuId ?? row.offer_id);
    if (sku === null) {
      // TODO(api-doc-gap): уточнить точные имена полей SKU в /campaign/{id}/objects и /v2/products
      return null;
    }

    return {
      campaignId,
      sku,
      bid: typeof row.bid === "number" ? row.bid : undefined,
      status: typeof row.status === "string" ? row.status : undefined,
      ...row
    };
  }
}
