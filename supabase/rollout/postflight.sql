-- POST-FLIGHT: READ-ONLY assertions. Run on the database AFTER applying the bundle.
-- Changes nothing, touches no rows. Any failed assertion raises an error naming it; success returns
-- one row, 'POSTFLIGHT PASSED'. Works on dev and production.
do $$
declare
  t text;
  f text;
begin
  -- 1. Merchants may update branding/content columns only, never billing or identity columns.
  foreach t in array array['billing_state','plan','trial_ends_at','payfast_enabled','slug','custom_domain','billing_anchor'] loop
    if has_column_privilege('authenticated', 'public.tenants', t, 'UPDATE') then
      raise exception 'FAIL: authenticated can UPDATE tenants.%', t; end if;
    if has_column_privilege('anon', 'public.tenants', t, 'UPDATE') then
      raise exception 'FAIL: anon can UPDATE tenants.%', t; end if;
  end loop;
  foreach t in array array['store_name','logo_mark','logo_url','theme','content','vat_registered'] loop
    if not has_column_privilege('authenticated', 'public.tenants', t, 'UPDATE') then
      raise exception 'FAIL: merchants lost the ability to update tenants.% (admin console would break)', t; end if;
  end loop;

  -- 2. Subscriptions, charges and PayFast credentials are not reachable from the browser at all.
  foreach t in array array['subscriptions','charges','tenant_payfast_config'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'SELECT') or has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception 'FAIL: browser roles can SELECT %', t; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('subscriptions','charges','tenant_payfast_config')) then
    raise exception 'FAIL: unexpected policies remain on subscriptions/charges/tenant_payfast_config'; end if;

  -- 3. tenant_users: read own links only. No policy or grant that lets a user add/alter/remove links.
  if has_table_privilege('authenticated', 'public.tenant_users', 'INSERT')
     or has_table_privilege('authenticated', 'public.tenant_users', 'UPDATE')
     or has_table_privilege('authenticated', 'public.tenant_users', 'DELETE')
     or has_table_privilege('anon', 'public.tenant_users', 'INSERT') then
    raise exception 'FAIL: browser roles can write tenant_users'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenant_users' and cmd <> 'SELECT') then
    raise exception 'FAIL: tenant_users still has a non-SELECT policy'; end if;

  -- 4. Every new table: RLS on, nothing for anon, nothing writable from the browser except where designed.
  foreach t in array array['clients','client_contacts','projects','content_items','activity_log','price_list_items',
                           'document_counters','quotes','quote_lines','business_settings','recurring_plans','invoices','invoice_lines'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'FAIL: RLS is off on %', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT') or has_table_privilege('anon', 'public.' || t, 'INSERT')
       or has_table_privilege('anon', 'public.' || t, 'UPDATE') or has_table_privilege('anon', 'public.' || t, 'DELETE') then
      raise exception 'FAIL: anon has table privileges on %', t; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.document_counters', 'SELECT') then
    raise exception 'FAIL: document_counters readable from the browser'; end if;
  foreach t in array array['invoices','invoice_lines','recurring_plans'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT') or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'FAIL: invoices tables are writable from the browser: %', t; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.activity_log', 'UPDATE') or has_table_privilege('authenticated', 'public.activity_log', 'DELETE') then
    raise exception 'FAIL: audit log is editable'; end if;

  -- 5. Functions: admin actions are not callable by anon; internals by nobody in the browser; the cron job only by service_role.
  foreach f in array array['public.send_quote(uuid,text)','public.send_invoice(uuid,text)','public.mark_invoice_paid(uuid,date,text)',
                           'public.void_invoice(uuid,text)','public.next_document_number(text)','public.is_platform_admin()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then raise exception 'FAIL: anon can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then raise exception 'FAIL: admins cannot execute %', f; end if;
  end loop;
  foreach f in array array['public._next_document_number(text)','public._create_balance_invoice(uuid)','public._create_acceptance_invoices(uuid)',
                           'public._activate_project_billing(uuid)','public._generate_due_for_plan(uuid)','public._create_monthly_invoice(uuid,date)',
                           'public.generate_due_monthly_invoices()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'FAIL: browser roles can execute internal function %', f; end if;
  end loop;
  if not has_function_privilege('service_role', 'public.generate_due_monthly_invoices()', 'EXECUTE') then
    raise exception 'FAIL: the daily cron (service_role) cannot generate monthly invoices'; end if;
  foreach f in array array['public.get_quote_by_token(text)','public.accept_quote(text,text)','public.get_invoice_by_token(text)'] loop
    if not has_function_privilege('anon', f, 'EXECUTE') then raise exception 'FAIL: clients cannot use %', f; end if;
  end loop;

  -- 6. Defaults the app relies on.
  if (select count(*) from public.business_settings where id = 1) <> 1 then
    raise exception 'FAIL: business_settings row missing'; end if;
end $$;

select 'POSTFLIGHT PASSED' as result;
