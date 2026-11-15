-- PRE-FLIGHT, PART 2: READ-ONLY. Run on PRODUCTION after preflight.sql.
-- The first query looked at five tables. This one looks at everything else the browser can reach, because
-- the live database has already shown it holds rules that are not in the repo.
-- Returns one table of table names, policy text and privilege flags. No rows of customer data.

-- A. Every policy on every OTHER table in public, plus file storage.
select 'POLICY ' || schemaname || '.' || tablename || '.' || policyname || ' [' || cmd || ' to ' || array_to_string(roles, ',') || ']' as "check",
       'using: ' || coalesce(qual, '-') || ' | check: ' || coalesce(with_check, '-') as result
  from pg_policies
 where (schemaname = 'public' and tablename not in ('tenants', 'tenant_users', 'subscriptions', 'charges', 'orders'))
    or (schemaname = 'storage' and tablename = 'objects')

union all
-- B. What an anonymous visitor may do to each public table (privilege only; policies then decide which rows).
select 'ANON PRIVILEGES public.' || c.relname,
       trim(both ' ' from
         case when has_table_privilege('anon', c.oid, 'SELECT') then 'select ' else '' end ||
         case when has_table_privilege('anon', c.oid, 'INSERT') then 'insert ' else '' end ||
         case when has_table_privilege('anon', c.oid, 'UPDATE') then 'update ' else '' end ||
         case when has_table_privilege('anon', c.oid, 'DELETE') then 'delete ' else '' end) ||
       ' | RLS ' || case when c.relrowsecurity then 'on' else 'OFF' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'

union all
-- C. SECURITY DEFINER functions an anonymous visitor can call (they run with the owner's full rights).
select 'ANON-CALLABLE SECURITY DEFINER FUNCTION ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       left(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g'), 600)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
   and p.proname not in ('get_order_by_reference')
order by 1;
