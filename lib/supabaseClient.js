// supabaseClient.js — single shared Supabase client, created LAZILY on first
// use. Creating it (and the env-var check) is deferred so that merely importing
// this module never throws — otherwise Next's static build ("collecting page
// data") crashes when env vars aren't present at build time. Uses only the
// public anon key via NEXT_PUBLIC_ vars; the service_role key must never be here.
import { createClient } from '@supabase/supabase-js';

let client = null;

function getClient() {
  if (client) return client;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept either the legacy anon-key name or the newer publishable-key name —
  // the Supabase/Vercel integration provisions NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  // while a manual setup / our .env.local uses NEXT_PUBLIC_SUPABASE_ANON_KEY.
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and one of ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        '(locally in .env.local, or via the Supabase/Vercel integration).'
    );
  }
  client = createClient(supabaseUrl, supabaseKey);
  return client;
}

// Proxy so existing `supabase.from(...)` call sites keep working while the real
// client is instantiated only on first property access (at runtime, not build).
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const value = getClient()[prop];
      return typeof value === 'function' ? value.bind(getClient()) : value;
    },
  }
);
