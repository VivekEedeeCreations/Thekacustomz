import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load apps/api/.env into process.env (no-op if the file is absent, e.g. in CI
// where variables are injected directly).
loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /** Comma-separated list of origins allowed to call this API. */
  API_CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /** Supabase project URL — same value the frontend uses. */
  SUPABASE_URL: z.string().url(),

  /**
   * Supabase service-role key. SERVER-ONLY. This key bypasses Row Level
   * Security and must never be sent to, or bundled into, the frontend.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(`\nInvalid API environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.API_CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';
