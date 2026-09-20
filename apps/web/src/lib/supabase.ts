import { createClient } from '@supabase/supabase-js';
import type { Database } from '@inventory/shared';

import { env } from './env';

/**
 * Browser Supabase client. Uses the anon / publishable key and is subject to
 * Row Level Security. Safe to ship to the client.
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
