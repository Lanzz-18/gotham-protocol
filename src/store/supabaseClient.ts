import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Cloud sync is opt-in, not load-bearing: the app has to keep working exactly
 * as it always has if these env vars are absent (local dev with no
 * .env.local, a CI test run, a build that predates them). `supabase` is null
 * in that case, and every function in cloudSync.ts checks for that before
 * doing anything.
 */
export const supabase: SupabaseClient | null =
  URL && KEY ? createClient(URL, KEY) : null;

export const cloudConfigured = supabase !== null;
