import { CampaignService } from "../services/campaign.service.js";
import { ProductService } from "../services/product.service.js";
import { StatisticsService } from "../services/statistics.service.js";
import { AnalyticsService } from "../services/analytics.service.js";
import type { DateRange, SKU, UnifiedProductDay } from "../types.js";
import { mapAnalyticsToInternal, mapPerformanceToInternal, mergeBySku } from "../adapters/merge.js";

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class OzonDashboardPipeline {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly productService: ProductService,
    private readonly statisticsService: StatisticsService,
    private readonly analyticsService: AnalyticsService
  ) {}

  async run(period: DateRange): Promise<{ promotedSkus: SKU[]; unified: UnifiedProductDay[] }> {
    const cpcCampaigns = await this.campaignService.getCpcCampaigns();
    const campaignIds = cpcCampaigns.map((c) => c.id);

    const productsByCampaign = await Promise.all(campaignIds.map((id) => this.productService.getCampaignProducts(id)));

    const promotedSkus = [...new Set(productsByCampaign.flat().map((p) => p.sku))];

    const adStatsProducts = [];
    const adStatsOrders = [];

    for (const idsChunk of chunk(campaignIds, 10)) {
      // Performance API limit: up to 10 campaigns per request.
      adStatsProducts.push(...(await this.statisticsService.getProductsStatistics(idsChunk, period)));
      adStatsOrders.push(...(await this.statisticsService.getOrdersStatistics(idsChunk, period)));
    }

    const adStats = [...adStatsProducts, ...adStatsOrders];

    const analytics = await this.analyticsService.getAnalyticsBySkuDay(promotedSkus, period);

    const internalAd = mapPerformanceToInternal(adStats);
    const internalAnalytics = mapAnalyticsToInternal(analytics);
    const unified = mergeBySku(internalAd, internalAnalytics);

    return {
      promotedSkus,
      unified
    };
  }
}
