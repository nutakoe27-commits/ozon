import { z } from "zod";

const envSchema = z.object({
  OZON_PERFORMANCE_CLIENT_ID: z.string().min(1),
  OZON_PERFORMANCE_CLIENT_SECRET: z.string().min(1),
  OZON_SELLER_CLIENT_ID: z.string().min(1),
  OZON_SELLER_API_KEY: z.string().min(1),
  OZON_PERFORMANCE_BASE_URL: z.string().default("https://api-performance.ozon.ru"),
  OZON_SELLER_BASE_URL: z.string().default("https://api-seller.ozon.ru"),
  OZON_DATE_FROM: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  OZON_DATE_TO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
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
  };
  period: {
    dateFrom: string;
    dateTo: string;
  };
};

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env config: ${parsed.error.message}`);
  }

  const env = parsed.data;

  return {
    performance: {
      baseUrl: env.OZON_PERFORMANCE_BASE_URL,
      clientId: env.OZON_PERFORMANCE_CLIENT_ID,
      clientSecret: env.OZON_PERFORMANCE_CLIENT_SECRET
    },
    seller: {
      baseUrl: env.OZON_SELLER_BASE_URL,
      clientId: env.OZON_SELLER_CLIENT_ID,
      apiKey: env.OZON_SELLER_API_KEY
    },
    period: {
      dateFrom: env.OZON_DATE_FROM,
      dateTo: env.OZON_DATE_TO
    }
  };
}
