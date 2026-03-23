import type { AdStatsBySkuDay, AnalyticsBySkuDay, UnifiedProductDay } from "../types.js";

export function mapPerformanceToInternal(rows: AdStatsBySkuDay[]): AdStatsBySkuDay[] {
  return aggregateAdStats(rows);
}

export function mapAnalyticsToInternal(rows: AnalyticsBySkuDay[]): AnalyticsBySkuDay[] {
  return rows;
}

function safeDivide(a: number, b: number): number {
  if (b === 0) return 0;
  return a / b;
}

export function aggregateAdStats(rows: AdStatsBySkuDay[]): AdStatsBySkuDay[] {
  const acc = new Map<string, AdStatsBySkuDay>();

  for (const row of rows) {
    const key = `${row.sku}:${row.day}`;
    const prev = acc.get(key);

    if (!prev) {
      acc.set(key, { ...row });
      continue;
    }

    acc.set(key, {
      sku: row.sku,
      day: row.day,
      impressions: prev.impressions + row.impressions,
      clicks: prev.clicks + row.clicks,
      spend: prev.spend + row.spend,
      orders: prev.orders + row.orders,
      revenue: prev.revenue + row.revenue
    });
  }

  return [...acc.values()];
}

export function mergeBySku(adRows: AdStatsBySkuDay[], analyticsRows: AnalyticsBySkuDay[]): UnifiedProductDay[] {
  const analyticsMap = new Map<string, AnalyticsBySkuDay>();
  for (const row of analyticsRows) {
    analyticsMap.set(`${row.sku}:${row.day}`, row);
  }

  return adRows.map((ad) => {
    const organic =
      analyticsMap.get(`${ad.sku}:${ad.day}`) ?? {
        sku: ad.sku,
        day: ad.day,
        revenue: 0,
        orderedUnits: 0,
        hitsView: 0,
        hitsToCart: 0,
        sessionView: 0,
        convToCart: 0
      };

    const cpc = safeDivide(ad.spend, ad.clicks);
    const ctr = safeDivide(ad.clicks, ad.impressions);
    const roas = safeDivide(ad.revenue, ad.spend);
    const acos = safeDivide(ad.spend, ad.revenue);
    const cr = safeDivide(ad.orders, ad.clicks);

    return {
      sku: ad.sku,
      day: ad.day,
      ad,
      organic,
      computed: { cpc, ctr, roas, acos, cr }
    };
  });
}
