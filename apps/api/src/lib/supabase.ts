import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@inventory/shared';

import { env } from '../config/env.js';

/**
 * Admin Supabase client for the backend.
 *
 * Uses the service-role key, so it bypasses Row Level Security. Keep all usage
 * on the server. Never import this module from anything that is bundled for the
 * browser.
 */
export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
