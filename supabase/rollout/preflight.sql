-- PRE-FLIGHT: READ-ONLY. Run on PRODUCTION in the Supabase SQL editor BEFORE applying anything.
-- One result table. It changes nothing and returns no customer data (only counts, names and policy text).
-- Compare each row with the "expect" in its label. Anything unexpected = stop and ask before continuing.

select 'tenants: columns the hardening grants need (expect 6)' as "check",
       count(*)::text as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'tenants'
   and column_name in ('store_name', 'logo_mark', 'logo_url', 'theme', 'content', 'vat_registered')
union all
select 'platform_admins rows (expect 1 or more: you must be able to log in to /platform)', count(*)::text
  from public.platform_admins
union all
select 'tenants using a now-reserved subdomain (expect 0)', count(*)::text
  from public.tenants where slug in ('www', 'portal', 'app', 'api', 'admin', 'mail')
union all
select 'existing tables that clash with the new ones (expect 0)', count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('clients','client_contacts','projects','content_items','activity_log',
       'price_list_items','document_counters','quotes','quote_lines','business_settings','recurring_plans','invoices','invoice_lines')
union all
select 'existing functions that clash with the new ones (expect 0)', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('is_platform_admin','next_document_number','_next_document_number','send_quote',
       'get_quote_by_token','accept_quote','send_invoice','mark_invoice_paid','void_invoice','get_invoice_by_token',
       'generate_due_monthly_invoices','on_project_stage_live','_pct_cents','_sast_today','_due_days')
union all
select 'set_updated_at() exists (expect 1)', count(*)::text
  from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace
union all
select 'user_owns_tenant() exists (expect 1)', count(*)::text
  from pg_proc where proname = 'user_owns_tenant' and pronamespace = 'public'::regnamespace
union all
select 'pgcrypto installed in schema (expect one row: public or extensions)', coalesce(string_agg(n.nspname, ','), 'MISSING')
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto'
union all
-- Policies on the tables the hardening migration changes. The migration drops policies BY NAME;
-- any other permissive policy on these tables would survive it, so read this list carefully.
select 'POLICY ' || tablename || '.' || policyname || ' [' || cmd || ' to ' || array_to_string(roles, ',') || ']',
       'using: ' || coalesce(qual, '-') || ' | check: ' || coalesce(with_check, '-')
  from pg_policies
 where schemaname = 'public' and tablename in ('tenants', 'tenant_users', 'subscriptions', 'charges', 'orders')
union all
-- Source of the one SECURITY DEFINER function the repo does not contain (so it could not be reviewed).
select 'FUNCTION get_order_by_reference (review: who can call it, what it returns)', pg_get_functiondef(p.oid)
  from pg_proc p where p.proname = 'get_order_by_reference' and p.pronamespace = 'public'::regnamespace
order by 1;
