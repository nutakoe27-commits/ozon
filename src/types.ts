export type SKU = number;

export interface PerformanceTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface Campaign {
  id: number;
  title?: string;
  state?: string;
  advObjectType?: string;
  [key: string]: unknown;
}

export interface CampaignProduct {
  sku: SKU;
  bid?: number;
  status?: string;
  campaignId: number;
  [key: string]: unknown;
}

export interface AdStatsBySkuDay {
  sku: SKU;
  day: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  revenue: number;
}

export interface AnalyticsBySkuDay {
  sku: SKU;
  day: string;
  revenue: number;
  orderedUnits: number;
  hitsView: number;
  hitsToCart: number;
  sessionView: number;
  convToCart: number;
}

export interface UnifiedProductDay {
  sku: SKU;
  day: string;
  ad: AdStatsBySkuDay;
  organic: AnalyticsBySkuDay;
  computed: {
    cpc: number;
    ctr: number;
    roas: number;
    acos: number;
    cr: number;
  };
}

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}
