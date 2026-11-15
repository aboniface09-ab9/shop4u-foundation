-- EMERGENCY ROLLBACK of the client dashboard (migrations 0002 to 0006). Removes the new tables and functions.
-- WARNING: this DELETES every client, project, quote, invoice, recurring plan and audit row. If real data has
-- been entered, prefer fixing forward, or restore a Supabase backup / point-in-time recovery instead.
--
-- It deliberately does NOT undo the security hardening (migration 0001) or the PayFast grant revoke (0007):
-- those close real holes and the app does not depend on the old behaviour.
--
-- Rehearsed on the dev database inside a rolled-back transaction (see the runbook). Single transaction:
-- if anything fails, nothing changes.
begin;

-- 0006: back to unpinned search_path on the two older functions (the two new helpers are dropped below)
alter function public.set_updated_at()    reset search_path;
alter function public.current_tenant_id() reset search_path;

-- 0005: invoices
drop trigger if exists trg_project_live on public.projects;
drop function if exists public.on_project_stage_live();
drop function if exists public._activate_project_billing(uuid);
drop function if exists public._create_acceptance_invoices(uuid);
drop function if exists public._create_balance_invoice(uuid);
drop function if exists public.generate_due_monthly_invoices();
drop function if exists public._generate_due_for_plan(uuid);
drop function if exists public._create_monthly_invoice(uuid, date);
drop function if exists public.get_invoice_by_token(text);
drop function if exists public.void_invoice(uuid, text);
drop function if exists public.mark_invoice_paid(uuid, date, text);
drop function if exists public.send_invoice(uuid, text);
drop table if exists public.invoice_lines, public.invoices, public.recurring_plans cascade;

-- 0004: quote send / view / accept (accept_quote must go before the quote tables it reads)
drop function if exists public.accept_quote(text, text);
drop function if exists public.get_quote_by_token(text);
drop function if exists public.send_quote(uuid, text);

-- 0003: quotes, price list, settings, numbering
drop function if exists public.next_document_number(text);
drop function if exists public._next_document_number(text);
drop function if exists public._due_days();
drop function if exists public._sast_today();
drop function if exists public._pct_cents(bigint, integer);
drop table if exists public.quote_lines, public.quotes, public.price_list_items, public.document_counters, public.business_settings cascade;

-- 0002: clients and projects
drop table if exists public.content_items, public.projects, public.client_contacts, public.clients, public.activity_log cascade;

commit;
