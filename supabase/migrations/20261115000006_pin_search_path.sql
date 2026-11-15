-- Phase 6: pin search_path on four plain functions flagged by the Supabase security advisor
-- (function_search_path_mutable). Behaviour is unchanged; this only stops a role-level search_path
-- from redirecting the unqualified names they use. Two are older functions already used by the live app.
ALTER FUNCTION public.set_updated_at()                 SET search_path = public, pg_temp;
ALTER FUNCTION public.current_tenant_id()              SET search_path = public, pg_temp;
ALTER FUNCTION public._pct_cents(bigint, integer)      SET search_path = public, pg_temp;
ALTER FUNCTION public._sast_today()                    SET search_path = public, pg_temp;
