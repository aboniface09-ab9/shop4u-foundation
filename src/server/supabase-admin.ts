import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the SERVICE-ROLE key.
 *
 * Bypasses RLS entirely — this is what lets the ITN webhook handler
 * update an anonymous customer's order (the anon client can INSERT an
 * order at checkout but, per the RLS-safety note in src/data/orders.ts,
 * can't read/update it back) and read tenant_payfast_config, which has
 * no RLS policies at all (service-role-only by design — see
 * supabase-payfast-migration.sql).
 *
 * SERVER-ONLY. Never import this from src/lib, src/routes/*.tsx
 * (browser-rendered routes), or any component. Only from
 * src/routes/api/** (server routes) and other src/server/** modules.
 *
 * The service-role key is read from SUPABASE_SERVICE_ROLE_KEY — NOT
 * VITE_-prefixed, so Vite never bundles it into client JS. Set it as a
 * Cloudflare Worker secret (`wrangler secret put SUPABASE_SERVICE_ROLE_KEY`),
 * the same way TJ_CLIENT_SECRET is handled — see tj-integration-brief.md
 * and payfast-integration-brief.md for the full env var list.
 */

let client: SupabaseClient | undefined;

export function getSupabaseAdmin(env: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}): SupabaseClient {
  if (client) return client;

  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase admin env vars — need SUPABASE_URL (or reuse VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
