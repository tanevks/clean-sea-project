import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().default(8080),
  REPORT_MEDIA_BUCKET: z.string().min(1).default("report-media"),
  NOMINATIM_BASE_URL: z.string().url().optional(),
  GEOCODING_USER_AGENT: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional()
});

export const env = envSchema.parse(process.env);
