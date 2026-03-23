import { z } from "zod";

const envSchema = z.object({
  OZON_PERFORMANCE_CLIENT_ID: z.string().min(1),
  OZON_PERFORMANCE_CLIENT_SECRET: z.string().min(1),
  OZON_SELLER_CLIENT_ID: z.string().min(1),
  OZON_SELLER_API_KEY: z.string().min(1),
  OZON_PERFORMANCE_BASE_URL: z.string().default("https://api-performance.ozon.ru"),
  OZON_SELLER_BASE_URL: z.string().default("https://api-seller.ozon.ru"),
  OZON_DATE_FROM: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  OZON_DATE_TO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  OZON_ANALYTICS_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000)
});

export type AppConfig = {
  performance: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
  };
  seller: {
    baseUrl: string;
    clientId: string;
    apiKey: string;
    analyticsRequestIntervalMs: number;
  };
  period: {
    dateFrom: string;
    dateTo: string;
  };
};

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env config: ${parsed.error.message}`);
  }

  const env = parsed.data;
  const periodDays = daysBetweenInclusive(env.OZON_DATE_FROM, env.OZON_DATE_TO);
  if (periodDays < 1) {
    throw new Error("Invalid period: OZON_DATE_TO must be same or later than OZON_DATE_FROM");
  }
  if (periodDays > 62) {
    throw new Error("Performance API limit exceeded: period must be <= 62 days");
  }

  return {
    performance: {
      baseUrl: env.OZON_PERFORMANCE_BASE_URL,
      clientId: env.OZON_PERFORMANCE_CLIENT_ID,
      clientSecret: env.OZON_PERFORMANCE_CLIENT_SECRET
    },
    seller: {
      baseUrl: env.OZON_SELLER_BASE_URL,
      clientId: env.OZON_SELLER_CLIENT_ID,
      apiKey: env.OZON_SELLER_API_KEY,
      analyticsRequestIntervalMs: env.OZON_ANALYTICS_REQUEST_INTERVAL_MS
    },
    period: {
      dateFrom: env.OZON_DATE_FROM,
      dateTo: env.OZON_DATE_TO
    }
  };
}
