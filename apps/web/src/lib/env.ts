import { z } from 'zod';

/**
 * Validated frontend environment. Only `VITE_*` variables are available in the
 * browser bundle — never reference a Supabase service-role key here.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  /** Optional: only needed if the app calls the apps/api backend (no feature does yet). */
  VITE_API_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid frontend environment configuration:\n${issues}\n\n` +
      'Copy apps/web/.env.example to apps/web/.env and fill in the values.',
  );
}

export const env = parsed.data;
