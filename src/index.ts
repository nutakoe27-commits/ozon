import { mkdir, writeFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { HttpClient } from "./http.js";
import { PerformanceAuthService } from "./services/auth.service.js";
import { CampaignService } from "./services/campaign.service.js";
import { ProductService } from "./services/product.service.js";
import { StatisticsService } from "./services/statistics.service.js";
import { AnalyticsService } from "./services/analytics.service.js";
import { OzonDashboardPipeline } from "./pipeline/fetch-ozon-dashboard-data.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const performanceAuthClient = new HttpClient({ baseUrl: config.performance.baseUrl });
  const authService = new PerformanceAuthService(
    performanceAuthClient,
    config.performance.clientId,
    config.performance.clientSecret
  );

  const accessToken = await authService.getAccessToken();

  const performanceClient = new HttpClient({
    baseUrl: config.performance.baseUrl,
    defaultHeaders: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const sellerClient = new HttpClient({
    baseUrl: config.seller.baseUrl,
    defaultHeaders: {
      "Client-Id": config.seller.clientId,
      "Api-Key": config.seller.apiKey
    }
  });

  const pipeline = new OzonDashboardPipeline(
    new CampaignService(performanceClient),
    new ProductService(performanceClient),
    new StatisticsService(performanceClient),
    new AnalyticsService(sellerClient, config.seller.analyticsRequestIntervalMs)
  );

  const result = await pipeline.run({
    dateFrom: config.period.dateFrom,
    dateTo: config.period.dateTo
  });

  await mkdir("docs/data", { recursive: true });
  await writeFile("docs/data/unified.json", JSON.stringify(result, null, 2), "utf8");

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
