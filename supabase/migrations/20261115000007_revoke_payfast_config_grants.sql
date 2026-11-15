-- Phase 6: defence in depth for merchants' PayFast credentials.
-- tenant_payfast_config has RLS on and NO policies, so rows are already invisible to the browser, but
-- Supabase's default grants still gave anon/authenticated table-level privileges. One stray policy in
-- future would then expose merchant keys. Only the Worker (service_role) ever reads or writes this table
-- (src/server/payfast/handlers.ts), so remove the browser privileges outright.
REVOKE ALL ON public.tenant_payfast_config FROM anon, authenticated;
