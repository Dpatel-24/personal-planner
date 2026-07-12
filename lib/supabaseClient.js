// supabaseClient.js — single shared Supabase browser/client instance.
// Uses only the public (anon) key exposed via NEXT_PUBLIC_ env vars.
// The service_role key must never be imported here or anywhere client-side.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY (locally in .env.local, in Vercel project settings).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
